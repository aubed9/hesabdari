/**
 * db/migrator.js
 * Versioned, transactional SQLite migration runner for Arayeshi Retail ERP.
 * Tracks applied migrations in `schema_migrations` table.
 * Uses BEGIN IMMEDIATE for transaction safety.
 * Handles non-destructive baseline detection for existing databases.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DEFAULT_DB_PATH = path.join(__dirname, 'arayeshi_erp.sqlite3');
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Calculates SHA-256 checksum for migration file contents.
 * @param {string|Buffer} content
 * @returns {string}
 */
function calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ensures schema_migrations tracking table exists.
 * @param {Database.Database} db
 */
function ensureMigrationsTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum TEXT
        );
    `);
}

/**
 * Gets currently applied migrations from the database.
 * @param {Database.Database} db
 * @returns {Map<string, {id: number, applied_at: string, checksum: string}>}
 */
function getAppliedMigrations(db) {
    ensureMigrationsTable(db);
    const rows = db.prepare(`SELECT id, name, applied_at, checksum FROM schema_migrations ORDER BY id ASC`).all();
    const map = new Map();
    for (const row of rows) {
        map.set(row.name, row);
    }
    return map;
}

/**
 * Lists all migration files in migrations directory sorted alphabetically.
 * @param {string} migrationsDir
 * @returns {string[]}
 */
function getMigrationFiles(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }
    return fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Checks if the database contains existing user tables (excluding SQLite internal tables and migrations table).
 * @param {Database.Database} db
 * @returns {string[]}
 */
function getExistingUserTables(db) {
    const rows = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type = 'table' 
          AND name NOT LIKE 'sqlite_%' 
          AND name != 'schema_migrations'
        ORDER BY name ASC
    `).all();
    return rows.map(r => r.name);
}

/**
 * Runs pending migrations against target SQLite database.
 * @param {Object} options
 * @param {string|Database.Database} [options.db] - Existing better-sqlite3 instance or database file path
 * @param {string} [options.migrationsDir] - Path to migrations directory
 * @param {boolean} [options.verbose=true] - Verbose logging
 * @returns {Promise<{applied: string[], skipped: string[], total: number}>}
 */
async function runMigrations(options = {}) {
    const verbose = options.verbose !== false;
    const migrationsDir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);

    let db;
    let shouldCloseDb = false;

    if (options.db && typeof options.db.prepare === 'function') {
        db = options.db;
    } else {
        const dbPath = path.resolve(typeof options.db === 'string' ? options.db : DEFAULT_DB_PATH);
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        shouldCloseDb = true;
    }

    try {
        ensureMigrationsTable(db);
        const appliedMap = getAppliedMigrations(db);
        const migrationFiles = getMigrationFiles(migrationsDir);

        if (verbose) {
            console.log(`🚀 [Migrator] Checking migrations in: ${migrationsDir}`);
            console.log(`   Found ${migrationFiles.length} migration file(s). Applied: ${appliedMap.size}.`);
        }

        const appliedNow = [];
        const alreadyApplied = [];

        for (const file of migrationFiles) {
            const filePath = path.join(migrationsDir, file);
            const content = fs.readFileSync(filePath);
            const checksum = calculateChecksum(content);

            if (appliedMap.has(file)) {
                alreadyApplied.push(file);
                continue;
            }

            // Special baseline handling: detect existing live database without data wipe
            const isBaseline = file.startsWith('001_baseline_') || file === '001_baseline_schema.sql';
            const userTables = getExistingUserTables(db);

            if (isBaseline && userTables.length > 0) {
                if (verbose) {
                    console.log(`🔍 [Migrator] Detected existing live database (${userTables.length} tables found).`);
                    console.log(`🛡️  [Migrator] Harmonizing baseline tables and registering '${file}' non-destructively...`);
                }

                // Execute baseline harmonization in an immediate transaction
                db.exec('BEGIN IMMEDIATE;');
                try {
                    // 1. Ensure system_settings table exists
                    db.exec(`
                        CREATE TABLE IF NOT EXISTS system_settings (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            key TEXT UNIQUE NOT NULL,
                            value TEXT NOT NULL,
                            description TEXT,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        );
                        INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
                        ('currency', 'TOMAN', 'واحد پول پایه سیستم (تومان)'),
                        ('default_warehouse_id', '1', 'شناسه انبار پیش‌فرض سیستم'),
                        ('default_bank_account_id', '1', 'شناسه حساب بانکی پیش‌فرض سیستم'),
                        ('default_cash_account_id', '101', 'شناسه حساب کل موجودی صندوق در کدینگ'),
                        ('tax_rate', '0.09', 'نرخ استاندارد مالیات بر ارزش افزوده');
                    `);

                    // 2. Ensure campaign_recipients table exists
                    db.exec(`
                        CREATE TABLE IF NOT EXISTS campaign_recipients (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
                            customer_id INTEGER REFERENCES customers(id),
                            name TEXT,
                            mobile TEXT NOT NULL,
                            status TEXT CHECK(status IN ('QUEUED', 'SENT', 'FAILED', 'CLICKED', 'CONVERTED')) DEFAULT 'SENT',
                            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        );
                    `);

                    // 3. Ensure campaigns table has all required columns
                    const campCols = db.prepare(`PRAGMA table_info(campaigns)`).all().map(c => c.name);
                    if (!campCols.includes('message_template')) {
                        db.exec(`ALTER TABLE campaigns ADD COLUMN message_template TEXT;`);
                    }
                    if (!campCols.includes('coupon_code')) {
                        db.exec(`ALTER TABLE campaigns ADD COLUMN coupon_code TEXT;`);
                    }
                    if (!campCols.includes('recipients_count')) {
                        db.exec(`ALTER TABLE campaigns ADD COLUMN recipients_count INTEGER DEFAULT 0;`);
                    }

                    // 4. Ensure audit_logs has enhanced audit columns
                    const auditCols = db.prepare(`PRAGMA table_info(audit_logs)`).all().map(c => c.name);
                    if (!auditCols.includes('actor_id')) {
                        db.exec(`ALTER TABLE audit_logs ADD COLUMN actor_id INTEGER REFERENCES users(id);`);
                    }
                    if (!auditCols.includes('before_state')) {
                        db.exec(`ALTER TABLE audit_logs ADD COLUMN before_state TEXT;`);
                    }
                    if (!auditCols.includes('after_state')) {
                        db.exec(`ALTER TABLE audit_logs ADD COLUMN after_state TEXT;`);
                    }
                    if (!auditCols.includes('ip_address')) {
                        db.exec(`ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;`);
                    }

                    // 5. Ensure indexes exist
                    db.exec(`
                        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
                        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_customer ON campaign_recipients(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_employee ON audit_logs(employee_id);
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
                        CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
                    `);

                    // Record baseline in schema_migrations
                    db.prepare(`
                        INSERT INTO schema_migrations (name, checksum)
                        VALUES (?, ?)
                    `).run(file, checksum);

                    db.exec('COMMIT;');
                    appliedNow.push(file);
                    if (verbose) {
                        console.log(`✅ [Migrator] Baseline migration '${file}' recorded successfully without data loss.`);
                    }
                } catch (baselineErr) {
                    db.exec('ROLLBACK;');
                    throw baselineErr;
                }
                continue;
            }

            // Standard migration execution (or baseline on empty database)
            if (verbose) {
                console.log(`⚡ [Migrator] Applying migration: ${file}...`);
            }

            db.exec('BEGIN IMMEDIATE;');
            try {
                if (file.endsWith('.sql')) {
                    const sqlContent = fs.readFileSync(filePath, 'utf8');
                    db.exec(sqlContent);
                } else if (file.endsWith('.js')) {
                    const migrationModule = require(filePath);
                    if (typeof migrationModule.up === 'function') {
                        const result = migrationModule.up(db);
                        if (result && typeof result.then === 'function') {
                            await result;
                        }
                    } else {
                        throw new Error(`Migration file ${file} does not export an 'up' function.`);
                    }
                }

                // Record successful migration
                db.prepare(`
                    INSERT INTO schema_migrations (name, checksum)
                    VALUES (?, ?)
                `).run(file, checksum);

                db.exec('COMMIT;');
                appliedNow.push(file);
                if (verbose) {
                    console.log(`✅ [Migrator] Successfully applied: ${file}`);
                }
            } catch (migErr) {
                db.exec('ROLLBACK;');
                console.error(`❌ [Migrator] Migration failed on ${file}:`, migErr.message);
                throw migErr;
            }
        }

        // Run integrity verification after all migrations have completed
        const integrity = db.pragma('integrity_check');
        if (!integrity || integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
            throw new Error(`Post-migration database integrity check failed: ${JSON.stringify(integrity)}`);
        }

        if (verbose) {
            console.log(`✨ [Migrator] All migrations up to date.`);
            console.log(`   Newly applied: ${appliedNow.length}`);
            console.log(`   Previously applied: ${alreadyApplied.length}`);
            console.log(`   Database integrity: PASSED (ok)`);
        }

        return {
            applied: appliedNow,
            skipped: alreadyApplied,
            total: migrationFiles.length
        };
    } finally {
        if (shouldCloseDb) {
            db.close();
        }
    }
}

/**
 * Retrieves the status of all migrations.
 * @param {Object} options
 * @param {string|Database.Database} [options.db]
 * @param {string} [options.migrationsDir]
 * @returns {Array<{name: string, applied: boolean, applied_at: string|null, checksum: string|null}>}
 */
function getMigrationStatus(options = {}) {
    const migrationsDir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);
    let db;
    let shouldClose = false;

    if (options.db && typeof options.db.prepare === 'function') {
        db = options.db;
    } else {
        const dbPath = path.resolve(typeof options.db === 'string' ? options.db : DEFAULT_DB_PATH);
        db = new Database(dbPath, { readonly: true });
        shouldClose = true;
    }

    try {
        const appliedMap = getAppliedMigrations(db);
        const files = getMigrationFiles(migrationsDir);

        return files.map(file => {
            const isApplied = appliedMap.has(file);
            const info = appliedMap.get(file);
            return {
                name: file,
                applied: isApplied,
                applied_at: isApplied ? info.applied_at : null,
                checksum: isApplied ? info.checksum : null
            };
        });
    } finally {
        if (shouldClose) {
            db.close();
        }
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const isStatus = args.includes('--status') || args.includes('status');

    if (isStatus) {
        try {
            const status = getMigrationStatus();
            console.log('\n=== Migration Status ===');
            console.table(status);
            process.exit(0);
        } catch (err) {
            console.error('❌ Error reading migration status:', err.message);
            process.exit(1);
        }
    } else {
        runMigrations()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('❌ Migration runner failed:', err);
                process.exit(1);
            });
    }
}

module.exports = {
    runMigrations,
    getMigrationStatus,
    calculateChecksum,
    ensureMigrationsTable,
    DEFAULT_MIGRATIONS_DIR,
    DEFAULT_DB_PATH
};
