// Comprehensive Seed Data for Arayeshi Retail ERP

if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    console.error('CRITICAL: Destructive seed prevented! To wipe and re-seed, run with ALLOW_DESTRUCTIVE_SEED=true');
    process.exit(1);
}

const db = require('./database');
const { createBackup } = require('../scripts/backup');

async function seedAll() {
    console.log('🌱 Starting comprehensive data seeding for Arayeshi ERP...');

    // Automatic pre-seed safety backup before wiping data
    console.log('🛡️  Creating automated pre-seed safety backup before wiping data...');
    await createBackup({ filename: `pre_seed_${Date.now()}.sqlite3`, updateLatest: false });

    // Clear existing data safely
    const tables = [
        'audit_logs', 'alerts', 'shipments', 'coupons', 'campaigns',
        'commissions', 'shifts', 'cheques', 'expenses', 'bank_accounts',
        'journal_lines', 'journal_entries', 'chart_of_accounts',
        'exchanges', 'return_items', 'returns', 'payments', 'order_items',
        'orders', 'cash_sessions', 'cash_registers', 'wallet_transactions',
        'loyalty_transactions', 'back_in_stock_alerts', 'wishlists', 'customers',
        'purchase_order_items', 'purchase_orders', 'suppliers',
        'stock_count_items', 'stock_counts', 'testers', 'stock_transactions',
        'inventory_batches', 'warehouses', 'product_variants', 'products',
        'categories', 'brands', 'users', 'branches', 'organizations'
    ];

    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of tables) {
        db.exec(`DELETE FROM ${t};`);
        db.exec(`DELETE FROM sqlite_sequence WHERE name='${t}';`);
    }
    db.exec('PRAGMA foreign_keys = ON;');

    // 1. Organization & Branch
    const orgStmt = db.prepare(`
        INSERT INTO organizations (name, legal_name, national_id, economic_code, phone, address)
        VALUES ('فروشگاه کیهان بیوتی', 'شرکت تجارت آرایشی کیهان پیشرو', '14012345678', '4115897632', '021-88776655', 'تهران، خیابان ولیعصر، نرسیده به میدان ونک، پلاک ۱۴۵')
    `);
    const orgId = orgStmt.run().lastInsertRowid;

    const branchStmt = db.prepare(`
        INSERT INTO branches (org_id, name, code, phone, address, is_main, is_active)
        VALUES (?, 'شعبه مرکزی ونک', 'BR-01', '021-88776656', 'تهران، ونک، پلاک ۱۴۵', 1, 1)
    `);
    const branchId = branchStmt.run(orgId).lastInsertRowid;

    // 2. Staff / Users
    const insertUser = db.prepare(`
        INSERT INTO users (branch_id, username, password_hash, full_name, role, phone, base_salary, commission_rate)
        VALUES (?, ?, 'password123', ?, ?, ?, ?, ?)
    `);
    const adminId = insertUser.run(branchId, 'admin', 'مهندس کاظمی (مدیر کل)', 'ADMIN', '09121110001', 35000000, 0).lastInsertRowid;
    const mgrId = insertUser.run(branchId, 'sara_manager', 'سارا علوی (سرپرست فروشگاه)', 'MANAGER', '09121110002', 25000000, 1.0).lastInsertRowid;
    const cashier1 = insertUser.run(branchId, 'ali_cashier', 'علی رضایی (فروشنده و صندوق‌دار)', 'CASHIER', '09121110003', 18000000, 2.0).lastInsertRowid;
    const cashier2 = insertUser.run(branchId, 'maryam_sales', 'مریم حسینی (مشاور زیبایی)', 'CASHIER', '09121110004', 18000000, 2.5).lastInsertRowid;
    const stockId = insertUser.run(branchId, 'reza_stock', 'رضا ناصری (مسئول انبار)', 'STOCKKEEPER', '09121110005', 17000000, 0).lastInsertRowid;
    const accId = insertUser.run(branchId, 'neda_acc', 'ندا صادقی (حسابدار)', 'ACCOUNTANT', '09121110006', 22000000, 0).lastInsertRowid;

    // 3. Chart of Accounts (کدینگ استاندارد حسابداری دوبل)
    const coaInsert = db.prepare(`INSERT INTO chart_of_accounts (code, name, name_fa, type, parent_id) VALUES (?, ?, ?, ?, ?)`);
    const accCash = coaInsert.run('101', 'Cash On Hand', 'موجودی صندوق فروشگاه', 'ASSET', null).lastInsertRowid;
    const accBank = coaInsert.run('102', 'Bank & POS Terminals', 'موجودی بانک و پوز', 'ASSET', null).lastInsertRowid;
    const accInv = coaInsert.run('103', 'Merchandise Inventory', 'موجودی کالا در انبار', 'ASSET', null).lastInsertRowid;
    const accAR = coaInsert.run('104', 'Accounts Receivable', 'مطالبات و حساب مشتریان', 'ASSET', null).lastInsertRowid;
    const accPetty = coaInsert.run('105', 'Petty Cash', 'تنخواه گردان', 'ASSET', null).lastInsertRowid;

    const accAP = coaInsert.run('201', 'Accounts Payable', 'بستانکاران / بدهی به تأمین‌کنندگان', 'LIABILITY', null).lastInsertRowid;
    const accTaxPay = coaInsert.run('202', 'Sales Tax Payable', 'مالیات بر ارزش افزوده پرداختنی', 'LIABILITY', null).lastInsertRowid;
    const accSalaryPay = coaInsert.run('203', 'Salaries Payable', 'حقوق و دستمزد پرداختنی', 'LIABILITY', null).lastInsertRowid;
    const accChequePay = coaInsert.run('204', 'Notes & Cheques Payable', 'اسناد پرداختنی (چک‌ها)', 'LIABILITY', null).lastInsertRowid;

    const accEquity = coaInsert.run('301', 'Owners Capital', 'سرمایه مالک', 'EQUITY', null).lastInsertRowid;
    const accRetained = coaInsert.run('302', 'Retained Earnings', 'سود و زیان انباشته', 'EQUITY', null).lastInsertRowid;

    const accSalesRev = coaInsert.run('401', 'POS Sales Revenue', 'درآمد حاصل از فروش فروشگاهی', 'REVENUE', null).lastInsertRowid;
    const accOnlineRev = coaInsert.run('402', 'Online Sales Revenue', 'درآمد حاصل از فروش آنلاین', 'REVENUE', null).lastInsertRowid;
    const accDiscount = coaInsert.run('403', 'Sales Discounts & Rebates', 'تخفیفات فروش', 'REVENUE', null).lastInsertRowid;

    const accCOGS = coaInsert.run('501', 'Cost of Goods Sold', 'بهای تمام شده کالای فروش رفته (COGS)', 'COGS', null).lastInsertRowid;

    const accRent = coaInsert.run('601', 'Rent Expense', 'هزینه اجاره فروشگاه', 'EXPENSE', null).lastInsertRowid;
    const accSalaryExp = coaInsert.run('602', 'Salary & Commission Expense', 'هزینه حقوق و پورسانت پرسنل', 'EXPENSE', null).lastInsertRowid;
    const accMktExp = coaInsert.run('603', 'Marketing & Advertising', 'هزینه تبلیغات و پیامک', 'EXPENSE', null).lastInsertRowid;
    const accTesterExp = coaInsert.run('604', 'Tester & Sampling Expense', 'هزینه تستر و نمونه‌برداری', 'EXPENSE', null).lastInsertRowid;
    const accPackExp = coaInsert.run('605', 'Packaging & Courier', 'هزینه بسته‌بندی و پیک', 'EXPENSE', null).lastInsertRowid;
    const accUtilExp = coaInsert.run('606', 'Utilities & Bills', 'هزینه قبوض، برق و اینترنت', 'EXPENSE', null).lastInsertRowid;
    const accWasteExp = coaInsert.run('607', 'Damaged & Expired Waste', 'هزینه ضایعات و انقضا کالا', 'EXPENSE', null).lastInsertRowid;
    const accVarianceExp = coaInsert.run('608', 'Cash & Inventory Variance', 'هزینه کسر و اضافات', 'EXPENSE', null).lastInsertRowid;

    // 4. Bank Accounts
    const insertBank = db.prepare(`
        INSERT INTO bank_accounts (bank_name, account_number, card_number, shaba_number, balance, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
    `);
    const bankMellat = insertBank.run('بانک ملت - شعبه ونک', '4589234109', '6104337890124567', 'IR580120000000004589234109', 248000000).lastInsertRowid;
    const bankSaman = insertBank.run('بانک سامان - شعبه مرکزی', '8201934751', '6219861054327891', 'IR140560000000008201934751', 135000000).lastInsertRowid;

    // 5. Suppliers
    const insertSupplier = db.prepare(`
        INSERT INTO suppliers (name, phone, mobile, email, address, payment_terms, lead_time_days, credit_limit, authenticity_rating, delivery_rating, return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const supLoreal = insertSupplier.run('شرکت پیشگامان زیبایی پارس (نماینده لورآل و میبلین)', '021-88990011', '09123000001', 'info@pishgaman-beauty.ir', 'تهران، گاندی، پلاک ۲۲', 'CHEQUE_45_DAYS', 3, 500000000, 4.9, 4.8, 0.01).lastInsertRowid;
    const supMac = insertSupplier.run('بازرگانی زرین بیوتی (واردات تخصصی مک و هدی بیوتی)', '021-22003344', '09123000002', 'order@zarrinbeauty.com', 'تهران، جردن، کوچه تندیس', '30_DAYS', 5, 400000000, 5.0, 4.6, 0.02).lastInsertRowid;
    const supDerma = insertSupplier.run('درماطب سلامت نوین (محصولات لاروش پوزای و سراوی)', '021-88445566', '09123000003', 'sales@dermateb.ir', 'تهران، سعادت آباد، سرو غربی', 'CASH', 2, 250000000, 4.8, 4.9, 0.005).lastInsertRowid;
    const supGolden = insertSupplier.run('پویا تجارت پارسیان (تأمین‌کننده گلدن رز)', '021-66778899', '09123000004', 'contact@pouyatejarat.ir', 'تهران، بازار، کوچه مروی', '60_DAYS', 4, 300000000, 4.7, 4.5, 0.03).lastInsertRowid;

    // 6. Brands
    const insertBrand = db.prepare(`
        INSERT INTO brands (name, name_fa, country, supplier_id, website, description, commission_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const bMaybelline = insertBrand.run('Maybelline', 'میبلین', 'آمریکا', supLoreal, 'https://maybelline.com', 'برند شماره ۱ آرایشی جهان با فرمولاسیون بادوام', 2.0).lastInsertRowid;
    const bLoreal = insertBrand.run("L'Oréal", 'لورآل', 'فرانسه', supLoreal, 'https://loreal.com', 'غول فرانسوی صنعت زیبایی با فناوری پیشرفته پوست و مو', 2.0).lastInsertRowid;
    const bMac = insertBrand.run('MAC', 'مک', 'کانادا', supMac, 'https://maccosmetics.com', 'آرایش تخصصی حرفه‌ای و پیگمنت‌های فوق‌العاده بالا', 3.5).lastInsertRowid;
    const bHuda = insertBrand.run('Huda Beauty', 'هدی بیوتی', 'امارات', supMac, 'https://hudabeauty.com', 'محبوب‌ترین برند پالت‌های چشم و رژلب‌های مات', 3.0).lastInsertRowid;
    const bClinique = insertBrand.run('Clinique', 'کلینیک', 'آمریکا', supDerma, 'https://clinique.com', 'مراقبت درماتولوژیک و ضد حساسیت و آلرژی', 2.5).lastInsertRowid;
    const bLaroche = insertBrand.run('La Roche-Posay', 'لاروش پوزای', 'فرانسه', supDerma, 'https://laroche-posay.com', 'پیشرو مراقبت درمانی پوست و ضدآفتاب‌های تخصصی', 2.0).lastInsertRowid;
    const bCerave = insertBrand.run('CeraVe', 'سراوی', 'آمریکا', supDerma, 'https://cerave.com', 'فرموله شده با سرامیدهای ضروری و هیالورونیک اسید', 2.0).lastInsertRowid;
    const bGolden = insertBrand.run('Golden Rose', 'گلدن رز', 'ترکیه', supGolden, 'https://goldenrose.com.tr', 'لوازم آرایشی باکیفیت و اقتصادی با تنوع بسیار بالا', 1.5).lastInsertRowid;

    // 7. Categories
    const insertCat = db.prepare(`INSERT INTO categories (parent_id, name, name_fa, icon, description) VALUES (?, ?, ?, ?, ?)`);
    const catFace = insertCat.run(null, 'Face Makeup', 'آرایش صورت', 'sparkles', 'انواع کرم پودر، پنکیک، پرایمر، کانسیلر و رژگونه').lastInsertRowid;
    const catEye = insertCat.run(null, 'Eye Makeup', 'آرایش چشم', 'eye', 'ریمل، خط چشم، سایه و مداد چشم').lastInsertRowid;
    const catLip = insertCat.run(null, 'Lip Makeup', 'آرایش لب', 'heart', 'رژ لب مایع، جامد، خط لب و تینت').lastInsertRowid;
    const catSkin = insertCat.run(null, 'Skincare', 'مراقبت پوست', 'shield', 'ضدآفتاب، آبرسان، سرم‌های پوستی و شوینده').lastInsertRowid;
    const catHair = insertCat.run(null, 'Haircare', 'مراقبت مو', 'scissors', 'شامپو، ماسک مو و روغن‌های احیاکننده').lastInsertRowid;
    const catTools = insertCat.run(null, 'Beauty Tools', 'ابزار و اکسسوری', 'brush', 'براش‌ها، بیوتی بلندر و پد آرایشی').lastInsertRowid;

    // Subcategories
    const subFoundation = insertCat.run(catFace, 'Foundation', 'کرم پودر', 'layers', 'کرم پودرهای مات و براق').lastInsertRowid;
    const subConcealer = insertCat.run(catFace, 'Concealer', 'کانسیلر', 'check-circle', 'پوشاننده تیرگی زیر چشم').lastInsertRowid;
    const subMascara = insertCat.run(catEye, 'Mascara', 'ریمل', 'eye', 'ریمل‌های حجم‌دهنده و بلندکننده').lastInsertRowid;
    const subEyeliner = insertCat.run(catEye, 'Eyeliner', 'خط چشم', 'edit-2', 'خط چشم ماژیکی، مویی و ژلی').lastInsertRowid;
    const subLipstick = insertCat.run(catLip, 'Lipstick', 'رژ لب', 'heart', 'رژ لب‌های مات و ماندگار').lastInsertRowid;
    const subSunscreen = insertCat.run(catSkin, 'Sunscreen', 'ضدآفتاب', 'sun', 'ضدآفتاب‌های فلوئیدی و کرمی SPF50').lastInsertRowid;
    const subMoisturizer = insertCat.run(catSkin, 'Moisturizer', 'آبرسان و مرطوب‌کننده', 'droplet', 'کرم و ژل‌های آبرسان عمیق').lastInsertRowid;
    const subBlender = insertCat.run(catTools, 'Beauty Sponges', 'اسفنج آرایشی', 'circle', 'بیوتی بلندر و اسفنج‌های تخم‌مرغی').lastInsertRowid;

    // 8. Warehouse
    const whStmt = db.prepare(`INSERT INTO warehouses (branch_id, name, code, is_default) VALUES (?, 'انبار مرکزی فروشگاه', 'WH-MAIN', 1)`);
    const whId = whStmt.run(branchId).lastInsertRowid;

    // 9. Products & Variants (with realistic cosmetic shades, SKUs, and barcodes)
    const prodInsert = db.prepare(`
        INSERT INTO products (brand_id, category_id, name, name_fa, model, description, country_of_origin, manufacturer, gender_target, skin_type, usage_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const varInsert = db.prepare(`
        INSERT INTO product_variants (product_id, shade, color_hex, size, volume, weight, sku, barcode, purchase_price, selling_price, minimum_price, tax_rate, safety_stock, reorder_point)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Product 1: Maybelline Super Stay Active Wear 30H Foundation
    const p1 = prodInsert.run(bMaybelline, subFoundation, 'Maybelline Super Stay 30H Active Wear Foundation', 'کرم پودر ۳۰ ساعته سوپر استی میبلین', 'Super Stay Active Wear', 'پوشش فوق‌العاده بالا، ضد آب و تعریق با ماندگاری ۳۰ ساعته بدون براق شدن', 'آمریکا', 'L\'Oréal USA', 'WOMEN', 'Oily, Combination', 'Daily').lastInsertRowid;
    const v1_1 = varInsert.run(p1, '120 Classic Ivory', '#E8C7A3', 'Standard', '30 ml', '120g', 'MAY-SS-120', '6902395685012', 620000, 940000, 850000, 0, 5, 12).lastInsertRowid;
    const v1_2 = varInsert.run(p1, '128 Warm Nude', '#DFC09C', 'Standard', '30 ml', '120g', 'MAY-SS-128', '6902395685029', 620000, 940000, 850000, 0, 5, 10).lastInsertRowid;
    const v1_3 = varInsert.run(p1, '220 Natural Beige', '#D5AF85', 'Standard', '30 ml', '120g', 'MAY-SS-220', '6902395685036', 620000, 940000, 850000, 0, 4, 8).lastInsertRowid;

    // Product 2: Maybelline Super Stay Matte Ink Liquid Lipstick
    const p2 = prodInsert.run(bMaybelline, subLipstick, 'Maybelline Super Stay Matte Ink', 'رژ لب مایع ۱۶ ساعته سوپر استی میبلین', 'Matte Ink', 'رژ لب مایع با رنگدانه‌های متراکم و ماندگاری ۱۶ ساعته بدون ایجاد چسبندگی', 'آمریکا', 'L\'Oréal USA', 'WOMEN', 'All', 'Daily').lastInsertRowid;
    const v2_1 = varInsert.run(p2, '15 Lover', '#B84F66', 'Standard', '5 ml', '35g', 'MAY-INK-015', '3600531411084', 380000, 590000, 520000, 0, 8, 15).lastInsertRowid;
    const v2_2 = varInsert.run(p2, '20 Pioneer', '#961E2D', 'Standard', '5 ml', '35g', 'MAY-INK-020', '3600531411121', 380000, 590000, 520000, 0, 8, 15).lastInsertRowid;
    const v2_3 = varInsert.run(p2, '120 Artist', '#8B2C4E', 'Standard', '5 ml', '35g', 'MAY-INK-120', '3600531553890', 380000, 590000, 520000, 0, 6, 12).lastInsertRowid;

    // Product 3: Maybelline Lash Sensational Sky High Mascara
    const p3 = prodInsert.run(bMaybelline, subMascara, 'Maybelline Lash Sensational Sky High Mascara', 'ریمل اسکای های میبلین', 'Sky High', 'حجم‌دهنده و بلندکننده مژه با عصاره بامبو و برس فلکسیبل منعطف', 'آمریکا', 'Maybelline New York', 'WOMEN', 'Sensitive', 'Daily').lastInsertRowid;
    const v3_1 = varInsert.run(p3, '01 Very Black', '#151515', 'Standard', '7.2 ml', '45g', 'MAY-SKY-001', '041554590500', 440000, 690000, 620000, 0, 10, 25).lastInsertRowid;

    // Product 4: MAC Matte Lipstick
    const p4 = prodInsert.run(bMac, subLipstick, 'MAC Matte Lipstick', 'رژ لب نمادین مات مک', 'Classic Matte', 'رژ لب کلاسیک مک با پیگمنت بسیار غنی و فینیش کاملاً مات مخملی', 'کانادا', 'Make-Up Art Cosmetics Inc', 'WOMEN', 'All', 'Professional').lastInsertRowid;
    const v4_1 = varInsert.run(p4, 'Ruby Woo (Retro Matte)', '#A01526', 'Standard', '3 g', '25g', 'MAC-LIP-RW', '773602052821', 1100000, 1680000, 1500000, 0, 4, 10).lastInsertRowid;
    const v4_2 = varInsert.run(p4, 'Velvet Teddy', '#A96B5B', 'Standard', '3 g', '25g', 'MAC-LIP-VT', '773602048619', 1100000, 1680000, 1500000, 0, 4, 10).lastInsertRowid;

    // Product 5: La Roche-Posay Anthelios UVMune 400 Oil Control Fluid SPF50+
    const p5 = prodInsert.run(bLaroche, subSunscreen, 'La Roche-Posay Anthelios UVMune 400 Fluid SPF50+', 'ضدآفتاب فلوئید ضد براقی لاروش پوزای', 'Anthelios UVMune 400', 'محافظت فوق‌العاده بالا در برابر پرتوهای ماوراء بنفش فوق بلند، مناسب پوست چرب', 'فرانسه', 'La Roche-Posay France', 'UNISEX', 'Oily, Sensitive', 'SunCare').lastInsertRowid;
    const v5_1 = varInsert.run(p5, 'بی‌رنگ (Invisible)', '#FFFFFF', '50ml', '50 ml', '85g', 'LRP-ANT-50', '3337875797597', 890000, 1380000, 1250000, 0, 10, 20).lastInsertRowid;

    // Product 6: Clinique Moisture Surge 100H Auto-Replenishing Hydrator
    const p6 = prodInsert.run(bClinique, subMoisturizer, 'Clinique Moisture Surge 100H Hydrator', 'کرم ژل آبرسان ۱۰۰ ساعته مویسچر سرج کلینیک', 'Moisture Surge 100H', 'آبرسانی عمقی ۱۰۰ ساعته با تخمیر آلوئه‌ورا و اسید هیالورونیک', 'آمریکا', 'Clinique Laboratories', 'UNISEX', 'Dry, Dehydrated, All', 'Daily').lastInsertRowid;
    const v6_1 = varInsert.run(p6, '50ml Standard Jar', '#FEEFEF', '50ml', '50 ml', '160g', 'CLN-MS-050', '192333066942', 1450000, 2190000, 1980000, 0, 5, 10).lastInsertRowid;

    // Product 7: CeraVe Resurfacing Retinol Serum
    const p7 = prodInsert.run(bCerave, subMoisturizer, 'CeraVe Resurfacing Retinol Serum', 'سرم رتینول ضد لک و جای جوش سراوی', 'Resurfacing Serum', 'کاهش منافذ باز و لک‌های بعد از جوش با رتینول کپسوله شده و نیاسینامید', 'آمریکا', 'CeraVe LLC', 'UNISEX', 'Acne-Prone, Normal', 'Night').lastInsertRowid;
    const v7_1 = varInsert.run(p7, '30ml Pump', '#FFFFFF', '30ml', '30 ml', '110g', 'CRV-RET-030', '3606000512276', 920000, 1420000, 1300000, 0, 4, 8).lastInsertRowid;

    // Product 8: Golden Rose Dip Liner Matte Black
    const p8 = prodInsert.run(bGolden, subEyeliner, 'Golden Rose Dip Liner Matte Black', 'خط چشم مویی مشکی مات گلدن رز', 'Dip Liner Matte', 'خط چشم مویی با رنگدانه‌های کربن بلک فوق مشکی و ماندگاری ضد پخش', 'ترکیه', 'Erkul Cosmetics', 'WOMEN', 'All', 'Daily').lastInsertRowid;
    const v8_1 = varInsert.run(p8, 'Deep Matte Black', '#000000', 'Standard', '5 ml', '25g', 'GLD-DIP-01', '8691190120153', 175000, 280000, 250000, 0, 15, 30).lastInsertRowid;

    // Product 9: Beauty Blender Makeup Sponge
    const p9 = prodInsert.run(bGolden, subBlender, 'Pro Beauty Blender Sponge', 'اسفنج آرایشی تخم‌مرغی بدون لاتکس', 'Hydro Blender', 'پد آرایشی حرفه‌ای با بافت متراکم و نرم، بدون جذب مواد آرایشی', 'ترکیه', 'Beauty Tools Int', 'WOMEN', 'All', 'Daily').lastInsertRowid;
    const v9_1 = varInsert.run(p9, 'Hot Pink', '#FF1493', 'One Size', 'N/A', '15g', 'BTY-SPG-PNK', '8691190998811', 85000, 160000, 140000, 0, 20, 40).lastInsertRowid;

    // 10. Inventory Batches with FEFO Dates (Some expiring soon to showcase alerts!)
    const insertBatch = db.prepare(`
        INSERT INTO inventory_batches (product_variant_id, warehouse_id, batch_number, manufacture_date, expiry_date, quantity, purchase_price, supplier_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Maybelline 120: Batch A (Expires in 25 days! Near expiry alert!) & Batch B (Fresh)
    const b1_1_near = insertBatch.run(v1_1, whId, 'LOT-MAY-2309', '2023-09-15', '2026-09-28', 14, 620000, supLoreal).lastInsertRowid;
    const b1_1_fresh = insertBatch.run(v1_1, whId, 'LOT-MAY-2405', '2024-05-10', '2027-05-10', 40, 620000, supLoreal).lastInsertRowid;

    // Maybelline 128: Batch
    const b1_2 = insertBatch.run(v1_2, whId, 'LOT-MAY-2406', '2024-06-01', '2027-06-01', 35, 620000, supLoreal).lastInsertRowid;
    const b1_3 = insertBatch.run(v1_3, whId, 'LOT-MAY-2406', '2024-06-01', '2027-06-01', 22, 620000, supLoreal).lastInsertRowid;

    // Maybelline Matte Ink Lover (15): Batch expiring in 50 days (30-60 days bucket)
    const b2_1_near = insertBatch.run(v2_1, whId, 'LOT-INK-2311', '2023-11-20', '2026-10-23', 18, 380000, supLoreal).lastInsertRowid;
    const b2_1_fresh = insertBatch.run(v2_1, whId, 'LOT-INK-2408', '2024-08-01', '2027-08-01', 50, 380000, supLoreal).lastInsertRowid;

    // Pioneer (20) & Artist (120)
    const b2_2 = insertBatch.run(v2_2, whId, 'LOT-INK-2409', '2024-09-01', '2027-09-01', 45, 380000, supLoreal).lastInsertRowid;
    const b2_3 = insertBatch.run(v2_3, whId, 'LOT-INK-2409', '2024-09-01', '2027-09-01', 30, 380000, supLoreal).lastInsertRowid;

    // Sky High Mascara
    const b3_1 = insertBatch.run(v3_1, whId, 'LOT-SKY-2410', '2024-10-01', '2027-10-01', 65, 440000, supLoreal).lastInsertRowid;

    // MAC Ruby Woo & Velvet Teddy
    const b4_1 = insertBatch.run(v4_1, whId, 'LOT-MAC-2402', '2024-02-15', '2027-02-15', 25, 1100000, supMac).lastInsertRowid;
    const b4_2 = insertBatch.run(v4_2, whId, 'LOT-MAC-2402', '2024-02-15', '2027-02-15', 20, 1100000, supMac).lastInsertRowid;

    // La Roche-Posay Fluid
    const b5_1 = insertBatch.run(v5_1, whId, 'LOT-LRP-2404', '2024-04-10', '2027-04-10', 48, 890000, supDerma).lastInsertRowid;

    // Clinique Moisture Surge: Batch expiring in 75 days (61-90 days bucket)
    const b6_1_near = insertBatch.run(v6_1, whId, 'LOT-CLN-2312', '2023-12-01', '2026-11-17', 8, 1450000, supDerma).lastInsertRowid;
    const b6_1_fresh = insertBatch.run(v6_1, whId, 'LOT-CLN-2407', '2024-07-01', '2027-07-01', 30, 1450000, supDerma).lastInsertRowid;

    // CeraVe Retinol: Low Stock (only 3 left, below safety stock!)
    const b7_1 = insertBatch.run(v7_1, whId, 'LOT-CRV-2403', '2024-03-01', '2027-03-01', 3, 920000, supDerma).lastInsertRowid;

    // Golden Rose Eyeliner & Sponge
    const b8_1 = insertBatch.run(v8_1, whId, 'LOT-GLD-2405', '2024-05-10', '2027-05-10', 80, 175000, supGolden).lastInsertRowid;
    const b9_1 = insertBatch.run(v9_1, whId, 'LOT-SPG-2401', '2024-01-01', '2029-01-01', 110, 85000, supGolden).lastInsertRowid;

    // Record Initial Purchase Stock Transactions
    const insertTx = db.prepare(`
        INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note)
        VALUES (?, ?, ?, 'PURCHASE', ?, ?, 'INITIAL_SEED', 1, ?, 'ورود اولیه موجودی به انبار')
    `);
    insertTx.run(v1_1, b1_1_near, whId, 14, 620000, stockId);
    insertTx.run(v1_1, b1_1_fresh, whId, 40, 620000, stockId);
    insertTx.run(v1_2, b1_2, whId, 35, 620000, stockId);
    insertTx.run(v1_3, b1_3, whId, 22, 620000, stockId);
    insertTx.run(v2_1, b2_1_near, whId, 18, 380000, stockId);
    insertTx.run(v2_1, b2_1_fresh, whId, 50, 380000, stockId);
    insertTx.run(v2_2, b2_2, whId, 45, 380000, stockId);
    insertTx.run(v2_3, b2_3, whId, 30, 380000, stockId);
    insertTx.run(v3_1, b3_1, whId, 65, 440000, stockId);
    insertTx.run(v4_1, b4_1, whId, 25, 1100000, supMac);
    insertTx.run(v4_2, b4_2, whId, 20, 1100000, supMac);
    insertTx.run(v5_1, b5_1, whId, 48, 890000, supDerma);
    insertTx.run(v6_1, b6_1_near, whId, 8, 1450000, supDerma);
    insertTx.run(v6_1, b6_1_fresh, whId, 30, 1450000, supDerma);
    insertTx.run(v7_1, b7_1, whId, 3, 920000, supDerma);
    insertTx.run(v8_1, b8_1, whId, 80, 175000, supGolden);
    insertTx.run(v9_1, b9_1, whId, 110, 85000, supGolden);

    // 11. Testers Management (ثبت تستر فعال)
    const insertTester = db.prepare(`
        INSERT INTO testers (product_variant_id, batch_id, warehouse_id, opened_at, initial_quantity, remaining_percentage, employee_id, status, note)
        VALUES (?, ?, ?, '2026-08-10 11:00:00', 1, ?, ?, 'ACTIVE', ?)
    `);
    insertTester.run(v1_1, b1_1_near, whId, 65, cashier1, 'تستر استند کرم پودر میبلین شید ۱۲۰');
    insertTester.run(v2_3, b2_3, whId, 80, cashier2, 'تستر رژ لب مایع میبلین شید آرتیست');
    insertTester.run(v4_1, b4_1, whId, 45, cashier1, 'تستر رژ لب روبین وو مک');

    // 12. Customers with Cosmetics Profile & RFM Metrics
    const insertCustomer = db.prepare(`
        INSERT INTO customers (full_name, mobile, email, birth_date, membership_date, skin_type, hair_preferences, loyalty_tier, loyalty_points, wallet_balance, referral_code, rfm_segment, rfm_r_score, rfm_f_score, rfm_m_score, clv)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // VIP Champion (Buys regularly, big basket)
    const c1 = insertCustomer.run('مونا قریشی', '09124445566', 'mona.gh@gmail.com', '1992-09-12', '2025-01-10', 'مختلط و حساس', 'موهای کراتین شده و رنگ شده', 'VIP', 680, 450000, 'REF-MONA12', 'Champions', 5, 5, 5, 18500000).lastInsertRowid;
    // Loyal Customer
    const c2 = insertCustomer.run('سحر رادمنش', '09123334455', 'sahar.rad@yahoo.com', '1995-10-25', '2025-03-14', 'چرب و مستعد جوش', 'موهای لخت و نازک', 'GOLD', 420, 200000, 'REF-SAHAR95', 'Loyal', 4, 4, 4, 11200000).lastInsertRowid;
    // Customer with Birthday in Current Month! (For Birthday Campaign)
    const c3 = insertCustomer.run('پریا کمالی', '09122223344', 'paria.k@gmail.com', '1998-09-08', '2025-07-20', 'خشک و دهیدراته', 'موهای موج‌دار', 'SILVER', 180, 50000, 'REF-PARIA98', 'Potential Loyal', 4, 3, 3, 6400000).lastInsertRowid;
    // At Risk Customer (Has not visited in 60 days)
    const c4 = insertCustomer.run('نگین معتمد', '09128889900', 'negin.m@gmail.com', '1990-04-18', '2024-11-05', 'معمولی', 'موهای فر', 'BRONZE', 95, 0, 'REF-NEGIN90', 'At Risk', 1, 3, 3, 5800000).lastInsertRowid;
    // New Customer
    const c5 = insertCustomer.run('الهام صبوری', '09351112233', 'elham.s@gmail.com', '2001-02-14', '2026-08-28', 'حساس', 'موهای خشک', 'BRONZE', 40, 0, 'REF-ELHAM01', 'New', 5, 1, 1, 1500000).lastInsertRowid;

    // Wishlist items
    const insertWish = db.prepare(`INSERT INTO wishlists (customer_id, product_variant_id) VALUES (?, ?)`);
    insertWish.run(c1, v6_1); // Mona wants Clinique 50ml
    insertWish.run(c4, v4_1); // Negin wants MAC Ruby Woo

    // 13. Cash Register & Active Cash Session
    const regStmt = db.prepare(`INSERT INTO cash_registers (branch_id, name, device_code) VALUES (?, 'صندوق اصلی شماره ۱', 'POS-TERM-01')`);
    const regId = regStmt.run(branchId).lastInsertRowid;

    const sessionStmt = db.prepare(`
        INSERT INTO cash_sessions (cash_register_id, employee_id, opening_time, opening_balance, status, notes)
        VALUES (?, ?, '2026-09-02 09:30:00', 5000000, 'OPEN', 'شیفت صبح و عصر فروشگاه فعال است')
    `);
    const sessionId = sessionStmt.run(regId, cashier1).lastInsertRowid;

    // 14. Real-life POS Orders and Invoices (Sales, Payments, Journal Entries)
    const insertOrder = db.prepare(`
        INSERT INTO orders (order_number, order_type, channel, customer_id, employee_id, cash_session_id, subtotal, discount_amount, discount_reason, tax_amount, total_amount, total_cost, status, payment_status, created_at)
        VALUES (?, 'SALE', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'COMPLETED', 'PAID', ?)
    `);
    const insertOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_variant_id, batch_id, quantity, unit_price, unit_cost, discount_amount, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPayment = db.prepare(`
        INSERT INTO payments (order_id, payment_method, amount, reference_code, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);

    // Helper for automatic double-entry journal entry
    const insertJournal = db.prepare(`
        INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id, is_posted, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const insertJournalLine = db.prepare(`
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES (?, ?, ?, ?, ?)
    `);

    function recordOrderWithJournal(orderNum, channel, custId, empId, items, discount, discountReason, payMethod, createdAt, entryNum) {
        let subtotal = 0;
        let cogs = 0;
        for (const it of items) {
            subtotal += it.price * it.qty;
            cogs += it.cost * it.qty;
        }
        const total = subtotal - discount;
        const ordId = insertOrder.run(orderNum, channel, custId, empId, sessionId, subtotal, discount, discountReason, total, cogs, createdAt).lastInsertRowid;

        for (const it of items) {
            insertOrderItem.run(ordId, it.variantId, it.batchId, it.qty, it.price, it.cost, 0, it.price * it.qty);
            // deduct stock from batch
            db.prepare(`UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?`).run(it.qty, it.batchId);
            // stock tx
            db.prepare(`
                INSERT INTO stock_transactions (product_variant_id, batch_id, warehouse_id, transaction_type, quantity, unit_cost, reference_type, reference_id, employee_id, note, created_at)
                VALUES (?, ?, ?, 'SALE', ?, ?, 'ORDER', ?, ?, 'فروش فروشگاهی', ?)
            `).run(it.variantId, it.batchId, whId, -it.qty, it.cost, ordId, empId, createdAt);
        }

        // payment
        insertPayment.run(ordId, payMethod, total, 'REF-' + Math.floor(100000 + Math.random() * 900000), createdAt);

        // Update customer metrics if customer attached
        if (custId) {
            const pointsEarned = Math.floor(total / 100000) * 10;
            db.prepare(`UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?`).run(pointsEarned, custId);
            db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, order_id, description, created_at) VALUES (?, 'EARN', ?, ?, 'امتیاز خرید فاکتور', ?)`).run(custId, pointsEarned, ordId, createdAt);
        }

        // Double-entry Journal Entry:
        // 1. Bank/Cash Dr. (total)
        // 2. Discount Dr. (discount if any)
        // 3. Sales Revenue Cr. (subtotal)
        // 4. COGS Dr. (cogs)
        // 5. Inventory Cr. (cogs)
        const dateStr = createdAt.split(' ')[0];
        const jId = insertJournal.run(entryNum, dateStr, `سند ثبت اتوماتیک فروش فاکتور ${orderNum}`, 'POS_SALE', ordId, empId, createdAt).lastInsertRowid;
        const debitAccount = payMethod === 'CASH' ? accCash : accBank;
        insertJournalLine.run(jId, debitAccount, total, 0, `دریافت بابت فاکتور ${orderNum}`);
        if (discount > 0) {
            insertJournalLine.run(jId, accDiscount, discount, 0, `تخفیف اعطا شده روی فاکتور ${orderNum}`);
        }
        insertJournalLine.run(jId, accSalesRev, 0, subtotal, `درآمد فروش ناخالص فاکتور ${orderNum}`);
        insertJournalLine.run(jId, accCOGS, cogs, 0, `بهای تمام شده کالای فروش رفته فاکتور ${orderNum}`);
        insertJournalLine.run(jId, accInv, 0, cogs, `کاهش موجودی انبار بابت فاکتور ${orderNum}`);

        return ordId;
    }

    // Sample Orders spread over hours & days
    recordOrderWithJournal(
        'ORD-140506-001', 'STORE_POS', c1, cashier1,
        [
            { variantId: v1_1, batchId: b1_1_near, qty: 1, price: 940000, cost: 620000 },
            { variantId: v9_1, batchId: b9_1, qty: 1, price: 160000, cost: 85000 } // Cross-sell foundation + sponge!
        ],
        50000, 'تخفیف باشگاه مشتریان VIP', 'CARD', '2026-09-02 11:20:00', 'JE-260902-01'
    );

    recordOrderWithJournal(
        'ORD-140506-002', 'STORE_POS', c2, cashier2,
        [
            { variantId: v3_1, batchId: b3_1, qty: 1, price: 690000, cost: 440000 },
            { variantId: v8_1, batchId: b8_1, qty: 1, price: 280000, cost: 175000 }
        ],
        0, null, 'CARD', '2026-09-02 12:45:00', 'JE-260902-02'
    );

    recordOrderWithJournal(
        'ORD-140506-003', 'STORE_POS', null, cashier1,
        [
            { variantId: v4_1, batchId: b4_1, qty: 1, price: 1680000, cost: 1100000 }
        ],
        0, null, 'CASH', '2026-09-02 15:10:00', 'JE-260902-03'
    );

    recordOrderWithJournal(
        'ORD-140506-004', 'STORE_POS', c3, cashier2,
        [
            { variantId: v5_1, batchId: b5_1, qty: 1, price: 1380000, cost: 890000 },
            { variantId: v2_3, batchId: b2_3, qty: 1, price: 590000, cost: 380000 }
        ],
        100000, 'تخفیف پیشواز تولد', 'CARD', '2026-09-02 17:35:00', 'JE-260902-04'
    );

    recordOrderWithJournal(
        'ORD-140506-005', 'STORE_POS', null, cashier1,
        [
            { variantId: v2_1, batchId: b2_1_near, qty: 2, price: 590000, cost: 380000 },
            { variantId: v9_1, batchId: b9_1, qty: 2, price: 160000, cost: 85000 }
        ],
        0, null, 'CARD', '2026-09-02 18:50:00', 'JE-260902-05'
    );

    recordOrderWithJournal(
        'ORD-140506-006', 'STORE_POS', c1, cashier1,
        [
            { variantId: v6_1, batchId: b6_1_near, qty: 1, price: 2190000, cost: 1450000 }
        ],
        90000, 'تخفیف مشتری طلایی', 'CARD', '2026-09-02 20:15:00', 'JE-260902-06'
    );

    // 15. Expenses
    const insertExp = db.prepare(`
        INSERT INTO expenses (category, amount, bank_account_id, payment_date, description, paid_to, reference_no, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertExp.run('RENT', 45000000, bankMellat, '2026-09-01', 'اجاره ماهانه فروشگاه شعبه ونک', 'آقای شمس (مالک ملک)', 'TX-RENT-09', mgrId);
    insertExp.run('MARKETING', 8500000, bankSaman, '2026-09-01', 'شارژ پنل پیامک تبلیغاتی و کمپین‌های انقضا', 'کاوه نگار', 'TX-SMS-09', mgrId);
    insertExp.run('PACKAGING', 3200000, bankMellat, '2026-09-02', 'خرید بگ‌های لوکس و پاکت‌های بسته‌بندی برنددار', 'چاپ و بسته‌بندی نفیس', 'TX-PKG-01', stockId);

    // 16. Cheques (چک‌های پرداختنی و دریافتی)
    const insertCheque = db.prepare(`
        INSERT INTO cheques (cheque_number, bank_name, amount, due_date, type, party_name, supplier_id, customer_id, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `);
    insertCheque.run('CHQ-890124', 'بانک ملت', 85000000, '2026-09-20', 'PAYABLE', 'شرکت پیشگامان زیبایی پارس', supLoreal, null, 'بابت فاکتور خرید پارت دوم میبلین');
    insertCheque.run('CHQ-334109', 'بانک تجارت', 120000000, '2026-10-05', 'PAYABLE', 'بازرگانی زرین بیوتی', supMac, null, 'بابت خرید عمده مک و هدی بیوتی');
    insertCheque.run('CHQ-REC-551', 'بانک پاسارگاد', 15000000, '2026-09-15', 'RECEIVABLE', 'سالن زیبایی عروس پالادیوم', null, null, 'تسویه خرید اقلام گریم سالنی');

    // 17. Marketing Campaigns
    const insertCamp = db.prepare(`
        INSERT INTO campaigns (title, type, channel, target_segment, discount_percent, start_date, end_date, budget, cost, revenue_generated, conversions_count, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertCamp.run('جشنواره کالاهای نزدیک به انقضا (Clearance)', 'EXPIRING_STOCK', 'SMS', 'کالاهای زیر ۶۰ روز تا انقضا', 25, '2026-09-01', '2026-09-20', 3000000, 1850000, 12400000, 14);
    insertCamp.run('تخفیف ویژه متولدین شهریور ماه', 'BIRTHDAY', 'SMS', 'متولدین ماه جاری', 15, '2026-09-01', '2026-09-31', 1500000, 720000, 5800000, 6);
    insertCamp.run('بازگشت مشتریان وفادار (Win-Back)', 'AT_RISK', 'WHATSAPP', 'مشتریان بدون خرید بیش از ۶۰ روز', 20, '2026-09-01', '2026-09-15', 2000000, 950000, 4200000, 4);

    // 18. Coupons
    const insertCpn = db.prepare(`
        INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_discount, usage_limit, usage_count, valid_until, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-30', 1)
    `);
    insertCpn.run('BEAUTY20', 'PERCENT', 20, 500000, 200000, 100, 12);
    insertCpn.run('WELCOME100', 'FIXED', 100000, 600000, 100000, 50, 8);

    // 19. Initial Alerts
    const insertAlert = db.prepare(`
        INSERT INTO alerts (alert_type, title, message, severity, is_resolved)
        VALUES (?, ?, ?, ?, 0)
    `);
    insertAlert.run('LOW_STOCK', 'کاهش موجودی شدید', 'موجودی «سرم رتینول سراوی» به ۳ عدد رسیده که کمتر از حداقل ذخیره احتیاطی (۴ عدد) است.', 'CRITICAL');
    insertAlert.run('NEAR_EXPIRY', 'کالاهای نزدیک به انقضا (زیر ۳۰ روز)', 'تعداد ۱۴ عدد کرم پودر میبلین شید ۱۲۰ تا تاریخ ۲۸ سپتامبر منقضی می‌شوند. ارزش تخمینی: ۸,۶۸۰,۰۰۰ تومان.', 'WARNING');
    insertAlert.run('CHEQUE_DUE', 'سررسید نزدیک چک پرداختنی', 'چک شماره CHQ-890124 به مبلغ ۸۵,۰۰۰,۰۰۰ تومان در تاریخ ۲۰ شهریور سررسید خواهد شد.', 'WARNING');
    insertAlert.run('CHURN_RISK', 'مشتری ارزشمند در معرض ریزش', 'مشتری «نگین معتمد» (با CLV ۵.۸ میلیون) بیش از ۶۵ روز است که خریدی ثبت نکرده است.', 'INFO');

    // 20. Audit Log
    const insertAudit = db.prepare(`
        INSERT INTO audit_logs (employee_id, action, entity, entity_id, details)
        VALUES (?, ?, ?, ?, ?)
    `);
    insertAudit.run(adminId, 'INITIALIZE_SYSTEM', 'SYSTEM', '1', 'راه‌اندازی کامل دیتابیس و هسته‌های هشت‌گانه سیستم ERP آرایشی کیهان بیوتی');

    console.log('✅ Comprehensive seeding completed successfully!');
}

if (require.main === module) {
    seedAll()
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Seeding failed:', err);
            process.exit(1);
        });
}

module.exports = { seedAll };

