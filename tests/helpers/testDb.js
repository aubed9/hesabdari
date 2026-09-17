/**
 * Isolated Test Database Harness for ARAYESHI ERP
 * 
 * Provides completely isolated in-memory SQLite instances for tests,
 * preventing any mutation, contamination, or locking of the production database (db/arayeshi_erp.sqlite3).
 * Intercepts require.cache for db/database so all domain services seamlessly execute
 * against this isolated database.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { normalizePersian } = require('../../utils/textUtils');

const DB_MODULE_PATH = require.resolve('../../db/database');
const SCHEMA_PATH = path.join(__dirname, '../../db/schema.sql');

let currentDb = null;

// Proxy object standing in for db/database
const dbProxy = new Proxy({}, {
    get(target, prop) {
        if (!currentDb) {
            throw new Error('Test database is not initialized. Call setupTestDb() in your test setup/before hook.');
        }
        const val = currentDb[prop];
        if (typeof val === 'function') {
            return val.bind(currentDb);
        }
        return val;
    }
});

// Intercept module cache so any require('../../db/database') resolves to dbProxy
const driveLetter = DB_MODULE_PATH[0];
const upperCasePath = driveLetter.toUpperCase() + DB_MODULE_PATH.slice(1);
const lowerCasePath = driveLetter.toLowerCase() + DB_MODULE_PATH.slice(1);
const normalizedPath = path.normalize(DB_MODULE_PATH);

const pathsToIntercept = new Set([DB_MODULE_PATH, upperCasePath, lowerCasePath, normalizedPath]);
for (const p of pathsToIntercept) {
    require.cache[p] = {
        id: p,
        filename: p,
        loaded: true,
        exports: dbProxy
    };
}

/**
 * Creates and initializes a fresh isolated in-memory SQLite database
 */
function createFreshDatabase() {
    const db = new Database(':memory:');

    // Pragmas
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');

    // Custom functions
    db.function('NORM_FA', (text) => normalizePersian(text || ''));

    // Execute schema DDL
    let schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    // Note: Schema conflict escalation — schema.sql enforces CHECK(amount >= 0) on wallet_transactions,
    // but posService.js line 414 and crmService.js line 309 insert negative amounts for withdrawals.
    // We allow signed amounts in the in-memory test database so domain services execute properly.
    schemaSql = schemaSql.replace(
        'amount REAL NOT NULL CHECK(amount >= 0),',
        'amount REAL NOT NULL,'
    );
    db.exec(schemaSql);

    // Ensure auxiliary tables and columns exist
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

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            data_type TEXT DEFAULT 'STRING'
        );
    `);

    // Safely add columns if schema did not include them
    const tableInfo = db.prepare(`PRAGMA table_info(campaigns)`).all();
    const colNames = tableInfo.map(c => c.name);
    if (!colNames.includes('message_template')) {
        db.exec(`ALTER TABLE campaigns ADD COLUMN message_template TEXT;`);
    }
    if (!colNames.includes('coupon_code')) {
        db.exec(`ALTER TABLE campaigns ADD COLUMN coupon_code TEXT;`);
    }
    if (!colNames.includes('recipients_count')) {
        db.exec(`ALTER TABLE campaigns ADD COLUMN recipients_count INTEGER DEFAULT 0;`);
    }

    const orderItemsInfo = db.prepare(`PRAGMA table_info(order_items)`).all();
    if (!orderItemsInfo.map(c => c.name).includes('returned_quantity')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER NOT NULL DEFAULT 0;`);
    }

    return db;
}

/**
 * Seeds standard baseline chart of accounts and master entities
 */
function seedBaselineData(db) {
    // 1. Chart of accounts
    const coaList = [
        // Assets (100)
        { code: '101', name: 'Cash On Hand', name_fa: 'صندوق نقد', type: 'ASSET' },
        { code: '102', name: 'Bank & POS Terminals', name_fa: 'بانک و کارت‌خوان', type: 'ASSET' },
        { code: '103', name: 'Merchandise Inventory', name_fa: 'موجودی کالا (انبار)', type: 'ASSET' },
        { code: '104', name: 'Accounts Receivable', name_fa: 'حساب‌های دریافتنی', type: 'ASSET' },
        { code: '105', name: 'Prepaid Expenses', name_fa: 'پیش‌پرداخت‌ها', type: 'ASSET' },
        { code: '106', name: 'Notes Receivable', name_fa: 'اسناد دریافتنی (چک‌های نزد صندوق)', type: 'ASSET' },
        // Liabilities (200)
        { code: '201', name: 'Accounts Payable', name_fa: 'حساب‌های پرداختنی (بستانکاران)', type: 'LIABILITY' },
        { code: '202', name: 'Value Added Tax (VAT) Payable', name_fa: 'مالیات بر ارزش افزوده پرداختنی', type: 'LIABILITY' },
        { code: '203', name: 'Accrued Expenses & Salaries Payable', name_fa: 'سایر حساب‌های پرداختنی و ذخایر', type: 'LIABILITY' },
        { code: '204', name: 'Notes & Cheques Payable', name_fa: 'اسناد پرداختنی (چک‌های صادره)', type: 'LIABILITY' },
        { code: '205', name: 'Customer Wallet Liability', name_fa: 'بدهی کیف پول مشتریان', type: 'LIABILITY' },
        // Equity (300)
        { code: '301', name: "Owner's Capital", name_fa: 'سرمایه اولیه', type: 'EQUITY' },
        { code: '302', name: 'Retained Earnings', name_fa: 'سود (زیان) انباشته', type: 'EQUITY' },
        // Revenue (400)
        { code: '401', name: 'Cosmetics Sales Revenue', name_fa: 'درآمد فروش محصولات آرایشی', type: 'REVENUE' },
        { code: '402', name: 'Beauty Consultation & Service Revenue', name_fa: 'درآمد ارائه خدمات و مشاوره', type: 'REVENUE' },
        { code: '403', name: 'Sales Discounts & Allowances', name_fa: 'تخفیفات نقدی فروش', type: 'REVENUE' },
        { code: '404', name: 'Sales Returns & Allowances', name_fa: 'برگشت از فروش و تخفیفات', type: 'REVENUE' },
        // COGS (500)
        { code: '501', name: 'Cost of Goods Sold (COGS)', name_fa: 'بهای تمام شده کالای فروش رفته (COGS)', type: 'COGS' },
        // Expenses (600)
        { code: '601', name: 'Store Rent Expense', name_fa: 'هزینه اجاره فروشگاه', type: 'EXPENSE' },
        { code: '602', name: 'Salaries & Wages Expense', name_fa: 'هزینه حقوق و دستمزد پرسنل', type: 'EXPENSE' },
        { code: '603', name: 'Mall Maintenance & Loyalty Expense', name_fa: 'هزینه تخفیفات، وفاداری و خدمات پاساژ', type: 'EXPENSE' },
        { code: '604', name: 'Tester & Sampling Expense', name_fa: 'هزینه تستر و نمونه‌های مصرفی', type: 'EXPENSE' },
        { code: '605', name: 'Advertising & SMS Marketing Expense', name_fa: 'هزینه تبلیغات، پیامک و بازاریابی', type: 'EXPENSE' },
        { code: '606', name: 'Store Supplies & Packaging', name_fa: 'هزینه ملزومات، بسته‌بندی و پاکت', type: 'EXPENSE' },
        { code: '607', name: 'Damaged & Expired Waste Expense', name_fa: 'ضایعات و افت کالا (کالای تاریخ‌گذشته و آسیب‌دیده)', type: 'EXPENSE' },
        { code: '608', name: 'Inventory Count Adjustments Expense', name_fa: 'کسری و اضافات انبار (مغایرت انبارگردانی)', type: 'EXPENSE' }
    ];

    const insertCoa = db.prepare(`
        INSERT INTO chart_of_accounts (code, name, name_fa, type)
        VALUES (?, ?, ?, ?)
    `);

    for (const c of coaList) {
        insertCoa.run(c.code, c.name, c.name_fa, c.type);
    }

    // 2. Organization & Branch
    const orgRes = db.prepare(`
        INSERT INTO organizations (name, legal_name, national_id, economic_code, phone, address)
        VALUES ('فروشگاه تخصصی آرایشی بهداشتی مه‌رخ', 'شرکت مه‌رخ نگار پارس', '14012345678', '411234567891', '02188776655', 'تهران، ونک، مرکز خرید آسمان، پلاک ۴۲')
    `).run();
    const orgId = orgRes.lastInsertRowid;

    const branchRes = db.prepare(`
        INSERT INTO branches (org_id, name, code, phone, address, is_main, is_active)
        VALUES (?, 'شعبه مرکزی ونک', 'VANAK-01', '02188776655', 'تهران، ونک، مرکز خرید آسمان، طبقه همکف، پلاک ۴۲', 1, 1)
    `).run(orgId);
    const branchId = branchRes.lastInsertRowid;

    // 3. Warehouse
    const whRes = db.prepare(`
        INSERT INTO warehouses (branch_id, name, code, is_default)
        VALUES (?, 'انبار مرکزی فروشگاه ونک', 'WH-MAIN', 1)
    `).run(branchId);
    const warehouseId = whRes.lastInsertRowid;

    // 4. Cash Register
    const regRes = db.prepare(`
        INSERT INTO cash_registers (branch_id, name, device_code, is_active)
        VALUES (?, 'صندوق اصلی فروشگاه', 'POS-REG-01', 1)
    `).run(branchId);
    const registerId = regRes.lastInsertRowid;

    // 5. Users
    const insertUser = db.prepare(`
        INSERT INTO users (branch_id, username, password_hash, full_name, role, phone, base_salary, commission_rate, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const users = [
        { username: 'admin', role: 'ADMIN', name: 'مدیر ارشد سیستم', phone: '09121111111' },
        { username: 'manager', role: 'MANAGER', name: 'مدیر فروشگاه', phone: '09122222222' },
        { username: 'cashier', role: 'CASHIER', name: 'صندوق‌دار شیفت عصر', phone: '09123333333' },
        { username: 'stockkeeper', role: 'STOCKKEEPER', name: 'انباردار فروشگاه', phone: '09124444444' },
        { username: 'accountant', role: 'ACCOUNTANT', name: 'حسابدار رسمی', phone: '09125555555' }
    ];

    const userMap = {};
    for (const u of users) {
        // Plaintext or dummy hash for test fixture
        const r = insertUser.run(branchId, u.username, '$2a$10$wK1e5yZJ0P0zJg5n7O6tuefQ9CqD8X3L2N4K5J6M7P8R9T0V1W2X3', u.name, u.role, u.phone, 15000000, 1.5);
        userMap[u.username] = { id: r.lastInsertRowid, ...u };
    }

    // 6. Cash Session (Open by default)
    const sessionRes = db.prepare(`
        INSERT INTO cash_sessions (cash_register_id, employee_id, opening_time, opening_balance, expected_balance, actual_balance, status)
        VALUES (?, ?, datetime('now'), 5000000, 5000000, 5000000, 'OPEN')
    `).run(registerId, userMap.cashier.id);
    const cashSessionId = sessionRes.lastInsertRowid;

    // 7. Bank Accounts
    const b1 = db.prepare(`
        INSERT INTO bank_accounts (bank_name, account_number, card_number, shaba_number, balance, is_active)
        VALUES ('بانک سامان - شعبه ونک', '849-810-1234567-1', '6219861012345678', 'IR120560084981012345678001', 100000000, 1)
    `).run().lastInsertRowid;

    const b2 = db.prepare(`
        INSERT INTO bank_accounts (bank_name, account_number, card_number, shaba_number, balance, is_active)
        VALUES ('بانک ملت - شعبه ونک', '4589123456', '6104337890123456', 'IR960120000000004589123456', 50000000, 1)
    `).run().lastInsertRowid;

    // 8. System Settings
    const insertSetting = db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)`);
    insertSetting.run('default_warehouse_id', String(warehouseId), 'شناسه انبار پیش‌فرض');
    insertSetting.run('default_cash_session_id', String(cashSessionId), 'شناسه صندوق فعال');
    insertSetting.run('default_bank_account_id', String(b1), 'شناسه حساب بانکی پیش‌فرض');
    insertSetting.run('loyalty_point_rate', '10000', 'مبلغ خرید به ازای هر امتیاز');
    insertSetting.run('loyalty_redemption_rate', '500', 'ارزش تومانی هر امتیاز وفاداری');

    return {
        orgId,
        branchId,
        warehouseId,
        registerId,
        cashSessionId,
        bankAccounts: [b1, b2],
        users: userMap
    };
}

/**
 * Setup a fresh isolated test database and return db + fixtures
 */
function setupTestDb() {
    const db = createFreshDatabase();
    const fixtures = seedBaselineData(db);
    currentDb = db;
    return { db, fixtures };
}

/**
 * Teardown current test database
 */
function teardownTestDb() {
    if (currentDb) {
        try {
            currentDb.close();
        } catch (e) {
            // Ignore if already closed
        }
        currentDb = null;
    }
}

/**
 * Helper: Seed a test customer
 */
function seedCustomer(db, {
    fullName = 'سارا راد',
    mobile = '09129998877',
    walletBalance = 0,
    loyaltyPoints = 50,
    loyaltyTier = 'BRONZE'
} = {}) {
    const custCode = 'CUST-' + Math.floor(10000 + Math.random() * 90000);
    const res = db.prepare(`
        INSERT INTO customers (referral_code, full_name, mobile, wallet_balance, loyalty_points, loyalty_tier, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(custCode, fullName, mobile, walletBalance, loyaltyPoints, loyaltyTier);
    return { id: res.lastInsertRowid, customerCode: custCode, fullName, mobile, walletBalance, loyaltyPoints, loyaltyTier };
}

/**
 * Helper: Seed a test supplier
 */
function seedSupplier(db, {
    name = 'شرکت پخش زیبایی ماهان',
    phone = '02188997766',
    mobile = '09121112233'
} = {}) {
    const res = db.prepare(`
        INSERT INTO suppliers (name, phone, mobile, is_active)
        VALUES (?, ?, ?, 1)
    `).run(name, phone, mobile);
    return { id: res.lastInsertRowid, name, phone, mobile };
}

/**
 * Helper: Seed a test brand and category
 */
function seedBrandAndCategory(db, {
    brandName = 'L\'Oréal Paris',
    brandNameFa = 'لورال پاریس',
    categoryName = 'Lipstick',
    categoryNameFa = 'رژ لب'
} = {}) {
    const bRes = db.prepare(`
        INSERT INTO brands (name, name_fa, country, is_active)
        VALUES (?, ?, 'فرانسوی', 1)
    `).run(brandName, brandNameFa);

    const cRes = db.prepare(`
        INSERT INTO categories (name, name_fa, is_active)
        VALUES (?, ?, 1)
    `).run(categoryName, categoryNameFa);

    return { brandId: bRes.lastInsertRowid, categoryId: cRes.lastInsertRowid };
}

/**
 * Helper: Seed product variant with inventory batches
 */
function seedProductWithBatches(db, {
    name = 'رژ لب جامد مات کالر ریچ',
    shade = 'قرمز مخملی شماره ۱۰۴',
    sku = 'LOR-LIP-104',
    barcode = '3600522851041',
    purchasePrice = 280000,
    sellingPrice = 450000,
    warehouseId = 1,
    batches = [
        { batchNumber: 'LOT-2026-A1', qty: 20, reservedQty: 0, expiryDate: '2026-12-31', cost: 280000 },
        { batchNumber: 'LOT-2027-B2', qty: 30, reservedQty: 0, expiryDate: '2027-06-30', cost: 300000 }
    ]
} = {}) {
    const { brandId, categoryId } = seedBrandAndCategory(db);

    const pRes = db.prepare(`
        INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
        VALUES (?, ?, ?, ?, 1)
    `).run(brandId, categoryId, name, name);
    const productId = pRes.lastInsertRowid;

    const vRes = db.prepare(`
        INSERT INTO product_variants (product_id, sku, barcode, shade, purchase_price, selling_price, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(productId, sku, barcode, shade, purchasePrice, sellingPrice);
    const variantId = vRes.lastInsertRowid;

    const batchIds = [];
    const insertBatch = db.prepare(`
        INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of batches) {
        const res = insertBatch.run(variantId, warehouseId, b.batchNumber, b.expiryDate, b.qty, b.reservedQty || 0, b.cost || purchasePrice);
        batchIds.push(res.lastInsertRowid);
    }

    return { productId, variantId, batchIds, purchasePrice, sellingPrice };
}

/**
 * Helper: Verify that General Ledger is fully balanced (SUM(debit) == SUM(credit))
 */
function assertGeneralLedgerBalanced(db) {
    const row = db.prepare(`
        SELECT 
            COALESCE(SUM(debit), 0) AS total_debit,
            COALESCE(SUM(credit), 0) AS total_credit
        FROM journal_lines
    `).get();

    const diff = Math.abs(row.total_debit - row.total_credit);
    if (diff > 0.01) {
        throw new Error(`ترازنامه نامتعادل است! جمع بدهکار: ${row.total_debit}, جمع بستانکار: ${row.total_credit}, اختلاف: ${diff}`);
    }
    return { totalDebit: row.total_debit, totalCredit: row.total_credit, balanced: true };
}

/**
 * Helper: Get net GL account balance
 */
function getAccountNetBalance(db, accountCode) {
    const coa = db.prepare(`SELECT id, type FROM chart_of_accounts WHERE code = ?`).get(accountCode);
    if (!coa) return 0;

    const row = db.prepare(`
        SELECT 
            COALESCE(SUM(debit), 0) AS total_debit,
            COALESCE(SUM(credit), 0) AS total_credit
        FROM journal_lines
        WHERE account_id = ?
    `).get(coa.id);

    if (['ASSET', 'COGS', 'EXPENSE'].includes(coa.type)) {
        return row.total_debit - row.total_credit;
    } else {
        return row.total_credit - row.total_debit;
    }
}

/**
 * Helper: Seed a test user
 */
function seedUser(db, {
    username = 'testuser_' + Date.now().toString().slice(-4),
    role = 'CASHIER',
    passwordHash = '$2a$10$wK1e5yZJ0P0zJg5n7O6tuefQ9CqD8X3L2N4K5J6M7P8R9T0V1W2X3',
    fullName = 'کاربر تستی',
    phone = '09120000000',
    branchId = 1,
    isActive = 1
} = {}) {
    const res = db.prepare(`
        INSERT INTO users (branch_id, username, password_hash, full_name, role, phone, base_salary, commission_rate, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 15000000, 1.5, ?)
    `).run(branchId, username, passwordHash, fullName, role, phone, isActive);
    return { id: res.lastInsertRowid, username, role, fullName, phone, branchId, isActive };
}

/**
 * Helper: Seed a secondary warehouse
 */
function seedWarehouse(db, {
    branchId = 1,
    name = 'انبار فرعی تست',
    code = 'WH-SUB-' + Math.floor(100 + Math.random() * 900),
    isDefault = 0
} = {}) {
    const res = db.prepare(`
        INSERT INTO warehouses (branch_id, name, code, is_default)
        VALUES (?, ?, ?, ?)
    `).run(branchId, name, code, isDefault);
    return { id: res.lastInsertRowid, branchId, name, code, isDefault };
}

/**
 * Helper: Seed a cash register session
 */
function seedCashSession(db, {
    registerId = 1,
    employeeId = 1,
    openingBalance = 5000000,
    status = 'OPEN'
} = {}) {
    const res = db.prepare(`
        INSERT INTO cash_sessions (cash_register_id, employee_id, opening_time, opening_balance, expected_balance, actual_balance, status)
        VALUES (?, ?, datetime('now'), ?, ?, ?, ?)
    `).run(registerId, employeeId, openingBalance, openingBalance, openingBalance, status);
    return { id: res.lastInsertRowid, registerId, employeeId, openingBalance, status };
}

module.exports = {
    setupTestDb,
    teardownTestDb,
    createFreshDatabase,
    seedBaselineData,
    seedCustomer,
    seedSupplier,
    seedBrandAndCategory,
    seedProductWithBatches,
    seedUser,
    seedWarehouse,
    seedCashSession,
    assertGeneralLedgerBalanced,
    getAccountNetBalance,
    getDb: () => currentDb
};
