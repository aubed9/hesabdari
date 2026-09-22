// POS & Retail Sales Service
const db = require('../db/database');
const { normalizePersian, roundMoney } = require('../utils/textUtils');

const posService = {
    // Search product variant by barcode, SKU, or name/shade
    searchVariants(query) {
        if (!query || query.trim() === '') {
            return db.prepare(`
                SELECT 
                    pv.id AS variant_id,
                    p.name AS product_name,
                    p.name_fa AS product_name_fa,
                    b.name AS brand_name,
                    c.name_fa AS category_name,
                    pv.shade,
                    pv.color_hex,
                    pv.volume,
                    pv.sku,
                    pv.barcode,
                    pv.selling_price,
                    pv.purchase_price,
                    COALESCE(SUM(ib.quantity), 0) AS total_stock
                FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                JOIN brands b ON p.brand_id = b.id
                JOIN categories c ON p.category_id = c.id
                LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
                WHERE pv.is_active = 1
                GROUP BY pv.id
                ORDER BY p.name ASC
                LIMIT 50
            `).all();
        }

        const norm = normalizePersian(query.trim());
        const q = `%${norm}%`;
        return db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.name AS product_name,
                p.name_fa AS product_name_fa,
                b.name AS brand_name,
                c.name_fa AS category_name,
                pv.shade,
                pv.color_hex,
                pv.volume,
                pv.sku,
                pv.barcode,
                pv.selling_price,
                pv.purchase_price,
                COALESCE(SUM(ib.quantity), 0) AS total_stock
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE pv.is_active = 1 AND (
                NORM_FA(pv.barcode) LIKE ? OR
                NORM_FA(pv.sku) LIKE ? OR
                NORM_FA(pv.shade) LIKE ? OR
                NORM_FA(p.name) LIKE ? OR
                NORM_FA(p.name_fa) LIKE ? OR
                NORM_FA(b.name) LIKE ? OR
                NORM_FA(b.name_fa) LIKE ?
            )
            GROUP BY pv.id
            LIMIT 50
        `).all(q, q, q, q, q, q, q);
    },

    // Get product variant by exact barcode
    getByBarcode(barcode) {
        return db.prepare(`
            SELECT 
                pv.id AS variant_id,
                p.name AS product_name,
                p.name_fa AS product_name_fa,
                b.name AS brand_name,
                pv.shade,
                pv.color_hex,
                pv.volume,
                pv.sku,
                pv.barcode,
                pv.selling_price,
                pv.purchase_price,
                COALESCE(SUM(ib.quantity), 0) AS total_stock
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
            WHERE pv.barcode = ? AND pv.is_active = 1
            GROUP BY pv.id
        `).get(barcode);
    },

    // Recommendations disabled (Offline & No-AI mode)
    getCartRecommendations(variantIds) {
        return [];
    },

    // Create POS Order with FEFO batch allocation & automatic accounting journal
    createOrder({ customerId, employeeId, cashSessionId, items, discountAmount = 0, discountReason = '', payments, channel = 'STORE_POS', orderType = 'SALE', notes = '', orderDate = null }) {
        const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
        const orderCreatedAt = orderDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
        
        // Use a database transaction to guarantee ACID integrity
        const processCheckout = db.transaction(() => {
            let subtotal = 0;
            let totalCogs = 0;
            const allocatedItems = [];

            // Case 1: PROFORMA (پیش‌فاکتور - بدون کسر انبار و بدون سند مالی فروش)
            if (orderType === 'PROFORMA') {
                for (const item of items) {
                    const lineTotal = roundMoney(item.unitPrice * item.quantity);
                    subtotal += lineTotal;
                    allocatedItems.push({
                        variantId: item.variantId,
                        batchId: null,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        unitCost: 0,
                        totalPrice: lineTotal
                    });
                }
                const totalAmount = Math.max(0, roundMoney(subtotal - discountAmount));
                const orderRes = db.prepare(`
                    INSERT INTO orders (
                        order_number, order_type, channel, customer_id, employee_id,
                        cash_session_id, subtotal, discount_amount, discount_reason,
                        tax_amount, total_amount, total_cost, status, payment_status, notes, created_at
                    ) VALUES (?, 'PROFORMA', ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 'PENDING', 'UNPAID', ?, ?)
                `).run(orderNumber, channel, customerId || null, employeeId || 1, cashSessionId || null, subtotal, discountAmount, discountReason, totalAmount, notes, orderCreatedAt);
                const orderId = orderRes.lastInsertRowid;

                for (const alloc of allocatedItems) {
                    db.prepare(`
                        INSERT INTO order_items (order_id, product_variant_id, batch_id, quantity, unit_price, unit_cost, discount_amount, total_price)
                        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                    `).run(orderId, alloc.variantId, null, alloc.quantity, alloc.unitPrice, 0, alloc.totalPrice);
                }

                return {
                    orderId,
                    orderNumber,
                    subtotal,
                    discountAmount,
                    totalAmount,
                    isProforma: true,
                    status: 'PENDING',
                    createdAt: orderCreatedAt
                };
            }

            // Case 2: LAYAWAY (سفارش رزرو شده با بیعانه)
            if (orderType === 'LAYAWAY') {
                for (const item of items) {
                    if (!item.quantity || item.quantity <= 0) {
                        throw new Error('تعداد کالا در سفارش بیعانه باید بزرگتر از صفر باشد.');
                    }
                    const variant = db.prepare(`SELECT id, selling_price, purchase_price FROM product_variants WHERE id = ?`).get(item.variantId);
                    if (!variant) throw new Error(`محصول با شناسه ${item.variantId} یافت نشد.`);
                    const unitPrice = (item.unitPrice !== undefined && item.allowPriceOverride) ? item.unitPrice : (variant.selling_price || item.unitPrice || 0);

                    let remainingToFulfill = item.quantity;
                    const batches = db.prepare(`
                        SELECT id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price
                        FROM inventory_batches
                        WHERE product_variant_id = ? 
                          AND (quantity - reserved_quantity) > 0
                          AND (expiry_date IS NULL OR expiry_date >= DATE('now'))
                        ORDER BY expiry_date ASC
                    `).all(item.variantId);

                    for (const b of batches) {
                        if (remainingToFulfill <= 0) break;
                        const avail = b.quantity - b.reserved_quantity;
                        const takeQty = Math.min(avail, remainingToFulfill);

                        // Mark as reserved in batch
                        db.prepare(`UPDATE inventory_batches SET reserved_quantity = reserved_quantity + ? WHERE id = ?`).run(takeQty, b.id);

                        const unitCost = (b.purchase_price !== null && b.purchase_price !== undefined && b.purchase_price > 0)
                            ? b.purchase_price
                            : (variant.purchase_price || 0);

                        allocatedItems.push({
                            variantId: item.variantId,
                            batchId: b.id,
                            quantity: takeQty,
                            unitPrice: unitPrice,
                            unitCost: unitCost,
                            totalPrice: roundMoney(unitPrice * takeQty)
                        });

                        subtotal += roundMoney(unitPrice * takeQty);
                        totalCogs += roundMoney(unitCost * takeQty);
                        remainingToFulfill -= takeQty;
                    }
                }
                const totalAmount = Math.max(0, roundMoney(subtotal - discountAmount));

                // Deterministic discount allocation across lines
                let layawayDiscountSum = 0;
                for (let i = 0; i < allocatedItems.length; i++) {
                    const it = allocatedItems[i];
                    let lineDiscount = 0;
                    if (subtotal > 0 && discountAmount > 0) {
                        if (i === allocatedItems.length - 1) {
                            lineDiscount = discountAmount - layawayDiscountSum;
                        } else {
                            lineDiscount = Math.round((it.totalPrice / subtotal) * discountAmount);
                            layawayDiscountSum += lineDiscount;
                        }
                    }
                    it.discountAmount = lineDiscount;
                }

                const orderRes = db.prepare(`
                    INSERT INTO orders (
                        order_number, order_type, channel, customer_id, employee_id,
                        cash_session_id, subtotal, discount_amount, discount_reason,
                        tax_amount, total_amount, total_cost, status, payment_status, notes, created_at
                    ) VALUES (?, 'LAYAWAY', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'PENDING', 'PARTIAL', ?, ?)
                `).run(orderNumber, channel, customerId || null, employeeId || 1, cashSessionId || null, subtotal, discountAmount, discountReason, totalAmount, totalCogs, notes, orderCreatedAt);
                const orderId = orderRes.lastInsertRowid;

                for (const alloc of allocatedItems) {
                    db.prepare(`
                        INSERT INTO order_items (order_id, product_variant_id, batch_id, quantity, unit_price, unit_cost, discount_amount, total_price)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(orderId, alloc.variantId, alloc.batchId, alloc.quantity, alloc.unitPrice, alloc.unitCost, alloc.discountAmount || 0, alloc.totalPrice);
                }

                // Deposit payment if any
                for (const p of payments) {
                    const method = p.method === 'CARD_TO_CARD' ? 'ONLINE' : p.method;
                    const refCode = p.method === 'CARD_TO_CARD' 
                        ? `کارت‌به‌کارت ${p.ref ? `[پیگیری: ${p.ref}]` : ''}` 
                        : (p.ref || `POS-${Math.floor(100000 + Math.random() * 900000)}`);

                    db.prepare(`
                        INSERT INTO payments (order_id, payment_method, amount, card_last_digits, reference_code, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(orderId, method, p.amount, p.cardDigits || null, refCode, orderCreatedAt);
                }

                return {
                    orderId,
                    orderNumber,
                    subtotal,
                    discountAmount,
                    totalAmount,
                    isLayaway: true,
                    status: 'PENDING',
                    createdAt: orderCreatedAt
                };
            }

            // Case 3: SALE (فروش قطعی با کسر انبار به روش FEFO و صدور سند دوبل)
            for (const item of items) {
                if (!item.quantity || item.quantity <= 0) {
                    throw new Error('تعداد کالا باید بزرگتر از صفر باشد.');
                }
                const variant = db.prepare(`SELECT id, selling_price, purchase_price FROM product_variants WHERE id = ?`).get(item.variantId);
                if (!variant) throw new Error(`محصول با شناسه ${item.variantId} یافت نشد.`);
                const unitPrice = (item.unitPrice !== undefined && item.allowPriceOverride) ? item.unitPrice : (variant.selling_price || item.unitPrice || 0);

                let remainingToFulfill = item.quantity;

                // Fetch available batches ordered by expiry_date ASC (FEFO) excluding expired stock
                const batches = db.prepare(`
                    SELECT id, batch_number, expiry_date, quantity, reserved_quantity, purchase_price
                    FROM inventory_batches
                    WHERE product_variant_id = ? 
                      AND (quantity - reserved_quantity) > 0
                      AND (expiry_date IS NULL OR expiry_date >= DATE('now'))
                    ORDER BY expiry_date ASC
                `).all(item.variantId);

                const totalAvail = batches.reduce((sum, b) => sum + (b.quantity - b.reserved_quantity), 0);
                if (totalAvail < remainingToFulfill) {
                    throw new Error(`موجودی معتبر (غیرمنقضی و غیررزرو) برای محصول با شناسه ${item.variantId} کافی نیست. موجود: ${totalAvail}، درخواستی: ${remainingToFulfill}`);
                }

                for (const b of batches) {
                    if (remainingToFulfill <= 0) break;
                    const available = b.quantity - b.reserved_quantity;
                    const takeQty = Math.min(available, remainingToFulfill);
                    
                    // Deduct batch quantity
                    db.prepare(`UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?`).run(takeQty, b.id);

                    const unitCost = (b.purchase_price !== null && b.purchase_price !== undefined && b.purchase_price > 0)
                        ? b.purchase_price
                        : (variant.purchase_price || 0);

                    // Track allocation
                    allocatedItems.push({
                        variantId: item.variantId,
                        batchId: b.id,
                        quantity: takeQty,
                        unitPrice: unitPrice,
                        unitCost: unitCost,
                        totalPrice: roundMoney(unitPrice * takeQty)
                    });

                    subtotal += roundMoney(unitPrice * takeQty);
                    totalCogs += roundMoney(unitCost * takeQty);
                    remainingToFulfill -= takeQty;
                }
            }

            const totalAmount = Math.max(0, roundMoney(subtotal - discountAmount));

            // Deterministic discount allocation across order lines
            let saleDiscountSum = 0;
            for (let i = 0; i < allocatedItems.length; i++) {
                const it = allocatedItems[i];
                let lineDiscount = 0;
                if (subtotal > 0 && discountAmount > 0) {
                    if (i === allocatedItems.length - 1) {
                        lineDiscount = discountAmount - saleDiscountSum;
                    } else {
                        lineDiscount = Math.round((it.totalPrice / subtotal) * discountAmount);
                        saleDiscountSum += lineDiscount;
                    }
                }
                it.discountAmount = lineDiscount;
            }

            // Compute real payment status
            const finalPayments = (payments === undefined || payments === null) 
                ? [{ method: 'CARD', amount: totalAmount }] 
                : payments;
            const totalPaid = finalPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            let paymentStatus;
            if (totalPaid >= totalAmount) {
                paymentStatus = 'PAID';
            } else if (totalPaid > 0) {
                paymentStatus = 'PARTIAL';
            } else {
                paymentStatus = 'UNPAID';
            }

            // 1. Insert Order
            const orderRes = db.prepare(`
                INSERT INTO orders (
                    order_number, order_type, channel, customer_id, employee_id,
                    cash_session_id, subtotal, discount_amount, discount_reason,
                    tax_amount, total_amount, total_cost, status, payment_status, notes, created_at
                ) VALUES (?, 'SALE', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'COMPLETED', ?, ?, ?)
            `).run(
                orderNumber, channel, customerId || null, employeeId || 1,
                cashSessionId || null, subtotal, discountAmount, discountReason,
                totalAmount, totalCogs, paymentStatus, notes, orderCreatedAt
            );
            const orderId = orderRes.lastInsertRowid;

            // 2. Insert Order Items & Stock Transactions
            for (const alloc of allocatedItems) {
                db.prepare(`
                    INSERT INTO order_items (order_id, product_variant_id, batch_id, quantity, unit_price, unit_cost, discount_amount, total_price)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(orderId, alloc.variantId, alloc.batchId, alloc.quantity, alloc.unitPrice, alloc.unitCost, alloc.discountAmount || 0, alloc.totalPrice);

                db.prepare(`
                    INSERT INTO stock_transactions (
                        product_variant_id, batch_id, warehouse_id, transaction_type,
                        quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at
                    ) VALUES (?, ?, 1, 'SALE', ?, ?, 'ORDER', ?, ?, 'فروش POS با تخصیص FEFO', ?)
                `).run(alloc.variantId, alloc.batchId, -alloc.quantity, alloc.unitCost, orderId, employeeId || 1, orderCreatedAt);
            }

            // Check remaining stock per variant and trigger alerts if stock < 3
            const processedVariants = [...new Set(items.map(i => i.variantId))];
            for (const vId of processedVariants) {
                const remRow = db.prepare(`
                    SELECT 
                        COALESCE(SUM(ib.quantity), 0) AS remaining_stock,
                        pv.shade,
                        p.name_fa AS product_name
                    FROM product_variants pv
                    JOIN products p ON pv.product_id = p.id
                    LEFT JOIN inventory_batches ib ON pv.id = ib.product_variant_id
                    WHERE pv.id = ?
                    GROUP BY pv.id
                `).get(vId);

                if (remRow) {
                    const rem = remRow.remaining_stock;
                    if (rem === 0) {
                        db.prepare(`
                            INSERT INTO alerts (alert_type, severity, title, message)
                            VALUES ('OUT_OF_STOCK', 'CRITICAL', ?, ?)
                        `).run(
                            `اتمام موجودی کالا: ${remRow.product_name}`,
                            `موجودی کالای «${remRow.product_name} - ${remRow.shade || ''}» پس از سفارش ${orderNumber} به پایان رسید (صفر شد).`
                        );
                    } else if (rem < 3) {
                        db.prepare(`
                            INSERT INTO alerts (alert_type, severity, title, message)
                            VALUES ('LOW_STOCK', 'CRITICAL', ?, ?)
                        `).run(
                            `هشدار کسری موجودی (زیر ۳ عدد): ${remRow.product_name}`,
                            `موجودی کالای «${remRow.product_name} - ${remRow.shade || ''}» به کمتر از ۳ عدد رسید (موجودی فعلی: ${rem} عدد).`
                        );
                    }
                }
            }

            // 3. Insert Payments
            for (const p of finalPayments) {
                if (p.amount > 0) {
                    const method = p.method === 'CARD_TO_CARD' ? 'ONLINE' : p.method;
                    const refCode = p.method === 'CARD_TO_CARD' 
                        ? `کارت‌به‌کارت ${p.ref ? `[پیگیری: ${p.ref}]` : ''}` 
                        : (p.ref || `POS-${Math.floor(100000 + Math.random() * 900000)}`);

                    db.prepare(`
                        INSERT INTO payments (order_id, payment_method, amount, card_last_digits, reference_code, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(orderId, method, p.amount, p.cardDigits || null, refCode, orderCreatedAt);
                }
            }

            // 4. Update Customer Loyalty & Wallet if customer selected
            if (customerId) {
                const pointsEarned = Math.floor(totalAmount / 100000) * 10;
                db.prepare(`
                    UPDATE customers 
                    SET loyalty_points = loyalty_points + ?,
                        clv = clv + ?
                    WHERE id = ?
                `).run(pointsEarned, totalAmount, customerId);

                if (pointsEarned > 0) {
                    db.prepare(`
                        INSERT INTO loyalty_transactions (customer_id, type, points, order_id, description, created_at)
                        VALUES (?, 'EARN', ?, ?, 'امتیاز کسب شده از خرید', ?)
                    `).run(customerId, pointsEarned, orderId, orderCreatedAt);
                }

                // If paid by wallet, deduct wallet balance
                const walletPay = finalPayments.find(p => p.method === 'WALLET');
                if (walletPay && walletPay.amount > 0) {
                    const cust = db.prepare(`SELECT wallet_balance FROM customers WHERE id = ?`).get(customerId);
                    if (!cust) {
                        throw new Error('Constraint violation: مشتری یافت نشد');
                    }
                    if (cust.wallet_balance < walletPay.amount) {
                        throw new Error('Constraint violation: موجودی کیف پول برای این پرداخت کافی نیست');
                    }
                    db.prepare(`UPDATE customers SET wallet_balance = wallet_balance - ? WHERE id = ?`).run(walletPay.amount, customerId);
                    db.prepare(`
                        INSERT INTO wallet_transactions (customer_id, type, amount, order_id, description, created_at)
                        VALUES (?, 'WITHDRAW', ?, ?, 'پرداخت با کیف پول در فاکتور', ?)
                    `).run(customerId, -walletPay.amount, orderId, orderCreatedAt);
                }

                // If paid by points, deduct loyalty points
                const pointsPay = finalPayments.find(p => p.method === 'POINTS');
                if (pointsPay && pointsPay.amount > 0) {
                    const cust = db.prepare(`SELECT loyalty_points FROM customers WHERE id = ?`).get(customerId);
                    const pointsNeeded = Math.ceil(pointsPay.amount / 500);
                    if (!cust || cust.loyalty_points < pointsNeeded) {
                        throw new Error(`امتیاز وفاداری کافی نیست. نیاز به ${pointsNeeded} امتیاز، موجود: ${cust ? cust.loyalty_points : 0}`);
                    }
                    db.prepare(`UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?`).run(pointsNeeded, customerId);
                    db.prepare(`
                        INSERT INTO loyalty_transactions (customer_id, type, points, order_id, description, created_at)
                        VALUES (?, 'REDEEM', ?, ?, 'استفاده از امتیاز برای خرید فاکتور', ?)
                    `).run(customerId, -pointsNeeded, orderId, orderCreatedAt);
                }
            } else {
                const walletPay = finalPayments.find(p => p.method === 'WALLET');
                if (walletPay && walletPay.amount > 0) {
                    throw new Error('برای پرداخت با کیف پول انتخاب مشتری الزامی است');
                }
                const pointsPay = finalPayments.find(p => p.method === 'POINTS');
                if (pointsPay && pointsPay.amount > 0) {
                    throw new Error('برای پرداخت با امتیاز وفاداری انتخاب مشتری الزامی است');
                }
            }

            // 5. Automatic Double-Entry Accounting Journal
            const dateStr = orderCreatedAt.split(' ')[0];
            const entryNumber = `JE-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                VALUES (?, ?, ?, 'POS_SALE', ?, 1, ?, ?)
            `).run(entryNumber, dateStr, `سند اتوماتیک فروش فاکتور ${orderNumber}`, orderId, employeeId || 1, orderCreatedAt);
            const jId = jRes.lastInsertRowid;

            const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
            const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const accAR = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '104'`).get()?.id || accBank;
            const accNotes = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '106'`).get();
            const accWallet = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '205'`).get();
            const accRev = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get().id;
            const accDisc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '403'`).get().id;
            const accCOGS = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '501'`).get().id;
            const accPointsDisc = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '603'`).get();

            const paymentAccountMap = {
                'CASH': accCash,
                'CARD': accBank,
                'ONLINE': accBank,
                'CARD_TO_CARD': accBank,
                'WALLET': accWallet ? accWallet.id : accBank,
                'POINTS': accPointsDisc ? accPointsDisc.id : accDisc,
                'CHEQUE': accNotes ? accNotes.id : accBank
            };

            const methodPersianNames = {
                'CASH': 'نقدی (صندوق)',
                'CARD': 'کارتخوان (پوز)',
                'ONLINE': 'کارت به کارت / انتقال بانکی',
                'CARD_TO_CARD': 'کارت به کارت (انتقال بانکی)',
                'WALLET': 'کیف پول مشتری',
                'POINTS': 'تخفیف امتیاز وفاداری',
                'CHEQUE': 'چک دریافتی'
            };

            for (const p of finalPayments) {
                if (p.amount > 0) {
                    const targetAcc = paymentAccountMap[p.method] || accBank;
                    const methodName = methodPersianNames[p.method] || p.method;
                    db.prepare(`
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                        VALUES (?, ?, ?, 0, ?)
                    `).run(jId, targetAcc, p.amount, `دریافت ${methodName} بابت فاکتور ${orderNumber}`);
                }
            }

            // Debit Accounts Receivable (104) for any remaining unpaid balance
            const remainingUnpaid = totalAmount - totalPaid;
            if (remainingUnpaid > 0) {
                db.prepare(`
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                    VALUES (?, ?, ?, 0, ?)
                `).run(jId, accAR, remainingUnpaid, `بدهی مشتری / نسیه فاکتور ${orderNumber}`);
            }

            // Debit Discount (if any)
            if (discountAmount > 0) {
                db.prepare(`
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                    VALUES (?, ?, ?, 0, ?)
                `).run(jId, accDisc, discountAmount, `تخفیف اعطا شده روی فاکتور ${orderNumber}`);
            }

            // Credit Sales Revenue (subtotal)
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(jId, accRev, subtotal, `درآمد فروش ناخالص فاکتور ${orderNumber}`);

            // Debit COGS & Credit Inventory
            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, 0, ?)
            `).run(jId, accCOGS, totalCogs, `بهای تمام شده کالای فروش رفته فاکتور ${orderNumber}`);

            db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, 0, ?, ?)
            `).run(jId, accInv, totalCogs, `کاهش موجودی کالای انبار بابت فاکتور ${orderNumber}`);

            return {
                orderId,
                orderNumber,
                subtotal,
                discountAmount,
                totalAmount,
                totalCogs,
                itemsCount: allocatedItems.length,
                createdAt: new Date().toISOString()
            };
        });

        return processCheckout();
    },

    // Get order details with items for receipt printing or invoice view
    getOrderDetails(orderId) {
        const order = db.prepare(`
            SELECT 
                o.*,
                c.full_name AS customer_name,
                c.mobile AS customer_mobile,
                u.full_name AS cashier_name
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            LEFT JOIN users u ON o.employee_id = u.id
            WHERE o.id = ? OR o.order_number = ?
        `).get(orderId, orderId);

        if (!order) return null;

        const items = db.prepare(`
            SELECT 
                oi.*,
                p.name_fa AS product_name,
                b.name AS brand_name,
                pv.shade,
                pv.sku,
                pv.barcode,
                ib.batch_number,
                ib.expiry_date
            FROM order_items oi
            JOIN product_variants pv ON oi.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN brands b ON p.brand_id = b.id
            LEFT JOIN inventory_batches ib ON oi.batch_id = ib.id
            WHERE oi.order_id = ?
        `).all(order.id);

        const payments = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).all(order.id);

        return { ...order, items, payments };
    },

    // Process Sales Return (با کنترل بسته باز شده و پلمپ، ضد دابل‌ریترن و اسناد معکوس دوبل)
    processReturn({ originalOrderId, customerId, employeeId, items, refundMethod = 'WALLET_CREDIT', reason = '' }) {
        const returnTx = db.transaction(() => {
            // 1. Validate original order
            const originalOrder = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(originalOrderId);
            if (!originalOrder) {
                throw new Error(`سفارش مرجع با شناسه ${originalOrderId} یافت نشد.`);
            }
            if (originalOrder.status === 'CANCELLED') {
                throw new Error(`امکان مرجوعی برای فاکتور باطل‌شده وجود ندارد.`);
            }

            const effectiveCustomerId = customerId || originalOrder.customer_id;
            const retNumber = `RET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const returnCreatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

            let totalRefund = 0;
            let totalRestockCost = 0;
            let totalDamagedCost = 0;
            const processedItems = [];

            // 2. Validate items against original order items & anti-double-return
            for (const item of items) {
                const orderItem = db.prepare(`
                    SELECT * FROM order_items WHERE id = ? AND order_id = ?
                `).get(item.orderItemId, originalOrderId);

                if (!orderItem) {
                    throw new Error(`آیتم فاکتور با شناسه ${item.orderItemId} در سفارش مرجع یافت نشد.`);
                }

                const alreadyReturned = orderItem.returned_quantity || 0;
                const returnableQty = orderItem.quantity - alreadyReturned;

                if (item.quantity <= 0) {
                    throw new Error(`تعداد مرجوعی باید بزرگتر از صفر باشد.`);
                }
                if (item.quantity > returnableQty) {
                    throw new Error(`تعداد درخواستی مرجوعی (${item.quantity}) بیش از تعداد باقی‌مانده مجاز (${returnableQty}) است.`);
                }

                // Calculate refund amount SERVER-SIDE (unit_price minus proportionate discount)
                const unitDiscount = orderItem.discount_amount ? (orderItem.discount_amount / orderItem.quantity) : 0;
                const effectiveUnitPrice = Math.max(0, orderItem.unit_price - unitDiscount);
                const lineRefund = roundMoney(effectiveUnitPrice * item.quantity);
                const lineCost = roundMoney(orderItem.unit_cost * item.quantity);

                totalRefund += lineRefund;

                processedItems.push({
                    orderItemId: orderItem.id,
                    variantId: orderItem.product_variant_id,
                    batchId: item.batchId || orderItem.batch_id,
                    quantity: item.quantity,
                    isOpened: Boolean(item.isOpened),
                    isRestockable: Boolean(item.isRestockable),
                    refundAmount: lineRefund,
                    unitCost: orderItem.unit_cost,
                    totalCost: lineCost
                });

                // Update order_item returned_quantity
                const newReturnedQty = alreadyReturned + item.quantity;
                const isFullyReturned = newReturnedQty >= orderItem.quantity ? 1 : 0;
                db.prepare(`
                    UPDATE order_items 
                    SET returned_quantity = ?, is_returned = ?
                    WHERE id = ?
                `).run(newReturnedQty, isFullyReturned, orderItem.id);
            }

            // 3. Insert into returns table
            const retRes = db.prepare(`
                INSERT INTO returns (return_number, original_order_id, customer_id, employee_id, total_refund, refund_method, reason, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)
            `).run(retNumber, originalOrderId, effectiveCustomerId || null, employeeId || 1, totalRefund, refundMethod, reason, returnCreatedAt);
            const returnId = retRes.lastInsertRowid;

            // 4. Insert return_items & adjust inventory
            for (const pi of processedItems) {
                db.prepare(`
                    INSERT INTO return_items (return_id, order_item_id, product_variant_id, batch_id, quantity, is_opened, is_restockable, refund_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(returnId, pi.orderItemId, pi.variantId, pi.batchId, pi.quantity, pi.isOpened ? 1 : 0, pi.isRestockable ? 1 : 0, pi.refundAmount);

                if (pi.isRestockable && pi.batchId) {
                    // Restock unopened goods into inventory batch
                    db.prepare(`UPDATE inventory_batches SET quantity = quantity + ? WHERE id = ?`).run(pi.quantity, pi.batchId);
                    db.prepare(`
                        INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at)
                        VALUES (?, ?, 1, 'SALE_RETURN', ?, ?, 'RETURN', ?, ?, 'مرجوعی کالا به انبار', ?)
                    `).run(pi.variantId, pi.batchId, pi.quantity, pi.unitCost, returnId, employeeId || 1, returnCreatedAt);
                    totalRestockCost += pi.totalCost;
                } else {
                    // Opened cosmetics move to damaged stock (write-off)
                    db.prepare(`
                        INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at)
                        VALUES (?, ?, 1, 'DAMAGE', ?, ?, 'RETURN_DAMAGED', ?, ?, 'کالای مرجوعی باز شده - انتقال به ضایعات آرایشی', ?)
                    `).run(pi.variantId, pi.batchId || null, -pi.quantity, pi.unitCost, returnId, employeeId || 1, returnCreatedAt);
                    totalDamagedCost += pi.totalCost;
                }
            }

            // 5. Customer Wallet & Loyalty adjustments
            if (effectiveCustomerId) {
                if (refundMethod === 'WALLET_CREDIT') {
                    db.prepare(`UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?`).run(totalRefund, effectiveCustomerId);
                    db.prepare(`
                        INSERT INTO wallet_transactions (customer_id, type, amount, order_id, description, created_at)
                        VALUES (?, 'REFUND', ?, ?, 'استرداد وجه مرجوعی به کیف پول', ?)
                    `).run(effectiveCustomerId, totalRefund, originalOrderId, returnCreatedAt);
                }

                // Proportionally reverse loyalty points and CLV
                const pointsToReverse = Math.floor(totalRefund / 100000) * 10;
                if (pointsToReverse > 0) {
                    db.prepare(`
                        UPDATE customers 
                        SET loyalty_points = MAX(0, loyalty_points - ?),
                            clv = MAX(0, clv - ?)
                        WHERE id = ?
                    `).run(pointsToReverse, totalRefund, effectiveCustomerId);

                    db.prepare(`
                        INSERT INTO loyalty_transactions (customer_id, type, points, order_id, description, created_at)
                        VALUES (?, 'GIFT_ADJUST', ?, ?, 'کسر امتیاز بابت مرجوعی کالا', ?)
                    `).run(effectiveCustomerId, -pointsToReverse, originalOrderId, returnCreatedAt);
                }
            }

            // 6. Double-Entry Accounting Journal for Return
            const dateStr = returnCreatedAt.split(' ')[0];
            const entryNumber = `JE-RET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jRes = db.prepare(`
                INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
                VALUES (?, ?, ?, 'SALE_RETURN', ?, 1, ?, ?)
            `).run(entryNumber, dateStr, `سند برگشت از فروش مرجوعی ${retNumber} فاکتور اصلی ${originalOrder.order_number}`, returnId, employeeId || 1, returnCreatedAt);
            const jId = jRes.lastInsertRowid;

            const accCash = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '101'`).get().id;
            const accBank = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '102'`).get().id;
            const accInv = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '103'`).get().id;
            const accWallet = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '205'`).get() || { id: accBank };
            const accRetRev = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '404'`).get() || db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '401'`).get();
            const accCOGS = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '501'`).get().id;
            const accDamaged = db.prepare(`SELECT id FROM chart_of_accounts WHERE code = '607'`).get() || { id: accCOGS };

            // Determine refund settlement credit account
            let refundCreditAccId;
            if (refundMethod === 'WALLET_CREDIT') {
                refundCreditAccId = accWallet.id;
            } else if (refundMethod === 'CASH') {
                refundCreditAccId = accCash;
            } else {
                refundCreditAccId = accBank;
            }

            const insertLine = db.prepare(`
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `);

            // Dr Sales Returns (404/401)
            insertLine.run(jId, accRetRev.id, totalRefund, 0, `برگشت از فروش مرجوعی ${retNumber}`);
            // Cr Cash/Bank/Wallet Liability
            insertLine.run(jId, refundCreditAccId, 0, totalRefund, `استرداد وجه ${refundMethod} بابت مرجوعی ${retNumber}`);

            // Inventory / COGS Reversals
            if (totalRestockCost > 0) {
                // Dr Merchandise Inventory (103)
                insertLine.run(jId, accInv, totalRestockCost, 0, `برگشت کالای سالم به موجودی انبار`);
                // Cr Cost of Goods Sold (501)
                insertLine.run(jId, accCOGS, 0, totalRestockCost, `تعدیل بهای تمام شده کالای مرجوعی`);
            }
            if (totalDamagedCost > 0) {
                // Dr Damaged & Expired Waste (607)
                insertLine.run(jId, accDamaged.id, totalDamagedCost, 0, `هزینه ضایعات کالای مرجوعی باز شده`);
                // Cr Cost of Goods Sold (501)
                insertLine.run(jId, accCOGS, 0, totalDamagedCost, `تعدیل بهای تمام شده کالای ضایعاتی`);
            }

            // 7. Audit Log
            db.prepare(`
                INSERT INTO audit_logs (employee_id, action, entity, entity_id, details, created_at)
                VALUES (?, 'SALE_RETURN', 'returns', ?, ?, ?)
            `).run(employeeId || 1, returnId, JSON.stringify({
                returnNumber: retNumber,
                originalOrderId,
                totalRefund,
                itemsCount: processedItems.length,
                refundMethod
            }), returnCreatedAt);

            return {
                returnId,
                returnNumber: retNumber,
                totalRefund,
                refundMethod,
                restockedCost: totalRestockCost,
                damagedCost: totalDamagedCost,
                createdAt: returnCreatedAt
            };
        });

        return returnTx();
    },

    // Process Exchange Workflow: Return old items + Buy new items in single atomic step
    processExchange({ returnData, newOrderData }) {
        const exchangeTx = db.transaction(() => {
            const retResult = this.processReturn(returnData);
            const newOrderResult = this.createOrder(newOrderData);
            const difference = newOrderResult.totalAmount - retResult.totalRefund;

            const exchNumber = `EXC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            db.prepare(`
                INSERT INTO exchanges (exchange_number, return_id, new_order_id, difference_amount, settlement_status)
                VALUES (?, ?, ?, ?, 'SETTLED')
            `).run(exchNumber, retResult.returnId, newOrderResult.orderId, difference);

            // Audit log for exchange
            db.prepare(`
                INSERT INTO audit_logs (employee_id, action, entity, entity_id, details)
                VALUES (?, 'EXCHANGE', 'exchanges', ?, ?)
            `).run(newOrderData.employeeId || 1, retResult.returnId, JSON.stringify({
                exchangeNumber: exchNumber,
                returnNumber: retResult.returnNumber,
                orderNumber: newOrderResult.orderNumber,
                differenceAmount: difference
            }));

            return {
                exchangeNumber: exchNumber,
                returnNumber: retResult.returnNumber,
                orderNumber: newOrderResult.orderNumber,
                differenceAmount: difference,
                isCustomerPaying: difference > 0,
                isCustomerRefunded: difference < 0,
                isEven: difference === 0
            };
        });

        return exchangeTx();
    },

    // Cash Register Session Management & Closing
    getActiveCashSession() {
        return db.prepare(`
            SELECT 
                cs.*,
                cr.name AS register_name,
                u.full_name AS employee_name,
                (
                    SELECT COALESCE(SUM(p.amount), 0)
                    FROM payments p
                    JOIN orders o ON p.order_id = o.id
                    WHERE o.cash_session_id = cs.id AND p.payment_method = 'CASH'
                ) AS total_cash_sales,
                (
                    SELECT COALESCE(SUM(p.amount), 0)
                    FROM payments p
                    JOIN orders o ON p.order_id = o.id
                    WHERE o.cash_session_id = cs.id AND p.payment_method = 'CARD'
                ) AS total_card_sales,
                (
                    SELECT COALESCE(SUM(p.amount), 0)
                    FROM payments p
                    JOIN orders o ON p.order_id = o.id
                    WHERE o.cash_session_id = cs.id AND p.payment_method = 'ONLINE'
                ) AS total_online_sales
            FROM cash_sessions cs
            JOIN cash_registers cr ON cs.cash_register_id = cr.id
            JOIN users u ON cs.employee_id = u.id
            WHERE cs.status = 'OPEN'
            ORDER BY cs.id DESC
            LIMIT 1
        `).get();
    },

    closeCashSession(sessionId, actualBalance, notes = '') {
        const session = db.prepare(`SELECT * FROM cash_sessions WHERE id = ?`).get(sessionId);
        if (!session) throw new Error('شیفت صندوق یافت نشد');

        const cashSales = db.prepare(`
            SELECT COALESCE(SUM(p.amount), 0) AS total
            FROM payments p
            JOIN orders o ON p.order_id = o.id
            WHERE o.cash_session_id = ? AND p.payment_method = 'CASH'
        `).get(sessionId).total;

        const expectedBalance = session.opening_balance + cashSales;
        const variance = actualBalance - expectedBalance;

        db.prepare(`
            UPDATE cash_sessions 
            SET closing_time = CURRENT_TIMESTAMP,
                expected_balance = ?,
                actual_balance = ?,
                variance = ?,
                status = 'CLOSED',
                notes = ?
            WHERE id = ?
        `).run(expectedBalance, actualBalance, variance, notes, sessionId);

        // If significant variance, create alert
        if (Math.abs(variance) > 50000) {
            db.prepare(`
                INSERT INTO alerts (alert_type, title, message, severity)
                VALUES ('CASH_VARIANCE', 'مغایرت صندوق در بستن شیفت', ?, 'WARNING')
            `).run(`مغایرت ${variance.toLocaleString('fa-IR')} تومان در بستن شیفت صندوق شماره ${session.cash_register_id}. موجودی مورد انتظار: ${expectedBalance.toLocaleString('fa-IR')}، شمارش واقعی: ${actualBalance.toLocaleString('fa-IR')}`);
        }

        return { expectedBalance, actualBalance, variance };
    }
};

module.exports = posService;
