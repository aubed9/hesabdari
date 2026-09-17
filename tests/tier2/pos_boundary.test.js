/**
 * Tier 2: Boundary & Corner Cases — POS Checkout Engine
 * Minimum 5 tests covering zero amounts, 100% discounts, over-discount capping, and payment edge cases
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

describe('Tier 2: POS Boundary & Corner Cases', () => {
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

    test('T2-POS-BND-1: 100% discount reduces total amount to 0 with balanced Dr 403 Discount / Cr 401 Revenue', () => {
        const prod = seedProductWithBatches(db, {
            name: 'هدایت‌کننده مژه رایگان (هدیه جشنواره)',
            sku: 'GFT-MSK-01',
            barcode: '6266000000001',
            sellingPrice: 150000,
            batches: [{ batchNumber: 'LOT-GFT-01', expiryDate: '2028-12-31', qty: 10, cost: 60000 }]
        });

        // 100% discount: subtotal 150,000 - discount 150,000 = 0
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 150000 }],
            discountAmount: 150000,
            discountReason: 'هدیه رایگان افتتاحیه',
            payments: []
        });

        assert.ok(order.orderId);
        assert.equal(order.totalAmount, 0);

        // Check order record
        const orderRow = db.prepare(`SELECT total_amount, subtotal, discount_amount, payment_status FROM orders WHERE id = ?`).get(order.orderId);
        assert.equal(orderRow.total_amount, 0);
        assert.equal(orderRow.discount_amount, 150000);
        assert.equal(orderRow.payment_status, 'PAID');

        // Check GL: Dr 403 (Discount) 150K, Cr 401 (Revenue) 150K
        assertGeneralLedgerBalanced(db);
        // Contra-revenue has negative net_balance when debited
        assert.equal(getAccountNetBalance(db, '403'), -150000, 'Discount contra-revenue account 403 must have debit of 150,000');
        assert.equal(getAccountNetBalance(db, '401'), 150000, 'Gross revenue account 401 must be credited 150,000');
    });

    test('T2-POS-BND-2: Substantial partial discount (50%) accurately splits revenue and discount in GL', () => {
        const prod = seedProductWithBatches(db, {
            name: 'سوهان ناخن کریستالی',
            sku: 'NAIL-FL-01',
            barcode: '6266000000002',
            sellingPrice: 100000,
            batches: [{ batchNumber: 'LOT-NFL-01', expiryDate: '2028-12-31', qty: 10, cost: 40000 }]
        });

        // Subtotal = 100,000, discount = 40,000 -> payable = 60,000
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 100000 }],
            discountAmount: 40000,
            discountReason: 'کوپن تخفیف ۴۰ درصدی',
            payments: [{ method: 'CARD', amount: 60000 }]
        });

        assert.equal(order.totalAmount, 60000);
        assert.equal(order.discountAmount, 40000);

        // GL balanced: Dr 102 (Bank) 60K + Dr 403 (Discount) 40K = Cr 401 (Revenue) 100K
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '102'), 60000);
        assert.equal(getAccountNetBalance(db, '403'), -40000);
        assert.equal(getAccountNetBalance(db, '401'), 100000);
    });

    test('T2-POS-BND-3: Exact multi-item split payment with zero remaining balance achieves PAID status', () => {
        const prod1 = seedProductWithBatches(db, {
            name: 'فوم پاک‌کننده آرایش',
            sku: 'FOM-CLN-01',
            barcode: '6266000000003',
            sellingPrice: 200000,
            batches: [{ batchNumber: 'LOT-FOM-01', expiryDate: '2028-06-30', qty: 5, cost: 100000 }]
        });

        const prod2 = seedProductWithBatches(db, {
            name: 'پد پنبه‌ای آرایش پاک‌کن',
            sku: 'PAD-COT-01',
            barcode: '6266000000009',
            sellingPrice: 50000,
            batches: [{ batchNumber: 'LOT-PAD-01', expiryDate: '2029-01-01', qty: 20, cost: 20000 }]
        });

        // Total: 250,000. Split: 100,000 Cash + 150,000 Card
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [
                { variantId: prod1.variantId, quantity: 1, unitPrice: 200000 },
                { variantId: prod2.variantId, quantity: 1, unitPrice: 50000 }
            ],
            payments: [
                { method: 'CASH', amount: 100000 },
                { method: 'CARD', amount: 150000 }
            ]
        });

        const orderRow = db.prepare(`SELECT payment_status, total_amount FROM orders WHERE id = ?`).get(order.orderId);
        assert.equal(orderRow.payment_status, 'PAID');
        assert.equal(orderRow.total_amount, 250000);

        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '101'), 100000);
        assert.equal(getAccountNetBalance(db, '102'), 150000);
    });

    test('T2-POS-BND-4: Missing payments parameter automatically defaults to CARD payment for full total amount', () => {
        const prod = seedProductWithBatches(db, {
            name: 'برق لب اکلیلی براق',
            sku: 'LIP-GLS-01',
            barcode: '6266000000004',
            sellingPrice: 120000,
            batches: [{ batchNumber: 'LOT-GLS-01', expiryDate: '2027-12-31', qty: 5, cost: 50000 }]
        });

        // No payments array provided
        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 120000 }]
        });

        const payments = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).all(order.orderId);
        assert.equal(payments.length, 1);
        assert.equal(payments[0].payment_method, 'CARD');
        assert.equal(payments[0].amount, 120000);

        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '102'), 120000, 'Bank Account 102 must be debited 120,000');
    });

    test('T2-POS-BND-5: Proforma order creates zero stock deduction and zero GL journal entry', () => {
        const prod = seedProductWithBatches(db, {
            name: 'عطر مینیاتوری جیبی',
            sku: 'PRF-MIN-01',
            barcode: '6266000000005',
            sellingPrice: 300000,
            batches: [{ batchNumber: 'LOT-PRF-01', expiryDate: '2028-12-31', qty: 10, cost: 150000 }]
        });

        const order = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            orderType: 'PROFORMA',
            items: [{ variantId: prod.variantId, quantity: 3, unitPrice: 300000 }]
        });

        assert.equal(order.isProforma, true);

        // Batch quantity must remain untouched at 10
        const batch = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(batch.quantity, 10);
        assert.equal(batch.reserved_quantity, 0);

        // No POS_SALE journal entry for proforma
        const jEntry = db.prepare(`SELECT * FROM journal_entries WHERE reference_type = 'POS_SALE' AND reference_id = ?`).get(order.orderId);
        assert.equal(jEntry, undefined, 'Proforma order must not generate accounting journals');

        assertGeneralLedgerBalanced(db);
    });
});
