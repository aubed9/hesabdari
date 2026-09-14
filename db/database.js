// SQLite Database connection and initialization
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'arayeshi_erp.sqlite3');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH, { verbose: null });

// Enable foreign keys and Write-Ahead Logging for high concurrency & performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Register Persian normalization function directly in SQLite
const { normalizePersian } = require('../utils/textUtils');
db.function('NORM_FA', (text) => normalizePersian(text || ''));

function initDatabase() {
    try {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.exec(schema);

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


        console.log('✅ SQLite Schema initialized successfully.');
    } catch (err) {
        console.error('❌ Error initializing SQLite schema:', err);
        throw err;
    }
}

initDatabase();

module.exports = db;
