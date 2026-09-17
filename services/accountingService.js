// Full Double-Entry Accounting, Sub-Ledgers & Financial Reporting Engine
const db = require('../db/database');

/**
 * Ensures accounting schema structures, indices, and required accounts exist.
 * Safe for both test in-memory databases and persistent production SQLite.
 */
function ensureAccountingSchema() {
    try {
        // 1. Accounting Periods Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS accounting_periods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                period_name TEXT NOT NULL UNIQUE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                fiscal_year INTEGER NOT NULL,
                status TEXT CHECK(status IN ('OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED')) DEFAULT 'OPEN',
                closed_at DATETIME,
                closed_by INTEGER REFERENCES users(id),
                closing_entry_id INTEGER REFERENCES journal_entries(id),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Add columns to journal_entries if missing
        const jeCols = db.prepare(`PRAGMA table_info(journal_entries)`).all().map(c => c.name);
        if (!jeCols.includes('purpose')) {
            db.exec(`ALTER TABLE journal_entries ADD COLUMN purpose TEXT;`);
        }
        if (!jeCols.includes('reversed_by_id')) {
            db.exec(`ALTER TABLE journal_entries ADD COLUMN reversed_by_id INTEGER REFERENCES journal_entries(id);`);
        }
        if (!jeCols.includes('reverse_of_id')) {
            db.exec(`ALTER TABLE journal_entries ADD COLUMN reverse_of_id INTEGER REFERENCES journal_entries(id);`);
        }

        // Composite uniqueness guard on (reference_type, reference_id, purpose)
        db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_ref_purpose 
            ON journal_entries(reference_type, reference_id, purpose) 
            WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL AND purpose IS NOT NULL;
        `);

        // 3. Add columns to cheques if missing
        const chCols = db.prepare(`PRAGMA table_info(cheques)`).all().map(c => c.name);
        if (!chCols.includes('journal_entry_id')) {
            db.exec(`ALTER TABLE cheques ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id);`);
        }
        if (!chCols.includes('clearing_entry_id')) {
            db.exec(`ALTER TABLE cheques ADD COLUMN clearing_entry_id INTEGER REFERENCES journal_entries(id);`);
        }

        // Expand status check constraint on cheques if needed
        const chSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='cheques'`).get();
        if (chSql && chSql.sql && !chSql.sql.includes('CLEARED')) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS cheques_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cheque_number TEXT NOT NULL,
                    bank_name TEXT NOT NULL,
                    amount REAL NOT NULL CHECK(amount >= 0),
                    due_date DATE NOT NULL,
                    type TEXT CHECK(type IN ('RECEIVABLE', 'PAYABLE')) NOT NULL,
                    party_name TEXT NOT NULL,
                    supplier_id INTEGER REFERENCES suppliers(id),
                    customer_id INTEGER REFERENCES customers(id),
                    status TEXT CHECK(status IN ('PENDING', 'PASSED', 'ISSUED', 'RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED', 'CANCELLED')) DEFAULT 'RECEIVED',
                    notes TEXT,
                    journal_entry_id INTEGER REFERENCES journal_entries(id),
                    clearing_entry_id INTEGER REFERENCES journal_entries(id),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                INSERT INTO cheques_new (id, cheque_number, bank_name, amount, due_date, type, party_name, supplier_id, customer_id, status, notes, journal_entry_id, clearing_entry_id, created_at)
                SELECT id, cheque_number, bank_name, amount, due_date, type, party_name, supplier_id, customer_id, status, notes, journal_entry_id, clearing_entry_id, created_at FROM cheques;
                DROP TABLE cheques;
                ALTER TABLE cheques_new RENAME TO cheques;
            `);
        }

        // 4. Ensure Chart of Accounts standard baseline accounts
        const checkCoa = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = ?`);
        if (!checkCoa.get('104')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('104', 'Accounts Receivable', 'حساب‌های دریافتنی', 'ASSET')`).run();
        }
        if (!checkCoa.get('106')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('106', 'Notes & Cheques Receivable', 'اسناد و چک‌های دریافتنی', 'ASSET')`).run();
        }
        if (!checkCoa.get('201')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('201', 'Accounts Payable', 'حساب‌های پرداختنی (بستانکاران)', 'LIABILITY')`).run();
        }
        if (!checkCoa.get('204')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('204', 'Notes & Cheques Payable', 'اسناد پرداختنی (چک‌های صادره)', 'LIABILITY')`).run();
        }
        if (!checkCoa.get('205')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('205', 'Customer Wallet Liability', 'بدهی کیف پول مشتریان', 'LIABILITY')`).run();
        }
        if (!checkCoa.get('302')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('302', 'Retained Earnings', 'سود (زیان) انباشته', 'EQUITY')`).run();
        }
        if (!checkCoa.get('404')) {
            db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type) VALUES ('404', 'Sales Returns & Allowances', 'برگشت از فروش و تخفیفات', 'REVENUE')`).run();
        }

        // 5. Immutability Triggers on posted journal vouchers and lines
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_journal_entries_immutability_upd
            BEFORE UPDATE ON journal_entries
            FOR EACH ROW
            WHEN OLD.is_posted = 1 AND (NEW.is_posted = 0 OR NEW.date != OLD.date OR NEW.entry_number != OLD.entry_number)
            BEGIN
                SELECT RAISE(ABORT, 'Constraint violation: Posted journal vouchers are immutable. Use reverseJournalEntry for corrections.');
            END;

            CREATE TRIGGER IF NOT EXISTS trg_journal_entries_immutability_del
            BEFORE DELETE ON journal_entries
            FOR EACH ROW
            WHEN OLD.is_posted = 1
            BEGIN
                SELECT RAISE(ABORT, 'Constraint violation: Posted journal vouchers cannot be deleted.');
            END;

            CREATE TRIGGER IF NOT EXISTS trg_journal_lines_immutability_upd
            BEFORE UPDATE ON journal_lines
            FOR EACH ROW
            WHEN (SELECT is_posted FROM journal_entries WHERE id = OLD.journal_entry_id) = 1
            BEGIN
                SELECT RAISE(ABORT, 'Constraint violation: Posted journal lines cannot be updated.');
            END;

            CREATE TRIGGER IF NOT EXISTS trg_journal_lines_immutability_del
            BEFORE DELETE ON journal_lines
            FOR EACH ROW
            WHEN (SELECT is_posted FROM journal_entries WHERE id = OLD.journal_entry_id) = 1
            BEGIN
                SELECT RAISE(ABORT, 'Constraint violation: Posted journal lines cannot be deleted.');
            END;
        `);
    } catch (e) {
        // Schema initialization is best-effort idempotent
    }
}

const accountingService = {
    // ==========================================
    // Core Double-Entry & Journal Management
    // ==========================================

    /**
     * Internal implementation of journal entry recording.
     * Enforces double-entry equality, period checks, duplicate guards, line validations, and atomicity.
     */
    _recordJournalEntry({ entryNumber, date, description, lines, createdBy = 1, referenceType = 'MANUAL', referenceId = null, purpose = null }) {
        ensureAccountingSchema();

        if (!Array.isArray(lines) || lines.length < 2) {
            throw new Error('سند تراز نیست! هر سند حسابداری باید حداقل شامل دو سطر متوازن باشد.');
        }

        const entryDate = date || new Date().toISOString().split('T')[0];

        // Guard against posting into CLOSED or LOCKED accounting periods
        const period = this.getAccountingPeriodByDate(entryDate);
        if (period && (period.status === 'CLOSED' || period.status === 'LOCKED')) {
            throw new Error(`امکان ثبت سند در دوره مالی بسته یا قفل شده (${period.period_name}) وجود ندارد`);
        }

        // Verify duplicate composite guard (reference_type, reference_id, purpose)
        if (referenceType && referenceId && purpose) {
            const existing = db.prepare(`
                SELECT id, entry_number FROM journal_entries 
                WHERE reference_type = ? AND reference_id = ? AND purpose = ?
            `).get(referenceType, referenceId, purpose);
            if (existing) {
                throw new Error(`سند حسابداری تکراری برای ارجاع (${referenceType}, ${referenceId}, ${purpose}) قبلاً ثبت شده است (سند: ${existing.entry_number})`);
            }
        }

        // Validate line accounts and amounts
        let totalDebit = 0;
        let totalCredit = 0;

        for (const line of lines) {
            if (!line || typeof line !== 'object') {
                throw new Error('سطر سند حسابداری نامعتبر است');
            }
            if (!line.accountId) {
                throw new Error('شناسه حساب در سطر سند نامعتبر است');
            }

            const debit = line.debit !== undefined ? Number(line.debit) : 0;
            const credit = line.credit !== undefined ? Number(line.credit) : 0;

            if (isNaN(debit) || isNaN(credit)) {
                throw new Error('مبلغ سطر سند باید عددی معتبر باشد');
            }
            if (debit < 0 || credit < 0) {
                throw new Error('مبالغ بدهکار و بستانکار نمی‌توانند منفی باشند');
            }
            if (debit === 0 && credit === 0) {
                throw new Error('سطر سند بدون مبلغ مجاز نیست');
            }

            totalDebit += debit;
            totalCredit += credit;
        }

        // Strict double-entry balance assertion: SUM(debit) === SUM(credit)
        const roundedDebit = Math.round(totalDebit * 100) / 100;
        const roundedCredit = Math.round(totalCredit * 100) / 100;
        if (Math.abs(roundedDebit - roundedCredit) > 0.005) {
            throw new Error(`سند تراز نیست! جمع بدهکار: ${totalDebit}، جمع بستانکار: ${totalCredit}`);
        }

        // Atomic SQLite transaction
        const tx = db.transaction(() => {
            const eNum = entryNumber || `JE-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
            
            const res = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, purpose, is_posted, created_by)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            `).run(eNum, entryDate, description, referenceType, referenceId, purpose, createdBy);
            const entryId = res.lastInsertRowid;

            const insertLine = db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `);

            for (const line of lines) {
                const debit = Math.round((Number(line.debit) || 0) * 100) / 100;
                const credit = Math.round((Number(line.credit) || 0) * 100) / 100;
                insertLine.run(entryId, line.accountId, debit, credit, line.description || description);
            }

            return { id: entryId, entryId, entryNumber: eNum };
        });

        return tx();
    },

    /**
     * Record Manual Journal Entry (backward-compatible signature)
     */
    recordJournalEntry(params) {
        return this._recordJournalEntry(params);
    },

    /**
     * Create Journal Entry (PROJECT.md contract signature)
     */
    createJournalEntry({ referenceType = 'MANUAL', referenceId = null, purpose = null, description, lines, date = null, createdBy = 1, entryNumber = null }) {
        return this._recordJournalEntry({
            entryNumber,
            referenceType,
            referenceId,
            purpose,
            description,
            lines,
            date,
            createdBy
        });
    },

    /**
     * Reverse an existing posted journal entry with an exact offsetting reversal voucher.
     * Supports both reverseJournalEntry(id, { reason, date, createdBy }) and reverseJournalEntry(id, reason, userId).
     */
    reverseJournalEntry(id, optionsOrReason = '', maybeUserId = 1) {
        ensureAccountingSchema();

        let reason = '';
        let date = null;
        let createdBy = 1;

        if (optionsOrReason && typeof optionsOrReason === 'object') {
            reason = optionsOrReason.reason || '';
            date = optionsOrReason.date || null;
            createdBy = optionsOrReason.createdBy !== undefined ? optionsOrReason.createdBy : 1;
        } else if (typeof optionsOrReason === 'string') {
            reason = optionsOrReason;
            createdBy = typeof maybeUserId === 'number' ? maybeUserId : 1;
        }

        const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id);
        if (!entry) {
            throw new Error(`سند حسابداری با شناسه ${id} یافت نشد`);
        }
        if (!entry.is_posted) {
            throw new Error('امکان برگشت سند ثبت‌قطعی‌نشده وجود ندارد');
        }
        if (entry.reversed_by_id) {
            throw new Error(`این سند قبلاً برگشت داده شده است (شناسه سند معکوس: ${entry.reversed_by_id})`);
        }

        const revDate = date || new Date().toISOString().split('T')[0];
        const period = this.getAccountingPeriodByDate(revDate);
        if (period && (period.status === 'CLOSED' || period.status === 'LOCKED')) {
            throw new Error(`امکان ثبت سند برگشت در دوره مالی بسته (${period.period_name}) وجود ندارد`);
        }

        const lines = db.prepare(`SELECT * FROM journal_lines WHERE journal_entry_id = ?`).all(id);
        if (lines.length === 0) {
            throw new Error('سند اصلی فاقد سطر جهت برگشت است');
        }

        // Swap debits and credits for all lines
        const reversalLines = lines.map(l => ({
            accountId: l.account_id,
            debit: l.credit,
            credit: l.debit,
            description: `برگشت: ${l.description || entry.description}`
        }));

        const revNumber = `REV-${entry.entry_number}`;
        const revDesc = `برگشت سند شماره ${entry.entry_number}${reason ? ': ' + reason : ''}`;

        const revTx = db.transaction(() => {
            const revRes = this.createJournalEntry({
                entryNumber: revNumber,
                referenceType: 'REVERSAL',
                referenceId: id,
                purpose: 'REVERSAL',
                description: revDesc,
                lines: reversalLines,
                date: revDate,
                createdBy
            });

            // Link original and reversal records
            db.prepare(`UPDATE journal_entries SET reversed_by_id = ? WHERE id = ?`).run(revRes.entryId, id);
            db.prepare(`UPDATE journal_entries SET reverse_of_id = ? WHERE id = ?`).run(id, revRes.entryId);

            return {
                success: true,
                reversalEntryId: revRes.entryId,
                reversalEntryNumber: revRes.entryNumber,
                originalEntryId: id
            };
        });

        return revTx();
    },

    /**
     * Reverse and Replace: atomicity of reversing a posted voucher and posting a corrected replacement.
     */
    reverseAndReplaceJournalEntry(id, { replacementLines, description, date = null, reason = '', createdBy = 1 }) {
        const tx = db.transaction(() => {
            const reversal = this.reverseJournalEntry(id, { reason: reason || 'جایگزینی با سند اصلاحی', date, createdBy });
            const replacement = this.createJournalEntry({
                referenceType: 'REPLACEMENT',
                referenceId: id,
                purpose: 'CORRECTION',
                description: description || `سند اصلاحی جایگزین سند ${id}`,
                lines: replacementLines,
                date,
                createdBy
            });
            return { reversal, replacement };
        });

        return tx();
    },

    /**
     * Update Journal Entry: Guards against direct editing of posted vouchers.
     */
    updateJournalEntry(id, { description, date }) {
        const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id);
        if (!entry) {
            throw new Error('سند حسابداری یافت نشد');
        }
        if (entry.is_posted) {
            throw new Error('امکان ویرایش مستقیم اسناد حسابداری ثبت‌قطعی شده (پست شده) وجود ندارد. از سند اصلاحی یا برگشت سند استفاده کنید.');
        }

        db.prepare(`
            UPDATE journal_entries
            SET description = COALESCE(?, description),
                date = COALESCE(?, date)
            WHERE id = ?
        `).run(description, date, id);
        return { success: true };
    },

    /**
     * Delete Journal Entry: Guards against direct deletion of posted vouchers.
     */
    deleteJournalEntry(id) {
        const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id);
        if (!entry) {
            throw new Error('سند حسابداری یافت نشد');
        }
        if (entry.is_posted) {
            throw new Error('امکان حذف اسناد حسابداری ثبت‌قطعی شده وجود ندارد');
        }
        db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(id);
        return { success: true };
    },

    // Get Chart of Accounts with calculated balances based on posted entries
    getChartOfAccounts() {
        ensureAccountingSchema();
        return db.prepare(`
            SELECT 
                coa.*,
                COALESCE(SUM(pl.debit), 0) AS total_debit,
                COALESCE(SUM(pl.credit), 0) AS total_credit,
                CASE 
                    WHEN coa.type IN ('ASSET', 'COGS', 'EXPENSE') THEN COALESCE(SUM(pl.debit - pl.credit), 0)
                    ELSE COALESCE(SUM(pl.credit - pl.debit), 0)
                END AS net_balance
            FROM chart_of_accounts coa
            LEFT JOIN (
                SELECT jl.account_id, jl.debit, jl.credit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.is_posted = 1
            ) pl ON coa.id = pl.account_id
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all();
    },

    // Get Journal Entries with details
    getJournalEntries(limit = 100) {
        ensureAccountingSchema();
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

    // ==========================================
    // Canonical Bank & Cash Balances (GL Derived)
    // ==========================================

    /**
     * Derive canonical Cash balance directly from General Ledger Account 101.
     */
    getCashBalance() {
        ensureAccountingSchema();
        const row = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '101' AND je.is_posted = 1
        `).get();
        return row ? row.balance : 0;
    },

    /**
     * Derive canonical Bank/Card balance directly from General Ledger Account 102.
     */
    getBankBalance() {
        ensureAccountingSchema();
        const row = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '102' AND je.is_posted = 1
        `).get();
        return row ? row.balance : 0;
    },

    /**
     * Get summary of all canonical liquid fund balances.
     */
    getCanonicalBalances() {
        const cashBalance = this.getCashBalance();
        const bankBalance = this.getBankBalance();
        return {
            cashBalance,
            bankBalance,
            totalLiquidFunds: cashBalance + bankBalance
        };
    },

    /**
     * Bank Accounts listing reconciled with GL Account 102.
     */
    getBankAccounts() {
        ensureAccountingSchema();
        const accounts = db.prepare(`SELECT * FROM bank_accounts WHERE is_active = 1`).all();
        const glBank = this.getBankBalance();
        return accounts.map(a => ({
            ...a,
            gl_balance: glBank
        }));
    },

    // ==========================================
    // Sub-Ledgers: AR (Receivables) & AP (Payables)
    // ==========================================

    /**
     * Supplier Accounts Payable (AP) Sub-Ledger.
     * Enforces: SUM(supplier_subledger) === Account 201.
     */
    getSupplierAPSubLedger(supplierId = null) {
        ensureAccountingSchema();

        let supplierFilter = '';
        const params = [];
        if (supplierId) {
            supplierFilter = 'WHERE s.id = ?';
            params.push(supplierId);
        }

        const suppliers = db.prepare(`SELECT * FROM suppliers s ${supplierFilter} ORDER BY s.id ASC`).all(...params);

        const records = suppliers.map(s => {
            // Invoiced purchases (Credit to AP)
            const poRow = db.prepare(`
                SELECT COALESCE(SUM(total_amount), 0) AS total_purchases
                FROM purchase_orders
                WHERE supplier_id = ?
            `).get(s.id);

            // Payments (Debit to AP)
            const payRow = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total_payments
                FROM supplier_payments
                WHERE supplier_id = ?
            `).get(s.id);

            // Returns (Debit to AP)
            const retRow = db.prepare(`
                SELECT COALESCE(SUM(total_amount), 0) AS total_returns
                FROM purchase_returns
                WHERE supplier_id = ?
            `).get(s.id);

            const purchases = poRow.total_purchases;
            const payments = payRow.total_payments;
            const returns = retRow.total_returns;
            const payableBalance = purchases - (payments + returns);

            return {
                supplierId: s.id,
                supplierName: s.name,
                phone: s.phone || s.mobile,
                totalPurchases: purchases,
                totalPayments: payments,
                totalReturns: returns,
                currentPayableBalance: payableBalance
            };
        });

        const totalPayable = records.reduce((sum, r) => sum + r.currentPayableBalance, 0);

        // Fetch GL Account 201 net balance
        const glRow = db.prepare(`
            SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS gl_balance
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '201' AND je.is_posted = 1
        `).get();
        const glAccount201Balance = glRow ? glRow.gl_balance : 0;

        return {
            records,
            totalPayable,
            glAccount201Balance,
            isReconciled: Math.abs(totalPayable - glAccount201Balance) < 1,
            discrepancy: totalPayable - glAccount201Balance
        };
    },

    /**
     * Supplier Accounts Payable Aging Breakdown (0-30, 31-60, 61-90, 90+ days).
     */
    getSupplierAPAging(supplierId = null) {
        ensureAccountingSchema();

        let whereClause = 'WHERE (po.total_amount - COALESCE(po.paid_amount, 0)) > 0';
        const params = [];
        if (supplierId) {
            whereClause += ' AND s.id = ?';
            params.push(supplierId);
        }

        const query = `
            SELECT 
                s.id AS supplier_id,
                s.name AS supplier_name,
                po.id AS po_id,
                po.po_number,
                po.total_amount,
                COALESCE(po.paid_amount, 0) AS paid_amount,
                (po.total_amount - COALESCE(po.paid_amount, 0)) AS remaining_payable,
                po.created_at,
                CAST((julianday('now') - julianday(po.created_at)) AS INTEGER) AS days_passed
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY days_passed DESC
        `;

        const rows = db.prepare(query).all(...params);

        const summary = {
            days_0_30: { count: 0, amount: 0 },
            days_31_60: { count: 0, amount: 0 },
            days_61_90: { count: 0, amount: 0 },
            days_90_plus: { count: 0, amount: 0 },
            current_0_30: { count: 0, amount: 0 },
            overdue_31_60: { count: 0, amount: 0 },
            overdue_61_90: { count: 0, amount: 0 },
            overdue_90_plus: { count: 0, amount: 0 },
            totalPayable: 0,
            items: []
        };

        for (const r of rows) {
            summary.totalPayable += r.remaining_payable;
            let bucket = 'days_0_30';
            if (r.days_passed > 90) bucket = 'days_90_plus';
            else if (r.days_passed > 60) bucket = 'days_61_90';
            else if (r.days_passed > 30) bucket = 'days_31_60';

            summary[bucket].count += 1;
            summary[bucket].amount += r.remaining_payable;

            if (bucket === 'days_0_30') { summary.current_0_30.count += 1; summary.current_0_30.amount += r.remaining_payable; }
            else if (bucket === 'days_31_60') { summary.overdue_31_60.count += 1; summary.overdue_31_60.amount += r.remaining_payable; }
            else if (bucket === 'days_61_90') { summary.overdue_61_90.count += 1; summary.overdue_61_90.amount += r.remaining_payable; }
            else if (bucket === 'days_90_plus') { summary.overdue_90_plus.count += 1; summary.overdue_90_plus.amount += r.remaining_payable; }

            summary.items.push({ ...r, agingBucket: bucket });
        }

        return summary;
    },

    getSupplierAging(supplierId = null) {
        return this.getSupplierAPAging(supplierId);
    },

    /**
     * Customer Accounts Receivable (AR) Sub-Ledger.
     * Evaluates open invoices, installments, and unpaid balances tying to GL Account 104 (or 105).
     */
    getCustomerARSubLedger(customerId = null) {
        ensureAccountingSchema();

        let custFilter = '';
        const params = [];
        if (customerId) {
            custFilter = 'WHERE c.id = ?';
            params.push(customerId);
        }

        const customers = db.prepare(`SELECT * FROM customers c ${custFilter} ORDER BY c.id ASC`).all(...params);

        const records = [];
        for (const c of customers) {
            // Orders total amount and payments
            const orderStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(o.total_amount), 0) AS total_orders,
                    COALESCE(SUM(
                        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = o.id)
                    ), 0) AS total_paid
                FROM orders o
                WHERE o.customer_id = ? AND o.status != 'CANCELLED'
            `).get(c.id);

            // Bounced cheques re-debited to customer
            const bouncedCheques = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total_bounced
                FROM cheques
                WHERE customer_id = ? AND type = 'RECEIVABLE' AND status = 'BOUNCED'
            `).get(c.id);

            const totalOrders = orderStats ? orderStats.total_orders : 0;
            const totalPaid = orderStats ? orderStats.total_paid : 0;
            const totalBounced = bouncedCheques ? bouncedCheques.total_bounced : 0;
            const receivableBalance = (totalOrders - totalPaid) + totalBounced;

            if (receivableBalance > 0 || customerId) {
                records.push({
                    customerId: c.id,
                    customerName: c.full_name,
                    mobile: c.mobile,
                    totalOrders,
                    totalPaid,
                    totalBounced,
                    currentReceivableBalance: Math.max(0, receivableBalance)
                });
            }
        }

        const totalReceivable = records.reduce((sum, r) => sum + r.currentReceivableBalance, 0);

        // Fetch GL Accounts Receivable net balance (Account 104 or 105)
        const arAccount = db.prepare(`
            SELECT id, code FROM chart_of_accounts 
            WHERE code = '104' OR (code = '105' AND name LIKE '%Receivable%')
            ORDER BY CASE WHEN code = '104' THEN 1 ELSE 2 END LIMIT 1
        `).get();
        const arCode = arAccount ? arAccount.code : '104';

        const glRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS gl_balance
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = ? AND je.is_posted = 1
        `).get(arCode);
        const glAccountARBalance = glRow ? glRow.gl_balance : 0;

        return {
            records,
            totalReceivable,
            glAccountARBalance,
            isReconciled: Math.abs(totalReceivable - glAccountARBalance) < 1,
            discrepancy: totalReceivable - glAccountARBalance
        };
    },

    /**
     * Customer Accounts Receivable Aging Breakdown (0-30, 31-60, 61-90, 90+ days).
     */
    getCustomerARAging(customerId = null) {
        ensureAccountingSchema();

        let custFilter = '';
        const params = [];
        if (customerId) {
            custFilter = 'AND o.customer_id = ?';
            params.push(customerId);
        }

        const orders = db.prepare(`
            SELECT 
                o.id AS order_id,
                o.order_number,
                o.customer_id,
                c.full_name AS customer_name,
                o.total_amount,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid_amount,
                o.created_at,
                CAST((julianday('now') - julianday(o.created_at)) AS INTEGER) AS days_passed
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.status != 'CANCELLED' 
              AND (o.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.order_id = o.id)) > 0
              ${custFilter}
            ORDER BY days_passed DESC
        `).all(...params);

        const summary = {
            days_0_30: { count: 0, amount: 0 },
            days_31_60: { count: 0, amount: 0 },
            days_61_90: { count: 0, amount: 0 },
            days_90_plus: { count: 0, amount: 0 },
            current_0_30: { count: 0, amount: 0 },
            overdue_31_60: { count: 0, amount: 0 },
            overdue_61_90: { count: 0, amount: 0 },
            overdue_90_plus: { count: 0, amount: 0 },
            totalReceivable: 0,
            items: []
        };

        for (const ord of orders) {
            const remaining = ord.total_amount - ord.paid_amount;
            summary.totalReceivable += remaining;

            let bucket = 'days_0_30';
            if (ord.days_passed > 90) bucket = 'days_90_plus';
            else if (ord.days_passed > 60) bucket = 'days_61_90';
            else if (ord.days_passed > 30) bucket = 'days_31_60';

            summary[bucket].count += 1;
            summary[bucket].amount += remaining;

            if (bucket === 'days_0_30') { summary.current_0_30.count += 1; summary.current_0_30.amount += remaining; }
            else if (bucket === 'days_31_60') { summary.overdue_31_60.count += 1; summary.overdue_31_60.amount += remaining; }
            else if (bucket === 'days_61_90') { summary.overdue_61_90.count += 1; summary.overdue_61_90.amount += remaining; }
            else if (bucket === 'days_90_plus') { summary.overdue_90_plus.count += 1; summary.overdue_90_plus.amount += remaining; }

            summary.items.push({ ...ord, remainingAmount: remaining, agingBucket: bucket });
        }

        return summary;
    },

    getCustomerAging(customerId = null) {
        return this.getCustomerARAging(customerId);
    },

    // ==========================================
    // Accounting Periods & Closing Mechanism
    // ==========================================

    getAccountingPeriods() {
        ensureAccountingSchema();
        return db.prepare(`SELECT * FROM accounting_periods ORDER BY start_date ASC`).all();
    },

    getPeriods() {
        return this.getAccountingPeriods();
    },

    getAccountingPeriodById(id) {
        ensureAccountingSchema();
        return db.prepare(`SELECT * FROM accounting_periods WHERE id = ?`).get(id);
    },

    getPeriodById(id) {
        return this.getAccountingPeriodById(id);
    },

    getAccountingPeriodByDate(dateStr) {
        ensureAccountingSchema();
        return db.prepare(`
            SELECT * FROM accounting_periods 
            WHERE ? BETWEEN start_date AND end_date
            ORDER BY id DESC LIMIT 1
        `).get(dateStr);
    },

    createAccountingPeriod({ periodName, startDate, endDate, fiscalYear, notes = '' }) {
        ensureAccountingSchema();
        const res = db.prepare(`
            INSERT INTO accounting_periods (period_name, start_date, end_date, fiscal_year, status, notes)
            VALUES (?, ?, ?, ?, 'OPEN', ?)
        `).run(periodName, startDate, endDate, fiscalYear, notes);
        return { id: res.lastInsertRowid, periodName, status: 'OPEN' };
    },

    createPeriod(firstArg, ...rest) {
        if (typeof firstArg === 'object' && firstArg !== null) {
            return this.createAccountingPeriod(firstArg);
        }
        const [periodName, startDate, endDate, fiscalYear, notes] = [firstArg, ...rest];
        return this.createAccountingPeriod({ periodName, startDate, endDate, fiscalYear, notes });
    },

    closePeriod(periodId, userId = 1) {
        return this.closeAccountingPeriod(periodId, userId);
    },

    updateAccountingPeriodStatus(id, newStatus, userId = 1) {
        ensureAccountingSchema();
        const validStatuses = ['OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`وضعیت دوره مالی نامعتبر است: ${newStatus}`);
        }

        const period = this.getAccountingPeriodById(id);
        if (!period) throw new Error('دوره مالی یافت نشد');
        if (period.status === 'LOCKED') {
            throw new Error('دوره مالی به طور دائم قفل شده و قابل تغییر نیست');
        }

        db.prepare(`
            UPDATE accounting_periods 
            SET status = ?,
                closed_at = CASE WHEN ? IN ('CLOSED', 'LOCKED') THEN CURRENT_TIMESTAMP ELSE closed_at END,
                closed_by = CASE WHEN ? IN ('CLOSED', 'LOCKED') THEN ? ELSE closed_by END
            WHERE id = ?
        `).run(newStatus, newStatus, newStatus, userId, id);

        return { success: true, id, status: newStatus };
    },

    /**
     * Close Accounting Period: Transfer all nominal P&L accounts (Revenues & Expenses)
     * to Retained Earnings (Account 302).
     */
    closeAccountingPeriod(periodId, userId = 1) {
        ensureAccountingSchema();

        const period = this.getAccountingPeriodById(periodId);
        if (!period) throw new Error('دوره مالی مورد نظر یافت نشد');
        if (period.status === 'CLOSED' || period.status === 'LOCKED') {
            throw new Error(`این دوره مالی قبلاً بسته شده است (${period.status})`);
        }

        const closeTx = db.transaction(() => {
            // Revenue accounts net balance in the period
            const revenues = db.prepare(`
                SELECT coa.id, coa.code, coa.name_fa,
                       COALESCE(SUM(jl.credit - jl.debit), 0) AS net_credit
                FROM chart_of_accounts coa
                JOIN journal_lines jl ON coa.id = jl.account_id
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE coa.type = 'REVENUE' AND je.is_posted = 1
                  AND je.date BETWEEN ? AND ?
                  AND (je.purpose IS NULL OR je.purpose != 'PERIOD_CLOSING')
                GROUP BY coa.id
                HAVING ABS(net_credit) > 0.001
            `).all(period.start_date, period.end_date);

            // Expense and COGS accounts net balance in the period
            const expenses = db.prepare(`
                SELECT coa.id, coa.code, coa.name_fa,
                       COALESCE(SUM(jl.debit - jl.credit), 0) AS net_debit
                FROM chart_of_accounts coa
                JOIN journal_lines jl ON coa.id = jl.account_id
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE coa.type IN ('COGS', 'EXPENSE') AND je.is_posted = 1
                  AND je.date BETWEEN ? AND ?
                  AND (je.purpose IS NULL OR je.purpose != 'PERIOD_CLOSING')
                GROUP BY coa.id
                HAVING ABS(net_debit) > 0.001
            `).all(period.start_date, period.end_date);

            const closingLines = [];
            let totalNetRevenue = 0;
            let totalNetExpense = 0;

            // Zero out revenue accounts: debit revenue if credit > debit, or credit if debit > credit
            for (const r of revenues) {
                totalNetRevenue += r.net_credit;
                if (r.net_credit > 0) {
                    closingLines.push({
                        accountId: r.id,
                        debit: r.net_credit,
                        credit: 0,
                        description: `بستن حساب درآمد: ${r.name_fa}`
                    });
                } else {
                    closingLines.push({
                        accountId: r.id,
                        debit: 0,
                        credit: Math.abs(r.net_credit),
                        description: `بستن حساب درآمد: ${r.name_fa}`
                    });
                }
            }

            // Zero out expense/COGS accounts: credit expense if debit > credit, or debit if credit > debit
            for (const e of expenses) {
                totalNetExpense += e.net_debit;
                if (e.net_debit > 0) {
                    closingLines.push({
                        accountId: e.id,
                        debit: 0,
                        credit: e.net_debit,
                        description: `بستن حساب هزینه: ${e.name_fa}`
                    });
                } else {
                    closingLines.push({
                        accountId: e.id,
                        debit: Math.abs(e.net_debit),
                        credit: 0,
                        description: `بستن حساب هزینه: ${e.name_fa}`
                    });
                }
            }

            const netProfit = totalNetRevenue - totalNetExpense;

            // Transfer net profit / loss to Retained Earnings (Account 302)
            const retainedAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '302'`).get();
            if (!retainedAcc) {
                throw new Error('حساب سود (زیان) انباشته ۳۰۲ در کدینگ حساب‌ها یافت نشد');
            }

            if (netProfit > 0) {
                // Profit: Credit Retained Earnings
                closingLines.push({
                    accountId: retainedAcc.id,
                    debit: 0,
                    credit: netProfit,
                    description: 'انتقال سود خالص دوره مالی به سود انباشته'
                });
            } else if (netProfit < 0) {
                // Loss: Debit Retained Earnings
                closingLines.push({
                    accountId: retainedAcc.id,
                    debit: Math.abs(netProfit),
                    credit: 0,
                    description: 'انتقال زیان خالص دوره مالی به سود (زیان) انباشته'
                });
            }

            let closingEntryId = null;
            if (closingLines.length > 0) {
                const entryRes = this.createJournalEntry({
                    referenceType: 'PERIOD_CLOSING',
                    referenceId: period.id,
                    purpose: 'PERIOD_CLOSING',
                    description: `سند بستن حساب‌های سود و زیانی پایان دوره مالی ${period.period_name}`,
                    lines: closingLines,
                    date: period.end_date,
                    createdBy: userId
                });
                closingEntryId = entryRes.entryId;
            }

            // Mark period as CLOSED
            db.prepare(`
                UPDATE accounting_periods
                SET status = 'CLOSED',
                    closed_at = CURRENT_TIMESTAMP,
                    closed_by = ?,
                    closing_entry_id = ?
                WHERE id = ?
            `).run(userId, closingEntryId, period.id);

            return {
                success: true,
                periodId: period.id,
                periodName: period.period_name,
                closingEntryId,
                netProfit,
                closedAccountsCount: revenues.length + expenses.length
            };
        });

        return closeTx();
    },

    // ==========================================
    // Cheque Management & State Transitions
    // ==========================================

    /**
     * Create Cheque with double-entry voucher on receipt/issuance.
     * Transitions supported: ISSUED, RECEIVED, DEPOSITED, CLEARED, BOUNCED, RETURNED, CANCELLED.
     */
    createCheque({ chequeNumber, bankName, amount, dueDate, type, partyName, supplierId = null, customerId = null, notes = '', createdBy = 1 }) {
        ensureAccountingSchema();

        const initialStatus = type === 'PAYABLE' ? 'ISSUED' : 'RECEIVED';

        const tx = db.transaction(() => {
            const res = db.prepare(`
                INSERT INTO cheques (cheque_number, bank_name, amount, due_date, type, party_name, supplier_id, customer_id, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(chequeNumber, bankName, amount, dueDate, type, partyName, supplierId, customerId, initialStatus, notes);
            const chequeId = res.lastInsertRowid;

            // Generate double-entry voucher for initial receipt or issuance
            let voucher = null;
            if (type === 'RECEIVABLE') {
                // Dr 106 Notes Receivable / Cr 104 Customer AR (or 401 Sales Revenue)
                const accNotesRec = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '106'`).get().id;
                const accAR = (db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '104'`).get() || 
                               db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get()).id;

                voucher = this.createJournalEntry({
                    referenceType: 'CHEQUE',
                    referenceId: chequeId,
                    purpose: 'CHEQUE_RECEIVED',
                    description: `دریافت چک شماره ${chequeNumber} از ${partyName}`,
                    lines: [
                        { accountId: accNotesRec, debit: amount, credit: 0, description: `اسناد دریافتنی: چک ${chequeNumber}` },
                        { accountId: accAR, debit: 0, credit: amount, description: `تسویه مطالبات از ${partyName}` }
                    ],
                    createdBy
                });
            } else if (type === 'PAYABLE') {
                // Dr 201 Supplier AP / Cr 204 Notes Payable
                const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;
                const accNotesPay = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '204'`).get().id;

                voucher = this.createJournalEntry({
                    referenceType: 'CHEQUE',
                    referenceId: chequeId,
                    purpose: 'CHEQUE_ISSUED',
                    description: `صدور چک شماره ${chequeNumber} در وجه ${partyName}`,
                    lines: [
                        { accountId: accAP, debit: amount, credit: 0, description: `کاهش حساب پرداختنی: ${partyName}` },
                        { accountId: accNotesPay, debit: 0, credit: amount, description: `اسناد پرداختنی: چک ${chequeNumber}` }
                    ],
                    createdBy
                });
            }

            if (voucher) {
                db.prepare(`UPDATE cheques SET journal_entry_id = ? WHERE id = ?`).run(voucher.entryId, chequeId);
            }

            return { chequeId, journalEntryId: voucher ? voucher.entryId : null, status: initialStatus };
        });

        return tx();
    },

    /**
     * Complete Cheque State Machine Transitions:
     * ISSUED, RECEIVED, DEPOSITED, CLEARED, BOUNCED, RETURNED, CANCELLED.
     */
    transitionChequeStatus(chequeId, newStatus, { date = null, bankAccountId = 1, notes = '', createdBy = 1 } = {}) {
        ensureAccountingSchema();

        const ch = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
        if (!ch) throw new Error('چک مورد نظر یافت نشد');

        const tx = db.transaction(() => {
            const transDate = date || new Date().toISOString().split('T')[0];
            let voucherId = null;

            if (ch.type === 'RECEIVABLE') {
                const accNotesRec = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '106'`).get().id;
                const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
                const accAR = (db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '104'`).get() || 
                               db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get()).id;

                if (newStatus === 'CLEARED' || newStatus === 'PASSED') {
                    // Dr 102 Bank / Cr 106 Notes Receivable
                    const v = this.createJournalEntry({
                        referenceType: 'CHEQUE',
                        referenceId: chequeId,
                        purpose: 'CHEQUE_CLEARED',
                        description: `وصول چک دریافتی شماره ${ch.cheque_number} در بانک`,
                        lines: [
                            { accountId: accBank, debit: ch.amount, credit: 0, description: `واریز به بانک بابت چک ${ch.cheque_number}` },
                            { accountId: accNotesRec, debit: 0, credit: ch.amount, description: `وصول چک و خروج از اسناد دریافتنی` }
                        ],
                        date: transDate,
                        createdBy
                    });
                    voucherId = v.entryId;
                } else if (newStatus === 'BOUNCED') {
                    // Dr 104 Customer AR / Cr 106 Notes Receivable
                    const v = this.createJournalEntry({
                        referenceType: 'CHEQUE',
                        referenceId: chequeId,
                        purpose: 'CHEQUE_BOUNCED',
                        description: `برگشت (واخواست) چک دریافتی شماره ${ch.cheque_number}`,
                        lines: [
                            { accountId: accAR, debit: ch.amount, credit: 0, description: `برگشت چک و بدهکار شدن مجدد مشتری ${ch.party_name}` },
                            { accountId: accNotesRec, debit: 0, credit: ch.amount, description: `خروج چک برگشتی از اسناد دریافتنی` }
                        ],
                        date: transDate,
                        createdBy
                    });
                    voucherId = v.entryId;
                } else if (newStatus === 'RETURNED') {
                    // Return cheque to customer: Dr 104 AR / Cr 106 Notes Rec
                    const v = this.createJournalEntry({
                        referenceType: 'CHEQUE',
                        referenceId: chequeId,
                        purpose: 'CHEQUE_RETURNED',
                        description: `استرداد چک شماره ${ch.cheque_number} به صادرکننده`,
                        lines: [
                            { accountId: accAR, debit: ch.amount, credit: 0, description: `استرداد چک به ${ch.party_name}` },
                            { accountId: accNotesRec, debit: 0, credit: ch.amount, description: `خروج چک مسترد شده` }
                        ],
                        date: transDate,
                        createdBy
                    });
                    voucherId = v.entryId;
                }
            } else if (ch.type === 'PAYABLE') {
                const accNotesPay = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '204'`).get().id;
                const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
                const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;

                if (newStatus === 'CLEARED' || newStatus === 'PASSED') {
                    // Dr 204 Notes Payable / Cr 102 Bank
                    const v = this.createJournalEntry({
                        referenceType: 'CHEQUE',
                        referenceId: chequeId,
                        purpose: 'CHEQUE_CLEARED',
                        description: `پاس شدن چک صادره شماره ${ch.cheque_number} در بانک`,
                        lines: [
                            { accountId: accNotesPay, debit: ch.amount, credit: 0, description: `تسویه اسناد پرداختنی چک ${ch.cheque_number}` },
                            { accountId: accBank, debit: 0, credit: ch.amount, description: `کسر از حساب بانک بابت پاس شدن چک` }
                        ],
                        date: transDate,
                        createdBy
                    });
                    voucherId = v.entryId;
                } else if (newStatus === 'BOUNCED') {
                    // Dr 204 Notes Payable / Cr 201 Supplier AP
                    const v = this.createJournalEntry({
                        referenceType: 'CHEQUE',
                        referenceId: chequeId,
                        purpose: 'CHEQUE_BOUNCED',
                        description: `برگشت چک صادره شماره ${ch.cheque_number} به دلیل کسری موجودی`,
                        lines: [
                            { accountId: accNotesPay, debit: ch.amount, credit: 0, description: `لغو چک صادره پاس‌نشده` },
                            { accountId: accAP, debit: 0, credit: ch.amount, description: `بازگشت بدهی به حساب تأمین‌کننده ${ch.party_name}` }
                        ],
                        date: transDate,
                        createdBy
                    });
                    voucherId = v.entryId;
                }
            }

            db.prepare(`
                UPDATE cheques 
                SET status = ?, 
                    clearing_entry_id = COALESCE(?, clearing_entry_id),
                    notes = CASE WHEN ? != '' THEN notes || ' | ' || ? ELSE notes END
                WHERE id = ?
            `).run(newStatus, voucherId, notes, notes, chequeId);

            return { success: true, chequeId, oldStatus: ch.status, newStatus, voucherId };
        });

        return tx();
    },

    getCheques() {
        ensureAccountingSchema();
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

    getChequesAging() {
        return this.getAgingReport();
    },

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
            if (ch.status !== 'PENDING' && ch.status !== 'RECEIVED' && ch.status !== 'ISSUED' && ch.status !== 'DEPOSITED') continue;
            const days = Math.abs(ch.days_until_due || 0);
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
    // Financial Statements (Filtering Posted Vouchers)
    // ==========================================

    /**
     * Profit & Loss Statement (صورت سود و زیان)
     * Incorporates Account 404 (Sales Returns & Allowances) in net sales deduction.
     */
    getProfitAndLoss(startDate = null, endDate = null) {
        ensureAccountingSchema();

        let dateFilter = '';
        const params = [];
        if (startDate && endDate) {
            dateFilter = 'AND je.date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Gross Sales Revenue (401 + 402) on posted vouchers
        const salesRow = db.prepare(`
            SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code IN ('401', '402') AND je.is_posted = 1 ${dateFilter}
        `).get(...params);
        const grossSales = salesRow.total;

        // Sales Discounts (403)
        const discRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '403' AND je.is_posted = 1 ${dateFilter}
        `).get(...params);
        const discounts = discRow.total;

        // Sales Returns & Allowances (404)
        const returnRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '404' AND je.is_posted = 1 ${dateFilter}
        `).get(...params);
        const salesReturns = returnRow.total;

        // Net Sales = Gross Sales - Discounts - Returns
        const netSales = grossSales - discounts - salesReturns;

        // Cost of Goods Sold (COGS - 501)
        const cogsRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE coa.code = '501' AND je.is_posted = 1 ${dateFilter}
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
            LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id 
                AND je.is_posted = 1 
                ${dateFilter ? 'AND je.date BETWEEN ? AND ?' : ''}
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
            salesReturns,
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

    /**
     * Balance Sheet (ترازنامه استاندارد حسابداری)
     */
    getBalanceSheet(targetDate = null) {
        const coaList = this.getChartOfAccounts();

        const assets = coaList.filter(c => c.type === 'ASSET');
        const liabilities = coaList.filter(c => c.type === 'LIABILITY');
        const equities = coaList.filter(c => c.type === 'EQUITY');

        const totalAssets = assets.reduce((sum, a) => sum + a.net_balance, 0);
        const totalLiabilities = liabilities.reduce((sum, l) => sum + l.net_balance, 0);
        
        const pnl = this.getProfitAndLoss(null, targetDate);
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

    /**
     * Four-Column Trial Balance (تراز آزمایشی ۴ ستونی با فیلتر اسناد قطعی)
     */
    getTrialBalance() {
        ensureAccountingSchema();
        return db.prepare(`
            SELECT 
                coa.code,
                coa.name_fa,
                coa.type,
                COALESCE(SUM(pl.debit), 0) AS total_debit,
                COALESCE(SUM(pl.credit), 0) AS total_credit,
                CASE 
                    WHEN COALESCE(SUM(pl.debit - pl.credit), 0) > 0 THEN COALESCE(SUM(pl.debit - pl.credit), 0)
                    ELSE 0
                END AS debit_balance,
                CASE 
                    WHEN COALESCE(SUM(pl.credit - pl.debit), 0) > 0 THEN COALESCE(SUM(pl.credit - pl.debit), 0)
                    ELSE 0
                END AS credit_balance
            FROM chart_of_accounts coa
            LEFT JOIN (
                SELECT jl.account_id, jl.debit, jl.credit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.is_posted = 1
            ) pl ON coa.id = pl.account_id
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all();
    },

    /**
     * Cash Flow Statement (صورت جریان وجوه نقد بر پایه سرفصل‌های نقد و بانک ۱۰۱ و ۱۰۲)
     */
    getCashFlow(startDate = null, endDate = null) {
        ensureAccountingSchema();

        let dateFilter = '';
        const params = [];
        if (startDate && endDate) {
            dateFilter = 'AND je.date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Cash inflows (debits to 101 or 102)
        const inflows = db.prepare(`
            SELECT 
                je.description,
                je.date,
                jl.debit AS amount,
                coa.code AS liquid_account
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            WHERE coa.code IN ('101', '102') AND jl.debit > 0 AND je.is_posted = 1 ${dateFilter}
            ORDER BY je.date ASC
        `).all(...params);

        // Cash outflows (credits to 101 or 102)
        const outflows = db.prepare(`
            SELECT 
                je.description,
                je.date,
                jl.credit AS amount,
                coa.code AS liquid_account
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            WHERE coa.code IN ('101', '102') AND jl.credit > 0 AND je.is_posted = 1 ${dateFilter}
            ORDER BY je.date ASC
        `).all(...params);

        const totalInflow = inflows.reduce((sum, r) => sum + r.amount, 0);
        const totalOutflow = outflows.reduce((sum, r) => sum + r.amount, 0);
        const netCashFlow = totalInflow - totalOutflow;

        return {
            inflows,
            outflows,
            totalInflow,
            totalOutflow,
            netCashFlow,
            currentCashBalance: this.getCashBalance(),
            currentBankBalance: this.getBankBalance(),
            totalLiquidFunds: this.getCashBalance() + this.getBankBalance()
        };
    },

    // ==========================================
    // Operating Expenses
    // ==========================================

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

            const jRes = this.createJournalEntry({
                referenceType: 'EXPENSE',
                referenceId: expId,
                purpose: 'EXPENSE_PAYMENT',
                description: description || `ثبت هزینه ${category}`,
                lines: [
                    { accountId: expAcc, debit: amount, credit: 0, description },
                    { accountId: bankAcc, debit: 0, credit: amount, description: 'پرداخت از بانک بابت هزینه' }
                ],
                date: pDate,
                createdBy
            });

            return expId;
        });

        return expTx();
    },

    // ==========================================
    // Fixed Costs & Periodic Overhead
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
            const today = new Date().toISOString().split('T')[0];
            const desc = `پرداخت هزینه ثابت: ${cost.title} (${cost.frequency === 'MONTHLY' ? 'دوره ماهانه' : cost.frequency})`;

            const entryRes = this.createJournalEntry({
                referenceType: 'FIXED_COST',
                referenceId: id,
                purpose: 'FIXED_COST_PAYMENT',
                description: desc,
                lines: [
                    { accountId: cost.account_id, debit: cost.amount, credit: 0, description: `بدهکار: ${cost.title}` },
                    { accountId: creditAcc.id, debit: 0, credit: cost.amount, description: `بستانکار: پرداخت از ${creditAcc.name_fa}` }
                ],
                date: today,
                createdBy: 1
            });

            db.prepare(`UPDATE fixed_costs SET last_paid_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

            return { entryId: entryRes.entryId, entryNumber: entryRes.entryNumber, amount: cost.amount };
        });

        return tx();
    },

    updateAccount(id, { code, nameFa, description }) {
        db.prepare(`
            UPDATE chart_of_accounts
            SET code = COALESCE(?, code),
                name_fa = COALESCE(?, name_fa),
                description = COALESCE(?, description)
            WHERE id = ?
        `).run(code, nameFa, description, id);
        return { success: true };
    }
};

module.exports = accountingService;
