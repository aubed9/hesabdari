/**
 * Tier 3: Cross-Feature Integration — Procurement + Inventory Batches + Supplier AP Accounting
 * Verifies the procurement-to-payment cycle and purchase return reconciliation
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

describe('Tier 3: Procurement + Inventory + AP Integration', () => {
    let db, fixtures, procurementService;

    beforeEach(() => {
        const setup = setupTestDb();
        db = setup.db;
        fixtures = setup.fixtures;
        procurementService = require('../../services/procurementService');
    });

    afterEach(() => {
        teardownTestDb();
    });

    test('T3-PROC-INV-ACC-1: PO receipt creates batches and posts Dr 103 / Cr 201; partial payment reconciles AP sub-ledger to GL 201', () => {
        const supplier = seedSupplier(db, { name: 'شرکت بازرگانی ستاره خاورمیانه' });

        const prod = seedProductWithBatches(db, {
            name: 'ماسک ضد آکنه سالیسیلیک اسید',
            sku: 'MSK-ACN-01',
            barcode: '6269003001001',
            sellingPrice: 280000,
            batches: [] // empty initial batches
        });

        // 1. Receive PO with 2 batches: Total = (20 * 140,000) + (30 * 150,000) = 2,800,000 + 4,500,000 = 7,300,000
        const po = procurementService.createPurchaseOrder({
            supplierId: supplier.id,
            warehouseId: fixtures.warehouseId,
            createdBy: fixtures.users.manager.id,
            notes: 'خرید عمده پاییزه',
            items: [
                { variantId: prod.variantId, batchNumber: 'LOT-ACN-B1', expiryDate: '2028-06-30', quantity: 20, unitCost: 140000 },
                { variantId: prod.variantId, batchNumber: 'LOT-ACN-B2', expiryDate: '2028-12-31', quantity: 30, unitCost: 150000 }
            ]
        });

        assert.ok(po.poId);
        assert.equal(po.totalAmount, 7300000);
        assert.equal(po.batchIds.length, 2);

        // Verify batches exist in inventory
        const batches = db.prepare(`SELECT * FROM inventory_batches WHERE product_variant_id = ?`).all(prod.variantId);
        assert.equal(batches.length, 2);
        assert.equal(batches[0].quantity, 20);
        assert.equal(batches[1].quantity, 30);

        // GL check: Dr 103 (Inventory) 7.3M / Cr 201 (Accounts Payable) 7.3M
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '103'), 7300000);
        assert.equal(getAccountNetBalance(db, '201'), 7300000);

        // 2. Pay 4,000,000 to supplier against this PO
        const payResult = procurementService.recordSupplierPayment({
            supplierId: supplier.id,
            purchaseOrderId: po.poId,
            amount: 4000000,
            paymentMethod: 'BANK',
            referenceCode: 'TRF-SUP-7788',
            createdBy: fixtures.users.accountant.id
        });

        assert.ok(payResult.paymentId);

        // GL check after payment: Cr Bank 4M, Dr AP 4M -> remaining AP = 3,300,000
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '201'), 3300000, 'GL Account 201 must equal remaining payable of 3,300,000');
        assert.equal(getAccountNetBalance(db, '102'), -4000000, 'Bank balance reduced by 4,000,000');

        // Verify Supplier Sub-Ledger
        const ledger = procurementService.getSupplierLedger(supplier.id);
        assert.equal(ledger.totalPurchases, 7300000);
        assert.equal(ledger.totalPayments, 4000000);
        assert.equal(ledger.currentPayableBalance, 3300000, 'Supplier sub-ledger balance must strictly equal GL Account 201');
    });

    test('T3-PROC-INV-ACC-2: Purchase return reduces batch stock and posts Dr 201 / Cr 103 debit note', () => {
        const supplier = seedSupplier(db, { name: 'پخش آرایشی نیلوفر سپید' });

        const prod = seedProductWithBatches(db, {
            name: 'سرم دور چشم کافئین ۵٪',
            sku: 'SRM-CAF-01',
            barcode: '6269003001002',
            sellingPrice: 320000,
            batches: []
        });

        // 1. Purchase 10 units at 160,000 = 1,600,000
        const po = procurementService.createPurchaseOrder({
            supplierId: supplier.id,
            warehouseId: fixtures.warehouseId,
            createdBy: fixtures.users.manager.id,
            items: [
                { variantId: prod.variantId, batchNumber: 'LOT-CAF-01', expiryDate: '2028-09-30', quantity: 10, unitCost: 160000 }
            ]
        });

        const batchId = po.batchIds[0];

        // 2. Return 3 units to supplier due to packaging defect
        const ret = procurementService.recordPurchaseReturn({
            purchaseOrderId: po.poId,
            supplierId: supplier.id,
            reason: 'بسته‌بندی معیوب و قفل آسیب‌دیده',
            createdBy: fixtures.users.stockkeeper.id,
            items: [
                { variantId: prod.variantId, batchId, quantity: 3, unitCost: 160000 }
            ]
        });

        assert.equal(ret.totalReturnAmount, 480000);

        // Batch quantity reduced from 10 to 7
        const batch = db.prepare(`SELECT quantity FROM inventory_batches WHERE id = ?`).get(batchId);
        assert.equal(batch.quantity, 7);

        // GL check: Remaining AP = 1,600,000 - 480,000 = 1,120,000
        assertGeneralLedgerBalanced(db);
        assert.equal(getAccountNetBalance(db, '201'), 1120000);
        assert.equal(getAccountNetBalance(db, '103'), 1120000);

        // Supplier ledger reflects return
        const ledger = procurementService.getSupplierLedger(supplier.id);
        assert.equal(ledger.totalReturns, 480000);
        assert.equal(ledger.currentPayableBalance, 1120000);
    });
});
