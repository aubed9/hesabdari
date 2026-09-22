// SQLite Database connection and initialization
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { runMigrationsSync } = require('./migrator');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'arayeshi_erp.sqlite3');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH, { verbose: null });

// Enable foreign keys and Write-Ahead Logging for high concurrency & performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Register Persian normalization function directly in SQLite
const { normalizePersian } = require('../utils/textUtils');
db.function('NORM_FA', (text) => normalizePersian(text || ''));

function syncCogsAndProfits(database) {
    try {
        // 1. Delete orphan test orders with 0 items if any exist
        database.prepare(`
            DELETE FROM orders 
            WHERE id IN (
                SELECT o.id FROM orders o 
                LEFT JOIN order_items oi ON o.id = oi.order_id 
                WHERE oi.id IS NULL
            )
        `).run();

        // 2. Backfill order_items unit_cost from product_variants where missing or zero
        database.prepare(`
            UPDATE order_items
            SET unit_cost = (
                SELECT COALESCE(NULLIF(pv.purchase_price, 0), 0)
                FROM product_variants pv
                WHERE pv.id = order_items.product_variant_id
            )
            WHERE (unit_cost IS NULL OR unit_cost = 0)
              AND EXISTS (
                SELECT 1 FROM product_variants pv 
                WHERE pv.id = order_items.product_variant_id 
                  AND pv.purchase_price > 0
              )
        `).run();

        // 3. Backfill orders total_cost from order_items
        database.prepare(`
            UPDATE orders
            SET total_cost = (
                SELECT COALESCE(SUM(oi.quantity * COALESCE(NULLIF(oi.unit_cost, 0), pv.purchase_price, 0)), 0)
                FROM order_items oi
                LEFT JOIN product_variants pv ON oi.product_variant_id = pv.id
                WHERE oi.order_id = orders.id
            )
            WHERE (total_cost IS NULL OR total_cost = 0)
              AND EXISTS (
                SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id
              )
        `).run();
    } catch (e) {
        console.warn('⚠️ Warning syncing COGS and profits:', e.message);
    }
}

function initDatabase() {
    try {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.exec(schema);

        // Execute versioned migrations automatically on startup before any HTTP operations
        runMigrationsSync({ db, verbose: false });

        // Seed initial fixed costs if empty
        const fcCount = db.prepare(`SELECT count(*) AS c FROM fixed_costs`).get();
        if (fcCount.c === 0) {
            const rentAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '601'`).get();
            const utilAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '603'`).get();
            const salaryAcc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '602'`).get();

            if (rentAcc) {
                db.prepare(`
                    INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day, notes)
                    VALUES ('اجاره ماهانه فروشگاه (ملک تجاری)', 'RENT', ?, 45000000, 'MONTHLY', 1, 'پرداخت اول هر ماه به موجر')
                `).run(rentAcc.id);
            }
            if (utilAcc) {
                db.prepare(`
                    INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day, notes)
                    VALUES ('شارژ و خدمات ماهانه پاساژ', 'MAINTENANCE', ?, 3500000, 'MONTHLY', 5, 'شارژ مدیریت پاساژ، سرمایش، گرمایش و حراست')
                `).run(utilAcc.id);
                db.prepare(`
                    INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day, notes)
                    VALUES ('اشتراک اینترنت فیبر و سرور نرم‌افزار', 'SUBSCRIPTION', ?, 1200000, 'MONTHLY', 10, 'خط فیبر پرسرعت و سرور پشتیبان')
                `).run(utilAcc.id);
            }
            if (salaryAcc) {
                db.prepare(`
                    INSERT INTO fixed_costs (title, category, account_id, amount, frequency, due_day, notes)
                    VALUES ('حقوق پایه پرسنل ثابت فروشگاه', 'SALARY', ?, 25000000, 'MONTHLY', 28, 'حقوق ثابت ماهانه صندوق‌دار و انباردار')
                `).run(salaryAcc.id);
            }
        }

        // Automatic self-healing sync for COGS and profits
        syncCogsAndProfits(db);

        console.log('✅ SQLite Schema and migrations initialized successfully.');
    } catch (err) {
        console.error('❌ Error initializing SQLite schema & migrations:', err);
        throw err;
    }
}

// Graceful shutdown handler: checkpoint WAL and safely close database connection
let isClosing = false;
function closeDatabaseGracefully(signal) {
    if (isClosing) return;
    isClosing = true;
    try {
        if (db && db.open) {
            console.log(`\n🛑 [Database] Checkpointing WAL (TRUNCATE) and closing connection (${signal || 'SHUTDOWN'})...`);
            try {
                db.pragma('wal_checkpoint(TRUNCATE)');
            } catch (walErr) {
                console.warn(`⚠️ [Database] WAL checkpoint warning: ${walErr.message}`);
            }
            db.close();
            console.log('✅ [Database] Database connection closed cleanly.');
        }
    } catch (err) {
        console.error('❌ [Database] Error during database closure:', err.message);
    }
}

// Register signal handlers for clean process shutdown
process.once('SIGTERM', () => {
    closeDatabaseGracefully('SIGTERM');
});
process.once('SIGINT', () => {
    closeDatabaseGracefully('SIGINT');
});

// Also hook into exit to guarantee WAL truncation on normal process termination
process.once('exit', () => {
    closeDatabaseGracefully('EXIT');
});

db.closeDatabaseGracefully = closeDatabaseGracefully;

initDatabase();

module.exports = db;

