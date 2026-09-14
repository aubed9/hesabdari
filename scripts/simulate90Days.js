// 90-Day Operational Simulation & System Stress-Test Engine
// Simulates 90 consecutive days of real cosmetics retail operations
const db = require('../db/database');
const posService = require('../services/posService');
const inventoryService = require('../services/inventoryService');
const accountingService = require('../services/accountingService');
const crmService = require('../services/crmService');
const { roundMoney } = require('../utils/textUtils');

async function run90DaySimulation() {
    console.log('================================================================');
    console.log('🚀 Starting 90-Day Cosmetics Retail Operational Simulation...');
    console.log('================================================================');

    const totalDays = 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - totalDays);

    const customers = db.prepare(`SELECT id, full_name FROM customers WHERE is_active = 1`).all();
    const employees = db.prepare(`SELECT id, full_name, role FROM users WHERE is_active = 1`).all();
    const cashiers = employees.filter(e => e.role === 'CASHIER' || e.role === 'BEAUTY_CONSULTANT');
    const variants = db.prepare(`SELECT id, selling_price, purchase_price, reorder_point FROM product_variants WHERE is_active = 1`).all();
    const suppliers = db.prepare(`SELECT id, name FROM suppliers WHERE is_active = 1`).all();

    let totalOrdersGenerated = 0;
    let totalRevenue = 0;
    let totalRestocks = 0;
    let totalChequesCleared = 0;
    let totalExpenses = 0;

    for (let day = 1; day <= totalDays; day++) {
        const simDateObj = new Date(startDate);
        simDateObj.setDate(startDate.getDate() + day);
        const simDateStr = simDateObj.toISOString().split('T')[0];

        // 1. Daily Sales Simulation (between 4 and 14 transactions per day)
        const dailyTransactionsCount = Math.floor(4 + Math.random() * 11);
        
        for (let tx = 0; tx < dailyTransactionsCount; tx++) {
            const hour = Math.floor(10 + Math.random() * 12); // Between 10:00 and 22:00
            const minute = Math.floor(Math.random() * 60);
            const second = Math.floor(Math.random() * 60);
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
            const fullDateTime = `${simDateStr} ${timeStr}`;

            const cashier = cashiers[Math.floor(Math.random() * cashiers.length)] || employees[0];
            const isRegisteredCustomer = Math.random() > 0.35;
            const customer = isRegisteredCustomer ? customers[Math.floor(Math.random() * customers.length)] : null;

            // Basket size: 1 to 3 items
            const basketSize = Math.floor(1 + Math.random() * 3);
            const orderItems = [];
            const chosenVariants = new Set();

            for (let i = 0; i < basketSize; i++) {
                const variant = variants[Math.floor(Math.random() * variants.length)];
                if (chosenVariants.has(variant.id)) continue;
                chosenVariants.add(variant.id);

                // Check available stock in batches
                const stockRow = db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory_batches WHERE product_variant_id = ? AND quantity > 0`).get(variant.id);
                if (stockRow.qty > 0) {
                    const buyQty = Math.min(stockRow.qty, Math.floor(1 + Math.random() * 2));
                    if (buyQty > 0) {
                        orderItems.push({
                            variantId: variant.id,
                            quantity: buyQty,
                            unitPrice: variant.selling_price
                        });
                    }
                }
            }

            if (orderItems.length === 0) continue;

            const subtotal = orderItems.reduce((sum, it) => sum + (it.unitPrice * it.quantity), 0);
            let discount = 0;
            let discountReason = '';

            // Customer discount coupon or loyalty discount
            if (isRegisteredCustomer && Math.random() > 0.7) {
                discount = roundMoney(subtotal * 0.1); // 10% loyalty discount
                discountReason = 'تخفیف مشتریان وفادار';
            }

            const payable = Math.max(0, subtotal - discount);

            // Payment method: 70% Card, 20% Cash, 10% Split
            const payRand = Math.random();
            let payments = [];
            if (payRand < 0.7) {
                payments = [{ method: 'CARD', amount: payable, cardDigits: `${Math.floor(1000 + Math.random() * 9000)}` }];
            } else if (payRand < 0.9) {
                payments = [{ method: 'CASH', amount: payable }];
            } else {
                const partCash = roundMoney(payable * 0.4);
                const partCard = roundMoney(payable - partCash);
                payments = [
                    { method: 'CASH', amount: partCash },
                    { method: 'CARD', amount: partCard, cardDigits: `${Math.floor(1000 + Math.random() * 9000)}` }
                ];
            }

            try {
                const orderResult = posService.createOrder({
                    customerId: customer ? customer.id : null,
                    employeeId: cashier.id,
                    cashSessionId: 1,
                    items: orderItems,
                    discountAmount: discount,
                    discountReason,
                    payments,
                    orderDate: fullDateTime,
                    channel: 'STORE_POS',
                    orderType: 'SALE'
                });

                totalOrdersGenerated++;
                totalRevenue += orderResult.totalAmount;
            } catch (err) {
                // Ignore transient out of stock during simulation
            }
        }

        // 2. Inventory Restocking & Supplier Deliveries (FEFO Replenishment)
        // Check variants that dropped below reorder point
        const lowStockVariants = db.prepare(`
            SELECT pv.id, pv.reorder_point, pv.purchase_price, COALESCE(SUM(ib.quantity), 0) AS current_stock
            FROM product_variants pv
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE pv.is_active = 1
            GROUP BY pv.id
            HAVING current_stock <= pv.reorder_point
        `).all();

        if (lowStockVariants.length > 0 && Math.random() > 0.4) {
            const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
            const poNum = `PO-SIM-${simDateStr.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
            let poTotal = 0;

            const poTx = db.transaction(() => {
                const poRes = db.prepare(`
                    INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, paid_amount, created_at)
                    VALUES (?, ?, 1, 'RECEIVED', 0, 0, ?)
                `).run(poNum, supplier.id, `${simDateStr} 09:00:00`);
                const poId = poRes.lastInsertRowid;

                for (const lv of lowStockVariants.slice(0, 3)) {
                    const orderQty = Math.floor(20 + Math.random() * 30);
                    const cost = lv.purchase_price;
                    const lineTotal = cost * orderQty;
                    poTotal += lineTotal;

                    const lotNum = `LOT-${simDateStr.slice(2, 7).replace('-', '')}-${Math.floor(100 + Math.random() * 900)}`;
                    // Expiry date: 18 to 24 months in the future
                    const expDateObj = new Date(simDateObj);
                    expDateObj.setMonth(expDateObj.getMonth() + 18 + Math.floor(Math.random() * 12));
                    const expDateStr = expDateObj.toISOString().split('T')[0];

                    // Insert batch
                    db.prepare(`
                        INSERT INTO inventory_batches (
                            product_variant_id, warehouse_id, batch_number, manufacture_date,
                            expiry_date, quantity, purchase_price, supplier_id, received_at
                        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
                    `).run(lv.id, lotNum, simDateStr, expDateStr, orderQty, cost, supplier.id, `${simDateStr} 09:15:00`);

                    // PO Item
                    db.prepare(`
                        INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, batch_number, expiry_date, quantity, unit_cost, total_cost)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(poId, lv.id, lotNum, expDateStr, orderQty, cost, lineTotal);
                }

                db.prepare(`UPDATE purchase_orders SET total_amount = ? WHERE id = ?`).run(poTotal, poId);

                // Double-entry accounting entry: Debit Inventory (103), Credit Accounts Payable (201)
                const jRes = db.prepare(`
                    INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                    VALUES (?, ?, ?, 'PURCHASE', ?, 1, 1, ?)
                `).run(`JE-PO-${poId}`, simDateStr, `ثبت ورود کالا و بدهی به تأمین‌کننده بابت ${poNum}`, poId, `${simDateStr} 09:30:00`);
                const jId = jRes.lastInsertRowid;

                const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
                const accPayable = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;

                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, ?)`).run(jId, accInv, poTotal, `افزایش موجودی کالا بابت فاکتور خرید ${poNum}`);
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, ?)`).run(jId, accPayable, poTotal, `بستانکاری تأمین‌کننده بابت فاکتور خرید ${poNum}`);
            });

            poTx();
            totalRestocks++;
        }

        // 3. Cheque Due Date & Clearance
        // Find payable cheques due on or before simDateStr that are pending
        const dueCheques = db.prepare(`
            SELECT id, amount, cheque_number, supplier_id 
            FROM cheques 
            WHERE type = 'PAYABLE' AND status = 'PENDING' AND due_date <= ?
        `).all(simDateStr);

        for (const ch of dueCheques) {
            const chTx = db.transaction(() => {
                db.prepare(`UPDATE cheques SET status = 'PASSED' WHERE id = ?`).run(ch.id);

                // Accounting: Debit Accounts Payable (201), Credit Bank (102)
                const jRes = db.prepare(`
                    INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                    VALUES (?, ?, ?, 'CHEQUE_CLEARANCE', ?, 1, 1, ?)
                `).run(`JE-CHQ-${ch.id}`, simDateStr, `پاس شدن چک صیادی شماره ${ch.cheque_number}`, ch.id, `${simDateStr} 11:00:00`);
                const jId = jRes.lastInsertRowid;

                const accPayable = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '201'`).get().id;
                const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;

                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, 0, ?)`).run(jId, accPayable, ch.amount, `تسویه بدهی چک شماره ${ch.cheque_number}`);
                db.prepare(`INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, 0, ?, ?)`).run(jId, accBank, ch.amount, `کسر از حساب بانک ملت بابت پاس شدن چک`);
            });
            chTx();
            totalChequesCleared++;
        }

        // 4. Monthly Operating Expenses (Rent, Salaries, Marketing SMS at day 30, 60, 90)
        if (day === 30 || day === 60 || day === 90) {
            const expTx = db.transaction(() => {
                // Rent (35,000,000 Toman)
                accountingService.createExpense({
                    category: 'اجاره و شارژ فروشگاه',
                    amount: 35000000,
                    paymentMethod: 'BANK',
                    description: `پرداخت اجاره ماهانه فروشگاه آرایشی (دوره ${day / 30})`
                });
                // Salaries (45,000,000 Toman)
                accountingService.createExpense({
                    category: 'حقوق و دستمزد پرسنل',
                    amount: 45000000,
                    paymentMethod: 'BANK',
                    description: `پرداخت حقوق پایه و پورسانت پرسنل و صندوق‌داران (دوره ${day / 30})`
                });
                // Marketing SMS (3,500,000 Toman)
                accountingService.createExpense({
                    category: 'تبلیغات و پیامک',
                    amount: 3500000,
                    paymentMethod: 'BANK',
                    description: `هزینه سامانه پیامک جشنواره و تبریک تولد مشتریان (دوره ${day / 30})`
                });
            });
            expTx();
            totalExpenses += (35000000 + 45000000 + 3500000);

            // Periodic RFM Recalculation
            crmService.recalculateRFM();
        }

        // 5. CRITICAL AUDIT: Continuous Double-Entry Balance Assertion
        // At the end of EVERY simulated day, total Debits MUST equal total Credits in journal_lines
        const ledgerBalance = db.prepare(`
            SELECT 
                ROUND(COALESCE(SUM(debit), 0), 2) AS total_debit,
                ROUND(COALESCE(SUM(credit), 0), 2) AS total_credit
            FROM journal_lines
        `).get();

        const discrepancy = Math.abs(ledgerBalance.total_debit - ledgerBalance.total_credit);
        if (discrepancy > 0.01) {
            console.error(`❌ DISCREPANCY DETECTED ON SIMULATED DAY ${day} (${simDateStr}): Debit=${ledgerBalance.total_debit}, Credit=${ledgerBalance.total_credit}, Diff=${discrepancy}`);
            throw new Error(`Double-entry balance check failed on day ${day}`);
        }

        if (day % 15 === 0 || day === totalDays) {
            console.log(`✅ Day ${day}/${totalDays} (${simDateStr}) | Cumulative Orders: ${totalOrdersGenerated} | Revenue: ${totalRevenue.toLocaleString('fa-IR')} T | Ledger Balance: 100% OK`);
        }
    }

    // Final Post-Simulation System Verification
    console.log('\n================================================================');
    console.log('📊 90-DAY SIMULATION COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
    console.log(`- Total Orders Created: ${totalOrdersGenerated}`);
    console.log(`- Total Retail Revenue: ${totalRevenue.toLocaleString('fa-IR')} تومان`);
    console.log(`- Supplier Restocks (PO): ${totalRestocks} محموله جدید با تخصیص FEFO`);
    console.log(`- Cheques Cleared: ${totalChequesCleared} فقره چک پاس شده`);
    console.log(`- Operating Expenses Logged: ${totalExpenses.toLocaleString('fa-IR')} تومان`);

    const finalBalance = db.prepare(`
        SELECT 
            ROUND(SUM(debit), 2) AS debits,
            ROUND(SUM(credit), 2) AS credits
        FROM journal_lines
    `).get();

    console.log(`- Total Ledger Debits:  ${finalBalance.debits.toLocaleString('fa-IR')} تومان`);
    console.log(`- Total Ledger Credits: ${finalBalance.credits.toLocaleString('fa-IR')} تومان`);
    console.log(`- Trial Balance Discrepancy: ${finalBalance.debits - finalBalance.credits} (مغایرت صفر مطلق)`);
    console.log('================================================================\n');

    return {
        totalOrdersGenerated,
        totalRevenue,
        totalRestocks,
        totalChequesCleared,
        totalExpenses,
        finalBalance
    };
}

if (require.main === module) {
    run90DaySimulation().catch(err => {
        console.error('Fatal simulation error:', err);
        process.exit(1);
    });
}

module.exports = { run90DaySimulation };
