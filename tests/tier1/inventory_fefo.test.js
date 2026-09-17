/**
 * Tier 1: Feature Coverage — Inventory & FEFO Allocation Engine
 * Minimum 5 tests covering core FEFO invariants, stock reservation, tester conversion, and stock counts
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

describe('Tier 1: Inventory & FEFO Allocation Engine', () => {
    let db, fixtures, inventoryService, posService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        inventoryService = require('../../services/inventoryService');
        posService = require('../../services/posService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T1-INV-1: FEFO allocation depletes earliest expiring batch first', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم پودر مات ۲۴ ساعته',
            sku: 'FND-MAT-01',
            sellingPrice: 350000,
            batches: [
                { batchNumber: 'LOT-EXP-2026', expiryDate: '2026-10-15', qty: 5, cost: 180000 },
                { batchNumber: 'LOT-EXP-2027', expiryDate: '2027-04-20', qty: 10, cost: 200000 },
                { batchNumber: 'LOT-EXP-2028', expiryDate: '2028-01-01', qty: 15, cost: 210000 }
            ]
        });

        // Request 8 units (should consume all 5 from LOT-EXP-2026, and 3 from LOT-EXP-2027)
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 8, unitPrice: 350000 }],
            payments: [{ method: 'CARD', amount: 2800000 }]
        });

        assert.ok(order.orderId);

        // Check batch quantities
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);
        const b3 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[2]);

        assert.equal(b1.quantity, 0, 'First batch (earliest expiry) must be completely depleted');
        assert.equal(b2.quantity, 7, 'Second batch must be reduced from 10 to 7');
        assert.equal(b3.quantity, 15, 'Third batch must remain untouched at 15');

        // Verify COGS: (5 * 180000) + (3 * 200000) = 900000 + 600000 = 1500000
        const orderRow = db.prepare(`SELECT total_cost FROM orders WHERE id = ?`).get(order.orderId);
        assert.equal(orderRow.total_cost, 1500000, 'COGS must reflect actual batch purchase costs');
    });

    test('T1-INV-2: Available stock invariant excludes layaway reserved quantity', () => {
        const prod = seedProductWithBatches(db, {
            name: 'سرم ضد چروک رتینول',
            sku: 'SRM-RET-01',
            sellingPrice: 500000,
            batches: [
                { batchNumber: 'LOT-SRM-01', expiryDate: '2027-12-31', qty: 10, reservedQty: 0, cost: 250000 }
            ]
        });

        // Create Layaway reserving 7 units
        const layaway = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'LAYAWAY',
            items: [{ variantId: prod.variantId, quantity: 7, unitPrice: 500000 }],
            payments: [{ method: 'CASH', amount: 1000000 }]
        });

        assert.ok(layaway.isLayaway);

        // Batch physical quantity is still 10, but reserved_quantity is 7 -> available is 3
        const batch = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 10);
        assert.equal(batch.reserved_quantity, 7);

        // A regular sale requesting 4 units must fail because only 3 units are available (10 - 7)
        assert.throws(() => {
            posService.createOrder({
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prod.variantId, quantity: 4, unitPrice: 500000 }],
                payments: [{ method: 'CARD', amount: 2000000 }]
            });
        }, /موجودی.*کافی نیست/);

        // A regular sale requesting 3 units succeeds
        const sale = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 3, unitPrice: 500000 }],
            payments: [{ method: 'CARD', amount: 1500000 }]
        });
        assert.ok(sale.orderId);

        // Batch physical quantity is now 7, reserved_quantity is 7 -> available is 0
        const batchAfter = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batchAfter.quantity, 7);
        assert.equal(batchAfter.reserved_quantity, 7);
    });

    test('T1-INV-3: Converting warehouse stock to tester creates tester record and posts Dr 604 / Cr 103', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ریمل حجم‌دهنده ضدآب',
            sku: 'MSC-VOL-01',
            purchasePrice: 120000,
            batches: [
                { batchNumber: 'LOT-MSC-01', expiryDate: '2027-08-15', qty: 10, cost: 120000 }
            ]
        });

        const result = inventoryService.convertToTester({
            variantId: prod.variantId,
            batchId: prod.batchIds[0],
            quantity: 2,
            employeeId: fixtures.users.stockkeeper.id,
            note: 'تستر برای میز تست فروشگاه'
        });

        assert.ok(result.testerId);
        assert.equal(result.totalCost, 240000);

        // Batch quantity reduced from 10 to 8
        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 8);

        // Tester record created
        const tester = db.prepare(`SELECT * FROM testers WHERE id = ?`).get(result.testerId);
        assert.equal(tester.status, 'ACTIVE');
        assert.equal(tester.initial_quantity, 2);
        assert.equal(tester.remaining_percentage, 100);

        // Double-entry accounting check
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '604'), 240000, 'Tester expense account 604 must be debited 240,000');
        assert.equal(getAccountNetBalance(db, '103'), -240000, 'Inventory account 103 must be credited 240,000');
    });

    test('T1-INV-4: Finalize stock count creates adjustment transaction and variance journal Dr 608 / Cr 103', () => {
        const prod = seedProductWithBatches(db, {
            name: 'خط چشم ماژیکی ضدآب',
            sku: 'EYE-PEN-01',
            purchasePrice: 90000,
            batches: [
                { batchNumber: 'LOT-EYE-01', expiryDate: '2027-10-01', qty: 20, cost: 90000 }
            ]
        });

        const countId = inventoryService.createStockCount(fixtures.warehouseId, fixtures.users.stockkeeper.id, 'انبارگردانی پایان فصل');
        assert.ok(countId);

        const details = inventoryService.getStockCountDetails(countId);
        const item = details.items.find(i => i.product_variant_id === prod.variantId);
        assert.ok(item);
        assert.equal(item.system_quantity, 20);

        // Stockkeeper counts 17 physical units (shortage of 3 units = -270,000 Toman)
        inventoryService.updateStockCountItem(item.id, 17);

        const finResult = inventoryService.finalizeStockCount(countId, fixtures.users.manager.id);
        assert.equal(finResult.totalCostVariance, -270000);

        // Inventory batch updated to physical count
        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 17);

        // Double-entry accounting check
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '608'), 270000, 'Variance expense account 608 must be debited 270,000');
        assert.equal(getAccountNetBalance(db, '103'), -270000, 'Inventory account 103 must be credited 270,000');
    });

    test('T1-INV-5: Expiry analysis categorizes batches into correct aging buckets', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ضد آفتاب مینرال بی‌رنگ',
            sku: 'SUN-MIN-01',
            purchasePrice: 200000,
            batches: [
                { batchNumber: 'LOT-EXPIRED', expiryDate: '2024-01-01', qty: 3, cost: 200000 },
                { batchNumber: 'LOT-FRESH', expiryDate: '2028-12-31', qty: 12, cost: 200000 }
            ]
        });

        const analysis = inventoryService.getExpiryAnalysis();
        assert.ok(analysis.expired.count >= 1);
        assert.ok(analysis.expired.items.some(b => b.batch_number === 'LOT-EXPIRED'));
        assert.ok(analysis.days_180_plus.items.some(b => b.batch_number === 'LOT-FRESH'));
    });
});
