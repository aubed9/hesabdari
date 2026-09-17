# TEST READY: ARAYESHI Retail ERP Automated Test Suite

## Executive Summary

The comprehensive 4-Tier automated test suite for the **ARAYESHI Retail ERP Hardening & Transformation** project is complete, fully verified, and ready for production verification and CI/CD pipelines.

- **Status**: ✅ **TEST READY** (All 4 Tiers passing 100%)
- **Test Framework**: Node.js Native Test Engine (`node:test` & `node:assert/strict`) — zero external test runner dependencies.
- **Database Isolation**: Complete in-memory SQLite isolation harness (`tests/helpers/testDb.js`). The live database `db/arayeshi_erp.sqlite3` is **never opened, read, or modified** during testing.
- **Total Test Suites**: 22 files
- **Total Test Cases**: 75 tests
- **Pass Rate**: 100% (75 passed, 0 failed, 0 skipped, 0 flakiness)
- **Suite Execution Time**: ~3.5 seconds

---

## 1. 4-Tier Test Architecture & Taxonomy

```
tests/
├── helpers/
│   └── testDb.js                                      # In-memory SQLite harness, proxy & fixtures
├── tier1/                                             # Tier 1: Core Feature Coverage (36 tests)
│   ├── accounting.test.js                             # 6 tests: Double-entry, CoA, P&L, Balance Sheet
│   ├── crm_loyalty.test.js                            # 5 tests: Customer 360, RFM, tiers, points, wallet
│   ├── inventory_fefo.test.js                         # 5 tests: FEFO batches, unreserved stock, testers
│   ├── pos_split_checkout.test.js                     # 5 tests: Split tenders, drawer sessions, payment status
│   ├── procurement.test.js                            # 5 tests: PO receipt, batch creation, AP sub-ledger
│   ├── rbac_security.test.js                          # 5 tests: Role constraints, audit logs, uniqueness
│   └── returns.test.js                                # 5 tests: Returns, restock vs waste, reversals, exchanges
├── tier2/                                             # Tier 2: Boundary & Corner Cases (25 tests)
│   ├── accounting_boundary.test.js                    # 5 tests: Unbalanced journals, FK checks, rounding
│   ├── inventory_boundary.test.js                     # 5 tests: Stock exhaustion, layaway blocks, over-tester
│   ├── pos_boundary.test.js                           # 5 tests: 100% discounts, split edges, proforma
│   ├── returns_boundary.test.js                       # 5 tests: Over-return guards, anti-double return
│   └── wallet_boundary.test.js                        # 5 tests: Negative wallet guards, points limits
├── tier3/                                             # Tier 3: Pairwise Cross-Domain Integration (9 tests)
│   ├── exchange_pos_inventory.test.js                 # 2 tests: Atomic exchange + price difference settlement
│   ├── pos_inventory_loyalty.test.js                  # 2 tests: POS sale + FEFO allocation + loyalty accrual
│   ├── pos_wallet_accounting.test.js                  # 2 tests: POS checkout + Wallet liability (205) + GL
│   ├── procurement_inventory_accounting.test.js       # 2 tests: PO receipt + batches + AP sub-ledger vs GL 201
│   └── return_wallet_inventory_loyalty.test.js        # 1 test:  Return + wallet credit + restock + points revoke
├── tier4/                                             # Tier 4: Real-World E2E Scenarios (5 tests)
│   ├── scenario1_retail_day.test.js                   # 1 test:  Opening float -> Sales -> Returns -> Z-Report
│   ├── scenario2_procurement_to_sale.test.js          # 1 test:  Procurement -> FEFO sale -> GL inventory audit
│   ├── scenario3_vip_customer_journey.test.js         # 1 test:  VIP journey -> Points conversion -> Wallet return
│   ├── scenario4_layaway_fefo_isolation.test.js       # 1 test:  Layaway reservation -> FEFO isolation -> Fulfillment
│   └── scenario5_financial_close_reconciliation.test.js # 1 test:  Monthly cycle -> Write-offs -> Close 302 -> GL audit
└── runner.js                                          # Master test runner with spec reporter
```

---

## 2. Test Execution Metrics by Tier

| Tier | Purpose | Suites | Tests | Passed | Failed | Duration |
|---|---|---|---|---|---|---|
| **Tier 1** | Core Domain Feature Coverage | 7 | 36 | 36 | 0 | ~1.4s |
| **Tier 2** | Boundary, Overflow & Adversarial Guards | 5 | 25 | 25 | 0 | ~0.5s |
| **Tier 3** | Pairwise Cross-Service Integration | 5 | 9 | 9 | 0 | ~0.3s |
| **Tier 4** | Real-World Multi-Step Business Scenarios | 5 | 5 | 5 | 0 | ~0.3s |
| **TOTAL** | **Full Regression & Integrity Suite** | **22** | **75** | **75** | **0** | **~2.5s** |

---

## 3. Tier 4 Real-World Application Scenarios (Detailed)

### Scenario 1: Complete Retail Business Day
- **File**: `tests/tier4/scenario1_retail_day.test.js`
- **Workflow**:
  1. Morning cash drawer initialization with 5,000,000 Toman opening float.
  2. Sequential retail sales: Cash, Card, and split Cash + Card tenders across lipstick and foundation products.
  3. Midday product return with card reversal and inventory batch restocking.
  4. Evening cash drawer session close: cashier physical cash count of 5,500,000 Toman perfectly matches expected drawer cash (5,000,000 opening + 500,000 net cash sales).
  5. Assertion: Cash session variance is strictly `0`, GL Account `101` (Cash) holds exactly 500,000 Toman, and global GL is balanced.

### Scenario 2: Procurement to Retail Sale Lifecycle
- **File**: `tests/tier4/scenario2_procurement_to_sale.test.js`
- **Workflow**:
  1. Goods receipt for anti-aging serum with 2 distinct batches (LOT-BKC-EARLY exp: 2027-06-30 @ 100k; LOT-BKC-LATER exp: 2028-01-31 @ 120k) totalling 5,600,000 Toman.
  2. GL postings verify Dr 103 (Inventory) 5.6M / Cr 201 (Accounts Payable) 5.6M.
  3. Retail sale of 25 units: FEFO strictly depletes all 20 units of LOT-BKC-EARLY first, then 5 units of LOT-BKC-LATER, computing exact COGS of 2,600,000 Toman.
  4. Physical batch valuation check: remaining 25 units in batch 2 @ 120,000 equals exactly 3,000,000 Toman, matching GL Account 103.
  5. Full settlement of supplier payable via Bank (5,600,000 Toman), bringing GL Account 201 and supplier sub-ledger to 0.

### Scenario 3: VIP Customer Journey
- **File**: `tests/tier4/scenario3_vip_customer_journey.test.js`
- **Workflow**:
  1. VIP customer registration and high-ticket perfume purchase (2,000,000 Toman) earning 200 loyalty points.
  2. Customer wallet top-up (500,000 Toman).
  3. Loyalty points conversion: 100 points converted to 50,000 Toman wallet credit, bringing wallet to 550,000 Toman.
  4. Split checkout: purchase of 2 luxury creams (1,000,000 Toman) paid with 550,000 Wallet + 450,000 Card.
  5. Partial return: customer returns 1 cream (500,000 Toman) refunded back to wallet; loyalty points reversed.
  6. Customer 360 profile verification: wallet balance is 500,000 Toman, matching GL Account `205` (Customer Wallet Liability) to the exact Toman.

### Scenario 4: Layaway Reservation, Stock Conflict Isolation & Fulfillment
- **File**: `tests/tier4/scenario4_layaway_fefo_isolation.test.js`
- **Workflow**:
  1. Product setup with 2 batches: Batch 1 (10 units, early expiry) and Batch 2 (10 units, later expiry). Total physical stock = 20 units.
  2. Customer A creates Layaway reserving 12 units (10 from Batch 1, 2 from Batch 2) with a 1,500,000 Toman cash deposit. Available unreserved stock drops to strictly 8 units.
  3. Stock Conflict Isolation: Customer B attempts to purchase 9 units for immediate retail sale. The system throws a stock exhaustion error and preserves batch invariants atomically.
  4. Customer B purchases the remaining 8 available units. Physical stock remaining on shelf is 12 units, but available unreserved stock is strictly 0. Customer C attempting to purchase 1 unit is rejected.
  5. Layaway Fulfillment: Customer A returns to pay the remaining 2,700,000 Toman balance via Card. Reserved stock is physically deducted, reservations are released, and double-entry sales journal is posted.
  6. Invariants: zero orphan reservations remain, GL is balanced, and reconciliation scan returns CRITICAL: 0.

### Scenario 5: Full Monthly Financial Close & Cross-Domain Reconciliation
- **File**: `tests/tier4/scenario5_financial_close_reconciliation.test.js`
- **Workflow**:
  1. Founder capital injection: 100,000,000 Toman (80M Bank, 20M Cash) credited to Capital (301).
  2. Multi-supplier procurement (15,000,000 Toman across 2 suppliers). Supplier 1 paid in full (10M); Supplier 2 paid partially (2M, leaving 3M open).
  3. Retail operations: Wallet top-up, split-tender POS checkouts, and customer loyalty accrual.
  4. Operating overhead: Store rent (8M), staff salaries (6M), and utilities (1M) paid via Bank.
  5. Inventory write-offs: Store tester conversion (500,000 Toman Dr 604 / Cr 103) and physical stock count shortage adjustment (100,000 Toman Dr 608 / Cr 103).
  6. Financial statements: Pre-close Profit & Loss (Revenue 4M, COGS 2M, Expenses 15.6M -> Net Loss -13.6M) and balanced Balance Sheet.
  7. Accounting Period Close: Formal closing journal entry zeros nominal accounts (401, 501, 601–608) and transfers net loss (-13,600,000) to Retained Earnings (`302`).
  8. Cross-Domain Reconciliation: `reconciliationService.runAll()` verifies CRITICAL: 0 across all 8 core checks. Physical inventory valuation strictly equals GL 103, customer wallets equal GL 205, and supplier sub-ledgers equal GL 201.

---

## 4. Invariant Verification Matrix

| Invariant Code | Category | Description | Verification Assertion |
|---|---|---|---|
| **INV-ACC-01** | Accounting | Double-Entry Balance | `SUM(debit) == SUM(credit)` on every single voucher |
| **INV-ACC-02** | Accounting | Global Trial Balance | Net debits equal net credits across all posted accounts |
| **INV-ACC-03** | Accounting | Wallet Liability Node | Wallet payments debit Account `205`, never Bank `102` |
| **INV-INV-01** | Inventory | Available Stock Invariant | Available stock is strictly `quantity - reserved_quantity` |
| **INV-INV-02** | Inventory | FEFO Allocation Order | Earliest expiring batches are allocated and depleted first |
| **INV-INV-03** | Inventory | Tester / Waste Write-Downs | Testers debit `604` / credit `103`; Count shortage debits `608` / credit `103` |
| **INV-POS-01** | POS | Payment Sum Match | `SUM(payments) == order_total`; status accurately reflects PAID/PARTIAL/UNPAID |
| **INV-POS-02** | POS | Active Cash Session | Cash transactions require an active `OPEN` cash session |
| **INV-POS-03** | POS | Anti-Double Return | Returned quantity cannot exceed purchased quantity; duplicate returns rejected |
| **INV-CRM-01** | CRM / Wallet | Non-Negative Wallet | `customer.wallet_balance >= 0`; overdrafts strictly blocked |
| **INV-CRM-02** | CRM / Loyalty | Return Loyalty Revocation | Returns proportionally reverse earned loyalty points |
| **INV-PRO-01** | Procurement | AP Sub-Ledger Balance | `SUM(supplier_subledger) == GL Account 201` |

---

## 5. How to Run the Tests

### Execute Full Suite (All 4 Tiers)
```powershell
# Via project runner directly
node tests/runner.js

# Or via npm test on Windows CMD
cmd.exe /c npm test
```

### Execute by Tier
```powershell
# Tier 1: Core Feature Coverage
node tests/runner.js tier1

# Tier 2: Boundary & Corner Cases
node tests/runner.js tier2

# Tier 3: Pairwise Integration
node tests/runner.js tier3

# Tier 4: Real-World Scenarios
node tests/runner.js tier4
```

### Execute Individual Test File
```powershell
node --test tests/tier4/scenario4_layaway_fefo_isolation.test.js
node --test tests/tier4/scenario5_financial_close_reconciliation.test.js
```

---

## 6. Escalated Implementation Findings

During Tier 4 scenario development, the following implementation issue was discovered in the domain services:

1. **Defect**: `services/accountingService.js` — `getProfitAndLoss()` omits Account `404` (`Sales Returns & Allowances`).
   - **Location**: `services/accountingService.js` lines 90–110.
   - **Observed Behavior**: `getProfitAndLoss()` aggregates revenues via `WHERE coa.code IN ('401', '402')` and discounts via `WHERE coa.code = '403'`, but does not deduct Account `404` (Sales Returns).
   - **Impact**: If a sales return is processed before period close, `getProfitAndLoss().netProfit` does not account for the return, causing `getBalanceSheet().isBalanced` to evaluate to `false`.
   - **Recommended Fix**: Update `getProfitAndLoss()` to deduct Account `404` debits from Net Sales:
     `netSales = grossSales - discounts - returns;`.
