/**
 * Tier 2: Boundary & Corner Cases — Customer Wallet & Loyalty Engine
 * Minimum 5 tests covering negative balance prevention, zero amounts, negative inputs, invalid customers, and point limits
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedCustomer,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 2: Customer Wallet & Loyalty Boundary Cases', () => {
    let db, fixtures, crmService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        crmService = require('../../services/crmService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T2-WLT-BND-1: Over-debiting customer wallet beyond current balance is rejected and preserves balance', () => {
        const customer = seedCustomer(db, {
            fullName: 'الهام مقدسی',
            walletBalance: 150000
        });

        // Request 150,001 Toman withdrawal
        assert.throws(() => {
            crmService.adjustWallet(customer.id, {
                amount: 150001,
                type: 'WITHDRAW',
                note: 'تلاش برای منفی کردن کیف پول'
            });
        }, /موجودی کیف پول برای کسر کافی نیست/);

        // Wallet balance must remain strictly at 150,000
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 150000);

        assertGeneralLedgerBalanced(db);
    });

    test('T2-WLT-BND-2: Zero amount deposit or withdrawal is rejected', () => {
        const customer = seedCustomer(db, {
            fullName: 'شیدا اسدی',
            walletBalance: 50000
        });

        assert.throws(() => {
            crmService.adjustWallet(customer.id, {
                amount: 0,
                type: 'DEPOSIT'
            });
        }, /مبلغ باید بزرگتر از صفر باشد/);

        assert.throws(() => {
            crmService.adjustWallet(customer.id, {
                amount: 0,
                type: 'WITHDRAW'
            });
        }, /مبلغ باید بزرگتر از صفر باشد/);
    });

    test('T2-WLT-BND-3: POS checkout with wallet payment exceeding customer balance fails database constraint', () => {
        const posService = require('../../services/posService');
        const { seedProductWithBatches } = require('../helpers/testDb');

        const customer = seedCustomer(db, {
            fullName: 'پریناز حسینی',
            walletBalance: 30000 // only 30,000 in wallet
        });

        const prod = seedProductWithBatches(db, {
            name: 'ماسک موی پروتئینه',
            sku: 'MSK-PRT-01',
            barcode: '6267777777777',
            sellingPrice: 100000,
            batches: [{ batchNumber: 'LOT-MSK-01', expiryDate: '2028-12-31', qty: 5, cost: 50000 }]
        });

        // Attempt to pay 100,000 via WALLET when balance is only 30,000
        assert.throws(() => {
            posService.createOrder({
                customerId: customer.id,
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 100000 }],
                payments: [{ method: 'WALLET', amount: 100000 }]
            });
        }, /CHECK constraint failed|Constraint violation/);

        // Wallet balance must remain strictly at 30,000
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 30000);
    });

    test('T2-WLT-BND-4: Adjusting wallet for non-existent customer ID throws customer not found error', () => {
        assert.throws(() => {
            crmService.adjustWallet(999999, {
                amount: 50000,
                type: 'DEPOSIT'
            });
        }, /مشتری یافت نشد/);
    });

    test('T2-WLT-BND-5: Converting more loyalty points than customer possesses is rejected', () => {
        const customer = seedCustomer(db, {
            fullName: 'فاطمه نوری',
            loyaltyPoints: 30, // only 30 points
            walletBalance: 0
        });

        assert.throws(() => {
            crmService.convertPointsToWallet(customer.id, 50); // requires 50 points
        }, /امتیاز کافی برای تبدیل وجود ندارد/);

        // Points and wallet balance must remain unchanged
        const custAfter = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.loyalty_points, 30);
        assert.equal(custAfter.wallet_balance, 0);

        assertGeneralLedgerBalanced(db);
    });
});
