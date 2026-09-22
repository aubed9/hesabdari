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
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, birth_date, is_active)
            VALUES (101, 'C-CHAMP', 'مشتری قهرمان ۱', '09121111111', 'VIP', 300000, 500, 'Champions', '1992-09-12', 1)
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

        // 5. Customer with birthday in Aban (Month 8)
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, birth_date, is_active)
            VALUES (105, 'C-ABAN', 'سحر رادمنش (آبان)', '09125555555', 'GOLD', 120000, 80, 'Loyal', '1995-10-25', 1)
        `).run();

        // 6. Another customer with birthday in Shahrivar (Month 6)
        db.prepare(`
            INSERT INTO customers (id, referral_code, full_name, mobile, loyalty_tier, wallet_balance, loyalty_points, rfm_segment, birth_date, is_active)
            VALUES (106, 'C-SHAH', 'پریا کمالی (شهریور)', '09126666666', 'VIP', 250000, 200, 'Champions', '1998-09-08', 1)
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

    it('T1-SEG-7: Preserves leading zero in phone numbers for Excel with formula text format and supplies panel-compatible column', () => {
        const exportRes = crmService.generateSegmentExcelCsv('high_basket_regular');
        // Customer 101 has mobile '09121111111'
        // In CSV for Excel, it must be formatted as ="09121111111" so Excel does not strip the leading zero
        assert.ok(exportRes.csv.includes('="09121111111"'), 'Must include phone number with leading 0 formatted as Excel formula string');
        assert.ok(exportRes.csv.includes('"9121111111"'), 'Must also include phone without leading 0 for panels requiring 9...');

        // Verify Faraz SMS export also preserves leading zero
        const farazCsv = crmService.generateFarazSmsCsv([{
            id: 101,
            mobile: '09121111111',
            firstName: 'مونا',
            lastName: 'قریشی',
            fullName: 'مونا قریشی',
            groupName: 'قهرمانان'
        }]);
        assert.ok(farazCsv.includes('="09121111111"'), 'Faraz SMS CSV must include leading zero formula');
        assert.ok(farazCsv.includes('"9121111111"'), 'Faraz SMS CSV must include without-zero column');
    });

    it('T1-SEG-8: Converts birth dates to Shamsi Jalali format and handles Shamsi input parsing', () => {
        const dateUtils = require('../../utils/dateUtils');
        
        // 1. Gregorian to Jalali conversion
        assert.equal(dateUtils.toJalaliDateString('1992-09-12'), '1371/06/21');
        assert.equal(dateUtils.toJalaliFriendly('1992-09-12'), '۲۱ شهریور ۱۳۷۱');

        // 2. Jalali input parsing back to Gregorian (supports both Persian and English digits)
        assert.equal(dateUtils.parseJalaliInputToGregorian('1371/06/21'), '1992-09-12');
        assert.equal(dateUtils.parseJalaliInputToGregorian('۱۳۷۱/۰۶/۲۱'), '1992-09-12');

        // 3. Segment Excel Export contains Shamsi birth date column & value
        const exportRes = crmService.generateSegmentExcelCsv('high_basket_regular');
        assert.ok(exportRes.csv.includes('تاریخ تولد (شمسی)'), 'CSV must include Shamsi birth date header');
        assert.ok(exportRes.csv.includes('"1371/06/21"'), 'CSV must contain customer 101 Shamsi birth date');

        // 4. Customer Profile returns Shamsi birth date and friendly format
        const profile = crmService.getCustomerProfile(101);
        assert.equal(profile.birth_date_shamsi, '1371/06/21');
        assert.equal(profile.birth_date_friendly, '۲۱ شهریور ۱۳۷۱');

        // 5. Faraz SMS Contacts & CSV includes Shamsi birth date
        const farazData = crmService.getFarazSmsContacts({ tier: 'VIP' });
        const c101 = farazData.contacts.find(c => c.id === 101);
        assert.ok(c101, 'Customer 101 must be found in VIP filter');
        assert.equal(c101.birthDate, '1371/06/21');
        assert.equal(c101.birthDateFriendly, '۲۱ شهریور ۱۳۷۱');

        const farazCsv = crmService.generateFarazSmsCsv(farazData.contacts);
        assert.ok(farazCsv.includes('تاریخ تولد (شمسی)'), 'Faraz CSV must include Shamsi birth date header');
        assert.ok(farazCsv.includes('"1371/06/21"'), 'Faraz CSV must include Shamsi birth date value');
    });

    it('T1-SEG-9: Accurately filters customers by registered Shamsi birth month (getUpcomingBirthdays)', () => {
        // Month 6 (شهریور): Customer 101 (21 Shahrivar) and 106 (17 Shahrivar)
        const shahrivarList = crmService.getUpcomingBirthdays(6);
        assert.ok(Array.isArray(shahrivarList));
        const sIds = shahrivarList.map(c => c.id);
        assert.ok(sIds.includes(101), 'Customer 101 must be in Shahrivar birthdays');
        assert.ok(sIds.includes(106), 'Customer 106 must be in Shahrivar birthdays');
        assert.ok(!sIds.includes(105), 'Customer 105 (Aban) must NOT be in Shahrivar birthdays');

        // Verify sorting by day of month (17th before 21st)
        const idx106 = shahrivarList.findIndex(c => c.id === 106);
        const idx101 = shahrivarList.findIndex(c => c.id === 101);
        assert.ok(idx106 < idx101, 'Customer born on 17th must appear before customer born on 21st');

        // Month 8 (آبان): Customer 105 (3 Aban)
        const abanList = crmService.getUpcomingBirthdays(8);
        const aIds = abanList.map(c => c.id);
        assert.ok(aIds.includes(105), 'Customer 105 must be in Aban birthdays');
        assert.ok(!aIds.includes(101), 'Customer 101 (Shahrivar) must NOT be in Aban birthdays');
        assert.ok(!aIds.includes(106), 'Customer 106 (Shahrivar) must NOT be in Aban birthdays');
        assert.equal(abanList[0].birth_month_name, 'آبان');
        assert.equal(abanList[0].birth_day, 3);
    });

    it('T1-SEG-10: Generates Excel CSV for Shamsi month birthdays with UTF-8 BOM, Persian headers, and formula phone format', () => {
        const bdayExcel = crmService.generateBirthdaysExcelCsv(6);
        assert.ok(bdayExcel.csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
        assert.ok(bdayExcel.filename.includes('متولدین_شهریور'), `Filename must include month name: ${bdayExcel.filename}`);
        assert.equal(bdayExcel.month, 6);
        assert.equal(bdayExcel.monthName, 'شهریور');
        assert.ok(bdayExcel.count >= 2);

        // Required Persian headers
        assert.ok(bdayExcel.csv.includes('کد مشتری'));
        assert.ok(bdayExcel.csv.includes('نام و نام خانوادگی'));
        assert.ok(bdayExcel.csv.includes('شماره همراه (اکسل)'));
        assert.ok(bdayExcel.csv.includes('شماره بدون صفر (ویژه پنل پیامک)'));
        assert.ok(bdayExcel.csv.includes('تاریخ تولد شمسی'));
        assert.ok(bdayExcel.csv.includes('روز تولد'));
        assert.ok(bdayExcel.csv.includes('ماه تولد'));
        assert.ok(bdayExcel.csv.includes('سن تقریبی (سال)'));

        // Values formatting
        assert.ok(bdayExcel.csv.includes('="09121111111"'), 'Must format phone as Excel formula string ="09..."');
        assert.ok(bdayExcel.csv.includes('"9121111111"'), 'Must include phone without leading zero for SMS panels');
        assert.ok(bdayExcel.csv.includes('"1371/06/21"'), 'Must include exact Shamsi birth date');
        assert.ok(bdayExcel.csv.includes('"شهریور"'), 'Must include Shamsi month name');

        // Verify segment export integration
        const segBday = crmService.generateSegmentExcelCsv('birthdays');
        assert.ok(segBday.csv.startsWith('\uFEFF'));
        assert.ok(segBday.filename.includes('متولدین'));
    });
});
