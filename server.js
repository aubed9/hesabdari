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
const reconciliationService = require('./services/reconciliationService');
const procurementService = require('./services/procurementService');

const app = express();
const PORT = process.env.PORT || 4200; // Dedicated non-conflicting port

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 0. AUTHENTICATION & ACCESS CONTROL APIS
// ==========================================
const ALL_MODULE_SECTIONS = [
    'dashboard', 'pos', 'products', 'inventory', 'purchasing', 
    'omnichannel', 'crm', 'marketing', 'accounting', 'reports', 
    'bi', 'audit', 'alerts', 'settings'
];

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'نام کاربری الزامی است.' });
        }
        const user = db.prepare(`
            SELECT id, username, full_name, role, password_hash, permissions, is_active 
            FROM users 
            WHERE LOWER(username) = LOWER(?)
        `).get(String(username).trim());

        if (!user || user.is_active !== 1) {
            return res.status(401).json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است.' });
        }

        // Validate password strictly (no default fallbacks)
        const enteredPass = String(password || '').trim();
        const isValid = Boolean(user.password_hash && user.password_hash === enteredPass);

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است.' });
        }

        const isManager = (user.role === 'MANAGER' || user.username.toLowerCase() === 'manager');
        
        // Resolve allowed sections:
        let allowedSections = [];
        if (isManager) {
            allowedSections = ALL_MODULE_SECTIONS;
        } else if (user.permissions) {
            try {
                const parsed = JSON.parse(user.permissions);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    allowedSections = parsed.filter(s => s !== 'ai'); // Strictly exclude any AI references
                }
            } catch (e) {}
        }
        
        // Fallback for non-managers if no custom permissions set
        if (allowedSections.length === 0) {
            allowedSections = ['pos', 'crm', 'alerts'];
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: isManager ? 'MANAGER' : (user.role || 'ADMIN'),
                roleLabel: isManager ? 'مدیر فروشگاه (دسترسی کامل)' : `ادمین فروشگاه (${allowedSections.join('، ')})`,
                allowedSections
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Management APIs for Manager (تنظیمات کاربران و سطوح دسترسی)
app.get('/api/admin/users', (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, branch_id, username, full_name, role, phone, is_active, permissions, created_at
            FROM users
            ORDER BY id ASC
        `).all();

        const formatted = users.map(u => {
            let perms = [];
            try {
                perms = u.permissions ? JSON.parse(u.permissions) : [];
            } catch (e) {
                perms = [];
            }
            if (u.role === 'MANAGER') perms = ALL_MODULE_SECTIONS;
            else if (perms.length === 0) perms = ['pos', 'crm', 'alerts'];

            return {
                ...u,
                permissions: perms
            };
        });

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/users', (req, res) => {
    try {
        const { username, password, full_name, role = 'ADMIN', phone = '', permissions = ['pos', 'crm', 'alerts'] } = req.body;

        if (!username || String(username).trim().length < 2) {
            return res.status(400).json({ success: false, error: 'نام کاربری باید حداقل ۲ کاراکتر باشد.' });
        }
        if (!password || String(password).trim().length < 3) {
            return res.status(400).json({ success: false, error: 'رمز عبور باید حداقل ۳ کاراکتر باشد.' });
        }
        if (!full_name || String(full_name).trim().length < 2) {
            return res.status(400).json({ success: false, error: 'نام و نام خانوادگی الزامی است.' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(String(username).trim());
        if (existing) {
            return res.status(400).json({ success: false, error: 'این نام کاربری قبلاً در سیستم ثبت شده است.' });
        }

        const cleanPerms = Array.isArray(permissions) ? permissions.filter(p => p !== 'ai') : ['pos', 'crm', 'alerts'];
        const stmt = db.prepare(`
            INSERT INTO users (branch_id, username, password_hash, full_name, role, phone, permissions, is_active)
            VALUES (1, ?, ?, ?, ?, ?, ?, 1)
        `);
        const result = stmt.run(
            String(username).trim(),
            String(password).trim(),
            String(full_name).trim(),
            role,
            phone ? String(phone).trim() : null,
            JSON.stringify(cleanPerms)
        );

        res.json({
            success: true,
            message: 'کاربر جدید با موفقیت ایجاد شد.',
            data: { id: result.lastInsertRowid, username, full_name, role, permissions: cleanPerms }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { full_name, phone, role, is_active, permissions, password } = req.body;

        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'کاربر یافت نشد.' });
        }

        const cleanPerms = Array.isArray(permissions) ? permissions.filter(p => p !== 'ai') : ['pos', 'crm', 'alerts'];
        
        if (password && String(password).trim().length > 0) {
            db.prepare(`
                UPDATE users 
                SET full_name = COALESCE(?, full_name),
                    phone = COALESCE(?, phone),
                    role = COALESCE(?, role),
                    is_active = COALESCE(?, is_active),
                    permissions = ?,
                    password_hash = ?
                WHERE id = ?
            `).run(
                full_name ? String(full_name).trim() : null,
                phone !== undefined ? String(phone).trim() : null,
                role || null,
                is_active !== undefined ? (is_active ? 1 : 0) : null,
                JSON.stringify(cleanPerms),
                String(password).trim(),
                userId
            );
        } else {
            db.prepare(`
                UPDATE users 
                SET full_name = COALESCE(?, full_name),
                    phone = COALESCE(?, phone),
                    role = COALESCE(?, role),
                    is_active = COALESCE(?, is_active),
                    permissions = ?
                WHERE id = ?
            `).run(
                full_name ? String(full_name).trim() : null,
                phone !== undefined ? String(phone).trim() : null,
                role || null,
                is_active !== undefined ? (is_active ? 1 : 0) : null,
                JSON.stringify(cleanPerms),
                userId
            );
        }

        res.json({ success: true, message: 'مشخصات کاربر و سطوح دسترسی به‌روزرسانی شد.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'کاربر یافت نشد.' });
        }

        if (user.username.toLowerCase() === 'manager' || userId === 7) {
            return res.status(400).json({ success: false, error: 'امکان حذف کاربر اصلی مدیر سیستم وجود ندارد.' });
        }

        // Attempt deletion, or gracefully soft-delete if foreign key references exist
        try {
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        } catch (fkErr) {
            db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
        }

        res.json({ success: true, message: 'کاربر با موفقیت از سیستم حذف یا غیرفعال شد.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, status: 'AUTH_SERVICE_ONLINE' });
});

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

// Delete Inventory Item (Product Variant) API
const handleDeleteInventoryItem = (req, res) => {
    try {
        const { reason = 'حذف دستی از انبار' } = req.body || {};
        const userId = req.headers['x-user-id'] || 1;
        const result = inventoryService.deleteInventoryItem(Number(req.params.variantId), { reason, userId });
        res.json({ success: true, message: result.message, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
app.delete('/api/inventory/items/:variantId', handleDeleteInventoryItem);
app.post('/api/inventory/items/:variantId/delete', handleDeleteInventoryItem);

// Delete Specific Inventory Batch API
const handleDeleteBatch = (req, res) => {
    try {
        const { reason = 'حذف دستی سری ساخت' } = req.body || {};
        const userId = req.headers['x-user-id'] || 1;
        const result = inventoryService.deleteBatch(Number(req.params.batchId), { reason, userId });
        res.json({ success: true, message: result.message, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
app.delete('/api/inventory/batches/:batchId', handleDeleteBatch);
app.post('/api/inventory/batches/:batchId/delete', handleDeleteBatch);

// Delete Product and all its Variants API
const handleDeleteProduct = (req, res) => {
    try {
        const { reason = 'حذف دستی محصول' } = req.body || {};
        const userId = req.headers['x-user-id'] || 1;
        const result = inventoryService.deleteProduct(Number(req.params.id), { reason, userId });
        res.json({ success: true, message: result.message, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
app.delete('/api/products/:id', handleDeleteProduct);
app.post('/api/products/:id/delete', handleDeleteProduct);

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
                (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id AND is_active = 1) AS variant_count,
                (
                    SELECT COALESCE(SUM(ib.quantity), 0)
                    FROM inventory_batches ib
                    JOIN product_variants pv ON ib.product_variant_id = pv.id
                    WHERE pv.product_id = p.id AND pv.is_active = 1
                ) AS total_stock,
                (
                    SELECT COALESCE(SUM(ib.quantity * pv.purchase_price), 0)
                    FROM inventory_batches ib
                    JOIN product_variants pv ON ib.product_variant_id = pv.id
                    WHERE pv.product_id = p.id AND pv.is_active = 1
                ) AS total_cost_value,
                (
                    SELECT COALESCE(SUM(ib.quantity * pv.selling_price), 0)
                    FROM inventory_batches ib
                    JOIN product_variants pv ON ib.product_variant_id = pv.id
                    WHERE pv.product_id = p.id AND pv.is_active = 1
                ) AS total_retail_value
            FROM products p
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            WHERE p.is_active = 1
            ORDER BY p.id DESC
        `).all();

        const summary = db.prepare(`
            SELECT 
                COALESCE(SUM(ib.quantity), 0) AS grand_total_stock,
                COALESCE(SUM(ib.quantity * pv.purchase_price), 0) AS grand_total_cost_value,
                COALESCE(SUM(ib.quantity * pv.selling_price), 0) AS grand_total_retail_value,
                (SELECT COUNT(*) FROM products WHERE is_active = 1) AS total_products_count,
                (
                    SELECT COUNT(*) 
                    FROM product_variants pv 
                    JOIN products p ON pv.product_id = p.id 
                    WHERE pv.is_active = 1 AND p.is_active = 1
                ) AS total_variants_count
            FROM inventory_batches ib
            JOIN product_variants pv ON ib.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE pv.is_active = 1 AND p.is_active = 1
        `).get() || {
            grand_total_stock: 0,
            grand_total_cost_value: 0,
            grand_total_retail_value: 0,
            total_products_count: products.length,
            total_variants_count: 0
        };

        res.json({ success: true, data: products, summary });
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
        const result = procurementService.createPurchaseOrder(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/suppliers/:id/payments', (req, res) => {
    try {
        const result = procurementService.recordSupplierPayment({
            supplierId: Number(req.params.id),
            ...req.body
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/purchases/:id/return', (req, res) => {
    try {
        const result = procurementService.recordPurchaseReturn({
            purchaseOrderId: Number(req.params.id),
            ...req.body
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/suppliers/:id/ledger', (req, res) => {
    try {
        const ledger = procurementService.getSupplierLedger(Number(req.params.id));
        if (!ledger) return res.status(404).json({ success: false, error: 'تأمین‌کننده یافت نشد.' });
        res.json({ success: true, data: ledger });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/suppliers/aging', (req, res) => {
    try {
        const aging = procurementService.getSupplierAging(req.query.supplierId ? Number(req.query.supplierId) : null);
        res.json({ success: true, data: aging });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
        if (!fullName || !fullName.trim()) {
            return res.status(400).json({ success: false, error: 'نام و نام خانوادگی مشتری الزامی است.' });
        }

        const { validateIranianMobile } = require('./utils/textUtils');
        const validation = validateIranianMobile(mobile);
        if (!validation.valid) {
            return res.status(400).json({ success: false, error: validation.message });
        }
        const cleanMobile = validation.mobile;

        const existing = db.prepare(`SELECT id FROM customers WHERE mobile = ?`).get(cleanMobile);
        if (existing) {
            return res.status(400).json({ success: false, error: 'مشتری با این شماره موبایل قبلاً در سیستم ثبت شده است.' });
        }

        const { parseJalaliInputToGregorian } = require('./utils/dateUtils');
        const finalBirth = birthDate ? (parseJalaliInputToGregorian(birthDate) || birthDate) : null;
        const refCode = 'REF-' + Math.floor(100000 + Math.random() * 900000);
        const result = db.prepare(`
            INSERT INTO customers (full_name, mobile, email, birth_date, skin_type, hair_preferences, referral_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(fullName.trim(), cleanMobile, email || null, finalBirth, skinType || null, hairPreferences || null, refCode);
        res.json({ success: true, data: { customerId: result.lastInsertRowid, referralCode: refCode, mobile: cleanMobile } });
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
        const month = req.query.month ? Number(req.query.month) : null;
        const birthdays = crmService.getUpcomingBirthdays(month);
        const { getCurrentJalaliDate, getJalaliMonthName } = require('./utils/dateUtils');
        const curJ = getCurrentJalaliDate();
        const targetMonth = (month && month >= 1 && month <= 12) ? month : curJ.month;
        const targetMonthName = getJalaliMonthName(targetMonth);
        res.json({ 
            success: true, 
            data: birthdays,
            meta: {
                selectedMonth: targetMonth,
                selectedMonthName: targetMonthName,
                count: birthdays.length,
                currentJalali: curJ
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/crm/birthdays/excel', (req, res) => {
    try {
        const month = req.query.month ? Number(req.query.month) : null;
        const result = crmService.generateBirthdaysExcelCsv(month);
        const encoded = encodeURIComponent(result.filename);
        const ascii = result.asciiFallback || 'birthdays.csv';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);
        res.send(result.csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/sms-contacts', (req, res) => {
    try {
        const filters = req.body || {};
        const result = crmService.getFarazSmsContacts(filters);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/sms-export/csv', (req, res) => {
    try {
        const filters = req.body || {};
        const result = crmService.getFarazSmsContacts(filters);
        const csv = crmService.generateFarazSmsCsv(result.contacts);
        
        const filename = `FarazSMS_Contacts_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/crm/segment-counts', (req, res) => {
    try {
        const segments = ['high_basket_regular', 'regular_buyers', 'absent_35_days', 'new_customers', 'wallet_balance', 'vip_gold', 'all'];
        const counts = {};
        for (const s of segments) {
            counts[s] = crmService.getSegmentCustomers(s).count;
        }
        res.json({ success: true, data: counts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/crm/export-segment/csv', (req, res) => {
    try {
        const segment = req.query.segment || 'all';
        const result = crmService.generateSegmentExcelCsv(segment);
        const encoded = encodeURIComponent(result.filename);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"; filename*=UTF-8''${encoded}`);
        res.send(result.csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/crm/export-segment/csv', (req, res) => {
    try {
        const segment = req.body.segment || req.query.segment || 'all';
        const result = crmService.generateSegmentExcelCsv(segment);
        const encoded = encodeURIComponent(result.filename);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"; filename*=UTF-8''${encoded}`);
        res.send(result.csv);
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

// Periodic Date-Range Financial & Ledger Excel Export API
app.get('/api/accounting/export-excel', (req, res) => {
    try {
        const { parseJalaliInputToGregorian, toJalaliDateString } = require('./utils/dateUtils');
        let { startDate, endDate, reportType = 'all' } = req.query;

        // Convert potential Jalali inputs to Gregorian for SQL filtering
        let startGregorian = null;
        let endGregorian = null;
        if (startDate && String(startDate).trim()) {
            startGregorian = parseJalaliInputToGregorian(String(startDate).trim()) || String(startDate).trim();
        }
        if (endDate && String(endDate).trim()) {
            endGregorian = parseJalaliInputToGregorian(String(endDate).trim()) || String(endDate).trim();
        }

        let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel

        if (reportType === 'expenses') {
            let query = `
                SELECT e.*, coa.code AS account_code, coa.name_fa AS account_name, u.full_name AS created_by_name
                FROM expenses e
                LEFT JOIN chart_of_accounts coa ON e.account_id = coa.id
                LEFT JOIN users u ON e.created_by = u.id
                WHERE 1=1
            `;
            const params = [];
            if (startGregorian) {
                query += ` AND date(e.expense_date) >= date(?)`;
                params.push(startGregorian);
            }
            if (endGregorian) {
                query += ` AND date(e.expense_date) <= date(?)`;
                params.push(endGregorian);
            }
            query += ` ORDER BY e.expense_date DESC, e.id DESC`;
            const rows = db.prepare(query).all(...params);

            const headers = ['ردیف', 'کد هزینه', 'تاریخ (شمسی)', 'سرفصل حسابداری', 'کد حساب', 'مبلغ (تومان)', 'روش پرداخت', 'دریافت‌کننده', 'شرح و بابت', 'ثبت‌کننده'];
            csv += headers.join(',') + '\r\n';
            rows.forEach((r, idx) => {
                const shamsiDate = toJalaliDateString(r.expense_date);
                const row = [
                    idx + 1,
                    `"EXP-${r.id}"`,
                    `"${shamsiDate}"`,
                    `"${(r.account_name || '').replace(/"/g, '""')}"`,
                    `"${r.account_code || ''}"`,
                    Math.round(Number(r.amount || 0)),
                    `"${(r.payment_method === 'CASH' ? 'نقدی (صندوق)' : r.payment_method === 'BANK' ? 'حواله/کارت بانکی' : r.payment_method || '').replace(/"/g, '""')}"`,
                    `"${(r.payee || '').replace(/"/g, '""')}"`,
                    `"${(r.description || '').replace(/"/g, '""')}"`,
                    `"${(r.created_by_name || '').replace(/"/g, '""')}"`
                ];
                csv += row.join(',') + '\r\n';
            });
        } else if (reportType === 'pnl') {
            const pnl = accountingService.getProfitAndLoss(startGregorian, endGregorian);
            const headers = ['ردیف', 'سرفصل سود و زیان', 'شرح حساب', 'مبلغ خالص (تومان)'];
            csv += headers.join(',') + '\r\n';
            let idx = 1;
            csv += `${idx++},"درآمد فروش ناخالص","فروش فروشگاهی POS",${Math.round(pnl.revenue.grossSales)}\r\n`;
            csv += `${idx++},"تخفیفات فروش","تخفیفات اختصاص‌یافته به مشتریان",${Math.round(pnl.revenue.discounts)}\r\n`;
            csv += `${idx++},"درآمد خالص فروش","فروش ناخالص منهای تخفیف",${Math.round(pnl.revenue.netSales)}\r\n`;
            csv += `${idx++},"بهای تمام شده کالا (COGS)","هزینه خرید کالاهای فروش‌رفته",${Math.round(pnl.cogs.totalCOGS)}\r\n`;
            csv += `${idx++},"سود ناخالص","فروش خالص منهای بهای تمام شده",${Math.round(pnl.grossProfit)}\r\n`;
            csv += `${idx++},"کل هزینه‌های عملیاتی","مجموع هزینه‌های عمومی و اداری",${Math.round(pnl.expenses.totalExpenses)}\r\n`;
            csv += `${idx++},"سود (زیان) خالص عملیاتی","سود نهایی دوره انتخابی",${Math.round(pnl.netIncome)}\r\n`;
        } else {
            // Default or 'all' or 'journals': Complete double-entry ledger lines
            let query = `
                SELECT 
                    je.entry_number,
                    je.date,
                    je.reference_type,
                    coa.code AS account_code,
                    coa.name_fa AS account_name,
                    jl.description,
                    jl.debit,
                    jl.credit,
                    je.is_posted
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                JOIN chart_of_accounts coa ON jl.account_id = coa.id
                WHERE 1=1
            `;
            const params = [];
            if (startGregorian) {
                query += ` AND date(je.date) >= date(?)`;
                params.push(startGregorian);
            }
            if (endGregorian) {
                query += ` AND date(je.date) <= date(?)`;
                params.push(endGregorian);
            }
            query += ` ORDER BY je.date ASC, je.id ASC, jl.id ASC`;
            const rows = db.prepare(query).all(...params);

            const headers = ['ردیف', 'شماره سند', 'تاریخ سند (شمسی)', 'کد حساب معین', 'نام سرفصل معین', 'شرح آرتیکل سند', 'بدهکار (تومان)', 'بستانکار (تومان)', 'نوع تراکنش / مرجع', 'وضعیت سند'];
            csv += headers.join(',') + '\r\n';
            rows.forEach((r, idx) => {
                const shamsiDate = toJalaliDateString(r.date);
                const row = [
                    idx + 1,
                    `"${r.entry_number}"`,
                    `"${shamsiDate}"`,
                    `"${r.account_code}"`,
                    `"${(r.account_name || '').replace(/"/g, '""')}"`,
                    `"${(r.description || '').replace(/"/g, '""')}"`,
                    Math.round(Number(r.debit || 0)),
                    Math.round(Number(r.credit || 0)),
                    `"${r.reference_type || 'MANUAL'}"`,
                    `"${r.is_posted ? 'قطعی شده (ثبت دائم)' : 'پیش‌نویس'}"`
                ];
                csv += row.join(',') + '\r\n';
            });
        }

        const safeStart = startDate ? String(startDate).replace(/[^\w-]/g, '_') : 'all';
        const safeEnd = endDate ? String(endDate).replace(/[^\w-]/g, '_') : 'now';
        const filename = `Hesabdari_${reportType}_${safeStart}_ta_${safeEnd}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
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
        } else if (entity === 'customers') {
            const { normalizeIranianMobile, formatMobileForExcel, formatMobileWithoutZero } = require('./utils/textUtils');
            const { toJalaliDateString } = require('./utils/dateUtils');
            const custs = crmService.getCustomers();
            rows = custs.map((c, idx) => {
                const excelMobile = formatMobileForExcel(c.mobile);
                const noZeroMobile = formatMobileWithoutZero(c.mobile);
                const shamsiBirth = toJalaliDateString(c.birth_date);
                return {
                    'ردیف': idx + 1,
                    'کد اشتراک': c.referral_code || c.customer_code || ('CUST-' + c.id),
                    'نام و نام خانوادگی': c.full_name || '',
                    'شماره همراه': excelMobile,
                    'شماره بدون صفر (ویژه پنل)': noZeroMobile,
                    'تاریخ تولد (شمسی)': shamsiBirth || '-',
                    'دسته‌بندی': c.rfm_segment || 'عادی',
                    'سطح وفاداری': c.loyalty_tier || 'BRONZE',
                    'کیف پول (تومان)': c.wallet_balance || 0,
                    'امتیاز': c.loyalty_points || 0,
                    'تعداد سفارش': c.total_orders_count || 0,
                    'مجموع خرید (تومان)': c.total_spent || 0,
                    'آخرین خرید': c.last_order_date || '-'
                };
            });
            filename = `customers_export_${new Date().toISOString().slice(0, 10)}.csv`;
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

// ==================== Admin: Reconciliation Engine ====================
app.get('/api/admin/reconciliation', (req, res) => {
    try {
        const results = reconciliationService.runAll();
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'RECONCILIATION_ERROR', message: err.message } });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Arayeshi Retail ERP System running successfully!`);
    console.log(`🌐 Local Web Portal: http://localhost:${PORT}`);
    console.log(`🔒 Dedicated Isolated Port: ${PORT} (Zero conflict)`);
    console.log(`====================================================`);
});
