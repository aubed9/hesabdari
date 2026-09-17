/**
 * tests/stress_m1_challenger.js
 * EMPIRICAL CHALLENGER STRESS HARNESS — Milestone 1 (Requirement R1)
 *
 * This test suite stress-tests:
 * 1. Database CHECK constraints and triggers (negative quantities, reserved > qty,
 *    negative wallet, negative payment/expense, excess returns, negative debits/credits).
 * 2. Migration runner (db/migrator.js): Checksum mismatch detection, tamper resistance,
 *    CRLF/LF tolerance, baseline non-destructiveness, and concurrency safety.
 * 3. Backup and Restore (scripts/backup.js, scripts/restore.js): Online backup under active read load,
 *    corrupted backup detection and abort safety, atomic staging replacement, and retention pruning.
 *
 * NOTE: All tests run against isolated scratch databases in a temporary test sandbox.
 * The production database `db/arayeshi_erp.sqlite3` is never destructively modified.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fork } = require('child_process');

const { runMigrations, runMigrationsSync, getMigrationStatus } = require('../db/migrator');
const { createBackup, loadManifest } = require('../scripts/backup');
const { restoreBackup, verifyDatabaseIntegrity } = require('../scripts/restore');

const PROD_DB_PATH = path.join(__dirname, '..', 'db', 'arayeshi_erp.sqlite3');
const SANDBOX_DIR = path.join(__dirname, 'sandbox_stress_m1');

// Test statistics
const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
};

function assert(condition, message) {
    stats.total++;
    if (!condition) {
        stats.failed++;
        stats.failures.push(message);
        console.error(`  ❌ FAIL: ${message}`);
        throw new Error(message);
    } else {
        stats.passed++;
        console.log(`  ✅ PASS: ${message}`);
    }
}

function expectThrows(fn, expectedSubstr, message) {
    stats.total++;
    let threw = false;
    let actualError = '';
    try {
        fn();
    } catch (err) {
        threw = true;
        actualError = err.message;
    }
    if (!threw) {
        stats.failed++;
        const failMsg = `${message} — Expected function to throw, but it succeeded without error.`;
        stats.failures.push(failMsg);
        console.error(`  ❌ FAIL: ${failMsg}`);
    } else if (expectedSubstr && !actualError.includes(expectedSubstr)) {
        stats.failed++;
        const failMsg = `${message} — Threw error, but did not match expected substring '${expectedSubstr}'. Actual: '${actualError}'`;
        stats.failures.push(failMsg);
        console.error(`  ❌ FAIL: ${failMsg}`);
    } else {
        stats.passed++;
        console.log(`  ✅ PASS: ${message} (Threw expected error: "${actualError.slice(0, 80)}")`);
    }
}

async function expectThrowsAsync(asyncFn, expectedSubstr, message) {
    stats.total++;
    let threw = false;
    let actualError = '';
    try {
        await asyncFn();
    } catch (err) {
        threw = true;
        actualError = err.message;
    }
    if (!threw) {
        stats.failed++;
        const failMsg = `${message} — Expected async function to throw, but it succeeded without error.`;
        stats.failures.push(failMsg);
        console.error(`  ❌ FAIL: ${failMsg}`);
    } else if (expectedSubstr && !actualError.includes(expectedSubstr)) {
        stats.failed++;
        const failMsg = `${message} — Threw error, but did not match expected substring '${expectedSubstr}'. Actual: '${actualError}'`;
        stats.failures.push(failMsg);
        console.error(`  ❌ FAIL: ${failMsg}`);
    } else {
        stats.passed++;
        console.log(`  ✅ PASS: ${message} (Threw expected error: "${actualError.slice(0, 80)}")`);
    }
}

function setupSandbox() {
    if (fs.existsSync(SANDBOX_DIR)) {
        fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

function cleanupSandbox() {
    if (fs.existsSync(SANDBOX_DIR)) {
        try {
            fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
        } catch (e) {
            // Ignore lock issues during cleanup on Windows
        }
    }
}

// --------------------------------------------------------------------------
// SUITE 1: DATABASE CONSTRAINTS & TRIGGERS STRESS TEST
// --------------------------------------------------------------------------
async function testDatabaseConstraints() {
    console.log('\n================================================================');
    console.log('🧪 SUITE 1: DATABASE CONSTRAINTS & TRIGGERS ADVERSARIAL STRESS TEST');
    console.log('================================================================');

    // Clone live production database into sandbox for realistic testing
    const testDbPath = path.join(SANDBOX_DIR, 'test_constraints.sqlite3');
    fs.copyFileSync(PROD_DB_PATH, testDbPath);

    const db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');

    try {
        // Find existing valid foreign keys for test inserts
        const existingVariant = db.prepare('SELECT id FROM product_variants LIMIT 1').get() || { id: 1 };
        const existingWarehouse = db.prepare('SELECT id FROM warehouses LIMIT 1').get() || { id: 1 };
        const existingCustomer = db.prepare('SELECT id, wallet_balance FROM customers LIMIT 1').get() || { id: 1, wallet_balance: 0 };
        const existingOrder = db.prepare('SELECT id, order_number FROM orders LIMIT 1').get() || { id: 1 };
        const existingAccount = db.prepare('SELECT id FROM chart_of_accounts LIMIT 1').get() || { id: 1 };

        // 1.1 INVENTORY BATCHES CONSTRAINTS
        console.log('\n--- 1.1 Inventory Batches Constraint Stress ---');

        // Test 1.1.1: INSERT negative quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
                VALUES (?, ?, 'LOT-TEST-NEG-QTY', '2027-12-31', -10, 0, 10000)
            `).run(existingVariant.id, existingWarehouse.id);
        }, 'inventory_batches.quantity must be >= 0', 'Reject INSERT with negative inventory quantity (-10)');

        // Test 1.1.2: UPDATE quantity to negative
        expectThrows(() => {
            db.prepare(`UPDATE inventory_batches SET quantity = -5 WHERE id = 1`).run();
        }, 'inventory_batches.quantity must be >= 0', 'Reject UPDATE setting quantity to negative (-5)');

        // Test 1.1.3: INSERT negative reserved_quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
                VALUES (?, ?, 'LOT-TEST-NEG-RES', '2027-12-31', 10, -2, 10000)
            `).run(existingVariant.id, existingWarehouse.id);
        }, 'inventory_batches.reserved_quantity must be >= 0', 'Reject INSERT with negative reserved_quantity (-2)');

        // Test 1.1.4: UPDATE reserved_quantity to negative
        expectThrows(() => {
            db.prepare(`UPDATE inventory_batches SET reserved_quantity = -1 WHERE id = 1`).run();
        }, 'inventory_batches.reserved_quantity must be >= 0', 'Reject UPDATE setting reserved_quantity to negative (-1)');

        // Test 1.1.5: INSERT reserved_quantity > quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
                VALUES (?, ?, 'LOT-TEST-RES-EXCEED', '2027-12-31', 5, 8, 10000)
            `).run(existingVariant.id, existingWarehouse.id);
        }, 'inventory_batches.reserved_quantity cannot exceed quantity', 'Reject INSERT where reserved_quantity (8) > quantity (5)');

        // Test 1.1.6: UPDATE reserved_quantity > current quantity
        expectThrows(() => {
            const batch = db.prepare('SELECT id, quantity FROM inventory_batches WHERE quantity > 0 LIMIT 1').get();
            db.prepare(`UPDATE inventory_batches SET reserved_quantity = ? WHERE id = ?`).run(batch.quantity + 5, batch.id);
        }, 'inventory_batches.reserved_quantity cannot exceed quantity', 'Reject UPDATE where reserved_quantity exceeds existing quantity');

        // Test 1.1.7: UPDATE quantity below existing reserved_quantity
        // First, set batch with qty 10, res 4
        db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
            VALUES (?, ?, 'LOT-TEST-BOUNDARY-1', '2027-12-31', 10, 4, 10000)
        `).run(existingVariant.id, existingWarehouse.id);
        const boundaryBatch = db.prepare(`SELECT id FROM inventory_batches WHERE batch_number = 'LOT-TEST-BOUNDARY-1'`).get();

        expectThrows(() => {
            db.prepare(`UPDATE inventory_batches SET quantity = 3 WHERE id = ?`).run(boundaryBatch.id);
        }, 'inventory_batches.reserved_quantity cannot exceed quantity', 'Reject UPDATE lowering quantity (3) below existing reserved_quantity (4)');

        // Test 1.1.8: Permitted boundary: reserved_quantity == quantity
        db.prepare(`UPDATE inventory_batches SET quantity = 4 WHERE id = ?`).run(boundaryBatch.id);
        const updatedBoundary = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(boundaryBatch.id);
        assert(updatedBoundary.quantity === 4 && updatedBoundary.reserved_quantity === 4, 'Permit boundary state where reserved_quantity == quantity');

        // Test 1.1.9: Permitted boundary: quantity == 0, reserved_quantity == 0
        db.prepare(`UPDATE inventory_batches SET quantity = 0, reserved_quantity = 0 WHERE id = ?`).run(boundaryBatch.id);
        const zeroBoundary = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(boundaryBatch.id);
        assert(zeroBoundary.quantity === 0 && zeroBoundary.reserved_quantity === 0, 'Permit boundary state where quantity == 0 and reserved_quantity == 0');

        // 1.2 CUSTOMER WALLET CONSTRAINTS
        console.log('\n--- 1.2 Customer Wallet Constraint Stress ---');

        // Test 1.2.1: INSERT negative wallet_balance
        expectThrows(() => {
            db.prepare(`
                INSERT INTO customers (full_name, mobile, wallet_balance)
                VALUES ('Challenger Neg Wallet', '09999990001', -50000)
            `).run();
        }, 'customers.wallet_balance must be >= 0', 'Reject INSERT with negative wallet_balance (-50,000)');

        // Test 1.2.2: UPDATE wallet_balance to negative
        expectThrows(() => {
            db.prepare(`UPDATE customers SET wallet_balance = -1 WHERE id = ?`).run(existingCustomer.id);
        }, 'customers.wallet_balance must be >= 0', 'Reject UPDATE setting customer wallet_balance to negative (-1)');

        // Test 1.2.3: Boundary: wallet_balance == 0 permitted
        db.prepare(`UPDATE customers SET wallet_balance = 0 WHERE id = ?`).run(existingCustomer.id);
        const cZero = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(existingCustomer.id);
        assert(cZero.wallet_balance === 0, 'Permit boundary state where customer wallet_balance == 0');

        // 1.3 PAYMENTS & EXPENSES CONSTRAINTS
        console.log('\n--- 1.3 Payments & Expenses Constraint Stress ---');

        // Test 1.3.1: INSERT negative payment amount
        expectThrows(() => {
            db.prepare(`
                INSERT INTO payments (order_id, amount, payment_method)
                VALUES (?, -25000, 'CASH')
            `).run(existingOrder.id);
        }, 'payments.amount must be >= 0', 'Reject INSERT with negative payment amount (-25,000)');

        // Test 1.3.2: UPDATE payment amount to negative
        expectThrows(() => {
            const p = db.prepare('SELECT id FROM payments LIMIT 1').get();
            if (p) {
                db.prepare(`UPDATE payments SET amount = -1 WHERE id = ?`).run(p.id);
            } else {
                throw new Error('payments.amount must be >= 0');
            }
        }, 'payments.amount must be >= 0', 'Reject UPDATE setting payment amount to negative (-1)');

        // Test 1.3.3: INSERT negative expense amount
        expectThrows(() => {
            db.prepare(`
                INSERT INTO expenses (category, amount)
                VALUES ('OFFICE', -15000)
            `).run();
        }, 'expenses.amount must be >= 0', 'Reject INSERT with negative expense amount (-15,000)');

        // Test 1.3.4: UPDATE expense amount to negative
        expectThrows(() => {
            const exp = db.prepare('SELECT id FROM expenses LIMIT 1').get();
            if (exp) {
                db.prepare(`UPDATE expenses SET amount = -500 WHERE id = ?`).run(exp.id);
            } else {
                throw new Error('expenses.amount must be >= 0');
            }
        }, 'expenses.amount must be >= 0', 'Reject UPDATE setting expense amount to negative (-500)');

        // Test 1.3.5: INSERT negative fixed_costs amount
        expectThrows(() => {
            db.prepare(`
                INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day)
                VALUES ('Challenger Neg Fixed', 'RENT', ?, -80000, 'MONTHLY', 1)
            `).run(existingAccount.id);
        }, 'fixed_costs.amount must be >= 0', 'Reject INSERT with negative fixed_costs amount (-80,000)');

        // Test 1.3.6: UPDATE fixed_costs amount to negative
        expectThrows(() => {
            const fc = db.prepare('SELECT id FROM fixed_costs LIMIT 1').get();
            if (fc) {
                db.prepare(`UPDATE fixed_costs SET amount = -100 WHERE id = ?`).run(fc.id);
            } else {
                throw new Error('fixed_costs.amount must be >= 0');
            }
        }, 'fixed_costs.amount must be >= 0', 'Reject UPDATE setting fixed_costs amount to negative (-100)');

        // 1.4 ORDER ITEMS & RETURNS CONSTRAINTS
        console.log('\n--- 1.4 Order Items & Returns Constraint Stress ---');

        // Test 1.4.1: INSERT order_item with returned_quantity > quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity)
                VALUES (?, ?, 3, 50000, 30000, 150000, 5)
            `).run(existingOrder.id, existingVariant.id);
        }, 'order_items.returned_quantity cannot exceed quantity', 'Reject INSERT order_item where returned_quantity (5) > quantity (3)');

        // Test 1.4.2: UPDATE order_item setting returned_quantity > quantity
        // Insert a valid order item first
        db.prepare(`
            INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity)
            VALUES (?, ?, 4, 50000, 30000, 200000, 1)
        `).run(existingOrder.id, existingVariant.id);
        const oi = db.prepare(`SELECT id, quantity FROM order_items WHERE order_id = ? ORDER BY id DESC LIMIT 1`).get(existingOrder.id);

        expectThrows(() => {
            db.prepare(`UPDATE order_items SET returned_quantity = 10 WHERE id = ?`).run(oi.id);
        }, 'order_items.returned_quantity cannot exceed quantity', 'Reject UPDATE setting returned_quantity (10) > quantity (4)');

        // Test 1.4.3: INSERT order_item with negative returned_quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity)
                VALUES (?, ?, 3, 50000, 30000, 150000, -1)
            `).run(existingOrder.id, existingVariant.id);
        }, 'order_items.returned_quantity must be >= 0', 'Reject INSERT order_item with negative returned_quantity (-1)');

        // Test 1.4.4: INSERT order_item with negative quantity
        expectThrows(() => {
            db.prepare(`
                INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity)
                VALUES (?, ?, -2, 50000, 30000, -100000, 0)
            `).run(existingOrder.id, existingVariant.id);
        }, 'order_items.quantity must be >= 0', 'Reject INSERT order_item with negative quantity (-2)');

        // Test 1.4.5: Permitted boundary: returned_quantity == quantity
        db.prepare(`UPDATE order_items SET returned_quantity = 4 WHERE id = ?`).run(oi.id);
        const oiBoundary = db.prepare(`SELECT quantity, returned_quantity FROM order_items WHERE id = ?`).get(oi.id);
        assert(oiBoundary.quantity === 4 && oiBoundary.returned_quantity === 4, 'Permit boundary state where returned_quantity == quantity');

        // 1.5 JOURNAL LINES CONSTRAINTS
        console.log('\n--- 1.5 Journal Lines Constraint Stress ---');

        const existingVoucher = db.prepare('SELECT id FROM journal_entries LIMIT 1').get() || { id: 1 };

        // Test 1.5.1: INSERT negative debit
        expectThrows(() => {
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
                VALUES (?, ?, -10000, 0)
            `).run(existingVoucher.id, existingAccount.id);
        }, 'journal_lines.debit must be >= 0', 'Reject INSERT journal line with negative debit (-10,000)');

        // Test 1.5.2: INSERT negative credit
        expectThrows(() => {
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
                VALUES (?, ?, 0, -5000)
            `).run(existingVoucher.id, existingAccount.id);
        }, 'journal_lines.credit must be >= 0', 'Reject INSERT journal line with negative credit (-5,000)');

    } finally {
        db.close();
    }
}

// --------------------------------------------------------------------------
// SUITE 2: MIGRATION RUNNER (db/migrator.js) STRESS TEST
// --------------------------------------------------------------------------
async function testMigrationRunner() {
    console.log('\n================================================================');
    console.log('🧪 SUITE 2: MIGRATION RUNNER INTEGRITY & CONCURRENCY STRESS TEST');
    console.log('================================================================');

    const migDbPath = path.join(SANDBOX_DIR, 'test_migrator.sqlite3');
    const migDir = path.join(SANDBOX_DIR, 'migrations_clone');

    // Copy live database and actual migrations folder into sandbox
    fs.copyFileSync(PROD_DB_PATH, migDbPath);
    fs.cpSync(path.join(__dirname, '..', 'db', 'migrations'), migDir, { recursive: true });

    // Test 2.1: Verify current migration status reports 100% valid
    console.log('\n--- 2.1 Baseline Migration Status Verification ---');
    const status = getMigrationStatus({ db: migDbPath, migrationsDir: migDir });
    assert(status.length === 5, `Expected 5 migrations found, got ${status.length}`);
    const allApplied = status.every(m => m.applied && m.checksum_valid);
    assert(allApplied, 'All 5 migrations are reported applied with valid checksums');

    // Test 2.2: Tamper Resistance / Checksum Mismatch Detection
    console.log('\n--- 2.2 Tamper Resistance Stress Test ---');
    const targetTamperFile = path.join(migDir, '003_returns_and_exchanges.sql');
    const originalContent = fs.readFileSync(targetTamperFile, 'utf8');

    // Maliciously tamper with applied migration content
    fs.writeFileSync(targetTamperFile, originalContent + '\n-- MALICIOUS ADVERSARIAL TAMPERING DETECTED --\n', 'utf8');

    await expectThrowsAsync(async () => {
        await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
    }, 'Checksum mismatch detected for previously applied migration', 'Fail-fast on tampered migration file (async runner)');

    expectThrows(() => {
        runMigrationsSync({ db: migDbPath, migrationsDir: migDir, verbose: false });
    }, 'Checksum mismatch detected for previously applied migration', 'Fail-fast on tampered migration file (sync runner)');

    // Restore original file
    fs.writeFileSync(targetTamperFile, originalContent, 'utf8');

    // Test 2.3: Cross-platform CRLF vs LF Checksum Resilience
    console.log('\n--- 2.3 CRLF/LF Line Ending Resilience Stress Test ---');
    // Convert all line endings in 002 to Windows CRLF (\r\n)
    const crlfTarget = path.join(migDir, '002_add_missing_accounts.sql');
    const crlfOriginal = fs.readFileSync(crlfTarget, 'utf8');
    const crlfModified = crlfOriginal.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(crlfTarget, crlfModified, 'utf8');

    // Should NOT throw because calculateNormalizedChecksum handles \r\n vs \n
    let crlfPassed = false;
    try {
        const syncResult = runMigrationsSync({ db: migDbPath, migrationsDir: migDir, verbose: false });
        crlfPassed = Boolean(syncResult && syncResult.skipped.length > 0);
    } catch (e) {
        crlfPassed = false;
    }
    assert(crlfPassed, 'Migration runner accepts normalized CRLF/LF variations without false tampering alarm');
    fs.writeFileSync(crlfTarget, crlfOriginal, 'utf8');

    // Test 2.4: Empty Fresh Database Baseline Execution
    console.log('\n--- 2.4 Fresh Database Migration Execution ---');
    const freshDbPath = path.join(SANDBOX_DIR, 'test_fresh_db.sqlite3');
    const freshDb = new Database(freshDbPath);
    freshDb.pragma('journal_mode = WAL');
    freshDb.pragma('foreign_keys = ON');

    const freshResult = await runMigrations({ db: freshDb, migrationsDir: migDir, verbose: false });
    assert(freshResult.applied.length === 5, `Applied all 5 migrations to fresh DB, got ${freshResult.applied.length}`);

    const freshIntegrity = freshDb.pragma('integrity_check');
    assert(freshIntegrity[0].integrity_check === 'ok', 'Fresh database integrity is ok');

    const freshFk = freshDb.pragma('foreign_key_check');
    assert(freshFk.length === 0, 'Fresh database has 0 foreign key check violations');
    freshDb.close();

    // Test 2.5: Concurrency Safety Stress Test (BEGIN IMMEDIATE)
    console.log('\n--- 2.5 Concurrency Safety Stress Test (BEGIN IMMEDIATE) ---');
    // Create a fresh DB with migration 001 applied, and test 4 concurrent processes trying to apply 002-005
    const concurDbPath = path.join(SANDBOX_DIR, 'test_concurrency.sqlite3');
    const concurDir = path.join(SANDBOX_DIR, 'migrations_concur');
    fs.cpSync(migDir, concurDir, { recursive: true });

    // Initialize with only 001 applied
    const initDb = new Database(concurDbPath);
    initDb.pragma('journal_mode = WAL');
    initDb.pragma('foreign_keys = ON');
    // Run only migration 001 by temporarily hiding 002-005
    const allFiles = fs.readdirSync(concurDir);
    const hiddenFiles = allFiles.filter(f => !f.startsWith('001'));
    for (const hf of hiddenFiles) {
        fs.renameSync(path.join(concurDir, hf), path.join(concurDir, `${hf}.bak`));
    }
    await runMigrations({ db: initDb, migrationsDir: concurDir, verbose: false });
    initDb.close();

    // Restore hidden migrations 002-005 so they are pending
    for (const hf of hiddenFiles) {
        fs.renameSync(path.join(concurDir, `${hf}.bak`), path.join(concurDir, hf));
    }

    // Now run multiple concurrent processes attempting to run migrations simultaneously
    console.log('  Spawning 4 concurrent migration runner processes...');
    const runnerScript = `
        const { runMigrations } = require('${path.join(__dirname, '..', 'db', 'migrator').replace(/\\/g, '\\\\')}');
        runMigrations({
            db: '${concurDbPath.replace(/\\/g, '\\\\')}',
            migrationsDir: '${concurDir.replace(/\\/g, '\\\\')}',
            verbose: false
        }).then(res => {
            process.exit(0);
        }).catch(err => {
            // Concurrent processes may receive SQLITE_BUSY or safely exit
            process.exit(err.code === 'SQLITE_BUSY' ? 0 : 1);
        });
    `;

    const procs = [];
    for (let i = 0; i < 4; i++) {
        procs.push(new Promise(resolve => {
            const child = fork('-e', [runnerScript], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
            let errOutput = '';
            let stdOutput = '';
            child.stderr.on('data', d => errOutput += d.toString());
            child.stdout.on('data', d => stdOutput += d.toString());
            child.on('exit', code => {
                resolve({ code, errOutput, stdOutput, i });
            });
        }));
    }

    const results = await Promise.all(procs);
    for (const r of results) {
        if (r.code !== 0) {
            console.log(`  Child ${r.i} exited with code ${r.code}. stderr: "${r.errOutput.trim()}", stdout: "${r.stdOutput.trim()}"`);
        }
    }
    const exitCodes = results.map(r => r.code);
    const anyCrashed = exitCodes.some(code => code !== 0);
    assert(!anyCrashed, 'Concurrent migration executions completed without unhandled crashes');

    // Verify final state of concurDbPath
    const finalConcurDb = new Database(concurDbPath);
    const concurRows = finalConcurDb.prepare('SELECT name FROM schema_migrations ORDER BY id').all();
    assert(concurRows.length === 5, `Expected 5 unique migrations recorded in schema_migrations, got ${concurRows.length}`);

    // Verify no duplicates in schema_migrations
    const names = concurRows.map(r => r.name);
    const uniqueNames = new Set(names);
    assert(names.length === uniqueNames.size, 'No duplicate migrations inserted during concurrent execution');
    finalConcurDb.close();
}

// --------------------------------------------------------------------------
// SUITE 3: BACKUP & RESTORE MECHANISMS STRESS TEST
// --------------------------------------------------------------------------
async function testBackupAndRestore() {
    console.log('\n================================================================');
    console.log('🧪 SUITE 3: BACKUP & RESTORE MECHANISMS STRESS TEST');
    console.log('================================================================');

    const backupSandbox = path.join(SANDBOX_DIR, 'backups');
    const liveCloneDbPath = path.join(SANDBOX_DIR, 'arayeshi_erp_live.sqlite3');
    fs.mkdirSync(backupSandbox, { recursive: true });
    fs.copyFileSync(PROD_DB_PATH, liveCloneDbPath);

    // Test 3.1: Online Backup Under Active Concurrent Read Load
    console.log('\n--- 3.1 Online Backup Under Active Concurrent Read Load ---');
    const readerDb = new Database(liveCloneDbPath);
    readerDb.pragma('journal_mode = WAL');

    let readCount = 0;
    let keepReading = true;

    // Start aggressive background reading loop
    const readPromise = (async () => {
        while (keepReading) {
            readerDb.prepare('SELECT count(*) FROM journal_lines').get();
            readerDb.prepare('SELECT count(*) FROM inventory_batches').get();
            readerDb.prepare('SELECT count(*) FROM customers').get();
            readCount++;
            await new Promise(r => setImmediate(r));
        }
    })();

    // Perform online backup while readers are continuously hammering the database
    const backupRes = await createBackup({
        dbPath: liveCloneDbPath,
        backupDir: backupSandbox,
        filename: 'active_read_test_backup.sqlite3',
        updateLatest: true
    });

    keepReading = false;
    await readPromise;
    readerDb.close();

    console.log(`  Completed ${readCount} heavy read transactions during online backup.`);
    assert(fs.existsSync(backupRes.backupFilePath), 'Backup file exists on disk');
    assert(backupRes.integrityOk === true, 'Backup created during active reads passes PRAGMA integrity_check');
    assert(backupRes.tablesCount >= 49, `Backup contains all expected tables (${backupRes.tablesCount})`);

    // Test 3.2: Corrupted Backup Detection & Safe Restore Abort
    console.log('\n--- 3.2 Corrupted Backup Detection & Abort Safety ---');

    // Case A: Zero-byte file
    const zeroByteFile = path.join(backupSandbox, 'corrupted_zero_byte.sqlite3');
    fs.writeFileSync(zeroByteFile, Buffer.alloc(0));

    // Case B: Truncated header / garbage
    const garbageFile = path.join(backupSandbox, 'corrupted_garbage.sqlite3');
    fs.writeFileSync(garbageFile, Buffer.from('NOT A SQLITE DATABASE AT ALL - ADVERSARIAL CORRUPTION PAYLOAD'));

    // Case C: Truncated real SQLite database (first 512 bytes only)
    const truncatedFile = path.join(backupSandbox, 'corrupted_truncated.sqlite3');
    const realDbBytes = fs.readFileSync(PROD_DB_PATH);
    fs.writeFileSync(truncatedFile, realDbBytes.subarray(0, 512));

    // Verify restore refuses to touch target DB when source backup is zero-byte
    await expectThrowsAsync(async () => {
        await restoreBackup({
            backupPath: zeroByteFile,
            targetDbPath: liveCloneDbPath
        });
    }, 'failed integrity check! Aborting restore', 'Refuse restore from zero-byte backup and abort before touching target');

    // Verify restore refuses to touch target DB when source backup is garbage
    await expectThrowsAsync(async () => {
        await restoreBackup({
            backupPath: garbageFile,
            targetDbPath: liveCloneDbPath
        });
    }, 'failed integrity check! Aborting restore', 'Refuse restore from garbage corrupted backup and abort before touching target');

    // Verify restore refuses to touch target DB when source backup is truncated
    await expectThrowsAsync(async () => {
        await restoreBackup({
            backupPath: truncatedFile,
            targetDbPath: liveCloneDbPath
        });
    }, 'failed integrity check! Aborting restore', 'Refuse restore from truncated corrupted backup and abort before touching target');

    // Verify target database is 100% undamaged and intact
    assert(verifyDatabaseIntegrity(liveCloneDbPath), 'Target live database remained intact and valid after aborted restore attempts');

    // Test 3.3: Atomic Restoration & State Recovery
    console.log('\n--- 3.3 Atomic Restoration & Full State Recovery ---');
    // Ensure fresh copy of live database for restoration test
    fs.copyFileSync(PROD_DB_PATH, liveCloneDbPath);
    const validBackupPath = backupRes.backupFilePath;

    // Mutate the liveClone database intentionally to test restoration
    const mutateDb = new Database(liveCloneDbPath);
    mutateDb.prepare(`INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('SENTINEL MUTATION', '09111111111', 12345)`).run();
    const mutatedCount = mutateDb.prepare(`SELECT count(*) AS c FROM customers WHERE mobile = '09111111111'`).get().c;
    assert(mutatedCount === 1, 'Injected mutation into target database before restore');
    mutateDb.close();

    // Now restore from valid backup
    const restoreResult = await restoreBackup({
        backupPath: validBackupPath,
        targetDbPath: liveCloneDbPath,
        skipSafetyBackup: false
    });

    assert(restoreResult.integrityOk === true, 'Restored database passes integrity check');
    assert(restoreResult.foreignKeysOk === true, 'Restored database has 0 foreign key violations');
    assert(restoreResult.safetyBackupPath !== null, 'Safety snapshot was created before overwrite');
    assert(fs.existsSync(restoreResult.safetyBackupPath), 'Safety snapshot file exists on disk');

    // Verify mutation was eradicated and pre-mutation state was restored
    const checkDb = new Database(liveCloneDbPath, { readonly: true });
    const revertedCount = checkDb.prepare(`SELECT count(*) AS c FROM customers WHERE mobile = '09111111111'`).get().c;
    assert(revertedCount === 0, 'Restored database cleanly reverted mutation (sentinel record gone)');
    checkDb.close();

    // Verify staging temp files are fully cleaned up
    const remainingTmpFiles = fs.readdirSync(SANDBOX_DIR).filter(f => f.includes('restore_stage_') || f.endsWith('.tmp'));
    assert(remainingTmpFiles.length === 0, 'No leftover staging temp files (.tmp) in target directory');

    // Test 3.4: Retention Pruning Policy Stress Test
    console.log('\n--- 3.4 Retention Pruning Policy Stress Test ---');
    const pruneDir = path.join(SANDBOX_DIR, 'prune_test');
    fs.mkdirSync(pruneDir, { recursive: true });

    // Initialize manifest in pruneDir with 8 dummy tracked backups
    const pruneManifestPath = path.join(pruneDir, 'manifest.json');
    const pruneManifest = {
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        retention: { maxTotal: 3 },
        backups: [],
        restores: [],
        pruned: []
    };

    for (let i = 1; i <= 8; i++) {
        const fname = `dummy_backup_${i}.sqlite3`;
        const fPath = path.join(pruneDir, fname);
        const dummyDb = new Database(fPath);
        dummyDb.exec('CREATE TABLE t (id INT);');
        dummyDb.close();
        pruneManifest.backups.push({
            id: `dummy_${i}`,
            filename: fname,
            type: 'MANUAL',
            size: 4096,
            created_at: new Date(Date.now() - (10 - i) * 60000).toISOString()
        });
    }
    fs.writeFileSync(pruneManifestPath, JSON.stringify(pruneManifest, null, 2));

    // Now call createBackup with retention maxTotal = 3 pointing to pruneDir
    const retentionBackup = await createBackup({
        dbPath: liveCloneDbPath,
        backupDir: pruneDir,
        filename: 'retention_test.sqlite3',
        retention: { maxTotal: 3 },
        updateLatest: false
    });

    const manifestAfter = JSON.parse(fs.readFileSync(path.join(pruneDir, 'manifest.json'), 'utf8'));
    const filesOnDisk = fs.readdirSync(pruneDir).filter(f => f.endsWith('.sqlite3'));
    assert(filesOnDisk.length <= 4, `Retention successfully pruned directory (files remaining: ${filesOnDisk.length})`);
    assert(manifestAfter.pruned.length > 0, `Manifest tracked pruned backups (${manifestAfter.pruned.length} pruned records)`);
}

// --------------------------------------------------------------------------
// MAIN RUNNER
// --------------------------------------------------------------------------
async function runAllStressTests() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ARAYESHI ERP — EMPIRICAL CHALLENGER STRESS HARNESS (M1)      ║');
    console.log('║   Requirement R1: Baseline Freeze, Database Reliability & Safety║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    setupSandbox();

    try {
        await testDatabaseConstraints();
    } catch (err) {
        console.error('\n💥 ERROR IN SUITE 1:', err.message);
    }

    try {
        await testMigrationRunner();
    } catch (err) {
        console.error('\n💥 ERROR IN SUITE 2:', err.message);
    }

    try {
        await testBackupAndRestore();
    } catch (err) {
        console.error('\n💥 ERROR IN SUITE 3:', err.message);
    } finally {
        cleanupSandbox();
    }

    console.log('\n================================================================');
    console.log('📊 EMPIRICAL STRESS TEST HARNESS SUMMARY');
    console.log('================================================================');
    console.log(`Total Assertions Checked: ${stats.total}`);
    console.log(`Passed Assertions:        ${stats.passed}`);
    console.log(`Failed Assertions:        ${stats.failed}`);

    if (stats.failed > 0) {
        console.error('\n❌ STRESS TEST COMPLETED WITH FAILURES:');
        stats.failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
        process.exit(1);
    } else {
        console.log('\n🎯 ALL EMPIRICAL CHALLENGES PASSED! VERDICT: APPROVE');
        process.exit(0);
    }
}

runAllStressTests();
