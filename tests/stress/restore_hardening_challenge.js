/**
 * tests/stress/restore_hardening_challenge.js
 * EMPIRICAL CHALLENGE HARNESS: Restore Hardening & Malicious File Rejection
 *
 * Verifies that scripts/restore.js strictly and safely rejects:
 *  1. 0-byte file
 *  2. 50-byte random garbage file
 *  3. Non-sqlite file (>100 bytes, JSON/text payload)
 *  4. Corrupted SQLite header (tampered magic bytes)
 *
 * And confirms that target database is never modified or corrupted when restore fails.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { restoreBackup, verifyDatabaseIntegrity } = require('../../scripts/restore');

const SANDBOX = path.join(__dirname, 'sandbox_restore_challenge');
const TARGET_DB = path.join(SANDBOX, 'target_live.sqlite3');

const results = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
};

function assert(condition, testName) {
    results.total++;
    if (!condition) {
        results.failed++;
        results.failures.push(testName);
        console.error(`  ❌ FAIL: ${testName}`);
        throw new Error(`Assertion failed: ${testName}`);
    } else {
        results.passed++;
        console.log(`  ✅ PASS: ${testName}`);
    }
}

async function expectRejection(fn, expectedSubstr, testName) {
    results.total++;
    let threw = false;
    let actualMsg = '';
    try {
        await fn();
    } catch (err) {
        threw = true;
        actualMsg = err.message;
    }

    if (!threw) {
        results.failed++;
        const msg = `${testName} — Expected rejection, but restore succeeded without error!`;
        results.failures.push(msg);
        console.error(`  ❌ FAIL: ${msg}`);
        throw new Error(msg);
    } else if (expectedSubstr && !actualMsg.toLowerCase().includes(expectedSubstr.toLowerCase())) {
        results.failed++;
        const msg = `${testName} — Expected error to contain "${expectedSubstr}", got "${actualMsg}"`;
        results.failures.push(msg);
        console.error(`  ❌ FAIL: ${msg}`);
        throw new Error(msg);
    } else {
        results.passed++;
        console.log(`  ✅ PASS: ${testName} (Strictly rejected with: "${actualMsg.slice(0, 70)}...")`);
    }
}

function initSandbox() {
    if (fs.existsSync(SANDBOX)) {
        fs.rmSync(SANDBOX, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX, { recursive: true });

    // Create target database with sentinel record to verify zero overwrite
    const db = new Database(TARGET_DB);
    db.exec(`
        CREATE TABLE sentinel_table (id INTEGER PRIMARY KEY, canary TEXT NOT NULL);
        INSERT INTO sentinel_table (id, canary) VALUES (1, 'LIVE_DATABASE_UNTOUCHED_CANARY_VALUE_XYZ');
    `);
    db.close();
}

function verifyCanaryIntact() {
    const db = new Database(TARGET_DB, { readonly: true });
    try {
        const row = db.prepare('SELECT canary FROM sentinel_table WHERE id = 1').get();
        return row && row.canary === 'LIVE_DATABASE_UNTOUCHED_CANARY_VALUE_XYZ';
    } finally {
        db.close();
    }
}

function cleanupSandbox() {
    try {
        if (fs.existsSync(SANDBOX)) {
            fs.rmSync(SANDBOX, { recursive: true, force: true });
        }
    } catch (_) {}
}

async function runRestoreHardeningChallenge() {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║   ARAYESHI ERP — RESTORE HARDENING EMPIRICAL CHALLENGE HARNESS    ║');
    console.log('║   Verifying strict rejection of malicious & invalid backup files  ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    initSandbox();

    try {
        // =====================================================================
        // CHALLENGE 1: 0-byte file
        // =====================================================================
        console.log('--- Challenge 1: 0-Byte Backup File ---');
        const zeroByteFile = path.join(SANDBOX, 'zero_byte.sqlite3');
        fs.writeFileSync(zeroByteFile, Buffer.alloc(0));

        assert(fs.statSync(zeroByteFile).size === 0, 'File created with exactly 0 bytes');
        assert(verifyDatabaseIntegrity(zeroByteFile) === false, 'verifyDatabaseIntegrity returns false for 0-byte file');

        await expectRejection(async () => {
            await restoreBackup({
                backupPath: zeroByteFile,
                targetDbPath: TARGET_DB,
                skipSafetyBackup: true
            });
        }, 'integrity check', 'restoreBackup strictly rejects 0-byte file and aborts');

        assert(verifyCanaryIntact(), 'Live target database was protected and untouched after 0-byte restore attempt');

        // =====================================================================
        // CHALLENGE 2: 50-byte random garbage file
        // =====================================================================
        console.log('\n--- Challenge 2: 50-Byte Random Garbage File ---');
        const garbage50File = path.join(SANDBOX, 'garbage_50.sqlite3');
        const garbage50Bytes = crypto.randomBytes(50);
        fs.writeFileSync(garbage50File, garbage50Bytes);

        assert(fs.statSync(garbage50File).size === 50, 'File created with exactly 50 bytes of random garbage');
        assert(verifyDatabaseIntegrity(garbage50File) === false, 'verifyDatabaseIntegrity returns false for 50-byte garbage');

        await expectRejection(async () => {
            await restoreBackup({
                backupPath: garbage50File,
                targetDbPath: TARGET_DB,
                skipSafetyBackup: true
            });
        }, 'integrity check', 'restoreBackup strictly rejects 50-byte garbage file and aborts');

        assert(verifyCanaryIntact(), 'Live target database was protected and untouched after 50-byte garbage restore attempt');

        // =====================================================================
        // CHALLENGE 3: Non-sqlite file (>100 bytes)
        // =====================================================================
        console.log('\n--- Challenge 3: Non-SQLite File (>100 Bytes JSON/Text) ---');
        const nonSqliteFile = path.join(SANDBOX, 'non_sqlite.sqlite3');
        const nonSqliteContent = JSON.stringify({
            attacker_payload: 'MALICIOUS_NON_SQLITE_PAYLOAD',
            message: 'This is a valid UTF-8 JSON document that exceeds 100 bytes to bypass naive size checks.',
            padding: crypto.randomBytes(512).toString('hex')
        }, null, 2);
        fs.writeFileSync(nonSqliteFile, Buffer.from(nonSqliteContent, 'utf8'));

        const nonSqliteSize = fs.statSync(nonSqliteFile).size;
        assert(nonSqliteSize > 500, `Non-sqlite file is ${nonSqliteSize} bytes (>100 bytes)`);
        assert(verifyDatabaseIntegrity(nonSqliteFile) === false, 'verifyDatabaseIntegrity returns false for valid JSON non-sqlite file');

        await expectRejection(async () => {
            await restoreBackup({
                backupPath: nonSqliteFile,
                targetDbPath: TARGET_DB,
                skipSafetyBackup: true
            });
        }, 'integrity check', 'restoreBackup strictly rejects >100 byte non-sqlite file and aborts');

        assert(verifyCanaryIntact(), 'Live target database was protected and untouched after non-sqlite restore attempt');

        // =====================================================================
        // CHALLENGE 4: Corrupted SQLite header
        // =====================================================================
        console.log('\n--- Challenge 4: Corrupted SQLite Header ---');
        const validDbForCorruption = path.join(SANDBOX, 'source_to_corrupt.sqlite3');
        const sDb = new Database(validDbForCorruption);
        sDb.exec(`CREATE TABLE dummy (id INT); INSERT INTO dummy VALUES (42);`);
        sDb.close();

        // Read real SQLite bytes and corrupt the magic 16-byte header
        const realBytes = fs.readFileSync(validDbForCorruption);
        assert(realBytes.subarray(0, 15).toString() === 'SQLite format 3', 'Original source has valid SQLite magic header');

        const corruptedHeaderFile = path.join(SANDBOX, 'corrupted_header.sqlite3');
        const corruptedBytes = Buffer.from(realBytes);
        // Overwrite header with corrupted garbage
        Buffer.from('CORRUPTED_HEADER_DATA_FAIL!').copy(corruptedBytes, 0);
        fs.writeFileSync(corruptedHeaderFile, corruptedBytes);

        assert(verifyDatabaseIntegrity(corruptedHeaderFile) === false, 'verifyDatabaseIntegrity returns false for corrupted SQLite header');

        await expectRejection(async () => {
            await restoreBackup({
                backupPath: corruptedHeaderFile,
                targetDbPath: TARGET_DB,
                skipSafetyBackup: true
            });
        }, 'integrity check', 'restoreBackup strictly rejects corrupted header file and aborts');

        assert(verifyCanaryIntact(), 'Live target database was protected and untouched after corrupted header restore attempt');

        // =====================================================================
        // CONTROL: Valid Restore Succeeds
        // =====================================================================
        console.log('\n--- Control Verification: Valid SQLite Restore Works ---');
        const validRestoreSource = path.join(SANDBOX, 'valid_source.sqlite3');
        const vDb = new Database(validRestoreSource);
        vDb.exec(`
            CREATE TABLE restored_table (id INTEGER PRIMARY KEY, val TEXT);
            INSERT INTO restored_table (id, val) VALUES (1, 'RESTORED_PAYLOAD_VALID');
        `);
        vDb.close();

        assert(verifyDatabaseIntegrity(validRestoreSource) === true, 'Valid backup passes integrity check');

        const restoreResult = await restoreBackup({
            backupPath: validRestoreSource,
            targetDbPath: TARGET_DB,
            skipSafetyBackup: true
        });

        assert(restoreResult.integrityOk === true, 'restoreBackup succeeds with valid backup');
        const checkRestoredDb = new Database(TARGET_DB, { readonly: true });
        const restoredRow = checkRestoredDb.prepare('SELECT val FROM restored_table WHERE id = 1').get();
        checkRestoredDb.close();
        assert(restoredRow && restoredRow.val === 'RESTORED_PAYLOAD_VALID', 'Restored database contains valid data');

    } finally {
        cleanupSandbox();
    }

    console.log('\n===================================================================');
    console.log('📊 RESTORE HARDENING CHALLENGE SUMMARY');
    console.log('===================================================================');
    console.log(`Total Checks Executed: ${results.total}`);
    console.log(`Passed:                ${results.passed}`);
    console.log(`Failed:                ${results.failed}`);

    if (results.failed > 0) {
        console.error('\n❌ RESTORE HARDENING CHALLENGE FAILED');
        process.exit(1);
    } else {
        console.log('\n🎯 RESTORE HARDENING CHALLENGE: 100% PASSED (VERDICT: APPROVE)');
        process.exit(0);
    }
}

if (require.main === module) {
    runRestoreHardeningChallenge().catch(err => {
        console.error('Unhandled fatal error in challenge harness:', err);
        process.exit(1);
    });
}

module.exports = { runRestoreHardeningChallenge };
