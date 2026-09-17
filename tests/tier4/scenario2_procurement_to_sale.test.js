/**
 * Tier 4: Real-World Application Scenarios — Scenario 2: Procurement to Retail Sale Lifecycle
 * Simulates purchasing goods with multiple batches -> retail sale via FEFO -> GL inventory valuation reconciliation
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedSupplier,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

describe('Tier 4: Scenario 2 — Procurement to Retail Sale Lifecycle', () => {
    let db, fixtures, procurementService, posService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        procurementService = require('../../services/procurementService');
        posService = require('../../services/posService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('Scenario 2: End-to-end procurement -> FEFO sale -> GL inventory valuation reconciliation', () => {
        const supplier = seedSupplier(db, { name: 'شرکت واردات زیبایی ارغوان' });

        const prod = seedProductWithBatches(db, {
            name: 'سرم ضد چروک باکوچیول',
            sku: 'SRM-BKC-01',
            barcode: '6269102001001',
            sellingPrice: 250000,
            batches: [] // initially empty
        });

        // --- STEP 1: GOODS RECEIPT VIA PURCHASE ORDER ---
        // Batch 1: 20 units @ 100,000 (exp: 2027-06-30) = 2,000,000
        // Batch 2: 30 units @ 120,000 (exp: 2028-01-31) = 3,600,000
        // Total invoice = 5,600,000
        const po = procurementService.createPurchaseOrder({
            supplierId: supplier.id,
            warehouseId: fixtures.warehouseId,
            createdBy: fixtures.users.manager.id,
            items: [
                { variantId: prod.variantId, batchNumber: 'LOT-BKC-EARLY', expiryDate: '2027-06-30', quantity: 20, unitCost: 100000 },
                { variantId: prod.variantId, batchNumber: 'LOT-BKC-LATER', expiryDate: '2028-01-31', quantity: 30, unitCost: 120000 }
            ]
        });

        assert.ok(po.poId);
        assert.equal(po.totalAmount, 5600000);

        // GL check after receipt: Dr 103 (Inventory) 5.6M / Cr 201 (AP) 5.6M
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '103'), 5600000);
        assert.equal(getAccountNetBalance(db, '201'), 5600000);

        // --- STEP 2: RETAIL SALE CONSUMING BATCHES VIA FEFO ---
        // Customer buys 25 units @ 250,000 = 6,250,000
        // Allocation: 20 from Batch 1 (cost 2,000,000) + 5 from Batch 2 (cost 600,000) = total COGS 2,600,000
        const sale = posService.createOrder({
            employeeId: fixtures.users.cashier.id,
            cashSessionId: fixtures.cashSessionId,
            items: [{ variantId: prod.variantId, quantity: 25, unitPrice: 250000 }],
            payments: [{ method: 'CARD', amount: 6250000 }]
        });

        assert.ok(sale.orderId);
        assert.equal(sale.totalAmount, 6250000);
        assert.equal(sale.totalCogs, 2600000);

        // Verify remaining batch quantities
        const b1 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(po.batchIds[0]);
        const b2 = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(po.batchIds[1]);
        assert.equal(b1.quantity, 0, 'Batch 1 must be 100% depleted');
        assert.equal(b2.quantity, 25, 'Batch 2 must have 25 units remaining');

        // --- STEP 3: PHYSICAL INVENTORY VALUATION VS GENERAL LEDGER ---
        // Calculate physical inventory valuation: SUM(batch_quantity * batch_purchase_price)
        const valuationRow = db.prepare(`
            SELECT COALESCE(SUM(quantity * purchase_price), 0) AS total_valuation
            FROM inventory_batches
            WHERE product_variant_id = ?
        `).get(prod.variantId);

        // 25 units * 120,000 = 3,000,000
        assert.equal(valuationRow.total_valuation, 3000000);

        // Net balance of GL Account 103: 5,600,000 (Dr) - 2,600,000 (Cr) = 3,000,000
        const glInventoryBalance = getAccountNetBalance(db, '103');
        assert.equal(glInventoryBalance, 3000000, 'Physical inventory valuation must strictly match GL Account 103');
        assert.equal(valuationRow.total_valuation, glInventoryBalance);

        // --- STEP 4: SUPPLIER AP SETTLEMENT ---
        // Settle open payable in full: 5,600,000 paid via Bank
        const pmt = procurementService.recordSupplierPayment({
            supplierId: supplier.id,
            purchaseOrderId: po.poId,
            amount: 5600000,
            paymentMethod: 'BANK',
            referenceCode: 'PAY-FULL-SETTLE',
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(pmt.paymentId);

        // Remaining supplier payable in GL Account 201 must be 0
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '201'), 0, 'Supplier AP balance in GL 201 must be 0 after full payment');

        const ledger = procurementService.getSupplierLedger(supplier.id);
        assert.equal(ledger.currentPayableBalance, 0);
    });
});
