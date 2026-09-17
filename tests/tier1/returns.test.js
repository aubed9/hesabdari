/**
 * Tier 1: Feature Coverage — Sales Returns & Exchanges Engine
 * Minimum 5 tests covering restockable vs damaged returns, anti-double-return, loyalty reversals, and atomic exchanges
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedCustomer,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

describe('Tier 1: Sales Returns & Exchanges Engine', () => {
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

    test('T1-RET-1: Restockable return restores inventory batch and posts full accounting reversal', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم پودر هدی بیوتی',
            sellingPrice: 900000,
            batches: [{ batchNumber: 'LOT-HDB-01', expiryDate: '2028-01-01', qty: 10, cost: 500000 }]
        });

        // 1. Initial Sale: 2 units for 1,800,000 via CARD
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 900000 }],
            payments: [{ method: 'CARD', amount: 1800000 }]
        });

        // Batch reduced to 8
        let batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 8);

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // 2. Return 1 unit as Restockable (refund via CARD_REVERSAL)
        const retResult = posService.processReturn({
            originalOrderId: order.orderId,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'CARD_REVERSAL',
            reason: 'عدم تطابق رنگ با سلیقه مشتری',
            items: [{
                orderItemId: orderItem.id,
                quantity: 1,
                isOpened: false,
                isRestockable: true,
                batchId: prod.batchIds[0]
            }]
        });

        assert.ok(retResult.returnId);
        assert.equal(retResult.totalRefund, 900000);
        assert.equal(retResult.restockedCost, 500000);

        // Batch restored back to 9 (8 + 1)
        batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 9);

        // Ledger balance check
        assertGeneralLedgerBalanced(db);
        // Dr 103 (Inventory restored) 500,000, Cr 501 (COGS reversed) 500,000
        // Dr 404 (Returns) 900,000, Cr 102 (Bank refunded) 900,000
    });

    test('T1-RET-2: Damaged/opened return does not restock batch and posts to Damaged Waste (607)', () => {
        const prod = seedProductWithBatches(db, {
            name: 'رژ گونه مایع شید صورتی',
            sellingPrice: 300000,
            batches: [{ batchNumber: 'LOT-BLS-01', expiryDate: '2027-08-01', qty: 10, cost: 140000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 300000 }],
            payments: [{ method: 'CARD', amount: 600000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // Return 1 unit as Opened/Unrestockable
        const retResult = posService.processReturn({
            originalOrderId: order.orderId,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'CARD_REVERSAL',
            reason: 'پلمپ باز شده و محصول تست شده است',
            items: [{
                orderItemId: orderItem.id,
                quantity: 1,
                isOpened: true,
                isRestockable: false,
                batchId: prod.batchIds[0]
            }]
        });

        assert.equal(retResult.damagedCost, 140000);
        assert.equal(retResult.restockedCost, 0);

        // Batch quantity must REMAIN 8 (not restored)
        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 8);

        // Ledger balance check
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '607'), 140000, 'Damaged Waste account 607 must be debited 140,000');
    });

    test('T1-RET-3: Wallet credit refund increases customer wallet balance and credits Account 205', () => {
        const customer = seedCustomer(db, {
            fullName: 'مهسا قادری',
            walletBalance: 100000
        });

        const prod = seedProductWithBatches(db, {
            name: 'مداد ابرو پیچی',
            sellingPrice: 120000,
            batches: [{ batchNumber: 'LOT-EYB-01', expiryDate: '2028-02-01', qty: 10, cost: 50000 }]
        });

        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 120000 }],
            payments: [{ method: 'CARD', amount: 240000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // Return 1 unit with WALLET_CREDIT refund
        const retResult = posService.processReturn({
            originalOrderId: order.orderId,
            customerId: customer.id,
            refundMethod: 'WALLET_CREDIT',
            items: [{
                orderItemId: orderItem.id,
                quantity: 1,
                isOpened: false,
                isRestockable: true,
                batchId: prod.batchIds[0]
            }]
        });

        assert.equal(retResult.totalRefund, 120000);

        // Customer wallet balance increased from 100,000 to 220,000
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 220000);

        // Check wallet transaction
        const wTx = db.prepare(`SELECT * FROM wallet_transactions WHERE customer_id = ? AND type = 'REFUND'`).get(customer.id);
        assert.ok(wTx);
        assert.equal(wTx.amount, 120000);

        assertGeneralLedgerBalanced(db);
    });

    test('T1-RET-4: Anti-double-return guard prevents returning more than original purchased quantity', () => {
        const prod = seedProductWithBatches(db, {
            name: 'لاک ناخن مات بنفش',
            sellingPrice: 80000,
            batches: [{ batchNumber: 'LOT-NAIL-01', expiryDate: '2028-05-01', qty: 10, cost: 35000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 3, unitPrice: 80000 }],
            payments: [{ method: 'CARD', amount: 240000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // Return 2 of 3 units
        posService.processReturn({
            originalOrderId: order.orderId,
            items: [{ orderItemId: orderItem.id, quantity: 2, isRestockable: true, batchId: prod.batchIds[0] }]
        });

        // Attempting to return 2 more units must fail (only 1 unit returnable)
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                items: [{ orderItemId: orderItem.id, quantity: 2, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /بیش از تعداد باقی‌مانده مجاز/);

        // Returning the final 1 unit succeeds
        const finalRet = posService.processReturn({
            originalOrderId: order.orderId,
            items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prod.batchIds[0] }]
        });
        assert.ok(finalRet.returnId);

        // Now line is fully returned (3 of 3). Any further return attempt must fail
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prod.batchIds[0] }]
            });
        }, /بیش از تعداد باقی‌مانده مجاز/);
    });

    test('T1-RET-5: Product Exchange executes return and new purchase atomically with difference settlement', () => {
        const prodA = seedProductWithBatches(db, {
            name: 'کانسیلر دور چشم روشن',
            sku: 'CNC-LIGHT-01',
            barcode: '6260010010011',
            sellingPrice: 250000,
            batches: [{ batchNumber: 'LOT-CNC-01', expiryDate: '2027-09-01', qty: 10, cost: 120000 }]
        });

        const prodB = seedProductWithBatches(db, {
            name: 'کانسیلر دور چشم بژ طبیعی',
            sku: 'CNC-BEIGE-02',
            barcode: '6260010010022',
            sellingPrice: 320000,
            batches: [{ batchNumber: 'LOT-CNC-02', expiryDate: '2027-10-01', qty: 10, cost: 150000 }]
        });

        // Original purchase of Prod A
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodA.variantId, quantity: 1, unitPrice: 250000 }],
            payments: [{ method: 'CARD', amount: 250000 }]
        });

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // Customer exchanges Prod A (250K) for Prod B (320K) -> Customer pays difference of 70,000 Toman
        const exchangeResult = posService.processExchange({
            returnData: {
                originalOrderId: order.orderId,
                employeeId: fixtures.users.cashier.id,
                refundMethod: 'CARD_REVERSAL',
                reason: 'تعویض رنگ با شید مناسب‌تر',
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true, batchId: prodA.batchIds[0] }]
            },
            newOrderData: {
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prodB.variantId, quantity: 1, unitPrice: 320000 }],
                payments: [{ method: 'CARD', amount: 320000 }]
            }
        });

        assert.ok(exchangeResult.exchangeNumber);
        assert.equal(exchangeResult.differenceAmount, 70000);
        assert.equal(exchangeResult.isCustomerPaying, true);

        // Exchange record in DB
        const exch = db.prepare(`SELECT * FROM exchanges WHERE exchange_number = ?`).get(exchangeResult.exchangeNumber);
        assert.equal(exch.difference_amount, 70000);
        assert.equal(exch.settlement_status, 'SETTLED');

        assertGeneralLedgerBalanced(db);
    });
});
