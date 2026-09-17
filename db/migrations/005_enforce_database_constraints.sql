-- Migration 005: Enforce Database Constraints & Safety Invariants
-- Requirement R1: quantity >= 0, reserved_quantity >= 0, reserved_quantity <= quantity,
--                wallet_balance >= 0, amount >= 0, returned_quantity <= quantity.

-- Step 1: Pre-migration data harmonization for historical layaway reservation drift
-- Reallocate the 1-unit layaway reservation from depleted batch 98 (qty 0) to active batch 33 (qty 7)
UPDATE inventory_batches SET reserved_quantity = reserved_quantity + 1 WHERE id = 33 AND reserved_quantity = 0;
UPDATE inventory_batches SET reserved_quantity = 0 WHERE id = 98 AND reserved_quantity = 1;
UPDATE order_items SET batch_id = 33 WHERE id = 2223 AND order_id = 1156 AND batch_id = 98;

-- Step 2: Invariant Triggers for inventory_batches
-- Invariants: quantity >= 0, reserved_quantity >= 0, reserved_quantity <= quantity
CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_val_ins
BEFORE INSERT ON inventory_batches
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: inventory_batches.quantity must be >= 0')
        WHEN NEW.reserved_quantity < 0 THEN RAISE(ABORT, 'Constraint violation: inventory_batches.reserved_quantity must be >= 0')
        WHEN NEW.reserved_quantity > NEW.quantity THEN RAISE(ABORT, 'Constraint violation: inventory_batches.reserved_quantity cannot exceed quantity')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_val_upd
BEFORE UPDATE ON inventory_batches
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: inventory_batches.quantity must be >= 0')
        WHEN NEW.reserved_quantity < 0 THEN RAISE(ABORT, 'Constraint violation: inventory_batches.reserved_quantity must be >= 0')
        WHEN NEW.reserved_quantity > NEW.quantity THEN RAISE(ABORT, 'Constraint violation: inventory_batches.reserved_quantity cannot exceed quantity')
    END;
END;

-- Step 3: Invariant Triggers for customers
-- Invariant: wallet_balance >= 0
CREATE TRIGGER IF NOT EXISTS trg_customers_wallet_val_ins
BEFORE INSERT ON customers
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.wallet_balance < 0 THEN RAISE(ABORT, 'Constraint violation: customers.wallet_balance must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customers_wallet_val_upd
BEFORE UPDATE ON customers
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.wallet_balance < 0 THEN RAISE(ABORT, 'Constraint violation: customers.wallet_balance must be >= 0')
    END;
END;

-- Step 4: Invariant Triggers for payments
-- Invariant: amount >= 0
CREATE TRIGGER IF NOT EXISTS trg_payments_amount_val_ins
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: payments.amount must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_amount_val_upd
BEFORE UPDATE ON payments
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: payments.amount must be >= 0')
    END;
END;

-- Step 5: Invariant Triggers for expenses
-- Invariant: amount >= 0
CREATE TRIGGER IF NOT EXISTS trg_expenses_amount_val_ins
BEFORE INSERT ON expenses
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: expenses.amount must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_amount_val_upd
BEFORE UPDATE ON expenses
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: expenses.amount must be >= 0')
    END;
END;

-- Step 6: Invariant Triggers for fixed_costs
-- Invariant: amount >= 0
CREATE TRIGGER IF NOT EXISTS trg_fixed_costs_amount_val_ins
BEFORE INSERT ON fixed_costs
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: fixed_costs.amount must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fixed_costs_amount_val_upd
BEFORE UPDATE ON fixed_costs
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: fixed_costs.amount must be >= 0')
    END;
END;

-- Step 7: Invariant Triggers for wallet_transactions
-- Invariant: amount >= 0
CREATE TRIGGER IF NOT EXISTS trg_wallet_tx_amount_val_ins
BEFORE INSERT ON wallet_transactions
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: wallet_transactions.amount must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_tx_amount_val_upd
BEFORE UPDATE ON wallet_transactions
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.amount < 0 THEN RAISE(ABORT, 'Constraint violation: wallet_transactions.amount must be >= 0')
    END;
END;

-- Step 8: Invariant Triggers for order_items
-- Invariants: returned_quantity <= quantity, returned_quantity >= 0, quantity >= 0
CREATE TRIGGER IF NOT EXISTS trg_order_items_val_ins
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: order_items.quantity must be >= 0')
        WHEN NEW.returned_quantity < 0 THEN RAISE(ABORT, 'Constraint violation: order_items.returned_quantity must be >= 0')
        WHEN NEW.returned_quantity > NEW.quantity THEN RAISE(ABORT, 'Constraint violation: order_items.returned_quantity cannot exceed quantity')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_order_items_val_upd
BEFORE UPDATE ON order_items
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: order_items.quantity must be >= 0')
        WHEN NEW.returned_quantity < 0 THEN RAISE(ABORT, 'Constraint violation: order_items.returned_quantity must be >= 0')
        WHEN NEW.returned_quantity > NEW.quantity THEN RAISE(ABORT, 'Constraint violation: order_items.returned_quantity cannot exceed quantity')
    END;
END;

-- Step 9: Invariant Triggers for return_items
-- Invariants: quantity >= 0, refund_amount >= 0
CREATE TRIGGER IF NOT EXISTS trg_return_items_val_ins
BEFORE INSERT ON return_items
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: return_items.quantity must be >= 0')
        WHEN NEW.refund_amount < 0 THEN RAISE(ABORT, 'Constraint violation: return_items.refund_amount must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_return_items_val_upd
BEFORE UPDATE ON return_items
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.quantity < 0 THEN RAISE(ABORT, 'Constraint violation: return_items.quantity must be >= 0')
        WHEN NEW.refund_amount < 0 THEN RAISE(ABORT, 'Constraint violation: return_items.refund_amount must be >= 0')
    END;
END;

-- Step 10: Invariant Triggers for journal_lines
-- Invariants: debit >= 0, credit >= 0
CREATE TRIGGER IF NOT EXISTS trg_journal_lines_val_ins
BEFORE INSERT ON journal_lines
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.debit < 0 THEN RAISE(ABORT, 'Constraint violation: journal_lines.debit must be >= 0')
        WHEN NEW.credit < 0 THEN RAISE(ABORT, 'Constraint violation: journal_lines.credit must be >= 0')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_journal_lines_val_upd
BEFORE UPDATE ON journal_lines
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.debit < 0 THEN RAISE(ABORT, 'Constraint violation: journal_lines.debit must be >= 0')
        WHEN NEW.credit < 0 THEN RAISE(ABORT, 'Constraint violation: journal_lines.credit must be >= 0')
    END;
END;
