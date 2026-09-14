# Project: ARAYESHI Cosmetics Retail ERP Transformation

## Architecture
- **Layered Architecture**:
  - `routes/`: Modular Express router definitions mounting URL endpoints and route-level authorization middleware.
  - `controllers/`: HTTP request validation, DTO mapping, and response formatting.
  - `services/`: Pure business logic, transactional invariants, double-entry ledger postings, FEFO allocations.
  - `repositories/` / `db/`: Direct SQLite interaction (`better-sqlite3`), transactional wrappers, and migration runner.
  - `middleware/`: Authentication (`authenticateToken`), authorization (`authorizeRoles`), error handling, and request auditing.
- **Cross-Domain Data Flow**:
  - Every operational business event (Sale, Return, Purchase, Adjustment, Expense, Wallet, Loyalty) synchronously triggers domain service transactions.
  - Domain service calls `accountingService.createJournalEntry` within the same SQLite transaction (`BEGIN IMMEDIATE`), ensuring atomicity.
  - General Ledger is the single financial source of truth: Cash, Bank, Customer Wallet Liability, and Inventory Valuation derive from or strictly reconcile to the GL.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Git Working Branch | Dedicated branch `refactor/erp-core-integration` created and active | M1 | R1 |
| 2 | SQLite Binary Git Isolation | Untrack `db/arayeshi_erp.sqlite3` from git index; ignore `*.sqlite3` and `backups/` in `.gitignore` | M1 | R1 |
| 3 | Automated Backup Script | `npm run backup` with SQLite native online backup (`better-sqlite3`) to `backups/` | M1 | R1 |
| 4 | Automated Restore Script | `npm run restore` with pre-restore safety copy and integrity check | M1 | R1 |
| 5 | Versioned Migration Runner | `db/migrator.js` tracking executed migrations in `schema_migrations` table | M1 | R1 |
| 6 | Baseline Schema Migration | `001_baseline_schema.sql` consolidating live schema, campaign tables, settings, and initial checks | M1 | R1 |
| 7 | Eliminate Silent-Catch ALTER | Remove error-swallowing `try { ALTER TABLE ... } catch (e) {}` from `db/database.js` | M1 | R1 |
| 8 | Destructive Seeding Guard | Guard `db/seed.js` with `ALLOW_DESTRUCTIVE_SEED=true` environment flag | M1 | R1 |
| 9 | Strict Double-Entry Invariant | Enforce `SUM(debit) == SUM(credit)` check inside transaction; fail commit on imbalance | M2 | R2 |
| 10 | Chart of Accounts Expansion | Add Customer Wallet Liability (`205`) and Notes Receivable (`106`); enable Notes Payable (`204`) | M2 | R2 |
| 11 | Unique Voucher Reference Guard | Unique composite constraint / guard on `(reference_type, reference_id, purpose)` | M2 | R2 |
| 12 | Bank & Cash GL Reconciliation | Bank and Cash balances derive from or strictly reconcile with Accounts `102` and `101` | M2 | R2 |
| 13 | Comprehensive Financial Reports | Trial Balance, P&L, Balance Sheet, Cash Flow with posted-voucher filtering | M2 | R2 |
| 14 | Accounting Period Closing | Period closing mechanism transferring current period P&L net profit to Retained Earnings (`302`) | M2 | R2 |
| 15 | Cheque Lifecycle Management | Full state transitions (`PENDING`, `PASSED`, `BOUNCED`, `CANCELLED`) with double-entry journal postings | M2 | R2 |
| 16 | Available Stock Invariant | Enforce available stock as `quantity - reserved_quantity` across all sales and stock checks | M3 | R3 |
| 17 | FEFO Allocation on Unreserved Stock | Allocate batches by earliest expiry date consuming only `quantity - reserved_quantity` | M3 | R3 |
| 18 | Inventory GL Opening Valuation | Reconcile batch cost valuation with GL Account `103` (resolve 339,450,000 Toman variance) | M3 | R3 |
| 19 | Multi-Warehouse Transfers | Warehouse transfer workflow with inter-warehouse transit and GL journal entries | M3 | R3 |
| 20 | Stock Count Adjustments | Adjustment vouchers for stock count variance (Dr/Cr 608 vs 103) with warehouse support | M3 | R3 |
| 21 | Tester Write-Off Workflow | Automated store cosmetics tester conversion with Dr 604 / Cr 103 | M3 | R3 |
| 22 | Damaged & Expired Write-Downs | Write off damaged and expired cosmetics batches with Dr 607 / Cr 103 | M3 | R3 |
| 23 | POS Checkout Idempotency | Idempotency keys on checkout preventing duplicate orders, payments, and stock deductions | M4 | R4 |
| 24 | Cash Drawer Session Verification | Require an `OPEN` cash drawer session before processing cash sales or returns | M4 | R4 |
| 25 | POS Split Payments Allocation | Route Cash to `101`, Card to `102`, Wallet to `205`, Points to `603`, Cheque to `106` | M4 | R4 |
| 26 | Order Payment Sum Validation | Validate `SUM(payments) == order_total` and dynamically set `PAID`, `PARTIAL`, `UNPAID` | M4 | R4 |
| 27 | Customer Wallet Liability Non-Negative | Enforce `wallet_balance >= 0` check constraint and prevent over-debiting on checkout | M4 | R4 |
| 28 | Sales Returns Order Derivation | Enforce original order link, return quantity <= purchased quantity, and anti-double-return | M4 | R4 |
| 29 | Sales Returns Accounting Reversal | Reversal of Revenue (401), COGS (501), Inventory (103), Tax (202), and loyalty points | M4 | R4 |
| 30 | Single-Transaction Exchange | Exchange settlement in a unified transaction combining return and new purchase | M4 | R4 |
| 31 | Procurement Lifecycle Service | `services/procurementService.js` handling PO -> Goods Receipt -> Supplier Invoice | M5 | R5 |
| 32 | Supplier AP Sub-Ledger | Track outstanding invoices, credit terms, and balances per individual supplier | M5 | R5 |
| 33 | Supplier Payment Settlements | Endpoint and logic to record supplier payments against open invoices with GL postings | M5 | R5 |
| 34 | Purchase Returns (Debit Notes) | Purchase return workflow reversing supplier AP (Dr 201) and inventory (Cr 103) | M5 | R5 |
| 35 | Unified Customer Domain Service | `services/crmService.js` unifying customer profiles, mobile normalization, and history | M6 | R6 |
| 36 | Derived RFM & CLV Engine | Dynamic derivation of RFM scores and CLV from verified order records without redundant drift | M6 | R6 |
| 37 | Configurable Loyalty Tier Rules | Dynamic tier qualification (`BRONZE`, `SILVER`, `GOLD`, `VIP`) and points accrual/redemption | M6 | R6 |
| 38 | Loyalty Transaction Audit Log | Immutable points movement audit log with return reversals and balance tracking | M6 | R6 |
| 39 | Modular Server Architecture | Refactor monolithic `server.js` (<150 lines) into `routes/`, `controllers/`, `services/`, `middleware/` | M7 | R7 |
| 40 | Secure Password Hashing (bcrypt) | Install `bcryptjs` and hash user passwords; update seed script to use bcrypt hashes | M7 | R7 |
| 41 | Authentication & Route Guards | Auth endpoints (`/api/auth/login`, `/me`) and JWT/session RBAC route middleware | M7 | R7 |
| 42 | Tamper-Evident Audit Trail | `services/auditService.js` logging `actor`, `action`, `entity`, `before_state`, `after_state`, `timestamp` | M7 | R7 |
| 43 | TOMAN Currency Standardization | Standardize integer Toman monetary calculations; eliminate fractional floating-point drift | M7 | R7 |
| 44 | Configurable System Settings | `system_settings` table and `services/settingsService.js` replacing hardcoded IDs | M7 | R7 |
| 45 | Automated Test Suite (npm test) | Unit, integration, and full E2E lifecycle test suite passing 100% via `npm test` | M7 / Final | R8 |
| 46 | Core Reconciliation Service | `services/reconciliationService.js` and `GET /api/admin/reconciliation` with CRITICAL: 0 | M7 / Final | R8 |
| 47 | GitHub Actions CI Workflow | `.github/workflows/ci.yml` validating migrations, tests, and reconciliation on push | M7 / Final | R8 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Safety, DB Preservation & Migration Engine | Features 1–8: Git branch, untrack sqlite, backup/restore scripts, migration runner, baseline migration, seed guard | none | IN_PROGRESS |
| M2 | Core Event Atomicity & Double-Entry Accounting | Features 9–15: Strict double-entry balance, COA expansion (205, 106), voucher reference guard, bank/cash reconciliation, reports, period closing, check lifecycle | M1 | PLANNED |
| M3 | Inventory Ledger, FEFO Allocation & Warehouses | Features 16–22: Available stock invariant, FEFO allocation on unreserved stock, opening inventory GL reconciliation, multi-warehouse, stock counts, tester/damage write-downs | M1, M2 | PLANNED |
| M4 | POS Checkout, Split Payments & Returns | Features 23–30: Idempotency, cash session check, split payments GL allocation, wallet liability non-negative, return order derivation, GL reversal, single-tx exchange | M1, M2, M3 | PLANNED |
| M5 | Procurement & Supplier Accounts Payable | Features 31–34: Procurement service (PO -> GRN -> Invoice), supplier AP sub-ledger, supplier payments, purchase returns | M1, M2, M3 | PLANNED |
| M6 | CRM 360, Loyalty Engine & Marketing | Features 35–38: Customer domain service, derived RFM/CLV, configurable tier & redemption rules, points audit log & return reversal | M1, M2, M4 | PLANNED |
| M7 | Modular API, RBAC Security, Audit Trail & Reconciliation | Features 39–44, 46–47: Modular server refactoring, bcrypt hashing, auth & RBAC guards, audit trail service, TOMAN standardization, settings service, reconciliation endpoint, CI | M1–M6 | PLANNED |
| Final | Full E2E Test Suite & Adversarial Hardening | Feature 45 + Full E2E test suite pass (Tiers 1–4) and Tier 5 Adversarial Coverage Hardening | M1–M7 | PLANNED |

## Interface Contracts

### Accounting ↔ POS / Sales
- `accountingService.createJournalEntry({ referenceType, referenceId, purpose, description, lines, date, createdBy })`
  - Invariant: `lines.reduce((s, l) => s + (l.debit || 0), 0) === lines.reduce((s, l) => s + (l.credit || 0), 0)`
  - Returns: `{ id: number, entryNumber: string }`
  - Rejects: If debit !== credit or duplicate `(referenceType, referenceId, purpose)`.
- Split Payment Mapping:
  - `CASH`: Debit Account `101` (`صندوق نقد`)
  - `CARD`: Debit Account `102` (`بانک و کارت‌خوان`)
  - `WALLET`: Debit Account `205` (`بدهی کیف پول مشتریان`)
  - `POINTS`: Debit Account `603` (`هزینه تخفیفات و وفاداری`)
  - `CHEQUE`: Debit Account `106` (`اسناد دریافتنی`)

### Inventory ↔ POS
- `inventoryService.allocateStockFEFO(productVariantId, requestedQty, warehouseId)`
  - Condition: Available stock = `quantity - reserved_quantity >= requestedQty`.
  - Returns: Array of `{ batchId, quantity, unitCost }` ordered by `expiry_date ASC`.
- `inventoryService.reverseStockAllocation(items, warehouseId)`
  - Re-increments batch quantity and records `RETURN` stock transaction.

### Customer Wallet ↔ POS / CRM
- `crmService.debitWallet(customerId, amount, orderId)`
  - Precondition: `customer.wallet_balance >= amount`.
  - Updates: `wallet_balance = wallet_balance - amount`.
  - Records: `wallet_transactions` record and triggers GL voucher: Dr `205` Customer Wallet Liability, Cr Revenue/Settlement.

### Procurement ↔ Accounting & Inventory
- `procurementService.receiveGoods(poId, items, warehouseId, invoiceDetails)`
  - Creates batches with `(batch_number, expiry_date, purchase_price, quantity)`.
  - Records GL: Dr `103` Inventory, Cr `201` Accounts Payable (Supplier sub-ledger).

### Audit Trail Contract
- `auditService.log({ actor: { id, name, role }, action, entity, entityId, before, after, ipAddress })`
  - Inserts into `audit_logs` with JSON snapshots of `before_state` and `after_state`.

## Code Layout
- `server.js`: Lightweight application bootstrap, Express setup, middleware registration (<150 lines).
- `routes/`:
  - `authRoutes.js`, `posRoutes.js`, `inventoryRoutes.js`, `accountingRoutes.js`, `procurementRoutes.js`, `crmRoutes.js`, `marketingRoutes.js`, `reportRoutes.js`, `settingsRoutes.js`, `reconciliationRoutes.js`
- `middleware/`:
  - `auth.js` (`authenticateToken`), `rbac.js` (`authorizeRoles`), `errorHandler.js`, `auditLogger.js`
- `services/`:
  - `accountingService.js`, `inventoryService.js`, `posService.js`, `procurementService.js`, `crmService.js`, `marketingService.js`, `reportService.js`, `biService.js`, `authService.js`, `auditService.js`, `settingsService.js`, `reconciliationService.js`
- `db/`:
  - `database.js` (database connection, foreign keys enabled, WAL mode)
  - `migrator.js` (migration runner)
  - `migrations/` (`001_baseline_schema.sql`, `002_*.sql`, etc.)
  - `seed.js` (guarded seed script)
- `scripts/`:
  - `backup.js`, `restore.js`
- `tests/`:
  - `e2e/`, `integration/`, `unit/`
