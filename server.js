// Main Express Server for Arayeshi Retail ERP
const express = require('express');
const cors = require('cors');
const path = require('path');

if (process.stdout && process.stdout.on) {
    process.stdout.on('error', (err) => { if (err.code === 'EPIPE') return; });
}
if (process.stderr && process.stderr.on) {
    process.stderr.on('error', (err) => { if (err.code === 'EPIPE') return; });
}

const db = require('./db/database');
const posService = require('./services/posService');
const inventoryService = require('./services/inventoryService');
const accountingService = require('./services/accountingService');
const crmService = require('./services/crmService');
const biService = require('./services/biService');
const reportService = require('./services/reportService');
const marketingService = require('./services/marketingService');

const app = express();
const PORT = process.env.PORT || 4200; // Dedicated non-conflicting port

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. EXECUTIVE DASHBOARD & BI APIS
// ==========================================
app.get('/api/dashboard/overview', (req, res) => {
    try {
        const { range, start, end } = req.query;
        const data = biService.getExecutiveDashboard(range || 'TODAY', start, end);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/sales-trend', (req, res) => {
    try {
        const data = biService.getSalesTrend();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/sales-heatmap', (req, res) => {
    try {
        const data = biService.getSalesHeatmap();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/abc-analysis', (req, res) => {
    try {
        const data = biService.getABCAnalysis();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/brand-performance', (req, res) => {
    try {
        const data = biService.getBrandPerformance();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/gmroi', (req, res) => {
    try {
        const data = biService.getGMROIReport();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/dead-stock', (req, res) => {
    try {
        const data = biService.getDeadStockReport();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/dashboard/insights', (req, res) => {
    try {
        const data = biService.generateInsights();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 2. POS & CHECKOUT APIS
// ==========================================
app.get('/api/pos/products', (req, res) => {
    try {
        const query = req.query.q || '';
        const products = posService.searchVariants(query);
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/pos/barcode/:barcode', (req, res) => {
    try {
        const item = posService.getByBarcode(req.params.barcode);
        if (!item) return res.status(404).json({ success: false, error: 'محصولی با این بارکد یافت نشد' });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/pos/recommendations', (req, res) => {
    try {
        const { variantIds } = req.body;
        const recs = posService.getCartRecommendations(variantIds || []);
        res.json({ success: true, data: recs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/pos/checkout', (req, res) => {
    try {
        const result = posService.createOrder(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/pos/active-session', (req, res) => {
    try {
        const session = posService.getActiveCashSession();
        res.json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/pos/close-session', (req, res) => {
    try {
        const { sessionId, actualBalance, notes } = req.body;
        const result = posService.closeCashSession(sessionId, actualBalance, notes);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/pos/returns', (req, res) => {
    try {
        const result = posService.processReturn(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/pos/exchanges', (req, res) => {
    try {
        const result = posService.processExchange(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/orders', (req, res) => {
    try {
        const orders = db.prepare(`
            SELECT 
                o.*,
                c.full_name AS customer_name,
                u.full_name AS cashier_name,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            LEFT JOIN users u ON o.employee_id = u.id
            ORDER BY o.created_at DESC
            LIMIT 100
        `).all();
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/orders/:id', (req, res) => {
    try {
        const order = posService.getOrderDetails(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'سفارش یافت نشد' });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 3. INVENTORY, FEFO & TESTER APIS
// ==========================================
app.get('/api/inventory/stock', (req, res) => {
    try {
        const stock = inventoryService.getAllStock();
        res.json({ success: true, data: stock });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/batches/:variantId', (req, res) => {
    try {
        const batches = inventoryService.getBatchesByVariant(req.params.variantId);
        res.json({ success: true, data: batches });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/expiry-analysis', (req, res) => {
    try {
        const analysis = inventoryService.getExpiryAnalysis();
        res.json({ success: true, data: analysis });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/inventory/convert-tester', (req, res) => {
    try {
        const result = inventoryService.convertToTester(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/testers', (req, res) => {
    try {
        const testers = inventoryService.getAllTesters();
        res.json({ success: true, data: testers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/inventory/testers/:id', (req, res) => {
    try {
        const { remainingPercentage, status, note } = req.body;
        const result = inventoryService.updateTesterStatus(req.params.id, remainingPercentage, status, note);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/reorder-suggestions', (req, res) => {
    try {
        const suggestions = inventoryService.getReorderSuggestions();
        res.json({ success: true, data: suggestions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/transactions', (req, res) => {
    try {
        const txs = inventoryService.getStockTransactions(req.query.limit ? Number(req.query.limit) : 100);
        res.json({ success: true, data: txs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Stock Count (انبارگردانی)
app.post('/api/inventory/stock-count', (req, res) => {
    try {
        const { warehouseId, conductedBy, notes } = req.body;
        const countId = inventoryService.createStockCount(warehouseId, conductedBy, notes);
        res.json({ success: true, data: { countId } });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/inventory/stock-count/:id', (req, res) => {
    try {
        const details = inventoryService.getStockCountDetails(req.params.id);
        res.json({ success: true, data: details });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/inventory/stock-count/item/:itemId', (req, res) => {
    try {
        const { countedQuantity } = req.body;
        inventoryService.updateStockCountItem(req.params.itemId, countedQuantity);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/inventory/stock-count/:id/finalize', (req, res) => {
    try {
        const { approvedBy } = req.body;
        const result = inventoryService.finalizeStockCount(req.params.id, approvedBy);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 4. PRODUCTS, BRANDS & CATEGORIES APIS
// ==========================================
app.get('/api/products', (req, res) => {
    try {
        const products = db.prepare(`
            SELECT 
                p.*,
                b.name AS brand_name,
                c.name_fa AS category_name,
                (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variant_count,
                (
                    SELECT COALESCE(SUM(ib.quantity), 0)
                    FROM inventory_batches ib
                    JOIN product_variants pv ON ib.product_variant_id = pv.id
                    WHERE pv.product_id = p.id
                ) AS total_stock
            FROM products p
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            ORDER BY p.id DESC
        `).all();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/brands', (req, res) => {
    try {
        const brands = db.prepare(`
            SELECT 
                b.*,
                COUNT(DISTINCT p.id) AS products_count,
                s.name AS supplier_name
            FROM brands b
            LEFT JOIN products p ON b.id = p.brand_id
            LEFT JOIN suppliers s ON b.supplier_id = s.id
            WHERE b.is_active = 1
            GROUP BY b.id
            ORDER BY b.name ASC
        `).all();
        res.json({ success: true, data: brands });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/categories', (req, res) => {
    try {
        const categories = db.prepare(`SELECT * FROM categories WHERE is_active = 1 ORDER BY parent_id ASC, id ASC`).all();
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 5. SUPPLIERS & PURCHASING APIS
// ==========================================
app.get('/api/suppliers', (req, res) => {
    try {
        const suppliers = db.prepare(`
            SELECT 
                s.*,
                COUNT(DISTINCT po.id) AS purchase_orders_count,
                COALESCE(SUM(po.total_amount), 0) AS total_purchases
            FROM suppliers s
            LEFT JOIN purchase_orders po ON s.id = po.supplier_id
            WHERE s.is_active = 1
            GROUP BY s.id
            ORDER BY s.name ASC
        `).all();
        res.json({ success: true, data: suppliers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/purchases', (req, res) => {
    try {
        const { supplierId, warehouseId = 1, items = [], notes = '' } = req.body;
        const poNumber = `PO-${Date.now().toString().slice(-6)}`;

        const result = db.transaction(() => {
            let totalAmount = 0;
            for (const item of items) totalAmount += (item.unitCost * item.quantity);

            const poRes = db.prepare(`
                INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, paid_amount, notes)
                VALUES (?, ?, ?, 'RECEIVED', ?, 0, ?)
            `).run(poNumber, supplierId, warehouseId, totalAmount, notes);
            const poId = poRes.lastInsertRowid;

            for (const item of items) {
                // Insert PO item
                db.prepare(`
                    INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, batch_number, manufacture_date, expiry_date, quantity, unit_cost, total_cost)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(poId, item.variantId, item.batchNumber, item.manufactureDate || null, item.expiryDate, item.quantity, item.unitCost, item.unitCost * item.quantity);

                // Create or add to batch
                const batchRes = db.prepare(`
                    INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, manufacture_date, expiry_date, quantity, purchase_price, supplier_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(item.variantId, warehouseId, item.batchNumber, item.manufactureDate || null, item.expiryDate, item.quantity, item.unitCost, supplierId);
                const batchId = batchRes.lastInsertRowid;

                // Record stock transaction
                db.prepare(`
                    INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note)
                    VALUES (?, ?, ?, 'PURCHASE', ?, ?, 'PURCHASE_ORDER', ?, 1, 'ورود کالا بر اساس فاکتور خرید')
                `).run(item.variantId, batchId, warehouseId, item.quantity, item.unitCost, poId);
            }

            // Automatic Double-Entry Accounting:
            // Debit 103 (Merchandise Inventory)
            // Credit 201 (Accounts Payable)
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, DATE('now'), ?, 'PURCHASE', ?, 1, 1)
            `).run(`JE-PO-${poNumber}`, `سند فاکتور خرید ${poNumber}`, poId);
            const jId = jRes.lastInsertRowid;

            db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, 'افزایش موجودی کالا بابت خرید')`).run(jId, accInv, totalAmount);
            db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, 'بستانکاری تأمین‌کننده بابت خرید')`).run(jId, accAP, totalAmount);

            return { poId, poNumber, totalAmount };
        })();

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 6. CRM, CUSTOMER 360 & LOYALTY APIS
// ==========================================
app.get('/api/crm/customers', (req, res) => {
    try {
        const customers = crmService.getCustomers();
        res.json({ success: true, data: customers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/crm/customers/:id', (req, res) => {
    try {
        const customer = crmService.getCustomerProfile(req.params.id);
        if (!customer) return res.status(404).json({ success: false, error: 'مشتری یافت نشد' });
        res.json({ success: true, data: customer });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/customers', (req, res) => {
    try {
        const { fullName, mobile, email, birthDate, skinType, hairPreferences } = req.body;
        const refCode = 'REF-' + Math.floor(100000 + Math.random() * 900000);
        const result = db.prepare(`
            INSERT INTO customers (full_name, mobile, email, birth_date, skin_type, hair_preferences, referral_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(fullName, mobile, email || null, birthDate || null, skinType || null, hairPreferences || null, refCode);
        res.json({ success: true, data: { customerId: result.lastInsertRowid, referralCode: refCode } });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/convert-points', (req, res) => {
    try {
        const { customerId, points } = req.body;
        const result = crmService.convertPointsToWallet(customerId, points);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/crm/birthdays', (req, res) => {
    try {
        const birthdays = crmService.getUpcomingBirthdays();
        res.json({ success: true, data: birthdays });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7. ACCOUNTING & FINANCIAL APIS
// ==========================================
app.get('/api/accounting/chart-of-accounts', (req, res) => {
    try {
        const coa = accountingService.getChartOfAccounts();
        res.json({ success: true, data: coa });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/journal-entries', (req, res) => {
    try {
        const entries = accountingService.getJournalEntries();
        res.json({ success: true, data: entries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/pnl', (req, res) => {
    try {
        const pnl = accountingService.getProfitAndLoss(req.query.startDate, req.query.endDate);
        res.json({ success: true, data: pnl });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/balance-sheet', (req, res) => {
    try {
        const bs = accountingService.getBalanceSheet();
        res.json({ success: true, data: bs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/trial-balance', (req, res) => {
    try {
        const tb = accountingService.getTrialBalance();
        res.json({ success: true, data: tb });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/expenses', (req, res) => {
    try {
        const expenses = accountingService.getExpenses();
        res.json({ success: true, data: expenses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/expenses', (req, res) => {
    try {
        const result = accountingService.createExpense(req.body);
        res.json({ success: true, data: { expenseId: result } });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/cheques', (req, res) => {
    try {
        const cheques = accountingService.getCheques();
        res.json({ success: true, data: cheques });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/bank-accounts', (req, res) => {
    try {
        const banks = accountingService.getBankAccounts();
        res.json({ success: true, data: banks });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/accounting/aging', (req, res) => {
    try {
        const aging = accountingService.getAgingReport();
        res.json({ success: true, data: aging });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Omnichannel & Online Orders API
app.get('/api/omnichannel/orders', (req, res) => {
    try {
        const orders = db.prepare(`
            SELECT 
                o.*,
                c.full_name AS customer_name,
                c.mobile AS customer_mobile,
                s.courier_name,
                s.tracking_number,
                s.shipping_fee,
                s.delivery_address,
                s.status AS shipment_status
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            LEFT JOIN shipments s ON o.id = s.order_id
            WHERE o.channel != 'STORE_POS'
            ORDER BY o.created_at DESC
        `).all();
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/omnichannel/shipments', (req, res) => {
    try {
        const { orderId, customerId, courierName, trackingNumber, shippingFee, deliveryAddress } = req.body;
        const resStmt = db.prepare(`
            INSERT INTO shipments (order_id, customer_id, courier_name, tracking_number, shipping_fee, delivery_address, status, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, 'IN_TRANSIT', CURRENT_TIMESTAMP)
        `).run(orderId, customerId || null, courierName, trackingNumber, shippingFee || 0, deliveryAddress);
        res.json({ success: true, data: { shipmentId: resStmt.lastInsertRowid } });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 8. CREATE PRODUCT & INITIAL INVENTORY BATCH API
// ==========================================
app.post('/api/products/create', (req, res) => {
    try {
        const {
            nameFa,
            nameEn,
            shade,
            categoryId,
            customCategoryName,
            brandId,
            customBrandName,
            barcode,
            quantity = 1,
            purchasePrice = 0,
            sellingPrice = 0,
            batchNumber,
            expiryDate
        } = req.body;

        if (!nameFa || !shade || (!categoryId && !customCategoryName) || (!brandId && !customBrandName) || !expiryDate) {
            return res.status(400).json({ success: false, error: 'تمامی فیلدهای الزامی کالا را وارد کنید' });
        }

        const createTx = db.transaction(() => {
            // Handle Custom or Existing Category
            let effectiveCategoryId = Number(categoryId) || null;
            if (customCategoryName && customCategoryName.trim()) {
                const cleanCat = customCategoryName.trim();
                let existingCat = db.prepare(`SELECT id FROM categories WHERE name_fa = ? OR name = ?`).get(cleanCat, cleanCat);
                if (existingCat) {
                    effectiveCategoryId = existingCat.id;
                } else {
                    const catRes = db.prepare(`INSERT INTO categories (name, name_fa) VALUES (?, ?)`).run(cleanCat, cleanCat);
                    effectiveCategoryId = catRes.lastInsertRowid;
                }
            }

            // Handle Custom or Existing Brand
            let effectiveBrandId = Number(brandId) || null;
            if (customBrandName && customBrandName.trim()) {
                const cleanBrand = customBrandName.trim();
                let existingBrand = db.prepare(`SELECT id FROM brands WHERE name = ? OR name_fa = ?`).get(cleanBrand, cleanBrand);
                if (existingBrand) {
                    effectiveBrandId = existingBrand.id;
                } else {
                    const brandRes = db.prepare(`INSERT INTO brands (name, name_fa, country) VALUES (?, ?, 'ایران')`).run(cleanBrand, cleanBrand);
                    effectiveBrandId = brandRes.lastInsertRowid;
                }
            }

            if (!effectiveCategoryId || !effectiveBrandId) {
                throw new Error('دسته‌بندی یا برند مشخص نشده است');
            }

            // 1. Check if product with this name and brand already exists
            let prod = db.prepare(`SELECT id FROM products WHERE brand_id = ? AND name_fa = ?`).get(effectiveBrandId, nameFa);
            let productId;
            if (prod) {
                productId = prod.id;
            } else {
                const prodRes = db.prepare(`
                    INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
                    VALUES (?, ?, ?, ?, 1)
                `).run(effectiveBrandId, effectiveCategoryId, nameEn || nameFa, nameFa);
                productId = prodRes.lastInsertRowid;
            }

            // 2. Insert variant
            const bcode = barcode || ('626' + Math.floor(1000000000 + Math.random() * 9000000000));
            const sku = 'SKU-' + Math.floor(100000 + Math.random() * 900000);
            const varRes = db.prepare(`
                INSERT INTO product_variants (
                    product_id, sku, barcode, shade, purchase_price, selling_price,
                    safety_stock, reorder_point, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, 3, 10, 1)
            `).run(productId, sku, bcode, shade, purchasePrice, sellingPrice);
            const variantId = varRes.lastInsertRowid;

            // 3. Insert Initial Inventory Batch (FEFO ready)
            const lot = batchNumber || ('LOT-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + Math.floor(100 + Math.random() * 900));
            const batchRes = db.prepare(`
                INSERT INTO inventory_batches (
                    product_variant_id, warehouse_id, batch_number, expiry_date,
                    quantity, purchase_price, received_at
                ) VALUES (?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(variantId, lot, expiryDate, quantity, purchasePrice);
            const batchId = batchRes.lastInsertRowid;

            // 4. Log stock transaction
            db.prepare(`
                INSERT INTO stock_transactions (
                    product_variant_id, batch_id, warehouse_id, transaction_type,
                    quantity, unit_cost, reference_type, reference_id, note
                ) VALUES (?, ?, 1, 'PURCHASE', ?, ?, 'INITIAL_STOCK', ?, 'شارژ اولیه ورود محصول به انبار و صندوق')
            `).run(variantId, batchId, quantity, purchasePrice, batchId);

            return { productId, variantId, batchId, barcode: bcode };
        });

        const result = createTx();
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export CSV API
app.get('/api/export/:entity', (req, res) => {
    try {
        const entity = req.params.entity;
        let rows = [];
        let filename = `${entity}_export.csv`;

        if (entity === 'orders') {
            rows = db.prepare(`
                SELECT id, order_number, order_type, channel, subtotal, discount_amount, total_amount, total_cost, status, created_at
                FROM orders ORDER BY id DESC LIMIT 500
            `).all();
        } else if (entity === 'inventory') {
            rows = db.prepare(`
                SELECT 
                    pv.sku, pv.barcode, p.name_fa AS product, b.name AS brand, pv.shade,
                    COALESCE(SUM(ib.quantity), 0) AS current_stock, pv.purchase_price, pv.selling_price
                FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                JOIN brands b ON p.brand_id = b.id
                LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
                GROUP BY pv.id
            `).all();
        } else if (entity === 'ledger') {
            rows = db.prepare(`
                SELECT je.entry_number, je.date, jl.account_id, coa.code, coa.name_fa, jl.debit, jl.credit, jl.description
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                JOIN chart_of_accounts coa ON jl.account_id = coa.id
                ORDER BY je.id DESC LIMIT 500
            `).all();
        }

        if (rows.length === 0) {
            return res.send('داده‌ای برای خروجی یافت نشد');
        }

        const headers = Object.keys(rows[0]).join(',');
        const csvContent = '\uFEFF' + headers + '\n' + rows.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (err) {
        res.status(500).send('خطا در صدور فایل: ' + err.message);
    }
});

// Audit Logs API
app.get('/api/audit-logs', (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT al.*, u.full_name AS employee_name
            FROM audit_logs al
            LEFT JOIN users u ON al.employee_id = u.id
            ORDER BY al.created_at DESC LIMIT 100
        `).all();
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 8. FIXED COSTS & OVERHEAD MANAGEMENT APIS
// ==========================================
app.get('/api/accounting/fixed-costs', (req, res) => {
    try {
        const data = accountingService.getFixedCosts();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/fixed-costs', (req, res) => {
    try {
        const result = accountingService.createFixedCost(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/accounting/fixed-costs/:id', (req, res) => {
    try {
        const result = accountingService.updateFixedCost(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/accounting/fixed-costs/:id', (req, res) => {
    try {
        const result = accountingService.deleteFixedCost(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/fixed-costs/:id/pay', (req, res) => {
    try {
        const result = accountingService.payFixedCost(req.params.id, req.body.paymentMethod || 'BANK');
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Universal Edit for Chart of Accounts & Journal Entries
app.put('/api/accounting/accounts/:id', (req, res) => {
    try {
        const result = accountingService.updateAccount(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/accounting/journal-entries/:id', (req, res) => {
    try {
        const result = accountingService.updateJournalEntry(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 8.1 CAFE-GRADE DEEP BI ANALYTICS APIS
// ==========================================
app.get('/api/bi/hourly-peak', (req, res) => {
    try {
        const data = biService.getHourlyPeakAnalysis();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/bi/day-of-week', (req, res) => {
    try {
        const data = biService.getDayOfWeekPerformance();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/bi/bcg-matrix', (req, res) => {
    try {
        const data = biService.getBcgMatrix();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/bi/basket-metrics', (req, res) => {
    try {
        const data = biService.getBasketMetrics();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/bi/sales-forecast', (req, res) => {
    try {
        const data = biService.getSalesForecast();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 9. MARKETING, CAMPAIGNS & COUPONS APIS
// ==========================================
app.get('/api/marketing/stats', (req, res) => {
    try {
        const stats = marketingService.getMarketingStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/marketing/campaigns', (req, res) => {
    try {
        const campaigns = marketingService.getCampaigns();
        res.json({ success: true, data: campaigns });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/marketing/campaigns/:id', (req, res) => {
    try {
        const campaign = marketingService.getCampaignDetails(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, error: 'کمپین یافت نشد' });
        res.json({ success: true, data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/marketing/campaigns', (req, res) => {
    try {
        const result = marketingService.createCampaign(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/marketing/campaigns/:id', (req, res) => {
    try {
        const result = marketingService.deleteCampaign(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/marketing/campaigns/:id/send', (req, res) => {
    try {
        const result = marketingService.sendCampaign(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/marketing/import-audience', (req, res) => {
    try {
        const result = marketingService.parseAudienceText(req.body.rawText);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/marketing/target-audience', (req, res) => {
    try {
        const audience = marketingService.getTargetAudience(req.query.segment || 'ALL');
        res.json({ success: true, data: audience });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 9.1 CRM ADVANCED MANAGEMENT APIS
// ==========================================
app.post('/api/crm/customers/create', (req, res) => {
    try {
        const result = crmService.createCustomer(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/crm/customers/:id', (req, res) => {
    try {
        const result = crmService.updateCustomer(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/customers/:id/wallet', (req, res) => {
    try {
        const result = crmService.adjustWallet(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/customers/import', (req, res) => {
    try {
        const result = crmService.importCustomers(req.body.customers || []);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 10. ALERTS & NOTIFICATIONS APIS
// ==========================================
app.get('/api/alerts', (req, res) => {
    try {
        const alerts = db.prepare(`SELECT * FROM alerts WHERE is_resolved = 0 ORDER BY created_at DESC`).all();
        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/alerts/:id/resolve', (req, res) => {
    try {
        db.prepare(`UPDATE alerts SET is_resolved = 1 WHERE id = ?`).run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 11. REPORTS & MANAGEMENT ACCOUNTING APIS
// ==========================================
app.get('/api/reports/z-report', (req, res) => {
    try {
        const { date } = req.query;
        const data = reportService.getDailyZReport(date);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/category-performance', (req, res) => {
    try {
        const data = reportService.getCategoryPerformance();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/brand-matrix', (req, res) => {
    try {
        const data = reportService.getBrandMatrix();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/testers-and-shrinkage', (req, res) => {
    try {
        const data = reportService.getTestersAndShrinkage();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/audit-discounts-returns', (req, res) => {
    try {
        const data = reportService.getDiscountsAndReturnsAudit();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/four-column-trial-balance', (req, res) => {
    try {
        const data = reportService.getFourColumnTrialBalance();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 12. 90-DAY SIMULATION & STRESS TEST API
// ==========================================
const { run90DaySimulation } = require('./scripts/simulate90Days');
app.post('/api/simulate-90-days', async (req, res) => {
    try {
        const result = await run90DaySimulation();
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback: serve index.html for Single Page Application
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Process Error & Signal Handlers
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
process.on('SIGINT', () => {
    console.log('SIGINT intercepted, server remaining alive.');
});
process.on('SIGTERM', () => {
    console.log('SIGTERM intercepted, server remaining alive.');
});
process.on('SIGBREAK', () => {
    console.log('SIGBREAK intercepted, server remaining alive.');
});

// Keep-alive heartbeat
setInterval(() => {}, 1000 * 60 * 60);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Arayeshi Retail ERP System running successfully!`);
    console.log(`🌐 Local Web Portal: http://localhost:${PORT}`);
    console.log(`🔒 Dedicated Isolated Port: ${PORT} (Zero conflict)`);
    console.log(`====================================================`);
});
