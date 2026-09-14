/**
 * scripts/backup.js
 * Online non-destructive SQLite database backup using better-sqlite3 native online backup API.
 * Stores timestamped copies in backups/ and verifies integrity using PRAGMA integrity_check.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'db', 'arayeshi_erp.sqlite3');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function formatTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

/**
 * Creates an online consistent backup of the SQLite database.
 * @param {Object} options
 * @param {string} [options.dbPath] - Path to source SQLite database
 * @param {string} [options.backupDir] - Destination backup directory
 * @param {string} [options.filename] - Specific backup filename
 * @param {boolean} [options.updateLatest=true] - Whether to create/update latest.sqlite3
 * @returns {Promise<{backupFilePath: string, latestFilePath: string|null, size: number, durationMs: number, integrityOk: boolean}>}
 */
async function createBackup(options = {}) {
    const dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
    const backupDir = path.resolve(options.backupDir || BACKUPS_DIR);

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Source database not found at: ${dbPath}`);
    }

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = formatTimestamp();
    const backupFilename = options.filename || `arayeshi_erp_${timestamp}.sqlite3`;
    const backupFilePath = path.join(backupDir, backupFilename);
    const latestFilePath = path.join(backupDir, 'latest.sqlite3');

    console.log(`📦 [Backup] Starting online backup...`);
    console.log(`   Source:      ${dbPath}`);
    console.log(`   Destination: ${backupFilePath}`);

    const startTime = Date.now();
    const sourceDb = new Database(dbPath, { readonly: true });

    try {
        await sourceDb.backup(backupFilePath);
    } catch (backupErr) {
        // Clean up partial file on failure
        if (fs.existsSync(backupFilePath)) {
            try { fs.unlinkSync(backupFilePath); } catch (_) {}
        }
        throw new Error(`Native SQLite backup failed: ${backupErr.message}`);
    } finally {
        sourceDb.close();
    }

    // Verify backup integrity
    console.log(`🔍 [Backup] Verifying integrity of backup file: ${backupFilePath}`);
    const backupDb = new Database(backupFilePath, { readonly: true });
    let integrityOk = false;
    try {
        const result = backupDb.pragma('integrity_check');
        if (result && result.length === 1 && result[0].integrity_check === 'ok') {
            integrityOk = true;
        } else {
            throw new Error(`Integrity check failed: ${JSON.stringify(result)}`);
        }

        const fkResult = backupDb.pragma('foreign_key_check');
        if (fkResult && fkResult.length > 0) {
            console.warn(`⚠️  [Backup] Note: ${fkResult.length} foreign key check results in backup.`);
        }
    } finally {
        backupDb.close();
    }

    // Copy to latest.sqlite3 if enabled
    const shouldUpdateLatest = options.updateLatest !== false;
    if (shouldUpdateLatest) {
        fs.copyFileSync(backupFilePath, latestFilePath);
    }

    const stats = fs.statSync(backupFilePath);
    const durationMs = Date.now() - startTime;

    console.log(`✅ [Backup] Completed successfully in ${durationMs}ms:`);
    console.log(`   Backup File: ${backupFilePath}`);
    console.log(`   Size:        ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
    console.log(`   Integrity:   ${integrityOk ? 'PASSED (ok)' : 'FAILED'}`);
    if (shouldUpdateLatest) {
        console.log(`   Latest Link: ${latestFilePath}`);
    }

    return {
        backupFilePath,
        latestFilePath: shouldUpdateLatest ? latestFilePath : null,
        size: stats.size,
        durationMs,
        integrityOk
    };
}

if (require.main === module) {
    const customArg = process.argv[2];
    let opts = {};
    if (customArg) {
        const resolved = path.resolve(customArg);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            opts.backupDir = resolved;
        } else {
            opts.backupDir = path.dirname(resolved);
            opts.filename = path.basename(resolved);
        }
    }

    createBackup(opts)
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error(`❌ [Backup] Fatal error:`, err.message);
            process.exit(1);
        });
}

module.exports = {
    createBackup,
    formatTimestamp,
    BACKUPS_DIR,
    DEFAULT_DB_PATH
};
