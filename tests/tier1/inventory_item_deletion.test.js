const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../db/database');
const inventoryService = require('../../services/inventoryService');
const posService = require('../../services/posService');

test.describe('Tier 1: Inventory Item & Product Deletion Engine', () => {

    test('T1-DEL-1: Newly created inventory item with no order history is hard deleted cleanly', () => {
        // Create isolated test product and variant
        const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get();
        const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get();
        const supplier = db.prepare(`SELECT id FROM suppliers LIMIT 1`).get();

        const pRes = db.prepare(`
            INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
            VALUES (?, ?, 'Test Delete Perfume', 'عطر تست حذف', 1)
        `).run(brand.id, cat.id);
        const productId = pRes.lastInsertRowid;

        const sku = 'TEST-DEL-SKU-' + Date.now();
        const barcode = '626DEL' + Math.floor(100000 + Math.random() * 900000);
        const vRes = db.prepare(`
            INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, safety_stock, reorder_point, is_active)
            VALUES (?, ?, ?, 50000, 80000, 5, 10, 1)
        `).run(productId, sku, barcode);
        const variantId = vRes.lastInsertRowid;

        // Add a batch
        const bRes = db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, purchase_price, supplier_id)
            VALUES (?, 1, 'BATCH-DEL-1', '2028-01-01', 20, 50000, ?)
        `).run(variantId, supplier.id);
        const batchId = bRes.lastInsertRowid;

        // Verify it appears in getAllStock
        let stockList = inventoryService.getAllStock();
        const inStockBefore = stockList.find(s => s.variant_id === variantId);
        assert.ok(inStockBefore, 'Variant should exist in inventory stock before deletion');
        assert.equal(inStockBefore.total_stock, 20);

        // Delete the item
        const res = inventoryService.deleteInventoryItem(variantId, { reason: 'Test Hard Delete', userId: 1 });
        assert.equal(res.success, true);
        assert.equal(res.mode, 'DELETED');
        assert.equal(res.productDeleted, true);

        // Verify variant and batches are removed
        const checkV = db.prepare(`SELECT id FROM product_variants WHERE id = ?`).get(variantId);
        assert.equal(checkV, undefined, 'Variant should be completely removed from product_variants');

        const checkB = db.prepare(`SELECT id FROM inventory_batches WHERE id = ?`).get(batchId);
        assert.equal(checkB, undefined, 'Batch should be completely removed from inventory_batches');

        const checkP = db.prepare(`SELECT id FROM products WHERE id = ?`).get(productId);
        assert.equal(checkP, undefined, 'Product with no other variants should be completely removed');

        // Verify it no longer appears in getAllStock
        stockList = inventoryService.getAllStock();
        const inStockAfter = stockList.find(s => s.variant_id === variantId);
        assert.equal(inStockAfter, undefined, 'Deleted variant should not appear in inventory stock');

        // SQLite Foreign Key check
        const fk = db.prepare('PRAGMA foreign_key_check').all();
        assert.equal(fk.length, 0, 'No foreign key violations after hard delete');
    });

    test('T1-DEL-2: Item with historical order sales is safely archived/deactivated and warehouse stock is zeroed', () => {
        const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get();
        const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get();
        const supplier = db.prepare(`SELECT id FROM suppliers LIMIT 1`).get();

        const pRes = db.prepare(`
            INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
            VALUES (?, ?, 'Historic Lipstick', 'رژلب دارای سابقه فروش', 1)
        `).run(brand.id, cat.id);
        const productId = pRes.lastInsertRowid;

        const sku = 'HIST-DEL-SKU-' + Date.now();
        const barcode = '626HIST' + Math.floor(100000 + Math.random() * 900000);
        const vRes = db.prepare(`
            INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, safety_stock, reorder_point, is_active)
            VALUES (?, ?, ?, 40000, 75000, 5, 10, 1)
        `).run(productId, sku, barcode);
        const variantId = vRes.lastInsertRowid;

        // Add batch
        db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, purchase_price, supplier_id)
            VALUES (?, 1, 'BATCH-HIST-1', '2028-01-01', 15, 40000, ?)
        `).run(variantId, supplier.id);

        // Simulate a past sales order
        const oRes = db.prepare(`
            INSERT INTO orders (order_number, total_amount, total_cost, payment_status, status)
            VALUES ('ORD-HIST-TEST-' || ?, 75000, 40000, 'PAID', 'COMPLETED')
        `).run(Date.now());
        const orderId = oRes.lastInsertRowid;

        db.prepare(`
            INSERT INTO order_items (order_id, product_variant_id, quantity, unit_cost, unit_price, total_price)
            VALUES (?, ?, 1, 40000, 75000, 75000)
        `).run(orderId, variantId);

        // Delete the item
        const res = inventoryService.deleteInventoryItem(variantId, { reason: 'Test Soft Delete With History', userId: 1 });
        assert.equal(res.success, true);
        assert.equal(res.mode, 'ARCHIVED');

        // Check variant is inactive
        const varCheck = db.prepare(`SELECT is_active FROM product_variants WHERE id = ?`).get(variantId);
        assert.equal(varCheck.is_active, 0, 'Variant must be marked inactive');

        // Check product is inactive
        const prodCheck = db.prepare(`SELECT is_active FROM products WHERE id = ?`).get(productId);
        assert.equal(prodCheck.is_active, 0, 'Parent product must be marked inactive');

        // Check batch quantity is zeroed out
        const batchCheck = db.prepare(`SELECT SUM(quantity) as total_qty FROM inventory_batches WHERE product_variant_id = ?`).get(variantId);
        assert.equal(batchCheck.total_qty, 0, 'Remaining warehouse stock must be zeroed out');

        // Verify order items still preserved (zero data loss)
        const oiCheck = db.prepare(`SELECT COUNT(*) AS c FROM order_items WHERE product_variant_id = ?`).get(variantId);
        assert.equal(oiCheck.c, 1, 'Order item must remain intact for historical accounting integrity');

        // Verify it no longer appears in getAllStock()
        const stockList = inventoryService.getAllStock();
        const inStockAfter = stockList.find(s => s.variant_id === variantId);
        assert.equal(inStockAfter, undefined, 'Archived variant must not appear in active inventory stock');

        // PRAGMA foreign_key_check
        const fk = db.prepare('PRAGMA foreign_key_check').all();
        assert.equal(fk.length, 0, 'Zero FK violations');

        // Cleanup simulated test order to avoid polluting database
        db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId);
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(orderId);
    });

    test('T1-DEL-3: Item with active layaway reservation blocks deletion until reservation is resolved', () => {
        const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get();
        const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get();

        const pRes = db.prepare(`
            INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
            VALUES (?, ?, 'Layaway Cream', 'کرم دارای بیعانه فعال', 1)
        `).run(brand.id, cat.id);
        const productId = pRes.lastInsertRowid;

        const sku = 'LAY-DEL-SKU-' + Date.now();
        const barcode = '626LAY' + Math.floor(100000 + Math.random() * 900000);
        const vRes = db.prepare(`
            INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, safety_stock, reorder_point, is_active)
            VALUES (?, ?, ?, 60000, 110000, 5, 10, 1)
        `).run(productId, sku, barcode);
        const variantId = vRes.lastInsertRowid;

        // Add batch with reserved quantity
        db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price)
            VALUES (?, 1, 'BATCH-LAY-1', '2028-01-01', 10, 3, 60000)
        `).run(variantId);

        // Attempting to delete must throw error
        assert.throws(() => {
            inventoryService.deleteInventoryItem(variantId);
        }, /رزرو شده در سفارش‌های بیعانه فعال/);

        // Clean up
        db.prepare(`UPDATE inventory_batches SET reserved_quantity = 0 WHERE product_variant_id = ?`).run(variantId);
        inventoryService.deleteInventoryItem(variantId);
    });

    test('T1-DEL-4: deleteProduct deletes all product variants and the product itself', () => {
        const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get();
        const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get();

        const pRes = db.prepare(`
            INSERT INTO products (brand_id, category_id, name, name_fa, is_active)
            VALUES (?, ?, 'Full Delete Palette', 'پالت سایه تست حذف کامل', 1)
        `).run(brand.id, cat.id);
        const productId = pRes.lastInsertRowid;

        // Insert 2 variants
        const v1 = db.prepare(`
            INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, is_active)
            VALUES (?, 'SKU-PAL-1-' || ?, 'BAR-PAL-1-' || ?, 70000, 120000, 1)
        `).run(productId, Date.now(), Date.now()).lastInsertRowid;

        const v2 = db.prepare(`
            INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, is_active)
            VALUES (?, 'SKU-PAL-2-' || ?, 'BAR-PAL-2-' || ?, 70000, 120000, 1)
        `).run(productId, Date.now(), Date.now()).lastInsertRowid;

        const res = inventoryService.deleteProduct(productId);
        assert.equal(res.success, true);
        assert.equal(res.variantsDeleted, 2);

        // Verify product and both variants gone
        const pCheck = db.prepare(`SELECT id FROM products WHERE id = ?`).get(productId);
        assert.equal(pCheck, undefined);
        const vCheck = db.prepare(`SELECT id FROM product_variants WHERE product_id = ?`).all(productId);
        assert.equal(vCheck.length, 0);
    });

    test('T1-DEL-5: deleteBatch deletes non-referenced batch or zeroes out referenced batch', () => {
        const variant = db.prepare(`SELECT id FROM product_variants WHERE is_active = 1 LIMIT 1`).get();
        
        // Add fresh batch
        const bRes = db.prepare(`
            INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, expiry_date, quantity, purchase_price)
            VALUES (?, 1, 'BATCH-SINGLE-DEL', '2028-06-01', 8, 35000)
        `).run(variant.id);
        const batchId = bRes.lastInsertRowid;

        const res = inventoryService.deleteBatch(batchId);
        assert.equal(res.success, true);
        assert.equal(res.mode, 'DELETED');

        const check = db.prepare(`SELECT id FROM inventory_batches WHERE id = ?`).get(batchId);
        assert.equal(check, undefined, 'Batch should be deleted');
    });

});
