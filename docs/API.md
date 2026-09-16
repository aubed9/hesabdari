# مستندات رابط‌های برنامه‌نویسی وب (API Reference)

## ۱. فروش و صندوق (POS)
- POST /api/pos/orders: ثبت فاکتور فروش (تخصیص FEFO، پرداخت چندگانه، سند دوبل)
- GET /api/pos/orders/:id: جزئیات فاکتور و وضعیت پرداخت
- POST /api/pos/returns: مرجوعی کالا با اعتبارسنجی سروری و جلوگیری از مرجوعی تکراری
- POST /api/pos/exchanges: تعویض اتمیک کالا و تسویه مابه‌التفاوت

## ۲. تدارکات و تأمین‌کنندگان (Procurement)
- POST /api/purchases: ثبت رسید فاکتور خرید و بچ‌های انبار
- POST /api/suppliers/:id/payments: ثبت پرداخت به تأمین‌کننده و تعدیل معین
- POST /api/purchases/:id/return: برگشت از خرید به تأمین‌کننده
- GET /api/suppliers/:id/ledger: معین گردش حساب تأمین‌کننده
- GET /api/suppliers/aging: گزارش سنی‌بندی بدهی‌های باز

## ۳. انبارداری و تسترها (Inventory)
- GET /api/inventory/stock: موجودی زنده بر اساس تنوع و بچ
- GET /api/inventory/expiry-analysis: گزارش تفکیکی تاریخ انقضای کالاها
- POST /api/inventory/testers/convert: تبدیل کالای انبار به تستر
- POST /api/inventory/stock-counts: شروع دوره انبارگردانی
- POST /api/inventory/stock-counts/:id/finalize: نهایی‌سازی انبارگردانی و ثبت سند مغایرت

## ۴. مالی و حسابداری (Accounting)
- GET /api/accounting/chart-of-accounts: فهرست سرفصل‌های حسابداری با مانده زنده
- POST /api/accounting/journal-entries: ثبت سند دستی دوبل (با اعتبارسنجی تراز بودن)
- GET /api/accounting/reports/trial-balance: تراز آزمایشی
- GET /api/accounting/reports/profit-loss: صورت سود و زیان
- GET /api/accounting/reports/balance-sheet: ترازنامه
- GET /api/admin/reconciliation: موتور راستی‌آزمایی و عدم‌مغایرت ۸ گانه
