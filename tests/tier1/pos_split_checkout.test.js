/**
 * Tier 1: Feature Coverage — POS Checkout & Split Payments Engine
 * Minimum 5 tests covering split payment routing, GL postings, wallet liability, and session management
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

describe('Tier 1: POS Checkout & Split Payments Engine', () => {
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

    test('T1-POS-SPLIT-1: Split Cash and Card payment routes to Account 101 and 102 with balanced GL', () => {
        const prod = seedProductWithBatches(db, {
            name: 'پالت سایه چشم ۱۲ رنگ نود',
            sellingPrice: 600000,
            batches: [{ batchNumber: 'LOT-PAL-01', expiryDate: '2027-12-31', qty: 10, cost: 300000 }]
        });

        // Total order amount: 600,000. Split: 200,000 Cash + 400,000 Card
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 600000 }],
            payments: [
                { method: 'CASH', amount: 200000 },
                { method: 'CARD', amount: 400000, cardDigits: '4589' }
            ]
        });

        assert.ok(order.orderId);
        assert.equal(order.totalAmount, 600000);

        // Verify payments in database
        const payments = db.prepare(`SELECT * FROM payments WHERE order_id = ? ORDER BY amount ASC`).all(order.orderId);
        assert.equal(payments.length, 2);
        assert.equal(payments[0].payment_method, 'CASH');
        assert.equal(payments[0].amount, 200000);
        assert.equal(payments[1].payment_method, 'CARD');
        assert.equal(payments[1].amount, 400000);

        // Verify GL accounts: Dr 101 (Cash) 200K, Dr 102 (Bank) 400K, Cr 401 (Revenue) 600K
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '101'), 200000, 'Cash Account 101 must increase by 200,000');
        assert.equal(getAccountNetBalance(db, '102'), 400000, 'Bank Account 102 must increase by 400,000');
        assert.equal(getAccountNetBalance(db, '401'), 600000, 'Revenue Account 401 must increase by 600,000');
    });

    test('T1-POS-SPLIT-2: Split payment with Customer Wallet debits Account 205 and reduces customer wallet balance', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم آبرسان عمیق هیالورونیک',
            sellingPrice: 400000,
            batches: [{ batchNumber: 'LOT-HYA-01', expiryDate: '2027-11-30', qty: 10, cost: 200000 }]
        });

        const customer = seedCustomer(db, {
            fullName: 'نیلوفر پارسا',
            mobile: '09121234567',
            walletBalance: 300000
        });

        // Total order: 400,000. Split: 250,000 Wallet + 150,000 Card
        const order = posService.createOrder({
            customerId: customer.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 400000 }],
            payments: [
                { method: 'WALLET', amount: 250000 },
                { method: 'CARD', amount: 150000 }
            ]
        });

        assert.ok(order.orderId);

        // Customer wallet balance reduced from 300,000 to 50,000
        const custAfter = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customer.id);
        assert.equal(custAfter.wallet_balance, 50000);

        // Wallet transaction logged
        const wTx = db.prepare(`SELECT * FROM wallet_transactions WHERE customer_id = ? AND order_id = ?`).get(customer.id, order.orderId);
        assert.ok(wTx);
        assert.equal(wTx.type, 'WITHDRAW');
        assert.equal(wTx.amount, -250000);

        // GL check: Dr 205 (Wallet Liability) 250K, Dr 102 (Bank) 150K, Cr 401 (Revenue) 400K
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '205'), -250000, 'Customer Wallet Liability 205 must be debited 250,000');
        assert.equal(getAccountNetBalance(db, '102'), 150000, 'Bank Account 102 must be debited 150,000');
    });

    test('T1-POS-SPLIT-3: Cheque payment routes to Account 106 Notes Receivable', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ست براش حرفه‌ای ۱۲ تکه',
            sellingPrice: 850000,
            batches: [{ batchNumber: 'LOT-BRS-01', expiryDate: '2028-06-30', qty: 5, cost: 450000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 850000 }],
            payments: [
                { method: 'CHEQUE', amount: 850000, ref: 'CHQ-889900' }
            ]
        });

        assert.ok(order.orderId);

        // Check journal lines for Cheque payment
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '106'), 850000, 'Account 106 Notes Receivable must be debited 850,000');
    });

    test('T1-POS-SPLIT-4: Order payment status derivation sets PAID, PARTIAL, and UNPAID correctly', () => {
        const prod = seedProductWithBatches(db, {
            name: 'تینت لب بادوام',
            sellingPrice: 150000,
            batches: [{ batchNumber: 'LOT-TNT-01', expiryDate: '2027-09-30', qty: 20, cost: 70000 }]
        });

        // 1. Full payment -> PAID
        const fullOrder = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 150000 }],
            payments: [{ method: 'CARD', amount: 150000 }]
        });
        const fullRow = db.prepare(`SELECT payment_status FROM orders WHERE id = ?`).get(fullOrder.orderId);
        assert.equal(fullRow.payment_status, 'PAID');

        // 2. Partial payment -> PARTIAL
        const partOrder = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 150000 }],
            payments: [{ method: 'CASH', amount: 100000 }]
        });
        const partRow = db.prepare(`SELECT payment_status FROM orders WHERE id = ?`).get(partOrder.orderId);
        assert.equal(partRow.payment_status, 'PARTIAL');

        // 3. Proforma order -> UNPAID
        const proforma = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            orderType: 'PROFORMA',
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 150000 }]
        });
        const profRow = db.prepare(`SELECT payment_status FROM orders WHERE id = ?`).get(proforma.orderId);
        assert.equal(profRow.payment_status, 'UNPAID');
    });

    test('T1-POS-SPLIT-5: Cash sales accumulate in cash session and close with variance reconciliation', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ژل شستشوی صورت پوست چرب',
            sellingPrice: 180000,
            batches: [{ batchNumber: 'LOT-GEL-01', expiryDate: '2027-10-31', qty: 10, cost: 90000 }]
        });

        // Process cash sale
        posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 180000 }],
            payments: [{ method: 'CASH', amount: 360000 }]
        });

        // Inspect active session
        const active = posService.getActiveCashSession();
        assert.equal(active.id, fixtures.cashSessionId);
        assert.equal(active.total_cash_sales, 360000);

        // Expected balance: opening 5,000,000 + 360,000 = 5,360,000
        // Cashier counts 5,350,000 (shortage of 10,000)
        const closeResult = posService.closeCashSession(fixtures.cashSessionId, 5350000, '۱۰ هزار تومان کسری پول خرد');
        assert.equal(closeResult.expectedBalance, 5360000);
        assert.equal(closeResult.actualBalance, 5350000);
        assert.equal(closeResult.variance, -10000);

        const closedSession = db.prepare(`SELECT status, actual_balance, variance FROM cash_sessions WHERE id = ?`).get(fixtures.cashSessionId);
        assert.equal(closedSession.status, 'CLOSED');
        assert.equal(closedSession.actual_balance, 5350000);
        assert.equal(closedSession.variance, -10000);
    });

    test('T1-POS-SPLIT-6: 3-way Split payment (Cash + POS Card + Card-to-Card with tracking reference) balances GL and records tender breakdown', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم پودر مات ۲۴ ساعته لورآل',
            sellingPrice: 1000000,
            batches: [{ batchNumber: 'LOT-FDN-01', expiryDate: '2028-05-20', qty: 5, cost: 550000 }]
        });

        // 3-way split checkout:
        // Cash: 300,000 | POS Card: 500,000 | Card-to-Card: 200,000
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 1000000 }],
            payments: [
                { method: 'CASH', amount: 300000 },
                { method: 'CARD', amount: 500000, cardDigits: '7788' },
                { method: 'CARD_TO_CARD', amount: 200000, ref: 'TR-BANK-998811' }
            ]
        });

        assert.ok(order.orderId);
        assert.equal(order.totalAmount, 1000000);

        // Verify order payment status
        const ordRow = db.prepare(`SELECT payment_status, status FROM orders WHERE id = ?`).get(order.orderId);
        assert.equal(ordRow.payment_status, 'PAID');
        assert.equal(ordRow.status, 'COMPLETED');

        // Verify 3 distinct payment records in payments table
        const payments = db.prepare(`SELECT * FROM payments WHERE order_id = ? ORDER BY amount ASC`).all(order.orderId);
        assert.equal(payments.length, 3);

        const transferPayment = payments.find(p => p.amount === 200000);
        assert.ok(transferPayment);
        assert.equal(transferPayment.payment_method, 'ONLINE');
        assert.ok(transferPayment.reference_code.includes('TR-BANK-998811'));

        const cashPayment = payments.find(p => p.amount === 300000);
        assert.ok(cashPayment);
        assert.equal(cashPayment.payment_method, 'CASH');

        const cardPayment = payments.find(p => p.amount === 500000);
        assert.ok(cardPayment);
        assert.equal(cardPayment.payment_method, 'CARD');
        assert.equal(cardPayment.card_last_digits, '7788');

        // Verify General Ledger is completely balanced: SUM(debit) == SUM(credit)
        assertGeneralLedgerBalanced(db);

        // Dr Account 101 (Cash): +300,000
        assert.equal(getAccountNetBalance(db, '101'), 300000, 'Cash Account 101 must increase by 300,000');

        // Dr Account 102 (Bank): +700,000 (500k card + 200k card-to-card)
        assert.equal(getAccountNetBalance(db, '102'), 700000, 'Bank Account 102 must increase by 700,000 (Card + Card-to-Card)');

        // Cr Account 401 (Revenue): +1,000,000
        assert.equal(getAccountNetBalance(db, '401'), 1000000, 'Revenue Account 401 must increase by 1,000,000');

        // Check journal lines Persian descriptions
        const jLines = db.prepare(`
            SELECT jl.description, jl.debit, jl.credit 
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.reference_type = 'POS_SALE' AND je.reference_id = ?
        `).all(order.orderId);

        const hasCashDesc = jLines.some(l => l.description.includes('دریافت نقدی (صندوق)'));
        const hasCardDesc = jLines.some(l => l.description.includes('دریافت کارتخوان (پوز)'));
        const hasTransferDesc = jLines.some(l => l.description.includes('دریافت کارت به کارت (انتقال بانکی)'));

        assert.ok(hasCashDesc, 'Must have Persian description for Cash tender');
        assert.ok(hasCardDesc, 'Must have Persian description for Card tender');
        assert.ok(hasTransferDesc, 'Must have Persian description for Card-to-Card tender');
    });
});
