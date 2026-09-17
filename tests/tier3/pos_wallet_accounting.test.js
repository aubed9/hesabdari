/**
 * Tier 3: Cross-Feature Integration — POS Checkout + Customer Wallet + Double-Entry Accounting
 * Verifies synchronous orchestration across POS, Wallet Liability (205), and General Ledger
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

describe('Tier 3: POS + Customer Wallet + GL Integration', () => {
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

    test('T3-POS-WLT-1: Complete wallet lifecycle: deposit -> POS payment -> GL 205 reconciliation', () => {
        const customer = seedCustomer(db, {
            fullName: 'سیمین دانشور',
            walletBalance: 0
        });

        const prod = seedProductWithBatches(db, {
            name: 'سرم روشن‌کننده ویتامین سی',
            sku: 'SRM-VIT-C1',
            barcode: '6269001001001',
            sellingPrice: 400000,
            batches: [{ batchNumber: 'LOT-VIT-01', expiryDate: '2028-10-31', qty: 10, cost: 220000 }]
        });

        // 1. Customer deposits 1,000,000 Toman into wallet
        crmService.adjustWallet(customer.id, {
            amount: 1000000,
            type: 'DEPOSIT',
            note: 'شارژ آنلاین کیف پول از طریق درگاه'
        });

        // GL after deposit: Dr 102 (Bank) 1M / Cr 205 (Wallet Liability) 1M
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 1000000);
        assert.equal(getAccountNetBalance(db, '102'), 1000000);

        // 2. Customer buys product using 400,000 from wallet
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 400000 }],
            payments: [{ method: 'WALLET', amount: 400000 }]
        });

        assert.ok(order.orderId);

        // Verify customer wallet balance is exactly 600,000 (1M - 400K)
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 600000);

        // Verify GL: Account 205 (Customer Wallet Liability) net balance is exactly 600,000
        // (1,000,000 credit on deposit - 400,000 debit on purchase)
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), 600000, 'GL Account 205 must exactly equal customer wallet balance');
        assert.equal(getAccountNetBalance(db, '401'), 400000, 'GL Account 401 Revenue must be 400,000');
        assert.equal(getAccountNetBalance(db, '501'), 220000, 'GL Account 501 COGS must be 220,000');
        assert.equal(getAccountNetBalance(db, '103'), -220000, 'GL Account 103 Inventory must be credited 220,000');
    });

    test('T3-POS-WLT-2: Multi-tender POS split: Wallet + Cash + Card routes to 205, 101, and 102 with zero imbalance', () => {
        const customer = seedCustomer(db, {
            fullName: 'فرشته طاهری',
            walletBalance: 200000
        });

        const prod = seedProductWithBatches(db, {
            name: 'پالت رژ گونه ۴ رنگ براق',
            sku: 'PLT-BLS-04',
            barcode: '6269001001002',
            sellingPrice: 750000,
            batches: [{ batchNumber: 'LOT-PBL-01', expiryDate: '2028-12-31', qty: 5, cost: 350000 }]
        });

        // Total order 750,000. Split: 200,000 Wallet + 250,000 Cash + 300,000 Card
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 750000 }],
            payments: [
                { method: 'WALLET', amount: 200000 },
                { method: 'CASH', amount: 250000 },
                { method: 'CARD', amount: 300000 }
            ]
        });

        assert.ok(order.orderId);

        // Wallet balance completely consumed (200,000 - 200,000 = 0)
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 0);

        // Verify GL accounts:
        // Dr 205 (Wallet Liability) 200K, Dr 101 (Cash) 250K, Dr 102 (Bank) 300K = Cr 401 (Revenue) 750K
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '101'), 250000);
        assert.equal(getAccountNetBalance(db, '102'), 300000);
        assert.equal(getAccountNetBalance(db, '205'), -200000);
        assert.equal(getAccountNetBalance(db, '401'), 750000);
    });
});
