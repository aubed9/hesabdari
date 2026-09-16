const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedCustomer,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

const posService = require('../../services/posService');

describe('Tier 1: POS, FEFO Allocation, Returns & Anti-Double-Return', () => {
    let db;
    let fixtures;
    let variantId;
    let batchId1, batchId2;
    let customer;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;

        // Create product variant with 2 batches having different expiries and costs
        const prod = seedProductWithBatches(db, {
            name: 'رژ لب مات مخملی',
            sku: 'LIP-VELVET-01',
            sellingPrice: 200000,
            batches: [
                { batchNumber: 'B-EXP-SOON', expiryDate: '2026-10-01', qty: 10, cost: 100000 },
                { batchNumber: 'B-EXP-LATER', expiryDate: '2027-05-01', qty: 15, cost: 110000 }
            ]
        });

        variantId = prod.variantId;
        batchId1 = prod.batchIds[0];
        batchId2 = prod.batchIds[1];

        customer = seedCustomer(db, {
            fullName: 'سارا احمدی',
            mobile: '09129990001',
            walletBalance: 500000,
            loyaltyPoints: 50
        });
    });

    after(() => {
        teardownTestDb();
    });

    test('T1-POS-1: Normal FEFO sale allocates earliest expiring batch and creates balanced journal', () => {
        const res = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId, quantity: 6, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 1200000 }]
        });

        assert.ok(res.orderId);
        assert.equal(res.totalAmount, 1200000);

        // FEFO verification: batch1 (earliest) must have 10 - 6 = 4 remaining
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(batchId1);
        assert.equal(b1.quantity, 4, 'Earliest expiry batch should be decremented by 6');

        // Verify balanced journal
        assertGeneralLedgerBalanced(db);

        // Verify revenue (401) and COGS (501)
        assert.equal(getAccountNetBalance(db, '401'), 1200000, 'Sales revenue should be 1.2M credit');
        assert.equal(getAccountNetBalance(db, '501'), 600000, 'COGS should be 6 * 100k = 600k debit');
    });

    test('T1-POS-2: Layaway reserves stock without depleting available quantity, preventing regular sale leakage', () => {
        // Create layaway reserving 3 units from remaining 4 of batch1
        const layawayRes = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            orderType: 'LAYAWAY',
            items: [{ variantId, quantity: 3, unitPrice: 200000 }],
            payments: [{ method: 'CASH', amount: 200000 }]
        });

        assert.ok(layawayRes.orderId);

        // Batch1 now has quantity=4, reserved_quantity=3 -> available=1
        const b1 = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(batchId1);
        assert.equal(b1.quantity, 4);
        assert.equal(b1.reserved_quantity, 3);

        // A regular sale for 2 units MUST NOT take from reserved! It should take 1 from batch1 and 1 from batch2!
        posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId, quantity: 2, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 400000 }]
        });

        const b1After = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(batchId1);
        const b2After = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(batchId2);

        assert.equal(b1After.quantity, 3, 'Batch 1 quantity must only be reduced by 1 unreserved unit');
        assert.equal(b1After.reserved_quantity, 3, 'Batch 1 reserved quantity remains intact for layaway');
        assert.equal(b2After.quantity, 14, 'Batch 2 must be consumed for the second unit');

        assertGeneralLedgerBalanced(db);
    });

    test('T1-POS-3: Sales Return of restockable goods restores inventory and reverses accounting & loyalty', () => {
        // First, make a clean purchase of 2 items
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId, quantity: 2, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 400000 }]
        });

        const orderDetails = posService.getOrderDetails(order.orderId);
        const orderItem = orderDetails.items[0];

        const batchBefore = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(orderItem.batch_id);

        // Return 1 unit as restockable with WALLET_CREDIT
        const retRes = posService.processReturn({
            originalOrderId: order.orderId,
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'WALLET_CREDIT',
            items: [{
                orderItemId: orderItem.id,
                quantity: 1,
                isRestockable: true,
                isOpened: false
            }]
        });

        assert.equal(retRes.totalRefund, 200000);

        // Inventory should be restored by 1
        const batchAfter = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(orderItem.batch_id);
        assert.equal(batchAfter.quantity, batchBefore.quantity + 1);

        // Double entry GL must remain balanced
        assertGeneralLedgerBalanced(db);
    });

    test('T1-POS-4: Anti-Double-Return guard forbids returning more than purchased or already returned', () => {
        // Create an order of 2 items
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId, quantity: 2, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 400000 }]
        });

        const orderDetails = posService.getOrderDetails(order.orderId);
        const orderItem = orderDetails.items[0];

        // Return 2 items (full return)
        posService.processReturn({
            originalOrderId: order.orderId,
            customerId: customer.id,
            items: [{
                orderItemId: orderItem.id,
                quantity: 2,
                isRestockable: true
            }]
        });

        // Attempt second return on the same item -> MUST THROW!
        assert.throws(() => {
            posService.processReturn({
                originalOrderId: order.orderId,
                customerId: customer.id,
                items: [{
                    orderItemId: orderItem.id,
                    quantity: 1,
                    isRestockable: true
                }]
            });
        }, /بیش از تعداد باقی‌مانده/);
    });

    test('T1-POS-5: Product Exchange executes return and new sale atomically with difference settlement', () => {
        // Create product variant 2
        const prod2 = seedProductWithBatches(db, {
            name: 'کرم پودر مات ۲۴ ساعته',
            sku: 'FND-MATTE-01',
            barcode: '3600522851999',
            sellingPrice: 350000,
            batches: [
                { batchNumber: 'B-FND-01', expiryDate: '2027-01-01', qty: 10, cost: 180000 }
            ]
        });

        // Initial sale of 1 lipstick for 200,000
        const initialOrder = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId, quantity: 1, unitPrice: 200000 }],
            payments: [{ method: 'CARD', amount: 200000 }]
        });
        const orderItem = posService.getOrderDetails(initialOrder.orderId).items[0];

        // Exchange: return 1 lipstick (200k) and buy 1 foundation (350k) -> customer pays 150k difference
        const exchRes = posService.processExchange({
            returnData: {
                originalOrderId: initialOrder.orderId,
                customerId: customer.id,
                employeeId: fixtures.users.cashier.id,
                refundMethod: 'WALLET_CREDIT',
                items: [{ orderItemId: orderItem.id, quantity: 1, isRestockable: true }]
            },
            newOrderData: {
                customerId: customer.id,
                employeeId: fixtures.users.cashier.id,
                items: [{ variantId: prod2.variantId, quantity: 1, unitPrice: 350000 }],
                payments: [
                    { method: 'WALLET', amount: 200000 },
                    { method: 'CARD', amount: 150000 }
                ]
            }
        });

        assert.ok(exchRes.exchangeNumber);
        assert.equal(exchRes.differenceAmount, 150000);
        assert.equal(exchRes.isCustomerPaying, true);

        // General Ledger must be perfectly balanced after exchange
        assertGeneralLedgerBalanced(db);
    });
});
