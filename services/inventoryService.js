// Inventory, Batches, FEFO, Expiry & Tester Management Service
const db = require('../db/database');

const inventoryService = {
    // Real-time stock across all variants
    getAllStock() {
        return db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.id AS product_id,
                p.name AS product_name,
                p.name_fa AS product_name_fa,
                b.name AS brand_name,
                c.name_fa AS category_name,
                pv.shade,
                pv.color_hex,
                pv.volume,
                pv.sku,
                pv.barcode,
                pv.purchase_price,
                pv.selling_price,
                pv.safety_stock,
                pv.reorder_point,
                COALESCE(SUM(ib.quantity), 0) AS total_stock,
                COALESCE(SUM(ib.quantity * pv.purchase_price), 0) AS total_cost_value,
                COALESCE(SUM(ib.quantity * pv.selling_price), 0) AS total_retail_value,
                COUNT(ib.id) AS batch_count,
                MIN(ib.expiry_date) AS earliest_expiry
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE pv.is_active = 1
            GROUP BY pv.id
            ORDER BY total_stock ASC, earliest_expiry ASC
        `).all();
    },

    // Get detailed batches for a specific product variant
    getBatchesByVariant(variantId) {
        return db.prepare(`
            SELECT 
                ib.*,
                s.name AS supplier_name,
                w.name AS warehouse_name,
                CAST((julianday(ib.expiry_date) - julianday('now')) AS INTEGER) AS days_until_expiry
            FROM inventory_batches ib
            LEFT JOIN suppliers s ON ib.supplier_id = s.id
            LEFT JOIN warehouses w ON ib.warehouse_id = w.id
            WHERE ib.product_variant_id = ?
            ORDER BY ib.expiry_date ASC
        `).all(variantId);
    },

    // Expiry breakdown buckets (Expired, 0-30d, 31-60d, 61-90d, 91-180d, 180+d)
    getExpiryAnalysis() {
        const query = `
            SELECT 
                ib.id AS batch_id,
                ib.batch_number,
                ib.expiry_date,
                ib.quantity,
                ib.purchase_price,
                pv.selling_price,
                pv.shade,
                p.name_fa AS product_name,
                b.name AS brand_name,
                CAST((julianday(ib.expiry_date) - julianday('now')) AS INTEGER) AS days_left
            FROM inventory_batches ib
            JOIN product_variants pv ON ib.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            WHERE ib.quantity > 0
            ORDER BY ib.expiry_date ASC
        `;
        const batches = db.prepare(query).all();

        const buckets = {
            expired: { label: 'منقضی شده', count: 0, quantity: 0, costValue: 0, items: [] },
            days_0_30: { label: '۰ تا ۳۰ روز (بحرانی)', count: 0, quantity: 0, costValue: 0, items: [] },
            days_31_60: { label: '۳۱ تا ۶۰ روز (نزدیک انقضا)', count: 0, quantity: 0, costValue: 0, items: [] },
            days_61_90: { label: '۶۱ تا ۹۰ روز (هشدار متوسط)', count: 0, quantity: 0, costValue: 0, items: [] },
            days_91_180: { label: '۹۱ تا ۱۸۰ روز', count: 0, quantity: 0, costValue: 0, items: [] },
            days_180_plus: { label: 'بیش از ۱۸۰ روز (سالم)', count: 0, quantity: 0, costValue: 0, items: [] }
        };

        for (const b of batches) {
            const costVal = b.quantity * b.purchase_price;
            let target;
            if (b.days_left < 0) target = buckets.expired;
            else if (b.days_left <= 30) target = buckets.days_0_30;
            else if (b.days_left <= 60) target = buckets.days_31_60;
            else if (b.days_left <= 90) target = buckets.days_61_90;
            else if (b.days_left <= 180) target = buckets.days_91_180;
            else target = buckets.days_180_plus;

            target.count++;
            target.quantity += b.quantity;
            target.costValue += costVal;
            target.items.push(b);
        }

        return buckets;
    },

    // Convert stock item to tester (کاهش موجودی انبار + افزایش تستر + سند اتوماتیک هزینه تستر)
    convertToTester({ variantId, batchId, quantity = 1, employeeId = 1, note = '' }) {
        const convertTx = db.transaction(() => {
            const batch = db.prepare(`SELECT * FROM inventory_batches WHERE id = ?`).get(batchId);
            if (!batch || batch.quantity < quantity) {
                throw new Error('موجودی بچ برای تبدیل به تستر کافی نیست');
            }

            // 1. Deduct batch quantity
            db.prepare(`UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?`).run(quantity, batchId);

            // 2. Insert Tester Record
            const testerRes = db.prepare(`
                INSERT INTO testers (product_variant_id, batch_id, warehouse_id, initial_quantity, remaining_percentage, employee_id, status, note)
                VALUES (?, ?, ?, ?, 100, ?, 'ACTIVE', ?)
            `).run(variantId, batchId, batch.warehouse_id, quantity, employeeId, note);
            const testerId = testerRes.lastInsertRowid;

            // 3. Log Stock Transaction
            const totalCost = batch.purchase_price * quantity;
            db.prepare(`
                INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note)
                VALUES (?, ?, ?, 'TESTER', ?, ?, 'TESTER_CONVERT', ?, ?, ?)
            `).run(variantId, batchId, batch.warehouse_id, -quantity, batch.purchase_price, testerId, employeeId, note || 'تبدیل کالای انبار به تستر فروشگاهی');

            // 4. Double-Entry Accounting Entry:
            // Debit 604 (Tester & Sampling Expense)
            // Credit 103 (Merchandise Inventory)
            const accTesterExp = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '604'`).get().id;
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const entryNumber = `JE-TST-${Date.now().toString().slice(-6)}`;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, DATE('now'), ?, 'TESTER_EXPENSE', ?, 1, ?)
            `).run(entryNumber, `سند هزینه تستر آرایشی برای بچ ${batch.batch_number}`, testerId, employeeId);
            const jId = jRes.lastInsertRowid;

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, 'هزینه تستر و بازاریابی کالا')
            `).run(jId, accTesterExp, totalCost);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, 'کاهش موجودی کالا بابت تستر')
            `).run(jId, accInv, totalCost);

            return { testerId, totalCost };
        });

        return convertTx();
    },

    // Get all testers and their current status
    getAllTesters() {
        return db.prepare(`
            SELECT 
                t.*,
                pv.shade,
                pv.volume,
                pv.color_hex,
                p.name_fa AS product_name,
                b.name AS brand_name,
                ib.batch_number,
                ib.expiry_date,
                u.full_name AS employee_name
            FROM testers t
            JOIN product_variants pv ON t.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON t.batch_id = ib.id
            LEFT JOIN users u ON t.employee_id = u.id
            ORDER BY t.opened_at DESC
        `).all();
    },

    // Update tester remaining percentage or status
    updateTesterStatus(testerId, remainingPercentage, status, note = '') {
        db.prepare(`
            UPDATE testers 
            SET remaining_percentage = ?,
                status = ?,
                note = COALESCE(?, note)
            WHERE id = ?
        `).run(remainingPercentage, status, note, testerId);
        return { success: true };
    },

    // Stock count (انبارگردانی): Start new stock count session
    createStockCount(warehouseId = 1, conductedBy = 1, notes = '') {
        const countTx = db.transaction(() => {
            const scRes = db.prepare(`
                INSERT INTO stock_counts (warehouse_id, status, conducted_by, notes)
                VALUES (?, 'IN_PROGRESS', ?, ?)
            `).run(warehouseId, conductedBy, notes);
            const countId = scRes.lastInsertRowid;

            // Pre-fill stock count items with current system quantities
            const activeBatches = db.prepare(`
                SELECT id, product_variant_id, quantity, purchase_price
                FROM inventory_batches
                WHERE warehouse_id = ? AND quantity > 0
            `).all(warehouseId);

            const insertItem = db.prepare(`
                INSERT INTO stock_count_items (stock_count_id, product_variant_id, batch_id, system_quantity, counted_quantity, unit_cost)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const b of activeBatches) {
                // counted_quantity defaults to system_quantity until edited by stockkeeper
                insertItem.run(countId, b.product_variant_id, b.id, b.quantity, b.quantity, b.purchase_price);
            }

            return countId;
        });

        return countTx();
    },

    // Get stock count items
    getStockCountDetails(countId) {
        const count = db.prepare(`
            SELECT sc.*, u.full_name AS conducted_by_name, w.name AS warehouse_name
            FROM stock_counts sc
            JOIN users u ON sc.conducted_by = u.id
            JOIN warehouses w ON sc.warehouse_id = w.id
            WHERE sc.id = ?
        `).get(countId);

        if (!count) return null;

        const items = db.prepare(`
            SELECT 
                sci.*,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                ib.batch_number,
                ib.expiry_date
            FROM stock_count_items sci
            JOIN product_variants pv ON sci.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON sci.batch_id = ib.id
            WHERE sci.stock_count_id = ?
        `).all(countId);

        return { ...count, items };
    },

    // Update counted quantity
    updateStockCountItem(itemId, countedQuantity) {
        db.prepare(`UPDATE stock_count_items SET counted_quantity = ? WHERE id = ?`).run(countedQuantity, itemId);
        return { success: true };
    },

    // Finalize stock count and adjust inventory & accounting
    finalizeStockCount(countId, approvedBy = 1) {
        const finalizeTx = db.transaction(() => {
            const items = db.prepare(`SELECT * FROM stock_count_items WHERE stock_count_id = ?`).all(countId);
            let totalCostVariance = 0;

            for (const it of items) {
                const diff = it.counted_quantity - it.system_quantity;
                if (diff !== 0) {
                    // Update batch quantity to match physical count
                    db.prepare(`UPDATE inventory_batches SET quantity = ? WHERE id = ?`).run(it.counted_quantity, it.batch_id);

                    // Record transaction
                    db.prepare(`
                        INSERT INTO stock_transactions (
                            product_variant_id, batch_id, warehouse_id, transaction_type,
                            quantity, unit_cost, reference_type, reference_id, employee_id, note
                        ) VALUES (?, ?, 1, 'STOCK_COUNT', ?, ?, 'STOCK_COUNT_ADJUST', ?, ?, 'تعدیل ناشی از انبارگردانی')
                    `).run(it.product_variant_id, it.batch_id, diff, it.unit_cost, countId, approvedBy);

                    totalCostVariance += (diff * it.unit_cost);
                }
            }

            db.prepare(`
                UPDATE stock_counts 
                SET status = 'COMPLETED',
                    approved_by = ?,
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(approvedBy, countId);

            // If there was variance, create journal entry for Variance
            if (totalCostVariance !== 0) {
                const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
                const accVar = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '608'`).get().id;
                const jRes = db.prepare(`
                    INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                    VALUES (?, DATE('now'), ?, 'STOCK_COUNT', ?, 1, ?)
                `).run(`JE-STK-${countId}`, `سند تعدیل انبارگردانی شماره ${countId}`, countId, approvedBy);
                const jId = jRes.lastInsertRowid;

                if (totalCostVariance < 0) {
                    // Inventory shortage (کسری انبار)
                    const absVal = Math.abs(totalCostVariance);
                    db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, 'هزینه کسری انبار')`).run(jId, accVar, absVal);
                    db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, 'کاهش موجودی کالا')`).run(jId, accInv, absVal);
                } else {
                    // Inventory surplus (اضافی انبار)
                    db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, 'افزایش موجودی کالا')`).run(jId, accInv, totalCostVariance);
                    db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, 'درآمد شناسایی اضافه انبار')`).run(jId, accVar, totalCostVariance);
                }
            }

            return { countId, totalCostVariance };
        });

        return finalizeTx();
    },

    // Smart Reorder Point & Purchase Suggestion Algorithm
    getReorderSuggestions() {
        const variants = db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                pv.sku,
                pv.purchase_price,
                pv.safety_stock,
                pv.reorder_point,
                COALESCE(SUM(ib.quantity), 0) AS current_stock,
                COALESCE(s.lead_time_days, 5) AS lead_time_days,
                s.id AS supplier_id,
                s.name AS supplier_name,
                (
                    SELECT COALESCE(SUM(oi.quantity), 0)
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    WHERE oi.product_variant_id = pv.id
                      AND o.created_at >= DATETIME('now', '-30 days')
                ) AS units_sold_30d
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            LEFT JOIN suppliers s ON b.supplier_id = s.id
            WHERE pv.is_active = 1
            GROUP BY pv.id
        `).all();

        const suggestions = [];

        for (const v of variants) {
            const dailyVelocity = v.units_sold_30d / 30;
            const leadTimeDemand = Math.ceil(dailyVelocity * v.lead_time_days);
            const dynamicReorderPoint = Math.max(v.reorder_point, leadTimeDemand + v.safety_stock);

            if (v.current_stock <= dynamicReorderPoint) {
                // Target: 30 days of inventory coverage + safety stock
                const targetStock = Math.ceil(dailyVelocity * 30) + v.safety_stock;
                const suggestedQty = Math.max(targetStock - v.current_stock, 10);

                suggestions.push({
                    variantId: v.variant_id,
                    productName: v.product_name,
                    brandName: v.brand_name,
                    shade: v.shade,
                    sku: v.sku,
                    currentStock: v.current_stock,
                    safetyStock: v.safety_stock,
                    reorderPoint: dynamicReorderPoint,
                    dailySales: Number(dailyVelocity.toFixed(2)),
                    leadTimeDays: v.lead_time_days,
                    suggestedQuantity: suggestedQty,
                    estimatedCost: suggestedQty * v.purchase_price,
                    supplierId: v.supplier_id,
                    supplierName: v.supplier_name,
                    urgency: v.current_stock === 0 ? 'CRITICAL' : (v.current_stock <= v.safety_stock ? 'HIGH' : 'MEDIUM')
                });
            }
        }

        return suggestions.sort((a, b) => (a.currentStock - b.currentStock));
    },

    // Stock Transactions Audit
    getStockTransactions(limit = 100) {
        return db.prepare(`
            SELECT 
                st.*,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                ib.batch_number,
                u.full_name AS employee_name
            FROM stock_transactions st
            JOIN product_variants pv ON st.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON st.batch_id = ib.id
            LEFT JOIN users u ON st.employee_id = u.id
            ORDER BY st.created_at DESC
            LIMIT ?
        `).all(limit);
    }
};

module.exports = inventoryService;
