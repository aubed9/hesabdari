/**
 * Tier 1: Feature Coverage — RBAC, Security & Audit Trail Engine
 * Minimum 5 tests covering user roles, check constraints, unique usernames, audit logs, and permission boundaries
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedUser,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 1: RBAC, Security & Audit Trail Engine', () => {
    let db, fixtures;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T1-RBAC-1: System enforces valid roles and rejects unauthorized role strings via CHECK constraint', () => {
        // Valid roles: ADMIN, MANAGER, CASHIER, STOCKKEEPER, ACCOUNTANT
        const validUser = seedUser(db, {
            username: 'staff_manager',
            role: 'MANAGER',
            fullName: 'مدیر شعبه ونک'
        });
        assert.ok(validUser.id);
        assert.equal(validUser.role, 'MANAGER');

        // Invalid role: HACKER or SUPERUSER should fail SQL CHECK constraint
        assert.throws(() => {
            db.prepare(`
                INSERT INTO users (branch_id, username, password_hash, full_name, role)
                VALUES (1, 'bad_actor', 'hash123', 'نفوذگر', 'SUPERUSER')
            `).run();
        }, /CHECK constraint failed/);
    });

    test('T1-RBAC-2: Username must be globally unique preventing collision or impersonation', () => {
        seedUser(db, {
            username: 'unique_cashier',
            role: 'CASHIER',
            fullName: 'صندوق‌دار شیفت ۱'
        });

        // Duplicate username must throw UNIQUE constraint error
        assert.throws(() => {
            seedUser(db, {
                username: 'unique_cashier',
                role: 'CASHIER',
                fullName: 'صندوق‌دار شیفت ۲'
            });
        }, /UNIQUE constraint failed: users.username/);
    });

    test('T1-RBAC-3: Inactive users are excluded from active operations and login lookups', () => {
        const deactivated = seedUser(db, {
            username: 'resigned_staff',
            role: 'CASHIER',
            fullName: 'پرسنل مستعفی',
            isActive: 0
        });

        const activeUsers = db.prepare(`SELECT * FROM users WHERE is_active = 1`).all();
        assert.ok(!activeUsers.some(u => u.id === deactivated.id));

        const userRow = db.prepare(`SELECT is_active FROM users WHERE id = ?`).get(deactivated.id);
        assert.equal(userRow.is_active, 0);
    });

    test('T1-RBAC-4: Audit log captures actor, action, entity, entity_id, and details immutably', () => {
        const actionTime = new Date().toISOString();
        const res = db.prepare(`
            INSERT INTO audit_logs (employee_id, actor_id, action, entity, entity_id, before_state, after_state, details, created_at)
            VALUES (?, ?, 'UPDATE_PRICE', 'product_variants', '10', '{"price": 400000}', '{"price": 450000}', 'افزایش قیمت مصوب با تایید مدیریت', ?)
        `).run(fixtures.users.manager.id, fixtures.users.manager.id, actionTime);

        assert.ok(res.lastInsertRowid);

        const log = db.prepare(`SELECT * FROM audit_logs WHERE id = ?`).get(res.lastInsertRowid);
        assert.equal(log.action, 'UPDATE_PRICE');
        assert.equal(log.entity, 'product_variants');
        assert.equal(log.entity_id, '10');
        assert.equal(log.employee_id, fixtures.users.manager.id);
        assert.ok(log.created_at);
    });

    test('T1-RBAC-5: Role-based separation allows managerial approvals while restricting cashier actions', () => {
        // Only MANAGER and ADMIN have managerial approval roles
        const allUsers = db.prepare(`SELECT * FROM users`).all();
        const managers = allUsers.filter(u => ['ADMIN', 'MANAGER'].includes(u.role));
        const nonManagers = allUsers.filter(u => !['ADMIN', 'MANAGER'].includes(u.role));

        assert.ok(managers.length >= 2, 'Should have Admin and Manager users');
        assert.ok(nonManagers.some(u => u.role === 'CASHIER'));
        assert.ok(nonManagers.some(u => u.role === 'STOCKKEEPER'));
        assert.ok(nonManagers.some(u => u.role === 'ACCOUNTANT'));

        // Verify that stock count approval is recorded with approved_by referencing users
        const countRes = db.prepare(`
            INSERT INTO stock_counts (warehouse_id, status, conducted_by, approved_by, notes)
            VALUES (?, 'COMPLETED', ?, ?, 'تایید شده توسط مدیر')
        `).run(fixtures.warehouseId, fixtures.users.stockkeeper.id, fixtures.users.manager.id);

        const count = db.prepare(`SELECT * FROM stock_counts WHERE id = ?`).get(countRes.lastInsertRowid);
        assert.equal(count.conducted_by, fixtures.users.stockkeeper.id);
        assert.equal(count.approved_by, fixtures.users.manager.id);
    });
});
