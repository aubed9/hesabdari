-- Migration 002: Add missing critical chart of accounts entries
-- 106 = Notes Receivable (for cheques), 205 = Customer Wallet Liability, 404 = Sales Returns
INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id) 
  VALUES ('106', 'Notes & Cheques Receivable', 'اسناد و چک‌های دریافتنی', 'ASSET', NULL);
INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id) 
  VALUES ('205', 'Customer Wallet Liability', 'بدهی کیف پول مشتریان', 'LIABILITY', NULL);
INSERT OR IGNORE INTO chart_of_accounts (code, name, name_fa, type, parent_id) 
  VALUES ('404', 'Sales Returns & Allowances', 'برگشت از فروش و تخفیفات', 'REVENUE', NULL);
