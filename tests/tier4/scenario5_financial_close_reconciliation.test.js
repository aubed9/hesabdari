/**
 * Tier 4: Real-World Application Scenarios — Scenario 5: Full Monthly Financial Close & Cross-Domain Reconciliation
 * Simulates capital injection -> multi-supplier procurement -> retail sales & wallet settlement ->
 * operating overhead -> write-offs & stock shortage -> financial statements (P&L, Balance Sheet) ->
 * monthly period close to Retained Earnings (302) -> automated reconciliation scan (CRITICAL: 0)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedSupplier,
    seedCustomer,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

describe('Tier 4: Scenario 5 — Financial Close & Cross-Domain Reconciliation', () => {
    let db, fixtures, accountingService, procurementService, posService, inventoryService, crmService, reconciliationService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        accountingService = require('../../services/accountingService');
        procurementService = require('../../services/procurementService');
        posService = require('../../services/posService');
        inventoryService = require('../../services/inventoryService');
        crmService = require('../../services/crmService');
        reconciliationService = require('../../services/reconciliationService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('Scenario 5: Full monthly operating cycle, write-downs, financial close, and deep GL reconciliation', () => {
        // --- STEP 1: CAPITAL INJECTION & FINANCIAL FOUNDATION ---
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
        const accCapital = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        // Founder deposits 100,000,000 Toman: 80M Bank, 20M Cash
        accountingService.recordJournalEntry({
            entryNumber: 'JE-CAP-INIT',
            date: '2026-09-01',
            description: 'تامین سرمایه نقدی اولیه توسط موسس فروشگاه',
            lines: [
                { accountId: accBank, debit: 80000000, credit: 0, description: 'واریز به حساب جاری بانک' },
                { accountId: accCash, debit: 20000000, credit: 0, description: 'شارژ تنخواه و صندوق نقد' },
                { accountId: accCapital, debit: 0, credit: 100000000, description: 'سرمایه ثبتی اولیه' }
            ],
            createdBy: fixtures.users.accountant.id
        });

        // Update bank account balance record to match
        db.prepare(`UPDATE bank_accounts SET balance = balance + 80000000 WHERE id = ?`).run(fixtures.bankAccounts[0]);

        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '102'), 80000000);
        assert.equal(getAccountNetBalance(db, '101'), 20000000);
        assert.equal(getAccountNetBalance(db, '301'), 100000000);

        // --- STEP 2: MULTI-SUPPLIER PROCUREMENT & AP SUB-LEDGER ---
        const supplier1 = seedSupplier(db, { name: 'شرکت واردات عطر پاریس' });
        const supplier2 = seedSupplier(db, { name: 'تولیدی محصولات بهداشتی آریا' });

        const prodPerfume = seedProductWithBatches(db, {
            name: 'عطر زنانه شنل چنس او تندر',
            sku: 'CHL-CHN-01',
            barcode: '6269105001001',
            sellingPrice: 900000,
            batches: [] // empty
        });

        const prodLotion = seedProductWithBatches(db, {
            name: 'لوسیون بدن آبرسان آریا',
            sku: 'ARY-LOT-01',
            barcode: '6269105001002',
            sellingPrice: 220000,
            batches: [] // empty
        });

        // PO 1: 20 perfumes @ 500,000 cost = 10,000,000 Toman
        const po1 = procurementService.createPurchaseOrder({
            supplierId: supplier1.id,
            warehouseId: fixtures.warehouseId,
            createdBy: fixtures.users.manager.id,
            items: [
                { variantId: prodPerfume.variantId, batchNumber: 'LOT-CHL-01', expiryDate: '2028-12-31', quantity: 20, unitCost: 500000 }
            ]
        });

        // PO 2: 50 lotions @ 100,000 cost = 5,000,000 Toman
        const po2 = procurementService.createPurchaseOrder({
            supplierId: supplier2.id,
            warehouseId: fixtures.warehouseId,
            createdBy: fixtures.users.manager.id,
            items: [
                { variantId: prodLotion.variantId, batchNumber: 'LOT-ARY-01', expiryDate: '2027-10-31', quantity: 50, unitCost: 100000 }
            ]
        });

        assert.equal(po1.totalAmount, 10000000);
        assert.equal(po2.totalAmount, 5000000);

        // Supplier 1 paid in full (10,000,000) from Bank
        procurementService.recordSupplierPayment({
            supplierId: supplier1.id,
            purchaseOrderId: po1.poId,
            amount: 10000000,
            paymentMethod: 'BANK',
            referenceCode: 'PAY-SUP1-FULL',
            createdBy: fixtures.users.accountant.id
        });

        // Supplier 2 paid partially (2,000,000) from Bank (3,000,000 remains open)
        procurementService.recordSupplierPayment({
            supplierId: supplier2.id,
            purchaseOrderId: po2.poId,
            amount: 2000000,
            paymentMethod: 'BANK',
            referenceCode: 'PAY-SUP2-PARTIAL',
            createdBy: fixtures.users.accountant.id
        });

        // Invariant: GL Account 201 AP must be strictly 3,000,000
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '201'), 3000000, 'GL 201 Accounts Payable must be 3,000,000');

        // Supplier sub-ledger for Supplier 2 must match exactly 3,000,000
        const sup2Ledger = procurementService.getSupplierLedger(supplier2.id);
        assert.equal(sup2Ledger.currentPayableBalance, 3000000);

        // --- STEP 3: RETAIL SALES & SPLIT TENDER CHECKOUT ---
        const customer1 = seedCustomer(db, { fullName: 'رویا مقدسی', mobile: '09123334455', walletBalance: 0 });
        const customer2 = seedCustomer(db, { fullName: 'امیرحسین رضایی', mobile: '09126667788', walletBalance: 0 });

        // Customer 1 deposits 1,000,000 to wallet
        crmService.adjustWallet(customer1.id, {
            amount: 1000000,
            type: 'DEPOSIT',
            note: 'شارژ کیف پول اینترنتی'
        });

        // Customer 1 buys 2 perfumes @ 900,000 = 1,800,000 total
        // Paid with 1,000,000 WALLET + 800,000 CARD
        const sale1 = posService.createOrder({
            customerId: customer1.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodPerfume.variantId, quantity: 2, unitPrice: 900000 }],
            payments: [
                { method: 'WALLET', amount: 1000000 },
                { method: 'CARD', amount: 800000 }
            ]
        });
        assert.ok(sale1.orderId);

        // Customer 2 buys 10 lotions @ 220,000 = 2,200,000 total paid via CARD
        const sale2 = posService.createOrder({
            customerId: customer2.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prodLotion.variantId, quantity: 10, unitPrice: 220000 }],
            payments: [{ method: 'CARD', amount: 2200000 }]
        });
        assert.ok(sale2.orderId);

        // --- STEP 4: OPERATING EXPENSES ---
        // Rent: 8,000,000
        accountingService.createExpense({
            category: 'RENT',
            amount: 8000000,
            bankAccountId: fixtures.bankAccounts[0],
            description: 'اجاره بهای ماهانه فروشگاه آرایشی',
            paidTo: 'مالک مجتمع تجاری',
            createdBy: fixtures.users.accountant.id
        });

        // Salary: 6,000,000
        accountingService.createExpense({
            category: 'SALARY',
            amount: 6000000,
            bankAccountId: fixtures.bankAccounts[0],
            description: 'حقوق و دستمزد پرسنل فروشگاه',
            paidTo: 'پرسنل و صندوق‌داران',
            createdBy: fixtures.users.accountant.id
        });

        // Utilities: 1,000,000
        accountingService.createExpense({
            category: 'ELECTRICITY',
            amount: 1000000,
            bankAccountId: fixtures.bankAccounts[0],
            description: 'قبوض برق و سیستم سرمایش',
            paidTo: 'شرکت توزیع برق',
            createdBy: fixtures.users.accountant.id
        });

        // --- STEP 5: WRITE-OFFS & PHYSICAL INVENTORY ADJUSTMENTS ---
        // 1 perfume converted to store tester (Cost: 500,000)
        // Dr 604 Tester Expense / Cr 103 Inventory
        const tester = inventoryService.convertToTester({
            variantId: prodPerfume.variantId,
            batchId: po1.batchIds[0],
            quantity: 1,
            employeeId: fixtures.users.manager.id,
            note: 'تستر ویترین فروشگاه برای تست مشتریان'
        });
        assert.equal(tester.totalCost, 500000);

        // Stock count adjustment: 1 lotion bottle was damaged / missing
        // System had: 50 received - 10 sold = 40
        // Counted: 39 -> 1 unit shortage (Cost: 100,000)
        // Dr 608 Variance Expense / Cr 103 Inventory
        const countId = inventoryService.createStockCount(fixtures.warehouseId, fixtures.users.stockkeeper.id, 'انبارگردانی پایان دوره شهریور');
        const countItem = db.prepare(`SELECT id FROM stock_count_items WHERE stock_count_id = ? AND batch_id = ?`).get(countId, po2.batchIds[0]);
        inventoryService.updateStockCountItem(countItem.id, 39);
        const finalCount = inventoryService.finalizeStockCount(countId, fixtures.users.manager.id);
        assert.equal(finalCount.totalCostVariance, -100000);

        // --- STEP 6: FINANCIAL STATEMENTS COMPILED BEFORE PERIOD CLOSE ---
        assertGeneralLedgerBalanced(db);

        const pnlBeforeClose = accountingService.getProfitAndLoss();
        assert.equal(pnlBeforeClose.grossSales, 4000000); // 1.8M + 2.2M
        assert.equal(pnlBeforeClose.cogs, 2000000); // (2*500k) + (10*100k)
        assert.equal(pnlBeforeClose.grossProfit, 2000000);
        // Operating Expenses: 8M (Rent) + 6M (Salary) + 1M (Utility) + 500k (Tester) + 100k (Variance) = 15,600,000
        assert.equal(pnlBeforeClose.totalExpenses, 15600000);
        assert.equal(pnlBeforeClose.netProfit, -13600000, 'Net loss before close should be -13,600,000');

        const bsBeforeClose = accountingService.getBalanceSheet();
        assert.equal(bsBeforeClose.isBalanced, true, 'Balance Sheet must balance before period close');

        // --- STEP 7: MONTHLY ACCOUNTING PERIOD CLOSE TO RETAINED EARNINGS (302) ---
        // Transfer all nominal P&L accounts to Account 302 (Retained Earnings)
        const accRev = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get().id;
        const accCogs = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '501'`).get().id;
        const accRent = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '601'`).get().id;
        const accSalary = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '602'`).get().id;
        const accTesterExp = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '604'`).get().id;
        const accUtil = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '606'`).get().id;
        const accVar = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '608'`).get().id;
        const accRetained = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '302'`).get().id;

        // Debit revenues to zero them out, Credit expenses to zero them out, balance to 302
        const closeResult = accountingService.recordJournalEntry({
            entryNumber: 'JE-CLOSE-M09-2026',
            date: '2026-09-30',
            description: 'سند بستن حساب‌های سود و زیانی پایان دوره ماهانه شهریور ۱۴۰۵',
            lines: [
                { accountId: accRev, debit: 4000000, credit: 0, description: 'بستن حساب درآمد فروش' },
                { accountId: accCogs, debit: 0, credit: 2000000, description: 'بستن بهای تمام شده' },
                { accountId: accRent, debit: 0, credit: 8000000, description: 'بستن هزینه اجاره' },
                { accountId: accSalary, debit: 0, credit: 6000000, description: 'بستن هزینه حقوق' },
                { accountId: accTesterExp, debit: 0, credit: 500000, description: 'بستن هزینه تستر' },
                { accountId: accUtil, debit: 0, credit: 1000000, description: 'بستن قبوض' },
                { accountId: accVar, debit: 0, credit: 100000, description: 'بستن کسری انبارگردانی' },
                // Net loss = 13,600,000 -> Debit Retained Earnings (302) to balance
                { accountId: accRetained, debit: 13600000, credit: 0, description: 'انتقال زیان خالص دوره به سود (زیان) انباشته' }
            ],
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(closeResult.entryId);
        assertGeneralLedgerBalanced(db);

        // Verify that Account 302 Retained Earnings now reflects the accumulated loss
        const retainedBal = getAccountNetBalance(db, '302');
        assert.equal(retainedBal, -13600000, 'Retained earnings must hold exact net loss (-13,600,000)');

        // Post-close Balance Sheet must remain perfectly balanced
        const bsAfterClose = accountingService.getBalanceSheet();
        assert.equal(bsAfterClose.isBalanced, true, 'Balance Sheet must remain balanced after period close');

        // --- STEP 8: COMPREHENSIVE RECONCILIATION ENGINE AUDIT ---
        const recon = reconciliationService.runAll();
        assert.equal(recon.summary.critical, 0, 'Reconciliation scan must have CRITICAL: 0');

        // 1. Inventory Valuation Check:
        // Perfume remaining: 20 received - 2 sold - 1 tester = 17 units @ 500,000 = 8,500,000
        // Lotion remaining: 50 received - 10 sold - 1 shortage = 39 units @ 100,000 = 3,900,000
        // Total Physical Valuation = 12,400,000
        const batchValuation = db.prepare(`SELECT SUM(quantity * purchase_price) AS total FROM inventory_batches`).get().total;
        assert.equal(batchValuation, 12400000);

        const glInventory = getAccountNetBalance(db, '103');
        assert.equal(glInventory, 12400000, 'Physical inventory valuation must strictly reconcile with GL Account 103');
        assert.equal(batchValuation, glInventory);

        // 2. Customer Wallet Liability Check:
        // Customer 1 deposited 1,000,000, spent 1,000,000 -> balance 0
        const totalWallets = db.prepare(`SELECT SUM(wallet_balance) AS total FROM customers`).get().total;
        assert.equal(totalWallets, 0);
        assert.equal(getAccountNetBalance(db, '205'), 0, 'GL Account 205 Wallet Liability must be 0');

        // 3. Supplier AP Sub-Ledger vs GL 201:
        const finalSup1Ledger = procurementService.getSupplierLedger(supplier1.id);
        const finalSup2Ledger = procurementService.getSupplierLedger(supplier2.id);
        const totalApSubledger = finalSup1Ledger.currentPayableBalance + finalSup2Ledger.currentPayableBalance;
        const glAp = getAccountNetBalance(db, '201');
        assert.equal(glAp, 3000000);
        assert.equal(totalApSubledger, glAp, 'Supplier sub-ledger must strictly equal GL Account 201');
    });
});

