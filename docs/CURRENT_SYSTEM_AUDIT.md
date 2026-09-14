# ARAYESHI Retail ERP — Current System Audit & Architecture Map

## 1. Architecture Map (UI → API → Service → Database Tables → Domain Effects)

| Feature / Business Event | UI Component | API Endpoint | Domain Service | DB Tables Affected | Accounting Effects (GL) | Inventory Effects | CRM & Loyalty Effects | Audit Status |
|---|---|---|---|---|---|---|---|---|
| **Normal Sale (POS)** | public/js/pos.js | POST /api/pos/checkout | services/posService.js | orders, order_items, order_payments, inventory_batches, stock_transactions | Dr Bank/Cash (102/101), Cr Sales Revenue (401), Dr COGS (501), Cr Inventory (103) | Depletes batch quantity via FEFO | Adds loyalty points, updates CLV/RFM | **Partial / Unsafe** (No idempotency, reservation leakage, split payment GL dumping) |
| **Layaway Sale** | public/js/pos.js | POST /api/pos/checkout (type=LAYAWAY) | services/posService.js | orders, order_items, inventory_batches | Records partial deposit to Bank 102 | Increases 
eserved_quantity | Customer linked | **Broken** (Sale allocates batches with quantity > 0 ignoring reserved_quantity) |
| **Sales Return** | public/js/pos.js | POST /api/pos/return | services/posService.js | 
eturns, 
eturn_items, inventory_batches | Reversal journal | Stock incremented without condition check | Loyalty points not reversed | **Broken** (No original order validation, client trusted for refund, double-return risk) |
| **Product Exchange** | public/js/pos.js | Chained UI calls | None | 
eturns, orders | Separate un-linked journals | Independent stock moves | Clashing stats | **Broken** (Non-atomic, difference amount un-reconciled) |
| **Goods Receipt / Purchase** | public/js/inventory.js | POST /api/inventory/purchase | services/inventoryService.js | purchase_invoices, inventory_batches, stock_transactions | Dr Inventory (103), Cr Accounts Payable (201) | Batches created | None | **Partial** (No PO/approval workflow, partial receipt, or supplier payment ledger) |
| **Supplier Payment** | None | None | None | None | None | None | None | **Missing** |
| **Stock Count / Audit** | public/js/inventory.js | POST /api/inventory/stock-counts/:id/finalize | services/inventoryService.js | stock_counts, stock_count_items, inventory_batches | Dr/Cr 608 vs 103 | Direct batch update | None | **Broken** (Hardcoded warehouseId=1, non-idempotent re-finalize, missing audit log) |
| **Tester Conversion** | public/js/inventory.js | POST /api/inventory/tester | services/inventoryService.js | 	esters, inventory_batches | Dr Marketing Expense (604), Cr Inventory (103) | Reduces batch qty | None | **Implemented** (Functional, needs batch validation) |
| **Damaged / Expired Write-off** | public/js/inventory.js | None | None | None | None | None | None | **Missing** |
| **Manual Journal Entry** | public/js/accounting.js | POST /api/accounting/journal-entries | services/accountingService.js | journal_entries, journal_lines | Balanced debit/credit check | None | None | **Implemented** (Fixed entry_number collision bug) |
| **Operating Expense** | public/js/accounting.js | POST /api/accounting/expenses | services/accountingService.js | expenses, journal_entries | Dr Expense (60x), Cr Bank (102) | None | None | **Implemented** (Bank account balance separate from GL) |
| **Fixed Cost Payment** | public/js/accounting.js | POST /api/accounting/fixed-costs/:id/pay | services/accountingService.js | ixed_costs, expenses | Parallel expense flow | None | None | **Duplicate** (Parallel flow to standard expenses) |
| **Cheque Management** | public/js/accounting.js | POST /api/accounting/cheques/:id/status | services/accountingService.js | cheques, journal_entries | Journal on status change | None | None | **Partial** (Incomplete state machine, only abs(days) aging) |
| **Customer 360 & Loyalty** | public/js/crm.js | POST /api/crm/customers | services/crmService.js | customers, customer_rfm, loyalty_transactions | None | None | Accrual, redemption | **Partial** (Duplicate customer creation routes, hardcoded loyalty rules) |
| **Customer Wallet** | public/js/crm.js | POST /api/crm/customers/:id/wallet | services/crmService.js | customers, wallet_transactions | None (Treated as cash, not liability) | None | Wallet balance updated | **Broken / Unsafe** (No GL link to liability 205, negative balance possible) |
| **Reconciliation Engine** | None | None | None | None | None | None | None | **Missing** |
| **RBAC & Auth** | None | Hardcoded user_id=1 | None | users (plaintext pass) | None | None | None | **Broken / Missing** |

---

## 2. In-Depth Component Findings

### 2.1 Accounting Core
1. **Dual Source of Truth for Cash & Bank**: ank_accounts.balance was maintained independently from General Ledger Account 102.
2. **Missing Accounts**:
   - Customer Wallet Liability (205) was absent; wallet was treated as cash or unearned revenue.
   - Notes Receivable (106) was unmapped for customer cheques.
3. **Journal Imbalance Risk**: Database schema lacked an enforced invariant trigger or transactional post-check ensuring SUM(debit) == SUM(credit).
4. **Posted Vouchers**: No protection against direct modification of posted entries.

### 2.2 Inventory & Warehouse
1. **Layaway Leakage**: services/posService.js queried SELECT * FROM inventory_batches WHERE quantity > 0, ignoring 
eserved_quantity.
2. **Opening Stock Valuation**: Creating new products with initial quantity bypassed accounting, causing GL Account 103 and inventory valuation drift.
3. **Hardcoded IDs**: Warehouse was hardcoded to warehouseId = 1 in stock counts and allocations.

### 2.3 POS & Transactions
1. **Idempotency Deficit**: Checkout endpoints had no idempotency tokens, allowing double-charging.
2. **Split Payments**: All payments were lumped into Bank Account 102 regardless of whether cash, card, wallet, or loyalty points were used.
3. **Sales Return**: Return amounts and restockability were accepted from the client without checking original invoice unit prices and quantities.

### 2.4 Purchasing & AP
1. Direct batch insertion skipped standard procurement stages (PO, Goods Receipt, AP Invoice).
2. No supplier sub-ledger or aging report existed.

### 2.5 Security & Architecture
1. Monolithic server.js contained mixed routing, business logic, and raw database queries.
2. Passwords stored in plaintext with hardcoded user IDs.
