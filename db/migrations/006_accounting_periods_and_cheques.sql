-- Migration 006: Accounting Periods, Cheque State Machine, and Immutability Guard
-- Requirement R2: Double-Entry Accounting Core, AR/AP Sub-Ledgers & Immutability

-- 1. Accounting Periods Table
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

-- 2. Add columns to journal_entries
ALTER TABLE journal_entries ADD COLUMN purpose TEXT;
ALTER TABLE journal_entries ADD COLUMN reversed_by_id INTEGER REFERENCES journal_entries(id);
ALTER TABLE journal_entries ADD COLUMN reverse_of_id INTEGER REFERENCES journal_entries(id);

-- Unique composite guard on (reference_type, reference_id, purpose)
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_ref_purpose 
ON journal_entries(reference_type, reference_id, purpose) 
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL AND purpose IS NOT NULL;

-- 3. Add columns to cheques
ALTER TABLE cheques ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id);
ALTER TABLE cheques ADD COLUMN clearing_entry_id INTEGER REFERENCES journal_entries(id);

-- 4. Ensure critical Chart of Accounts entries exist without schema drift
INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id)
VALUES ('106', 'Notes & Cheques Receivable', 'اسناد و چک‌های دریافتنی', 'ASSET', NULL);

INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id)
VALUES ('204', 'Notes & Cheques Payable', 'اسناد پرداختنی (چک‌های صادره)', 'LIABILITY', NULL);

INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id)
VALUES ('205', 'Customer Wallet Liability', 'بدهی کیف پول مشتریان', 'LIABILITY', NULL);

INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id)
VALUES ('302', 'Retained Earnings', 'سود (زیان) انباشته', 'EQUITY', NULL);

-- 5. Invariant Trigger for Immutability: Prevent modification or deletion of posted vouchers
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
