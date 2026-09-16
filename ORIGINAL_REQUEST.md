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
