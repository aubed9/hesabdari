/**
 * scripts/restore.js
 * Safe database restoration script with pre-restore safety copy, atomic replacement, and verification.
 * Features:
 *  1. Pre-flight integrity verification of source backup file.
 *  2. Automated safety backup of active database before restore.
 *  3. Staged atomic file replacement with strict cleanup of temporary WAL/SHM artifacts.
 *  4. Post-restore PRAGMA integrity_check and PRAGMA foreign_key_check verification.
 *  5. Manifest logging into backups/manifest.json.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { createBackup, loadManifest, saveManifest, formatTimestamp, BACKUPS_DIR, DEFAULT_DB_PATH } = require('./backup');

/**
 * Finds the latest valid backup file in the backups directory.
 * Prioritizes latest.sqlite3 if valid, else newest arayeshi_erp_*.sqlite3.
 * @param {string} backupDir
 * @returns {string|null}
 */
function findLatestBackup(backupDir = BACKUPS_DIR) {
    if (!fs.existsSync(backupDir)) {
        return null;
    }

    const latestLink = path.join(backupDir, 'latest.sqlite3');
    if (fs.existsSync(latestLink) && verifyDatabaseIntegrity(latestLink)) {
        return latestLink;
    }

    const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.sqlite3') && !f.startsWith('pre_restore_') && f !== 'latest.sqlite3')
        .map(f => ({
            name: f,
            fullPath: path.join(backupDir, f),
            mtime: fs.statSync(path.join(backupDir, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

    for (const file of files) {
        if (verifyDatabaseIntegrity(file.fullPath)) {
            return file.fullPath;
        }
    }

    return null;
}

/**
 * Verifies integrity of a SQLite database file using PRAGMA integrity_check.
 * @param {string} filePath
 * @returns {boolean}
 */
function verifyDatabaseIntegrity(filePath) {
    if (!fs.existsSync(filePath)) return false;
    try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile() || stats.size < 100) return false;
    } catch (_) {
        return false;
    }
    let db;
    try {
        db = new Database(filePath, { readonly: true, timeout: 5000 });
        const result = db.pragma('integrity_check');
        return Boolean(result && result.length === 1 && result[0].integrity_check === 'ok');
    } catch (err) {
        return false;
    } finally {
        if (db) db.close();
    }
}

/**
 * Verifies foreign keys of a SQLite database file using PRAGMA foreign_key_check.
 * @param {string} filePath
 * @returns {{valid: boolean, violations: Array}}
 */
function verifyForeignKeys(filePath) {
    if (!fs.existsSync(filePath)) return { valid: false, violations: [] };
    let db;
    try {
        db = new Database(filePath, { readonly: true, timeout: 5000 });
        const violations = db.pragma('foreign_key_check');
        return { valid: violations.length === 0, violations };
    } catch (err) {
        return { valid: false, violations: [{ error: err.message }] };
    } finally {
        if (db) db.close();
    }
}

/**
 * Cleans up temporary staging files including WAL and SHM companions.
 * @param {string} tempPath
 */
function cleanStagingFiles(tempPath) {
    const extensions = ['', '-wal', '-shm'];
    for (const ext of extensions) {
        const p = `${tempPath}${ext}`;
        if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (_) {}
        }
    }
}

/**
 * Restores the SQLite database from a specified backup.
 * @param {Object} options
 * @param {string} [options.backupPath] - Path to backup file to restore (defaults to latest)
 * @param {string} [options.targetDbPath] - Path to live database (defaults to db/arayeshi_erp.sqlite3)
 * @param {boolean} [options.skipSafetyBackup=false] - Skip pre-restore safety snapshot
 * @returns {Promise<{restoredFrom: string, targetPath: string, safetyBackupPath: string|null, tablesCount: number, integrityOk: boolean, foreignKeysOk: boolean}>}
 */
async function restoreBackup(options = {}) {
    const targetDbPath = path.resolve(options.targetDbPath || DEFAULT_DB_PATH);
    const targetDir = path.dirname(targetDbPath);

    let backupPath = options.backupPath ? path.resolve(options.backupPath) : findLatestBackup();
    if (!backupPath || !fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath || 'No valid backups available in ' + BACKUPS_DIR}`);
    }

    console.log(`🔄 [Restore] Preparing to restore database...`);
    console.log(`   Source Backup: ${backupPath}`);
    console.log(`   Target DB:     ${targetDbPath}`);

    // Step 1: Pre-flight integrity verification of backup file
    console.log(`🔍 [Restore] Verifying source backup integrity...`);
    if (!verifyDatabaseIntegrity(backupPath)) {
        throw new Error(`Source backup at ${backupPath} failed integrity check! Aborting restore.`);
    }
    console.log(`   Source backup integrity: PASSED (ok)`);

    // Step 2: Create pre-restore safety backup if target DB currently exists
    let safetyBackupPath = null;
    if (fs.existsSync(targetDbPath) && !options.skipSafetyBackup) {
        console.log(`🛡️  [Restore] Creating pre-restore safety snapshot of active database...`);
        const safetyFilename = `pre_restore_${formatTimestamp()}.sqlite3`;
        const safetyResult = await createBackup({
            dbPath: targetDbPath,
            filename: safetyFilename,
            type: 'PRE_RESTORE',
            updateLatest: false
        });
        safetyBackupPath = safetyResult.backupFilePath;
        console.log(`   Safety snapshot saved to: ${safetyBackupPath}`);
    }

    // Step 3: Atomic file replacement via staging file
    console.log(`⚡ [Restore] Performing atomic database file replacement...`);
    const tempRestorePath = path.join(targetDir, `restore_stage_${Date.now()}.tmp`);
    const targetWal = `${targetDbPath}-wal`;
    const targetShm = `${targetDbPath}-shm`;

    try {
        // Copy source to staging temp file first
        fs.copyFileSync(backupPath, tempRestorePath);

        // Verify stage copy integrity before swapping
        if (!verifyDatabaseIntegrity(tempRestorePath)) {
            throw new Error('Staged restore file failed integrity check. Aborting before swap.');
        }

        // Clean up existing WAL and SHM files to prevent stale log replay
        if (fs.existsSync(targetWal)) {
            try { fs.unlinkSync(targetWal); } catch (e) {
                console.warn(`⚠️  Could not remove old WAL file: ${e.message}`);
            }
        }
        if (fs.existsSync(targetShm)) {
            try { fs.unlinkSync(targetShm); } catch (e) {
                console.warn(`⚠️  Could not remove old SHM file: ${e.message}`);
            }
        }

        // Swap staged file into target path
        try {
            fs.renameSync(tempRestorePath, targetDbPath);
        } catch (renameErr) {
            fs.copyFileSync(tempRestorePath, targetDbPath);
            cleanStagingFiles(tempRestorePath);
        }
    } finally {
        cleanStagingFiles(tempRestorePath);
    }

    // Step 4: Post-restore verification
    console.log(`🔍 [Restore] Verifying restored live database...`);
    const checkDb = new Database(targetDbPath, { readonly: true });
    let integrityOk = false;
    let foreignKeysOk = false;
    let tablesCount = 0;
    try {
        const integrity = checkDb.pragma('integrity_check');
        if (integrity && integrity.length === 1 && integrity[0].integrity_check === 'ok') {
            integrityOk = true;
        } else {
            throw new Error(`Restored database failed integrity check: ${JSON.stringify(integrity)}`);
        }

        const fkResult = checkDb.pragma('foreign_key_check');
        foreignKeysOk = (fkResult.length === 0);
        if (!foreignKeysOk) {
            console.warn(`⚠️  [Restore] Note: ${fkResult.length} foreign key check items found.`);
        }

        const tables = checkDb.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
        tablesCount = tables.c;
    } finally {
        checkDb.close();
    }

    const stats = fs.statSync(targetDbPath);

    // Record restore event in manifest
    const manifest = loadManifest();
    manifest.restores.push({
        restored_at: new Date().toISOString(),
        from_backup: path.basename(backupPath),
        safety_snapshot: safetyBackupPath ? path.basename(safetyBackupPath) : null,
        tables_count: tablesCount,
        size: stats.size,
        integrity: integrityOk ? 'ok' : 'failed',
        foreign_keys: foreignKeysOk ? 'ok' : 'violations_detected'
    });
    saveManifest(manifest);

    console.log(`✅ [Restore] Database successfully restored and verified:`);
    console.log(`   Database Path: ${targetDbPath}`);
    console.log(`   Size:          ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
    console.log(`   Tables Count:  ${tablesCount}`);
    console.log(`   Integrity:     ${integrityOk ? 'PASSED (ok)' : 'FAILED'}`);
    console.log(`   Foreign Keys:  ${foreignKeysOk ? 'PASSED (0 violations)' : 'WARNING'}`);
    if (safetyBackupPath) {
        console.log(`   Safety Backup: ${safetyBackupPath}`);
    }

    return {
        restoredFrom: backupPath,
        targetPath: targetDbPath,
        safetyBackupPath,
        tablesCount,
        integrityOk,
        foreignKeysOk
    };
}

if (require.main === module) {
    const customBackup = process.argv[2];
    restoreBackup({ backupPath: customBackup })
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error(`❌ [Restore] Fatal error:`, err.message);
            process.exit(1);
        });
}

module.exports = {
    restoreBackup,
    findLatestBackup,
    verifyDatabaseIntegrity,
    verifyForeignKeys
};
