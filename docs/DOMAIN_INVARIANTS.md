# ARAYESHI Retail ERP — Domain Rules & System Invariants

## 1. Accounting Invariants

### 1.1 Strict Double-Entry Balance
- For every journal entry:
  \\sum \\text{Debit} = \\sum \\text{Credit}
- No journal entry with an imbalance $> 0.001$ TOMAN may ever be committed to the database.
- Imbalance errors must immediately abort the enclosing transaction.

### 1.2 Immutability of Posted Vouchers
- Once a journal entry has \is_posted = 1\, its lines (\journal_lines\) and core financial headers are immutable.
- Adjustments or corrections must be performed via **Reverse + Replacement** (Reversal Voucher).
- Financial reports (Balance Sheet, Profit & Loss, Trial Balance, General Ledger) must strictly filter for is_posted = 1.

### 1.3 Bank & Cash Single Source of Truth
- Bank and Cash balances in the system are derived from or strictly reconciled against General Ledger accounts:
  - **Account 101**: Cash / Till Accounts (صندوق)
  - **Account 102**: Bank Accounts (بانک‌ها)
  - **Account 106**: Notes / Cheques Receivable (اسناد دریافتنی)
  - **Account 205**: Customer Wallet Liability (بستانکاران - سپرده کیف پول مشتریان)

---

## 2. Inventory & FEFO Invariants

### 2.1 Available Stock Definition
\\text{Available Quantity} = \\text{Quantity} - \\text{Reserved Quantity}
- The system must maintain at all times:
  - $\\text{Quantity} \\ge 0$
  - $\\text{Reserved Quantity} \\ge 0$
  - $\\text{Reserved Quantity} \\le \\text{Quantity}$
  - $\\text{Available Quantity} \\ge 0$

### 2.2 Strict Layaway Isolation
- Regular POS sales must **never** allocate or decrement reserved stock.
- The FEFO allocation algorithm strictly queries batches where:
  \\text{quantity} - \\text{reserved\\_quantity} > 0
  ordered by expiry_date ASC.

### 2.3 Inventory Valuation & COGS Derivation
- Total inventory valuation must be derived as:
  \\sum (\\text{batch.quantity} \\times \\text{batch.purchase\\_price})
- Cost of Goods Sold (COGS, Account 501) must be computed directly from the specific batches allocated during FEFO checkout, not from generic variant estimates.

---

## 3. Payment & Settlement Invariants

### 3.1 Order Payment Totals
- For any checkout order:
  \\text{payment\\_status} = \\begin{cases} 
  \\text{PAID} & \\text{if } \\sum \\text{payments} \\ge \\text{order\\_total} \\\  \\text{PARTIAL} & \\text{if } 0 < \\sum \\text{payments} < \\text{order\\_total} \\\  \\text{UNPAID} & \\text{if } \\sum \\text{payments} = 0 
  \\end{cases}
- Cash change / overpayment must be calculated and recorded; orders cannot be arbitrarily marked PAID without verified tender records.

### 3.2 Proper Split-Tender GL Mapping
- Each payment method maps to its exact chart of accounts node:
  - **CASH**: Dr Account 101 (Cash)
  - **CARD / POS**: Dr Account 102 (Bank)
  - **WALLET**: Dr Account 205 (Customer Wallet Liability)
  - **LOYALTY_POINTS**: Dr Account 603 (Promotional Marketing / Discounts)
  - **CHEQUE**: Dr Account 106 (Notes Receivable)

---

## 4. Customer Wallet & Loyalty Invariants

### 4.1 Non-Negative Wallet Balance
\\text{wallet\\_balance} \\ge 0
- Debits exceeding current wallet balance must be rejected with an InsufficientWalletBalanceError.
- Every wallet transaction must maintain exact parity with the customer\'s wallet balance:
  \\text{customer.wallet\\_balance} = \\sum \\text{wallet\\_transactions.amount}

### 4.2 Customer Wallet as Balance Sheet Liability
- Customer deposits are liabilities (unearned store obligations).
- When a customer deposits money: Dr Cash/Bank, Cr Wallet Liability (205).
- When a customer pays with wallet: Dr Wallet Liability (205), Cr Sales Revenue (401).

### 4.3 Loyalty Points Reconstructibility
- Current loyalty points must be completely reconstructible from immutable audit transactions:
  \\text{loyalty\\_points} = \\sum \\text{loyalty\\_transactions.points}
- Sales returns must proportionately reverse earned loyalty points.

---

## 5. Sales Returns & Exchanges Invariants

### 5.1 Return Quantity Upper Bound
- Returned quantity cannot exceed original purchased quantity:
  \\sum \\text{returned\\_quantity} \\le \\text{order\\_item.quantity}
- Attempting to return items already refunded must be rejected (Anti-Double-Return Guard).

### 5.2 Stock Condition Segregation
- **Restockable (Sealed)** items return to active inventory (quantity += return_qty) with Dr Inventory (103) / Cr COGS (501).
- **Opened / Damaged** items route to quarantine/damaged inventory with Dr Damaged Stock (607) / Cr COGS (501).

### 5.3 Unified Exchange Transaction
- An exchange consists of a Return component and a New Sale component settled in a single atomic transaction.
- Net difference (payable or refundable) is balanced with an explicit payment or refund journal line.
