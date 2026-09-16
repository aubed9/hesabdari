const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestDb,
    teardownTestDb,
    seedProductWithBatches,
    seedSupplier,
    assertGeneralLedgerBalanced,
    getAccountNetBalance
} = require('../helpers/testDb');

const procurementService = require('../../services/procurementService');

describe('Tier 1: Procurement, Supplier AP Sub-Ledger & Purchase Returns', () => {
    let db;
    let fixtures;
    let supplier;
    let variantId;

    before(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;

        supplier = seedSupplier(db, {
            name: 'شرکت بازرگانی آرایشی سینا',
            company: 'سینا پرفکت بیوتی',
            mobile: '09121112233'
        });

        const prod = seedProductWithBatches(db, {
            name: 'سرم ویتامین سی گارنیر',
            sku: 'GAR-VIT-C-30',
            sellingPrice: 420000,
            batches: []
        });
        variantId = prod.variantId;
    });

    after(() => {
        teardownTestDb();
    });

    test('T1-PROC-1: Purchase order receipt creates inventory batch and posts Dr 103 / Cr 201', () => {
        const poRes = procurementService.createPurchaseOrder({
            supplierId: supplier.id,
            warehouseId: 1,
            items: [{
                variantId,
                batchNumber: 'LOT-GAR-2026',
                expiryDate: '2027-12-31',
                quantity: 50,
                unitCost: 250000
            }],
            notes: 'خرید عمده سرم ویتامین سی'
        });

        assert.ok(poRes.poId);
        assert.equal(poRes.totalAmount, 50 * 250000); // 12,500,000

        // Inventory batch created
        const batch = db.prepare(`SELECT * FROM inventory_batches WHERE id = ?`).get(poRes.batchIds[0]);
        assert.equal(batch.quantity, 50);
        assert.equal(batch.purchase_price, 250000);

        // General Ledger must balance
        assertGeneralLedgerBalanced(db);

        // Inventory (103) debit 12.5M, AP (201) credit 12.5M
        assert.equal(getAccountNetBalance(db, '103'), 12500000);
        assert.equal(getAccountNetBalance(db, '201'), 12500000);
    });

    test('T1-PROC-2: Supplier payment reduces AP and Bank balance with balanced journal', () => {
        // Pay 5,000,000 towards supplier AP
        const payRes = procurementService.recordSupplierPayment({
            supplierId: supplier.id,
            amount: 5000000,
            paymentMethod: 'BANK',
            referenceCode: 'TRX-BANK-9988',
            notes: 'پرداخت چک تضمین شده / حواله پایا'
        });

        assert.ok(payRes.paymentId);
        assert.equal(payRes.amount, 5000000);

        // GL must be balanced
        assertGeneralLedgerBalanced(db);

        // Remaining AP should now be 12.5M - 5M = 7.5M
        assert.equal(getAccountNetBalance(db, '201'), 7500000);
        // Bank (102) credited by 5M (net balance -5M)
        assert.equal(getAccountNetBalance(db, '102'), -5000000);
    });

    test('T1-PROC-3: Purchase return reduces inventory batch and AP liability', () => {
        // Fetch the created PO and batch
        const po = db.prepare(`SELECT * FROM purchase_orders WHERE supplier_id = ? LIMIT 1`).get(supplier.id);
        const batch = db.prepare(`SELECT * FROM inventory_batches WHERE product_variant_id = ? LIMIT 1`).get(variantId);

        // Return 5 damaged units (unit cost 250,000 = 1,250,000 Toman)
        const retRes = procurementService.recordPurchaseReturn({
            purchaseOrderId: po.id,
            supplierId: supplier.id,
            items: [{
                variantId,
                batchId: batch.id,
                quantity: 5,
                unitCost: 250000
            }],
            reason: 'بسته‌بندی معیوب کارخانه'
        });

        assert.ok(retRes.returnId);
        assert.equal(retRes.totalReturnAmount, 1250000);

        // Batch quantity reduced from 50 to 45
        const batchAfter = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(batch.id);
        assert.equal(batchAfter.quantity, 45);

        // GL balanced
        assertGeneralLedgerBalanced(db);

        // Remaining AP should be 7.5M - 1.25M = 6.25M
        assert.equal(getAccountNetBalance(db, '201'), 6250000);
    });

    test('T1-PROC-4: Supplier Sub-Ledger reflects purchases, payments, returns, and accurate payable balance', () => {
        const ledger = procurementService.getSupplierLedger(supplier.id);

        assert.ok(ledger);
        assert.equal(ledger.totalPurchases, 12500000);
        assert.equal(ledger.totalPayments, 5000000);
        assert.equal(ledger.totalReturns, 1250000);
        assert.equal(ledger.currentPayableBalance, 6250000);
        assert.equal(ledger.transactions.length, 3);
    });

    test('T1-PROC-5: Supplier Aging report groups open payables accurately', () => {
        const aging = procurementService.getSupplierAging(supplier.id);

        assert.ok(aging);
        assert.ok(aging.totalPayable > 0);
        assert.equal(aging.items.length, 1);
        assert.equal(aging.items[0].agingBucket, 'current_0_30');
    });
});
