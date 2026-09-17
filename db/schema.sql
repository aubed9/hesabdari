-- Database Schema for Arayeshi Retail ERP (SQLite)
PRAGMA foreign_keys = ON;

-- 1. Organizations & Branches
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    legal_name TEXT,
    national_id TEXT,
    economic_code TEXT,
    phone TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    is_main BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1
);

-- 2. Staff, Roles & Permissions
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT CHECK(role IN ('ADMIN', 'MANAGER', 'CASHIER', 'STOCKKEEPER', 'ACCOUNTANT')) DEFAULT 'CASHIER',
    phone TEXT,
    base_salary REAL DEFAULT 0,
    commission_rate REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Brands & Categories
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_fa TEXT,
    country TEXT,
    supplier_id INTEGER,
    website TEXT,
    description TEXT,
    commission_rate REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES categories(id),
    name TEXT NOT NULL,
    name_fa TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT 1
);

-- 4. Products & Cosmetics Specific Variants
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER REFERENCES brands(id),
    category_id INTEGER REFERENCES categories(id),
    name TEXT NOT NULL,
    name_fa TEXT NOT NULL,
    model TEXT,
    description TEXT,
    country_of_origin TEXT,
    manufacturer TEXT,
    gender_target TEXT CHECK(gender_target IN ('WOMEN', 'MEN', 'UNISEX')) DEFAULT 'WOMEN',
    skin_type TEXT,
    hair_type TEXT,
    usage_type TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shade TEXT,
    color_hex TEXT,
    size TEXT,
    volume TEXT,
    weight TEXT,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    purchase_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    minimum_price REAL,
    tax_rate REAL DEFAULT 0,
    is_tester_available BOOLEAN DEFAULT 1,
    safety_stock INTEGER DEFAULT 5,
    reorder_point INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT 1
);

-- 5. Warehouses, Batches & FEFO Inventory
CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    is_default BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    warehouse_id INTEGER REFERENCES warehouses(id) DEFAULT 1,
    batch_number TEXT NOT NULL,
    manufacture_date DATE,
    expiry_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
    purchase_price REAL NOT NULL,
    supplier_id INTEGER,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (reserved_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    warehouse_id INTEGER REFERENCES warehouses(id) DEFAULT 1,
    transaction_type TEXT CHECK(transaction_type IN (
        'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
        'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRED',
        'TESTER', 'ADJUSTMENT', 'STOCK_COUNT'
    )) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    employee_id INTEGER REFERENCES users(id),
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tester Management
CREATE TABLE IF NOT EXISTS testers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    warehouse_id INTEGER REFERENCES warehouses(id) DEFAULT 1,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    initial_quantity INTEGER DEFAULT 1,
    remaining_percentage INTEGER DEFAULT 100,
    employee_id INTEGER REFERENCES users(id),
    status TEXT CHECK(status IN ('ACTIVE', 'FINISHED', 'DAMAGED', 'EXPIRED')) DEFAULT 'ACTIVE',
    note TEXT
);

-- 7. Stock Count (انبارگردانی)
CREATE TABLE IF NOT EXISTS stock_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER REFERENCES warehouses(id),
    status TEXT CHECK(status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'DRAFT',
    conducted_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    system_quantity INTEGER NOT NULL,
    counted_quantity INTEGER NOT NULL,
    variance INTEGER GENERATED ALWAYS AS (counted_quantity - system_quantity) VIRTUAL,
    unit_cost REAL NOT NULL,
    cost_variance REAL GENERATED ALWAYS AS ((counted_quantity - system_quantity) * unit_cost) VIRTUAL
);

-- 8. Suppliers & Purchasing
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    mobile TEXT,
    email TEXT,
    address TEXT,
    payment_terms TEXT,
    lead_time_days INTEGER DEFAULT 5,
    credit_limit REAL DEFAULT 0,
    authenticity_rating REAL DEFAULT 5.0,
    delivery_rating REAL DEFAULT 5.0,
    return_rate REAL DEFAULT 0.0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    warehouse_id INTEGER REFERENCES warehouses(id) DEFAULT 1,
    status TEXT CHECK(status IN ('DRAFT', 'APPROVED', 'RECEIVED', 'CANCELLED')) DEFAULT 'DRAFT',
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    order_date DATE DEFAULT (DATE('now')),
    expected_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_number TEXT NOT NULL,
    manufacture_date DATE,
    expiry_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL
);

-- 9. Customers, CRM & Loyalty
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    mobile TEXT UNIQUE NOT NULL,
    email TEXT,
    birth_date DATE,
    membership_date DATE DEFAULT (DATE('now')),
    skin_type TEXT,
    hair_preferences TEXT,
    loyalty_tier TEXT CHECK(loyalty_tier IN ('BRONZE', 'SILVER', 'GOLD', 'VIP')) DEFAULT 'BRONZE',
    loyalty_points INTEGER DEFAULT 0,
    wallet_balance REAL DEFAULT 0 CHECK(wallet_balance >= 0),
    referral_code TEXT UNIQUE,
    referred_by INTEGER REFERENCES customers(id),
    rfm_segment TEXT DEFAULT 'NEW',
    rfm_r_score INTEGER DEFAULT 5,
    rfm_f_score INTEGER DEFAULT 1,
    rfm_m_score INTEGER DEFAULT 1,
    clv REAL DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS back_in_stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    status TEXT CHECK(status IN ('PENDING', 'SENT', 'CANCELLED')) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    type TEXT CHECK(type IN ('EARN', 'REDEEM', 'EXPIRE', 'GIFT_ADJUST')) NOT NULL,
    points INTEGER NOT NULL,
    order_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    type TEXT CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'REFUND', 'GIFT')) NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    order_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Retail POS, Orders, Invoices, Returns & Exchanges
CREATE TABLE IF NOT EXISTS cash_registers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) DEFAULT 1,
    name TEXT NOT NULL,
    device_code TEXT,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cash_register_id INTEGER NOT NULL REFERENCES cash_registers(id),
    employee_id INTEGER NOT NULL REFERENCES users(id),
    opening_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    closing_time DATETIME,
    opening_balance REAL NOT NULL DEFAULT 0,
    expected_balance REAL DEFAULT 0,
    actual_balance REAL DEFAULT 0,
    variance REAL DEFAULT 0,
    status TEXT CHECK(status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    order_type TEXT CHECK(order_type IN ('SALE', 'EXCHANGE', 'PROFORMA', 'LAYAWAY')) DEFAULT 'SALE',
    channel TEXT CHECK(channel IN ('STORE_POS', 'WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MARKETPLACE')) DEFAULT 'STORE_POS',
    customer_id INTEGER REFERENCES customers(id),
    employee_id INTEGER REFERENCES users(id),
    cash_session_id INTEGER REFERENCES cash_sessions(id),
    subtotal REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    discount_reason TEXT,
    tax_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    status TEXT CHECK(status IN ('COMPLETED', 'PENDING', 'CANCELLED', 'REFUNDED', 'EXCHANGED')) DEFAULT 'COMPLETED',
    payment_status TEXT CHECK(payment_status IN ('PAID', 'PARTIAL', 'UNPAID')) DEFAULT 'PAID',
    is_installment BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    quantity INTEGER NOT NULL CHECK(quantity >= 0),
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    total_price REAL NOT NULL,
    is_returned BOOLEAN DEFAULT 0,
    returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK(returned_quantity >= 0),
    CHECK (returned_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method TEXT CHECK(payment_method IN ('CASH', 'CARD', 'WALLET', 'POINTS', 'ONLINE', 'CHEQUE')) NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    card_last_digits TEXT,
    reference_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    original_order_id INTEGER REFERENCES orders(id),
    customer_id INTEGER REFERENCES customers(id),
    employee_id INTEGER REFERENCES users(id),
    total_refund REAL NOT NULL,
    refund_method TEXT CHECK(refund_method IN ('CASH', 'CARD_REVERSAL', 'WALLET_CREDIT')) DEFAULT 'WALLET_CREDIT',
    reason TEXT,
    status TEXT CHECK(status IN ('APPROVED', 'PENDING_MANAGER', 'REJECTED')) DEFAULT 'APPROVED',
    manager_approval_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(id),
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    quantity INTEGER NOT NULL CHECK(quantity >= 0),
    is_opened BOOLEAN DEFAULT 0,
    is_restockable BOOLEAN DEFAULT 1,
    refund_amount REAL NOT NULL CHECK(refund_amount >= 0)
);

CREATE TABLE IF NOT EXISTS exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange_number TEXT UNIQUE NOT NULL,
    return_id INTEGER NOT NULL REFERENCES returns(id),
    new_order_id INTEGER NOT NULL REFERENCES orders(id),
    difference_amount REAL NOT NULL,
    settlement_status TEXT DEFAULT 'SETTLED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Full Double-Entry Accounting
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_fa TEXT NOT NULL,
    type TEXT CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE')) NOT NULL,
    parent_id INTEGER REFERENCES chart_of_accounts(id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_number TEXT UNIQUE NOT NULL,
    date DATE DEFAULT (DATE('now')),
    description TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    is_posted BOOLEAN DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
    debit REAL DEFAULT 0 CHECK(debit >= 0),
    credit REAL DEFAULT 0 CHECK(credit >= 0),
    description TEXT
);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL,
    account_number TEXT,
    card_number TEXT,
    shaba_number TEXT,
    balance REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT CHECK(category IN (
        'RENT', 'SALARY', 'MARKETING', 'PACKAGING', 'SHIPPING',
        'ELECTRICITY', 'INTERNET', 'MAINTENANCE', 'TAX', 'DELIVERY',
        'MARKETPLACE_COMMISSION', 'TESTER_EXPENSE', 'OTHER'
    )) NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    payment_date DATE DEFAULT (DATE('now')),
    description TEXT,
    paid_to TEXT,
    reference_no TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cheques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cheque_number TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date DATE NOT NULL,
    type TEXT CHECK(type IN ('RECEIVABLE', 'PAYABLE')) NOT NULL,
    party_name TEXT NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    customer_id INTEGER REFERENCES customers(id),
    status TEXT CHECK(status IN ('PENDING', 'PASSED', 'BOUNCED', 'CANCELLED')) DEFAULT 'PENDING',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Workforce & Commissions
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES users(id),
    shift_date DATE DEFAULT (DATE('now')),
    start_time TIME,
    end_time TIME,
    status TEXT CHECK(status IN ('PRESENT', 'ABSENT', 'LEAVE', 'LATE')) DEFAULT 'PRESENT',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES users(id),
    order_id INTEGER REFERENCES orders(id),
    brand_id INTEGER REFERENCES brands(id),
    sales_amount REAL NOT NULL,
    rate_applied REAL NOT NULL,
    commission_amount REAL NOT NULL,
    period_month TEXT,
    status TEXT CHECK(status IN ('PENDING', 'PAID')) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Marketing, Campaigns & Coupons
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT CHECK(type IN (
        'BIRTHDAY', 'VIP', 'INACTIVE', 'AT_RISK',
        'NEW_PRODUCT', 'NEW_BRAND', 'BACK_IN_STOCK',
        'EXPIRING_STOCK', 'SEASONAL'
    )) NOT NULL,
    channel TEXT CHECK(channel IN ('SMS', 'WHATSAPP', 'PUSH', 'IN_STORE')) DEFAULT 'SMS',
    target_segment TEXT,
    discount_percent REAL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    budget REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    revenue_generated REAL DEFAULT 0,
    conversions_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_template TEXT,
    coupon_code TEXT,
    recipients_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id),
    name TEXT,
    mobile TEXT NOT NULL,
    status TEXT CHECK(status IN ('QUEUED', 'SENT', 'FAILED', 'CLICKED', 'CONVERTED')) DEFAULT 'SENT',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT CHECK(discount_type IN ('PERCENT', 'FIXED')) NOT NULL,
    discount_value REAL NOT NULL,
    min_order_value REAL DEFAULT 0,
    max_discount REAL,
    usage_limit INTEGER DEFAULT 100,
    usage_count INTEGER DEFAULT 0,
    valid_from DATE DEFAULT (DATE('now')),
    valid_until DATE,
    is_active BOOLEAN DEFAULT 1
);

-- 14. Online & Shipments
CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    customer_id INTEGER REFERENCES customers(id),
    courier_name TEXT NOT NULL,
    tracking_number TEXT,
    shipping_fee REAL DEFAULT 0,
    delivery_address TEXT NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED')) DEFAULT 'PENDING',
    sent_at DATETIME,
    delivered_at DATETIME,
    notes TEXT
);

-- 15. Real-Time Alerts & Audit Logs
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT CHECK(alert_type IN (
        'LOW_STOCK', 'OUT_OF_STOCK', 'NEAR_EXPIRY', 'EXPIRED',
        'SLOW_MOVING', 'DEAD_STOCK', 'HIGH_DISCOUNT', 'CASH_VARIANCE',
        'CHEQUE_DUE', 'SUPPLIER_DUE', 'CHURN_RISK', 'MARGIN_DROP'
    )) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')) DEFAULT 'WARNING',
    is_resolved BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES users(id),
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    before_state TEXT,
    after_state TEXT,
    ip_address TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Fixed Costs & Periodic Expenses
CREATE TABLE IF NOT EXISTS fixed_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
    amount REAL NOT NULL CHECK(amount >= 0),
    frequency TEXT CHECK(frequency IN ('MONTHLY', 'QUARTERLY', 'YEARLY', 'WEEKLY')) DEFAULT 'MONTHLY',
    due_day INTEGER DEFAULT 1,
    status TEXT CHECK(status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE',
    notes TEXT,
    last_paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Configurable System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    purchase_order_id INTEGER REFERENCES purchase_orders(id),
    payment_method TEXT CHECK(payment_method IN ('CASH', 'BANK', 'CHEQUE')) NOT NULL DEFAULT 'BANK',
    amount REAL NOT NULL,
    reference_code TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    total_amount REAL NOT NULL,
    reason TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL
);

-- Insert Default System Settings if not already present
INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
('currency', 'TOMAN', 'واحد پول پایه سیستم (تومان)'),
('default_warehouse_id', '1', 'شناسه انبار پیش‌فرض سیستم'),
('default_bank_account_id', '1', 'شناسه حساب بانکی پیش‌فرض سیستم'),
('default_cash_account_id', '101', 'شناسه حساب کل موجودی صندوق در کدینگ'),
('tax_rate', '0.09', 'نرخ استاندارد مالیات بر ارزش افزوده');

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_variant ON inventory_batches(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_tx_variant ON stock_transactions(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_customer ON campaign_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_employee ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
