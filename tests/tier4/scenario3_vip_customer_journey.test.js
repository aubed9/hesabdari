/**
 * Tier 4: Real-World Application Scenarios — Scenario 3: VIP Customer Journey
 * Simulates registration -> high-value purchases -> loyalty earn -> point conversion to wallet ->
 * split wallet checkout -> partial return to wallet -> Customer 360 & GL 205 reconciliation
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

describe('Tier 4: Scenario 3 — VIP Customer Journey', () => {
    let db, fixtures, posService, crmService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        posService = require('../../services/posService');
        crmService = require('../../services/crmService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('Scenario 3: Complete VIP customer journey with wallet, loyalty, and return lifecycle', () => {
        // --- STEP 1: VIP CUSTOMER REGISTRATION ---
        const customer = seedCustomer(db, {
            fullName: 'پریناز ایزدیار',
            mobile: '09127778899',
            walletBalance: 0,
            loyaltyPoints: 0,
            loyaltyTier: 'VIP'
        });

        // High-end luxury cosmetics
        const prodPerfume = seedProductWithBatches(db, {
            name: 'ادکلن دیور ساواج ادوپرفیوم',
            sku: 'DIR-SAV-01',
            barcode: '6269103001001',
            sellingPrice: 2000000,
            batches: [{ batchNumber: 'LOT-DIR-01', expiryDate: '2029-12-31', qty: 5, cost: 1200000 }]
        });

        const prodCream = seedProductWithBatches(db, {
            name: 'کرم لیفتینگ پیشرفته کلینیک',
            sku: 'CLN-LFT-01',
            barcode: '6269103001002',
            sellingPrice: 500000,
            batches: [{ batchNumber: 'LOT-CLN-01', expiryDate: '2028-12-31', qty: 10, cost: 250000 }]
        });

        // --- STEP 2: FIRST PURCHASE (2,000,000) EARNS 200 LOYALTY POINTS ---
        const order1 = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodPerfume.variantId, quantity: 1, unitPrice: 2000000 }],
            payments: [{ method: 'CARD', amount: 2000000 }]
        });

        assert.ok(order1.orderId);

        let custRow = db.prepare(`SELECT loyalty_points, wallet_balance, clv FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.loyalty_points, 200);
        assert.equal(custRow.clv, 2000000);

        // --- STEP 3: WALLET TOP-UP (500,000 TOMANS) ---
        crmService.adjustWallet(customer.id, {
            amount: 500000,
            type: 'DEPOSIT',
            note: 'شارژ کیف پول اینترنتی توسط مشتری'
        });

        custRow = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.wallet_balance, 500000);

        // --- STEP 4: CONVERT 100 LOYALTY POINTS TO WALLET (50,000 TOMANS) ---
        crmService.convertPointsToWallet(customer.id, 100);

        custRow = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.loyalty_points, 100); // 200 - 100
        assert.equal(custRow.wallet_balance, 550000); // 500,000 + 50,000

        // --- STEP 5: SECOND PURCHASE (1,000,000) PAID WITH 550,000 WALLET + 450,000 CARD ---
        const order2 = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodCream.variantId, quantity: 2, unitPrice: 500000 }], // 2 * 500k = 1,000,000
            payments: [
                { method: 'WALLET', amount: 550000 },
                { method: 'CARD', amount: 450000 }
            ]
        });

        assert.ok(order2.orderId);

        // Wallet is now completely spent (0)
        custRow = db.prepare(`SELECT wallet_balance, loyalty_points FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.wallet_balance, 0);
        // Earned 100 new points on 1M order: 100 + 100 = 200 points
        assert.equal(custRow.loyalty_points, 200);

        // --- STEP 6: PARTIAL RETURN OF 1 CREAM (500,000) REFUNDED TO WALLET ---
        const orderItem2 = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(order2.orderId);
        const retResult = posService.processReturn({
            originalOrderId: order2.orderId,
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'WALLET_CREDIT',
            reason: 'انصراف از یکی از دو کرم خریداری شده',
            items: [{
                orderItemId: orderItem2.id,
                quantity: 1,
                isOpened: false,
                isRestockable: true,
                batchId: prodCream.batchIds[0]
            }]
        });

        assert.ok(retResult.returnId);
        assert.equal(retResult.totalRefund, 500000);

        // Wallet balance is now 500,000 (refunded)
        custRow = db.prepare(`SELECT wallet_balance, loyalty_points FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.wallet_balance, 500000);
        // 50 points reversed on 500k return: 200 - 50 = 150 points
        assert.equal(custRow.loyalty_points, 150);

        // --- STEP 7: CUSTOMER 360 PROFILE & GL AUDIT ---
        const profile = crmService.getCustomerProfile(customer.id);
        assert.ok(profile);
        assert.equal(profile.wallet_balance, 500000);
        assert.equal(profile.loyalty_points, 150);
        assert.ok(profile.walletLogs.length >= 4); // Deposit, Gift convert, Withdraw, Refund

        // Verify GL Account 205 (Customer Wallet Liability) strictly equals customer wallet balance
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 500000, 'GL Account 205 must strictly reconcile with customer wallet balance (500,000)');
    });
});
