const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROD_DB_PATH = path.resolve(__dirname, '../../db/arayeshi_erp.sqlite3');
const tempDbPath = path.resolve(__dirname, '../../backups/stress_constraints_temp.sqlite3');

fs.copyFileSync(PROD_DB_PATH, tempDbPath);

const db = new Database(tempDbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

let total = 0, passed = 0, failed = 0;

function test(name, fn, expectedErrMsg) {
    total++;
    try {
        fn();
        failed++;
        console.error('  FAIL:', name, '- Expected error containing:', expectedErrMsg, 'but none was thrown');
    } catch (err) {
        if (!expectedErrMsg || err.message.includes(expectedErrMsg) || (err.code && err.code.includes('CONSTRAINT'))) {
            passed++;
            console.log('  PASS:', name, '-> Threw:', err.message);
        } else {
            failed++;
            console.error('  FAIL:', name, '- Unexpected error:', err.message);
        }
    }
}

function testOk(name, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log('  PASS:', name, '-> Succeeded as expected');
    } catch (err) {
        failed++;
        console.error('  FAIL:', name, '- Threw error:', err.message);
    }
}

console.log('================================================================');
console.log('⚡ STRESS TEST 1: Database Triggers & Constraints Fail-Fast');
console.log('================================================================\n');

// 1. inventory_batches quantity < 0
test('inventory_batches INSERT negative quantity', () => {
    db.prepare(INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-NEG-QTY', -5, 10000, '2027-01-01')).run();
}, 'inventory_batches.quantity must be >= 0');

test('inventory_batches UPDATE negative quantity', () => {
    db.prepare(UPDATE inventory_batches SET quantity = -10 WHERE id = 1).run();
}, 'inventory_batches.quantity must be >= 0');

// 2. inventory_batches reserved_quantity < 0
test('inventory_batches INSERT negative reserved_quantity', () => {
    db.prepare(INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-NEG-RES', 10, -2, 10000, '2027-01-01')).run();
}, 'inventory_batches.reserved_quantity must be >= 0');

test('inventory_batches UPDATE negative reserved_quantity', () => {
    db.prepare(UPDATE inventory_batches SET reserved_quantity = -1 WHERE id = 1).run();
}, 'inventory_batches.reserved_quantity must be >= 0');

// 3. inventory_batches reserved_quantity > quantity
test('inventory_batches INSERT reserved_quantity > quantity', () => {
    db.prepare(INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-EXC-RES', 5, 8, 10000, '2027-01-01')).run();
}, 'inventory_batches.reserved_quantity cannot exceed quantity');

test('inventory_batches UPDATE reserved_quantity > quantity', () => {
    db.prepare(UPDATE inventory_batches SET reserved_quantity = quantity + 5 WHERE id = 1).run();
}, 'inventory_batches.reserved_quantity cannot exceed quantity');

// Valid batch insert
testOk('inventory_batches valid batch insert (qty >= reserved >= 0)', () => {
    db.prepare(INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-VALID-BATCH', 25, 5, 15000, '2027-12-31')).run();
});

// 4. customers wallet_balance < 0
test('customers INSERT negative wallet_balance', () => {
    db.prepare(INSERT INTO customers (name, mobile, wallet_balance) VALUES ('STRESS-NEG-WLT', '09999999998', -50000)).run();
}, 'customers.wallet_balance must be >= 0');

test('customers UPDATE negative wallet_balance', () => {
    db.prepare(UPDATE customers SET wallet_balance = -1 WHERE id = 1).run();
}, 'customers.wallet_balance must be >= 0');

testOk('customers valid wallet_balance (0 and positive)', () => {
    db.prepare(INSERT INTO customers (name, mobile, wallet_balance) VALUES ('STRESS-VALID-WLT', '09999999997', 0)).run();
    db.prepare(UPDATE customers SET wallet_balance = 500000 WHERE mobile = '09999999997').run();
});

// 5. payments amount < 0
test('payments INSERT negative amount', () => {
    db.prepare(INSERT INTO payments (order_id, method, amount) VALUES (1, 'CASH', -10000)).run();
}, 'payments.amount must be >= 0');

test('payments UPDATE negative amount', () => {
    db.prepare(UPDATE payments SET amount = -500 WHERE id = 1).run();
}, 'payments.amount must be >= 0');

// 6. expenses amount < 0
test('expenses INSERT negative amount', () => {
    db.prepare(INSERT INTO expenses (category, amount, expense_date) VALUES ('OFFICE', -50000, '2026-09-17')).run();
}, 'expenses.amount must be >= 0');

test('expenses UPDATE negative amount', () => {
    db.prepare(UPDATE expenses SET amount = -2000 WHERE id = 1).run();
}, 'expenses.amount must be >= 0');

// 7. fixed_costs amount < 0
test('fixed_costs INSERT negative amount', () => {
    db.prepare(INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day) VALUES ('STRESS-FC', 'RENT', 1, -100000, 'MONTHLY', 1)).run();
}, 'fixed_costs.amount must be >= 0');

test('fixed_costs UPDATE negative amount', () => {
    db.prepare(UPDATE fixed_costs SET amount = -5000 WHERE id = 1).run();
}, 'fixed_costs.amount must be >= 0');

// 8. wallet_transactions amount < 0
test('wallet_transactions INSERT negative amount', () => {
    db.prepare(INSERT INTO wallet_transactions (customer_id, type, amount) VALUES (1, 'DEPOSIT', -20000)).run();
}, 'wallet_transactions.amount must be >= 0');

test('wallet_transactions UPDATE negative amount', () => {
    db.prepare(UPDATE wallet_transactions SET amount = -100 WHERE id = 1).run();
}, 'wallet_transactions.amount must be >= 0');

// 9. order_items returned_quantity > quantity or negative
test('order_items INSERT returned_quantity > quantity', () => {
    db.prepare(INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, returned_quantity) VALUES (1, 1, 3, 20000, 4)).run();
}, 'order_items.returned_quantity cannot exceed quantity');

test('order_items UPDATE returned_quantity > quantity', () => {
    db.prepare(UPDATE order_items SET returned_quantity = quantity + 2 WHERE id = 1).run();
}, 'order_items.returned_quantity cannot exceed quantity');

test('order_items INSERT negative quantity', () => {
    db.prepare(INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price) VALUES (1, 1, -3, 20000)).run();
}, 'order_items.quantity must be >= 0');

test('order_items INSERT negative returned_quantity', () => {
    db.prepare(INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, returned_quantity) VALUES (1, 1, 5, 20000, -1)).run();
}, 'order_items.returned_quantity must be >= 0');

// 10. return_items quantity < 0 or refund_amount < 0
let ret = db.prepare(SELECT id FROM sales_returns LIMIT 1).get();
let retId = ret ? ret.id : null;
if (!retId) {
    const insRet = db.prepare(INSERT INTO sales_returns (return_number, original_order_id, total_refund_amount) VALUES ('RET-STRESS-01', 1, 10000)).run();
    retId = insRet.lastInsertRowid;
}

test('return_items INSERT negative quantity', () => {
    db.prepare(INSERT INTO return_items (return_id, order_item_id, quantity, refund_amount) VALUES (?, 1, -1, 10000)).run(retId);
}, 'return_items.quantity must be >= 0');

test('return_items INSERT negative refund_amount', () => {
    db.prepare(INSERT INTO return_items (return_id, order_item_id, quantity, refund_amount) VALUES (?, 1, 1, -5000)).run(retId);
}, 'return_items.refund_amount must be >= 0');

// 11. journal_lines debit < 0 or credit < 0
test('journal_lines INSERT negative debit', () => {
    db.prepare(INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, -5000, 0)).run();
}, 'journal_lines.debit must be >= 0');

test('journal_lines INSERT negative credit', () => {
    db.prepare(INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, 0, -5000)).run();
}, 'journal_lines.credit must be >= 0');

db.close();
try { fs.unlinkSync(tempDbPath); } catch (_) {}

console.log('\n----------------------------------------------------------------');
console.log('Results: Total = ' + total + ', Passed = ' + passed + ', Failed = ' + failed);
if (failed > 0) {
    console.error('❌ FAILED CONSTRAINTS STRESS TEST');
    process.exit(1);
} else {
    console.log('✅ PASSED ALL CONSTRAINT STRESS TESTS');
    process.exit(0);
}
