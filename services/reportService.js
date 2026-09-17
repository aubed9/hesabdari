// Reports & Management Accounting Service (گزارشات مدیریتی و حسابداری پیشرفته آرایشی)
const db = require('../db/database');
const { roundMoney } = require('../utils/textUtils');

const reportService = {
    // 1. Daily Z-Report (گزارش پایان روز و بستن شیفت صندوق - تطبیق دخل و دستگاه‌های پوز)
    getDailyZReport(targetDate = null) {
        const dateStr = targetDate || db.prepare(`SELECT DATE('now') AS d`).get().d;

        // Sales Aggregates for the Day
        const salesStats = db.prepare(`
            SELECT 
                COUNT(id) AS total_invoices,
                COALESCE(SUM(subtotal), 0) AS gross_sales,
                COALESCE(SUM(discount_amount), 0) AS total_discounts,
                COALESCE(SUM(tax_amount), 0) AS total_tax,
                COALESCE(SUM(total_amount), 0) AS net_sales,
                COALESCE(SUM(total_cost), 0) AS total_cogs,
                COALESCE(AVG(total_amount), 0) AS average_order_value
            FROM orders
            WHERE status = 'COMPLETED' AND DATE(created_at) = ?
        `).get(dateStr);

        const grossProfit = salesStats.net_sales - salesStats.total_cogs;
        const profitMargin = salesStats.net_sales > 0 ? roundMoney((grossProfit / salesStats.net_sales) * 100) : 0;

        // Payments Breakdown by Terminal / Channel (تطبیق تراکنش‌های صندوق و پوز)
        const paymentRows = db.prepare(`
            SELECT 
                p.payment_method,
                COUNT(p.id) AS tx_count,
                COALESCE(SUM(p.amount), 0) AS total_amount
            FROM payments p
            JOIN orders o ON p.order_id = o.id
            WHERE o.status = 'COMPLETED' AND DATE(p.created_at) = ?
            GROUP BY p.payment_method
        `).all(dateStr);

        let cashCollected = 0;
        let cardTotal = 0;
        let walletTotal = 0;
        let terminalSaman = { count: 0, amount: 0 };
        let terminalMellat = { count: 0, amount: 0 };

        for (const row of paymentRows) {
            if (row.payment_method === 'CASH') {
                cashCollected = row.total_amount;
            } else if (row.payment_method === 'WALLET') {
                walletTotal = row.total_amount;
            } else if (row.payment_method === 'CARD') {
                cardTotal = row.total_amount;
                // Split between POS Terminals (Saman: 55%, Mellat: 45% simulation)
                terminalSaman = {
                    count: Math.ceil(row.tx_count * 0.55),
                    amount: roundMoney(row.total_amount * 0.55)
                };
                terminalMellat = {
                    count: Math.floor(row.tx_count * 0.45),
                    amount: roundMoney(row.total_amount - terminalSaman.amount)
                };
            }
        }

        // Returns and Refunds for the Day
        const returnsStats = db.prepare(`
            SELECT 
                COUNT(r.id) AS return_count,
                COALESCE(SUM(r.total_refund), 0) AS total_refunds
            FROM returns r
            WHERE DATE(r.created_at) = ?
        `).get(dateStr);

        // Cash Session Status & Drawer Balancing (مغایرت کسری و اضافی صندوق)
        const session = db.prepare(`
            SELECT 
                cs.*,
                u.full_name AS cashier_name
            FROM cash_sessions cs
            JOIN users u ON cs.employee_id = u.id
            WHERE DATE(cs.opening_time) = ?
            ORDER BY cs.id DESC LIMIT 1
        `).get(dateStr);

        const openingBalance = session ? session.opening_balance : 1000000;
        const expectedCashInDrawer = openingBalance + cashCollected;
        const actualClosingCash = session && session.actual_balance ? session.actual_balance : expectedCashInDrawer;
        const cashVariance = session && session.variance !== undefined ? session.variance : (actualClosingCash - expectedCashInDrawer); // Negative = Shortage, Positive = Overage

        // Cashiers / Shifts Sales Breakdown
        const cashierBreakdown = db.prepare(`
            SELECT 
                u.full_name AS cashier_name,
                u.role,
                COUNT(o.id) AS invoice_count,
                COALESCE(SUM(o.total_amount), 0) AS total_sales
            FROM orders o
            JOIN users u ON o.employee_id = u.id
            WHERE o.status = 'COMPLETED' AND DATE(o.created_at) = ?
            GROUP BY u.id
            ORDER BY total_sales DESC
        `).all(dateStr);

        // Operating Expenses Logged on that Date
        const dailyExpenses = db.prepare(`
            SELECT 
                category,
                description,
                amount
            FROM expenses
            WHERE DATE(payment_date) = ?
        `).all(dateStr);
        const totalExpenses = dailyExpenses.reduce((sum, e) => sum + e.amount, 0);

        return {
            date: dateStr,
            salesSummary: {
                totalInvoices: salesStats.total_invoices,
                grossSales: salesStats.gross_sales,
                totalDiscounts: salesStats.total_discounts,
                netSales: salesStats.net_sales,
                totalCogs: salesStats.total_cogs,
                grossProfit: grossProfit,
                profitMargin: profitMargin,
                averageOrderValue: Math.round(salesStats.average_order_value)
            },
            paymentBreakdown: {
                cash: cashCollected,
                cardTotal: cardTotal,
                terminalSaman: terminalSaman,
                terminalMellat: terminalMellat,
                wallet: walletTotal
            },
            cashDrawerReconciliation: {
                openingBalance: openingBalance,
                cashSalesAdded: cashCollected,
                expectedInDrawer: expectedCashInDrawer,
                actualClosingCount: actualClosingCash,
                variance: cashVariance,
                varianceStatus: cashVariance === 0 ? 'BALANCED' : (cashVariance < 0 ? 'SHORTAGE' : 'OVERAGE')
            },
            returnsSummary: {
                count: returnsStats.return_count,
                totalRefunds: returnsStats.total_refunds
            },
            cashierBreakdown,
            dailyExpenses: {
                items: dailyExpenses,
                total: totalExpenses
            },
            netShiftCashFlow: salesStats.net_sales - totalExpenses
        };
    },

    // 2. Category & Cosmetics Line Profitability (سودآوری دسته‌بندی‌ها و لاین‌های آرایشی و مراقبتی)
    getCategoryPerformance() {
        const rows = db.prepare(`
            SELECT 
                c.id AS category_id,
                c.name_fa AS category_name,
                COUNT(oi.id) AS total_units_sold,
                COALESCE(SUM(oi.total_price), 0) AS gross_revenue,
                COALESCE(SUM(oi.unit_cost * oi.quantity), 0) AS total_cogs
            FROM categories c
            JOIN products p ON c.id = p.category_id
            JOIN product_variants pv ON p.id = pv.product_id
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'COMPLETED'
            GROUP BY c.id
            ORDER BY gross_revenue DESC
        `).all();

        const grandTotalRevenue = rows.reduce((sum, r) => sum + r.gross_revenue, 0);

        return rows.map(r => {
            const grossProfit = r.gross_revenue - r.total_cogs;
            const margin = r.gross_revenue > 0 ? roundMoney((grossProfit / r.gross_revenue) * 100) : 0;
            const shareOfTotal = grandTotalRevenue > 0 ? roundMoney((r.gross_revenue / grandTotalRevenue) * 100) : 0;

            return {
                categoryId: r.category_id,
                categoryName: r.category_name,
                unitsSold: r.total_units_sold,
                revenue: r.gross_revenue,
                cogs: r.total_cogs,
                grossProfit: grossProfit,
                marginPercent: margin,
                revenueSharePercent: shareOfTotal
            };
        });
    },

    // 3. Brand Performance & Margin Matrix (ماتریس عملکرد، فروش و مارجین برندها)
    getBrandMatrix() {
        const rows = db.prepare(`
            SELECT 
                b.id AS brand_id,
                b.name AS brand_name,
                b.name_fa AS brand_name_fa,
                b.country,
                COUNT(DISTINCT p.id) AS total_products,
                COUNT(oi.id) AS units_sold,
                COALESCE(SUM(oi.total_price), 0) AS gross_sales,
                COALESCE(SUM(oi.unit_cost * oi.quantity), 0) AS total_cogs
            FROM brands b
            JOIN products p ON b.id = p.brand_id
            JOIN product_variants pv ON p.id = pv.product_id
            LEFT JOIN order_items oi ON pv.id = oi.product_variant_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'COMPLETED'
            GROUP BY b.id
            ORDER BY gross_sales DESC
        `).all();

        const grandSales = rows.reduce((sum, r) => sum + r.gross_sales, 0);

        return rows.map(r => {
            const profit = r.gross_sales - r.total_cogs;
            const margin = r.gross_sales > 0 ? roundMoney((profit / r.gross_sales) * 100) : 0;
            const share = grandSales > 0 ? roundMoney((r.gross_sales / grandSales) * 100) : 0;

            return {
                brandId: r.brand_id,
                brandName: r.brand_name,
                brandNameFa: r.brand_name_fa,
                country: r.country_of_origin || 'خارجی',
                productCount: r.total_products,
                unitsSold: r.units_sold,
                sales: r.gross_sales,
                cogs: r.total_cogs,
                grossProfit: profit,
                marginPercent: margin,
                marketShare: share
            };
        });
    },

    // 4. Testers, Samples & Shrinkage Report (هزینه تسترها، سمپل‌ها و ضایعات انقضا)
    getTestersAndShrinkage() {
        // Active & Depleted Testers
        const testers = db.prepare(`
            SELECT 
                t.*,
                t.remaining_percentage AS volume_percentage_left,
                COALESCE(ib.purchase_price, pv.selling_price * 0.65) AS cost_price,
                pv.shade,
                pv.barcode,
                p.name_fa AS product_name,
                b.name AS brand_name
            FROM testers t
            JOIN product_variants pv ON t.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON t.batch_id = ib.id
            ORDER BY t.opened_at DESC
        `).all();

        let totalTesterCostAssigned = 0;
        let totalTesterAmortizedCost = 0; // Value consumed based on percentage

        for (const t of testers) {
            totalTesterCostAssigned += t.cost_price;
            const consumedPercent = (100 - (t.volume_percentage_left || 100)) / 100;
            totalTesterAmortizedCost += roundMoney(t.cost_price * consumedPercent);
        }

        // Near-Expiry / Expired Shrinkage Risk
        const expiredLoss = db.prepare(`
            SELECT 
                COUNT(id) AS batches_count,
                COALESCE(SUM(quantity), 0) AS total_units,
                COALESCE(SUM(quantity * purchase_price), 0) AS total_loss_value
            FROM inventory_batches
            WHERE quantity > 0 AND julianday(expiry_date) < julianday('now')
        `).get();

        const criticalNearExpiry = db.prepare(`
            SELECT 
                COUNT(id) AS batches_count,
                COALESCE(SUM(quantity), 0) AS total_units,
                COALESCE(SUM(quantity * purchase_price), 0) AS total_risk_value
            FROM inventory_batches
            WHERE quantity > 0 AND (julianday(expiry_date) - julianday('now')) BETWEEN 0 AND 30
        `).get();

        return {
            testersList: testers,
            testersSummary: {
                totalActiveTesters: testers.filter(t => t.status === 'ACTIVE').length,
                totalRetiredTesters: testers.filter(t => t.status !== 'ACTIVE').length,
                totalCostInvested: totalTesterCostAssigned,
                totalCostAmortized: totalTesterAmortizedCost,
                accountingAccount: '۶۰۴ - هزینه تستر و نمونه‌برداری'
            },
            shrinkageAndLoss: {
                expiredLossValue: expiredLoss.total_loss_value,
                expiredUnits: expiredLoss.total_units,
                criticalRiskValue: criticalNearExpiry.total_risk_value,
                criticalRiskUnits: criticalNearExpiry.total_units,
                accountingAccount: '۶۰۷ - هزینه ضایعات و انقضای کالا'
            }
        };
    },

    // 5. Discounts, Loyalty Redemptions & Returns Audit (ممیزی تخفیفات، بن‌های وفاداری و مرجوعی‌ها)
    getDiscountsAndReturnsAudit() {
        // Discounts breakdown
        const discounts = db.prepare(`
            SELECT 
                COALESCE(discount_reason, 'تخفیف دستی صندوق‌دار') AS reason,
                COUNT(id) AS count,
                COALESCE(SUM(discount_amount), 0) AS total_discount_amount
            FROM orders
            WHERE discount_amount > 0 AND status = 'COMPLETED'
            GROUP BY reason
            ORDER BY total_discount_amount DESC
        `).all();

        const totalDiscountsGiven = discounts.reduce((sum, d) => sum + d.total_discount_amount, 0);

        // Returns breakdown
        const returns = db.prepare(`
            SELECT 
                r.reason,
                COALESCE(ri.is_opened, 0) AS is_opened,
                COUNT(r.id) AS return_count,
                COALESCE(SUM(r.total_refund), 0) AS total_refund_amount
            FROM returns r
            LEFT JOIN return_items ri ON r.id = ri.return_id
            GROUP BY r.reason, is_opened
            ORDER BY total_refund_amount DESC
        `).all();

        const totalRefundsGiven = returns.reduce((sum, r) => sum + r.total_refund_amount, 0);

        return {
            discounts: {
                items: discounts,
                totalAmount: totalDiscountsGiven
            },
            returns: {
                items: returns,
                totalAmount: totalRefundsGiven
            }
        };
    },

    // 6. Four-Column Trial Balance (تراز آزمایشی ۴ ستونی استاندارد حسابداری دوبل با فیلتر اسناد قطعی)
    getFourColumnTrialBalance() {
        const accounts = db.prepare(`
            SELECT 
                coa.id,
                coa.code,
                coa.name,
                coa.name_fa,
                coa.type,
                ROUND(COALESCE(SUM(pl.debit), 0), 2) AS period_debit,
                ROUND(COALESCE(SUM(pl.credit), 0), 2) AS period_credit
            FROM chart_of_accounts coa
            LEFT JOIN (
                SELECT jl.account_id, jl.debit, jl.credit
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.is_posted = 1
            ) pl ON coa.id = pl.account_id
            GROUP BY coa.id
            ORDER BY coa.code ASC
        `).all();


        let totalPeriodDebit = 0;
        let totalPeriodCredit = 0;
        let totalDebitBalance = 0;
        let totalCreditBalance = 0;

        const reportRows = accounts.map(a => {
            totalPeriodDebit += a.period_debit;
            totalPeriodCredit += a.period_credit;

            let debitBalance = 0;
            let creditBalance = 0;

            if (a.type === 'ASSET' || a.type === 'EXPENSE' || a.type === 'COGS') {
                const diff = a.period_debit - a.period_credit;
                if (diff >= 0) debitBalance = diff;
                else creditBalance = Math.abs(diff);
            } else {
                const diff = a.period_credit - a.period_debit;
                if (diff >= 0) creditBalance = diff;
                else debitBalance = Math.abs(diff);
            }

            totalDebitBalance += debitBalance;
            totalCreditBalance += creditBalance;

            return {
                id: a.id,
                code: a.code,
                nameFa: a.name_fa,
                name: a.name,
                type: a.type,
                periodDebit: a.period_debit,
                periodCredit: a.period_credit,
                debitBalance: roundMoney(debitBalance),
                creditBalance: roundMoney(creditBalance)
            };
        });

        const turnDiscrepancy = roundMoney(Math.abs(totalPeriodDebit - totalPeriodCredit));
        const balanceDiscrepancy = roundMoney(Math.abs(totalDebitBalance - totalCreditBalance));

        return {
            rows: reportRows,
            totals: {
                totalPeriodDebit: roundMoney(totalPeriodDebit),
                totalPeriodCredit: roundMoney(totalPeriodCredit),
                totalDebitBalance: roundMoney(totalDebitBalance),
                totalCreditBalance: roundMoney(totalCreditBalance),
                isBalanced: turnDiscrepancy === 0 && balanceDiscrepancy === 0,
                turnDiscrepancy,
                balanceDiscrepancy
            }
        };
    }
};

module.exports = reportService;
