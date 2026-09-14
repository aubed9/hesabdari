// Full Double-Entry Accounting & Financial Reporting Service
const db = require('../db/database');

const accountingService = {
    // Get Chart of Accounts with calculated balances
    getChartOfAccounts() {
        return db.prepare(`
            SELECT 
                coa.*,
                COALESCE(SUM(jl.debit), 0) AS total_debit,
                COALESCE(SUM(jl.credit), 0) AS total_credit,
                CASE 
                    WHEN coa.type IN ('ASSET', 'COGS', 'EXPENSE') THEN COALESCE(SUM(jl.debit - jl.credit), 0)
                    ELSE COALESCE(SUM(jl.credit - jl.debit), 0)
                END AS net_balance
            FROM chart_of_accounts coa
            LEFT JOIN journal_lines jl ON coa.id = jl.account_id
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all();
    },

    // Get Journal Entries with details
    getJournalEntries(limit = 100) {
        const entries = db.prepare(`
            SELECT je.*, u.full_name AS created_by_name
            FROM journal_entries je
            LEFT JOIN users u ON je.created_by = u.id
            ORDER BY je.id DESC
            LIMIT ?
        `).all(limit);

        for (const entry of entries) {
            entry.lines = db.prepare(`
                SELECT jl.*, coa.code AS account_code, coa.name_fa AS account_name
                FROM journal_lines jl
                JOIN chart_of_accounts coa ON jl.account_id = coa.id
                WHERE jl.journal_entry_id = ?
            `).all(entry.id);
        }

        return entries;
    },

    // Record Manual Journal Entry
    recordJournalEntry({ entryNumber, date, description, lines, createdBy = 1, referenceType = 'MANUAL', referenceId = null }) {
        const tx = db.transaction(() => {
            let totalDebit = 0;
            let totalCredit = 0;
            for (const line of lines) {
                totalDebit += (line.debit || 0);
                totalCredit += (line.credit || 0);
            }

            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                throw new Error(`سند تراز نیست! جمع بدهکار: ${totalDebit}، جمع بستانکار: ${totalCredit}`);
            }

            const eNum = entryNumber || `JE-${Date.now().toString().slice(-6)}`;
            const res = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, COALESCE(?, DATE('now')), ?, ?, ?, 1, ?)
            `).run(eNum, date, description, referenceType, referenceId, createdBy);
            const entryId = res.lastInsertRowid;

            const insertLine = db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `);

            for (const line of lines) {
                insertLine.run(entryId, line.accountId, line.debit || 0, line.credit || 0, line.description || description);
            }

            return { entryId, entryNumber: eNum };
        });

        return tx();
    },

    // Profit & Loss Statement (صورت سود و زیان P&L)
    getProfitAndLoss(startDate = null, endDate = null) {
        let dateFilter = '';
        const params = [];
        if (startDate && endDate) {
            dateFilter = 'AND je.date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Gross Sales Revenue (401 + 402)
        const salesRow = db.prepare(`
            SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code IN ('401', '402') ${dateFilter}
        `).get(...params);
        const grossSales = salesRow.total;

        // Sales Discounts (403)
        const discRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '403' ${dateFilter}
        `).get(...params);
        const discounts = discRow.total;

        const netSales = grossSales - discounts;

        // Cost of Goods Sold (COGS - 501)
        const cogsRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '501' ${dateFilter}
        `).get(...params);
        const cogs = cogsRow.total;

        const grossProfit = netSales - cogs;
        const grossMarginPercent = netSales > 0 ? ((grossProfit / netSales) * 100) : 0;

        // Operating Expenses (601 to 608)
        const expenses = db.prepare(`
            SELECT 
                coa.code,
                coa.name_fa,
                COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
            FROM chart_of_accounts coa
            LEFT JOIN journal_lines jl ON coa.id = jl.account_id
            LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id ${dateFilter ? 'AND je.date BETWEEN ? AND ?' : ''}
            WHERE coa.type = 'EXPENSE'
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all(...params);

        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const netProfit = grossProfit - totalExpenses;
        const netMarginPercent = netSales > 0 ? ((netProfit / netSales) * 100) : 0;

        return {
            grossSales,
            discounts,
            netSales,
            cogs,
            grossProfit,
            grossMarginPercent: Number(grossMarginPercent.toFixed(2)),
            expenses,
            totalExpenses,
            netProfit,
            netMarginPercent: Number(netMarginPercent.toFixed(2))
        };
    },

    // Balance Sheet (ترازنامه)
    getBalanceSheet() {
        const coaList = this.getChartOfAccounts();

        const assets = coaList.filter(c => c.type === 'ASSET');
        const liabilities = coaList.filter(c => c.type === 'LIABILITY');
        const equities = coaList.filter(c => c.type === 'EQUITY');

        const totalAssets = assets.reduce((sum, a) => sum + a.net_balance, 0);
        const totalLiabilities = liabilities.reduce((sum, l) => sum + l.net_balance, 0);
        
        const pnl = this.getProfitAndLoss();
        const currentPeriodProfit = pnl.netProfit;

        let totalEquity = equities.reduce((sum, e) => sum + e.net_balance, 0) + currentPeriodProfit;

        return {
            assets,
            totalAssets,
            liabilities,
            totalLiabilities,
            equities,
            currentPeriodProfit,
            totalEquity,
            totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
            isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1
        };
    },

    // Trial Balance (تراز آزمایشی ۴ ستونی)
    getTrialBalance() {
        return db.prepare(`
            SELECT 
                coa.code,
                coa.name_fa,
                coa.type,
                COALESCE(SUM(jl.debit), 0) AS total_debit,
                COALESCE(SUM(jl.credit), 0) AS total_credit,
                CASE 
                    WHEN COALESCE(SUM(jl.debit - jl.credit), 0) > 0 THEN COALESCE(SUM(jl.debit - jl.credit), 0)
                    ELSE 0
                END AS debit_balance,
                CASE 
                    WHEN COALESCE(SUM(jl.credit - jl.debit), 0) > 0 THEN COALESCE(SUM(jl.credit - jl.debit), 0)
                    ELSE 0
                END AS credit_balance
            FROM chart_of_accounts coa
            LEFT JOIN journal_lines jl ON coa.id = jl.account_id
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all();
    },

    // Expenses management
    getExpenses() {
        return db.prepare(`
            SELECT e.*, ba.bank_name, u.full_name AS created_by_name
            FROM expenses e
            LEFT JOIN bank_accounts ba ON e.bank_account_id = ba.id
            LEFT JOIN users u ON e.created_by = u.id
            ORDER BY e.payment_date DESC, e.id DESC
        `).all();
    },

    createExpense({ category, amount, bankAccountId = 1, paymentDate = null, description, paidTo = '', referenceNo = '', createdBy = 1 }) {
        const persianToEnum = {
            'اجاره و شارژ فروشگاه': 'RENT',
            'حقوق و دستمزد پرسنل': 'SALARY',
            'تبلیغات و پیامک': 'MARKETING',
            'بسته‌بندی و پاکت': 'PACKAGING',
            'قبوض آب و برق و گاز': 'ELECTRICITY',
            'تستر و سمپل': 'TESTER_EXPENSE',
            'سایر هزینه‌ها': 'OTHER'
        };
        const catEnum = persianToEnum[category] || category || 'OTHER';
        const pDate = paymentDate || new Date().toISOString().split('T')[0];
        const bankId = bankAccountId || 1;

        const expTx = db.transaction(() => {
            const res = db.prepare(`
                INSERT INTO expenses (category, amount, bank_account_id, payment_date, description, paid_to, reference_no, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(catEnum, amount, bankId, pDate, description, paidTo, referenceNo, createdBy);
            const expId = res.lastInsertRowid;

            // Deduct bank account balance
            db.prepare(`UPDATE bank_accounts SET balance = balance - ? WHERE id = ?`).run(amount, bankId);

            // Create Journal Entry
            // Map category to COA code
            const categoryMap = {
                'RENT': '601',
                'SALARY': '602',
                'MARKETING': '603',
                'TESTER_EXPENSE': '604',
                'PACKAGING': '605',
                'SHIPPING': '605',
                'ELECTRICITY': '606',
                'INTERNET': '606',
                'MAINTENANCE': '606',
                'TAX': '202',
                'OTHER': '608'
            };
            const code = categoryMap[catEnum] || '608';
            const expAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = ?`).get(code).id;
            const bankAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, ?, ?, 'EXPENSE', ?, 1, ?)
            `).run(`JE-EXP-${expId}`, pDate, description || `ثبت هزینه ${category}`, expId, createdBy);
            const jId = jRes.lastInsertRowid;

            db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, ?)`).run(jId, expAcc, amount, description);
            db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, ?)`).run(jId, bankAcc, amount, `پرداخت از بانک بابت هزینه`);

            return expId;
        });

        return expTx();
    },

    // Cheques Management
    getCheques() {
        return db.prepare(`
            SELECT 
                ch.*,
                s.name AS supplier_name,
                c.full_name AS customer_name,
                CAST((julianday(ch.due_date) - julianday('now')) AS INTEGER) AS days_until_due
            FROM cheques ch
            LEFT JOIN suppliers s ON ch.supplier_id = s.id
            LEFT JOIN customers c ON ch.customer_id = c.id
            ORDER BY ch.due_date ASC
        `).all();
    },

    // Bank Accounts
    getBankAccounts() {
        return db.prepare(`SELECT * FROM bank_accounts WHERE is_active = 1`).all();
    },

    // Aging Report for Debtors and Creditors (تحلیل سنی بدهکاران و بستانکاران)
    getAgingReport() {
        const cheques = this.getCheques();

        const payables = {
            days_0_30: { label: '۰ تا ۳۰ روز', total: 0, items: [] },
            days_31_60: { label: '۳۱ تا ۶۰ روز', total: 0, items: [] },
            days_61_90: { label: '۶۱ تا ۹۰ روز', total: 0, items: [] },
            days_90_plus: { label: 'بیش از ۹۰ روز', total: 0, items: [] }
        };

        const receivables = {
            days_0_30: { label: '۰ تا ۳۰ روز', total: 0, items: [] },
            days_31_60: { label: '۳۱ تا ۶۰ روز', total: 0, items: [] },
            days_61_90: { label: '۶۱ تا ۹۰ روز', total: 0, items: [] },
            days_90_plus: { label: 'بیش از ۹۰ روز', total: 0, items: [] }
        };

        for (const ch of cheques) {
            if (ch.status !== 'PENDING') continue;
            const days = Math.abs(ch.days_until_due);
            const targetGroup = ch.type === 'PAYABLE' ? payables : receivables;

            let bucket;
            if (days <= 30) bucket = targetGroup.days_0_30;
            else if (days <= 60) bucket = targetGroup.days_31_60;
            else if (days <= 90) bucket = targetGroup.days_61_90;
            else bucket = targetGroup.days_90_plus;

            bucket.total += ch.amount;
            bucket.items.push(ch);
        }

        return { payables, receivables };
    },

    // ==========================================
    // Fixed Costs & Periodic Overhead Management
    // ==========================================
    getFixedCosts() {
        const rows = db.prepare(`
            SELECT 
                fc.*,
                coa.code AS account_code,
                coa.name_fa AS account_name
            FROM fixed_costs fc
            JOIN chart_of_accounts coa ON fc.account_id = coa.id
            ORDER BY fc.status ASC, fc.due_day ASC
        `).all();

        // Calculate monthly normalized burn-rate
        let monthlyBurnRate = 0;
        for (const r of rows) {
            if (r.status !== 'ACTIVE') continue;
            let mAmount = r.amount;
            if (r.frequency === 'QUARTERLY') mAmount = r.amount / 3;
            else if (r.frequency === 'YEARLY') mAmount = r.amount / 12;
            else if (r.frequency === 'WEEKLY') mAmount = r.amount * 4.33;
            monthlyBurnRate += mAmount;
        }

        return {
            items: rows,
            monthlyBurnRate: Math.round(monthlyBurnRate),
            activeCount: rows.filter(r => r.status === 'ACTIVE').length
        };
    },

    createFixedCost({ title, category, accountId, amount, frequency = 'MONTHLY', dueDay = 1, notes = '' }) {
        const res = db.prepare(`
            INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(title, category, accountId, amount, frequency, dueDay, notes);
        return { id: res.lastInsertRowid };
    },

    updateFixedCost(id, { title, category, accountId, amount, frequency, dueDay, status, notes }) {
        db.prepare(`
            UPDATE fixed_costs
            SET title = COALESCE(?, title),
                category = COALESCE(?, category),
                account_id = COALESCE(?, account_id),
                amount = COALESCE(?, amount),
                frequency = COALESCE(?, frequency),
                due_day = COALESCE(?, due_day),
                status = COALESCE(?, status),
                notes = COALESCE(?, notes)
            WHERE id = ?
        `).run(title, category, accountId, amount, frequency, dueDay, status, notes, id);
        return { success: true };
    },

    deleteFixedCost(id) {
        db.prepare(`DELETE FROM fixed_costs WHERE id = ?`).run(id);
        return { success: true };
    },

    payFixedCost(id, paymentMethod = 'BANK') {
        const cost = db.prepare(`
            SELECT fc.*, coa.code AS account_code, coa.name_fa AS account_name
            FROM fixed_costs fc
            JOIN chart_of_accounts coa ON fc.account_id = coa.id
            WHERE fc.id = ?
        `).get(id);

        if (!cost) throw new Error('هزینه ثابت مورد نظر یافت نشد');

        const creditAccCode = paymentMethod === 'CASH' ? '101' : '102';
        const creditAcc = db.prepare(`SELECT id, code, name_fa FROM chart_of_accounts WHERE code = ?`).get(creditAccCode);
        if (!creditAcc) throw new Error('سرفصل پرداخت یافت نشد');

        const tx = db.transaction(() => {
            const entryNumber = `JE-FIXED-${Date.now().toString().slice(-6)}`;
            const today = new Date().toISOString().split('T')[0];
            const desc = `پرداخت هزینه ثابت: ${cost.title} (${cost.frequency === 'MONTHLY' ? 'دوره ماهانه' : cost.frequency})`;

            // 1. Insert Journal Entry
            const entryRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, created_by)
                VALUES (?, ?, ?, 'FIXED_COST', ?, 1)
            `).run(entryNumber, today, desc, id);
            const entryId = entryRes.lastInsertRowid;

            // 2. Insert Debit Line (Expense Account e.g. 601)
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, ?)
            `).run(entryId, cost.account_id, cost.amount, `بدهکار: ${cost.title}`);

            // 3. Insert Credit Line (Bank 102 or Cash 101)
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(entryId, creditAcc.id, cost.amount, `بستانکار: پرداخت از ${creditAcc.name_fa}`);

            // 4. Update last_paid_at
            db.prepare(`UPDATE fixed_costs SET last_paid_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

            return { entryId, entryNumber, amount: cost.amount };
        });

        return tx();
    },

    // ==========================================
    // Edit Functionality for Chart of Accounts & Journals
    // ==========================================
    updateAccount(id, { code, nameFa, description }) {
        db.prepare(`
            UPDATE chart_of_accounts
            SET code = COALESCE(?, code),
                name_fa = COALESCE(?, name_fa),
                description = COALESCE(?, description)
            WHERE id = ?
        `).run(code, nameFa, description, id);
        return { success: true };
    },

    updateJournalEntry(id, { description, date }) {
        db.prepare(`
            UPDATE journal_entries
            SET description = COALESCE(?, description),
                date = COALESCE(?, date)
            WHERE id = ?
        `).run(description, date, id);
        return { success: true };
    }
};

module.exports = accountingService;
