/**
 * Tier 4: Real-World Application Scenarios — Scenario 4: Layaway Reservation, Stock Conflict Isolation & Fulfillment
 * Simulates layaway reservation -> FEFO allocation -> stock conflict prevention -> 
 * boundary exhaustion -> remaining balance settlement -> reservation release & GL audit
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedCustomer,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

describe('Tier 4: Scenario 4 — Layaway Reservation, Stock Conflict Isolation & Fulfillment', () => {
    let db, fixtures, posService, reconciliationService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        posService = require('../../services/posService');
        reconciliationService = require('../../services/reconciliationService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('Scenario 4: Layaway reservation enforces FEFO, isolates stock from normal sales, and fulfills cleanly', () => {
        // --- STEP 1: INITIAL SETUP WITH MULTIPLE FEFO BATCHES ---
        const customerA = seedCustomer(db, {
            fullName: 'سارا بهرامی (مشتری رزرو بیعانه)',
            mobile: '09121112233',
            walletBalance: 0
        });

        const customerB = seedCustomer(db, {
            fullName: 'نیلوفر پارسا (خریدار نقدی)',
            mobile: '09124445566',
            walletBalance: 0
        });

        // High-demand anti-aging serum with 2 distinct batches
        // Batch 1 (Early expiry): 10 units @ 150,000 cost, exp: 2027-04-30
        // Batch 2 (Later expiry): 10 units @ 180,000 cost, exp: 2028-02-28
        // Total inventory: 20 units, Selling Price: 350,000 Toman
        const prod = seedProductWithBatches(db, {
            name: 'سرم رتینول جوانساز لاروش پوزای',
            sku: 'LRP-RET-01',
            barcode: '6269104001001',
            sellingPrice: 350000,
            batches: [
                { batchNumber: 'LOT-LRP-EARLY', expiryDate: '2027-04-30', qty: 10, cost: 150000 },
                { batchNumber: 'LOT-LRP-LATER', expiryDate: '2028-02-28', qty: 10, cost: 180000 }
            ]
        });

        // Verify initial state
        const initialBatch1 = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const initialBatch2 = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);
        assert.equal(initialBatch1.quantity, 10);
        assert.equal(initialBatch1.reserved_quantity, 0);
        assert.equal(initialBatch2.quantity, 10);
        assert.equal(initialBatch2.reserved_quantity, 0);

        // --- STEP 2: CUSTOMER A CREATES LAYAWAY FOR 12 UNITS ---
        // 12 units * 350,000 = 4,200,000 total
        // Customer A pays 1,500,000 CASH deposit
        const layawayOrder = posService.createOrder({
            customerId: customerA.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            orderType: 'LAYAWAY',
            items: [{ variantId: prod.variantId, quantity: 12, unitPrice: 350000 }],
            payments: [{ method: 'CASH', amount: 1500000 }]
        });

        assert.ok(layawayOrder.orderId);
        assert.equal(layawayOrder.isLayaway, true);
        assert.equal(layawayOrder.status, 'PENDING');
        assert.equal(layawayOrder.totalAmount, 4200000);

        // Verify FEFO reservation order:
        // Batch 1 (earlier expiry) must be 100% reserved: 10 of 10
        // Batch 2 (later expiry) must be partially reserved: 2 of 10
        const b1AfterLayaway = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2AfterLayaway = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);

        assert.equal(b1AfterLayaway.quantity, 10, 'Physical quantity on shelf unchanged during layaway reservation');
        assert.equal(b1AfterLayaway.reserved_quantity, 10, 'Batch 1 (early expiry) must be 100% reserved under FEFO');

        assert.equal(b2AfterLayaway.quantity, 10, 'Physical quantity on shelf unchanged during layaway reservation');
        assert.equal(b2AfterLayaway.reserved_quantity, 2, 'Batch 2 (later expiry) must have 2 units reserved');

        // Total available unreserved stock for regular sale is now strictly:
        // (10 - 10) + (10 - 2) = 0 + 8 = 8 units
        const availRow = db.prepare(`
            SELECT SUM(quantity - reserved_quantity) AS available_stock
            FROM inventory_batches
            WHERE product_variant_id = ?
        `).get(prod.variantId);
        assert.equal(availRow.available_stock, 8, 'Available stock must strictly equal unreserved quantity (8 units)');

        // --- STEP 3: STOCK CONFLICT ISOLATION & CANNIBALIZATION PREVENTION ---
        // Customer B enters and wants to purchase 9 units for immediate retail sale
        // Shelf physically has 20 units, but only 8 are unreserved. Request for 9 must fail!
        assert.throws(() => {
            posService.createOrder({
                customerId: customerB.id,
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prod.variantId, quantity: 9, unitPrice: 350000 }],
                payments: [{ method: 'CARD', amount: 3150000 }]
            });
        }, /موجودی.*کافی نیست/);

        // Verify that failed sale did not corrupt batch states (Atomicity check)
        const b1Check = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        assert.equal(b1Check.quantity, 10);
        assert.equal(b1Check.reserved_quantity, 10);

        // Customer B instead purchases all 8 available units
        // 8 * 350,000 = 2,800,000 CARD
        const saleOrderB = posService.createOrder({
            customerId: customerB.id,
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 8, unitPrice: 350000 }],
            payments: [{ method: 'CARD', amount: 2800000 }]
        });

        assert.ok(saleOrderB.orderId);
        assert.equal(saleOrderB.totalAmount, 2800000);

        // Verify stock after Customer B's sale:
        // Batch 1: quantity = 10, reserved = 10 (reserved for Customer A, untouched)
        // Batch 2: quantity was 10, depleted by 8 -> quantity is now 2, reserved is 2
        const b1AfterSaleB = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2AfterSaleB = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);

        assert.equal(b1AfterSaleB.quantity, 10);
        assert.equal(b1AfterSaleB.reserved_quantity, 10);

        assert.equal(b2AfterSaleB.quantity, 2, 'Batch 2 quantity reduced from 10 to 2');
        assert.equal(b2AfterSaleB.reserved_quantity, 2, 'Batch 2 reserved quantity remains 2 for Customer A');

        // Total available unreserved stock across all batches is now 0!
        const availZero = db.prepare(`
            SELECT SUM(quantity - reserved_quantity) AS available_stock
            FROM inventory_batches
            WHERE product_variant_id = ?
        `).get(prod.variantId);
        assert.equal(availZero.available_stock, 0);

        // A third customer attempting to purchase even 1 unit is rejected
        assert.throws(() => {
            posService.createOrder({
                employeeId: fixtures.users.cashier.id,
                cashSessionId: fixtures.cashSessionId,
                items: [{ variantId: prod.variantId, quantity: 1, unitPrice: 350000 }],
                payments: [{ method: 'CARD', amount: 350000 }]
            });
        }, /موجودی.*کافی نیست/);

        // --- STEP 4: FULFILLMENT OF CUSTOMER A'S LAYAWAY ORDER ---
        // Customer A returns to complete purchase:
        // Order Total: 4,200,000 | Deposit paid: 1,500,000 CASH | Remaining: 2,700,000 CARD
        const remainingAmount = 2700000;
        const fulfillDate = new Date().toISOString().replace('T', ' ').slice(0, 19);

        // Execute fulfillment transaction
        const fulfillTx = db.transaction(() => {
            // 1. Record final payment
            db.prepare(`
                INSERT INTO payments (order_id, payment_method, amount, reference_code, created_at)
                VALUES (?, 'CARD', ?, 'POS-LAYAWAY-FINAL', ?)
            `).run(layawayOrder.orderId, remainingAmount, fulfillDate);

            // 2. Mark order as COMPLETED and PAID
            db.prepare(`
                UPDATE orders
                SET status = 'COMPLETED',
                    payment_status = 'PAID'
                WHERE id = ?
            `).run(layawayOrder.orderId);

            // 3. Deduct physical stock and release reservations
            // Batch 1: 10 units fulfilled
            db.prepare(`
                UPDATE inventory_batches
                SET quantity = quantity - 10,
                    reserved_quantity = reserved_quantity - 10
                WHERE id = ?
            `).run(prod.batchIds[0]);

            // Batch 2: 2 units fulfilled
            db.prepare(`
                UPDATE inventory_batches
                SET quantity = quantity - 2,
                    reserved_quantity = reserved_quantity - 2
                WHERE id = ?
            `).run(prod.batchIds[1]);

            // 4. Log stock transactions
            db.prepare(`
                INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note)
                VALUES (?, ?, 1, 'SALE', -10, 150000, 'ORDER', ?, ?, 'تحویل سفارش بیعانه‌ای (بچ ۱)')
            `).run(prod.variantId, prod.batchIds[0], layawayOrder.orderId, fixtures.users.cashier.id);

            db.prepare(`
                INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note)
                VALUES (?, ?, 1, 'SALE', -2, 180000, 'ORDER', ?, ?, 'تحویل سفارش بیعانه‌ای (بچ ۲)')
            `).run(prod.variantId, prod.batchIds[1], layawayOrder.orderId, fixtures.users.cashier.id);

            // 5. Post double-entry accounting journal for layaway fulfillment
            // COGS: (10 * 150,000) + (2 * 180,000) = 1,500,000 + 360,000 = 1,860,000
            const totalCogs = 1860000;
            const revenue = 4200000;
            const cashDeposit = 1500000;
            const cardPayment = 2700000;

            const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
            const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const accRev = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get().id;
            const accCogs = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '501'`).get().id;

            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by)
                VALUES (?, DATE('now'), ?, 'LAYAWAY_FULFILL', ?, 1, ?)
            `).run(`JE-LAY-${layawayOrder.orderId}`, `سند تسویه و تحویل سفارش بیعانه‌ای ${layawayOrder.orderNumber}`, layawayOrder.orderId, fixtures.users.cashier.id);
            const jId = jRes.lastInsertRowid;

            const insertLine = db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `);

            // Dr Cash (Deposit) 1.5M
            insertLine.run(jId, accCash, cashDeposit, 0, 'دریافت بیعانه نقدی');
            // Dr Bank (Card Settlement) 2.7M
            insertLine.run(jId, accBank, cardPayment, 0, 'دریافت مانده تسویه کارت‌خوان');
            // Cr Sales Revenue 4.2M
            insertLine.run(jId, accRev, 0, revenue, 'درآمد فروش کالای بیعانه‌ای');

            // Dr COGS 1.86M
            insertLine.run(jId, accCogs, totalCogs, 0, 'بهای تمام شده کالای تحویل شده');
            // Cr Inventory 1.86M
            insertLine.run(jId, accInv, 0, totalCogs, 'کاهش موجودی انبار');
        });

        fulfillTx();

        // --- STEP 5: POST-FULFILLMENT INVARIANTS & RECONCILIATION ---
        // Both batches must now have quantity = 0 and reserved_quantity = 0 (zero orphan reservations)
        const b1Final = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[0]);
        const b2Final = db.prepare(`SELECT quantity, reserved_quantity FROM inventory_batches WHERE id = ?`).get(prod.batchIds[1]);

        assert.equal(b1Final.quantity, 0, 'Batch 1 completely fulfilled to 0');
        assert.equal(b1Final.reserved_quantity, 0, 'Batch 1 reserved quantity cleared to 0');

        assert.equal(b2Final.quantity, 0, 'Batch 2 completely fulfilled to 0');
        assert.equal(b2Final.reserved_quantity, 0, 'Batch 2 reserved quantity cleared to 0');

        // Check total orders state
        const updatedOrder = db.prepare(`SELECT status, payment_status FROM orders WHERE id = ?`).get(layawayOrder.orderId);
        assert.equal(updatedOrder.status, 'COMPLETED');
        assert.equal(updatedOrder.payment_status, 'PAID');

        // Global double-entry balance assertion
        assertGeneralLedgerBalanced(db);

        // Run full reconciliation engine to confirm ZERO critical anomalies across all domains
        const recon = reconciliationService.runAll();
        assert.equal(recon.summary.critical, 0, 'Reconciliation engine must report 0 CRITICAL discrepancies');
    });
});
