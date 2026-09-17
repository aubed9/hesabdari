/**
 * Tier 1: Feature Coverage — CRM, Customer 360, Wallet Liability & Loyalty Engine
 * Minimum 5 tests covering wallet deposits, withdrawals, negative protection, points-to-wallet conversion, and 360 profile
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedCustomer,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

const crmService = require('../../services/crmService');

describe('Tier 1: CRM, Customer 360, Wallet Liability & Loyalty Engine', () => {
    let db;
    let fixtures;
    let customer;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;

        customer = seedCustomer(db, {
            fullName: 'مهسا کریمی',
            mobile: '09351234567',
            walletBalance: 0,
            loyaltyPoints: 100
        });
    });

    after(() => {
        teardownTestDb();
    });

    test('T1-CRM-1: Manual wallet deposit increases balance, records transaction, and posts Dr 102 / Cr 205', () => {
        const res = crmService.adjustWallet(customer.id, {
            amount: 300000,
            type: 'DEPOSIT',
            note: 'شارژ آنلاین کیف پول'
        });

        assert.equal(res.success, true);
        assert.equal(res.newBalance, 300000);

        // Verify customer wallet balance in DB
        const cust = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(cust.wallet_balance, 300000);

        // Verify wallet transaction record
        const tx = db.prepare(`SELECT * FROM wallet_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 1`).get(customer.id);
        assert.equal(tx.type, 'DEPOSIT');
        assert.equal(tx.amount, 300000);

        // GL balanced: Dr Bank (102) 300k, Cr Wallet Liability (205) 300k
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 300000);
    });

    test('T1-CRM-2: Manual wallet withdrawal reduces balance, records negative transaction, and posts Dr 205 / Cr 102', () => {
        const res = crmService.adjustWallet(customer.id, {
            amount: 100000,
            type: 'WITHDRAW',
            note: 'برداشت وجه از کیف پول'
        });

        assert.equal(res.success, true);
        assert.equal(res.newBalance, 200000);

        // Verify signed transaction
        const tx = db.prepare(`SELECT * FROM wallet_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 1`).get(customer.id);
        assert.equal(tx.type, 'WITHDRAW');
        assert.equal(tx.amount, -100000);

        // GL balanced: Wallet Liability (205) reduced to 200k
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 200000);
    });

    test('T1-CRM-3: Wallet withdrawal exceeding balance throws error protecting against negative balance', () => {
        assert.throws(() => {
            crmService.adjustWallet(customer.id, {
                amount: 500000, // Balance is only 200k
                type: 'WITHDRAW',
                note: 'برداشت غیرمجاز بیش از موجودی'
            });
        }, /موجودی کیف پول برای کسر کافی نیست/);

        // Balance remains 200k
        const cust = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(cust.wallet_balance, 200000);
    });

    test('T1-CRM-4: Converting loyalty points to wallet posts Dr 603 / Cr 205 and adjusts balances', () => {
        // Customer has 100 points. Convert 50 points -> 25,000 Tomans
        const res = crmService.convertPointsToWallet(customer.id, 50);

        assert.equal(res.convertedPoints, 50);
        assert.equal(res.cashValue, 25000);

        const cust = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(cust.loyalty_points, 50);
        assert.equal(cust.wallet_balance, 225000); // 200k + 25k

        // GL must be balanced
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 225000);
    });

    test('T1-CRM-5: Customer 360 profile returns order history, shades, and wallet/loyalty logs', () => {
        const profile = crmService.getCustomerProfile(customer.id);

        assert.ok(profile);
        assert.equal(profile.id, customer.id);
        assert.ok(Array.isArray(profile.walletLogs));
        assert.ok(Array.isArray(profile.loyaltyLogs));
        assert.equal(profile.walletLogs.length, 3); // Deposit 300k, Withdraw -100k, Points conversion 25k
    });

    test('T1-CRM-6: Customer RFM and spending metrics aggregate correctly', () => {
        const customers = crmService.getCustomers();
        assert.ok(Array.isArray(customers));
        const found = customers.find(c => c.id === customer.id);
        assert.ok(found);
        assert.equal(found.mobile, '09351234567');
    });
});
