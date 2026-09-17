/**
 * Tier 3: Cross-Feature Integration — Single-Transaction Product Exchange & Inventory Settlement
 * Verifies atomic execution of return + sale within a unified exchange transaction
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

describe('Tier 3: Exchange POS Inventory Integration', () => {
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

    test('T3-EXC-1: Atomic exchange where new item is higher value settles difference and updates inventory & GL', () => {
        // Item A: 200,000 Toman (Cost 100,000)
        const prodA = seedProductWithBatches(db, {
            name: 'ضد آفتاب لافارر پوست چرب',
            sku: 'SUN-LAF-01',
            barcode: '6269005001001',
            sellingPrice: 200000,
            batches: [{ batchNumber: 'LOT-LAF-01', expiryDate: '2028-06-30', qty: 10, cost: 100000 }]
        });

        // Item B: 350,000 Toman (Cost 180,000)
        const prodB = seedProductWithBatches(db, {
            name: 'ضد آفتاب ایزدین فیوژن واتر',
            sku: 'SUN-ISD-01',
            barcode: '6269005001002',
            sellingPrice: 350000,
            batches: [{ batchNumber: 'LOT-ISD-01', expiryDate: '2028-12-31', qty: 8, cost: 180000 }]
        });

        // 1. Initial purchase of Item A
        const origOrder = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodA.variantId, quantity: 1, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 200000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(origOrder.orderId);

        // 2. Customer exchanges Item A (200,000) for Item B (350,000)
        // Difference = 150,000 paid by CARD
        const exchange = posService.processExchange({
            returnData: {
                originalOrderId: origOrder.orderId,
                employeeId: fixtures.users.cashier.id,
                refundMethod: 'CARD_REVERSAL',
                reason: 'ارتقا به برند خارجی ضد آفتاب',
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prodA.batchIds[0] }]
            },
            newOrderData: {
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prodB.variantId, quantity: 1, unitPrice: 350000 }],
                payments: [{ method: 'CARD', amount: 350000 }]
            }
        });

        assert.ok(exchange.exchangeNumber);
        assert.equal(exchange.differenceAmount, 150000);
        assert.equal(exchange.isCustomerPaying, true);

        // Item A restocked back to 10 (9 + 1)
        const batchA = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prodA.batchIds[0]);
        assert.equal(batchA.quantity, 10);

        // Item B depleted from 8 to 7
        const batchB = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prodB.batchIds[0]);
        assert.equal(batchB.quantity, 7);

        // Exchange audit and database record
        const exchRecord = db.prepare(`SELECT * FROM exchanges WHERE exchange_number = ?`).get(exchange.exchangeNumber);
        assert.ok(exchRecord);
        assert.equal(exchRecord.difference_amount, 150000);
        assert.equal(exchRecord.settlement_status, 'SETTLED');

        assertGeneralLedgerBalanced(db);
    });

    test('T3-EXC-2: Even exchange with identical prices completes with difference of 0', () => {
        // Shade 1: 180,000
        const prodShade1 = seedProductWithBatches(db, {
            name: 'رژ لب مات شماره ۰۱',
            sku: 'LIP-SHD-01',
            barcode: '6269005001003',
            sellingPrice: 180000,
            batches: [{ batchNumber: 'LOT-SHD-01', expiryDate: '2028-12-31', qty: 10, cost: 90000 }]
        });

        // Shade 2: 180,000
        const prodShade2 = seedProductWithBatches(db, {
            name: 'رژ لب مات شماره ۰۲',
            sku: 'LIP-SHD-02',
            barcode: '6269005001004',
            sellingPrice: 180000,
            batches: [{ batchNumber: 'LOT-SHD-02', expiryDate: '2028-12-31', qty: 10, cost: 90000 }]
        });

        const origOrder = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodShade1.variantId, quantity: 1, unitPrice: 180000 }],
            payments: [{ method: 'CARD', amount: 180000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(origOrder.orderId);

        const exchange = posService.processExchange({
            returnData: {
                originalOrderId: origOrder.orderId,
                employeeId: fixtures.users.cashier.id,
                refundMethod: 'CARD_REVERSAL',
                reason: 'تعویض شماره رنگ بدون تغییر قیمت',
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prodShade1.batchIds[0] }]
            },
            newOrderData: {
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prodShade2.variantId, quantity: 1, unitPrice: 180000 }],
                payments: [{ method: 'CARD', amount: 180000 }]
            }
        });

        assert.equal(exchange.differenceAmount, 0);
        assert.equal(exchange.isEven, true);

        // Both batches should now have 10 units (Shade 1 restored from 9 to 10; Shade 2 depleted from 10 to 9... wait, shade 1 is restored back to 10, shade 2 is 9)
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prodShade1.batchIds[0]);
        const b2 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prodShade2.batchIds[0]);
        assert.equal(b1.quantity, 10);
        assert.equal(b2.quantity, 9);

        assertGeneralLedgerBalanced(db);
    });
});
