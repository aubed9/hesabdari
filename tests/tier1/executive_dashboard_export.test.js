const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { setupTestDb, teardownTestDb } = require('../helpers/testDb');

describe('Tier 1: Executive Dashboard New Customers & Persian Excel Export Suite', () => {
    let db, biService, inventoryService;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;
        biService = require('../../services/biService');
        inventoryService = require('../../services/inventoryService');

        // 1. Seed Brand and Product
        db.prepare(`
            INSERT INTO brands (id, name, name_fa, country, is_active)
            VALUES (1, 'LOREAL', 'لورآل', 'France', 1)
        `).run();

        db.prepare(`
            INSERT INTO products (id, brand_id, name, name_fa, is_active)
            VALUES (1, 1, 'Infallible Foundation', 'کرم پودر اینفالیبل ۲۴ ساعته', 1)
        `).run();

        // 2. Seed Variants (one low stock requiring reorder, one well stocked)
        // Variant 1: Stock = 2, Reorder Point = 15, Safety Stock = 5 -> Needs Reorder!
        db.prepare(`
            INSERT INTO product_variants (id, product_id, sku, barcode, shade, purchase_price, selling_price, safety_stock, reorder_point, is_active)
            VALUES (1, 1, 'LOR-INF-120', '3600523234567', 'شماره ۱۲۰ وانیلی', 400000, 650000, 5, 15, 1)
        `).run();

        // Variant 2: Stock = 50, Reorder Point = 10, Safety Stock = 5 -> Stocked!
        db.prepare(`
            INSERT INTO product_variants (id, product_id, sku, barcode, shade, purchase_price, selling_price, safety_stock, reorder_point, is_active)
            VALUES (2, 1, 'LOR-INF-140', '3600523234588', 'شماره ۱۴۰ بژ طبیعی', 400000, 650000, 5, 10, 1)
        `).run();

        // 3. Batches for stock
        db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, quantity, purchase_price, expiry_date)
            VALUES (1, 1, 'BATCH-001', 2, 400000, date('now', '+180 days'))
        `).run();

        db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, quantity, purchase_price, expiry_date)
            VALUES (2, 1, 'BATCH-002', 50, 400000, date('now', '+365 days'))
        `).run();

        // 4. Seed Customers with different registration dates
        // Customer 1: Registered today
        db.prepare(`
            INSERT INTO customers (id, full_name, mobile, membership_date, created_at, loyalty_tier, rfm_segment, is_active)
            VALUES (1, 'زهرا کاظمی', '09121111111', date('now'), datetime('now'), 'VIP', 'Champions', 1)
        `).run();

        // Customer 2: Registered 5 days ago (in this week & month)
        db.prepare(`
            INSERT INTO customers (id, full_name, mobile, membership_date, created_at, loyalty_tier, rfm_segment, is_active)
            VALUES (2, 'مریم حسینی', '09122222222', date('now', '-5 days'), datetime('now', '-5 days'), 'GOLD', 'Loyal', 1)
        `).run();

        // Customer 3: Registered 20 days ago (in this month)
        db.prepare(`
            INSERT INTO customers (id, full_name, mobile, membership_date, created_at, loyalty_tier, rfm_segment, is_active)
            VALUES (3, 'سارا رضایی', '09123333333', date('now', '-20 days'), datetime('now', '-20 days'), 'BRONZE', 'At Risk', 1)
        `).run();

        // Customer 4: Registered 120 days ago (outside this season)
        db.prepare(`
            INSERT INTO customers (id, full_name, mobile, membership_date, created_at, loyalty_tier, rfm_segment, is_active)
            VALUES (4, 'نیلوفر امینی', '09124444444', date('now', '-120 days'), datetime('now', '-120 days'), 'BRONZE', 'Lost', 1)
        `).run();

        // 5. Seed Orders for Customer 1 and 2
        // Order today
        db.prepare(`
            INSERT INTO orders (id, order_number, channel, customer_id, subtotal, discount_amount, total_amount, total_cost, status, created_at)
            VALUES (1, 'ORD-TODAY-01', 'STORE_POS', 1, 1300000, 50000, 1250000, 800000, 'COMPLETED', datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO payments (order_id, payment_method, amount)
            VALUES (1, 'CARD', 1250000)
        `).run();

        // Order 4 days ago
        db.prepare(`
            INSERT INTO orders (id, order_number, channel, customer_id, subtotal, discount_amount, total_amount, total_cost, status, created_at)
            VALUES (2, 'ORD-PAST-02', 'STORE_POS', 2, 650000, 0, 650000, 400000, 'COMPLETED', datetime('now', '-4 days'))
        `).run();
        db.prepare(`
            INSERT INTO payments (order_id, payment_method, amount)
            VALUES (2, 'CASH', 650000)
        `).run();
    });

    after(() => {
        teardownTestDb();
    });

    it('T1-DASH-1: Executive Dashboard computes new customers for period, today, and month correctly', () => {
        // Today range
        const todayData = biService.getExecutiveDashboard('TODAY');
        assert.strictEqual(todayData.customers.total_customers, 4);
        assert.strictEqual(todayData.customers.new_customers_today, 1);
        assert.strictEqual(todayData.customers.new_customers_period, 1);
        assert.strictEqual(todayData.period.newCustomers, 1);
        assert.strictEqual(todayData.today.newCustomers, 1);

        // Week range (should include Customer 1 today + Customer 2 registered 5 days ago = 2)
        const weekData = biService.getExecutiveDashboard('WEEK');
        assert.strictEqual(weekData.customers.new_customers_period, 2);
        assert.strictEqual(weekData.period.newCustomers, 2);

        // Month range (should include Customer 1 + Customer 2 + Customer 3 = 3)
        const monthData = biService.getExecutiveDashboard('MONTH');
        assert.strictEqual(monthData.customers.new_customers_period, 3);
        assert.strictEqual(monthData.period.newCustomers, 3);

        // All range (all 4 customers)
        const allData = biService.getExecutiveDashboard('ALL');
        assert.strictEqual(allData.customers.new_customers_period, 4);
    });

    it('T1-DASH-2: Generates Excel CSV with UTF-8 BOM, Persian headers, and Executive KPIs summary', () => {
        const csv = biService.generateExecutiveDashboardExcelCsv('TODAY');

        // Must start with UTF-8 BOM
        assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Microsoft Excel');

        // Check header banners
        assert.ok(csv.includes('گزارش جامع مدیریتی و داشبورد اجرایی فروشگاه آرایشی و بهداشتی'));
        assert.ok(csv.includes('بخش ۱: شاخص‌های کلیدی عملکرد اجرایی (KPIs)'));

        // Check KPI items
        assert.ok(csv.includes('فروش دوره منتخب'));
        assert.ok(csv.includes('تعداد مشتری جدید ثبت‌شده در این دوره'));
        assert.ok(csv.includes('تعداد مشتری جدید ثبت‌شده امروز'));
        assert.ok(csv.includes('تعداد مشتری جدید ثبت‌شده این ماه'));
        assert.ok(csv.includes('کل اعضای فعال باشگاه مشتریان'));
        assert.ok(csv.includes('ارزش ریالی سرمایه انبار'));
        assert.ok(csv.includes('کل نقدینگی در دسترس (بانک + صندوق)'));
    });

    it('T1-DASH-3: Excel export Section 2 lists low stock / reorder items with shortages, costs, and urgency', () => {
        const csv = biService.generateExecutiveDashboardExcelCsv('TODAY');

        // Check Section 2 title & column headers
        assert.ok(csv.includes('بخش ۲: لیست کالاهای نیازمند سفارش خرید و کسری موجودی'));
        assert.ok(csv.includes('نام کالا'));
        assert.ok(csv.includes('برند'));
        assert.ok(csv.includes('شید / رنگ'));
        assert.ok(csv.includes('بارکد'));
        assert.ok(csv.includes('کسری / تعداد سفارش پیشنهادی'));
        assert.ok(csv.includes('قیمت خرید واحد (تومان)'));
        assert.ok(csv.includes('برآورد کل هزینه خرید (تومان)'));
        assert.ok(csv.includes('سطح فوریت'));

        // Check specific reorder item data
        assert.ok(csv.includes('کرم پودر اینفالیبل ۲۴ ساعته'));
        assert.ok(csv.includes('لورآل'));
        assert.ok(csv.includes('شماره ۱۲۰ وانیلی'));
        assert.ok(csv.includes('3600523234567'));
        assert.ok(csv.includes('400000')); // Unit purchase price
    });

    it('T1-DASH-4: Excel export Section 3 details completed sales invoices with Shamsi dates and formula phone numbers', () => {
        const csv = biService.generateExecutiveDashboardExcelCsv('WEEK');

        // Check Section 3 title & column headers
        assert.ok(csv.includes('بخش ۳: جزئیات فاکتورهای فروش دوره منتخب'));
        assert.ok(csv.includes('شماره فاکتور'));
        assert.ok(csv.includes('تاریخ ثبت (شمسی)'));
        assert.ok(csv.includes('نام مشتری'));
        assert.ok(csv.includes('شماره تلفن همراه'));
        assert.ok(csv.includes('روش پرداخت'));

        // Orders from the week
        assert.ok(csv.includes('ORD-TODAY-01'));
        assert.ok(csv.includes('ORD-PAST-02'));
        assert.ok(csv.includes('زهرا کاظمی'));
        assert.ok(csv.includes('مریم حسینی'));

        // Mobile formatted with formula to preserve leading zero
        assert.ok(csv.includes('="09121111111"'));
        assert.ok(csv.includes('="09122222222"'));

        // Payment method translation
        assert.ok(csv.includes('کارتخوان (POS)'));
        assert.ok(csv.includes('نقدی'));
    });
});
