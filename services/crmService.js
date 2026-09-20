// CRM, Customer 360, Loyalty, RFM & Wallet Service
const db = require('../db/database');
const { normalizeIranianMobile } = require('../utils/textUtils');

const crmService = {
    // Get all customers with RFM and summary metrics
    getCustomers() {
        return db.prepare(`
            SELECT 
                c.*,
                COUNT(o.id) AS total_orders_count,
                COALESCE(SUM(o.total_amount), 0) AS total_spent,
                COALESCE(AVG(o.total_amount), 0) AS average_order_value,
                MAX(o.created_at) AS last_order_date,
                CAST((julianday('now') - julianday(MAX(o.created_at))) AS INTEGER) AS days_since_last_order
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id AND o.status = 'COMPLETED'
            WHERE c.is_active = 1
            GROUP BY c.id
            ORDER BY total_spent DESC
        `).all();
    },

    // Customer 360 Profile
    getCustomerProfile(customerId) {
        const customer = db.prepare(`
            SELECT 
                c.*,
                COUNT(o.id) AS total_orders_count,
                COALESCE(SUM(o.total_amount), 0) AS total_spent,
                COALESCE(AVG(o.total_amount), 0) AS average_order_value,
                MAX(o.created_at) AS last_order_date,
                CAST((julianday('now') - julianday(MAX(o.created_at))) AS INTEGER) AS days_since_last_order
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id AND o.status = 'COMPLETED'
            WHERE c.id = ?
            GROUP BY c.id
        `).get(customerId);

        if (!customer) return null;

        // Order history
        customer.orders = db.prepare(`
            SELECT id, order_number, total_amount, payment_status, created_at
            FROM orders
            WHERE customer_id = ?
            ORDER BY created_at DESC
        `).all(customerId);

        // Shades purchased (خیلی مهم برای مغازه لوازم آرایشی تا بداند مشتری چه شیدهایی می‌خرد!)
        customer.purchasedShades = db.prepare(`
            SELECT DISTINCT 
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                pv.color_hex,
                MAX(o.created_at) AS last_bought_date
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN product_variants pv ON oi.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            WHERE o.customer_id = ? AND pv.shade IS NOT NULL
            GROUP BY pv.id
            ORDER BY last_bought_date DESC
        `).all(customerId);

        // Favorite brand
        const favBrand = db.prepare(`
            SELECT b.name AS brand_name, COUNT(oi.id) AS items_count
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN product_variants pv ON oi.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            WHERE o.customer_id = ?
            GROUP BY b.id
            ORDER BY items_count DESC
            LIMIT 1
        `).get(customerId);
        customer.favoriteBrand = favBrand ? favBrand.brand_name : 'هنوز مشخص نشده';

        // Wishlist
        customer.wishlist = db.prepare(`
            SELECT 
                w.id AS wishlist_id,
                pv.id AS variant_id,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                pv.selling_price,
                COALESCE(SUM(ib.quantity), 0) AS in_stock_qty
            FROM wishlists w
            JOIN product_variants pv ON w.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE w.customer_id = ?
            GROUP BY pv.id
        `).all(customerId);

        // Loyalty & Wallet logs
        customer.loyaltyLogs = db.prepare(`SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 20`).all(customerId);
        customer.walletLogs = db.prepare(`SELECT * FROM wallet_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 20`).all(customerId);

        return customer;
    },

    // Convert Loyalty Points to Wallet Balance
    convertPointsToWallet(customerId, pointsToConvert) {
        const cust = db.prepare(`SELECT loyalty_points, wallet_balance FROM customers WHERE id = ?`).get(customerId);
        if (!cust || cust.loyalty_points < pointsToConvert) {
            throw new Error('امتیاز کافی برای تبدیل وجود ندارد');
        }

        // Conversion Rule: Every 10 points = 5,000 Tomans
        const cashValue = (pointsToConvert / 10) * 5000;

        db.transaction(() => {
            db.prepare(`
                UPDATE customers 
                SET loyalty_points = loyalty_points - ?,
                    wallet_balance = wallet_balance + ?
                WHERE id = ?
            `).run(pointsToConvert, cashValue, customerId);

            db.prepare(`
                INSERT INTO loyalty_transactions (customer_id, type, points, description)
                VALUES (?, 'REDEEM', ?, 'تبدیل امتیاز به اعتبار کیف پول')
            `).run(customerId, -pointsToConvert);

            db.prepare(`
                INSERT INTO wallet_transactions (customer_id, type, amount, description)
                VALUES (?, 'DEPOSIT', ?, 'شارژ کیف پول از محل تبدیل امتیاز وفاداری')
            `).run(customerId, cashValue);

            // Double-Entry Accounting:
            // Dr 603 (Marketing & Loyalty Promotion Expense)
            // Cr 205 (Customer Wallet Liability)
            const accLoyaltyExp = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '603'`).get().id;
            const accWalletLiab = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '205'`).get() || { id: accLoyaltyExp };

            const entryNumber = `JE-LRED-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, DATE('now'), ?, 'LOYALTY_REDEMPTION', ?, 1, 1)
            `).run(entryNumber, `تبدیل ${pointsToConvert} امتیاز به کیف پول مشتری`, customerId);
            const jId = jRes.lastInsertRowid;

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, 'هزینه ارتقای وفاداری مشتریان')
            `).run(jId, accLoyaltyExp, cashValue);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, 'ایجاد تعهد بابت موجودی کیف پول مشتری')
            `).run(jId, accWalletLiab.id, cashValue);
        })();

        return { convertedPoints: pointsToConvert, cashValue };
    },

    // RFM Matrix Segmentation Calculator
    recalculateRFM() {
        const customers = db.prepare(`
            SELECT 
                c.id,
                CAST((julianday('now') - julianday(COALESCE(MAX(o.created_at), c.membership_date))) AS INTEGER) AS recency_days,
                COUNT(o.id) AS frequency,
                COALESCE(SUM(o.total_amount), 0) AS monetary
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id AND o.status = 'COMPLETED'
            WHERE c.is_active = 1
            GROUP BY c.id
        `).all();

        const updateStmt = db.prepare(`
            UPDATE customers 
            SET rfm_segment = ?,
                rfm_r_score = ?,
                rfm_f_score = ?,
                rfm_m_score = ?
            WHERE id = ?
        `);

        db.transaction(() => {
            for (const c of customers) {
                // R score (1 to 5)
                let r = 1;
                if (c.recency_days <= 15) r = 5;
                else if (c.recency_days <= 30) r = 4;
                else if (c.recency_days <= 60) r = 3;
                else if (c.recency_days <= 90) r = 2;

                // F score (1 to 5)
                let f = 1;
                if (c.frequency >= 6) f = 5;
                else if (c.frequency >= 4) f = 4;
                else if (c.frequency >= 2) f = 3;
                else if (c.frequency >= 1) f = 2;

                // M score (1 to 5)
                let m = 1;
                if (c.monetary >= 15000000) m = 5;
                else if (c.monetary >= 8000000) m = 4;
                else if (c.monetary >= 3000000) m = 3;
                else if (c.monetary >= 1000000) m = 2;

                let segment = 'New';
                if (r >= 4 && f >= 4 && m >= 4) segment = 'Champions';
                else if (r >= 3 && f >= 3) segment = 'Loyal';
                else if (r <= 2 && f >= 3) segment = 'At Risk';
                else if (r === 1 && f <= 2) segment = 'Lost';
                else if (r >= 4 && f <= 2) segment = 'Potential Loyal';
                else if (m >= 4) segment = 'VIP';

                updateStmt.run(segment, r, f, m, c.id);
            }
        })();

        return { success: true, processedCount: customers.length };
    },

    // Customers with Birthday in Current Month (for Promo Campaign)
    getUpcomingBirthdays() {
        return db.prepare(`
            SELECT 
                id, full_name, mobile, birth_date, loyalty_tier, wallet_balance,
                STRFTIME('%m', birth_date) AS birth_month,
                STRFTIME('%d', birth_date) AS birth_day
            FROM customers
            WHERE is_active = 1 AND birth_date IS NOT NULL
              AND STRFTIME('%m', birth_date) = STRFTIME('%m', 'now')
            ORDER BY birth_day ASC
        `).all();
    },

    // Create New Customer
    createCustomer({ fullName, mobile, email, nationalCode, birthDate, skinType, hairType, loyaltyTier = 'BRONZE', notes = '' }) {
        if (!fullName || !mobile) throw new Error('نام و شماره موبایل الزامی است');
        const cleanMobile = mobile.trim();
        const existing = db.prepare(`SELECT id FROM customers WHERE mobile = ?`).get(cleanMobile);
        if (existing) throw new Error('مشتری با این شماره موبایل قبلاً ثبت شده است');

        const custCode = 'CUST-' + Math.floor(10000 + Math.random() * 90000);
        const res = db.prepare(`
            INSERT INTO customers (
                referral_code, full_name, mobile, email,
                birth_date, skin_type, hair_preferences, loyalty_tier, loyalty_points,
                wallet_balance, notes, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 50, 0, ?, 1)
        `).run(custCode, fullName.trim(), cleanMobile, email || null, birthDate || null, skinType || null, hairType || null, loyaltyTier, notes);

        return { id: res.lastInsertRowid, customerCode: custCode };
    },

    // Update Customer
    updateCustomer(id, data) {
        const { fullName, mobile, email, birthDate, skinType, hairType, loyaltyTier, notes, loyaltyPoints } = data;
        db.prepare(`
            UPDATE customers
            SET full_name = COALESCE(?, full_name),
                mobile = COALESCE(?, mobile),
                email = COALESCE(?, email),
                birth_date = COALESCE(?, birth_date),
                skin_type = COALESCE(?, skin_type),
                hair_preferences = COALESCE(?, hair_preferences),
                loyalty_tier = COALESCE(?, loyalty_tier),
                loyalty_points = COALESCE(?, loyalty_points),
                notes = COALESCE(?, notes)
            WHERE id = ?
        `).run(fullName, mobile, email, birthDate, skinType, hairType, loyaltyTier, loyaltyPoints, notes, id);

        return { success: true };
    },

    // Adjust Wallet Balance (با تضمین نامنفی بودن، علامت‌گذاری صحیح در معین تراکنش‌ها، و صدور سند دوبل)
    adjustWallet(id, { amount, type = 'CREDIT', note = 'افزایش شارژ دستی' }) {
        const cust = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(id);
        if (!cust) throw new Error('مشتری یافت نشد');

        const allowedTypes = ['DEPOSIT', 'WITHDRAW', 'REFUND', 'GIFT'];
        let finalType = type;
        if (type === 'CREDIT') finalType = 'DEPOSIT';
        else if (type === 'DEBIT') finalType = 'WITHDRAW';
        if (!allowedTypes.includes(finalType)) finalType = 'DEPOSIT';

        const isPositive = finalType === 'DEPOSIT' || finalType === 'REFUND' || finalType === 'GIFT';
        const numAmount = Math.abs(amount);

        if (!numAmount || numAmount <= 0) {
            throw new Error('مبلغ باید بزرگتر از صفر باشد.');
        }

        if (!isPositive && numAmount > cust.wallet_balance) {
            throw new Error(`موجودی کیف پول برای کسر کافی نیست. موجودی فعلی: ${cust.wallet_balance}، درخواستی: ${numAmount}`);
        }

        const delta = isPositive ? numAmount : -numAmount;
        const newBalance = cust.wallet_balance + delta;

        const tx = db.transaction(() => {
            db.prepare(`UPDATE customers SET wallet_balance = ? WHERE id = ?`).run(newBalance, id);

            // Record signed amount in wallet_transactions so SUM(amount) matches wallet_balance
            db.prepare(`
                INSERT INTO wallet_transactions (customer_id, type, amount, description)
                VALUES (?, ?, ?, ?)
            `).run(id, finalType, delta, note);

            // Double-Entry Accounting:
            // For deposit: Dr 102 (Bank) / Cr 205 (Customer Wallet Liability)
            // For withdrawal: Dr 205 (Customer Wallet Liability) / Cr 102 (Bank)
            const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
            const accWallet = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '205'`).get() || { id: accBank };

            const entryNumber = `JE-WLT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, DATE('now'), ?, 'WALLET_ADJUSTMENT', ?, 1, 1)
            `).run(entryNumber, `سند تعدیل کیف پول مشتری (${finalType})`, id);
            const jId = jRes.lastInsertRowid;

            if (isPositive) {
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, 'دریافت وجه بابت شارژ کیف پول')`).run(jId, accBank, numAmount);
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, 'افزایش تعهد بدهی کیف پول مشتری')`).run(jId, accWallet.id, numAmount);
            } else {
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, 'کاهش تعهد بدهی کیف پول مشتری')`).run(jId, accWallet.id, numAmount);
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, 'پرداخت وجه بابت تسویه کیف پول')`).run(jId, accBank, numAmount);
            }
        });
        tx();

        return { success: true, newBalance };
    },

    // Batch Import Customers from File / Text
    importCustomers(list) {
        let inserted = 0;
        let skipped = 0;
        const tx = db.transaction(() => {
            const checkStmt = db.prepare(`SELECT id FROM customers WHERE mobile = ?`);
            const insertStmt = db.prepare(`
                INSERT INTO customers (referral_code, full_name, mobile, loyalty_tier, loyalty_points, wallet_balance, is_active)
                VALUES (?, ?, ?, 'BRONZE', 20, 0, 1)
            `);

            for (const item of list) {
                if (!item.mobile) continue;
                let cleanMob = item.mobile.replace(/\s+/g, '').replace(/^(\+98|0098)/, '0');
                if (!cleanMob.startsWith('0')) cleanMob = '0' + cleanMob;
                if (cleanMob.length !== 11) continue;

                const exists = checkStmt.get(cleanMob);
                if (exists) {
                    skipped++;
                } else {
                    const cCode = 'CUST-' + Math.floor(10000 + Math.random() * 90000);
                    insertStmt.run(cCode, item.name || `مشتری ${cleanMob.slice(-4)}`, cleanMob);
                    inserted++;
                }
            }
        });
        tx();

        return { inserted, skipped, totalProcessed: list.length };
    },

    // Custom Segmentation & Phone Extraction for Faraz SMS / IPPanel
    getFarazSmsContacts(filters = {}) {
        const {
            tier = '',
            rfmSegment = '',
            minSpent = 0,
            minOrders = 0,
            lastOrderRecency = '',
            hasWalletBalance = false,
            hasLoyaltyPoints = false,
            birthMonth = '',
            groupName = 'مشتریان کیهان بیوتی',
            searchQuery = ''
        } = filters;

        const allCustomers = this.getCustomers();
        const currentMonth = new Date().toISOString().slice(5, 7);

        const seenMobiles = new Set();
        const results = [];
        let invalidCount = 0;
        let duplicateCount = 0;

        for (const c of allCustomers) {
            // Filter: Search Query
            if (searchQuery) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = (c.full_name || '').toLowerCase().includes(q);
                const matchMob = (c.mobile || '').includes(q);
                const matchCode = (c.customer_code || c.referral_code || '').toLowerCase().includes(q);
                if (!matchName && !matchMob && !matchCode) continue;
            }

            // Filter: Tier
            if (tier && c.loyalty_tier !== tier) continue;

            // Filter: RFM Segment
            if (rfmSegment && c.rfm_segment !== rfmSegment) continue;

            // Filter: minSpent
            if (minSpent > 0 && Number(c.total_spent || 0) < Number(minSpent)) continue;

            // Filter: minOrders
            if (minOrders > 0 && Number(c.total_orders_count || 0) < Number(minOrders)) continue;

            // Filter: lastOrderRecency
            if (lastOrderRecency === 'RECENT_30') {
                if (c.days_since_last_order === null || c.days_since_last_order > 30) continue;
            } else if (lastOrderRecency === 'DAYS_30_90') {
                if (c.days_since_last_order === null || c.days_since_last_order <= 30 || c.days_since_last_order > 90) continue;
            } else if (lastOrderRecency === 'OVER_90') {
                if (c.days_since_last_order === null || c.days_since_last_order <= 90) continue;
            } else if (lastOrderRecency === 'NEVER') {
                if (Number(c.total_orders_count || 0) > 0) continue;
            }

            // Filter: hasWalletBalance
            if (hasWalletBalance && Number(c.wallet_balance || 0) <= 0) continue;

            // Filter: hasLoyaltyPoints
            if (hasLoyaltyPoints && Number(c.loyalty_points || 0) <= 0) continue;

            // Filter: birthMonth
            if (birthMonth === 'CURRENT') {
                if (!c.birth_date) continue;
                const m = c.birth_date.slice(5, 7);
                if (m !== currentMonth) continue;
            }

            // Normalize mobile
            const cleanMobile = normalizeIranianMobile(c.mobile);
            const isValid = /^09\d{9}$/.test(cleanMobile);

            if (!isValid) {
                invalidCount++;
                continue;
            }

            if (seenMobiles.has(cleanMobile)) {
                duplicateCount++;
                continue;
            }
            seenMobiles.add(cleanMobile);

            const nameParts = (c.full_name || '').trim().split(/\s+/);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            results.push({
                id: c.id,
                mobile: cleanMobile,
                fullName: c.full_name || '',
                firstName: firstName,
                lastName: lastName,
                gender: 'خانم/آقا',
                groupName: groupName.trim() || 'مشتریان کیهان بیوتی',
                tier: c.loyalty_tier || 'BRONZE',
                rfmSegment: c.rfm_segment || 'NEW',
                walletBalance: Number(c.wallet_balance || 0),
                loyaltyPoints: Number(c.loyalty_points || 0),
                totalSpent: Number(c.total_spent || 0),
                totalOrders: Number(c.total_orders_count || 0),
                lastOrderDate: c.last_order_date || '-',
                daysSinceLastOrder: c.days_since_last_order,
                birthDate: c.birth_date || '-'
            });
        }

        return {
            totalValid: results.length,
            invalidCount,
            duplicateCount,
            groupName: groupName.trim() || 'مشتریان کیهان بیوتی',
            contacts: results
        };
    },

    generateFarazSmsCsv(contacts) {
        const headers = [
            'شماره موبایل',
            'نام',
            'نام خانوادگی',
            'پیشوند',
            'نام کامل',
            'گروه',
            'تاریخ تولد',
            'سطح مشتری',
            'سگمنت RFM',
            'مانده کیف پول (تومان)',
            'امتیاز وفاداری',
            'مجموع خرید (تومان)',
            'تعداد فاکتور',
            'آخرین خرید'
        ];

        let csv = '\uFEFF' + headers.join(',') + '\r\n';
        for (const c of contacts) {
            const row = [
                `"${c.mobile}"`,
                `"${(c.firstName || '').replace(/"/g, '""')}"`,
                `"${(c.lastName || '').replace(/"/g, '""')}"`,
                `"${c.gender || 'خانم/آقا'}"`,
                `"${(c.fullName || '').replace(/"/g, '""')}"`,
                `"${(c.groupName || '').replace(/"/g, '""')}"`,
                `"${c.birthDate || ''}"`,
                `"${c.tier || ''}"`,
                `"${c.rfmSegment || ''}"`,
                c.walletBalance || 0,
                c.loyaltyPoints || 0,
                c.totalSpent || 0,
                c.totalOrders || 0,
                `"${c.lastOrderDate || ''}"`
            ];
            csv += row.join(',') + '\r\n';
        }
        return csv;
    }
};

module.exports = crmService;
