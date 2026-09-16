# مستندات پایگاه داده و مایگریشن‌ها (Database Schema)

## ۱. موتور مایگریشن نسخه دار (db/migrator.js)
تغییرات ساختار دیتابیس در قالب فایل‌های ترتیبی در db/migrations/ با هش SHA-256 در جدول schema_migrations رهگیری می‌شوند:
- 001_baseline_schema.sql: ساختار پایه پایگاه داده
- 002_add_missing_accounts.sql: حساب‌های کلیدی ۱۰۶، ۲۰۵، ۴۰۴
- 003_returns_and_exchanges.sql: افزودن فیلد returned_quantity برای ضد دابل‌ریترن
- 004_procurement_and_supplier_ap.sql: جداول پرداخت تأمین‌کنندگان و مرجوعی خرید

## ۲. جداول هسته سیستم
- محصولات و تنوع: categories, brands, products, product_variants, inventory_batches
- فروش و مالی: orders, order_items, payments, returns, return_items, exchanges
- تدارکات: suppliers, purchase_orders, purchase_order_items, supplier_payments, purchase_returns, purchase_return_items
- حسابداری دوبل: chart_of_accounts, journal_entries, journal_lines, bank_accounts, bank_transactions
- مشتریان و وفاداری: customers, wallet_transactions, loyalty_transactions
- عملیات انبار و تست: stock_transactions, testers, stock_counts, stock_count_items
- امنیت و تنظیمات: users, audit_logs, system_settings
