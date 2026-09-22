// Tier 1 Test: Synchronization of Sales, COGS & Gross Profit
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    assertGeneralLedgerBalanced
} = require('../helpers/testDb');

describe('Tier 1: Profit & Sales Synchronization (COGS Deduction Fix)', () => {
    let db, fixtures, posService, biService, reportService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        posService = require('../../services/posService');
        biService = require('../../services/biService');
        reportService = require('../../services/reportService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T1-COGS-1: POS sale records accurate total_cost and debits Account 501', () => {
        const prod = seedProductWithBatches(db, {
            name: 'کرم پودر مات ۲۴ ساعته',
            sellingPrice: 150000,
            batches: [{ batchNumber: 'BATCH-MATT-01', expiryDate: '2028-01-01', qty: 20, cost: 80000 }]
        });

        const qty = 2;
        const checkoutRes = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'SALE',
            channel: 'STORE_POS',
            items: [{ variantId: prod.variantId, quantity: qty, unitPrice: 150000 }],
            payments: [{ method: 'CASH', amount: 300000 }],
            discountAmount: 0
        });

        assert.ok(checkoutRes.orderId, 'Order must be created');
        assert.ok(checkoutRes.totalCogs > 0, 'Total COGS must be > 0');
        assert.equal(checkoutRes.totalCogs, 80000 * qty, 'Total COGS must equal purchase_price * quantity');

        // Verify order in database
        const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(checkoutRes.orderId);
        assert.equal(order.total_amount, 300000);
        assert.equal(order.total_cost, 160000);
        assert.ok(order.total_amount > order.total_cost, 'Sales amount must exceed cost for positive profit');

        // Verify journal entry for COGS (501) and Inventory (103)
        const journal = db.prepare(`SELECT * FROM journal_entries WHERE reference_type = 'POS_SALE' AND reference_id = ?`).get(order.id);
        assert.ok(journal, 'Automatic journal entry must be created');

        const lines = db.prepare(`
            SELECT jl.*, coa.code 
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            WHERE jl.journal_entry_id = ?
        `).all(journal.id);

        const cogsLine = lines.find(l => l.code === '501');
        assert.ok(cogsLine, 'COGS (501) journal line must exist');
        assert.equal(cogsLine.debit, 160000, 'COGS debit must equal total cost');

        const invLine = lines.find(l => l.code === '103' && l.credit > 0);
        assert.ok(invLine, 'Inventory (103) credit line must exist');
        assert.equal(invLine.credit, 160000, 'Inventory credit must equal total cost');

        assertGeneralLedgerBalanced(db);
    });

    test('T1-COGS-2: Executive Dashboard accurately calculates grossProfit = sales - cogs (grossProfit < sales)', () => {
        const prod = seedProductWithBatches(db, {
            name: 'رژ لب جامد مخملی',
            sellingPrice: 120000,
            batches: [{ batchNumber: 'BATCH-LIP-01', expiryDate: '2028-01-01', qty: 10, cost: 50000 }]
        });

        posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'SALE',
            channel: 'STORE_POS',
            items: [{ variantId: prod.variantId, quantity: 2, unitPrice: 120000 }],
            payments: [{ method: 'CASH', amount: 240000 }],
            discountAmount: 0
        });

        const dashboard = biService.getExecutiveDashboard('ALL');
        assert.ok(dashboard.period, 'Period data must exist');
        assert.equal(dashboard.period.sales, 240000, 'Sales must equal 240,000');
        assert.equal(dashboard.period.cogs, 100000, 'COGS must equal 100,000');
        assert.equal(dashboard.period.grossProfit, 140000, 'Gross profit must equal 140,000');
        assert.ok(dashboard.period.grossProfit < dashboard.period.sales, 'Gross profit must be strictly less than sales');
    });

    test('T1-COGS-3: Executive Dashboard Excel export includes non-zero COGS and accurate Gross Profit', () => {
        const prod = seedProductWithBatches(db, {
            name: 'ریمل حجم‌دهنده ضدآب',
            sellingPrice: 200000,
            batches: [{ batchNumber: 'BATCH-RIM-01', expiryDate: '2028-01-01', qty: 10, cost: 90000 }]
        });

        posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'SALE',
            channel: 'STORE_POS',
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 200000 }],
            payments: [{ method: 'CASH', amount: 200000 }],
            discountAmount: 0
        });

        const csv = biService.generateExecutiveDashboardExcelCsv('ALL');
        assert.ok(csv.includes('بهای تمام شده (COGS)'), 'CSV must include COGS column');
        assert.ok(csv.includes('سود ناخالص فاکتور (تومان)'), 'CSV must include Gross Profit column');
        assert.ok(csv.includes('90000'), 'CSV must include unit cost 90,000');
        assert.ok(csv.includes('110000'), 'CSV must include profit 110,000');
    });

    test('T1-COGS-4: Daily Z-Report and Category Performance report accurate COGS and margin', () => {
        const prod = seedProductWithBatches(db, {
            name: 'خط چشم ماژیکی ضدآب',
            sellingPrice: 90000,
            batches: [{ batchNumber: 'BATCH-EYE-01', expiryDate: '2028-01-01', qty: 10, cost: 35000 }]
        });

        posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'SALE',
            channel: 'STORE_POS',
            items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 90000 }],
            payments: [{ method: 'CASH', amount: 90000 }],
            discountAmount: 0
        });

        const zReport = reportService.getDailyZReport();
        assert.ok(zReport.salesSummary, 'Z-report must contain salesSummary');
        assert.equal(zReport.salesSummary.netSales, 90000);
        assert.equal(zReport.salesSummary.totalCogs, 35000);
        assert.equal(zReport.salesSummary.grossProfit, 55000);

        const categories = reportService.getCategoryPerformance();
        assert.ok(Array.isArray(categories), 'Category performance must be an array');
        const cat = categories.find(c => c.revenue > 0);
        assert.ok(cat, 'Active category must exist');
        assert.equal(cat.grossProfit, cat.revenue - cat.cogs);
    });
});
