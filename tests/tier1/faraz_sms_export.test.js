/**
 * Tier 1: Faraz SMS & IPPanel Phonebook Extraction, Filtering & Export Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedCustomer
} = require('../helpers/testDb');

const crmService = require('../../services/crmService');
const { normalizeIranianMobile } = require('../../utils/textUtils');

describe('Tier 1: Faraz SMS & Bulk Phone Extraction Suite', () => {
    let db;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;

        // Seed diverse test customers with various numbers, tiers, wallet balances
        seedCustomer(db, {
            fullName: 'سارا علوی',
            mobile: '+989121112233',
            loyaltyTier: 'VIP',
            walletBalance: 150000,
            loyaltyPoints: 300
        });

        seedCustomer(db, {
            fullName: 'مهسا کاظمی',
            mobile: '0912-222-3344',
            loyaltyTier: 'GOLD',
            walletBalance: 0,
            loyaltyPoints: 120
        });

        seedCustomer(db, {
            fullName: 'نیلوفر راد',
            mobile: '09353334455',
            loyaltyTier: 'SILVER',
            walletBalance: 50000,
            loyaltyPoints: 40
        });

        seedCustomer(db, {
            fullName: 'شماره نامعتبر',
            mobile: '02188776655', // Landline, not mobile
            loyaltyTier: 'BRONZE',
            walletBalance: 0,
            loyaltyPoints: 0
        });
    });

    after(() => {
        teardownTestDb();
    });

    test('T1-SMS-1: Iranian mobile numbers are strictly normalized to 09xxxxxxxxx', () => {
        assert.equal(normalizeIranianMobile('+989121112233'), '09121112233');
        assert.equal(normalizeIranianMobile('00989121112233'), '09121112233');
        assert.equal(normalizeIranianMobile('989121112233'), '09121112233');
        assert.equal(normalizeIranianMobile(' 0912-222-3344 '), '09122223344');
        assert.equal(normalizeIranianMobile('۰۹۳۵۳۳۳۴۴۵۵'), '09353334455');
    });

    test('T1-SMS-2: Filter contacts by Tier (VIP) isolates only matching customers', () => {
        const res = crmService.getFarazSmsContacts({ tier: 'VIP' });
        assert.ok(res.totalValid >= 1);
        for (const c of res.contacts) {
            assert.equal(c.tier, 'VIP');
            assert.match(c.mobile, /^09\d{9}$/);
        }
    });

    test('T1-SMS-3: Filter by Wallet Balance > 0 only returns customers with positive balance', () => {
        const res = crmService.getFarazSmsContacts({ hasWalletBalance: true });
        assert.ok(res.totalValid >= 1);
        for (const c of res.contacts) {
            assert.ok(c.walletBalance > 0);
            assert.match(c.mobile, /^09\d{9}$/);
        }
    });

    test('T1-SMS-4: Non-mobile phone numbers (e.g. landlines) are excluded from export', () => {
        const res = crmService.getFarazSmsContacts({});
        for (const c of res.contacts) {
            assert.notEqual(c.mobile, '02188776655');
            assert.match(c.mobile, /^09\d{9}$/);
        }
    });

    test('T1-SMS-5: CSV generation includes UTF-8 BOM, required Faraz SMS headers, and custom group name', () => {
        const res = crmService.getFarazSmsContacts({ groupName: 'کمپین تست بلک فرایدی' });
        const csv = crmService.generateFarazSmsCsv(res.contacts);

        // UTF-8 BOM must be first character
        assert.equal(csv.charCodeAt(0), 0xFEFF);

        // Verify headers
        assert.ok(csv.includes('شماره موبایل'));
        assert.ok(csv.includes('نام'));
        assert.ok(csv.includes('نام خانوادگی'));
        assert.ok(csv.includes('گروه'));
        assert.ok(csv.includes('مانده کیف پول (تومان)'));

        // Verify custom group name is present in rows
        assert.ok(csv.includes('کمپین تست بلک فرایدی'));
    });
});
