/**
 * Tier 2: Boundary & Corner Cases — Returns & Anti-Double-Return Engine
 * Minimum 5 tests covering return quantity excess, zero/negative quantities, double returns, and non-existent orders
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 2: Returns Boundary & Corner Cases', () => {
    let db, fixtures, posService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        posService = require('../../services/posService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T2-RET-BND-1: Return quantity greater than purchased quantity is strictly rejected', () => {
        const prod = seedProductWithBatches(db, {
            name: 'سایه چشم تک رنگ متالیک',
            sku: 'EYE-MTL-01',
            barcode: '6268888888881',
            sellingPrice: 120000,
            batches: [{ batchNumber: 'LOT-MTL-01', expiryDate: '2028-12-31', qty: 10, cost: 50000 }]
        });

        // Buy 2 units
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 120000 }],
            payments: [{ method: 'CARD', amount: 240000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // Attempt to return 3 units (purchased was only 2)
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                refundMethod: 'CARD_REVERSAL',
                items: [{ orderItemId: orderItem.id, quantity: 3, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /بیش از تعداد باقی‌مانده مجاز/);

        // Zero returns in DB
        const retCount = db.prepare(`SELECT count(*) AS c FROM returns WHERE original_order_id = ?`).get(order.orderId).c;
        assert.equal(retCount, 0);

        assertGeneralLedgerBalanced(db);
    });

    test('T2-RET-BND-2: Returning zero quantity throws error', () => {
        const prod = seedProductWithBatches(db, {
            name: 'خط لب ضدآب نرم',
            sku: 'LIP-LIN-01',
            barcode: '6268888888882',
            sellingPrice: 70000,
            batches: [{ batchNumber: 'LOT-LIN-01', expiryDate: '2028-12-31', qty: 10, cost: 30000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 70000 }],
            payments: [{ method: 'CARD', amount: 70000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                refundMethod: 'CARD_REVERSAL',
                items: [{ orderItemId: orderItem.id, quantity: 0, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /تعداد مرجوعی باید بزرگتر از صفر باشد/);
    });

    test('T2-RET-BND-3: Returning negative quantity throws error', () => {
        const prod = seedProductWithBatches(db, {
            name: 'رژ لب مدادی مات',
            sku: 'LIP-PNC-01',
            barcode: '6268888888883',
            sellingPrice: 110000,
            batches: [{ batchNumber: 'LOT-PNC-01', expiryDate: '2028-12-31', qty: 10, cost: 45000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 110000 }],
            payments: [{ method: 'CARD', amount: 220000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                refundMethod: 'CARD_REVERSAL',
                items: [{ orderItemId: orderItem.id, quantity: -1, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /تعداد مرجوعی باید بزرگتر از صفر باشد/);
    });

    test('T2-RET-BND-4: Anti-double-return rejects subsequent return when item is already 100% returned', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ریمل حجم دهنده اکستریم',
            sku: 'MSC-EXT-01',
            barcode: '6268888888884',
            sellingPrice: 200000,
            batches: [{ batchNumber: 'LOT-EXT-01', expiryDate: '2028-12-31', qty: 10, cost: 90000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 200000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // First return: 1 of 1 unit
        const ret1 = posService.processReturn({
            originalOrderId: order.orderId,
            refundMethod: 'CARD_REVERSAL',
            items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prod.batchIds[0] }]
        });
        assert.ok(ret1.returnId);

        // Second attempt to return 1 unit must fail
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                refundMethod: 'CARD_REVERSAL',
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /بیش از تعداد باقی‌مانده مجاز/);
    });

    test('T2-RET-BND-5: Return on non-existent originalOrderId is rejected', () => {
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: 999999,
                refundMethod: 'CARD_REVERSAL',
                items: [{ orderItemId: 1, quantity: 1, isRestockable: true }]
            });
        }, /سفارش مرجع با شناسه 999999 یافت نشد/);
    });
});
