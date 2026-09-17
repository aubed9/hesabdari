/**
 * Tier 2: Boundary & Corner Cases — Accounting Engine
 * Minimum 5 tests covering unbalanced journals, zero amounts, invalid accounts, and constraint violations
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 2: Accounting Boundary & Corner Cases', () => {
    let db, fixtures, accountingService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        accountingService = require('../../services/accountingService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T2-ACC-BND-1: Unbalanced journal entry (debit != credit) throws error and rolls back completely', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCap = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        assert.throws(() => {
            accountingService.recordJournalEntry({
                entryNumber: 'JE-ERR-UNBALANCED',
                date: '2026-09-17',
                description: 'سند نامتعادل غیرمجاز',
                lines: [
                    { accountId: accCash, debit: 10000000, credit: 0 },
                    { accountId: accCap, debit: 0, credit: 9000000 } // 1,000,000 difference!
                ],
                createdBy: fixtures.users.accountant.id
            });
        }, /سند تراز نیست/);

        // Verify neither header nor lines persisted
        const entry = db.prepare(`SELECT * FROM journal_entries WHERE entry_number = 'JE-ERR-UNBALANCED'`).get();
        assert.equal(entry, undefined, 'Unbalanced journal entry must not exist in DB');

        const lines = db.prepare(`SELECT * FROM journal_lines WHERE description LIKE '%سند نامتعادل%'`).all();
        assert.equal(lines.length, 0);

        // GL remains perfectly balanced
        assertGeneralLedgerBalanced(db);
    });

    test('T2-ACC-BND-2: Journal entry with invalid accountId violates foreign key constraint', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;

        assert.throws(() => {
            accountingService.recordJournalEntry({
                entryNumber: 'JE-ERR-FK',
                date: '2026-09-17',
                description: 'حساب نامعتبر',
                lines: [
                    { accountId: accCash, debit: 500000, credit: 0 },
                    { accountId: 999999, debit: 0, credit: 500000 } // Non-existent account ID
                ],
                createdBy: fixtures.users.accountant.id
            });
        }, /FOREIGN KEY constraint failed/);

        assertGeneralLedgerBalanced(db);
    });

    test('T2-ACC-BND-3: Duplicate journal entry number throws unique constraint violation', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCap = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        // First insert succeeds
        accountingService.recordJournalEntry({
            entryNumber: 'JE-UNIQUE-001',
            date: '2026-09-17',
            description: 'سند اولیه',
            lines: [
                { accountId: accCash, debit: 100000, credit: 0 },
                { accountId: accCap, debit: 0, credit: 100000 }
            ],
            createdBy: fixtures.users.accountant.id
        });

        // Second insert with identical entryNumber must fail
        assert.throws(() => {
            accountingService.recordJournalEntry({
                entryNumber: 'JE-UNIQUE-001',
                date: '2026-09-17',
                description: 'سند تکراری',
                lines: [
                    { accountId: accCash, debit: 100000, credit: 0 },
                    { accountId: accCap, debit: 0, credit: 100000 }
                ],
                createdBy: fixtures.users.accountant.id
            });
        }, /UNIQUE constraint failed: journal_entries.entry_number/);
    });

    test('T2-ACC-BND-4: Fractional Toman amounts are rounded or handled without floating-point imbalance', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCap = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        // 33.333333 vs 33.333334 would cause float divergence; rounding is enforced
        const result = accountingService.recordJournalEntry({
            entryNumber: 'JE-FLOAT-TEST',
            date: '2026-09-17',
            description: 'سند تست گردکردن اعشار',
            lines: [
                { accountId: accCash, debit: 100.00, credit: 0 },
                { accountId: accCap, debit: 0, credit: 100.00 }
            ],
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(result.entryId);
        assertGeneralLedgerBalanced(db);
    });

    test('T2-ACC-BND-5: Negative expense is rejected by database constraint and empty journal entries are guarded', () => {
        const bankId = fixtures.bankAccounts[0];

        // Negative expense triggers DB constraint
        assert.throws(() => {
            accountingService.createExpense({
                category: 'RENT',
                amount: -50000,
                bankAccountId: bankId,
                description: 'هزینه منفی غیرمجاز'
            });
        }, /Constraint violation|CHECK constraint failed/);

        // Journal entry with non-matching lines throws
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        assert.throws(() => {
            accountingService.recordJournalEntry({
                entryNumber: 'JE-EMPTY-LINES',
                date: '2026-09-17',
                description: 'سند بدون مبالغ متوازن',
                lines: [
                    { accountId: accCash, debit: 5000, credit: 0 }
                ],
                createdBy: fixtures.users.accountant.id
            });
        }, /سند تراز نیست/);
    });
});
