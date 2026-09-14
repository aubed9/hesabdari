/**
 * Tier 1: Feature Coverage — Accounting & Double-Entry Invariants
 * Minimum 5 tests covering core double-entry accounting behavior
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupTestDb, teardownTestDb, assertGeneralLedgerBalanced, getAccountNetBalance } = require('../helpers/testDb');

test.describe('Tier 1: Accounting & Double-Entry Engine', () => {
    let db, fixtures, accountingService;

    test.beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        accountingService = require('../../services/accountingService');
    });

    test.afterEach(() => {
        teardownTestDb();
    });

    test('T1-ACC-1: Record balanced manual journal entry persists header and lines', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCapital = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        const result = accountingService.recordJournalEntry({
            entryNumber: 'JE-MAN-001',
            date: '2026-09-14',
            description: 'واریز سرمایه اولیه نقدی به صندوق فروشگاه',
            lines: [
                { accountId: accCash, debit: 50000000, credit: 0, description: 'افزایش موجودی صندوق نقد' },
                { accountId: accCapital, debit: 0, credit: 50000000, description: 'ثبت سرمایه نقدی موسس' }
            ],
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(result.entryId, 'Journal entry ID must be returned');
        assert.equal(result.entryNumber, 'JE-MAN-001');

        const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(result.entryId);
        assert.equal(entry.description, 'واریز سرمایه اولیه نقدی به صندوق فروشگاه');
        assert.equal(entry.is_posted, 1);

        const lines = db.prepare(`SELECT * FROM journal_lines WHERE journal_entry_id = ?`).all(result.entryId);
        assert.equal(lines.length, 2);

        // Global ledger balance assertion
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '101'), 50000000);
        assert.equal(getAccountNetBalance(db, '301'), 50000000);
    });

    test('T1-ACC-2: Chart of Accounts returns all accounts with correct net balance calculation', () => {
        const coaList = accountingService.getChartOfAccounts();
        assert.ok(coaList.length >= 25, 'Chart of accounts should contain all standard accounts');

        const cashAcc = coaList.find(a => a.code === '101');
        assert.ok(cashAcc, 'Account 101 must exist');
        assert.equal(cashAcc.type, 'ASSET');
        assert.equal(cashAcc.net_balance, 0, 'Initial net balance must be 0');

        const walletAcc = coaList.find(a => a.code === '205');
        assert.ok(walletAcc, 'Account 205 Customer Wallet Liability must exist');
        assert.equal(walletAcc.type, 'LIABILITY');
    });

    test('T1-ACC-3: Profit & Loss statement correctly aggregates revenue, COGS, and expenses', () => {
        const accRev = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get().id;
        const accCOGS = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '501'`).get().id;
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
        const accRent = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '601'`).get().id;

        // Sale: Dr Cash 10,000,000 / Cr Rev 10,000,000; Dr COGS 6,000,000 / Cr Inv 6,000,000
        accountingService.recordJournalEntry({
            entryNumber: 'JE-TEST-SALE-01',
            date: '2026-09-14',
            description: 'فروش آزمایشی',
            lines: [
                { accountId: accCash, debit: 10000000, credit: 0 },
                { accountId: accRev, debit: 0, credit: 10000000 },
                { accountId: accCOGS, debit: 6000000, credit: 0 },
                { accountId: accInv, debit: 0, credit: 6000000 }
            ]
        });

        // Expense: Dr Rent 2,000,000 / Cr Cash 2,000,000
        accountingService.recordJournalEntry({
            entryNumber: 'JE-TEST-RENT-01',
            date: '2026-09-14',
            description: 'پرداخت اجاره',
            lines: [
                { accountId: accRent, debit: 2000000, credit: 0 },
                { accountId: accCash, debit: 0, credit: 2000000 }
            ]
        });

        const pnl = accountingService.getProfitAndLoss('2026-09-01', '2026-09-30');
        assert.equal(pnl.grossSales, 10000000, 'Gross sales should be 10,000,000');
        assert.equal(pnl.cogs, 6000000, 'COGS should be 6,000,000');
        assert.equal(pnl.grossProfit, 4000000, 'Gross profit should be 4,000,000');
        assert.equal(pnl.totalExpenses, 2000000, 'Total operating expenses should be 2,000,000');
        assert.equal(pnl.netProfit, 2000000, 'Net profit should be 2,000,000');
    });

    test('T1-ACC-4: Balance sheet reflects assets, liabilities, equities and balances with net profit', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCap = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;
        const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;
        const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;

        // Owner invests 20M: Dr Cash 20M, Cr Capital 20M
        accountingService.recordJournalEntry({
            description: 'سرمایه‌گذاری اولیه موسس',
            lines: [
                { accountId: accCash, debit: 20000000, credit: 0 },
                { accountId: accCap, debit: 0, credit: 20000000 }
            ]
        });

        // Purchase on credit 5M: Dr Inventory 5M, Cr AP 5M
        accountingService.recordJournalEntry({
            description: 'خرید نسیه کالا از تامین‌کننده',
            lines: [
                { accountId: accInv, debit: 5000000, credit: 0 },
                { accountId: accAP, debit: 0, credit: 5000000 }
            ]
        });

        const bs = accountingService.getBalanceSheet();
        assert.equal(bs.totalAssets, 25000000, 'Total assets must be 25,000,000 (Cash 20M + Inv 5M)');
        assert.equal(bs.totalLiabilities, 5000000, 'Total liabilities must be 5,000,000 (AP 5M)');
        assert.equal(bs.totalEquity, 20000000, 'Total equity must be 20,000,000 (Capital 20M)');
        assert.equal(bs.isBalanced, true, 'Balance sheet must balance (Assets == Liabilities + Equity)');
    });

    test('T1-ACC-5: Operating expense creation posts Dr Expense / Cr Bank with ledger balance', () => {
        const bankId = fixtures.bankAccounts[0];
        const expId = accountingService.createExpense({
            category: 'MARKETING',
            amount: 1500000,
            bankAccountId: bankId,
            description: 'هزینه چاپ کاتالوگ پاییزه محصولات آرایشی',
            paidTo: 'چاپخانه خاورمیانه',
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(expId, 'Expense ID must be returned');

        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '603'), 1500000, 'Marketing expense account 603 must have 1.5M debit');
        assert.equal(getAccountNetBalance(db, '102'), -1500000, 'Bank account 102 must have 1.5M credit (negative asset balance)');
    });

    test('T1-ACC-6: Trial Balance returns balanced debit and credit totals', () => {
        const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
        const accCap = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

        accountingService.recordJournalEntry({
            description: 'سند افتتاحیه صندوق',
            lines: [
                { accountId: accCash, debit: 8000000, credit: 0 },
                { accountId: accCap, debit: 0, credit: 8000000 }
            ]
        });

        const tb = accountingService.getTrialBalance();
        assert.ok(tb.length > 0);
        const totalDebit = tb.reduce((s, r) => s + r.total_debit, 0);
        const totalCredit = tb.reduce((s, r) => s + r.total_credit, 0);
        assert.equal(totalDebit, 8000000);
        assert.equal(totalCredit, 8000000);
    });
});
