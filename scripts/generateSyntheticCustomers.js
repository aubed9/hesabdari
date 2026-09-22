/**
 * scripts/generateSyntheticCustomers.js
 * Generates realistic synthetic Iranian cosmetics retail customers.
 * 
 * Features:
 *  - 10 Realistic Lifecycle Segments:
 *      New, One-time, Repeat, Loyal, VIP, Dormant, At-risk,
 *      Wallet users, Loyalty point users, Returners (all 10 segments represented)
 *  - Realistic Persian First Names (Female & Male) and Persian Last Names
 *  - Valid unique 11-digit Iranian mobile numbers (0912..., 0935..., 0919..., etc.)
 *  - Birth dates, Iranian National IDs (کد ملی معتبر با رقم کنترل), and Shetab Bank Card numbers
 *  - Initial wallet balances backed by wallet_transactions audit rows
 *  - Loyalty points backed by loyalty_transactions audit rows
 *  - RFM metrics: recency_days, frequency_orders, monetary_total_toman stored in notes & columns
 *  - CLI execution: `node scripts/generateSyntheticCustomers.js`
 *  - Module exports: `generateCustomers(db, count = 1000)` & `generateSyntheticCustomers(db, count = 1000)`
 */

const path = require('path');
const fs = require('fs');

const FIRST_NAMES_FEMALE = [
    'سارا', 'مریم', 'فاطمه', 'زهرا', 'نگار', 'الناز', 'پریسا', 'مونا', 'مهسا', 'آیدا',
    'شیدا', 'رویا', 'ساناز', 'ترانه', 'بهاره', 'نیلوفر', 'عاطفه', 'الهام', 'مینا', 'غزل',
    'صبا', 'کیانا', 'یاسمن', 'رعنا', 'ملیکا', 'نسترن', 'مهشید', 'سمیرا', 'فرشته', 'مرجان',
    'لیلا', 'سحر', 'سپیده', 'طناز', 'ندا', 'شیرین', 'آرزو', 'پگاه', 'درسا', 'ستاره',
    'پریناز', 'هانیه', 'مائده', 'عسل', 'باران', 'آناهیتا', 'مهناز', 'شیما', 'نوشین', 'سوگل'
];

const FIRST_NAMES_MALE = [
    'علی', 'رضا', 'محمد', 'امیر', 'حسین', 'مهدی', 'سینا', 'پویا', 'آرش', 'نیما',
    'سامان', 'فرزاد', 'امید', 'کیان', 'پارسا', 'دانیال', 'بهزاد', 'کامران', 'شایان', 'مانی',
    'نوید', 'فرهاد', 'پژمان', 'مسعود', 'بابک', 'احسان', 'شاهین'
];

const LAST_NAMES = [
    'تهرانی', 'کریمی', 'رضایی', 'حسینی', 'محمدی', 'احمدی', 'مرادی', 'موسوی', 'جعفری', 'باقری',
    'صادقی', 'شجاعی', 'اکبری', 'عباسی', 'میرزایی', 'قاسمی', 'کاظمی', 'رستمی', 'حیدری', 'اسدی',
    'سلطانی', 'سلیمانی', 'طاهری', 'نوری', 'فلاح', 'یوسفی', 'نجفی', 'دهقان', 'مختاری', 'صالحی',
    'افشار', 'نادری', 'محمودی', 'ابراهیمی', 'حبیبی', 'خسروی', 'کریمیان', 'شریفی', 'امانی', 'صبوری',
    'بهرامی', 'رحیمی', 'وفایی', 'جمشیدی', 'مقدسی', 'نوروزی', 'صداقت', 'انصاری', 'فرهمند', 'نیک‌پور'
];

const MOBILE_PREFIXES = [
    '0912', '0919', '0920', '0921', '0930', '0933', '0935', '0936', '0937', '0938', '0939',
    '0901', '0902', '0903', '0990', '0991', '0992'
];

const BANK_CARD_PREFIXES = ['603799', '621986', '610433', '627412', '589210', '622106', '502229'];

const SKIN_TYPES = ['خشک', 'چرب', 'مختلط', 'نرمال', 'حساس'];
const HAIR_PREFERENCES = ['رنگ‌شده و دکلره', 'خشک و آسیب‌دیده', 'چرب و نیازمند حجم', 'کراتینه‌شده', 'معمولی', 'فر و مجعد'];

// 10 distinct realistic customer lifecycles totaling 1,000 customers
const CUSTOMER_LIFECYCLES = [
    {
        segment: 'New',
        count: 120,
        tier: 'BRONZE',
        rScore: 5,
        fScore: 1,
        mScore: 1,
        recencyMinDays: 1,
        recencyMaxDays: 7,
        ordersMin: 1,
        ordersMax: 1,
        spendMin: 200000,
        spendMax: 500000,
        walletProb: 0.05,
        walletMin: 0,
        walletMax: 50000,
        pointsMin: 10,
        pointsMax: 50
    },
    {
        segment: 'One-time',
        count: 110,
        tier: 'BRONZE',
        rScore: 3,
        fScore: 1,
        mScore: 1,
        recencyMinDays: 45,
        recencyMaxDays: 120,
        ordersMin: 1,
        ordersMax: 1,
        spendMin: 250000,
        spendMax: 600000,
        walletProb: 0.02,
        walletMin: 0,
        walletMax: 30000,
        pointsMin: 15,
        pointsMax: 60
    },
    {
        segment: 'Repeat',
        count: 130,
        tier: 'SILVER',
        rScore: 4,
        fScore: 3,
        mScore: 3,
        recencyMinDays: 15,
        recencyMaxDays: 45,
        ordersMin: 3,
        ordersMax: 5,
        spendMin: 1200000,
        spendMax: 3500000,
        walletProb: 0.35,
        walletMin: 50000,
        walletMax: 250000,
        pointsMin: 100,
        pointsMax: 350
    },
    {
        segment: 'Loyal',
        count: 130,
        tier: 'GOLD',
        rScore: 4,
        fScore: 4,
        mScore: 4,
        recencyMinDays: 7,
        recencyMaxDays: 30,
        ordersMin: 6,
        ordersMax: 12,
        spendMin: 4000000,
        spendMax: 9000000,
        walletProb: 0.65,
        walletMin: 100000,
        walletMax: 600000,
        pointsMin: 400,
        pointsMax: 1200
    },
    {
        segment: 'VIP',
        count: 80,
        tier: 'VIP',
        rScore: 5,
        fScore: 5,
        mScore: 5,
        recencyMinDays: 3,
        recencyMaxDays: 20,
        ordersMin: 12,
        ordersMax: 25,
        spendMin: 10000000,
        spendMax: 25000000,
        walletProb: 0.90,
        walletMin: 300000,
        walletMax: 2000000,
        pointsMin: 1500,
        pointsMax: 4000
    },
    {
        segment: 'Dormant',
        count: 90,
        tier: 'BRONZE',
        rScore: 1,
        fScore: 2,
        mScore: 2,
        recencyMinDays: 90,
        recencyMaxDays: 250,
        ordersMin: 2,
        ordersMax: 4,
        spendMin: 800000,
        spendMax: 2000000,
        walletProb: 0.10,
        walletMin: 0,
        walletMax: 100000,
        pointsMin: 20,
        pointsMax: 150
    },
    {
        segment: 'At-risk',
        count: 90,
        tier: 'SILVER',
        rScore: 2,
        fScore: 4,
        mScore: 4,
        recencyMinDays: 60,
        recencyMaxDays: 120,
        ordersMin: 5,
        ordersMax: 10,
        spendMin: 3000000,
        spendMax: 7000000,
        walletProb: 0.30,
        walletMin: 50000,
        walletMax: 300000,
        pointsMin: 250,
        pointsMax: 800
    },
    {
        segment: 'Wallet users',
        count: 90,
        tier: 'GOLD',
        rScore: 4,
        fScore: 3,
        mScore: 3,
        recencyMinDays: 10,
        recencyMaxDays: 40,
        ordersMin: 3,
        ordersMax: 7,
        spendMin: 2000000,
        spendMax: 6000000,
        walletProb: 1.0, // 100% have positive wallet
        walletMin: 150000,
        walletMax: 1500000,
        pointsMin: 150,
        pointsMax: 600
    },
    {
        segment: 'Loyalty point users',
        count: 90,
        tier: 'GOLD',
        rScore: 4,
        fScore: 4,
        mScore: 4,
        recencyMinDays: 5,
        recencyMaxDays: 35,
        ordersMin: 5,
        ordersMax: 12,
        spendMin: 3500000,
        spendMax: 9000000,
        walletProb: 0.50,
        walletMin: 50000,
        walletMax: 400000,
        pointsMin: 600, // High points
        pointsMax: 3000
    },
    {
        segment: 'Returners',
        count: 70,
        tier: 'SILVER',
        rScore: 3,
        fScore: 2,
        mScore: 2,
        recencyMinDays: 20,
        recencyMaxDays: 60,
        ordersMin: 2,
        ordersMax: 5,
        spendMin: 1000000,
        spendMax: 3000000,
        walletProb: 0.40,
        walletMin: 30000,
        walletMax: 200000,
        pointsMin: 50,
        pointsMax: 250
    }
];

// Helper: Generates a mathematically valid 10-digit Iranian National Code (کد ملی)
function generateIranianNationalId() {
    let digits = [];
    for (let i = 0; i < 9; i++) {
        digits.push(Math.floor(Math.random() * 10));
    }
    // Prevent invalid repetitive codes like 000000000, 111111111, etc.
    if (digits.every(d => d === digits[0])) {
        digits[0] = (digits[0] + 1) % 10;
    }
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += digits[i] * (10 - i);
    }
    const remainder = sum % 11;
    const checkDigit = remainder < 2 ? remainder : 11 - remainder;
    digits.push(checkDigit);
    return digits.join('');
}

// Helper: Generates an Iranian Shetab 16-digit bank card number
function generateShetabCardNumber() {
    const prefix = BANK_CARD_PREFIXES[Math.floor(Math.random() * BANK_CARD_PREFIXES.length)];
    let remaining = '';
    for (let i = 0; i < 10; i++) {
        remaining += Math.floor(Math.random() * 10);
    }
    const full = prefix + remaining;
    return `${full.slice(0, 4)}-${full.slice(4, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}`;
}

// Helper: Generates a random Gregorian birth date between 1970 and 2006
function generateBirthDate() {
    const year = 1970 + Math.floor(Math.random() * 36);
    const month = (1 + Math.floor(Math.random() * 12)).toString().padStart(2, '0');
    const day = (1 + Math.floor(Math.random() * 28)).toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Generates synthetic customers across 10 lifecycle segments.
 * 
 * @param {Object} [targetDb] - Database connection instance (defaults to db/database.js)
 * @param {number} [count=1000] - Total count of customers to generate
 * @returns {Object} Result summary with counts per lifecycle segment
 */
function generateCustomers(targetDb = null, count = 1000) {
    const db = targetDb || require('../db/database');
    
    // Fetch existing mobile numbers to prevent unique constraint conflicts
    const existingMobiles = new Set(
        db.prepare(`SELECT mobile FROM customers`).all().map(r => r.mobile)
    );
    const usedMobiles = new Set(existingMobiles);

    function generateUniqueMobile() {
        while (true) {
            const prefix = MOBILE_PREFIXES[Math.floor(Math.random() * MOBILE_PREFIXES.length)];
            const suffix = Math.floor(1000000 + Math.random() * 9000000).toString();
            const mob = `${prefix}${suffix}`;
            if (!usedMobiles.has(mob)) {
                usedMobiles.add(mob);
                return mob;
            }
        }
    }

    const insertCustomerStmt = db.prepare(`
        INSERT INTO customers (
            full_name, mobile, email, birth_date, membership_date,
            skin_type, hair_preferences, loyalty_tier, loyalty_points,
            wallet_balance, rfm_segment, rfm_r_score, rfm_f_score, rfm_m_score,
            clv, notes, is_active
        ) VALUES (
            @fullName, @mobile, @email, @birthDate, @membershipDate,
            @skinType, @hairPreferences, @loyaltyTier, @loyaltyPoints,
            @walletBalance, @rfmSegment, @rfmR, @rfmF, @rfmM,
            @clv, @notes, 1
        )
    `);

    const insertWalletTxStmt = db.prepare(`
        INSERT INTO wallet_transactions (
            customer_id, type, amount, description
        ) VALUES (?, 'DEPOSIT', ?, ?)
    `);

    const insertLoyaltyTxStmt = db.prepare(`
        INSERT INTO loyalty_transactions (
            customer_id, type, points, description
        ) VALUES (?, 'EARN', ?, ?)
    `);

    let createdCount = 0;
    let totalWalletDeposited = 0;
    let totalLoyaltyPointsIssued = 0;
    const segmentCounts = {};

    const executeBatch = db.transaction(() => {
        let globalIndex = 0;

        for (const cfg of CUSTOMER_LIFECYCLES) {
            // Scale count proportionally if total requested count is different from 1,000
            const segmentTarget = Math.round((cfg.count / 1000) * count);
            segmentCounts[cfg.segment] = 0;

            for (let i = 0; i < segmentTarget; i++) {
                if (createdCount >= count) break;
                globalIndex++;

                const isFemale = Math.random() < 0.85; // 85% cosmetics retail clientele
                const firstName = isFemale
                    ? FIRST_NAMES_FEMALE[Math.floor(Math.random() * FIRST_NAMES_FEMALE.length)]
                    : FIRST_NAMES_MALE[Math.floor(Math.random() * FIRST_NAMES_MALE.length)];
                const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
                const fullName = `${firstName} ${lastName}`;

                const mobile = generateUniqueMobile();
                const email = Math.random() < 0.45 ? `customer_${mobile.slice(-7)}@chmail.ir` : null;
                const birthDate = generateBirthDate();

                // Membership date: between 30 and 400 days ago
                const daysAgo = Math.floor(30 + Math.random() * 370);
                const memDate = new Date();
                memDate.setDate(memDate.getDate() - daysAgo);
                const membershipDate = memDate.toISOString().slice(0, 10);

                const skinType = SKIN_TYPES[Math.floor(Math.random() * SKIN_TYPES.length)];
                const hairPreferences = HAIR_PREFERENCES[Math.floor(Math.random() * HAIR_PREFERENCES.length)];

                // RFM calculated values
                const recencyDays = Math.floor(cfg.recencyMinDays + Math.random() * (cfg.recencyMaxDays - cfg.recencyMinDays + 1));
                const frequencyOrders = Math.floor(cfg.ordersMin + Math.random() * (cfg.ordersMax - cfg.ordersMin + 1));
                const monetaryTotalToman = Math.floor((cfg.spendMin + Math.random() * (cfg.spendMax - cfg.spendMin)) / 10000) * 10000;

                // Wallet balance
                let walletBalance = 0;
                if (Math.random() < cfg.walletProb) {
                    walletBalance = Math.floor((cfg.walletMin + Math.random() * (cfg.walletMax - cfg.walletMin)) / 10000) * 10000;
                }

                // Loyalty points
                const loyaltyPoints = Math.floor(cfg.pointsMin + Math.random() * (cfg.pointsMax - cfg.pointsMin + 1));

                // National ID & Card Number
                const nationalId = generateIranianNationalId();
                const cardNumber = generateShetabCardNumber();

                // Detailed structured notes
                const notes = `کد ملی: ${nationalId} | شماره کارت: ${cardNumber} | RFM: R=${recencyDays}d, F=${frequencyOrders}, M=${monetaryTotalToman.toLocaleString('fa-IR')}T | چرخه: ${cfg.segment}`;

                const custRes = insertCustomerStmt.run({
                    fullName,
                    mobile,
                    email,
                    birthDate,
                    membershipDate,
                    skinType,
                    hairPreferences,
                    loyaltyTier: cfg.tier,
                    loyaltyPoints,
                    walletBalance,
                    rfmSegment: cfg.segment,
                    rfmR: cfg.rScore,
                    rfmF: cfg.fScore,
                    rfmM: cfg.mScore,
                    clv: monetaryTotalToman,
                    notes
                });

                const customerId = custRes.lastInsertRowid;

                if (walletBalance > 0) {
                    insertWalletTxStmt.run(customerId, walletBalance, `شارژ اولیه کیف پول سگمنت ${cfg.segment}`);
                    totalWalletDeposited += walletBalance;
                }

                if (loyaltyPoints > 0) {
                    insertLoyaltyTxStmt.run(customerId, loyaltyPoints, `امتیازهای پیشین وفاداری سگمنت ${cfg.segment}`);
                    totalLoyaltyPointsIssued += loyaltyPoints;
                }

                createdCount++;
                segmentCounts[cfg.segment]++;
            }
        }
    });

    executeBatch();

    return {
        success: true,
        createdCount,
        segmentCounts,
        totalWalletDeposited,
        totalLoyaltyPointsIssued,
        totalCustomersInDb: db.prepare(`SELECT count(*) as c FROM customers`).get().c
    };
}

// CLI Execution support
if (require.main === module) {
    const isProduction = !process.env.DB_PATH && !process.argv.includes('--allow-production');
    if (isProduction) {
        console.warn('⚠️ جهت اجرای مستقیم روی دیتابیس فعلی از فلگ --allow-production استفاده کنید:');
        console.warn('node scripts/generateSyntheticCustomers.js --allow-production');
        process.exit(0);
    }
    console.log('⚡ Generating 1,000 synthetic customers across 10 lifecycles...');
    const result = generateCustomers();
    console.log('✅ Generation completed successfully:');
    console.log('   Total Created:', result.createdCount);
    console.log('   Segments Distribution:', JSON.stringify(result.segmentCounts, null, 2));
    console.log('   Total Wallet Deposited:', result.totalWalletDeposited.toLocaleString(), 'Toman');
    console.log('   Total Loyalty Points Issued:', result.totalLoyaltyPointsIssued.toLocaleString());
    console.log('   Total Customers in DB:', result.totalCustomersInDb);
}

module.exports = {
    generateCustomers,
    generateSyntheticCustomers: generateCustomers, // Backwards-compatible alias
    CUSTOMER_LIFECYCLES,
    FIRST_NAMES_FEMALE,
    FIRST_NAMES_MALE,
    LAST_NAMES,
    generateIranianNationalId,
    generateShetabCardNumber
};
