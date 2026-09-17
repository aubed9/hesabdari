/**
 * Tier 3: Cross-Feature Integration — Sales Return + Wallet Refund + Restock + Loyalty Points Revocation
 * Verifies the complete return round-trip across Inventory, CRM, Wallet, and Double-Entry GL
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

describe('Tier 3: Return + Wallet + Restock + Loyalty Revocation', () => {
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

    test('T3-RET-WLT-LOY-1: Restockable return to wallet restores batch, refunds wallet, revokes loyalty points, and reverses GL', () => {
        const customer = seedCustomer(db, {
            fullName: 'سودابه حسامی',
            walletBalance: 50000,
            loyaltyPoints: 0
        });

        const prod = seedProductWithBatches(db, {
            name: 'کرم ضد آفتاب فتودرم بایودرما',
            sku: 'SUN-BIO-01',
            barcode: '6269004001001',
            sellingPrice: 400000,
            batches: [{ batchNumber: 'LOT-BIO-01', expiryDate: '2028-10-31', qty: 10, cost: 200000 }]
        });

        // 1. Initial Sale: 2 units = 800,000 paid by CARD
        // Loyalty points earned: 80 points (10 per 100k)
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 400000 }],
            payments: [{ method: 'CARD', amount: 800000 }]
        });

        assert.ok(order.orderId);

        // Verify post-sale state
        let batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 8);

        let custRow = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.loyalty_points, 80);
        assert.equal(custRow.wallet_balance, 50000);

        const orderItem = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order.orderId);

        // 2. Process Return: 1 unit returned (400,000) with WALLET_CREDIT and isRestockable = true
        const retResult = posService.processReturn({
            originalOrderId: order.orderId,
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'WALLET_CREDIT',
            reason: 'انصراف مشتری و بازگشت به کیف پول',
            items: [{
                orderItemId: orderItem.id,
                quantity: 1,
                isOpened: false,
                isRestockable: true,
                batchId: prod.batchIds[0]
            }]
        });

        assert.ok(retResult.returnId);
        assert.equal(retResult.totalRefund, 400000);
        assert.equal(retResult.restockedCost, 200000);

        // 3. Verify Batch Quantity Restored: from 8 back to 9
        batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 9, 'Restockable return must restore inventory batch quantity');

        // 4. Verify Customer Wallet Credited: 50,000 + 400,000 = 450,000
        custRow = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.wallet_balance, 450000, 'Customer wallet must be credited with the refund amount');

        // 5. Verify Loyalty Points Revocation: 80 points - 40 points = 40 points
        assert.equal(custRow.loyalty_points, 40, 'Loyalty points must be proportionally deducted on return');

        // 6. Verify GL Invariants & Accounts
        assertGeneralLedgerBalanced(db);
        // Dr 404 (Sales Returns) 400K, Cr 205 (Wallet Liability) 400K
        // Dr 103 (Inventory restored) 200K, Cr 501 (COGS reversed) 200K
        assert.equal(getAccountNetBalance(db, '205'), 400000, 'GL Account 205 Wallet Liability must reflect the refund credit');
        assert.equal(getAccountNetBalance(db, '102'), 800000, 'Bank Account 102 still has original 800,000 (since refund was to wallet, not bank)');
    });
});
