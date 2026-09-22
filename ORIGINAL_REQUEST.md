# Original User Request

## 2026-09-14T19:10:44Z

# Teamwork Project Prompt

> Status: Launched
> Goal: Multi-agent execution in progress
> Requested team: Full multi-agent engineering team (Senior ERP Architect, Accounting Engineer, DB Engineer, QA Lead)

Transform the cosmetics retail management system into an atomic, unified, double-entry Retail ERP platform where every business event (Sale, Purchase, Return, Exchange, Stock Count, Expense, Wallet, Loyalty) synchronously and immutably synchronizes across POS, Inventory/FEFO, Accounting, CRM, and Cash/Bank.

Working directory: d:\ARAYESHI
Integrity mode: development

## Requirements

### R1. Safety, Database Preservation & Zero Data Loss (Phase 0 & 16 & 27 & 28)
- Work on a dedicated git branch (`refactor/erp-core-integration`).
- Treat `db/arayeshi_erp.sqlite3` as production-like data; never reset it destructively. Backup before migrations with automated `npm run backup` and `npm run restore`.
- Eliminate silent-catch `ALTER TABLE` statements; introduce a versioned migration runner (`db/migrations/`) tracked in `schema_migrations`.
- Keep the runtime SQLite database out of git tracking (`.gitignore`), while retaining seed data and schemas.

### R2. Core Event Atomicity & Double-Entry Accounting Engine (Phases 1, 2, 4, 5, 12, 13)
- Enforce strict double-entry invariants: every journal entry must balance (`SUM(debit) == SUM(credit)`), prevent posting unbalanced entries, and require reverse/replacement for posted vouchers.
- Eliminate separate un-reconciled sources of truth: Bank & Cash account balances must derive directly from or reconcile strictly with the General Ledger.
- Support complete financial chart of accounts, journal line ledger, trial balance, P&L, balance sheet, cash flow, period closing, and check life-cycle management (Received/Issued/Cleared/Bounced).
- Prevent duplicate journal entries with unique composite references (`reference_type`, `reference_id`, `purpose`).

### R3. Inventory Ledger, FEFO Allocation & Warehouse Controls (Phases 2, 3, 7, 11)
- Calculate available stock strictly as `quantity - reserved_quantity`, eliminating layaway reservation leakage into regular sales.
- Ensure FEFO allocation consumes only unreserved stock based on actual batch costs and earliest expiration dates.
- Implement multi-warehouse transfers, stock count adjustment journals, tester write-off workflows, damaged/expired stock write-downs, and inventory GL valuation reconciliation.

### R4. POS Checkout, Split Payments & Sales Returns/Exchanges (Phases 2, 3, 10)
- Protect POS checkout with idempotency keys, strict price/discount validation, and cash drawer session verification.
- Reconcile split payments (Cash, Card, Wallet, Loyalty Points, Cheque) to their corresponding accounting ledgers rather than dumping everything into bank account 102.
- Treat Customer Wallet as a liability account (`Customer Wallet Liability`), forbidding negative balances.
- Overhaul Returns and Exchanges: enforce original order derivation, quantity checks, anti-double-return guards, restockable vs damaged inventory segregation, revenue/tax/COGS/loyalty reversals, and single-transaction exchange settlements.

### R5. Procurement & Supplier Accounts Payable (Phase 6)
- Model the complete procurement lifecycle: Purchase Order → Goods Receipt (with batch/lot, mfg/exp date, unit cost) → Supplier Invoice → Accounts Payable Ledger → Supplier Payment / Return.
- Ensure supplier debits/credits balance with double-entry inventory and bank/cash ledgers.

### R6. CRM 360, Loyalty Engine & Marketing Alignment (Phases 8, 9)
- Unify customer creation and updates under a single domain service.
- Derive RFM, CLV, purchase frequency, and shade histories from verified order records without redundant duplicate storage.
- Replace hardcoded loyalty numbers with configurable tier and redemption rules, transactional points audit logs, and return reversals.

### R7. Security, Audit Trail & Modular API Architecture (Phases 14, 15, 19, 20, 21, 25, 26)
- Implement role-based access control (Admin, Manager, Accountant, Cashier, Stockkeeper) with secure password hashing (bcrypt) and route-level authorization.
- Record comprehensive, tamper-evident audit logs (`actor`, `action`, `entity`, `entity_id`, `before`, `after`, `timestamp`).
- Refactor monolithic `server.js` into modular routes, controllers, services, repositories, and error-handling middleware.
- Standardize monetary calculations in TOMAN and replace hardcoded IDs (`warehouseId=1`, `bankAccountId=1`) with configurable system settings.

### R8. Automated Testing, Verification Suite & End-to-End Integrity (Phases 17, 23, 24, 30)
- Build a comprehensive test suite (`npm test`) covering unit, integration, and full E2E lifecycle (procurement → storage → sale → wallet → layaway → return → audit).
- Implement `services/reconciliationService.js` and `GET /api/admin/reconciliation` to verify GL balance, stock vs ledger, wallet liability, and AP consistency with zero critical anomalies.
- Set up GitHub Actions CI workflow for automated testing and migration validation.

## Acceptance Criteria

### Accounting & Ledger Integrity
- [ ] Every journal entry committed in the database satisfies `SUM(debit) == SUM(credit)`.
- [ ] Wallet payments debit `Customer Wallet Liability` and credit `Sales Revenue` (or settlement accounts); wallet balance never goes negative.
- [ ] All bank accounts tie directly to chart of accounts ledger accounts.

### Inventory & POS Invariants
- [ ] Regular sales cannot allocate or deplete stock where `quantity - reserved_quantity <= 0`.
- [ ] Order checkout with split payments verifies `SUM(payments) == order_total` and sets status accurately (PAID / PARTIAL / UNPAID).
- [ ] Sales return strictly forbids returning more items than purchased on the original order, and correctly reverses COGS, revenue, loyalty points, and inventory.

### Verification & Reconciliation
- [ ] `npm test` executes and passes 100% of unit, integration, and E2E retail tests.
- [ ] `GET /api/admin/reconciliation` returns `CRITICAL: 0` discrepancies across GL, inventory valuation, supplier AP, customer wallets, and loyalty points.
- [ ] Backward-compatible migrations apply cleanly to the existing SQLite database without data wipe.
- [ ] All required documentation files in `docs/` and updated `README.md` are generated.

## 2026-09-17T00:52:42Z

# Teamwork Project Prompt

> Status: Launched
> Goal: Comprehensive Enterprise Retail ERP Hardening, Integration, Security, and 90-Day Deterministic Verification
> Requested team: Principal Software Engineer, ERP Architect, Accounting Systems Engineer, Database Reliability Engineer, QA Lead, Security Engineer

Transform the cosmetics retail management system (`hesabdari`) into a robust, tamper-evident, multi-warehouse, double-entry Retail ERP platform where every business event synchronously and immutably coordinates across POS, Inventory FEFO, Accounting, CRM, and Cash/Bank with zero data loss, strict period immutability, and verified 90-day persistence.

Working directory: d:\ARAYESHI
Integrity mode: development

## Requirements

### R1. Baseline Freeze, Database Reliability & Safety (Phases 1, 4, 31, 34-37)
- Freeze current database status: run `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, record migration status, table counts, trial balance, and inventory valuation into `docs/FULL_SYSTEM_AUDIT_2026.md`.
- Enforce database-level and application-level constraints (`quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= quantity`, `wallet_balance >= 0`, `amount >= 0`, `returned_quantity <= quantity`).
- Startup migration runner must verify checksums and execute automatically before HTTP listen; graceful shutdown must handle SIGTERM/SIGINT by checkpointing WAL and safely closing database connections.
- Production-grade automated backup with configurable retention (daily/weekly/monthly), manifest tracking, and automated restore drill verification.

### R2. Double-Entry Accounting Core, AR/AP Sub-Ledgers & Immutability (Phases 2, 7, 10, 11, 16-20)
- Enforce strict double-entry balance on every journal (`SUM(debit) == SUM(credit)`); unbalanced entries must trigger automatic rollback.
- Eliminate separate un-reconciled sources of truth: Bank and Cash balances derive canonically from the General Ledger.
- Implement Customer Accounts Receivable (AR) sub-ledger for installments/layaway/unpaid orders, and Supplier Accounts Payable (AP) sub-ledger (`SUM(supplier_subledger) == GL Account 201`).
- Implement Accounting Periods (`OPEN`, `SOFT_CLOSED`, `CLOSED`, `LOCKED`); forbid direct modification of posted entries (enforce reverse + replacement).
- Complete Cheque state machine (`ISSUED`, `RECEIVED`, `DEPOSITED`, `CLEARED`, `BOUNCED`, `RETURNED`, `CANCELLED`) with proper aging buckets. Fix `chart_of_accounts` schema drift.

### R3. Inventory Sub-Ledger, Expiry-Enforced FEFO & Multi-Warehouse (Phases 2, 4, 5, 6, 8)
- Transform inventory into a true double-entry sub-ledger where batch quantity equals opening + receipts + returns - sales - transfers - write-offs.
- Enforce strict expiry date checking in FEFO allocation (`expiry_date >= businessDate`): expired stock must be strictly blocked from sales, layaway, or reservations and routed to damaged/waste write-down.
- Fix `stock_counts.finalizeStockCount`: eliminate hardcoded `warehouseId=1`, ensure idempotency (prevent double-finalization), enforce non-negative counted quantities, and generate variance GL journals.
- Eliminate all hardcoded `warehouse_id = 1`: implement multi-warehouse transfers (pending/in-transit/received), warehouse-specific stock, and opening inventory accounting journals.
- Valuation source of truth must be actual batch acquisition cost (`SUM(batch_qty * batch_cost)`), not variant retail estimates.

### R4. POS Checkout, Price Tampering Protection, Returns & Atomic Exchange (Phases 2, 3, 13, 14, 15, 29)
- Eliminate client price trust: unit prices must be verified server-side against database active price rules. Implement permission-gated price override with manager approval and audit log.
- Universal Discount Allocation Engine: distribute invoice-level discounts deterministically across lines so partial returns reverse only their exact share.
- Overhaul POS payments: support fully paid, partial (routing remaining balance to Customer AR), and disallow unhandled overpayments. Derive `payment_status` strictly from verified payment transactions.
- Implement idempotency keys on checkout, payments, returns, exchanges, and supplier transactions to protect against network retries.
- Implement atomic exchange transactions with strict difference settlement verification.
- Complete cash drawer session management: reconcile opening cash, cash sales, cash refunds, expenses, safe drops, and closing variance with manager sign-off.

### R5. Complete Procurement Lifecycle (Phases 9, 10)
- Decouple Purchase Orders from Goods Receipts: workflow `PO Draft → Approval → Sent → Partial/Full Receipt → Supplier Invoice → AP → Payment → Purchase Return`.
- Support multiple batches, multiple expiries, landed costs, purchase discounts, supplier credits, and payment terms.

### R6. Customer 360, Unified Wallet Service & Configurable Loyalty (Phases 2, 12, 21-23)
- Create a unified Wallet Domain Service routing all deposits, withdrawals, POS payments, refunds, and loyalty conversions with strict non-negative guarantee (`wallet_balance >= 0`).
- Implement customer duplicate detection, phone normalization, and customer record merging preserving orders, wallet, and loyalty history.
- Dynamic configurable loyalty engine: replace hardcoded numbers with settings for earn rate, redemption rate, tier thresholds, and point expirations.
- Implement full layaway lifecycle (`DRAFT → RESERVED → PARTIALLY_PAID → PAID → FULFILLED / CANCELLED / EXPIRED`) with zero orphan reservations.

### R7. Security, Authentication, RBAC & API Hardening (Phases 26-28, 33)
- Replace plaintext and dummy passwords with modern cryptographic hashing (Argon2id / bcrypt), secure session management (HttpOnly, SameSite cookies), and brute-force protection.
- Implement granular Role-Based Access Control (Admin, Manager, Accountant, Cashier, Stockkeeper, Marketing) with backend route enforcement.
- Hardened API middleware: Helmet, strict CORS, rate limiting, request size limits, centralized input validation, and standardized error responses hiding internal stack traces.
- Immutable, tamper-evident audit logging for all critical operations (price overrides, adjustments, period closures, login failures).

### R8. Settings Center, Data Health Center, Admin UI & Reports (Phases 24, 25, 47-53)
- Implement comprehensive Settings Center managing business profile, fiscal year, default accounts, POS policies, inventory rules, loyalty settings, and SMS/backup configs.
- Re-route `/api/admin/reconciliation` before any SPA fallback routes; expand Reconciliation Engine v2 to cover 18 cross-domain consistency checks.
- Add UI Data Health Center dashboard displaying database integrity, backup health, migration status, and live GL/Inventory/AR/AP reconciliations.
- Full CRUD audit across all master data entities with safe deactivation. Eliminate hardcoded UI values.
- Standardize financial reports (Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP Aging) derived from canonical accounting ledgers with exact net profit accounting.

### R9. Automated Verification, 90-Day Deterministic Simulation & Stress Testing (Phases 38-46, 54)
- Implement full 4-tier automated test suite (`npm test`): Tier 1 (Features), Tier 2 (Boundary/Adversarial), Tier 3 (Cross-Domain Integration), Tier 4 (Workflows & Persistence).
- Build deterministic 90-day simulation (`tests/tier4/90_day_business_simulation.test.js`) with fixed random seed and injectable clock, processing 1,000+ invoices and 5,000+ lines across multiple users, warehouses, layaways, returns, and procurements.
- Daily invariant assertions: verify GL balance, zero negative stock, zero expired sales, wallet ledger reconciliation, and AP/AR consistency at the end of every simulated day.
- Mid-simulation database restart persistence tests (days 10, 20, 30, 45, 60, 75, 90) and snapshot backup/restore drills (days 30, 60, 90) verifying state reproducibility.
- Crash recovery and failure injection tests verifying atomic rollback of half-committed business operations.

## Acceptance Criteria

### Accounting & Financial Integrity
- [ ] Every journal entry committed in the database satisfies `SUM(debit) == SUM(credit)`.
- [ ] Bank & Cash balances equal GL accounts 101 & 102.
- [ ] Supplier sub-ledger equals GL Account 201 (AP); Customer receivable sub-ledger equals GL AR.
- [ ] Wallet liability account 205 reconciles with the sum of all customer wallet balances and wallet transactions.
- [ ] Closed periods strictly forbid any insertion, modification, or deletion of posted vouchers.

### Inventory, POS & Procurement Invariants
- [ ] No inventory batch has `quantity < 0`, `reserved_quantity < 0`, or `reserved_quantity > quantity`.
- [ ] Expired batches cannot be sold, reserved, or allocated for layaway.
- [ ] Unit prices are validated server-side; price overrides require manager authorization and create an audit log.
- [ ] Sales return quantity cannot exceed purchased returnable quantity.
- [ ] Stock count finalization is idempotent and respects specific warehouse assignment.

### Security, Audit & Operations
- [ ] All user passwords are encrypted with bcrypt/Argon2id; brute-force protection and RBAC guards are active on all sensitive routes.
- [ ] Immutable audit log captures actor, action, before/after states, and timestamps for all sensitive business events.
- [ ] Server startup automatically validates and runs pending migrations; graceful shutdown checkpoints WAL and cleanly exits.
- [ ] Automated backup creates verified online snapshots with configurable retention.

### Verification & Simulation
- [ ] `npm test` executes and passes 100% of tests across Tiers 1, 2, 3, and 4.
- [ ] `GET /api/admin/reconciliation` returns `CRITICAL: 0` discrepancies across all domains.
- [ ] Deterministic 90-day simulation completes 90 business days with zero unexpected errors and passes all daily invariant checks.
- [ ] Restart persistence and backup/restore snapshot drills successfully reproduce verified business state.
- [ ] `docs/FULL_SYSTEM_AUDIT_2026.md` is generated with complete severity-ranked findings and resolution status.

## 2026-09-22T17:01:32Z

# Teamwork Project Prompt

> Status: Launched
> Goal: 90-Day + 1,000-Customer Full Platform Audit, Simulation, UX/Button Review, Bug Fixing & Production Hardening
> Requested team: Full multi-agent engineering team (Senior ERP Architect, Retail Operations Expert, Senior Accountant, Inventory Management Expert, CRM Expert, POS Specialist, QA Lead, UX/UI Auditor, Database Reliability Engineer, Security Reviewer, Product Manager)

Operate, inspect, test, challenge, and improve the ENTIRE cosmetics retail ERP platform (`ARAYESHI / Kayhan Beauty ERP`) as if it were running a real cosmetics retail store for 90 consecutive business days with at least 1,000 unique synthetic customers, fixing all discovered critical/high bugs, ensuring full cross-module consistency, auditing every UI control, and verifying complete production readiness.

Working directory: d:\ARAYESHI
Repository: https://github.com/aubed9/hesabdari
Integrity mode: development

## Requirements

### R1. Baseline Freeze, Database Reliability & Safety First
- Never run destructive tests against production/business data. Use an isolated disposable database (`db/test_simulation.sqlite3`) for all simulation activities.
- Run and record the complete baseline of existing test suites (`npm test`, `tests/tier1`, `tests/tier2`, `tests/tier3`, `tests/tier4`, `tests/stress`).
- Ensure WAL checkpointing, database integrity (`PRAGMA integrity_check = ok`), and zero foreign key violations (`PRAGMA foreign_key_check`).

### R2. 1,000 Realistic Synthetic Customers
- Generate at least 1,000 unique synthetic customers with realistic lifecycles (new, one-time, repeat, loyal, VIP, dormant, at-risk, wallet users, loyalty point users, returners).
- Include realistic Persian names, phone numbers, birth dates, RFM segments, and purchasing habits.
- Test Persian character searching (e.g. `ی / ي` and `ک / ك`).

### R3. 90-Day Progressive Business Simulation
- Simulate 90 consecutive operational business days behaving like an active cosmetics retail store with thousands of transactions evolving over time:
  - Days 1–15: Customer acquisition, opening stock, and regular sales.
  - Days 16–30: Repeat customers, supplier replenishments, and returns.
  - Days 31–45: Growing customer history, multi-item baskets, and split payments.
  - Days 46–60: Wallet deposits, loyalty redemptions, and supplier debt payments.
  - Days 61–75: Dormant customer segmentation, re-engagement, and discount campaigns.
  - Days 76–90: High-volume operational history, financial period closing, and comprehensive reporting.
- Cover daily POS checkouts, split payments (Cash, Card, Card-to-Card, Wallet, Points), returns (sealed vs opened/damaged), exchanges, expenses, supplier orders, goods receipts, and debt settlements.

### R4. Complete Double-Entry Accounting & Sub-Ledger Integrity
- Enforce strict double-entry invariants: every business event must produce balanced journal entries (`SUM(debit) == SUM(credit)`).
- Ensure Cash (101), Bank (102), Inventory (103), Accounts Receivable (104), Accounts Payable (201), Customer Wallet (205), Sales Revenue (401), and COGS (501) reconcile exactly with sub-ledgers.
- Guarantee that `Gross Profit = Net Sales - COGS` across all dashboards, reports, and exports.

### R5. Inventory & Expiry-Enforced FEFO Engine
- Validate inventory constraints at all times: `quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= quantity`.
- Enforce FEFO: consume earliest-expiring non-expired batches first; block expired stock from sale.
- Test tester write-offs, damaged stock segregation, and inventory adjustments.

### R6. Complete UI Button & Screen Interaction Audit
- Inspect and test every visible interactive element across all screens: buttons, tabs, dropdowns, filters, modals, print, export, and search fields.
- Produce a machine-readable UI Interaction Inventory (`docs/UI_CONTROL_AUDIT.md`).
- Eliminate dead buttons, fake numbers, and unhandled double-click submissions.

### R7. Systematic Bug-Fixing & Regression Loop
- For every defect discovered during inspection and simulation:
  `Reproduce → Root-Cause → Write Regression Test → Fix → Verify → Document`.
- Perform a final clean 90-day simulation run from a fresh database after all fixes are implemented.

## Verification Resources
- Existing test suites: `tests/runner.js`, `tests/tier1/`, `tests/tier2/`, `tests/tier3/`, `tests/tier4/`, `tests/stress/`.
- Simulation script: `scripts/simulate90Days.js`.
- Health & reconciliation endpoints: `GET /api/admin/reconciliation`, `GET /api/dashboard/overview`.

## Acceptance Criteria

### Accounting & Ledger Integrity
- [ ] Every journal entry committed in the database satisfies `SUM(debit) == SUM(credit)`.
- [ ] General Ledger, Trial Balance, P&L, and Balance Sheet reconcile with zero critical discrepancies.
- [ ] Customer Wallet balance matches the sum of wallet transactions and never goes negative (`wallet_balance >= 0`).
- [ ] Supplier Accounts Payable matches open purchase orders and invoice ledger.

### Inventory, FEFO & POS Invariants
- [ ] Standard sales cannot deplete stock below zero or sell expired/reserved goods.
- [ ] Returns strictly reject quantities exceeding purchased amounts or double returns.
- [ ] Split payments accurately reconcile to their specific ledger accounts.
- [ ] Real acquisition costs (COGS) are deducted from sales revenue, ensuring gross profit is accurate.

### UI & Interaction Quality
- [ ] Zero dead buttons, placeholder actions, or unhandled errors across all application screens.
- [ ] RTL layout and Persian typography are intact with no broken styles or formatting errors.
- [ ] Excel/CSV exports contain correct Persian text with UTF-8 BOM encoding.

### Audit & Deliverables
- [ ] `docs/90_DAY_1000_CUSTOMER_PLATFORM_AUDIT.md` is generated with full simulation metrics and findings.
- [ ] `docs/UI_CONTROL_AUDIT.md` is generated with the comprehensive control matrix.
- [ ] `docs/PLATFORM_GAP_ANALYSIS.md` is generated classifying all operational gaps (P0/P1/P2/P3).
- [ ] All test suites (100%) pass on the final regression run.

