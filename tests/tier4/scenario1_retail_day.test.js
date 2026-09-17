/**
 * Tier 4: Real-World Application Scenarios — Scenario 1: Complete Retail Business Day
 * Simulates morning drawer opening -> POS sales -> returns -> session close & Z-report reconciliation
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

describe('Tier 4: Scenario 1 — Complete Retail Business Day', () => {
    let db, fixtures, posService, accountingService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        posService = require('../../services/posService');
        accountingService = require('../../services/accountingService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('Scenario 1: Retail day shift workflow: opening float -> sales -> returns -> closing Z-report', () => {
        // --- 1. MORNING: Inspect active open drawer session with 5,000,000 Toman opening float ---
        const activeSession = posService.getActiveCashSession();
        assert.ok(activeSession);
        assert.equal(activeSession.opening_balance, 5000000);
        assert.equal(activeSession.status, 'OPEN');

        // Products for the day
        const prodLip = seedProductWithBatches(db, {
            name: 'رژ لب سوپر استی میبلین',
            sku: 'MAY-LIP-01',
            barcode: '6269101001001',
            sellingPrice: 300000,
            batches: [{ batchNumber: 'LOT-MAY-01', expiryDate: '2028-12-31', qty: 20, cost: 160000 }]
        });

        const prodFnd = seedProductWithBatches(db, {
            name: 'کرم پودر فیت می میبلین',
            sku: 'MAY-FND-01',
            barcode: '6269101001002',
            sellingPrice: 500000,
            batches: [{ batchNumber: 'LOT-MAY-02', expiryDate: '2028-12-31', qty: 15, cost: 280000 }]
        });

        // --- 2. MIDDAY TRANSACTIONS ---
        // Transaction 1: Customer A pays 300,000 CASH for 1 Lipstick
        const sale1 = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: activeSession.id,
            items: [{ variantId: prodLip.variantId, quantity: 1, unitPrice: 300000 }],
            payments: [{ method: 'CASH', amount: 300000 }]
        });
        assert.ok(sale1.orderId);

        // Transaction 2: Customer B pays 500,000 CARD for 1 Foundation
        const sale2 = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: activeSession.id,
            items: [{ variantId: prodFnd.variantId, quantity: 1, unitPrice: 500000 }],
            payments: [{ method: 'CARD', amount: 500000 }]
        });
        assert.ok(sale2.orderId);

        // Transaction 3: Customer C pays split 200,000 CASH + 600,000 CARD for 1 Lipstick + 1 Foundation
        const sale3 = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: activeSession.id,
            items: [
                { variantId: prodLip.variantId, quantity: 1, unitPrice: 300000 },
                { variantId: prodFnd.variantId, quantity: 1, unitPrice: 500000 }
            ],
            payments: [
                { method: 'CASH', amount: 200000 },
                { method: 'CARD', amount: 600000 }
            ]
        });
        assert.ok(sale3.orderId);

        // Transaction 4: Customer A returns the Lipstick (unopened, restockable, refund via CARD_REVERSAL)
        const orderItem1 = db.prepare(`SELECT id FROM order_items WHERE order_id = ?`).get(sale1.orderId);
        const ret = posService.processReturn({
            originalOrderId: sale1.orderId,
            employeeId: fixtures.users.cashier.id,
            refundMethod: 'CARD_REVERSAL',
            reason: 'انصراف مشتری',
            items: [{ orderItemId: orderItem1.id, quantity: 1, isRestockable: true, batchId: prodLip.batchIds[0] }]
        });
        assert.ok(ret.returnId);

        // --- 3. EVENING: Cash Drawer Session Close & Z-Report ---
        // Total cash sales during shift = 300,000 (sale1) + 200,000 (sale3) = 500,000
        // Expected drawer cash = Opening 5,000,000 + Cash sales 500,000 = 5,500,000
        const sessionReport = posService.getActiveCashSession();
        assert.equal(sessionReport.total_cash_sales, 500000);
        assert.equal(sessionReport.total_card_sales, 1100000); // 500k (sale2) + 600k (sale3)

        // Cashier counts 5,500,000 exact cash
        const closeResult = posService.closeCashSession(activeSession.id, 5500000, 'پایان شیفت عصر - تطابق کامل صندوق');
        assert.equal(closeResult.expectedBalance, 5500000);
        assert.equal(closeResult.actualBalance, 5500000);
        assert.equal(closeResult.variance, 0, 'Zero cash drawer variance on balanced day');

        // Session status must be CLOSED
        const closed = db.prepare(`SELECT status, variance FROM cash_sessions WHERE id = ?`).get(activeSession.id);
        assert.equal(closed.status, 'CLOSED');
        assert.equal(closed.variance, 0);

        // --- 4. END OF DAY AUDIT: Global GL Invariants ---
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '101'), 500000, 'Net cash intake in GL Account 101 must be 500,000');
    });
});
