const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROD_DB_PATH = path.resolve(__dirname, '../../db/arayeshi_erp.sqlite3');
const tempDbPath = path.resolve(__dirname, '../../backups/stress_constraints_temp.sqlite3');

if (!fs.existsSync(path.dirname(tempDbPath))) {
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });
}
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
    db.prepare("INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-NEG-QTY', -5, 10000, '2027-01-01')").run();
}, 'quantity');

test('inventory_batches UPDATE negative quantity', () => {
    const b = db.prepare("SELECT id FROM inventory_batches LIMIT 1").get();
    if (b) {
        db.prepare("UPDATE inventory_batches SET quantity = -10 WHERE id = ?").run(b.id);
    } else {
        const ins = db.prepare("INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, purchase_price, expiry_date) VALUES (1, 'TEMP-B', 10, 10000, '2027-01-01')").run();
        db.prepare("UPDATE inventory_batches SET quantity = -10 WHERE id = ?").run(ins.lastInsertRowid);
    }
}, 'quantity');

// 2. inventory_batches reserved_quantity < 0
test('inventory_batches INSERT negative reserved_quantity', () => {
    db.prepare("INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-NEG-RES', 10, -2, 10000, '2027-01-01')").run();
}, 'reserved_quantity');

test('inventory_batches UPDATE negative reserved_quantity', () => {
    const b = db.prepare("SELECT id FROM inventory_batches LIMIT 1").get();
    db.prepare("UPDATE inventory_batches SET reserved_quantity = -1 WHERE id = ?").run(b.id);
}, 'reserved_quantity');

// 3. inventory_batches reserved_quantity > quantity
test('inventory_batches INSERT reserved_quantity > quantity', () => {
    db.prepare("INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-EXC-RES', 5, 8, 10000, '2027-01-01')").run();
}, 'reserved_quantity');

test('inventory_batches UPDATE reserved_quantity > quantity', () => {
    const b = db.prepare("SELECT id, quantity FROM inventory_batches LIMIT 1").get();
    db.prepare("UPDATE inventory_batches SET reserved_quantity = quantity + 5 WHERE id = ?").run(b.id);
}, 'reserved_quantity');

// Valid batch insert
testOk('inventory_batches valid batch insert (qty >= reserved >= 0)', () => {
    db.prepare("INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'STRESS-VALID-BATCH', 25, 5, 15000, '2027-12-31')").run();
});

// 4. customers wallet_balance < 0
test('customers INSERT negative wallet_balance', () => {
    db.prepare("INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('STRESS-NEG-WLT', '09999999998', -50000)").run();
}, 'wallet_balance');

test('customers UPDATE negative wallet_balance', () => {
    const c = db.prepare("SELECT id FROM customers LIMIT 1").get();
    db.prepare("UPDATE customers SET wallet_balance = -1 WHERE id = ?").run(c.id);
}, 'wallet_balance');

testOk('customers valid wallet_balance (0 and positive)', () => {
    const mob = '099' + Math.floor(10000000 + Math.random() * 90000000);
    db.prepare("INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('STRESS-VALID-WLT', ?, 0)").run(mob);
    db.prepare("UPDATE customers SET wallet_balance = 500000 WHERE mobile = ?").run(mob);
});

// Ensure valid order exists for FK
let ord = db.prepare("SELECT id FROM orders LIMIT 1").get();
if (!ord) {
    const insOrd = db.prepare("INSERT INTO orders (order_number, total_amount, total_cost) VALUES ('ORD-TEST-FK-01', 100000, 50000)").run();
    ord = { id: insOrd.lastInsertRowid };
}

// 5. payments amount < 0
test('payments INSERT negative amount', () => {
    db.prepare("INSERT INTO payments (order_id, payment_method, amount) VALUES (?, 'CASH', -10000)").run(ord.id);
}, 'amount');

test('payments UPDATE negative amount', () => {
    const ins = db.prepare("INSERT INTO payments (order_id, payment_method, amount) VALUES (?, 'CASH', 5000)").run(ord.id);
    db.prepare("UPDATE payments SET amount = -500 WHERE id = ?").run(ins.lastInsertRowid);
}, 'amount');

// 6. expenses amount < 0
test('expenses INSERT negative amount', () => {
    db.prepare("INSERT INTO expenses (category, amount, payment_date) VALUES ('RENT', -50000, '2026-09-17')").run();
}, 'amount');

test('expenses UPDATE negative amount', () => {
    const ins = db.prepare("INSERT INTO expenses (category, amount, payment_date) VALUES ('RENT', 50000, '2026-09-17')").run();
    db.prepare("UPDATE expenses SET amount = -2000 WHERE id = ?").run(ins.lastInsertRowid);
}, 'amount');

// 7. fixed_costs amount < 0
test('fixed_costs INSERT negative amount', () => {
    db.prepare("INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day) VALUES ('STRESS-FC', 'RENT', 1, -100000, 'MONTHLY', 1)").run();
}, 'amount');

test('fixed_costs UPDATE negative amount', () => {
    const ins = db.prepare("INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day) VALUES ('STRESS-FC-POS', 'RENT', 1, 100000, 'MONTHLY', 1)").run();
    db.prepare("UPDATE fixed_costs SET amount = -500 WHERE id = ?").run(ins.lastInsertRowid);
}, 'amount');

// 8. wallet_transactions amount < 0
test('wallet_transactions INSERT negative amount', () => {
    db.prepare("INSERT INTO wallet_transactions (customer_id, type, amount) VALUES (1, 'DEPOSIT', -20000)").run();
}, 'amount');

test('wallet_transactions UPDATE negative amount', () => {
    const ins = db.prepare("INSERT INTO wallet_transactions (customer_id, type, amount) VALUES (1, 'DEPOSIT', 20000)").run();
    db.prepare("UPDATE wallet_transactions SET amount = -100 WHERE id = ?").run(ins.lastInsertRowid);
}, 'amount');

// 9. order_items returned_quantity > quantity or negative
const pv = db.prepare("SELECT id FROM product_variants LIMIT 1").get();
const pvId = pv ? pv.id : 1;

test('order_items INSERT returned_quantity > quantity', () => {
    db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 3, 20000, 10000, 60000, 4)").run(ord.id, pvId);
}, 'returned_quantity');

test('order_items UPDATE returned_quantity > quantity', () => {
    const oi = db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 3, 20000, 10000, 60000, 0)").run(ord.id, pvId);
    db.prepare("UPDATE order_items SET returned_quantity = quantity + 2 WHERE id = ?").run(oi.lastInsertRowid);
}, 'returned_quantity');

test('order_items INSERT negative quantity', () => {
    db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price) VALUES (?, ?, -3, 20000, 10000, -60000)").run(ord.id, pvId);
}, 'quantity');

test('order_items INSERT negative returned_quantity', () => {
    db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 5, 20000, 10000, 100000, -1)").run(ord.id, pvId);
}, 'returned_quantity');

// 10. return_items quantity < 0 or refund_amount < 0
let ret = db.prepare("SELECT id FROM returns LIMIT 1").get();
let retId = ret ? ret.id : null;
if (!retId) {
    const insRet = db.prepare("INSERT INTO returns (return_number, original_order_id, total_refund) VALUES ('RET-STRESS-01', ?, 10000)").run(ord.id);
    retId = insRet.lastInsertRowid;
}

let oiRow = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(ord.id);
if (!oiRow) {
    const insOi = db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price) VALUES (?, ?, 5, 20000, 10000, 100000)").run(ord.id, pvId);
    oiRow = { id: insOi.lastInsertRowid };
}

test('return_items INSERT negative quantity', () => {
    db.prepare("INSERT INTO return_items (return_id, order_item_id, product_variant_id, quantity, refund_amount) VALUES (?, ?, ?, -1, 10000)").run(retId, oiRow.id, pvId);
}, 'quantity');

test('return_items INSERT negative refund_amount', () => {
    db.prepare("INSERT INTO return_items (return_id, order_item_id, product_variant_id, quantity, refund_amount) VALUES (?, ?, ?, 1, -5000)").run(retId, oiRow.id, pvId);
}, 'refund_amount');

// 11. journal_lines debit < 0 or credit < 0
test('journal_lines INSERT negative debit', () => {
    db.prepare("INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, -5000, 0)").run();
}, 'debit');

test('journal_lines INSERT negative credit', () => {
    db.prepare("INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, 0, -5000)").run();
}, 'credit');

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
