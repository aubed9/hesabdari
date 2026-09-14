// Marketing, Promotional Campaigns, Audience Targeting & Coupon Service
const db = require('../db/database');

const marketingService = {
    // Get all campaigns with metrics
    getCampaigns() {
        const campaigns = db.prepare(`
            SELECT 
                c.*,
                COALESCE((SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id), c.recipients_count, 0) AS total_recipients,
                COALESCE((SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'SENT'), 0) AS sent_count,
                COALESCE((SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'CONVERTED'), c.conversions_count, 0) AS actual_conversions
            FROM campaigns c
            ORDER BY c.id DESC
        `).all();

        return campaigns.map(c => {
            const roi = c.cost > 0 ? Math.round(((c.revenue_generated - c.cost) / c.cost) * 100) : 0;
            const convRate = c.total_recipients > 0 ? ((c.actual_conversions / c.total_recipients) * 100).toFixed(1) : 0;
            return {
                ...c,
                roi,
                conversionRate: Number(convRate)
            };
        });
    },

    // Get Campaign Details with Recipients
    getCampaignDetails(id) {
        const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
        if (!campaign) return null;

        campaign.recipients = db.prepare(`
            SELECT cr.*, c.full_name AS customer_name, c.loyalty_tier
            FROM campaign_recipients cr
            LEFT JOIN customers c ON cr.customer_id = c.id
            WHERE cr.campaign_id = ?
            ORDER BY cr.id ASC
            LIMIT 200
        `).all(id);

        campaign.coupon = campaign.coupon_code 
            ? db.prepare(`SELECT * FROM coupons WHERE code = ?`).get(campaign.coupon_code)
            : null;

        return campaign;
    },

    // Create New Campaign with Audience
    createCampaign({
        title,
        type = 'PROMO',
        channel = 'SMS',
        targetSegment = 'همه مشتریان',
        discountPercent = 0,
        startDate,
        endDate,
        budget = 0,
        messageTemplate = '',
        couponCode = '',
        recipients = []
    }) {
        if (!title) throw new Error('عنوان کمپین الزامی است');

        const tx = db.transaction(() => {
            const allowedTypes = ['BIRTHDAY', 'VIP', 'INACTIVE', 'AT_RISK', 'NEW_PRODUCT', 'NEW_BRAND', 'BACK_IN_STOCK', 'EXPIRING_STOCK', 'SEASONAL'];
            let finalType = type;
            if (type === 'FESTIVAL') finalType = 'SEASONAL';
            else if (type === 'WIN_BACK') finalType = 'INACTIVE';
            else if (type === 'PROMO') finalType = 'NEW_PRODUCT';
            if (!allowedTypes.includes(finalType)) finalType = 'SEASONAL';

            let finalCouponCode = couponCode ? couponCode.trim().toUpperCase() : '';
            if (discountPercent > 0 && !finalCouponCode) {
                finalCouponCode = 'CMP-' + Math.floor(1000 + Math.random() * 9000);
            }

            if (finalCouponCode && discountPercent > 0) {
                const existingCoupon = db.prepare(`SELECT id FROM coupons WHERE code = ?`).get(finalCouponCode);
                if (!existingCoupon) {
                    db.prepare(`
                        INSERT INTO coupons (
                            code, discount_type, discount_value, min_order_value, max_discount,
                            usage_limit, usage_count, valid_from, valid_until, is_active
                        ) VALUES (?, 'PERCENT', ?, 200000, 500000, 1000, 0, COALESCE(?, DATE('now')), COALESCE(?, DATE('now', '+30 days')), 1)
                    `).run(finalCouponCode, discountPercent, startDate || null, endDate || null);
                }
            }

            const costPerSms = 120;
            const estimatedCost = recipients.length * costPerSms;

            const res = db.prepare(`
                INSERT INTO campaigns (
                    title, type, channel, target_segment, discount_percent,
                    start_date, end_date, budget, cost, revenue_generated,
                    conversions_count, is_active, message_template, coupon_code, recipients_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?)
            `).run(
                title.trim(),
                finalType,
                channel,
                targetSegment,
                discountPercent,
                startDate || new Date().toISOString().split('T')[0],
                endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                budget || estimatedCost,
                estimatedCost,
                messageTemplate,
                finalCouponCode,
                recipients.length
            );

            const campaignId = res.lastInsertRowid;

            const insertRec = db.prepare(`
                INSERT INTO campaign_recipients (campaign_id, customer_id, name, mobile, status)
                VALUES (?, ?, ?, ?, 'QUEUED')
            `);

            for (const r of recipients) {
                if (!r.mobile) continue;
                insertRec.run(campaignId, r.customerId || null, r.name || null, r.mobile);
            }

            return { id: campaignId, couponCode: finalCouponCode, recipientsCount: recipients.length };
        });

        return tx();
    },

    sendCampaign(id) {
        const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
        if (!campaign) throw new Error('کمپین یافت نشد');

        const tx = db.transaction(() => {
            db.prepare(`UPDATE campaign_recipients SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE campaign_id = ?`).run(id);
            db.prepare(`UPDATE campaigns SET is_active = 1 WHERE id = ?`).run(id);
            db.prepare(`
                INSERT INTO audit_logs (employee_id, action, entity, entity_id, details)
                VALUES (1, 'SEND_CAMPAIGN', 'CAMPAIGN', ?, ?)
            `).run(String(id), `ارسال موفق پیامک‌های کمپین «${campaign.title}»`);
        });
        tx();

        return { success: true };
    },

    deleteCampaign(id) {
        db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(id);
        return { success: true };
    },

    parseAudienceText(rawText) {
        if (!rawText || !rawText.trim()) return { recipients: [], validCount: 0 };

        const lines = rawText.split(/\r?\n/);
        const recipientsMap = new Map();

        const existingCustomers = db.prepare(`SELECT id, full_name, mobile FROM customers WHERE is_active = 1`).all();
        const mobileToCustMap = new Map();
        existingCustomers.forEach(c => {
            if (c.mobile) mobileToCustMap.set(c.mobile.replace(/\s+/g, ''), c);
        });

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('name')) continue;

            let name = '';
            let mobile = '';

            if (trimmed.includes(',') || trimmed.includes('\t') || trimmed.includes(';')) {
                const parts = trimmed.split(/[,;\t]/).map(p => p.trim());
                if (parts.length >= 2) {
                    if (/^(\+98|0098|0)?9\d{9}$/.test(parts[0].replace(/\s+/g, ''))) {
                        mobile = parts[0];
                        name = parts[1];
                    } else {
                        name = parts[0];
                        mobile = parts[1];
                    }
                }
            } else {
                mobile = trimmed;
            }

            let cleanMobile = mobile.replace(/\s+/g, '').replace(/^(\+98|0098)/, '0');
            if (!cleanMobile.startsWith('0') && cleanMobile.length === 10) cleanMobile = '0' + cleanMobile;

            if (/^09\d{9}$/.test(cleanMobile)) {
                const existing = mobileToCustMap.get(cleanMobile);
                const finalName = name || (existing ? existing.full_name : '');
                const custId = existing ? existing.id : null;

                recipientsMap.set(cleanMobile, {
                    name: finalName,
                    mobile: cleanMobile,
                    customerId: custId
                });
            }
        }

        const recipients = Array.from(recipientsMap.values());
        return {
            recipients,
            validCount: recipients.length
        };
    },

    getTargetAudience(targetSegment) {
        let sql = `SELECT id, full_name AS name, mobile, loyalty_tier, rfm_segment FROM customers WHERE is_active = 1`;

        if (targetSegment === 'VIP') {
            sql += ` AND (loyalty_tier IN ('VIP', 'GOLD') OR rfm_segment = 'Champions')`;
        } else if (targetSegment === 'AT_RISK') {
            sql += ` AND (rfm_segment IN ('At Risk', 'Lost') OR (julianday('now') - julianday(COALESCE(last_order_date, created_at))) >= 45)`;
        } else if (targetSegment === 'NEW') {
            sql += ` AND (rfm_segment = 'New' OR created_at >= DATETIME('now', '-30 days'))`;
        } else if (targetSegment === 'BIRTHDAYS') {
            sql += ` AND STRFTIME('%m', birth_date) = STRFTIME('%m', 'now')`;
        }

        const rows = db.prepare(sql).all();
        return rows.filter(r => r.mobile && /^09\d{9}$/.test(r.mobile.replace(/\s+/g, ''))).map(r => ({
            name: r.name,
            mobile: r.mobile.replace(/\s+/g, ''),
            customerId: r.id
        }));
    },

    getMarketingStats() {
        const stats = db.prepare(`
            SELECT 
                COUNT(id) AS total_campaigns,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_campaigns,
                COALESCE(SUM(recipients_count), 0) AS total_reach,
                COALESCE(SUM(budget), 0) AS total_budget,
                COALESCE(SUM(cost), 0) AS total_cost,
                COALESCE(SUM(revenue_generated), 0) AS total_revenue,
                COALESCE(SUM(conversions_count), 0) AS total_conversions
            FROM campaigns
        `).get();

        const avgRoi = stats.total_cost > 0 ? Math.round(((stats.total_revenue - stats.total_cost) / stats.total_cost) * 100) : 0;

        return {
            ...stats,
            avgRoi
        };
    }
};

module.exports = marketingService;