# Comprehensive System Audit & Baseline Freeze 2026
**Project**: ARAYESHI Retail ERP Hardening  
**Target Database**: `db/arayeshi_erp.sqlite3`  
**Audit Timestamp**: 2026-09-17T01:10:00Z  
**Auditor**: Database Reliability Engineer (`teamwork_preview_worker_r1_1`)  
**Status**: BASELINE FROZEN & AUDITED  

---

## 1. Executive Summary & Database Health

A full forensic baseline audit and freeze of the live SQLite database (`db/arayeshi_erp.sqlite3`) was executed prior to initiating core hardening operations.

### 1.1 Physical & Pragma Health Metrics
| Metric | Value | Status |
|---|---|---|
| **Database File Path** | `d:\ARAYESHI\db\arayeshi_erp.sqlite3` | Verified |
| **File Size** | 2,641,920 bytes (~2.52 MB) | Verified |
| **Journal Mode** | `WAL` (Write-Ahead Logging) | Optimal |
| **Synchronous Mode** | `NORMAL` | Optimal |
| **Foreign Keys** | `ON` | Enforced |
| **`PRAGMA integrity_check`** | `ok` (0 page/btree corruption errors) | **PASSED** |
| **`PRAGMA foreign_key_check`** | `0` violations | **PASSED** |
| **Active Tables** | 49 user tables | Verified |
| **Migration Tracking Table** | `schema_migrations` present | Active |
| **Total Applied Migrations** | 4 migrations | Up to date |

---

## 2. Schema Migration History

The database tracks schema versions using the `schema_migrations` table with SHA-256 content verification:

| ID | Migration Name | Applied At (UTC) | Checksum (SHA-256) | Status |
|---|---|---|---|---|
| 1 | `001_baseline_schema.sql` | 2026-09-14 20:10:03 | `2b4f5514d5c698da5d512dd758c29c850d5703ff239324bd75037a4a48f87f5b` | APPLIED |
| 2 | `002_add_missing_accounts.sql` | 2026-09-16 19:45:56 | `fee45dc239a5e9ed81c4dc7d94a4a070455017140b6990ec0efc7c7b76805aed` | APPLIED |
| 3 | `003_returns_and_exchanges.sql` | 2026-09-16 19:45:56 | `f4ff26f87afef19ba830be21038cdbb7300133f3bf4b77b8bac847bf2a37ba6d` | APPLIED |
| 4 | `004_procurement_and_supplier_ap.sql` | 2026-09-16 19:56:14 | `a2bc5cd16fbe0e9482801a01fa7e42623e489600ec0ada665614903bd81667b3` | APPLIED |

---

## 3. Database Table Inventory & Row Counts

The database contains 49 user tables categorized by domain:

| Domain | Table Name | Row Count | Description |
|---|---|---|---|
| **Accounting** | `chart_of_accounts` | 26 | Standard Iranian retail chart of accounts |
| | `journal_entries` | 2,065 | General ledger journal vouchers |
| | `journal_lines` | 8,620 | Debit/credit distribution lines |
| | `cheques` | 3 | Commercial paper / bank cheques |
| | `expenses` | 21 | Operating and store operational expenses |
| | `fixed_costs` | 4 | Store recurring fixed obligations |
| **Inventory** | `inventory_batches` | 179 | FEFO lots with purchase cost and expiries |
| | `products` | 15 | Master product definitions |
| | `product_variants` | 19 | SKU and shade variations |
| | `stock_transactions` | 3,821 | Immutable stock movement ledger |
| | `warehouses` | 1 | Storage locations |
| | `stock_counts` | 0 | Stock audit sessions |
| | `stock_count_items` | 0 | Physical stock count line items |
| | `testers` | 3 | Store tester cosmetic allocations |
| **POS & Sales** | `orders` | 1,963 | Sales transactions header |
| | `order_items` | 3,803 | Sales transaction lines |
| | `payments` | 2,146 | Payment tender lines (Cash, Card, Wallet) |
| | `cash_registers` | 1 | Hardware POS stations |
| | `cash_sessions` | 1 | Cash drawer opening/closing sessions |
| | `returns` | 0 | Sales returns |
| | `return_items` | 0 | Sales return lines |
| | `exchanges` | 0 | Product exchange vouchers |
| **CRM & Loyalty** | `customers` | 9 | Customer master records |
| | `loyalty_transactions` | 1,267 | Points earned and redeemed ledger |
| | `wallet_transactions` | 1 | Customer wallet deposit/spend ledger |
| | `wishlists` | 2 | Customer desired item lists |
| | `coupons` | 3 | Discount coupon codes |
| **Procurement** | `suppliers` | 4 | Cosmetics vendors and manufacturers |
| | `purchase_orders` | 86 | Procurement purchase orders |
| | `purchase_order_items` | 157 | Procurement line items |
| | `supplier_payments` | 0 | Accounts payable payment vouchers |
| | `purchase_returns` | 0 | Debit notes to suppliers |
| | `purchase_return_items` | 0 | Returned purchase lines |
| **System & Auth** | `users` | 6 | Staff and operator accounts |
| | `branches` | 1 | Store branches |
| | `organizations` | 1 | Enterprise legal entity |
| | `bank_accounts` | 2 | Store commercial bank accounts |
| | `system_settings` | 5 | Global configurable key-value parameters |
| | `audit_logs` | 2 | Security and event audit trail |
| | `schema_migrations` | 4 | Applied migration version tracking |
| | `categories` | 15 | Product taxonomy categories |
| | `brands` | 9 | Cosmetic brand catalog |
| | `alerts` | 15 | System operational notifications |
| | `back_in_stock_alerts` | 0 | Inventory replenishment notifications |
| | `campaigns` | 4 | Marketing SMS and discount campaigns |
| | `campaign_recipients` | 1 | Target recipient list for campaigns |
| | `commissions` | 0 | Staff sales commissions |
| | `shifts` | 0 | Cashier shift schedules |
| | `shipments` | 0 | Courier shipments |

---

## 4. Baseline Financial Trial Balance

Calculated directly from all committed `journal_lines` in the General Ledger:

| Code | Account Title | Type | Total Debit (TOMAN) | Total Credit (TOMAN) | Balance (TOMAN) |
|---|---|---|---|---|---|
| `101` | Cash On Hand (صندوق نقد) | ASSET | 1,319,183,200 | 0 | +1,319,183,200 |
| `102` | Bank & POS Terminals (بانک و پوز) | ASSET | 4,100,164,800 | 501,000,000 | +3,599,164,800 |
| `103` | Merchandise Inventory (موجودی کالا) | ASSET | 3,585,260,000 | 3,582,170,000 | +3,090,000 |
| `104` | Accounts Receivable (حساب‌های دریافتنی) | ASSET | 0 | 0 | 0 |
| `105` | Petty Cash (تنخواه‌گردان) | ASSET | 0 | 0 | 0 |
| `106` | Notes & Cheques Receivable (اسناد دریافتنی) | ASSET | 0 | 0 | 0 |
| `201` | Accounts Payable (بستانکاران تجاری) | LIABILITY | 0 | 3,585,260,000 | -3,585,260,000 |
| `202` | Sales Tax Payable (مالیات بر ارزش افزوده) | LIABILITY | 0 | 0 | 0 |
| `203` | Salaries Payable (حقوق پرداختنی) | LIABILITY | 0 | 0 | 0 |
| `204` | Notes & Cheques Payable (اسناد پرداختنی) | LIABILITY | 0 | 0 | 0 |
| `205` | Customer Wallet Liability (بدهی کیف پول) | LIABILITY | 0 | 0 | 0 |
| `301` | Owners Capital (سرمایه اولیه) | EQUITY | 0 | 0 | 0 |
| `302` | Retained Earnings (سود انباشته) | EQUITY | 0 | 0 | 0 |
| `401` | POS Sales Revenue (درآمد فروش فروشگاهی) | REVENUE | 0 | 5,522,300,000 | -5,522,300,000 |
| `402` | Online Sales Revenue (درآمد فروش آنلاین) | REVENUE | 0 | 0 | 0 |
| `403` | Sales Discounts & Rebates (تخفیفات فروش) | REVENUE | 102,952,000 | 0 | +102,952,000 |
| `404` | Sales Returns & Allowances (برگشت از فروش) | REVENUE | 0 | 0 | 0 |
| `501` | Cost of Goods Sold (بهای تمام‌شده کالای فروش‌رفته) | COGS | 3,582,170,000 | 0 | +3,582,170,000 |
| `601` | Rent Expense (هزینه اجاره) | EXPENSE | 210,000,000 | 0 | +210,000,000 |
| `602` | Salary & Commission (هزینه حقوق و دستمزد) | EXPENSE | 270,000,000 | 0 | +270,000,000 |
| `603` | Marketing & Advertising (هزینه تبلیغات) | EXPENSE | 21,000,000 | 0 | +21,000,000 |
| `604` | Tester & Sampling Expense (هزینه تستر) | EXPENSE | 0 | 0 | 0 |
| `605` | Packaging & Courier (هزینه بسته‌بندی) | EXPENSE | 0 | 0 | 0 |
| `606` | Utilities & Bills (هزینه قبوض) | EXPENSE | 0 | 0 | 0 |
| `607` | Damaged & Expired Waste (ضایعات انبار) | EXPENSE | 0 | 0 | 0 |
| `608` | Cash & Inventory Variance (کسری و اضافی) | EXPENSE | 0 | 0 | 0 |
| **TOTAL** | **Double-Entry Balance Verification** | | **13,190,730,000** | **13,190,730,000** | **0 (BALANCED)** |

---

## 5. Sub-Ledger Analysis & Invariant Checks

### 5.1 Inventory Sub-Ledger vs General Ledger
- **Active Physical Batches**: 179 batches
- **Total Physical On-Hand Units**: 622 units
- **Total Reserved Units (Layaway/Pending)**: 1 unit
- **Available For Sale (`quantity - reserved_quantity`)**: 621 units
- **Total Inventory Sub-Ledger Valuation (`SUM(quantity * purchase_price)`)**: 342,540,000 TOMAN
- **General Ledger Account 103 Balance**: 3,090,000 TOMAN
- **Variance**: 339,450,000 TOMAN
  - *Root Cause*: Historical seed and initial product inventory loads occurred without corresponding opening inventory journal vouchers (Dr 103 / Cr 301). Milestone M3 will harmonize this opening variance.

### 5.2 Customer Wallet Sub-Ledger vs General Ledger
- **Customer Master Count**: 9 registered customers
- **Total Wallet Balances in CRM**: 950,000 TOMAN
- **GL Account 205 (Customer Wallet Liability)**: 0 TOMAN
- **Variance**: 950,000 TOMAN
  - *Root Cause*: Initial customer wallet balance was seeded without booking against Liability Account 205. Hardening in R2/R6 will enforce journal linkage on all wallet operations.

### 5.3 Cash Drawer & Bank Accounts vs General Ledger
- **GL Account 101 (Cash on Hand)**: 1,319,183,200 TOMAN
- **GL Account 102 (Bank & POS Terminals)**: 3,599,164,800 TOMAN
- **Sum of Liquid Funds**: 4,918,348,000 TOMAN

---

## 6. Severity-Ranked Findings & Hardening Roadmap

| # | Domain | Severity | Finding Description | Current Status | Hardening Resolution |
|---|---|---|---|---|---|
| **F-01** | Database Constraints | **CRITICAL** | Database lacked CHECK constraints on `quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= quantity`, `wallet_balance >= 0`, `amount >= 0`, and `returned_quantity <= quantity`. | Active Risk | Enforce SQLite triggers and CHECK constraints via versioned migration `005_enforce_database_constraints.sql`. |
| **F-02** | Database Safety | **CRITICAL** | `db/database.js` previously executed silent-catch `ALTER TABLE` statements which swallowed errors during table changes. | Active Risk | Remove silent `ALTER TABLE` blocks; channel all schema changes strictly through `db/migrator.js`. |
| **F-03** | Data Preservation | **CRITICAL** | `db/seed.js` dropped tables destructively upon invocation without safety guard flags. | Active Risk | Wrap destructive seeding in `ALLOW_DESTRUCTIVE_SEED=true` environment guard. |
| **F-04** | Startup Reliability | **HIGH** | Server startup lacked automatic migration runner execution before opening the HTTP port. | Active Risk | Require `migrator.runMigrations()` to execute successfully before HTTP listen starts in `server.js` and `db/database.js`. |
| **F-05** | Graceful Termination | **HIGH** | Process termination (`SIGINT`, `SIGTERM`) did not guarantee WAL truncation (`PRAGMA wal_checkpoint(TRUNCATE)`), leaving open WAL files. | Active Risk | Register graceful process shutdown hooks in `db/database.js` / `server.js`. |
| **F-06** | Backup Integrity | **HIGH** | Backup system lacked automated retention policies (daily/weekly/monthly) and backup manifest index (`manifest.json`). | Remediated in R1 | Upgrade `scripts/backup.js` to track metadata in `backups/manifest.json` and prune expired backups. |
| **F-07** | Restore Safety | **HIGH** | Restore script did not create pre-restore snapshot or clean up stale `.tmp-*` WAL artifacts. | Remediated in R1 | Upgrade `scripts/restore.js` with pre-restore safety copy, atomic rename, and post-restore integrity check. |
| **F-08** | Inventory Drift | **MEDIUM** | Opening inventory GL Account 103 variance of 339,450,000 Toman from physical batch valuation. | Documented | Scheduled for Milestone M3 inventory opening journal alignment. |
| **F-09** | Wallet Liability | **MEDIUM** | Customer wallet balances exist without corresponding General Ledger liability entries in Account 205. | Documented | Scheduled for Milestone M2/M6 wallet reconciliation. |

---

## 7. Baseline Certification

The system state has been preserved, verified, and certified:
- Zero SQLite corruption detected.
- Zero foreign key violations.
- Double-entry general ledger is mathematically balanced (`SUM(Dr) == SUM(Cr) = 13,190,730,000 TOMAN`).
- Baseline snapshot archived in `backups/`.
