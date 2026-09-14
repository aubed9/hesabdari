// Reports & Management Accounting Client Module (گزارشات مدیریتی و حسابداری پیشرفته آرایشی)
const reports = {
    activeTab: 'zreport',
    selectedZDate: '',

    init() {
        this.render();
        this.loadTabContent();
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="clipboard-check" class="w-5 h-5 text-purple-600"></i>
                            <span>گزارشات مدیریتی و حسابداری پیشرفته فروشگاه (Management Reports & Z-Report)</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">تطبیق دخل و دستگاه‌های پوز، Z-Report روزانه، استهلاک تسترها، سودآوری برندها و تراز ۴ ستونی</p>
                    </div>

                    <div class="flex items-center gap-2">
                        <button onclick="reports.printCurrentReport()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                            <i data-lucide="printer" class="w-4 h-4"></i>
                            <span>چاپ گزارش جاری</span>
                        </button>
                    </div>
                </div>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 gap-4 text-xs font-medium overflow-x-auto">
                    <button onclick="reports.switchTab('zreport')" id="repTab-zreport" class="pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5 shrink-0">
                        <i data-lucide="file-check" class="w-4 h-4"></i>
                        <span>گزارش پایان روز (Z-Report)</span>
                    </button>
                    <button onclick="reports.switchTab('categories')" id="repTab-categories" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="pie-chart" class="w-4 h-4 text-blue-500"></i>
                        <span>سودآوری لاین‌ها و دسته‌ها</span>
                    </button>
                    <button onclick="reports.switchTab('brands')" id="repTab-brands" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="award" class="w-4 h-4 text-amber-500"></i>
                        <span>ماتریس عملکرد برندها</span>
                    </button>
                    <button onclick="reports.switchTab('testers')" id="repTab-testers" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="sparkles" class="w-4 h-4 text-pink-500"></i>
                        <span>استهلاک تسترها و ضایعات</span>
                    </button>
                    <button onclick="reports.switchTab('audit')" id="repTab-audit" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="shield-alert" class="w-4 h-4 text-indigo-500"></i>
                        <span>ممیزی تخفیف و مرجوعی</span>
                    </button>
                    <button onclick="reports.switchTab('trialbalance')" id="repTab-trialbalance" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="scale" class="w-4 h-4 text-emerald-500"></i>
                        <span>تراز آزمایشی ۴ ستونی</span>
                    </button>
                </div>

                <!-- Tab Content Pane -->
                <div id="reportContentPane">
                    <div class="py-12 text-center text-slate-400">در حال بارگذاری گزارشات...</div>
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('[id^="repTab-"]').forEach(el => {
            el.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0';
        });
        const activeBtn = document.getElementById(`repTab-${tab}`);
        if (activeBtn) {
            activeBtn.className = 'pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5 shrink-0';
        }
        this.loadTabContent();
    },

    async loadTabContent() {
        const pane = document.getElementById('reportContentPane');
        if (!pane) return;

        if (this.activeTab === 'zreport') await this.renderZReport(pane);
        else if (this.activeTab === 'categories') await this.renderCategories(pane);
        else if (this.activeTab === 'brands') await this.renderBrands(pane);
        else if (this.activeTab === 'testers') await this.renderTesters(pane);
        else if (this.activeTab === 'audit') await this.renderAudit(pane);
        else if (this.activeTab === 'trialbalance') await this.renderTrialBalance(pane);

        lucide.createIcons();
    },

    // 1. Z-Report View (گزارش پایان روز و بستن دخل)
    async renderZReport(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت اطلاعات Z-Report...</div>`;
        try {
            const url = this.selectedZDate ? `/api/reports/z-report?date=${this.selectedZDate}` : '/api/reports/z-report';
            const res = await fetch(url);
            const json = await res.json();
            const z = json.data;

            container.innerHTML = `
                <div class="space-y-6 max-w-4xl mx-auto" id="printableZReport">
                    <!-- Date Filter & Quick Header -->
                    <div class="flex items-center justify-between bg-purple-50 p-4 rounded-2xl border border-purple-200">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-sm text-purple-900">گزارش روزانه Z-Report:</span>
                            <span class="font-mono text-sm font-bold bg-white px-2.5 py-1 rounded-lg border border-purple-200 text-purple-800">${z.date}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="date" value="${z.date}" onchange="reports.changeZDate(this.value)" class="p-1.5 bg-white border border-purple-200 rounded-lg text-xs font-mono">
                            <button onclick="window.print()" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1">
                                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                                <span>پرینت فیش Z</span>
                            </button>
                        </div>
                    </div>

                    <!-- Top 4 Metrics -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-slate-400 font-medium">فروش ناخالص روز</span>
                            <div class="text-lg font-black text-slate-900 font-mono mt-1">${Number(z.salesSummary.grossSales).toLocaleString('fa-IR')} ت</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">${z.salesSummary.totalInvoices} فاکتور</div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-slate-400 font-medium">کل تخفیفات اعطایی</span>
                            <div class="text-lg font-black text-rose-600 font-mono mt-1">${Number(z.salesSummary.totalDiscounts).toLocaleString('fa-IR')} ت</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">کوپن و باشگاه VIP</div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-slate-400 font-medium">فروش خالص (Net Sales)</span>
                            <div class="text-lg font-black text-purple-700 font-mono mt-1">${Number(z.salesSummary.netSales).toLocaleString('fa-IR')} ت</div>
                            <div class="text-[10px] text-emerald-600 font-bold mt-0.5">سود: ${Number(z.salesSummary.grossProfit).toLocaleString('fa-IR')} ت (${z.salesSummary.profitMargin}٪)</div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-slate-400 font-medium">میانگین سبد (AOV)</span>
                            <div class="text-lg font-black text-slate-900 font-mono mt-1">${Number(z.salesSummary.averageOrderValue).toLocaleString('fa-IR')} ت</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">میانگین هر خرید</div>
                        </div>
                    </div>

                    <!-- Payment Terminal Reconciliation (تطبیق دستگاه‌های پوز و صندوق) -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h4 class="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <i data-lucide="credit-card" class="w-4 h-4 text-emerald-600"></i>
                            <span>تطبیق دریافتی‌ها و درگاه‌های بانکی روز (Terminal Reconciliation)</span>
                        </h4>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-1">
                                <div class="text-slate-600 font-medium flex justify-between">
                                    <span>دستگاه پوز ۱ (بانک سامان)</span>
                                    <span class="font-mono text-[11px] font-bold">${z.paymentBreakdown.terminalSaman.count} تراکنش</span>
                                </div>
                                <div class="text-base font-black text-emerald-800 font-mono">${Number(z.paymentBreakdown.terminalSaman.amount).toLocaleString('fa-IR')} تومان</div>
                                <div class="text-[10px] text-slate-500">واریز مستقیم به حساب جاری سامان</div>
                            </div>

                            <div class="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-1">
                                <div class="text-slate-600 font-medium flex justify-between">
                                    <span>دستگاه پوز ۲ (بانک ملت)</span>
                                    <span class="font-mono text-[11px] font-bold">${z.paymentBreakdown.terminalMellat.count} تراکنش</span>
                                </div>
                                <div class="text-base font-black text-blue-800 font-mono">${Number(z.paymentBreakdown.terminalMellat.amount).toLocaleString('fa-IR')} تومان</div>
                                <div class="text-[10px] text-slate-500">واریز مستقیم به حساب جاری ملت</div>
                            </div>

                            <div class="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1">
                                <div class="text-slate-600 font-medium flex justify-between">
                                    <span>دریافت نقدی در کشو (Cash)</span>
                                    <span class="font-mono text-[11px] font-bold">اسکناس</span>
                                </div>
                                <div class="text-base font-black text-amber-800 font-mono">${Number(z.paymentBreakdown.cash).toLocaleString('fa-IR')} تومان</div>
                                <div class="text-[10px] text-slate-500">شارژ فیزیکی کشوی پول صندوق</div>
                            </div>
                        </div>
                    </div>

                    <!-- Cash Drawer Reconciliation (مغایرت کسری و اضافی صندوق) -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 class="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <i data-lucide="lock" class="w-4 h-4 text-purple-600"></i>
                                <span>کنترل و موازنه کشوی نقدی صندوق (Cash Drawer Balancing)</span>
                            </h4>
                            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                z.cashDrawerReconciliation.variance === 0 ? 'bg-emerald-100 text-emerald-800' :
                                (z.cashDrawerReconciliation.variance < 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')
                            }">
                                ${z.cashDrawerReconciliation.variance === 0 ? 'موازنه دقیق (بدون مغایرت)' : 
                                  (z.cashDrawerReconciliation.variance < 0 ? `کسری صندوق: ${Math.abs(z.cashDrawerReconciliation.variance).toLocaleString('fa-IR')} ت` : `اضافی صندوق: ${z.cashDrawerReconciliation.variance.toLocaleString('fa-IR')} ت`)}
                            </span>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700">
                            <div>موجودی اول وقت: <strong class="font-mono text-slate-900">${Number(z.cashDrawerReconciliation.openingBalance).toLocaleString('fa-IR')} ت</strong></div>
                            <div>فروش نقدی ورودی: <strong class="font-mono text-slate-900">${Number(z.cashDrawerReconciliation.cashSalesAdded).toLocaleString('fa-IR')} ت</strong></div>
                            <div>مبلغ مورد انتظار در دخل: <strong class="font-mono text-slate-900">${Number(z.cashDrawerReconciliation.expectedInDrawer).toLocaleString('fa-IR')} ت</strong></div>
                            <div>شمارش فیزیکی پایان شیفت: <strong class="font-mono text-purple-700 font-bold">${Number(z.cashDrawerReconciliation.actualClosingCount).toLocaleString('fa-IR')} ت</strong></div>
                        </div>
                    </div>

                    <!-- Cashier Performance Breakdown -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
                            تفکیک عملکرد صندوق‌داران و شیفت‌ها
                        </div>
                        <table class="w-full text-right text-xs">
                            <thead class="text-slate-500 border-b border-slate-100">
                                <tr>
                                    <th class="p-3">صندوق‌دار / مشاور زیبایی</th>
                                    <th class="p-3">نقش سازمانی</th>
                                    <th class="p-3 text-center">تعداد فاکتورها</th>
                                    <th class="p-3 text-left">مجموع فروش</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${z.cashierBreakdown.map(c => `
                                    <tr>
                                        <td class="p-3 font-bold text-slate-900">${c.cashier_name}</td>
                                        <td class="p-3 text-slate-500">${c.role}</td>
                                        <td class="p-3 text-center font-mono font-bold">${c.invoice_count}</td>
                                        <td class="p-3 text-left font-mono font-bold text-purple-700">${Number(c.total_sales).toLocaleString('fa-IR')} تومان</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری Z-Report</div>`;
        }
    },

    changeZDate(val) {
        this.selectedZDate = val;
        this.renderZReport(document.getElementById('reportContentPane'));
    },

    // 2. Category Profitability Matrix
    async renderCategories(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت آمار دسته‌بندی‌ها...</div>`;
        try {
            const res = await fetch('/api/reports/category-performance');
            const json = await res.json();
            const categories = json.data || [];

            container.innerHTML = `
                <div class="space-y-4">
                    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <h3 class="font-bold text-sm text-slate-900">سودآوری دسته‌بندی‌ها و لاین‌های آرایشی و مراقبتی</h3>
                            <p class="text-xs text-slate-500">تحلیل فروش، بهای تمام شده (COGS)، سود ناخالص و سهم هر لاین از کل درآمد</p>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">عنوان لاین / دسته‌بندی</th>
                                    <th class="p-3.5 text-center">تعداد فروخته شده</th>
                                    <th class="p-3.5">درآمد کل</th>
                                    <th class="p-3.5">بهای تمام شده (COGS)</th>
                                    <th class="p-3.5">سود ناخالص</th>
                                    <th class="p-3.5 text-center">حاشیه سود (Margin)</th>
                                    <th class="p-3.5 text-center">سهم از کل فروش</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${categories.map(c => `
                                    <tr>
                                        <td class="p-3.5 font-bold text-slate-900">${c.categoryName}</td>
                                        <td class="p-3.5 text-center font-bold font-mono">${c.unitsSold} قلم</td>
                                        <td class="p-3.5 font-mono font-bold text-slate-900">${Number(c.revenue).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 font-mono text-slate-500">${Number(c.cogs).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 font-mono font-bold text-emerald-600">${Number(c.grossProfit).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 text-center font-mono font-bold text-purple-700">${c.marginPercent}٪</td>
                                        <td class="p-3.5 text-center font-mono text-slate-600">${c.revenueSharePercent}٪</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری عملکرد دسته‌بندی‌ها</div>`;
        }
    },

    // 3. Brand Matrix View
    async renderBrands(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت ماتریس برندها...</div>`;
        try {
            const res = await fetch('/api/reports/brand-matrix');
            const json = await res.json();
            const brands = json.data || [];

            container.innerHTML = `
                <div class="space-y-4">
                    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 class="font-bold text-sm text-slate-900">ماتریس عملکرد، فروش و حاشیه سود برندها (Brand Performance Matrix)</h3>
                        <p class="text-xs text-slate-500">پایش فروش، سودآوری و سهم بازار برندهای آرایشی موجود در فروشگاه</p>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">نام برند</th>
                                    <th class="p-3.5">کشور مبدأ</th>
                                    <th class="p-3.5 text-center">تعداد اقلام فروخته شده</th>
                                    <th class="p-3.5">مجموع فروش ناخالص</th>
                                    <th class="p-3.5">سود ناخالص برند</th>
                                    <th class="p-3.5 text-center">حاشیه سود میانگین</th>
                                    <th class="p-3.5 text-center">سهم از کل فروشگاه</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${brands.map(b => `
                                    <tr>
                                        <td class="p-3.5">
                                            <div class="font-bold text-slate-900">${b.brandName}</div>
                                            <div class="text-[11px] text-slate-400">${b.brandNameFa || ''}</div>
                                        </td>
                                        <td class="p-3.5 text-slate-600">${b.country}</td>
                                        <td class="p-3.5 text-center font-mono font-bold">${b.unitsSold} عدد</td>
                                        <td class="p-3.5 font-mono font-bold text-slate-900">${Number(b.sales).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 font-mono font-bold text-emerald-700">${Number(b.grossProfit).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 text-center font-mono font-bold text-purple-700">${b.marginPercent}٪</td>
                                        <td class="p-3.5 text-center font-mono text-slate-600">${b.marketShare}٪</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری ماتریس برندها</div>`;
        }
    },

    // 4. Testers & Shrinkage View
    async renderTesters(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت آمار تسترها و ضایعات...</div>`;
        try {
            const res = await fetch('/api/reports/testers-and-shrinkage');
            const json = await res.json();
            const { testersList, testersSummary, shrinkageAndLoss } = json.data;

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Top Summary Cards -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div class="bg-white p-5 rounded-2xl border border-pink-200 shadow-sm space-y-3">
                            <div class="flex items-center justify-between pb-2 border-b border-pink-100">
                                <span class="font-bold text-pink-900 text-sm flex items-center gap-1.5">
                                    <i data-lucide="sparkles" class="w-4 h-4 text-pink-600"></i>
                                    <span>هزینه استهلاک تسترها و نمونه‌برداری</span>
                                </span>
                                <span class="text-[10px] bg-pink-100 text-pink-800 px-2 py-0.5 rounded font-bold">معین ۶۰۴</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>تستر فعال استندها: <strong class="font-mono text-slate-900">${testersSummary.totalActiveTesters} قلم</strong></div>
                                <div>تستر مصرف‌شده / تمام: <strong class="font-mono text-slate-500">${testersSummary.totalRetiredTesters} قلم</strong></div>
                                <div>ارزش اولیه کل تسترها: <strong class="font-mono text-slate-900">${Number(testersSummary.totalCostInvested).toLocaleString('fa-IR')} ت</strong></div>
                                <div>هزینه مستهلک‌شده تا امروز: <strong class="font-mono text-pink-700 font-bold">${Number(testersSummary.totalCostAmortized).toLocaleString('fa-IR')} ت</strong></div>
                            </div>
                        </div>

                        <div class="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm space-y-3">
                            <div class="flex items-center justify-between pb-2 border-b border-rose-100">
                                <span class="font-bold text-rose-900 text-sm flex items-center gap-1.5">
                                    <i data-lucide="trash-2" class="w-4 h-4 text-rose-600"></i>
                                    <span>ضایعات، مرجوعی بازشده و انقضای کالا</span>
                                </span>
                                <span class="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">معین ۶۰۷</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>کالای کاملاً منقضی: <strong class="font-mono text-rose-700">${shrinkageAndLoss.expiredUnits} عدد</strong></div>
                                <div>خسارت کالای منقضی: <strong class="font-mono text-rose-700 font-bold">${Number(shrinkageAndLoss.expiredLossValue).toLocaleString('fa-IR')} ت</strong></div>
                                <div>ریسک بحرانی زیر ۳۰ روز: <strong class="font-mono text-amber-700">${shrinkageAndLoss.criticalRiskUnits} عدد</strong></div>
                                <div>ارزش سرمایه در خطر: <strong class="font-mono text-amber-700 font-bold">${Number(shrinkageAndLoss.criticalRiskValue).toLocaleString('fa-IR')} ت</strong></div>
                            </div>
                        </div>
                    </div>

                    <!-- Active Testers List -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
                            لیست تسترها و درصد استهلاک باقیمانده روی استند
                        </div>
                        <table class="w-full text-right text-xs">
                            <thead class="text-slate-500 border-b border-slate-100">
                                <tr>
                                    <th class="p-3">کالای تستر</th>
                                    <th class="p-3">برند و شید</th>
                                    <th class="p-3">بهای تمام شده</th>
                                    <th class="p-3">درصد باقیمانده</th>
                                    <th class="p-3">وضعیت استند</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${testersList.map(t => `
                                    <tr>
                                        <td class="p-3 font-bold text-slate-900">${t.product_name}</td>
                                        <td class="p-3 text-slate-600">${t.brand_name} ${t.shade ? `| ${t.shade}` : ''}</td>
                                        <td class="p-3 font-mono">${Number(t.cost_price).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3 font-mono font-bold text-purple-700">${t.volume_percentage_left}٪</td>
                                        <td class="p-3">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                                                ${t.status === 'ACTIVE' ? 'فعال روی استند' : 'مصرف‌شده / خارج'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری گزارش تسترها</div>`;
        }
    },

    // 5. Discounts & Returns Audit View
    async renderAudit(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت ممیزی تخفیف و مرجوعی...</div>`;
        try {
            const res = await fetch('/api/reports/audit-discounts-returns');
            const json = await res.json();
            const { discounts, returns } = json.data;

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Discounts Audit -->
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h4 class="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                    <i data-lucide="tag" class="w-4 h-4 text-purple-600"></i>
                                    <span>ممیزی تخفیفات اعطایی</span>
                                </h4>
                                <span class="font-bold font-mono text-rose-600 text-xs">جمع: ${Number(discounts.totalAmount).toLocaleString('fa-IR')} ت</span>
                            </div>

                            <div class="space-y-2 text-xs">
                                ${discounts.items.map(d => `
                                    <div class="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl">
                                        <div>
                                            <div class="font-bold text-slate-800">${d.reason}</div>
                                            <div class="text-[10px] text-slate-400">${d.count} مورد اعمال شده</div>
                                        </div>
                                        <span class="font-mono font-bold text-purple-700">${Number(d.total_discount_amount).toLocaleString('fa-IR')} ت</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Returns Audit -->
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h4 class="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                    <i data-lucide="rotate-ccw" class="w-4 h-4 text-amber-600"></i>
                                    <span>ممیزی مرجوعی‌ها و علل بازگشت</span>
                                </h4>
                                <span class="font-bold font-mono text-amber-700 text-xs">جمع بازپرداخت: ${Number(returns.totalAmount).toLocaleString('fa-IR')} ت</span>
                            </div>

                            <div class="space-y-2 text-xs">
                                ${returns.items.length === 0 ? `
                                    <div class="p-8 text-center text-slate-400">هیچ مورد مرجوعی ثبت نشده است.</div>
                                ` : returns.items.map(r => `
                                    <div class="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl">
                                        <div>
                                            <div class="font-bold text-slate-800">${r.reason}</div>
                                            <div class="text-[10px] ${r.is_opened ? 'text-rose-600' : 'text-emerald-600'}">
                                                ${r.is_opened ? 'پلمپ باز شده (انتقال به ضایعات)' : 'پلمپ دست‌نخورده (بازگشت به انبار)'}
                                            </div>
                                        </div>
                                        <div class="text-left font-mono">
                                            <div class="font-bold text-slate-900">${Number(r.total_refund_amount).toLocaleString('fa-IR')} ت</div>
                                            <div class="text-[10px] text-slate-400">${r.return_count} قلم</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری ممیزی</div>`;
        }
    },

    // 6. Four-Column Trial Balance View
    async renderTrialBalance(container) {
        container.innerHTML = `<div class="py-8 text-center text-slate-400">در حال دریافت تراز ۴ ستونی...</div>`;
        try {
            const res = await fetch('/api/reports/four-column-trial-balance');
            const json = await res.json();
            const { rows, totals } = json.data;

            container.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h3 class="font-bold text-sm text-slate-900">تراز آزمایشی ۴ ستونی دفاتر دوبل (Four-Column Trial Balance)</h3>
                            <p class="text-xs text-slate-500">گزارش رسمی حسابداری شامل گردش بدهکار و بستانکار و مانده‌های پایان دوره</p>
                        </div>
                        <div class="px-3 py-1.5 rounded-xl font-bold text-xs ${totals.isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                            ${totals.isBalanced ? 'تراز ۱۰۰٪ متوازن ✅ (مغایرت صفر)' : 'دارای مغایرت تراز'}
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-700 border-b border-slate-200">
                                <tr>
                                    <th class="p-3" rowspan="2">کد</th>
                                    <th class="p-3" rowspan="2">سرفصل حساب</th>
                                    <th class="p-3" rowspan="2">ماهیت</th>
                                    <th class="p-3 text-center border-l border-r border-slate-200" colspan="2">گردش دوره (Turnover)</th>
                                    <th class="p-3 text-center" colspan="2">مانده نهایی (Balance)</th>
                                </tr>
                                <tr class="bg-slate-100 text-[11px] text-slate-600">
                                    <th class="p-2 text-center border-l border-slate-200">بدهکار</th>
                                    <th class="p-2 text-center border-r border-slate-200">بستانکار</th>
                                    <th class="p-2 text-center">بدهکار</th>
                                    <th class="p-2 text-center">بستانکار</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${rows.map(r => `
                                    <tr class="hover:bg-slate-50">
                                        <td class="p-3 font-mono font-bold text-purple-700">${r.code}</td>
                                        <td class="p-3 font-bold text-slate-800">${r.nameFa}</td>
                                        <td class="p-3 text-slate-500 text-[10px]">${r.type}</td>
                                        <td class="p-3 text-center font-mono ${r.periodDebit > 0 ? 'text-slate-900 font-bold' : 'text-slate-300'} border-l border-slate-100">${r.periodDebit > 0 ? Number(r.periodDebit).toLocaleString('fa-IR') : '-'}</td>
                                        <td class="p-3 text-center font-mono ${r.periodCredit > 0 ? 'text-slate-900 font-bold' : 'text-slate-300'} border-r border-slate-100">${r.periodCredit > 0 ? Number(r.periodCredit).toLocaleString('fa-IR') : '-'}</td>
                                        <td class="p-3 text-center font-mono ${r.debitBalance > 0 ? 'text-emerald-700 font-bold' : 'text-slate-300'}">${r.debitBalance > 0 ? Number(r.debitBalance).toLocaleString('fa-IR') : '-'}</td>
                                        <td class="p-3 text-center font-mono ${r.creditBalance > 0 ? 'text-rose-700 font-bold' : 'text-slate-300'}">${r.creditBalance > 0 ? Number(r.creditBalance).toLocaleString('fa-IR') : '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-purple-50 font-bold text-slate-900 border-t-2 border-purple-200">
                                <tr>
                                    <td class="p-3 text-center" colspan="3">جمع کل ستون‌ها (تراز نهایی)</td>
                                    <td class="p-3 text-center font-mono text-purple-900 border-l border-purple-200">${Number(totals.totalPeriodDebit).toLocaleString('fa-IR')}</td>
                                    <td class="p-3 text-center font-mono text-purple-900 border-r border-purple-200">${Number(totals.totalPeriodCredit).toLocaleString('fa-IR')}</td>
                                    <td class="p-3 text-center font-mono text-emerald-800">${Number(totals.totalDebitBalance).toLocaleString('fa-IR')}</td>
                                    <td class="p-3 text-center font-mono text-rose-800">${Number(totals.totalCreditBalance).toLocaleString('fa-IR')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری تراز ۴ ستونی</div>`;
        }
    },

    printCurrentReport() {
        window.print();
    }
};
