/**
 * Tier 3: Cross-Feature Integration — POS + FEFO Inventory + Loyalty Engine
 * Verifies end-to-end flow from batch allocation to points accrual and wallet spend
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

describe('Tier 3: POS + Inventory FEFO + Loyalty Integration', () => {
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

    test('T3-POS-INV-LOY-1: POS sale triggers FEFO batch deduction, stock transaction, and customer loyalty points accrual', () => {
        const customer = seedCustomer(db, {
            fullName: 'ترانه علیدوستی',
            loyaltyPoints: 0
        });

        const prod = seedProductWithBatches(db, {
            name: 'کرم ضد لک قوی شب',
            sku: 'CRM-ST-NIT',
            barcode: '6269002001001',
            sellingPrice: 500000,
            batches: [
                { batchNumber: 'LOT-NIT-EARLY', expiryDate: '2027-03-31', qty: 4, cost: 250000 },
                { batchNumber: 'LOT-NIT-LATER', expiryDate: '2028-06-30', qty: 10, cost: 270000 }
            ]
        });

        // Customer buys 6 units (total 3,000,000). Points rule: 10 points per 100,000 Toman -> 300 points
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 6, unitPrice: 500000 }],
            payments: [{ method: 'CARD', amount: 3000000 }]
        });

        assert.ok(order.orderId);

        // 1. Check FEFO stock deduction
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);
        assert.equal(b1.quantity, 0, 'Early batch must be completely exhausted');
        assert.equal(b2.quantity, 8, 'Later batch must be reduced from 10 to 8');

        // 2. Check stock transactions
        const st = db.prepare(`SELECT * FROM stock_transactions WHERE reference_type = 'ORDER' AND reference_id = ?`).all(order.orderId);
        assert.equal(st.length, 2);
        assert.equal(st[0].quantity, -4);
        assert.equal(st[1].quantity, -2);

        // 3. Check customer loyalty points and CLV
        const custAfter = db.prepare(`SELECT loyalty_points, clv FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.loyalty_points, 300);
        assert.equal(custAfter.clv, 3000000);

        // 4. Check loyalty transaction audit record
        const lTx = db.prepare(`SELECT * FROM loyalty_transactions WHERE customer_id = ? AND order_id = ?`).get(customer.id, order.orderId);
        assert.ok(lTx);
        assert.equal(lTx.type, 'EARN');
        assert.equal(lTx.points, 300);

        assertGeneralLedgerBalanced(db);
    });

    test('T3-POS-INV-LOY-2: Complete Points-to-Wallet conversion and subsequent POS checkout', () => {
        // Customer starts with 100 loyalty points and 0 wallet
        const customer = seedCustomer(db, {
            fullName: 'سحر دولتشاهی',
            loyaltyPoints: 100,
            walletBalance: 0
        });

        const prod = seedProductWithBatches(db, {
            name: 'خط چشم کوزه‌ای مویی',
            sku: 'EYE-LIN-POT',
            barcode: '6269002001002',
            sellingPrice: 150000,
            batches: [{ batchNumber: 'LOT-ELN-01', expiryDate: '2028-12-31', qty: 5, cost: 70000 }]
        });

        // 1. Customer converts 100 points -> 50,000 Tomans wallet credit
        // GL: Dr 603 (Loyalty Expense) 50,000 / Cr 205 (Wallet Liability) 50,000
        const convResult = crmService.convertPointsToWallet(customer.id, 100);
        assert.equal(convResult.cashValue, 50000);

        let custRow = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.loyalty_points, 0);
        assert.equal(custRow.wallet_balance, 50000);

        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '603'), 50000);
        assert.equal(getAccountNetBalance(db, '205'), 50000);

        // 2. Customer buys product (150,000) using 50,000 Wallet + 100,000 Card
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 150000 }],
            payments: [
                { method: 'WALLET', amount: 50000 },
                { method: 'CARD', amount: 100000 }
            ]
        });

        assert.ok(order.orderId);

        // Wallet balance now 0
        custRow = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custRow.wallet_balance, 0);

        // GL Account 205 balance is now 0 (50K credit on conversion - 50K debit on purchase)
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 0);
        assert.equal(getAccountNetBalance(db, '102'), 100000);
        assert.equal(getAccountNetBalance(db, '401'), 150000);
    });
});
