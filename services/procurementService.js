// Procurement, Supplier Ledger, Goods Receipt & AP Accounting Service
const db = require('../db/database');

const procurementService = {
    // Create Purchase Order (Goods Receipt with Batches & Double-Entry AP Journal)
    createPurchaseOrder({ supplierId, warehouseId = 1, items = [], notes = '', createdBy = 1 }) {
        const poTx = db.transaction(() => {
            const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplierId);
            if (!supplier) {
                throw new Error(`تأمین‌کننده با شناسه ${supplierId} یافت نشد.`);
            }
            if (!items || items.length === 0) {
                throw new Error('فاکتور خرید باید حداقل شامل یک ردیف کالا باشد.');
            }

            const poNumber = `PO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const poCreatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

            let totalAmount = 0;
            for (const item of items) {
                if (item.quantity <= 0 || item.unitCost < 0) {
                    throw new Error('تعداد و بهای خرید کالا باید معتبر باشند.');
                }
                totalAmount += Math.round(item.unitCost * item.quantity);
            }

            const poRes = db.prepare(`
                INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, paid_amount, notes, created_at)
                VALUES (?, ?, ?, 'RECEIVED', ?, 0, ?, ?)
            `).run(poNumber, supplierId, warehouseId, totalAmount, notes, poCreatedAt);
            const poId = poRes.lastInsertRowid;

            const insertedBatches = [];

            for (const item of items) {
                const lineTotal = Math.round(item.unitCost * item.quantity);

                // 1. Insert Purchase Order Item
                db.prepare(`
                    INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, batch_number, manufacture_date, expiry_date, quantity, unit_cost, total_cost)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(poId, item.variantId, item.batchNumber, item.manufactureDate || null, item.expiryDate, item.quantity, item.unitCost, lineTotal);

                // 2. Create Inventory Batch
                const batchRes = db.prepare(`
                    INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, manufacture_date, expiry_date, quantity, reserved_quantity, purchase_price, supplier_id)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                `).run(item.variantId, warehouseId, item.batchNumber, item.manufactureDate || null, item.expiryDate, item.quantity, item.unitCost, supplierId);
                const batchId = batchRes.lastInsertRowid;
                insertedBatches.push(batchId);

                // 3. Stock Transaction
                db.prepare(`
                    INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at)
                    VALUES (?, ?, ?, 'PURCHASE', ?, ?, 'PURCHASE_ORDER', ?, ?, 'ورود کالا بر اساس فاکتور خرید', ?)
                `).run(item.variantId, batchId, warehouseId, item.quantity, item.unitCost, poId, createdBy, poCreatedAt);
            }

            // 4. Double-Entry Accounting Entry:
            // Debit 103 (Merchandise Inventory)
            // Credit 201 (Accounts Payable)
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;

            const dateStr = poCreatedAt.split(' ')[0];
            const entryNumber = `JE-PO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                VALUES (?, ?, ?, 'PURCHASE', ?, 1, ?, ?)
            `).run(entryNumber, dateStr, `سند فاکتور خرید ${poNumber} از ${supplier.name}`, poId, createdBy, poCreatedAt);
            const jId = jRes.lastInsertRowid;

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, ?)
            `).run(jId, accInv, totalAmount, `افزایش موجودی انبار بابت خرید فاکتور ${poNumber}`);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(jId, accAP, totalAmount, `بستانکاری تأمین‌کننده (${supplier.name}) بابت خرید فاکتور ${poNumber}`);

            // 5. Audit Log
            db.prepare(`
                INSERT INTO audit_logs (employee_id, action, entity, entity_id, details, created_at)
                VALUES (?, 'PURCHASE_ORDER', 'purchase_orders', ?, ?, ?)
            `).run(createdBy, poId, JSON.stringify({ poNumber, supplierId, totalAmount, itemsCount: items.length }), poCreatedAt);

            return { poId, poNumber, totalAmount, batchIds: insertedBatches };
        });

        return poTx();
    },

    // Record Supplier Payment (تسويه بدهی بستانکاران با صدور سند دوبل پرداخت)
    recordSupplierPayment({ supplierId, purchaseOrderId = null, amount, paymentMethod = 'BANK', referenceCode = '', notes = '', createdBy = 1 }) {
        const payTx = db.transaction(() => {
            const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplierId);
            if (!supplier) {
                throw new Error(`تأمین‌کننده با شناسه ${supplierId} یافت نشد.`);
            }
            if (!amount || amount <= 0) {
                throw new Error('مبلغ پرداخت باید بزرگتر از صفر باشد.');
            }

            const paymentNumber = `SPAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const payCreatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

            // 1. Insert into supplier_payments
            const payRes = db.prepare(`
                INSERT INTO supplier_payments (payment_number, supplier_id, purchase_order_id, payment_method, amount, reference_code, notes, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(paymentNumber, supplierId, purchaseOrderId, paymentMethod, amount, referenceCode, notes, createdBy, payCreatedAt);
            const paymentId = payRes.lastInsertRowid;

            // 2. If tied to a specific purchase order, update paid_amount
            if (purchaseOrderId) {
                db.prepare(`
                    UPDATE purchase_orders
                    SET paid_amount = paid_amount + ?
                    WHERE id = ?
                `).run(amount, purchaseOrderId);
            }

            // 3. Double-Entry Accounting Entry:
            // Debit 201 (Accounts Payable)
            // Credit 102 (Bank) or 101 (Cash) or 204 (Notes Payable)
            const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;
            const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
            const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
            const accCheque = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '204'`).get() || { id: accBank };

            let creditAccId = accBank;
            if (paymentMethod === 'CASH') creditAccId = accCash;
            else if (paymentMethod === 'CHEQUE') creditAccId = accCheque.id;

            const dateStr = payCreatedAt.split(' ')[0];
            const entryNumber = `JE-SPAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                VALUES (?, ?, ?, 'SUPPLIER_PAYMENT', ?, 1, ?, ?)
            `).run(entryNumber, dateStr, `سند پرداخت به تأمین‌کننده ${supplier.name} (${paymentNumber})`, paymentId, createdBy, payCreatedAt);
            const jId = jRes.lastInsertRowid;

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, ?)
            `).run(jId, accAP, amount, `کاهش بدهی به تأمین‌کننده (${supplier.name}) بابت پرداخت ${paymentNumber}`);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(jId, creditAccId, amount, `پرداخت ${paymentMethod} بابت فاکتور تأمین‌کننده ${supplier.name}`);

            // 4. Audit Log
            db.prepare(`
                INSERT INTO audit_logs (employee_id, action, entity, entity_id, details, created_at)
                VALUES (?, 'SUPPLIER_PAYMENT', 'supplier_payments', ?, ?, ?)
            `).run(createdBy, paymentId, JSON.stringify({ paymentNumber, supplierId, amount, paymentMethod }), payCreatedAt);

            return { paymentId, paymentNumber, amount, paymentMethod };
        });

        return payTx();
    },

    // Record Purchase Return (برگشت از خرید با کسر انبار و صدور سند دوبل بدهکار کردن تأمین‌کننده)
    recordPurchaseReturn({ purchaseOrderId, supplierId, items = [], reason = '', createdBy = 1 }) {
        const retTx = db.transaction(() => {
            const po = db.prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(purchaseOrderId);
            if (!po) {
                throw new Error(`سفارش خرید مرجع با شناسه ${purchaseOrderId} یافت نشد.`);
            }

            const effectiveSupplierId = supplierId || po.supplier_id;
            const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(effectiveSupplierId);

            const retNumber = `PRET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const retCreatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

            let totalReturnAmount = 0;

            for (const it of items) {
                if (it.quantity <= 0) {
                    throw new Error('تعداد مرجوعی خرید باید بزرگتر از صفر باشد.');
                }
                const batch = db.prepare(`SELECT * FROM inventory_batches WHERE id = ?`).get(it.batchId);
                if (!batch || batch.quantity < it.quantity) {
                    throw new Error(`موجودی بچ ${it.batchId} برای برگشت از خرید کافی نیست.`);
                }
                totalReturnAmount += Math.round(it.unitCost * it.quantity);
            }

            const retRes = db.prepare(`
                INSERT INTO purchase_returns (return_number, purchase_order_id, supplier_id, total_amount, reason, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(retNumber, purchaseOrderId, effectiveSupplierId, totalReturnAmount, reason, createdBy, retCreatedAt);
            const returnId = retRes.lastInsertRowid;

            for (const it of items) {
                const lineTotal = Math.round(it.unitCost * it.quantity);

                db.prepare(`
                    INSERT INTO purchase_return_items (purchase_return_id, product_variant_id, batch_id, quantity, unit_cost, total_cost)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(returnId, it.variantId, it.batchId, it.quantity, it.unitCost, lineTotal);

                // Deduct inventory batch
                db.prepare(`UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?`).run(it.quantity, it.batchId);

                // Stock transaction
                db.prepare(`
                    INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at)
                    VALUES (?, ?, ?, 'PURCHASE_RETURN', ?, ?, 'PURCHASE_RETURN', ?, ?, 'برگشت از خرید به تأمین‌کننده', ?)
                `).run(it.variantId, it.batchId, po.warehouse_id || 1, -it.quantity, it.unitCost, returnId, createdBy, retCreatedAt);
            }

            // Double-Entry Accounting:
            // Debit 201 (Accounts Payable) -> reduces liability to supplier
            // Credit 103 (Merchandise Inventory) -> reduces inventory
            const accAP = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;

            const dateStr = retCreatedAt.split(' ')[0];
            const entryNumber = `JE-PRET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                VALUES (?, ?, ?, 'PURCHASE_RETURN', ?, 1, ?, ?)
            `).run(entryNumber, dateStr, `سند برگشت از خرید ${retNumber} به ${supplier ? supplier.name : ''}`, returnId, createdBy, retCreatedAt);
            const jId = jRes.lastInsertRowid;

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, ?)
            `).run(jId, accAP, totalReturnAmount, `کاهش بستانکاری تأمین‌کننده بابت برگشت از خرید ${retNumber}`);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(jId, accInv, totalReturnAmount, `کاهش موجودی انبار بابت برگشت از خرید ${retNumber}`);

            return { returnId, returnNumber: retNumber, totalReturnAmount };
        });

        return retTx();
    },

    // Get Supplier Sub-Ledger (معین حساب تأمین‌کننده با گردش فاکتورها، پرداخت‌ها و مانده نهایی)
    getSupplierLedger(supplierId) {
        const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplierId);
        if (!supplier) return null;

        // Purchases (Credits to AP)
        const purchases = db.prepare(`
            SELECT id, po_number AS reference, total_amount AS credit, 0 AS debit, 'PURCHASE' AS type, created_at, notes AS description
            FROM purchase_orders
            WHERE supplier_id = ?
        `).all(supplierId);

        // Payments (Debits to AP)
        const payments = db.prepare(`
            SELECT id, payment_number AS reference, 0 AS credit, amount AS debit, 'PAYMENT' AS type, created_at, notes AS description
            FROM supplier_payments
            WHERE supplier_id = ?
        `).all(supplierId);

        // Returns (Debits to AP)
        const returns = db.prepare(`
            SELECT id, return_number AS reference, 0 AS credit, total_amount AS debit, 'RETURN' AS type, created_at, reason AS description
            FROM purchase_returns
            WHERE supplier_id = ?
        `).all(supplierId);

        const transactions = [...purchases, ...payments, ...returns].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        let balance = 0; // Positive balance = We owe the supplier (Credit balance)
        for (const t of transactions) {
            balance += (t.credit - t.debit);
            t.runningBalance = balance;
        }

        return {
            supplier,
            totalPurchases: purchases.reduce((s, p) => s + p.credit, 0),
            totalPayments: payments.reduce((s, p) => s + p.debit, 0),
            totalReturns: returns.reduce((s, r) => s + r.debit, 0),
            currentPayableBalance: balance,
            transactions
        };
    },

    // Get Supplier Aging Report (سنی‌بندی مطالبات و بدهی‌های تأمین‌کنندگان)
    getSupplierAging(supplierId = null) {
        let whereClause = 'WHERE (po.total_amount - po.paid_amount) > 0';
        const params = [];
        if (supplierId) {
            whereClause += ' AND s.id = ?';
            params.push(supplierId);
        }

        const query = `
            SELECT 
                s.id AS supplier_id,
                s.name AS supplier_name,
                po.id AS po_id,
                po.po_number,
                po.total_amount,
                po.paid_amount,
                (po.total_amount - po.paid_amount) AS remaining_payable,
                po.created_at,
                CAST((julianday('now') - julianday(po.created_at)) AS INTEGER) AS days_passed
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY days_passed DESC
        `;

        const rows = db.prepare(query).all(...params);

        const summary = {
            current_0_30: 0,
            overdue_31_60: 0,
            overdue_61_90: 0,
            overdue_90_plus: 0,
            totalPayable: 0,
            items: []
        };

        for (const r of rows) {
            summary.totalPayable += r.remaining_payable;
            let bucket = 'current_0_30';
            if (r.days_passed > 90) bucket = 'overdue_90_plus';
            else if (r.days_passed > 60) bucket = 'overdue_61_90';
            else if (r.days_passed > 30) bucket = 'overdue_31_60';

            summary[bucket] += r.remaining_payable;
            summary.items.push({ ...r, agingBucket: bucket });
        }

        return summary;
    }
};

module.exports = procurementService;
