/**
 * Tier 2: Boundary & Corner Cases — Inventory & FEFO Engine
 * Minimum 5 tests covering stock exhaustion, layaway reservation boundaries, tester over-conversion, and stock count limits
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 2: Inventory Boundary & Corner Cases', () => {
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

    test('T2-INV-BND-1: Complete stock exhaustion reduces batch to exactly 0 and blocks subsequent orders', () => {
        const prod = seedProductWithBatches(db, {
            name: 'رژ لب مات مایع',
            sku: 'LIP-MAT-EXH',
            barcode: '6261111111111',
            sellingPrice: 200000,
            batches: [{ batchNumber: 'LOT-EXH-01', expiryDate: '2027-12-31', qty: 5, cost: 100000 }]
        });

        // 1. Buy all 5 units
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 5, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 1000000 }]
        });
        assert.ok(order.orderId);

        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 0, 'Batch quantity must reach exactly 0');

        // 2. Next order for even 1 unit must fail
        assert.throws(() => {
            posService.createOrder({
                employeeId: fixtures.users.cashier.id,
                items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 200000 }],
                payments: [{ method: 'CARD', amount: 200000 }]
            });
        }, /موجودی.*کافی نیست/);
    });

    test('T2-INV-BND-2: 100% Layaway reservation blocks regular sale even while physical stock is on shelf', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم دور چشم ضد پف',
            sku: 'EYE-PUF-LAY',
            barcode: '6262222222222',
            sellingPrice: 400000,
            batches: [{ batchNumber: 'LOT-LAY-01', expiryDate: '2027-12-31', qty: 8, cost: 200000 }]
        });

        // Reserve 100% of stock (8 units) on layaway
        posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            orderType: 'LAYAWAY',
            items: [{ variantId: prod.variantId, quantity: 8, unitPrice: 400000 }],
            payments: [{ method: 'CASH', amount: 500000 }]
        });

        // Batch physical quantity is 8, but reserved is 8
        const batch = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 8);
        assert.equal(batch.reserved_quantity, 8);

        // Regular sale must fail because unreserved available is 0
        assert.throws(() => {
            posService.createOrder({
                employeeId: fixtures.users.cashier.id,
                items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 400000 }],
                payments: [{ method: 'CARD', amount: 400000 }]
            });
        }, /موجودی.*کافی نیست/);
    });

    test('T2-INV-BND-3: Tester conversion exceeding available batch quantity throws error without modifying batch', () => {
        const prod = seedProductWithBatches(db, {
            name: 'لوسیون بدن نارگیل',
            sku: 'BDY-LOT-TST',
            barcode: '6263333333333',
            purchasePrice: 150000,
            batches: [{ batchNumber: 'LOT-TST-01', expiryDate: '2027-06-30', qty: 3, cost: 150000 }]
        });

        // Request 5 units when only 3 are available
        assert.throws(() => {
            inventoryService.convertToTester({
                variantId: prod.variantId,
                batchId: prod.batchIds[0],
                quantity: 5,
                employeeId: fixtures.users.stockkeeper.id
            });
        }, /موجودی بچ برای تبدیل به تستر کافی نیست/);

        // Batch quantity must remain unchanged at 3
        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 3);
    });

    test('T2-INV-BND-4: Order requesting quantity exceeding all combined batches fails atomically', () => {
        const prod = seedProductWithBatches(db, {
            name: 'بالم لب توت فرنگی',
            sku: 'LIP-BLM-ALL',
            barcode: '6264444444444',
            sellingPrice: 90000,
            batches: [
                { batchNumber: 'LOT-BLM-01', expiryDate: '2026-12-31', qty: 4, cost: 40000 },
                { batchNumber: 'LOT-BLM-02', expiryDate: '2027-12-31', qty: 6, cost: 45000 }
            ]
        });

        // Total available = 10 units. Request 11 units.
        assert.throws(() => {
            posService.createOrder({
                employeeId: fixtures.users.cashier.id,
                items: [{ variantId: prod.variantId, quantity: 11, unitPrice: 90000 }],
                payments: [{ method: 'CARD', amount: 990000 }]
            });
        }, /موجودی.*کافی نیست/);

        // Verify neither batch was partially depleted
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);
        assert.equal(b1.quantity, 4);
        assert.equal(b2.quantity, 6);
    });

    test('T2-INV-BND-5: Stock count session creates zero variance when counted quantity matches system quantity', () => {
        const prod = seedProductWithBatches(db, {
            name: 'شامپو بدون سولفات',
            sku: 'SHP-SULF-01',
            barcode: '6265555555555',
            purchasePrice: 180000,
            batches: [{ batchNumber: 'LOT-SHP-01', expiryDate: '2027-12-31', qty: 15, cost: 180000 }]
        });

        const countId = inventoryService.createStockCount(fixtures.warehouseId, fixtures.users.stockkeeper.id);
        const details = inventoryService.getStockCountDetails(countId);
        const item = details.items.find(i => i.product_variant_id === prod.variantId);
        assert.ok(item);

        // Counted equals system quantity (15 == 15 -> variance is 0)
        inventoryService.updateStockCountItem(item.id, 15);

        const finResult = inventoryService.finalizeStockCount(countId, fixtures.users.manager.id);
        assert.equal(finResult.totalCostVariance, 0, 'No cost variance when counted matches system');

        // No variance journal entry created for 0 variance
        const jEntry = db.prepare(`SELECT * FROM journal_entries WHERE reference_type = 'STOCK_COUNT' AND reference_id = ?`).get(countId);
        assert.equal(jEntry, undefined, 'No journal entry should be posted for zero inventory variance');

        assertGeneralLedgerBalanced(db);
    });
});
