const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { setupTestDb, teardownTestDb } = require('../helpers/testDb');

describe('Tier 1: Customer Segmentation & Excel Export Suite', () => {
    let db, crmService;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;
        crmService = require('../../services/crmService');

        // Seed diverse test customers
        // 1. Regular & High Basket (Champions)
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, is_active)
            VALUES (101, 'C-CHAMP', 'مشتری قهرمان ۱', '09121111111', 'VIP', 300000, 500, 'Champions', 1)
        `).run();

        // 2. Regular Buyer (Loyal)
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, is_active)
            VALUES (102, 'C-LOYAL', 'مشتری وفادار ۲', '09122222222', 'SILVER', 0, 150, 'Loyal', 1)
        `).run();

        // 3. Absent > 35 days (At Risk)
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, is_active)
            VALUES (103, 'C-RISK', 'مشتری در معرض ریزش ۳', '09123333333', 'BRONZE', 0, 50, 'At Risk', 1)
        `).run();

        // 4. New Customer
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, is_active)
            VALUES (104, 'C-NEW', 'مشتری جدید ۴', '09124444444', 'BRONZE', 50000, 20, 'NEW', 1)
        `).run();

        // Add orders with different dates to verify recency calculations
        // Order for 101: 5 days ago
        db.prepare(`
            INSERT INTO orders (id, order_number, customer_id, total_amount, payment_status, status, created_at)
            VALUES (1001, 'ORD-101', 101, 5000000, 'PAID', 'COMPLETED', datetime('now', '-5 days'))
        `).run();
        db.prepare(`
            INSERT INTO orders (id, order_number, customer_id, total_amount, payment_status, status, created_at)
            VALUES (1002, 'ORD-101-2', 101, 6000000, 'PAID', 'COMPLETED', datetime('now', '-2 days'))
        `).run();

        // Order for 102: 15 days ago
        db.prepare(`
            INSERT INTO orders (id, order_number, customer_id, total_amount, payment_status, status, created_at)
            VALUES (1003, 'ORD-102', 102, 1200000, 'PAID', 'COMPLETED', datetime('now', '-15 days'))
        `).run();
        db.prepare(`
            INSERT INTO orders (id, order_number, customer_id, total_amount, payment_status, status, created_at)
            VALUES (1004, 'ORD-102-2', 102, 1500000, 'PAID', 'COMPLETED', datetime('now', '-10 days'))
        `).run();

        // Order for 103: 45 days ago (Absent > 35 days!)
        db.prepare(`
            INSERT INTO orders (id, order_number, customer_id, total_amount, payment_status, status, created_at)
            VALUES (1005, 'ORD-103', 103, 800000, 'PAID', 'COMPLETED', datetime('now', '-45 days'))
        `).run();
    });

    after(() => {
        teardownTestDb();
    });

    it('T1-SEG-1: Identifies High Basket & Regular buyers (خرید منظم و سبد بالا)', () => {
        const res = crmService.getSegmentCustomers('high_basket_regular');
        assert.ok(res.count >= 1);
        const champ = res.customers.find(c => c.id === 101);
        assert.ok(champ, 'Customer 101 must be in high basket regular segment');
        assert.equal(champ.rfm_segment, 'Champions');
        assert.ok(champ.total_spent >= 10000000);
    });

    it('T1-SEG-2: Identifies Regular buyers with continuous repeat purchases (تکرار خرید مداوم)', () => {
        const res = crmService.getSegmentCustomers('regular_buyers');
        assert.ok(res.count >= 1);
        const loyal = res.customers.find(c => c.id === 102);
        assert.ok(loyal, 'Customer 102 must be in regular buyers segment');
        assert.ok(loyal.total_orders_count >= 2);
    });

    it('T1-SEG-3: Identifies Absent customers with no purchase in over 35 days (عدم مراجعه بالای ۳۵ روز)', () => {
        const res = crmService.getSegmentCustomers('absent_35_days');
        assert.ok(res.count >= 1);
        const risk = res.customers.find(c => c.id === 103);
        assert.ok(risk, 'Customer 103 must be in absent 35 days segment');
        assert.ok(risk.days_since_last_order >= 35, `Days since last order should be >= 35, got: ${risk.days_since_last_order}`);
    });

    it('T1-SEG-4: Identifies New customers (مشتریان جدید)', () => {
        const res = crmService.getSegmentCustomers('new_customers');
        assert.ok(res.count >= 1);
        const newCust = res.customers.find(c => c.id === 104);
        assert.ok(newCust, 'Customer 104 must be in new customers segment');
        assert.equal(newCust.total_orders_count, 0);
    });

    it('T1-SEG-5: Identifies Customers with Wallet Balance (دارای مانده کیف پول)', () => {
        const res = crmService.getSegmentCustomers('wallet_balance');
        assert.ok(res.count >= 2);
        const ids = res.customers.map(c => c.id);
        assert.ok(ids.includes(101));
        assert.ok(ids.includes(104));
        assert.ok(!ids.includes(102), 'Customer 102 with 0 wallet balance must be excluded');
    });

    it('T1-SEG-6: Generates Excel-compatible CSV with UTF-8 BOM and Persian headers', () => {
        const exportRes = crmService.generateSegmentExcelCsv('high_basket_regular');
        assert.ok(exportRes.csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Microsoft Excel');
        assert.ok(exportRes.csv.includes('کد اشتراک'));
        assert.ok(exportRes.csv.includes('نام و نام خانوادگی'));
        assert.ok(exportRes.csv.includes('شماره همراه'));
        assert.ok(exportRes.csv.includes('مانده کیف پول (تومان)'));
        assert.ok(exportRes.csv.includes('مشتری قهرمان ۱'));
        assert.ok(exportRes.filename.includes('high_basket_regular'));
    });
});
