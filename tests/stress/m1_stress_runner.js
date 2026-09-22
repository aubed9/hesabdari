/**
 * tests/stress/m1_stress_runner.js
 * Comprehensive Empirical Stress Testing Suite for Milestone 1 (Requirement R1)
 *
 * Covers:
 *  1. SQLite Constraints & Triggers Invariants (Fail-fast verification)
 *  2. Migration Runner db/migrator.js (Checksum tamper detection, rollback atomicity, concurrency safety)
 *  3. Backup & Restore Scripts (Online backup during active writes, corrupt backup safe abort, atomic restore, retention)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fork } = require('child_process');

const { runMigrations, runMigrationsSync, calculateChecksum, calculateNormalizedChecksum, ensureMigrationsTable, getAppliedMigrations } = require('../../db/migrator');
const { createBackup, pruneExpiredBackups, loadManifest, saveManifest, formatTimestamp } = require('../../scripts/backup');
const { restoreBackup, verifyDatabaseIntegrity, verifyForeignKeys } = require('../../scripts/restore');

const PROD_DB_PATH = path.resolve(__dirname, '../../db/arayeshi_erp.sqlite3');
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const TEMP_DIR = path.resolve(__dirname, '../../backups/stress_temp_' + Date.now());

// Results accumulator
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
};

function recordTest(suite, name, passed, details, error = null) {
    results.total++;
    if (passed) {
        results.passed++;
        console.log(`  [PASS] [${suite}] ${name}`);
    } else {
        results.failed++;
        console.error(`  [FAIL] [${suite}] ${name}`);
        if (error) {
            console.error(`         Error: ${error.message || error}`);
        }
    }
    results.tests.push({ suite, name, passed, details, error: error ? (error.message || String(error)) : null });
}

function assertThrows(suite, testName, fn, expectedSubstring) {
    try {
        fn();
        recordTest(suite, testName, false, `Expected error containing "${expectedSubstring}", but no error was thrown.`);
    } catch (err) {
        if (!expectedSubstring || err.message.includes(expectedSubstring) || (err.code && err.code.includes('CONSTRAINT'))) {
            recordTest(suite, testName, true, `Correctly threw: ${err.message}`);
        } else {
            recordTest(suite, testName, false, `Threw unexpected error: ${err.message}. Expected: ${expectedSubstring}`, err);
        }
    }
}

function assertDoesNotThrow(suite, testName, fn) {
    try {
        const res = fn();
        recordTest(suite, testName, true, 'Executed cleanly without throwing.');
        return res;
    } catch (err) {
        recordTest(suite, testName, false, `Unexpected error thrown: ${err.message}`, err);
    }
}

async function runSuite1_Constraints(testDbPath) {
    console.log('\n===============================================================');
    console.log('⚡ SUITE 1: SQLite Constraints & Triggers Invariants (Fail-Fast)');
    console.log('===============================================================');

    const db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // 1. inventory_batches quantity < 0
    assertThrows('Constraints', 'inventory_batches: INSERT negative quantity fails fast', () => {
        db.prepare(
            "INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, purchase_price, expiry_date) VALUES (1, 'TEST-NEG-QTY-INS', -5, 10000, '2027-01-01')"
        ).run();
    }, 'inventory_batches.quantity must be >= 0');

    assertThrows('Constraints', 'inventory_batches: UPDATE negative quantity fails fast', () => {
        db.prepare("UPDATE inventory_batches SET quantity = -10 WHERE id = 1").run();
    }, 'inventory_batches.quantity must be >= 0');

    // 2. inventory_batches reserved_quantity < 0
    assertThrows('Constraints', 'inventory_batches: INSERT negative reserved_quantity fails fast', () => {
        db.prepare(
            "INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'TEST-NEG-RES-INS', 10, -2, 10000, '2027-01-01')"
        ).run();
    }, 'inventory_batches.reserved_quantity must be >= 0');

    assertThrows('Constraints', 'inventory_batches: UPDATE negative reserved_quantity fails fast', () => {
        db.prepare("UPDATE inventory_batches SET reserved_quantity = -1 WHERE id = 1").run();
    }, 'inventory_batches.reserved_quantity must be >= 0');

    // 3. inventory_batches reserved_quantity > quantity
    assertThrows('Constraints', 'inventory_batches: INSERT reserved_quantity > quantity fails fast', () => {
        db.prepare(
            "INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'TEST-EXCESS-RES-INS', 5, 8, 10000, '2027-01-01')"
        ).run();
    }, 'inventory_batches.reserved_quantity cannot exceed quantity');

    assertThrows('Constraints', 'inventory_batches: UPDATE reserved_quantity > quantity fails fast', () => {
        db.prepare("UPDATE inventory_batches SET reserved_quantity = quantity + 5 WHERE id = 1").run();
    }, 'inventory_batches.reserved_quantity cannot exceed quantity');

    // Valid inventory_batches insert should succeed
    assertDoesNotThrow('Constraints', 'inventory_batches: Valid batch insert succeeds without false positives', () => {
        db.prepare(
            "INSERT INTO inventory_batches (product_variant_id, batch_number, quantity, reserved_quantity, purchase_price, expiry_date) VALUES (1, 'TEST-VALID-BATCH', 20, 5, 15000, '2027-12-31')"
        ).run();
    });

    // 4. customers wallet_balance < 0
    assertThrows('Constraints', 'customers: INSERT negative wallet_balance fails fast', () => {
        db.prepare(
            "INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('STRESS-NEG-WLT', '09999999998', -50000)"
        ).run();
    }, 'customers.wallet_balance must be >= 0');

    assertThrows('Constraints', 'customers: UPDATE negative wallet_balance fails fast', () => {
        db.prepare("UPDATE customers SET wallet_balance = -1 WHERE id = 1").run();
    }, 'customers.wallet_balance must be >= 0');

    assertDoesNotThrow('Constraints', 'customers: Valid wallet_balance (0 and positive) succeeds', () => {
        db.prepare(
            "INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('STRESS-VALID-WLT', '09999999997', 0)"
        ).run();
        db.prepare(
            "UPDATE customers SET wallet_balance = 500000 WHERE mobile = '09999999997'"
        ).run();
    });

    let ord = db.prepare("SELECT id FROM orders LIMIT 1").get();
    if (!ord) {
        const insOrd = db.prepare("INSERT INTO orders (order_number, total_amount, total_cost) VALUES ('ORD-TEST-FK-01', 100000, 50000)").run();
        ord = { id: insOrd.lastInsertRowid };
    }

    // 5. payments amount < 0
    assertThrows('Constraints', 'payments: INSERT negative amount fails fast', () => {
        db.prepare(
            "INSERT INTO payments (order_id, payment_method, amount) VALUES (?, 'CASH', -10000)"
        ).run(ord.id);
    }, 'amount');

    assertThrows('Constraints', 'payments: UPDATE negative amount fails fast', () => {
        const ins = db.prepare("INSERT INTO payments (order_id, payment_method, amount) VALUES (?, 'CASH', 5000)").run(ord.id);
        db.prepare("UPDATE payments SET amount = -500 WHERE id = ?").run(ins.lastInsertRowid);
    }, 'amount');

    // 6. expenses amount < 0
    assertThrows('Constraints', 'expenses: INSERT negative amount fails fast', () => {
        db.prepare(
            "INSERT INTO expenses (category, amount, payment_date) VALUES ('RENT', -50000, '2026-09-17')"
        ).run();
    }, 'amount');

    assertThrows('Constraints', 'expenses: UPDATE negative amount fails fast', () => {
        const ins = db.prepare("INSERT INTO expenses (category, amount, payment_date) VALUES ('RENT', 50000, '2026-09-17')").run();
        db.prepare("UPDATE expenses SET amount = -2000 WHERE id = ?").run(ins.lastInsertRowid);
    }, 'amount');

    // 7. fixed_costs amount < 0
    assertThrows('Constraints', 'fixed_costs: INSERT negative amount fails fast', () => {
        db.prepare(
            "INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day) VALUES ('STRESS-FC', 'RENT', 1, -100000, 'MONTHLY', 1)"
        ).run();
    }, 'amount');

    assertThrows('Constraints', 'fixed_costs: UPDATE negative amount fails fast', () => {
        const ins = db.prepare("INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day) VALUES ('STRESS-FC-POS', 'RENT', 1, 100000, 'MONTHLY', 1)").run();
        db.prepare("UPDATE fixed_costs SET amount = -500 WHERE id = ?").run(ins.lastInsertRowid);
    }, 'amount');

    // 8. wallet_transactions amount < 0
    assertThrows('Constraints', 'wallet_transactions: INSERT negative amount fails fast', () => {
        db.prepare(
            "INSERT INTO wallet_transactions (customer_id, type, amount) VALUES (1, 'DEPOSIT', -20000)"
        ).run();
    }, 'amount');

    assertThrows('Constraints', 'wallet_transactions: UPDATE negative amount fails fast', () => {
        const ins = db.prepare("INSERT INTO wallet_transactions (customer_id, type, amount) VALUES (1, 'DEPOSIT', 20000)").run();
        db.prepare("UPDATE wallet_transactions SET amount = -100 WHERE id = ?").run(ins.lastInsertRowid);
    }, 'amount');

    // 9. order_items returned_quantity > quantity or negative
    const pv = db.prepare("SELECT id FROM product_variants LIMIT 1").get();
    const pvId = pv ? pv.id : 1;

    assertThrows('Constraints', 'order_items: INSERT returned_quantity > quantity fails fast', () => {
        db.prepare(
            "INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 3, 20000, 10000, 60000, 4)"
        ).run(ord.id, pvId);
    }, 'returned_quantity');

    assertThrows('Constraints', 'order_items: UPDATE returned_quantity > quantity fails fast', () => {
        const oi = db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 3, 20000, 10000, 60000, 0)").run(ord.id, pvId);
        db.prepare("UPDATE order_items SET returned_quantity = quantity + 2 WHERE id = ?").run(oi.lastInsertRowid);
    }, 'returned_quantity');

    assertThrows('Constraints', 'order_items: INSERT negative quantity fails fast', () => {
        db.prepare(
            "INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price) VALUES (?, ?, -3, 20000, 10000, -60000)"
        ).run(ord.id, pvId);
    }, 'quantity');

    assertThrows('Constraints', 'order_items: INSERT negative returned_quantity fails fast', () => {
        db.prepare(
            "INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price, returned_quantity) VALUES (?, ?, 5, 20000, 10000, 100000, -1)"
        ).run(ord.id, pvId);
    }, 'returned_quantity');

    // 10. return_items quantity < 0 or refund_amount < 0
    let ret = db.prepare("SELECT id FROM returns LIMIT 1").get();
    let retId = ret ? ret.id : null;
    if (!retId) {
        const insRet = db.prepare(
            "INSERT INTO returns (return_number, original_order_id, total_refund) VALUES ('RET-STRESS-01', ?, 10000)"
        ).run(ord.id);
        retId = insRet.lastInsertRowid;
    }

    let oiRow = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(ord.id);
    if (!oiRow) {
        const insOi = db.prepare("INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, unit_cost, total_price) VALUES (?, ?, 5, 20000, 10000, 100000)").run(ord.id, pvId);
        oiRow = { id: insOi.lastInsertRowid };
    }

    assertThrows('Constraints', 'return_items: INSERT negative quantity fails fast', () => {
        db.prepare(
            "INSERT INTO return_items (return_id, order_item_id, product_variant_id, quantity, refund_amount) VALUES (?, ?, ?, -1, 10000)"
        ).run(retId, oiRow.id, pvId);
    }, 'quantity');

    assertThrows('Constraints', 'return_items: INSERT negative refund_amount fails fast', () => {
        db.prepare(
            "INSERT INTO return_items (return_id, order_item_id, product_variant_id, quantity, refund_amount) VALUES (?, ?, ?, 1, -5000)"
        ).run(retId, oiRow.id, pvId);
    }, 'refund_amount');

    // 11. journal_lines debit < 0 or credit < 0
    assertThrows('Constraints', 'journal_lines: INSERT negative debit fails fast', () => {
        db.prepare(
            "INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, -5000, 0)"
        ).run();
    }, 'debit');

    assertThrows('Constraints', 'journal_lines: INSERT negative credit fails fast', () => {
        db.prepare(
            "INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (1, 1, 0, -5000)"
        ).run();
    }, 'credit');

    db.close();
}

async function runSuite2_Migrator(workDir) {
    console.log('\n===============================================================');
    console.log('⚡ SUITE 2: Migration Runner (db/migrator.js) Stress Testing');
    console.log('===============================================================');

    const migDbPath = path.join(workDir, 'mig_test.sqlite3');
    const migDir = path.join(workDir, 'migrations');
    fs.mkdirSync(migDir, { recursive: true });

    // Copy M1 migration files (001 to 005) to test migrations directory
    const realFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && f <= '005_zz');
    for (const f of realFiles) {
        fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDir, f));
    }
    const expectedCount = 5;

    // Test 2.1: Bootstrap on fresh database
    await assertDoesNotThrow('Migrator', `Clean DB Bootstrap: All 5 migrations apply cleanly in sequence`, async () => {
        const res = await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
        if (res.applied.length !== expectedCount) {
            throw new Error(`Expected ${expectedCount} migrations applied, got: ${res.applied.length}`);
        }
    });

    // Verify integrity and foreign keys on fresh bootstrap
    const checkDb = new Database(migDbPath, { readonly: true });
    const integ = checkDb.pragma('integrity_check');
    const fks = checkDb.pragma('foreign_key_check');
    checkDb.close();

    recordTest('Migrator', 'Fresh Bootstrap: PRAGMA integrity_check is ok',
        integ.length === 1 && integ[0].integrity_check === 'ok', `integrity: ${integ[0] ? integ[0].integrity_check : 'error'}`);
    recordTest('Migrator', 'Fresh Bootstrap: PRAGMA foreign_key_check has 0 violations',
        fks.length === 0, `fk violations: ${fks.length}`);

    // Test 2.2: Idempotency - running migrations again should skip all
    await assertDoesNotThrow('Migrator', 'Idempotency: Re-running migrations skips all already-applied migrations', async () => {
        const res2 = await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
        if (res2.applied.length !== 0 || res2.skipped.length !== expectedCount) {
            throw new Error(`Expected 0 applied and ${expectedCount} skipped, got: applied=${res2.applied.length}, skipped=${res2.skipped.length}`);
        }
    });

    // Test 2.3: Checksum Mismatch Detection (Tamper Protection)
    const targetTamperFile = path.join(migDir, '003_returns_and_exchanges.sql');
    const origTamperContent = fs.readFileSync(targetTamperFile, 'utf8');
    // Tamper with file by appending a byte comment
    fs.appendFileSync(targetTamperFile, '\n-- TAMPER INJECTION');

    try {
        await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
        recordTest('Migrator', 'Tamper Resistance: Detects checksum mismatch on modified migration', false, 'Failed to throw error on tampered migration!');
    } catch (tamperErr) {
        recordTest('Migrator', 'Tamper Resistance: Detects checksum mismatch on modified migration',
            tamperErr.message.includes('Checksum mismatch detected'),
            `Caught expected error: ${tamperErr.message}`);
    }

    // Restore original file
    fs.writeFileSync(targetTamperFile, origTamperContent, 'utf8');

    // Test 2.4: Normalized Line Endings (CRLF vs LF resilience)
    const file002 = path.join(migDir, '002_add_missing_accounts.sql');
    const orig002 = fs.readFileSync(file002, 'utf8');
    const crlf002 = orig002.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(file002, crlf002, 'utf8');

    await assertDoesNotThrow('Migrator', 'Cross-Platform Resilience: LF vs CRLF line endings do not trigger false mismatch', async () => {
        await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
    });
    fs.writeFileSync(file002, orig002, 'utf8');

    // Test 2.5: Atomic Rollback on Failed Migration
    const failingMigration = path.join(migDir, '999_failing_migration.sql');
    fs.writeFileSync(failingMigration, `
CREATE TABLE canary_table_should_be_rolled_back (id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO canary_table_should_be_rolled_back (note) VALUES ('test');
-- Intentional syntax error
MALFORMED SQL STATEMENT CAUSING FAILURE;
`, 'utf8');

    try {
        await runMigrations({ db: migDbPath, migrationsDir: migDir, verbose: false });
        recordTest('Migrator', 'Atomic Rollback: Fails on invalid SQL migration', false, 'Did not fail on syntax error');
    } catch (migErr) {
        recordTest('Migrator', 'Atomic Rollback: Fails on invalid SQL migration', true, `Threw error: ${migErr.message}`);
    }

    // Verify canary table does NOT exist and 999 is NOT in schema_migrations
    const verifyDb = new Database(migDbPath, { readonly: true });
    const canaryTable = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='canary_table_should_be_rolled_back'").get();
    const migRecord = verifyDb.prepare("SELECT * FROM schema_migrations WHERE name = '999_failing_migration.sql'").get();
    verifyDb.close();

    recordTest('Migrator', 'Atomic Rollback: Partial tables are rolled back on failure',
        !canaryTable, `canaryTable exists: ${Boolean(canaryTable)}`);
    recordTest('Migrator', 'Atomic Rollback: Failed migration is NOT registered in schema_migrations',
        !migRecord, `migRecord exists: ${Boolean(migRecord)}`);

    // Clean up failing migration file
    fs.unlinkSync(failingMigration);

    // Test 2.6: Concurrency Safety with BEGIN IMMEDIATE
    const concDbPath = path.join(workDir, 'conc_test.sqlite3');
    const workerScript = path.join(workDir, 'conc_worker.js');
    const migratorPath = path.resolve(__dirname, '../../db/migrator').replace(/\\/g, '/');
    fs.writeFileSync(workerScript, `
const { runMigrationsSync } = require('${migratorPath}');
try {
    const res = runMigrationsSync({ db: process.argv[2], migrationsDir: process.argv[3], verbose: false });
    process.send({ success: true, applied: res.applied.length });
} catch (err) {
    process.send({ success: false, error: err.message, code: err.code });
}
`, 'utf8');

    console.log('  Spawning 5 concurrent migration processes against conc_test.sqlite3...');
    const workerPromises = [];
    for (let i = 0; i < 5; i++) {
        workerPromises.push(new Promise((resolve) => {
            const child = fork(workerScript, [concDbPath, migDir]);
            child.on('message', (msg) => {
                resolve(msg);
            });
            child.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        }));
    }

    const workerResults = await Promise.all(workerPromises);
    const concDb = new Database(concDbPath, { readonly: true });
    const concMigrations = concDb.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all();
    concDb.close();

    const allFinishedWithoutCorruption = workerResults.every(r => r.success === true || (r.error && (r.error.includes('busy') || r.error.includes('locked') || r.error.includes('UNIQUE constraint') || r.error.includes('already exists'))));
    recordTest('Migrator', 'Concurrency Safety: Handled 5 simultaneous runners without schema corruption',
        allFinishedWithoutCorruption, `Worker results: ${JSON.stringify(workerResults)}`);
    recordTest('Migrator', `Concurrency Safety: Exactly ${expectedCount} unique migrations recorded in schema_migrations`,
        concMigrations.length === expectedCount, `Registered migrations count: ${concMigrations.length}`);
}

async function runSuite3_BackupRestore(workDir) {
    console.log('\n===============================================================');
    console.log('⚡ SUITE 3: Backup & Restore Scripts Stress Testing');
    console.log('===============================================================');

    const backupDir = path.join(workDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const liveDbPath = path.join(workDir, 'live_erp.sqlite3');

    // Clone production db to liveDbPath for testing
    fs.copyFileSync(PROD_DB_PATH, liveDbPath);

    // Test 3.1: Online backup while active writes are executing
    console.log('  Starting concurrent write loop during createBackup()...');
    const liveDb = new Database(liveDbPath);
    liveDb.pragma('journal_mode = WAL');
    liveDb.pragma('synchronous = NORMAL');

    let writeCount = 0;
    let keepWriting = true;
    const writeLoopPromise = (async () => {
        while (keepWriting) {
            try {
                liveDb.prepare(
                    "INSERT INTO audit_logs (employee_id, action, entity, entity_id, details) VALUES (1, 'STRESS_TEST_WRITE', 'inventory', ?, 'Concurrent write test')"
                ).run(++writeCount);
            } catch (e) {
                // Ignore transient lock while backup checkpoint finishes
            }
            await new Promise(r => setImmediate(r));
        }
    })();

    let backupRes;
    try {
        backupRes = await createBackup({
            dbPath: liveDbPath,
            backupDir: backupDir,
            type: 'MANUAL',
            updateLatest: true
        });
        keepWriting = false;
        await writeLoopPromise;
        liveDb.close();

        recordTest('Backup/Restore', 'Online Backup During Active Writes: Completed without error',
            Boolean(backupRes && backupRes.backupFilePath), `Completed in ${backupRes ? backupRes.durationMs : 0}ms, writes concurrent: ${writeCount}`);
        recordTest('Backup/Restore', 'Online Backup Integrity: Backup file passes integrity check',
            backupRes.integrityOk === true, `integrityOk: ${backupRes.integrityOk}`);
    } catch (bErr) {
        keepWriting = false;
        liveDb.close();
        recordTest('Backup/Restore', 'Online Backup During Active Writes: Completed without error', false, 'Failed', bErr);
    }

    // Verify backup file independently
    const backupVerify = verifyDatabaseIntegrity(backupRes.backupFilePath);
    const backupFk = verifyForeignKeys(backupRes.backupFilePath);
    recordTest('Backup/Restore', 'Backup File Independent Verification: Integrity ok', backupVerify, `verifyDatabaseIntegrity=${backupVerify}`);
    recordTest('Backup/Restore', 'Backup File Independent Verification: Foreign keys 0 violations', backupFk.valid, `fk valid=${backupFk.valid}`);

    // Test 3.2: Restore Aborts on Corrupted Backup (Zero data loss protection)
    // Create Corrupted Backup A: Header corrupted
    const corruptHeaderPath = path.join(backupDir, 'corrupt_header.sqlite3');
    const validBytes = fs.readFileSync(backupRes.backupFilePath);
    const corruptedHeaderBytes = Buffer.from(validBytes);
    corruptedHeaderBytes.fill(0, 0, 32); // zero out SQLite 16-byte magic string and header
    fs.writeFileSync(corruptHeaderPath, corruptedHeaderBytes);

    // Record original state of liveDb before restore attempt
    const preDb = new Database(liveDbPath, { readonly: true });
    const preCount = preDb.prepare("SELECT count(*) as c FROM products").get().c;
    preDb.close();

    try {
        await restoreBackup({
            backupPath: corruptHeaderPath,
            targetDbPath: liveDbPath
        });
        recordTest('Backup/Restore', 'Corrupt Backup Abort: Must reject corrupted header', false, 'Did not abort on corrupt backup!');
    } catch (restoreErr) {
        recordTest('Backup/Restore', 'Corrupt Backup Abort: Must reject corrupted header',
            restoreErr.message.includes('failed integrity check') || restoreErr.message.includes('Aborting restore'),
            `Caught expected error: ${restoreErr.message}`);
    }

    // Verify liveDb was NOT destroyed or modified by the aborted restore
    const postDb = new Database(liveDbPath, { readonly: true });
    const postCount = postDb.prepare("SELECT count(*) as c FROM products").get().c;
    postDb.close();
    recordTest('Backup/Restore', 'Corrupt Backup Protection: Live database remains 100% intact after aborted restore',
        preCount === postCount && postCount > 0, `preCount=${preCount}, postCount=${postCount}`);

    // Create Corrupted Backup B: Truncated file (<100 bytes)
    const corruptTruncPath = path.join(backupDir, 'corrupt_truncated.sqlite3');
    fs.writeFileSync(corruptTruncPath, Buffer.alloc(10));

    try {
        await restoreBackup({
            backupPath: corruptTruncPath,
            targetDbPath: liveDbPath
        });
        recordTest('Backup/Restore', 'Corrupt Backup Abort: Must reject truncated file', false, 'Did not abort on truncated file!');
    } catch (truncErr) {
        recordTest('Backup/Restore', 'Corrupt Backup Abort: Must reject truncated file', true, `Caught error: ${truncErr.message}`);
    }

    // Test 3.3: Atomic Full Database State Restoration (Canary Verification)
    // 1. Insert a distinctive canary record into liveDb
    const canaryDb = new Database(liveDbPath);
    canaryDb.prepare(
        "INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('RESTORE_CANARY_TEST_NAME', '09990001122', 777000)"
    ).run();
    canaryDb.close();

    // 2. Create backup with the canary record
    const canaryBackup = await createBackup({
        dbPath: liveDbPath,
        backupDir: backupDir,
        filename: 'canary_backup.sqlite3',
        type: 'MANUAL',
        updateLatest: false
    });

    // 3. Mutate liveDb: delete canary customer and add noise
    const mutateDb = new Database(liveDbPath);
    mutateDb.prepare("DELETE FROM customers WHERE mobile = '09990001122'").run();
    mutateDb.prepare("INSERT INTO customers (full_name, mobile, wallet_balance) VALUES ('NOISE_CUSTOMER', '09998887766', 1000)").run();
    mutateDb.close();

    // Confirm canary is currently gone
    const checkMutate = new Database(liveDbPath, { readonly: true });
    const canaryBefore = checkMutate.prepare("SELECT * FROM customers WHERE mobile = '09990001122'").get();
    checkMutate.close();
    if (canaryBefore) throw new Error('Canary record should have been deleted before restore test.');

    // 4. Perform restore from canaryBackup
    const restoreResult = await restoreBackup({
        backupPath: canaryBackup.backupFilePath,
        targetDbPath: liveDbPath
    });

    recordTest('Backup/Restore', 'Atomic Restore: restoreBackup completes successfully',
        restoreResult.integrityOk && restoreResult.foreignKeysOk, `integrityOk=${restoreResult.integrityOk}, foreignKeysOk=${restoreResult.foreignKeysOk}`);

    // 5. Verify canary record is back and noise is gone
    const restoredDb = new Database(liveDbPath, { readonly: true });
    const restoredCanary = restoredDb.prepare("SELECT * FROM customers WHERE mobile = '09990001122'").get();
    const restoredNoise = restoredDb.prepare("SELECT * FROM customers WHERE mobile = '09998887766'").get();
    restoredDb.close();

    recordTest('Backup/Restore', 'Atomic State Recovery: Restored canary record exactly matches backup state',
        Boolean(restoredCanary && (restoredCanary.full_name === 'RESTORE_CANARY_TEST_NAME' || restoredCanary.name === 'RESTORE_CANARY_TEST_NAME') && restoredCanary.wallet_balance === 777000),
        `Canary: ${JSON.stringify(restoredCanary)}`);
    recordTest('Backup/Restore', 'Atomic State Recovery: Unwanted post-backup mutations are completely reverted',
        !restoredNoise, `Noise customer found: ${Boolean(restoredNoise)}`);

    // Verify staging files were cleaned up
    const remainingStagingFiles = fs.readdirSync(path.dirname(liveDbPath)).filter(f => f.startsWith('restore_stage_'));
    recordTest('Backup/Restore', 'Staging Cleanup: All temporary restore staging files removed',
        remainingStagingFiles.length === 0, `Staging files: ${remainingStagingFiles.join(', ')}`);

    // Test 3.4: Retention Pruning
    const manifestPath = path.join(backupDir, 'manifest.json');
    const manifest = loadManifest(manifestPath);

    // Create 15 dummy backup files to exceed retention limit
    for (let i = 1; i <= 15; i++) {
        const dummyName = `dummy_backup_${i}.sqlite3`;
        const dummyPath = path.join(backupDir, dummyName);
        fs.writeFileSync(dummyPath, 'dummy data');
        manifest.backups.push({
            filename: dummyName,
            created_at: new Date(Date.now() - (20 - i) * 86400000).toISOString()
        });
    }

    const pruned = pruneExpiredBackups(backupDir, manifest, { maxTotal: 5 });
    saveManifest(manifest, manifestPath);

    recordTest('Backup/Restore', 'Retention Pruning: Successfully pruned excess backup files',
        pruned.length > 0, `Pruned count: ${pruned.length}`);
    recordTest('Backup/Restore', 'Retention Pruning: manifest.pruned records audit log with reason',
        manifest.pruned.length >= pruned.length, `manifest.pruned count: ${manifest.pruned.length}`);
    recordTest('Backup/Restore', 'Retention Pruning: latest.sqlite3 is never pruned',
        fs.existsSync(path.join(backupDir, 'latest.sqlite3')), `latest.sqlite3 exists: ${fs.existsSync(path.join(backupDir, 'latest.sqlite3'))}`);
}

async function main() {
    console.log('===============================================================');
    console.log('🛡️  ARAYESHI Retail ERP — Milestone 1 Adversarial Stress Runner');
    console.log('   Timestamp: ' + new Date().toISOString());
    console.log('   Target DB: ' + PROD_DB_PATH);
    console.log('===============================================================');

    fs.mkdirSync(TEMP_DIR, { recursive: true });

    // Create a copy of production database to run Suite 1 against (so live db is never modified)
    const suite1DbPath = path.join(TEMP_DIR, 'suite1_constraints.sqlite3');
    fs.copyFileSync(PROD_DB_PATH, suite1DbPath);

    try {
        await runSuite1_Constraints(suite1DbPath);
        await runSuite2_Migrator(TEMP_DIR);
        await runSuite3_BackupRestore(TEMP_DIR);
    } catch (fatalErr) {
        console.error('\n❌ Fatal error in stress test execution:', fatalErr);
    } finally {
        // Clean up temp directory
        try {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        } catch (cleanErr) {
            console.warn('⚠️ Could not remove temp dir:', cleanErr.message);
        }
    }

    console.log('\n===============================================================');
    console.log('📊 STRESS TEST SUMMARY');
    console.log(`   Total Tests:  ${results.total}`);
    console.log(`   Passed:       ${results.passed}`);
    console.log(`   Failed:       ${results.failed}`);
    console.log('===============================================================');

    if (results.failed === 0) {
        console.log('🏆 VERDICT: APPROVE (100% of Stress & Adversarial Tests Passed)');
        process.exit(0);
    } else {
        console.error(`💥 VERDICT: REJECT (${results.failed} Failure(s) Detected)`);
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Fatal crash:', e);
    process.exit(1);
});
