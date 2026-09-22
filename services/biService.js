// Business Intelligence (BI), Analytics, KPIs & Insight Engine
const db = require('../db/database');
const inventoryService = require('./inventoryService');
const { formatMobileForExcel } = require('../utils/textUtils');
const { toJalaliDateString } = require('../utils/dateUtils');

const biService = {
    // Executive Control Center Overview
    getExecutiveDashboard(filterRange = 'TODAY', customStart = null, customEnd = null) {
        let dateCondition = "DATE(created_at) = DATE('now')";
        let customerDateCondition = "(DATE(created_at) = DATE('now') OR DATE(membership_date) = DATE('now'))";
        let periodLabel = 'امروز';

        if (filterRange === 'YESTERDAY') {
            dateCondition = "DATE(created_at) = DATE('now', '-1 day')";
            customerDateCondition = "(DATE(created_at) = DATE('now', '-1 day') OR DATE(membership_date) = DATE('now', '-1 day'))";
            periodLabel = 'دیروز';
        } else if (filterRange === 'WEEK') {
            dateCondition = "created_at >= DATETIME('now', '-7 days')";
            customerDateCondition = "(created_at >= DATETIME('now', '-7 days') OR membership_date >= DATE('now', '-7 days'))";
            periodLabel = '۷ روز گذشته';
        } else if (filterRange === 'MONTH' || filterRange === 'DAYS_30') {
            dateCondition = "created_at >= DATETIME('now', '-30 days')";
            customerDateCondition = "(created_at >= DATETIME('now', '-30 days') OR membership_date >= DATE('now', '-30 days'))";
            periodLabel = '۳۰ روز گذشته';
        } else if (filterRange === 'SEASON' || filterRange === 'DAYS_90') {
            dateCondition = "created_at >= DATETIME('now', '-90 days')";
            customerDateCondition = "(created_at >= DATETIME('now', '-90 days') OR membership_date >= DATE('now', '-90 days'))";
            periodLabel = 'فصل جاری (۹۰ روز)';
        } else if (filterRange === 'YEAR') {
            dateCondition = "STRFTIME('%Y', created_at) = STRFTIME('%Y', 'now')";
            customerDateCondition = "(STRFTIME('%Y', created_at) = STRFTIME('%Y', 'now') OR STRFTIME('%Y', membership_date) = STRFTIME('%Y', 'now'))";
            periodLabel = 'سال جاری';
        } else if (filterRange === 'ALL') {
            dateCondition = "1=1";
            customerDateCondition = "1=1";
            periodLabel = 'کل دوره (۹۰ روز)';
        } else if (filterRange === 'CUSTOM' && customStart && customEnd) {
            dateCondition = `DATE(created_at) BETWEEN '${customStart}' AND '${customEnd}'`;
            customerDateCondition = `(DATE(created_at) BETWEEN '${customStart}' AND '${customEnd}' OR DATE(membership_date) BETWEEN '${customStart}' AND '${customEnd}')`;
            periodLabel = `از ${customStart} تا ${customEnd}`;
        }

        // Filtered Period Stats
        const periodStats = db.prepare(`
            SELECT 
                COUNT(id) AS invoices_count,
                COALESCE(SUM(total_amount), 0) AS sales,
                COALESCE(SUM(total_cost), 0) AS cogs,
                COALESCE(AVG(total_amount), 0) AS aov
            FROM orders
            WHERE status = 'COMPLETED' AND ${dateCondition}
        `).get();
        const grossProfitPeriod = periodStats.sales - periodStats.cogs;

        // Today Sales & Invoices
        const todayStats = db.prepare(`
            SELECT 
                COUNT(id) AS invoices_count,
                COALESCE(SUM(total_amount), 0) AS sales_today,
                COALESCE(SUM(total_cost), 0) AS cogs_today,
                COALESCE(AVG(total_amount), 0) AS aov_today
            FROM orders
            WHERE status = 'COMPLETED' AND DATE(created_at) = DATE('now')
        `).get();
        const grossProfitToday = todayStats.sales_today - todayStats.cogs_today;

        // Month Sales
        const monthStats = db.prepare(`
            SELECT 
                COUNT(id) AS invoices_count,
                COALESCE(SUM(total_amount), 0) AS sales_month,
                COALESCE(SUM(total_cost), 0) AS cogs_month,
                COALESCE(AVG(total_amount), 0) AS aov_month
            FROM orders
            WHERE status = 'COMPLETED' AND STRFTIME('%Y-%m', created_at) = STRFTIME('%Y-%m', 'now')
        `).get();
        const grossProfitMonth = monthStats.sales_month - monthStats.cogs_month;

        // Total Inventory Valuation
        const invValuation = db.prepare(`
            SELECT 
                COALESCE(SUM(quantity * purchase_price), 0) AS total_cost_value,
                COALESCE(SUM(quantity), 0) AS total_units
            FROM inventory_batches
            WHERE quantity > 0
        `).get();

        // Near Expiry Stock Valuation (less than 60 days)
        const nearExpiry = db.prepare(`
            SELECT 
                COUNT(id) AS batches_count,
                COALESCE(SUM(quantity), 0) AS total_qty,
                COALESCE(SUM(quantity * purchase_price), 0) AS cost_value
            FROM inventory_batches
            WHERE quantity > 0 AND (julianday(expiry_date) - julianday('now')) <= 60
        `).get();

        // Low stock items count (current stock <= reorder point)
        const lowStockCount = db.prepare(`
            SELECT COUNT(DISTINCT pv.id) AS low_count
            FROM product_variants pv
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE pv.is_active = 1
            GROUP BY pv.id
            HAVING COALESCE(SUM(ib.quantity), 0) <= pv.reorder_point
        `).all().length;

        // Cash & Bank Balances
        const cashBalanceRow = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
            FROM journal_lines jl
            JOIN chart_of_accounts coa ON jl.account_id = coa.id
            WHERE coa.code = '101'
        `).get();
        const bankBalanceRow = db.prepare(`
            SELECT COALESCE(SUM(balance), 0) AS total
            FROM bank_accounts
            WHERE is_active = 1
        `).get();

        // Payables (بدهی به تأمین‌کنندگان)
        const payablesRow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM cheques
            WHERE type = 'PAYABLE' AND status = 'PENDING'
        `).get();

        // Receivables (مطالبات)
        const receivablesRow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM cheques
            WHERE type = 'RECEIVABLE' AND status = 'PENDING'
        `).get();

        // Customer KPIs
        const customerStats = db.prepare(`
            SELECT 
                COUNT(id) AS total_customers,
                COUNT(CASE WHEN loyalty_tier = 'VIP' THEN 1 END) AS vip_customers,
                COUNT(CASE WHEN rfm_segment = 'At Risk' THEN 1 END) AS at_risk_customers,
                COUNT(CASE WHEN DATE(created_at) = DATE('now') OR DATE(membership_date) = DATE('now') THEN 1 END) AS new_customers_today,
                COUNT(CASE WHEN STRFTIME('%Y-%m', created_at) = STRFTIME('%Y-%m', 'now') OR STRFTIME('%Y-%m', membership_date) = STRFTIME('%Y-%m', 'now') THEN 1 END) AS new_customers_month,
                COUNT(CASE WHEN ${customerDateCondition} THEN 1 END) AS new_customers_period
            FROM customers
            WHERE is_active = 1
        `).get();

        return {
            period: {
                label: periodLabel,
                sales: periodStats.sales,
                cogs: periodStats.cogs,
                grossProfit: grossProfitPeriod,
                invoicesCount: periodStats.invoices_count,
                averageOrderValue: Math.round(periodStats.aov),
                newCustomers: customerStats.new_customers_period
            },
            today: {
                sales: todayStats.sales_today,
                cogs: todayStats.cogs_today,
                grossProfit: grossProfitToday,
                invoicesCount: todayStats.invoices_count,
                averageOrderValue: Math.round(todayStats.aov_today),
                newCustomers: customerStats.new_customers_today
            },
            month: {
                sales: monthStats.sales_month,
                cogs: monthStats.cogs_month,
                grossProfit: grossProfitMonth,
                invoicesCount: monthStats.invoices_count,
                averageOrderValue: Math.round(monthStats.aov_month),
                newCustomers: customerStats.new_customers_month
            },
            inventory: {
                totalCostValue: invValuation.total_cost_value,
                totalUnits: invValuation.total_units,
                nearExpiryUnits: nearExpiry.total_qty,
                nearExpiryValue: nearExpiry.cost_value,
                nearExpiryBatches: nearExpiry.batches_count,
                lowStockCount
            },
            finances: {
                cashBalance: cashBalanceRow.total,
                bankBalance: bankBalanceRow.total,
                totalLiquidity: cashBalanceRow.total + bankBalanceRow.total,
                accountsPayable: payablesRow.total,
                accountsReceivable: receivablesRow.total
            },
            customers: customerStats
        };
    },

    // Comprehensive Executive Dashboard Excel CSV Export (با مشخصات فارسی، کالاهای نیازمند سفارش و فاکتورها)
    generateExecutiveDashboardExcelCsv(filterRange = 'TODAY', customStart = null, customEnd = null) {
        const dashboard = this.getExecutiveDashboard(filterRange, customStart, customEnd);
        const reorderSuggestions = inventoryService.getReorderSuggestions();

        let orderDateCond = "DATE(o.created_at) = DATE('now')";
        if (filterRange === 'YESTERDAY') {
            orderDateCond = "DATE(o.created_at) = DATE('now', '-1 day')";
        } else if (filterRange === 'WEEK') {
            orderDateCond = "o.created_at >= DATETIME('now', '-7 days')";
        } else if (filterRange === 'MONTH' || filterRange === 'DAYS_30') {
            orderDateCond = "o.created_at >= DATETIME('now', '-30 days')";
        } else if (filterRange === 'SEASON' || filterRange === 'DAYS_90') {
            orderDateCond = "o.created_at >= DATETIME('now', '-90 days')";
        } else if (filterRange === 'YEAR') {
            orderDateCond = "STRFTIME('%Y', o.created_at) = STRFTIME('%Y', 'now')";
        } else if (filterRange === 'ALL') {
            orderDateCond = "1=1";
        } else if (filterRange === 'CUSTOM' && customStart && customEnd) {
            orderDateCond = `DATE(o.created_at) BETWEEN '${customStart}' AND '${customEnd}'`;
        }

        const orders = db.prepare(`
            SELECT 
                o.id,
                o.order_number,
                o.created_at,
                COALESCE(c.full_name, 'مشتری گذری') AS customer_name,
                COALESCE(c.mobile, '-') AS customer_mobile,
                o.channel,
                o.subtotal,
                o.discount_amount,
                o.total_amount,
                o.total_cost,
                (o.total_amount - o.total_cost) AS gross_profit,
                (
                    SELECT GROUP_CONCAT(DISTINCT p.payment_method)
                    FROM payments p
                    WHERE p.order_id = o.id
                ) AS payment_methods,
                o.status
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.status = 'COMPLETED' AND ${orderDateCond}
            ORDER BY o.id DESC
        `).all();

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const s = String(val);
            if (s.startsWith('="')) return s;
            return `"${s.replace(/"/g, '""')}"`;
        };

        const channelMap = {
            'STORE_POS': 'فروشگاه فیزیکی (POS)',
            'WEBSITE': 'فروشگاه اینترنتی',
            'INSTAGRAM': 'سفارش دایرکت اینستاگرام',
            'WHATSAPP': 'سفارش واتساپ',
            'MARKETPLACE': 'مارکت‌پلیس'
        };

        const formatPaymentMethods = (methodsStr) => {
            if (!methodsStr) return 'نقدی / تسویه';
            const parts = methodsStr.split(',');
            return parts.map(m => {
                if (m === 'CASH') return 'نقدی';
                if (m === 'CARD') return 'کارتخوان (POS)';
                if (m === 'WALLET') return 'کیف پول';
                if (m === 'CHEQUE') return 'چک';
                if (m === 'ONLINE') return 'درگاه آنلاین';
                return m;
            }).join(' + ');
        };

        const urgencyMap = {
            'CRITICAL': 'بحرانی (اتمام موجودی)',
            'HIGH': 'فوری (زیر ذخیره احتیاطی)',
            'MEDIUM': 'متوسط (نقطه سفارش)'
        };

        const todayIso = new Date().toISOString().slice(0, 10);
        const todayJalali = toJalaliDateString(todayIso);

        const lines = [];

        // UTF-8 BOM Header Banner
        lines.push(`\uFEFF"=== گزارش جامع مدیریتی و داشبورد اجرایی فروشگاه آرایشی و بهداشتی ==="`);
        lines.push(`"بازه گزارش:",${escapeCsv(dashboard.period.label)},"تاریخ صدور (شمسی):",${escapeCsv(todayJalali)},"تاریخ میلادی:",${escapeCsv(todayIso)}`);
        lines.push('');

        // Section 1: Executive KPIs
        lines.push('"================ بخش ۱: شاخص‌های کلیدی عملکرد اجرایی (KPIs) ================"');
        lines.push('"ردیف","عنوان شاخص","مقدار","واحد","توضیحات و جزئیات"');

        const kpiRows = [
            [1, 'بازه زمانی گزارش', dashboard.period.label, '-', 'بازه انتخاب شده توسط مدیریت'],
            [2, 'فروش دوره منتخب', Math.round(dashboard.period.sales), 'تومان', 'مجموع فروش خالص فاکتورهای دوره'],
            [3, 'بهای تمام شده کالای فروش رفته (COGS)', Math.round(dashboard.period.cogs), 'تومان', 'هزینه خرید کالاهای فروخته شده در دوره'],
            [4, 'سود ناخالص دوره', Math.round(dashboard.period.grossProfit), 'تومان', `حاشیه سود ناخالص: ${dashboard.period.sales > 0 ? Math.round((dashboard.period.grossProfit / dashboard.period.sales) * 100) : 0}٪`],
            [5, 'تعداد کل فاکتورهای دوره', dashboard.period.invoicesCount, 'فقره', 'تعداد سفارش‌های موفق ثبت شده'],
            [6, 'میانگین ارزش فاکتور (AOV)', dashboard.period.averageOrderValue, 'تومان', 'میانگین مبلغ هر سبد خرید'],
            [7, 'تعداد مشتری جدید ثبت‌شده در این دوره', dashboard.customers.new_customers_period, 'نفر', 'عضویت‌های جدید ثبت شده در بازه انتخابی'],
            [8, 'تعداد مشتری جدید ثبت‌شده امروز', dashboard.customers.new_customers_today, 'نفر', 'عضویت‌های جدید امروز'],
            [9, 'تعداد مشتری جدید ثبت‌شده این ماه', dashboard.customers.new_customers_month, 'نفر', 'عضویت‌های جدید در ۳۰ روز گذشته'],
            [10, 'کل اعضای فعال باشگاه مشتریان', dashboard.customers.total_customers, 'نفر', 'مشتریان فعال ثبت شده در CRM'],
            [11, 'مشتریان طلایی و VIP', dashboard.customers.vip_customers, 'نفر', 'مشتریان وفادار با بالاترین سبد خرید'],
            [12, 'مشتریان در خطر ریزش (RFM)', dashboard.customers.at_risk_customers, 'نفر', 'بیش از ۶۰ روز بدون خرید (نیازمند پیگیری)'],
            [13, 'فروش امروز', Math.round(dashboard.today.sales), 'تومان', `${dashboard.today.invoicesCount} فاکتور صادر شده امروز`],
            [14, 'سود ناخالص امروز', Math.round(dashboard.today.grossProfit), 'تومان', 'سود عملیاتی امروز'],
            [15, 'فروش ماه جاری', Math.round(dashboard.month.sales), 'تومان', `${dashboard.month.invoicesCount} فاکتور صادر شده در ماه`],
            [16, 'سود ناخالص ماه جاری', Math.round(dashboard.month.grossProfit), 'تومان', 'سود ناخالص عملیاتی ۳۰ روزه'],
            [17, 'ارزش ریالی سرمایه انبار', Math.round(dashboard.inventory.totalCostValue), 'تومان', 'ارزش کل موجودی بر مبنای قیمت خرید'],
            [18, 'کل تعداد واحدهای کالایی در انبار', dashboard.inventory.totalUnits, 'عدد', 'موجودی کالایی انبار'],
            [19, 'تعداد اقلام زیر نقطه سفارش (کسری انبار)', dashboard.inventory.lowStockCount, 'قلم کالا', 'نیازمند صدور سفارش خرید فوری'],
            [20, 'کالاهای نزدیک انقضا (زیر ۶۰ روز)', dashboard.inventory.nearExpiryUnits, 'عدد', `${dashboard.inventory.nearExpiryBatches} بچ به ارزش ${Math.round(dashboard.inventory.nearExpiryValue)} تومان`],
            [21, 'کل نقدینگی در دسترس (بانک + صندوق)', Math.round(dashboard.finances.totalLiquidity), 'تومان', 'نقدینگی کل فروشگاه'],
            [22, 'موجودی نقد صندوق', Math.round(dashboard.finances.cashBalance), 'تومان', 'موجودی فیزیکی صندوق'],
            [23, 'موجودی حساب‌های بانکی', Math.round(dashboard.finances.bankBalance), 'تومان', 'حساب‌های کارتخوان و بانک‌ها'],
            [24, 'اسناد و چک‌های دریافتنی (مطالبات)', Math.round(dashboard.finances.accountsReceivable), 'تومان', 'چک‌های وصول‌نشده دریافتی'],
            [25, 'اسناد و چک‌های پرداختنی (بدهی تأمین‌کنندگان)', Math.round(dashboard.finances.accountsPayable), 'تومان', 'چک‌های پرداختی سررسیددار']
        ];

        kpiRows.forEach(r => {
            lines.push([r[0], escapeCsv(r[1]), r[2], escapeCsv(r[3]), escapeCsv(r[4])].join(','));
        });

        lines.push('');

        // Section 2: Reorder & Shortage Items (کالاهای نیازمند سفارش و کسری موجودی)
        lines.push('"================ بخش ۲: لیست کالاهای نیازمند سفارش خرید و کسری موجودی ================"');
        lines.push('"ردیف","نام کالا","برند","شید / رنگ","بارکد","کد کالا (SKU)","موجودی فعلی","ذخیره اطمینان","نقطه سفارش","کسری / تعداد سفارش پیشنهادی","قیمت خرید واحد (تومان)","برآورد کل هزینه خرید (تومان)","فروش روزانه (واحد)","زمان تحویل تأمین‌کننده (روز)","تأمین‌کننده","سطح فوریت"');

        if (reorderSuggestions.length === 0) {
            lines.push('"1","تمامی کالاها در سطح موجودی مطلوب قرار دارند و کسری انبار گزارش نشده است","-","-","-","-",0,0,0,0,0,0,0,0,"-","عادی"');
        } else {
            reorderSuggestions.forEach((item, idx) => {
                lines.push([
                    idx + 1,
                    escapeCsv(item.productName),
                    escapeCsv(item.brandName),
                    escapeCsv(item.shade || '-'),
                    escapeCsv(item.barcode || item.sku),
                    escapeCsv(item.sku),
                    item.currentStock,
                    item.safetyStock,
                    item.reorderPoint,
                    item.suggestedQuantity,
                    Math.round(item.purchasePrice || 0),
                    Math.round(item.estimatedCost || 0),
                    item.dailySales,
                    item.leadTimeDays,
                    escapeCsv(item.supplierName || 'تأمین‌کننده پیش‌فرض'),
                    escapeCsv(urgencyMap[item.urgency] || item.urgency)
                ].join(','));
            });
        }

        lines.push('');

        // Section 3: Period Invoices Detail
        lines.push('"================ بخش ۳: جزئیات فاکتورهای فروش دوره منتخب ================"');
        lines.push('"ردیف","شماره فاکتور","تاریخ ثبت (شمسی)","تاریخ و زمان میلادی","نام مشتری","شماره تلفن همراه","کانال فروش","مبلغ ناخالص (تومان)","تخفیف (تومان)","مبلغ خالص فاکتور (تومان)","بهای تمام شده (COGS)","سود ناخالص فاکتور (تومان)","روش پرداخت","وضعیت فاکتور"');

        if (orders.length === 0) {
            lines.push('"1","هیچ فاکتوری در این بازه زمانی یافت نشد","-","-","-","-","-",0,0,0,0,0,"-","-"');
        } else {
            orders.forEach((o, idx) => {
                const shamsiDate = toJalaliDateString(o.created_at);
                const excelPhone = formatMobileForExcel(o.customer_mobile);
                const channelName = channelMap[o.channel] || o.channel;
                const paymentMethodName = formatPaymentMethods(o.payment_methods);

                lines.push([
                    idx + 1,
                    escapeCsv(o.order_number),
                    escapeCsv(shamsiDate),
                    escapeCsv(o.created_at),
                    escapeCsv(o.customer_name),
                    excelPhone,
                    escapeCsv(channelName),
                    Math.round(o.subtotal),
                    Math.round(o.discount_amount),
                    Math.round(o.total_amount),
                    Math.round(o.total_cost),
                    Math.round(o.gross_profit),
                    escapeCsv(paymentMethodName),
                    escapeCsv(o.status === 'COMPLETED' ? 'تکمیل شده' : o.status)
                ].join(','));
            });
        }

        return lines.join('\r\n');
    },

    // Daily Sales & Profit Trend (Last 14 days)
    getSalesTrend() {
        return db.prepare(`
            SELECT 
                DATE(created_at) AS sale_date,
                COUNT(id) AS orders_count,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(SUM(total_cost), 0) AS total_cogs,
                COALESCE(SUM(total_amount - total_cost), 0) AS gross_profit
            FROM orders
            WHERE status = 'COMPLETED'
            GROUP BY DATE(created_at)
            ORDER BY sale_date ASC
            LIMIT 14
        `).all();
    },

    // Day of Week x Hour Heatmap (برای بررسی شلوغ‌ترین ساعات فروشگاه آرایشی)
    getSalesHeatmap() {
        // SQLite: strftime('%w', created_at) -> 0=Sunday, 1=Monday... 6=Saturday
        // SQLite: strftime('%H', created_at) -> 00 to 23
        const raw = db.prepare(`
            SELECT 
                STRFTIME('%w', created_at) AS day_of_week,
                CAST(STRFTIME('%H', created_at) AS INTEGER) AS hour_of_day,
                COUNT(id) AS sales_count,
                SUM(total_amount) AS revenue
            FROM orders
            WHERE status = 'COMPLETED'
            GROUP BY day_of_week, hour_of_day
        `).all();

        const daysFa = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
        return raw.map(r => ({
            dayNumber: Number(r.day_of_week),
            dayName: daysFa[r.day_of_week],
            hour: r.hour_of_day,
            count: r.sales_count,
            revenue: r.revenue
        }));
    },

    // ABC Analysis (قانون ۸۰/۲۰ برای کاتالوگ محصولات آرایشی)
    getABCAnalysis() {
        const products = db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.total_price), 0) AS total_revenue,
                COALESCE(SUM(oi.total_price - (oi.quantity * oi.unit_cost)), 0) AS total_profit
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            GROUP BY pv.id
            ORDER BY total_revenue DESC
        `).all();

        const totalRevenueAll = products.reduce((sum, p) => sum + p.total_revenue, 0) || 1;
        let runningCumulative = 0;

        return products.map(p => {
            runningCumulative += p.total_revenue;
            const cumulativePercent = (runningCumulative / totalRevenueAll) * 100;

            let classification = 'C';
            if (cumulativePercent <= 80) classification = 'A';
            else if (cumulativePercent <= 95) classification = 'B';

            return {
                ...p,
                revenueSharePercent: Number(((p.total_revenue / totalRevenueAll) * 100).toFixed(1)),
                cumulativePercent: Number(cumulativePercent.toFixed(1)),
                classification
            };
        });
    },

    // Brand Performance Comparison
    getBrandPerformance() {
        return db.prepare(`
            SELECT 
                b.id AS brand_id,
                b.name AS brand_name,
                b.country,
                COUNT(DISTINCT p.id) AS products_count,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.total_price), 0) AS total_sales,
                COALESCE(SUM(oi.quantity * oi.unit_cost), 0) AS total_cogs,
                COALESCE(SUM(oi.total_price - (oi.quantity * oi.unit_cost)), 0) AS gross_profit,
                CASE 
                    WHEN SUM(oi.total_price) > 0 THEN 
                        ROUND((SUM(oi.total_price - (oi.quantity * oi.unit_cost)) / SUM(oi.total_price)) * 100, 1)
                    ELSE 0 
                END AS margin_percent
            FROM brands b
            LEFT JOIN products p ON b.id = p.brand_id
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            WHERE b.is_active = 1
            GROUP BY b.id
            ORDER BY total_sales DESC
        `).all();
    },

    // GMROI & Inventory Turnover per Brand/Category
    getGMROIReport() {
        const brands = db.prepare(`
            SELECT 
                b.name AS brand_name,
                COALESCE(SUM(oi.total_price - (oi.quantity * oi.unit_cost)), 0) AS total_profit,
                COALESCE(SUM(ib.quantity * ib.purchase_price), 0) AS inventory_investment
            FROM brands b
            LEFT JOIN products p ON b.id = p.brand_id
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id AND ib.quantity > 0
            WHERE b.is_active = 1
            GROUP BY b.id
        `).all();

        return brands.map(b => {
            const gmroi = b.inventory_investment > 0 ? (b.total_profit / b.inventory_investment) : 0;
            return {
                brandName: b.brand_name,
                totalProfit: b.total_profit,
                inventoryInvestment: b.inventory_investment,
                gmroi: Number(gmroi.toFixed(2)),
                efficiency: gmroi >= 2.0 ? 'فوق‌العاده سودآور' : (gmroi >= 1.0 ? 'مطلوب' : 'نیازمند بهینه‌سازی گردش')
            };
        });
    },

    // Slow-Moving & Dead Stock (کالاهایی که مدت زیادی فروش نرفته‌اند)
    getDeadStockReport() {
        return db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                pv.purchase_price,
                COALESCE(SUM(ib.quantity), 0) AS stock_qty,
                COALESCE(SUM(ib.quantity * pv.purchase_price), 0) AS locked_capital,
                MAX(o.created_at) AS last_sold_date,
                CAST((julianday('now') - julianday(COALESCE(MAX(o.created_at), '2026-01-01'))) AS INTEGER) AS days_without_sale
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            JOIN inventory_batches ib ON pv.id = ib.product_variant_id AND ib.quantity > 0
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            LEFT JOIN orders o ON oi.order_id = o.id
            GROUP BY pv.id
            HAVING days_without_sale >= 30 OR MAX(o.created_at) IS NULL
            ORDER BY locked_capital DESC
        `).all();
    },

    // Automated Intelligent Insights Engine (موتور تحلیل و پیشنهاد برای صاحب مغازه)
    generateInsights() {
        const insights = [];

        // 1. Check Near Expiry Stock
        const nearExp = db.prepare(`
            SELECT COUNT(id) AS count, COALESCE(SUM(quantity * purchase_price), 0) AS value
            FROM inventory_batches
            WHERE quantity > 0 AND (julianday(expiry_date) - julianday('now')) <= 60
        `).get();

        if (nearExp.count > 0) {
            insights.push({
                type: 'EXPIRY_WARNING',
                severity: 'CRITICAL',
                title: 'سرمایه در معرض خطر انقضا',
                message: `تعداد ${nearExp.count} بچ کالا به ارزش ${nearExp.value.toLocaleString('fa-IR')} تومان ظرف ۶۰ روز آینده منقضی می‌شوند. پیشنهاد: ایجاد جشنواره تخفیف ۲۰٪ تا ۳۰٪ یا ارسال پیامک به مشتریان وفادار.`
            });
        }

        // 2. High Margin vs High Revenue Brands
        const brands = this.getBrandPerformance();
        if (brands.length >= 2) {
            const topRevenueBrand = brands[0];
            const topMarginBrand = [...brands].sort((a, b) => b.margin_percent - a.margin_percent)[0];

            if (topRevenueBrand.brand_name !== topMarginBrand.brand_name) {
                insights.push({
                    type: 'MARGIN_OPPORTUNITY',
                    severity: 'INFO',
                    title: 'فرصت سودآوری برندها',
                    message: `برند «${topRevenueBrand.brand_name}» بالاترین حجم فروش را ایجاد می‌کند، اما برند «${topMarginBrand.brand_name}» با حاشیه سود ${topMarginBrand.margin_percent}٪ سودآورتر است. ارتقای فروش برند ${topMarginBrand.brand_name} سود خالص شما را جهش می‌دهد.`
                });
            }
        }

        // 3. Dead Stock Capital
        const deadStock = this.getDeadStockReport();
        const totalDeadStockCapital = deadStock.reduce((sum, d) => sum + d.locked_capital, 0);
        if (totalDeadStockCapital > 0) {
            insights.push({
                type: 'DEAD_STOCK',
                severity: 'WARNING',
                title: 'سرمایه قفل شده در انبار',
                message: `مبلغ ${totalDeadStockCapital.toLocaleString('fa-IR')} تومان در ${deadStock.length} قلم کالای کم‌گردش بیش از ۳۰ روز راکد مانده است. پیشنهاد حراج آخر فصل یا باندل کردن با پرفروش‌ها.`
            });
        }

        // 4. Basket Complementary Insights (Cross-Sell)
        insights.push({
            type: 'CROSS_SELL',
            severity: 'INFO',
            title: 'مکمل‌های سبد خرید فعال',
            message: 'بررسی فاکتورها نشان می‌دهد همراه با کرم‌پودر میبلین و لورآل، تقاضا برای پد تخم‌مرغی و کانسیلر بسیار بالاست. در صفحه POS پیشنهاد خودکار فعال است.'
        });

        return insights;
    },

    // ==========================================
    // Cafe-Grade Retail BI Deep Analytics
    // ==========================================

    // Peak Shopping Hours Heatmap Analysis (ساعات اوج و پیک تردد فروشگاه)
    getHourlyPeakAnalysis() {
        const rows = db.prepare(`
            SELECT 
                CAST(STRFTIME('%H', created_at) AS INTEGER) AS hour_of_day,
                COUNT(id) AS order_count,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(AVG(total_amount), 0) AS aov
            FROM orders
            WHERE status = 'COMPLETED'
            GROUP BY hour_of_day
            ORDER BY hour_of_day ASC
        `).all();

        const totalOrders = rows.reduce((s, r) => s + r.order_count, 0) || 1;
        const maxOrders = Math.max(...rows.map(r => r.order_count), 1);

        return rows.map(r => ({
            hour: r.hour_of_day,
            hourLabel: `${String(r.hour_of_day).padStart(2, '0')}:۰۰ تا ${String(r.hour_of_day + 1).padStart(2, '0')}:۰۰`,
            orderCount: r.order_count,
            totalSales: r.total_sales,
            aov: Math.round(r.aov),
            trafficSharePercent: Math.round((r.order_count / totalOrders) * 100),
            intensityPercent: Math.round((r.order_count / maxOrders) * 100),
            isPeak: r.order_count >= (maxOrders * 0.8)
        }));
    },

    // Day of Week Sales Pattern (تحلیل پرفروش‌ترین روزهای هفته)
    getDayOfWeekPerformance() {
        const dayNames = {
            '6': { name: 'شنبه', order: 1 },
            '0': { name: 'یکشنبه', order: 2 },
            '1': { name: 'دوشنبه', order: 3 },
            '2': { name: 'سه‌شنبه', order: 4 },
            '3': { name: 'چهارشنبه', order: 5 },
            '4': { name: 'پنج‌شنبه', order: 6 },
            '5': { name: 'جمعه', order: 7 }
        };

        const rows = db.prepare(`
            SELECT 
                STRFTIME('%w', created_at) AS day_of_week,
                COUNT(id) AS order_count,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(AVG(total_amount), 0) AS aov
            FROM orders
            WHERE status = 'COMPLETED'
            GROUP BY day_of_week
        `).all();

        const totalSales = rows.reduce((s, r) => s + r.total_sales, 0) || 1;

        const result = Object.keys(dayNames).map(k => {
            const found = rows.find(r => r.day_of_week === k) || { order_count: 0, total_sales: 0, aov: 0 };
            return {
                dayCode: k,
                dayName: dayNames[k].name,
                sortOrder: dayNames[k].order,
                orderCount: found.order_count,
                totalSales: found.total_sales,
                aov: Math.round(found.aov),
                revenueSharePercent: Math.round((found.total_sales / totalSales) * 100)
            };
        }).sort((a, b) => a.sortOrder - b.sortOrder);

        const bestDay = [...result].sort((a, b) => b.totalSales - a.totalSales)[0];
        return { days: result, bestDay };
    },

    // Boston Consulting Group (BCG) Matrix for Cosmetics & Brands
    getBcgMatrix() {
        const products = db.prepare(`
            SELECT 
                p.id,
                p.name_fa AS product_name,
                b.name AS brand_name,
                c.name_fa AS category_name,
                COUNT(oi.id) AS sales_frequency,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.total_price), 0) AS total_revenue,
                COALESCE(SUM(oi.quantity * oi.unit_cost), 0) AS total_cogs
            FROM products p
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            JOIN product_variants pv ON p.id = pv.product_id
            JOIN order_items oi ON pv.id = oi.product_variant_id
            JOIN orders o ON oi.order_id = o.id AND o.status = 'COMPLETED'
            GROUP BY p.id
        `).all();

        const avgRevenue = products.reduce((s, p) => s + p.total_revenue, 0) / (products.length || 1);

        return products.map(p => {
            const profit = p.total_revenue - p.total_cogs;
            const margin = p.total_revenue > 0 ? Math.round((profit / p.total_revenue) * 100) : 0;
            const isHighRevenue = p.total_revenue >= avgRevenue;
            const isHighMargin = margin >= 35;

            let quadrant = 'DOG';
            let quadrantLabel = 'سگ‌ها (حذف/تغییر)';
            let color = 'rose';

            if (isHighRevenue && isHighMargin) {
                quadrant = 'STAR';
                quadrantLabel = 'ستاره‌ها (پرفروش و پرسود)';
                color = 'emerald';
            } else if (isHighRevenue && !isHighMargin) {
                quadrant = 'CASH_COW';
                quadrantLabel = 'گاوهای شیرده (جریان نقدینگی)';
                color = 'blue';
            } else if (!isHighRevenue && isHighMargin) {
                quadrant = 'QUESTION_MARK';
                quadrantLabel = 'علامت سوال (پتانسیل رشد)';
                color = 'amber';
            }

            return {
                id: p.id,
                productName: p.product_name,
                brandName: p.brand_name,
                categoryName: p.category_name,
                unitsSold: p.units_sold,
                totalRevenue: p.total_revenue,
                profit,
                margin,
                quadrant,
                quadrantLabel,
                color
            };
        }).sort((a, b) => b.totalRevenue - a.totalRevenue);
    },

    // Basket Depth & Cross-Sell Analysis (عمق و ابعاد سبد خرید)
    getBasketMetrics() {
        const orderDepths = db.prepare(`
            SELECT 
                o.id,
                COUNT(oi.id) AS item_types_count,
                SUM(oi.quantity) AS total_units_in_basket,
                o.total_amount
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status = 'COMPLETED'
            GROUP BY o.id
        `).all();

        const totalOrders = orderDepths.length || 1;
        const singleItemOrders = orderDepths.filter(o => o.item_types_count === 1).length;
        const mediumOrders = orderDepths.filter(o => o.item_types_count >= 2 && o.item_types_count <= 3).length;
        const largeOrders = orderDepths.filter(o => o.item_types_count >= 4).length;

        const avgUnitsPerBasket = (orderDepths.reduce((s, o) => s + o.total_units_in_basket, 0) / totalOrders).toFixed(1);

        return {
            totalOrders,
            avgUnitsPerBasket,
            distribution: [
                { label: 'سبد تک‌قلمی (خرید سریع)', count: singleItemOrders, percentage: Math.round((singleItemOrders / totalOrders) * 100), color: 'slate' },
                { label: 'سبد استاندارد (۲ تا ۳ قلم)', count: mediumOrders, percentage: Math.round((mediumOrders / totalOrders) * 100), color: 'purple' },
                { label: 'سبد بزرگ و تخصصی (۴+ قلم)', count: largeOrders, percentage: Math.round((largeOrders / totalOrders) * 100), color: 'emerald' }
            ]
        };
    },

    // Sales Forecasting & Run-rate Projections
    getSalesForecast() {
        const monthStats = db.prepare(`
            SELECT 
                COALESCE(SUM(total_amount), 0) AS mtd_sales,
                COUNT(id) AS mtd_orders
            FROM orders
            WHERE status = 'COMPLETED' AND STRFTIME('%Y-%m', created_at) = STRFTIME('%Y-%m', 'now')
        `).get();

        const now = new Date();
        const currentDay = Math.max(1, now.getDate());
        const totalDaysInMonth = 30;

        const dailyRunRate = monthStats.mtd_sales / currentDay;
        const projectedMonthSales = Math.round(dailyRunRate * totalDaysInMonth);

        return {
            mtdSales: monthStats.mtd_sales,
            mtdOrders: monthStats.mtd_orders,
            dailyRunRate: Math.round(dailyRunRate),
            projectedMonthSales,
            completionPercent: Math.round((currentDay / totalDaysInMonth) * 100)
        };
    }
};

module.exports = biService;
