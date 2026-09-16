# ARAYESHI ERP Test Infrastructure Specification (TEST_INFRA.md)

## 1. Test Architecture & Philosophy

The ARAYESHI Retail ERP test suite is built on a strict **Opaque-Box & Requirements-Driven** testing philosophy. Test specifications, inputs, and expected outcomes are derived directly from:
- `d:\ARAYESHI\.agents\ORIGINAL_REQUEST.md` (Authoritative User Requirements R1–R8)
- `d:\ARAYESHI\PROJECT.md` (System Architecture, Feature Inventory, and Domain Interface Contracts)

Tests assert observable domain contracts, financial balances, inventory counts, and audit trails rather than internal implementation details.

### Test Engine
- **Test Framework**: Node.js Native Test Runner (`node:test` and `node:assert/strict`), introduced in Node.js 18+ and native in Node.js 22.19.0.
- **Dependencies**: Zero external testing dependencies (no Jest, Mocha, or Babel required). Fast, lightweight, and native across Windows, Linux, and macOS.
- **Execution Command**: `npm test` (or `cmd.exe /c npm test` on Windows terminal), invoking `node tests/runner.js`.

---

## 2. Isolated Test Database Harness

### Problem Statement
The ERP repository contains a production-like database at `db/arayeshi_erp.sqlite3` with ~24,000 historical rows across 44 tables. Executing tests against the live database risks destructive data loss, state contamination between test runs, and concurrency locks.

### Isolation Strategy
All tests execute against dedicated in-memory SQLite databases managed by `tests/helpers/testDb.js`:
1. **Dynamic In-Memory SQLite**:
   - Each test suite or test case invokes `setupTestDb()`, instantiating a fresh in-memory SQLite database (`:memory:`) using `better-sqlite3`.
   - SQLite Pragmas configured: `foreign_keys = ON`, `synchronous = NORMAL`.
   - Persian text normalization function `NORM_FA` registered directly in SQLite.
   - Baseline DDL from `db/schema.sql` is executed immediately.

2. **Module Cache Interception (`require.cache`)**:
   - In Node.js, application services require the database connection via `const db = require('../db/database')`.
   - `tests/helpers/testDb.js` preemptively replaces `require.cache[require.resolve('../../db/database')]` with a dynamic `dbProxy`.
   - Any database calls (`db.prepare(...)`, `db.transaction(...)`, `db.exec(...)`) made by any service are seamlessly routed to the currently active isolated test database.
   - **Guarantee**: The live file `db/arayeshi_erp.sqlite3` is **never opened, read, or modified** during test execution.

3. **Deterministic Fixture Generators**:
   - Standard chart of accounts (101–106 Assets, 201–205 Liabilities, 301–302 Equity, 401–403 Revenue, 501 COGS, 601–608 Expenses).
   - Standard organization, branch, central warehouse, cash register, and active cash session.
   - Test staff accounts (`ADMIN`, `MANAGER`, `CASHIER`, `STOCKKEEPER`, `ACCOUNTANT`).
   - Helpers: `seedCustomer()`, `seedSupplier()`, `seedProductWithBatches()`, `assertGeneralLedgerBalanced()`, `getAccountNetBalance()`.

---

## 3. 4-Tier Test Architecture & Taxonomy

```
tests/
├── helpers/
│   └── testDb.js                      # Isolated SQLite in-memory harness & fixtures
├── tier1/                             # Tier 1: Feature Coverage (>=5 tests per feature)
│   ├── accounting.test.js             # Double-entry invariants, CoA, P&L, balance sheet
│   ├── inventory_fefo.test.js         # FEFO batches, unreserved stock, tester conversion
│   ├── pos_split_checkout.test.js     # Cash, Card, Wallet, Points split payments
│   ├── returns.test.js                # Sales returns, restockable vs damaged, GL reversal
│   ├── procurement.test.js            # PO, goods receipt, batch creation, supplier AP
│   ├── crm_loyalty.test.js            # Customer 360, RFM, tiers, points accrual & wallet
│   └── rbac_security.test.js          # Password hashing, role guards, user management
├── tier2/                             # Tier 2: Boundary & Corner Cases (>=5 tests per feature)
│   ├── accounting_boundary.test.js    # Unbalanced debits/credits, zero amounts, closed periods
│   ├── inventory_boundary.test.js     # Stock exhaustion, negative stock guards, zero-quantity
│   ├── pos_boundary.test.js           # Overpayment, underpayment, missing cash session
│   ├── wallet_boundary.test.js        # Negative wallet balance guards, over-debit prevention
│   └── returns_boundary.test.js       # Return qty > sold, double returns, unpurchased items
├── tier3/                             # Tier 3: Cross-Feature Combinations (Pairwise integration)
│   ├── pos_wallet_accounting.test.js  # POS checkout + Customer Wallet liability + GL postings
│   ├── pos_inventory_loyalty.test.js  # POS sale + FEFO allocation + Loyalty points accrual
│   ├── procurement_inventory_accounting.test.js # Procurement + Batch stock + AP sub-ledger
│   ├── return_wallet_inventory_loyalty.test.js  # Return + Wallet refund + Restock + Points revoke
│   └── exchange_pos_inventory.test.js # Single-transaction exchange + Cash session settlement
├── tier4/                             # Tier 4: Real-World Application Scenarios (Multi-step E2E)
│   ├── scenario1_retail_day.test.js   # Morning drawer open -> POS sales -> Z-report -> Cash deposit
│   ├── scenario2_procurement_to_sale.test.js    # PO -> Goods receipt -> Retail sale -> GL valuation
│   ├── scenario3_vip_customer_journey.test.js   # Customer registration -> Tier upgrade -> Wallet purchase -> Return
│   ├── scenario4_layaway_fefo_isolation.test.js # Layaway reservation -> Stock conflict isolation -> Fulfillment
│   └── scenario5_financial_close_reconciliation.test.js # Full monthly cycle -> Write-offs -> Period close -> GL audit
└── runner.js                          # Master test runner with spec reporter & exit codes
```

---

## 4. Test Invariant & Assertion Inventory

Every test verifies one or more of the core ERP invariants specified in `ORIGINAL_REQUEST.md`:

| Invariant Code | Domain | Rule / Invariant Description | Verification Assertion |
|---|---|---|---|
| **INV-ACC-01** | Accounting | Strict Double-Entry Balance | `SUM(debit) == SUM(credit)` for every journal entry |
| **INV-ACC-02** | Accounting | Global Trial Balance | Net debits equal net credits across all posted ledger lines |
| **INV-ACC-03** | Accounting | Wallet Liability Account | Customer wallet payments debit Account `205` (`Customer Wallet Liability`), never Bank `102` |
| **INV-INV-01** | Inventory | Available Stock Invariant | Available stock is strictly `quantity - reserved_quantity`; sales fail if `requested > available` |
| **INV-INV-02** | Inventory | FEFO Consumption Order | Earliest expiry batches are depleted first; expired batches (`expiry_date < now`) are excluded |
| **INV-INV-03** | Inventory | Tester & Damaged Write-Downs | Tester conversion debits `604` / credits `103`; Damaged/expired write-down debits `607` / credits `103` |
| **INV-POS-01** | POS | Payment Sum Match | `SUM(payments) == order_total`; order status set accurately (`PAID` vs `PARTIAL` vs `UNPAID`) |
| **INV-POS-02** | POS | Cash Drawer Requirement | Cash sales and cash refunds require an active `OPEN` cash session |
| **INV-POS-03** | POS | Anti-Double Return | Returned quantity cannot exceed original purchased quantity; second return attempt is rejected |
| **INV-CRM-01** | CRM / Wallet | Non-Negative Wallet Balance | `customer.wallet_balance >= 0`; overdrafts or debits exceeding balance throw an error |
| **INV-CRM-02** | CRM / Loyalty | Loyalty Reversals on Return | Returning an order reverses points earned on the original purchase |
| **INV-PRO-01** | Procurement | AP Sub-Ledger Balancing | Purchase order receiving creates inventory batches and credits Accounts Payable (`201`) |

---

## 5. Execution Guide

### Run All Tests
```powershell
# From project root
npm test
# Or on Windows cmd
cmd.exe /c npm test
```

### Run Specific Tier
```powershell
node --test "tests/tier1/*.test.js"
node --test "tests/tier2/*.test.js"
node --test "tests/tier3/*.test.js"
node --test "tests/tier4/*.test.js"
```

### Run Specific Test File
```powershell
node --test tests/tier1/accounting.test.js
node --test tests/tier4/scenario1_retail_day.test.js
```
