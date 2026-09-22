/**
 * scripts/clean_slate_day_one.js
 * 
 * Cleans the cosmetics ERP database to a pure "Day 1" production state:
 * - Wipes out all demo orders, mock sales, test returns, and temporary test journals.
 * - Retains full master data: Categories, Brands, Products, Variants, Chart of Accounts, Suppliers, Customers.
 * - Configures secure credentials for Manager and Admin.
 * - Seeds realistic initial opening inventory batches across all active variants.
 * - Posts a perfectly balanced Opening Journal Entry (Dr Inventory, Dr Bank, Dr Cash float vs Cr Owner Equity).
 * - Verifies database integrity and zero reconciliation discrepancies.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { createBackup } = require('./backup');

const DB_PATH = path.join(__dirname, '..', 'db', 'arayeshi_erp.sqlite3');

async function cleanSlateDayOne() {
    console.log('===========================================================');
    console.log('✨ Clean-Slate "Day 1" Production Launch Initializer');
    console.log('===========================================================');

    if (!fs.existsSync(DB_PATH)) {
        console.error(`Database not found at ${DB_PATH}`);
        process.exit(1);
    }

    // 1. Safety Backup
    console.log('\n📦 Step 1: Creating automated safety backup before Day 1 reset...');
    const backupRes = await createBackup({
        filename: `pre_day_one_reset_${Date.now()}.sqlite3`,
        updateLatest: false
    });
    console.log(`✅ Backup successfully created: ${backupRes.backupPath}`);

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    console.log('\n🧹 Step 2: Purging demo/test transactions...');

    const tablesToWipe = [
        'order_items', 'payments', 'return_items', 'returns', 'exchanges',
        'orders', 'cash_sessions', 'wallet_transactions', 'loyalty_transactions',
        'expenses', 'cheques', 'purchase_order_items', 'purchase_orders',
        'stock_count_items', 'stock_counts', 'testers', 'stock_transactions',
        'inventory_batches', 'shipments', 'alerts', 'audit_logs',
        'journal_lines', 'journal_entries'
    ];

    db.exec('PRAGMA foreign_keys = OFF;');

    // Temporarily drop immutability triggers for administrative clean-slate purge
    db.exec(`
        DROP TRIGGER IF EXISTS trg_journal_entries_immutability_upd;
        DROP TRIGGER IF EXISTS trg_journal_entries_immutability_del;
        DROP TRIGGER IF EXISTS trg_journal_lines_immutability_upd;
        DROP TRIGGER IF EXISTS trg_journal_lines_immutability_del;
    `);

    for (const tbl of tablesToWipe) {
        db.exec(`DELETE FROM ${tbl};`);
        db.exec(`DELETE FROM sqlite_sequence WHERE name='${tbl}';`);
    }

    // Re-create immutability triggers to preserve double-entry accounting integrity
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_journal_entries_immutability_upd
        BEFORE UPDATE ON journal_entries
        FOR EACH ROW
        WHEN OLD.is_posted = 1 AND (NEW.is_posted = 0 OR NEW.date != OLD.date OR NEW.entry_number != OLD.entry_number)
        BEGIN
            SELECT RAISE(ABORT, 'Constraint violation: Posted journal vouchers are immutable. Use reverseJournalEntry for corrections.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_journal_entries_immutability_del
        BEFORE DELETE ON journal_entries
        FOR EACH ROW
        WHEN OLD.is_posted = 1
        BEGIN
            SELECT RAISE(ABORT, 'Constraint violation: Posted journal vouchers cannot be deleted.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_journal_lines_immutability_upd
        BEFORE UPDATE ON journal_lines
        FOR EACH ROW
        WHEN (SELECT is_posted FROM journal_entries WHERE id = OLD.journal_entry_id) = 1
        BEGIN
            SELECT RAISE(ABORT, 'Constraint violation: Posted journal lines cannot be updated.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_journal_lines_immutability_del
        BEFORE DELETE ON journal_lines
        FOR EACH ROW
        WHEN (SELECT is_posted FROM journal_entries WHERE id = OLD.journal_entry_id) = 1
        BEGIN
            SELECT RAISE(ABORT, 'Constraint violation: Posted journal lines cannot be deleted.');
        END;
    `);

    db.exec('PRAGMA foreign_keys = ON;');
    console.log(`✅ Cleaned ${tablesToWipe.length} operational transaction tables.`);

    // 3. Configure Core Users & Roles
    console.log('\n👥 Step 3: Setting up official users & permissions...');

    // Remove obsolete test users, keep manager and admin
    db.exec(`DELETE FROM users WHERE username NOT IN ('manager', 'admin');`);

    const ALL_MODULES = JSON.stringify([
        'dashboard', 'pos', 'products', 'inventory', 'purchasing',
        'omnichannel', 'crm', 'marketing', 'accounting', 'reports',
        'bi', 'audit', 'alerts', 'settings'
    ]);

    const ADMIN_MODULES = JSON.stringify(['pos', 'crm', 'alerts']);

    // Ensure Manager exists
    const existingMgr = db.prepare(`SELECT id FROM users WHERE username = 'manager'`).get();
    if (existingMgr) {
        db.prepare(`
            UPDATE users
            SET password_hash = 'Keyhan@Manager2026!',
                role = 'MANAGER',
                full_name = 'مدیر ارشد فروشگاه کیهان',
                permissions = ?,
                is_active = 1
            WHERE id = ?
        `).run(ALL_MODULES, existingMgr.id);
    } else {
        db.prepare(`
            INSERT INTO users (branch_id, username, password_hash, full_name, role, permissions, is_active)
            VALUES (1, 'manager', 'Keyhan@Manager2026!', 'مدیر ارشد فروشگاه کیهان', 'MANAGER', ?, 1)
        `).run(ALL_MODULES);
    }

    // Ensure Admin exists
    const existingAdmin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
    if (existingAdmin) {
        db.prepare(`
            UPDATE users
            SET password_hash = 'Keyhan@Admin2026!',
                role = 'ADMIN',
                full_name = 'ادمین فروشگاه (صندوق و مشتریان)',
                permissions = ?,
                is_active = 1
            WHERE id = ?
        `).run(ADMIN_MODULES, existingAdmin.id);
    } else {
        db.prepare(`
            INSERT INTO users (branch_id, username, password_hash, full_name, role, permissions, is_active)
            VALUES (1, 'admin', 'Keyhan@Admin2026!', 'ادمین فروشگاه (صندوق و مشتریان)', 'ADMIN', ?, 1)
        `).run(ADMIN_MODULES);
    }

    console.log('✅ Users configured:');
    console.log('   - manager: Role MANAGER (Full System Access) | Password: Keyhan@Manager2026!');
    console.log('   - admin:   Role ADMIN (POS, CRM, Alerts)     | Password: Keyhan@Admin2026!');

    // 4. Reset Customers to Clean State
    console.log('\n👥 Step 4: Resetting customer club balances...');
    db.prepare(`
        UPDATE customers
        SET wallet_balance = 0,
            loyalty_points = 0,
            rfm_segment = 'NEW',
            rfm_r_score = 5,
            rfm_f_score = 1,
            rfm_m_score = 1,
            clv = 0
    `).run();
    console.log('✅ Customer records reset to clean Day 1 state (zero wallet/points, ready for new sales).');

    // 5. Seed Initial Opening Stock Batches for Active Variants
    console.log('\n📦 Step 5: Seeding opening stock batches for cosmetics catalog...');
    const variants = db.prepare(`
        SELECT pv.id, pv.sku, pv.barcode, pv.purchase_price, pv.selling_price, p.name_fa
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.is_active = 1
    `).all();

    let totalOpeningStockQuantity = 0;
    let totalOpeningStockCost = 0;
    let totalOpeningStockRetail = 0;

    const insertBatch = db.prepare(`
        INSERT INTO inventory_batches (
            product_variant_id, warehouse_id, batch_number, expiry_date,
            quantity, purchase_price, received_at
        ) VALUES (?, 1, 'LOT-2026-OPENING', '2028-06-30', ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertTx = db.prepare(`
        INSERT INTO stock_transactions (
            product_variant_id, batch_id, warehouse_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id, note
        ) VALUES (?, ?, 1, 'PURCHASE', ?, ?, 'OPENING_BALANCE', ?, 'موجودی اولیه اول دوره - افتتاح رسمی فروشگاه')
    `);

    for (const v of variants) {
        const initialQty = 25; // Clean 25 units per shade/variant on Day 1
        const batchRes = insertBatch.run(v.id, initialQty, v.purchase_price);
        const batchId = batchRes.lastInsertRowid;

        insertTx.run(v.id, batchId, initialQty, v.purchase_price, batchId);

        totalOpeningStockQuantity += initialQty;
        totalOpeningStockCost += (initialQty * v.purchase_price);
        totalOpeningStockRetail += (initialQty * v.selling_price);
    }

    console.log(`✅ Initialized ${variants.length} cosmetic product variants with opening stock:`);
    console.log(`   - Total Stock Quantity: ${totalOpeningStockQuantity.toLocaleString('fa-IR')} units`);
    console.log(`   - Total Inventory Cost Value: ${totalOpeningStockCost.toLocaleString('fa-IR')} Toman`);
    console.log(`   - Total Retail Shelf Value: ${totalOpeningStockRetail.toLocaleString('fa-IR')} Toman`);

    // 6. Bank Accounts and Cash Drawer Opening
    console.log('\n🏦 Step 6: Initializing Bank Accounts and Opening Cash...');
    const initialBankBalance = 100000000; // 100 Million Toman operating bank balance
    const initialCashFloat = 5000000;     // 5 Million Toman cash drawer float

    db.prepare(`UPDATE bank_accounts SET balance = ? WHERE id = 1`).run(initialBankBalance);

    // 7. Post Balanced Opening Journal Entry
    console.log('\n⚖️ Step 7: Posting balanced Opening Journal Entry in General Ledger...');
    
    // Total assets = Inventory (totalOpeningStockCost) + Bank (100,000,000) + Cash (5,000,000)
    const totalCapital = totalOpeningStockCost + initialBankBalance + initialCashFloat;

    const jeRes = db.prepare(`
        INSERT INTO journal_entries (
            entry_number, date, description, reference_type, reference_id, is_posted, created_by
        ) VALUES ('JE-OPENING-2026', DATE('now'), 'سند افتتاحیه مالی - شروع به کار رسمی فروشگاه (روز اول)', 'OPENING_BALANCE', 1, 1, 1)
    `).run();
    const jeId = jeRes.lastInsertRowid;

    const insertJl = db.prepare(`
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES (?, ?, ?, ?, ?)
    `);

    // Fetch accounts
    const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
    const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
    const accInv  = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
    const accCap  = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '301'`).get().id;

    // Dr 103 Inventory
    insertJl.run(jeId, accInv, totalOpeningStockCost, 0, 'موجودی اولیه کالاهای انبار در روز افتتاح');
    // Dr 102 Bank
    insertJl.run(jeId, accBank, initialBankBalance, 0, 'موجودی اولیه حساب بانکی فروشگاه');
    // Dr 101 Cash Float
    insertJl.run(jeId, accCash, initialCashFloat, 0, 'تنخواه و موجودی اولیه صندوق فروش');
    // Cr 301 Owner's Capital
    insertJl.run(jeId, accCap, 0, totalCapital, 'سرمایه مالک / آورده اولیه افتتاحیه');

    console.log(`✅ Journal Entry JE-OPENING-2026 committed:`);
    console.log(`   - Dr 103 (Inventory):     ${totalOpeningStockCost.toLocaleString('fa-IR')} T`);
    console.log(`   - Dr 102 (Bank Mellat):   ${initialBankBalance.toLocaleString('fa-IR')} T`);
    console.log(`   - Dr 101 (Cash Drawer):   ${initialCashFloat.toLocaleString('fa-IR')} T`);
    console.log(`   - Cr 301 (Owner Capital): ${totalCapital.toLocaleString('fa-IR')} T`);
    console.log(`   - Double-Entry Invariant: Balanced! (Debit == Credit = ${totalCapital.toLocaleString('fa-IR')} T)`);

    // 8. Integrity Checks
    console.log('\n🔍 Step 8: Running SQLite integrity and foreign key checks...');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();

    if (integrity[0]?.integrity_check !== 'ok') {
        throw new Error(`PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`);
    }
    if (fkCheck.length > 0) {
        throw new Error(`PRAGMA foreign_key_check failed: ${JSON.stringify(fkCheck)}`);
    }
    console.log('✅ PRAGMA integrity_check: OK');
    console.log('✅ PRAGMA foreign_key_check: 0 violations (Clean)');

    db.close();

    // 9. Reconciliation Verification
    console.log('\n📊 Step 9: Running Full System Reconciliation Verification...');
    const reconciliationService = require('../services/reconciliationService');
    const recon = reconciliationService.runAll();

    console.log(`   - Total Integrity Checks: ${recon.summary.total}`);
    console.log(`   - Critical Anomalies: ${recon.summary.critical}`);
    console.log(`   - Warnings: ${recon.summary.warning}`);
    console.log(`   - Passed (OK): ${recon.summary.ok}`);

    recon.checks.forEach(c => {
        console.log(`     [${c.severity}] ${c.check}: ${c.message}`);
    });

    if (recon.summary.critical !== 0) {
        console.error('❌ Critical reconciliation anomalies detected!');
        process.exit(1);
    }

    console.log('\n===========================================================');
    console.log('🎉 Day 1 Clean Slate Initialized Successfully!');
    console.log('The platform is now in pristine condition for official store launch.');
    console.log('===========================================================');
}

cleanSlateDayOne().catch(err => {
    console.error('CRITICAL ERROR in cleanSlateDayOne:', err);
    process.exit(1);
});
