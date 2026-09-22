/**
 * tests/tier1/customer_generator_persian_search.test.js
 * Verification Test Suite for:
 * 1. 1,000 Realistic Persian Synthetic Customer Generator across 10 Lifecycles (R2)
 * 2. Persian Character Search Normalization (Arabic Yeh/Kaf to Persian: ي -> ی, ك -> ک)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestDb, teardownTestDb } = require('../helpers/testDb');
const { generateCustomers, CUSTOMER_LIFECYCLES } = require('../../scripts/generateSyntheticCustomers');
const crmService = require('../../services/crmService');
const { normalizePersian, validateIranianMobile } = require('../../utils/textUtils');

describe('Tier 1: Synthetic Customer Generator & Persian Search Normalization', () => {
    let db, fixtures;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T1-GEN-1: generateCustomers produces 1,000 unique customers across all 10 lifecycles', () => {
        const result = generateCustomers(db, 1000);
        assert.equal(result.success, true);
        assert.ok(result.createdCount >= 1000, `Expected at least 1,000 customers, got ${result.createdCount}`);

        // Verify all 10 segments are represented
        const expectedSegments = [
            'New', 'One-time', 'Repeat', 'Loyal', 'VIP',
            'Dormant', 'At-risk', 'Wallet users', 'Loyalty point users', 'Returners'
        ];

        for (const seg of expectedSegments) {
            const countInResult = result.segmentCounts[seg];
            assert.ok(countInResult && countInResult > 0, `Segment "${seg}" must be represented (count: ${countInResult})`);

            const countInDb = db.prepare(`SELECT count(*) as c FROM customers WHERE rfm_segment = ?`).get(seg).c;
            assert.ok(countInDb > 0, `Database must contain customers for segment "${seg}"`);
        }

        // Verify unique mobile numbers
        const totalCustomers = db.prepare(`SELECT count(*) as c FROM customers`).get().c;
        const uniqueMobiles = db.prepare(`SELECT count(DISTINCT mobile) as c FROM customers`).get().c;
        assert.equal(totalCustomers, uniqueMobiles, 'All mobile numbers must be 100% unique');

        // Verify valid Iranian mobile format for all generated customers
        const allMobiles = db.prepare(`SELECT mobile FROM customers`).all();
        for (const { mobile } of allMobiles) {
            assert.match(mobile, /^09\d{9}$/, `Mobile ${mobile} must be an 11-digit Iranian number starting with 09`);
        }

        // Verify realistic Persian names
        const sampleCustomers = db.prepare(`SELECT full_name, notes, wallet_balance, loyalty_points FROM customers LIMIT 50`).all();
        for (const c of sampleCustomers) {
            assert.ok(c.full_name && c.full_name.trim().length > 3, 'Customer name must be valid');
            assert.match(c.notes, /کد ملی: \d{10}/, 'Customer notes must contain valid Iranian National ID');
            assert.match(c.notes, /شماره کارت: \d{4}-\d{4}-\d{4}-\d{4}/, 'Customer notes must contain Shetab card number');
        }

        // Verify wallet transactions were inserted for wallet users
        const walletTxCount = db.prepare(`SELECT count(*) as c FROM wallet_transactions`).get().c;
        assert.ok(walletTxCount > 0, 'Wallet transactions must be recorded for customers with wallet balance');

        // Verify loyalty transactions were inserted for loyalty point users
        const loyaltyTxCount = db.prepare(`SELECT count(*) as c FROM loyalty_transactions`).get().c;
        assert.ok(loyaltyTxCount > 0, 'Loyalty transactions must be recorded for customers with loyalty points');
    });

    test('T1-SRCH-1: Persian search normalization handles Arabic Kaf (ك) and Arabic Yeh (ي)', () => {
        // Clear any existing customers for clean isolation
        db.prepare(`DELETE FROM customers`).run();

        // Seed customer with Persian Kaf (ک) and Persian Yeh (ی)
        db.prepare(`
            INSERT INTO customers (full_name, mobile, loyalty_tier, wallet_balance, is_active)
            VALUES ('سارا کریمی', '09121112233', 'GOLD', 150000, 1)
        `).run();

        // Seed customer with Persian Yeh (ی)
        db.prepare(`
            INSERT INTO customers (full_name, mobile, loyalty_tier, wallet_balance, is_active)
            VALUES ('علی رضایی', '09123334455', 'VIP', 500000, 1)
        `).run();

        // Seed customer with Persian Kaf (ک)
        db.prepare(`
            INSERT INTO customers (full_name, mobile, loyalty_tier, wallet_balance, is_active)
            VALUES ('کاظم اکبری', '09125556677', 'SILVER', 0, 1)
        `).run();

        // 1. Search with Arabic Kaf 'كريمي' -> Must return 'سارا کریمی'
        const resultsKaf = crmService.searchCustomers('كريمي');
        assert.ok(resultsKaf.length >= 1, 'Search with Arabic Kaf (كريمي) must find Persian (سارا کریمی)');
        assert.equal(resultsKaf[0].full_name, 'سارا کریمی');

        // 2. Search with Persian Kaf 'کریمی' -> Must return 'سارا کریمی'
        const resultsKafFa = crmService.searchCustomers('کریمی');
        assert.ok(resultsKafFa.length >= 1, 'Search with Persian Kaf (کریمی) must find (سارا کریمی)');
        assert.equal(resultsKafFa[0].full_name, 'سارا کریمی');

        // 3. Search with Arabic Yeh 'علي' -> Must return 'علی رضایی'
        const resultsYeh = crmService.searchCustomers('علي');
        assert.ok(resultsYeh.length >= 1, 'Search with Arabic Yeh (علي) must find Persian (علی رضایی)');
        assert.equal(resultsYeh[0].full_name, 'علی رضایی');

        // 4. Search with Persian Yeh 'علی' -> Must return 'علی رضایی'
        const resultsYehFa = crmService.searchCustomers('علی');
        assert.ok(resultsYehFa.length >= 1, 'Search with Persian Yeh (علی) must find (علی رضایی)');
        assert.equal(resultsYehFa[0].full_name, 'علی رضایی');

        // 5. Search with Arabic Kaf 'كاظم' -> Must return 'کاظم اکبری'
        const resultsKazem = crmService.searchCustomers('كاظم');
        assert.ok(resultsKazem.length >= 1, 'Search with Arabic Kaf (كاظم) must find (کاظم اکبری)');
        assert.equal(resultsKazem[0].full_name, 'کاظم اکبری');

        // 6. getCustomers(search) also respects Persian normalization
        const getCustResults = crmService.getCustomers('كريمي');
        assert.ok(getCustResults.length >= 1, 'crmService.getCustomers with Arabic Kaf must find Persian name');
        assert.equal(getCustResults[0].full_name, 'سارا کریمی');
    });

    test('T1-SRCH-2: Client-side text normalization function verifies bidirectional equivalence', () => {
        assert.equal(normalizePersian('كريمي'), 'کریمی', 'Arabic Kaf and Yeh must normalize to Persian');
        assert.equal(normalizePersian('علي'), 'علی', 'Arabic Yeh must normalize to Persian');
        assert.equal(normalizePersian('مكياج'), 'مکیاج', 'Arabic Kaf in body must normalize to Persian');
        assert.equal(normalizePersian('فاطمة'), 'فاطمه', 'Arabic Teh Marbuta must normalize to Heh');
        assert.equal(normalizePersian('مؤمن'), 'مومن', 'Arabic Waw with Hamza must normalize');
    });

    test('T1-SRCH-3: Mobile number search normalization handles partial and formatted lookups', () => {
        db.prepare(`
            INSERT INTO customers (full_name, mobile, is_active)
            VALUES ('سارا کریمی', '09121112233', 1)
        `).run();
        const results = crmService.searchCustomers('1112233');
        assert.ok(results.length >= 1, 'Phone search must match partial numbers');
        assert.equal(results[0].full_name, 'سارا کریمی');
    });
});
