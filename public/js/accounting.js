// Double-Entry Accounting & Financial Management Client Module
const accounting = {
    activeTab: 'pnl', // pnl, bs, journals, coa, expenses, cheques

    async init() {
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
                            <i data-lucide="scale" class="w-5 h-5 text-purple-600"></i>
                            <span>سیستم جامع حسابداری دوبل و گزارشات مالی استاندارد</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">ثبت خودکار اسناد از POS و انبار، صورت سود و زیان (P&L)، ترازنامه، دفاتر و چک‌ها</p>
                    </div>

                    <div class="flex items-center gap-2">
                        <a href="/api/export/ledger" target="_blank" class="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="sheet" class="w-4 h-4 text-emerald-600"></i>
                            <span>خروجی اکسل دفاتر</span>
                        </a>
                        <button onclick="accounting.openExpenseModal()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i>
                            <span>ثبت هزینه جدید</span>
                        </button>
                    </div>
                </div>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 gap-4 text-xs font-medium overflow-x-auto">
                    <button onclick="accounting.switchTab('pnl')" id="accTab-pnl" class="pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5 shrink-0">
                        <i data-lucide="file-text" class="w-4 h-4"></i>
                        <span>صورت سود و زیان (P&L)</span>
                    </button>
                    <button onclick="accounting.switchTab('bs')" id="accTab-bs" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="landmark" class="w-4 h-4"></i>
                        <span>ترازنامه (Balance Sheet)</span>
                    </button>
                    <button onclick="accounting.switchTab('aging')" id="accTab-aging" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="clock" class="w-4 h-4 text-rose-500"></i>
                        <span>تحلیل سنی بدهی و مطالبات (Aging)</span>
                    </button>
                    <button onclick="accounting.switchTab('journals')" id="accTab-journals" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="book-open" class="w-4 h-4"></i>
                        <span>اسناد حسابداری (Journals)</span>
                    </button>
                    <button onclick="accounting.switchTab('expenses')" id="accTab-expenses" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="receipt" class="w-4 h-4"></i>
                        <span>هزینه‌ها و قبوض</span>
                    </button>
                    <button onclick="accounting.switchTab('fixedCosts')" id="accTab-fixedCosts" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="building-2" class="w-4 h-4 text-indigo-500"></i>
                        <span>هزینه‌های ثابت و دوره‌ای</span>
                    </button>
                    <button onclick="accounting.switchTab('cheques')" id="accTab-cheques" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="credit-card" class="w-4 h-4 text-amber-500"></i>
                        <span>مدیریت چک‌ها</span>
                    </button>
                    <button onclick="accounting.switchTab('coa')" id="accTab-coa" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0">
                        <i data-lucide="list-tree" class="w-4 h-4"></i>
                        <span>کدینگ حساب‌ها (COA)</span>
                    </button>
                </div>

                <div id="accContentPane">
                    <div class="py-12 text-center text-slate-400">در حال بارگذاری دفاتر مالی...</div>
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('[id^="accTab-"]').forEach(el => {
            el.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5';
        });
        const activeBtn = document.getElementById(`accTab-${tab}`);
        if (activeBtn) {
            activeBtn.className = 'pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5';
        }
        this.loadTabContent();
    },

    async loadTabContent() {
        const pane = document.getElementById('accContentPane');
        if (!pane) return;

        if (this.activeTab === 'pnl') await this.renderPnL(pane);
        else if (this.activeTab === 'bs') await this.renderBalanceSheet(pane);
        else if (this.activeTab === 'aging') await this.renderAging(pane);
        else if (this.activeTab === 'journals') await this.renderJournals(pane);
        else if (this.activeTab === 'expenses') await this.renderExpenses(pane);
        else if (this.activeTab === 'fixedCosts') await this.renderFixedCosts(pane);
        else if (this.activeTab === 'cheques') await this.renderCheques(pane);
        else if (this.activeTab === 'coa') await this.renderCOA(pane);

        lucide.createIcons();
    },

    // Aging Report (تحلیل سنی بدهکاران و بستانکاران)
    async renderAging(container) {
        try {
            const res = await fetch('/api/accounting/aging');
            const json = await res.json();
            const { payables, receivables } = json.data;

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Payables Aging (بدهی‌ها) -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div class="flex items-center justify-between">
                            <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <i data-lucide="arrow-up-right" class="w-4 h-4 text-rose-500"></i>
                                <span>تحلیل سنی بدهی‌ها و چک‌های پرداختنی به تأمین‌کنندگان (Accounts Payable Aging)</span>
                            </h3>
                            <span class="text-xs text-slate-400">بر مبنای افق سررسید چک‌های صیادی</span>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div class="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
                                <div class="text-slate-500 font-medium">۰ تا ۳۰ روز (فوری)</div>
                                <div class="text-base font-bold font-mono text-amber-700 mt-1">${Number(payables.days_0_30.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${payables.days_0_30.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-orange-200 bg-orange-50/50">
                                <div class="text-slate-500 font-medium">۳۱ تا ۶۰ روز</div>
                                <div class="text-base font-bold font-mono text-orange-700 mt-1">${Number(payables.days_31_60.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${payables.days_31_60.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50">
                                <div class="text-slate-500 font-medium">۶۱ تا ۹۰ روز</div>
                                <div class="text-base font-bold font-mono text-rose-700 mt-1">${Number(payables.days_61_90.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${payables.days_61_90.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50">
                                <div class="text-slate-500 font-medium">بیش از ۹۰ روز</div>
                                <div class="text-base font-bold font-mono text-purple-700 mt-1">${Number(payables.days_90_plus.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${payables.days_90_plus.items.length} فقره چک</div>
                            </div>
                        </div>
                    </div>

                    <!-- Receivables Aging (مطالبات) -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div class="flex items-center justify-between">
                            <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <i data-lucide="arrow-down-left" class="w-4 h-4 text-emerald-500"></i>
                                <span>تحلیل سنی اسناد دریافتنی و مطالبات (Accounts Receivable Aging)</span>
                            </h3>
                            <span class="text-xs text-slate-400">چک‌های دریافتی از مشتریان و همکاران</span>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                                <div class="text-slate-500 font-medium">۰ تا ۳۰ روز</div>
                                <div class="text-base font-bold font-mono text-emerald-700 mt-1">${Number(receivables.days_0_30.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${receivables.days_0_30.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-teal-200 bg-teal-50/50">
                                <div class="text-slate-500 font-medium">۳۱ تا ۶۰ روز</div>
                                <div class="text-base font-bold font-mono text-teal-700 mt-1">${Number(receivables.days_31_60.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${receivables.days_31_60.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50">
                                <div class="text-slate-500 font-medium">۶۱ تا ۹۰ روز</div>
                                <div class="text-base font-bold font-mono text-blue-700 mt-1">${Number(receivables.days_61_90.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${receivables.days_61_90.items.length} فقره چک</div>
                            </div>
                            <div class="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
                                <div class="text-slate-500 font-medium">بیش از ۹۰ روز</div>
                                <div class="text-base font-bold font-mono text-indigo-700 mt-1">${Number(receivables.days_90_plus.total).toLocaleString('fa-IR')} ت</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${receivables.days_90_plus.items.length} فقره چک</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری گزارش Aging</div>`;
        }
    },

    // 1. Profit & Loss Statement (P&L)
    async renderPnL(container) {
        try {
            const res = await fetch('/api/accounting/pnl');
            const json = await res.json();
            const p = json.data;

            container.innerHTML = `
                <div class="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <div class="text-center pb-4 border-b border-slate-100">
                        <h3 class="text-base font-bold text-slate-900">صورت سود و زیان (Profit & Loss Statement)</h3>
                        <p class="text-xs text-slate-400 mt-0.5">فروشگاه لوازم آرایشی و بهداشتی کیهان بیوتی | دوره مالی جاری</p>
                    </div>

                    <!-- Revenue Section -->
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between items-center py-2 font-bold text-slate-800 border-b border-slate-100">
                            <span>درآمد ناخالص حاصل از فروش (Gross Sales)</span>
                            <span class="font-mono text-sm">${Number(p.grossSales).toLocaleString('fa-IR')} تومان</span>
                        </div>
                        <div class="flex justify-between items-center py-1.5 text-slate-500 pr-4">
                            <span>کسر می‌شود: تخفیفات اعطا شده</span>
                            <span class="text-rose-600 font-mono">-${Number(p.discounts).toLocaleString('fa-IR')} تومان</span>
                        </div>
                        <div class="flex justify-between items-center py-2 font-bold text-purple-800 bg-purple-50/50 px-3 rounded-xl">
                            <span>فروش خالص (Net Sales)</span>
                            <span class="font-mono text-sm">${Number(p.netSales).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    </div>

                    <!-- COGS Section -->
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between items-center py-2 font-bold text-slate-800 border-b border-slate-100">
                            <span>بهای تمام شده کالای فروش رفته (COGS)</span>
                            <span class="text-rose-600 font-mono text-sm">-${Number(p.cogs).toLocaleString('fa-IR')} تومان</span>
                        </div>
                        <div class="flex justify-between items-center py-2.5 font-bold text-emerald-800 bg-emerald-50 px-3 rounded-xl text-sm">
                            <span class="flex items-center gap-2">
                                <span>سود ناخالص (Gross Profit)</span>
                                <span class="text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">حاشیه سود: ${p.grossMarginPercent}٪</span>
                            </span>
                            <span class="font-mono">${Number(p.grossProfit).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    </div>

                    <!-- Operating Expenses Section -->
                    <div class="space-y-2 text-xs">
                        <div class="font-bold text-slate-800 border-b border-slate-100 pb-2">
                            هزینه‌های عملیاتی و جاری (Operating Expenses):
                        </div>
                        <div class="space-y-1 pr-4">
                            ${p.expenses.map(e => `
                                <div class="flex justify-between items-center py-1 text-slate-600">
                                    <span>${e.name_fa} (${e.code})</span>
                                    <span class="font-mono">${Number(e.amount).toLocaleString('fa-IR')} تومان</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="flex justify-between items-center py-2 font-bold text-slate-800 bg-slate-100 px-3 rounded-xl">
                            <span>مجموع هزینه‌ها</span>
                            <span class="text-rose-700 font-mono text-sm">-${Number(p.totalExpenses).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    </div>

                    <!-- Final Net Profit -->
                    <div class="pt-4 border-t-2 border-slate-300 flex justify-between items-center bg-gradient-to-r from-purple-700 to-indigo-700 text-white p-4 rounded-2xl shadow-lg shadow-purple-100">
                        <div>
                            <div class="text-sm font-bold">سود خالص دوره (Net Profit)</div>
                            <div class="text-xs text-purple-200 mt-0.5">پس از کسر بهای تمام شده و کلیه هزینه‌های فروشگاه</div>
                        </div>
                        <div class="text-left">
                            <div class="text-xl font-black font-mono">${Number(p.netProfit).toLocaleString('fa-IR')} تومان</div>
                            <div class="text-xs text-purple-200">بازده خالص فروش: ${p.netMarginPercent}٪</div>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت صورت سود و زیان</div>';
        }
    },

    // 2. Balance Sheet (ترازنامه)
    async renderBalanceSheet(container) {
        try {
            const res = await fetch('/api/accounting/balance-sheet');
            const json = await res.json();
            const bs = json.data;

            container.innerHTML = `
                <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    <!-- Left: Assets -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                        <div class="pb-3 border-b border-slate-200 flex justify-between items-center">
                            <h4 class="font-bold text-slate-900 text-sm">دارایی‌ها (Assets)</h4>
                            <span class="text-emerald-600 font-bold font-mono">${Number(bs.totalAssets).toLocaleString('fa-IR')} تومان</span>
                        </div>

                        <div class="space-y-2">
                            ${bs.assets.map(a => `
                                <div class="flex justify-between items-center py-1.5 text-slate-600 border-b border-slate-50">
                                    <span>${a.name_fa} (${a.code})</span>
                                    <span class="font-bold font-mono text-slate-800">${Number(a.net_balance).toLocaleString('fa-IR')} ت</span>
                                </div>
                            `).join('')}
                        </div>

                        <div class="pt-3 border-t-2 border-emerald-500 flex justify-between font-bold text-sm text-emerald-800">
                            <span>جمع دارایی‌ها:</span>
                            <span class="font-mono">${Number(bs.totalAssets).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    </div>

                    <!-- Right: Liabilities & Equity -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                        <div class="pb-3 border-b border-slate-200 flex justify-between items-center">
                            <h4 class="font-bold text-slate-900 text-sm">بدهی‌ها و حقوق صاحبان سهام</h4>
                            <span class="text-purple-700 font-bold font-mono">${Number(bs.totalLiabilitiesAndEquity).toLocaleString('fa-IR')} تومان</span>
                        </div>

                        <!-- Liabilities -->
                        <div>
                            <div class="font-bold text-slate-700 mb-2">بدهی‌های جاری (Liabilities):</div>
                            <div class="space-y-1.5 pr-2">
                                ${bs.liabilities.map(l => `
                                    <div class="flex justify-between items-center py-1 text-slate-600 border-b border-slate-50">
                                        <span>${l.name_fa} (${l.code})</span>
                                        <span class="font-bold font-mono text-rose-700">${Number(l.net_balance).toLocaleString('fa-IR')} ت</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Equity -->
                        <div class="pt-3 border-t border-slate-100">
                            <div class="font-bold text-slate-700 mb-2">سرمایه و حقوق صاحبان سهام (Equity):</div>
                            <div class="space-y-1.5 pr-2">
                                ${bs.equities.map(e => `
                                    <div class="flex justify-between items-center py-1 text-slate-600 border-b border-slate-50">
                                        <span>${e.name_fa} (${e.code})</span>
                                        <span class="font-bold font-mono text-slate-800">${Number(e.net_balance).toLocaleString('fa-IR')} ت</span>
                                    </div>
                                `).join('')}
                                <div class="flex justify-between items-center py-1 text-emerald-700 font-bold">
                                    <span>سود انباشته دوره جاری (از P&L)</span>
                                    <span class="font-mono">${Number(bs.currentPeriodProfit).toLocaleString('fa-IR')} ت</span>
                                </div>
                            </div>
                        </div>

                        <div class="pt-3 border-t-2 border-purple-500 flex justify-between font-bold text-sm text-purple-900">
                            <span>جمع بدهی‌ها و سرمایه:</span>
                            <span class="font-mono">${Number(bs.totalLiabilitiesAndEquity).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    </div>

                    <!-- Balanced Badge -->
                    <div class="col-span-full text-center py-2">
                        <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold ${
                            bs.isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }">
                            <i data-lucide="check-circle" class="w-4 h-4"></i>
                            <span>${bs.isBalanced ? 'ترازنامه کاملاً متعادل و تراز است (دارایی‌ها = بدهی‌ها + سرمایه)' : 'ترازنامه مغایرت دارد!'}</span>
                        </span>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری ترازنامه</div>';
        }
    },

    // 3. Journal Entries View
    async renderJournals(container) {
        try {
            const res = await fetch('/api/accounting/journal-entries');
            const json = await res.json();
            const entries = json.data || [];

            container.innerHTML = `
                <div class="space-y-4">
                    ${entries.map(e => `
                        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-xs">
                            <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                                <div>
                                    <span class="font-bold text-slate-900 text-sm font-mono">${e.entry_number}</span>
                                    <span class="text-slate-400 mr-2">(${e.date})</span>
                                    <div class="text-slate-600 mt-0.5">${e.description}</div>
                                </div>
                                <div class="text-left">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 font-mono">${e.reference_type}</span>
                                    <div class="text-[10px] text-slate-400 mt-1">ثبت شده توسط: ${e.created_by_name || 'سیستم'}</div>
                                </div>
                            </div>

                            <!-- Lines -->
                            <table class="w-full text-right text-xs">
                                <thead class="text-slate-400 text-[11px]">
                                    <tr>
                                        <th class="pb-1 font-normal">کد و عنوان حساب</th>
                                        <th class="pb-1 font-normal">شرح ردیف</th>
                                        <th class="pb-1 text-left font-normal">بدهکار (Debit)</th>
                                        <th class="pb-1 text-left font-normal">بستانکار (Credit)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                    ${e.lines.map(l => `
                                        <tr>
                                            <td class="py-1.5 font-semibold text-slate-800 font-mono">
                                                ${l.account_code} - ${l.account_name}
                                            </td>
                                            <td class="py-1.5 text-slate-500 text-[11px]">${l.description || '-'}</td>
                                            <td class="py-1.5 text-left font-mono font-bold ${l.debit > 0 ? 'text-slate-900' : 'text-slate-300'}">
                                                ${l.debit > 0 ? Number(l.debit).toLocaleString('fa-IR') : '-'}
                                            </td>
                                            <td class="py-1.5 text-left font-mono font-bold ${l.credit > 0 ? 'text-purple-700' : 'text-slate-300'}">
                                                ${l.credit > 0 ? Number(l.credit).toLocaleString('fa-IR') : '-'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری اسناد دوبل</div>';
        }
    },

    // 4. Expenses View
    async renderExpenses(container) {
        try {
            const res = await fetch('/api/accounting/expenses');
            const json = await res.json();
            const expenses = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-right text-xs">
                        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th class="p-3.5">تاریخ</th>
                                <th class="p-3.5">دسته‌بندی هزینه</th>
                                <th class="p-3.5">مبلغ پرداختی</th>
                                <th class="p-3.5">حساب مبدا</th>
                                <th class="p-3.5">در وجه / گیرنده</th>
                                <th class="p-3.5">شرح و شماره پیگیری</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${expenses.map(e => `
                                <tr>
                                    <td class="p-3.5 text-slate-500 font-mono text-[11px]">${e.payment_date}</td>
                                    <td class="p-3.5">
                                        <span class="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 text-slate-700">${e.category}</span>
                                    </td>
                                    <td class="p-3.5 font-bold text-rose-600 font-mono text-sm">${Number(e.amount).toLocaleString('fa-IR')} تومان</td>
                                    <td class="p-3.5 text-slate-600">${e.bank_name || 'حساب مرکزی'}</td>
                                    <td class="p-3.5 text-slate-800 font-medium">${e.paid_to || '-'}</td>
                                    <td class="p-3.5 text-slate-500 text-[11px]">${e.description} ${e.reference_no ? `(کد: ${e.reference_no})` : ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت لیست هزینه‌ها</div>';
        }
    },

    // 5. Cheques View
    async renderCheques(container) {
        try {
            const res = await fetch('/api/accounting/cheques');
            const json = await res.json();
            const cheques = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-right text-xs">
                        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th class="p-3.5">شماره صیادی / سریال چک</th>
                                <th class="p-3.5">بانک عامل</th>
                                <th class="p-3.5">نوع چک</th>
                                <th class="p-3.5">مبلغ</th>
                                <th class="p-3.5">تاریخ سررسید</th>
                                <th class="p-3.5">طرف حساب</th>
                                <th class="p-3.5 text-center">وضعیت</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${cheques.map(c => `
                                <tr>
                                    <td class="p-3.5 font-mono font-bold text-slate-900">${c.cheque_number}</td>
                                    <td class="p-3.5 text-slate-600">${c.bank_name}</td>
                                    <td class="p-3.5">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                            c.type === 'PAYABLE' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                        }">${c.type === 'PAYABLE' ? 'پرداختنی (به تأمین‌کننده)' : 'دریافتی (از مشتری)'}</span>
                                    </td>
                                    <td class="p-3.5 font-bold font-mono text-slate-900">${Number(c.amount).toLocaleString('fa-IR')} تومان</td>
                                    <td class="p-3.5 font-mono">
                                        <div>${c.due_date}</div>
                                        <div class="text-[10px] text-amber-600 font-bold">${c.days_until_due} روز مانده</div>
                                    </td>
                                    <td class="p-3.5 text-slate-700">${c.party_name}</td>
                                    <td class="p-3.5 text-center">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">در انتظار پاس شدن</span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری چک‌ها</div>';
        }
    },

    // 6. Chart of Accounts View
    async renderCOA(container) {
        try {
            const res = await fetch('/api/accounting/chart-of-accounts');
            const json = await res.json();
            const coa = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-right text-xs">
                        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th class="p-3.5">کد حساب</th>
                                <th class="p-3.5">نام حساب (فارسی)</th>
                                <th class="p-3.5">Account Title</th>
                                <th class="p-3.5">ماهیت حساب</th>
                                <th class="p-3.5 text-left">مانده جاری (تومان)</th>
                                <th class="p-3.5 text-center">عملیات</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${coa.map(c => `
                                <tr>
                                    <td class="p-3.5 font-mono font-bold text-slate-900">${c.code}</td>
                                    <td class="p-3.5 font-bold text-slate-800">${c.name_fa}</td>
                                    <td class="p-3.5 text-slate-400 font-mono text-[11px]">${c.name}</td>
                                    <td class="p-3.5">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                            c.type === 'ASSET' ? 'bg-emerald-100 text-emerald-800' :
                                            c.type === 'LIABILITY' ? 'bg-rose-100 text-rose-800' :
                                            c.type === 'REVENUE' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'
                                        }">${c.type}</span>
                                    </td>
                                    <td class="p-3.5 text-left font-mono font-bold text-slate-900">${Number(c.net_balance).toLocaleString('fa-IR')}</td>
                                    <td class="p-3.5 text-center">
                                        <button onclick="accounting.openEditAccountModal(${JSON.stringify(c).replace(/"/g, '&quot;')})" class="px-2.5 py-1 bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto">
                                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                                            <span>ویرایش</span>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری کدینگ حساب‌ها</div>';
        }
    },

    // New Expense Modal
    async openExpenseModal() {
        try {
            const res = await fetch('/api/accounting/bank-accounts');
            const json = await res.json();
            const banks = json.data || [];

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-2">ثبت هزینه جدید فروشگاه</h3>
                <p class="text-xs text-slate-500 mb-4">ثبت هزینه به صورت خودکار سند دوبل صادر کرده و مانده حساب بانکی را به‌روز می‌کند.</p>

                <div class="space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">دسته‌بندی هزینه</label>
                        <select id="expenseCategory" class="w-full p-2.5 border border-slate-200 rounded-xl">
                            <option value="RENT">اجاره فروشگاه (۶۰۱)</option>
                            <option value="SALARY">حقوق و پورسانت پرسنل (۶۰۲)</option>
                            <option value="MARKETING">تبلیغات و پیامک (۶۰۳)</option>
                            <option value="PACKAGING">بسته‌بندی و بگ برنددار (۶۰۵)</option>
                            <option value="SHIPPING">پیک و ارسال (۶۰۵)</option>
                            <option value="ELECTRICITY">قبوض، آب و برق (۶۰۶)</option>
                            <option value="INTERNET">اینترنت و اشتراک نرم‌افزار (۶۰۶)</option>
                            <option value="MAINTENANCE">تعمیرات و استندها (۶۰۶)</option>
                            <option value="TAX">مالیات (۲۰۲)</option>
                            <option value="OTHER">سایر هزینه‌ها (۶۰۸)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">مبلغ پرداختی (تومان)</label>
                        <input type="number" id="expenseAmount" placeholder="مثلاً: 2500000" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold font-mono">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">حساب بانکی پرداخت‌کننده</label>
                        <select id="expenseBank" class="w-full p-2.5 border border-slate-200 rounded-xl">
                            ${banks.map(b => `
                                <option value="${b.id}">${b.bank_name} (موجودی: ${Number(b.balance).toLocaleString('fa-IR')} ت)</option>
                            `).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">پرداخت در وجه / گیرنده</label>
                        <input type="text" id="expensePaidTo" placeholder="نام شخص یا شرکت دریافت‌کننده" class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">شرح هزینه و شماره پیگیری</label>
                        <input type="text" id="expenseDesc" placeholder="توضیحات تکمیلی..." class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>

                    <div class="flex justify-end gap-2 pt-2">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                        <button onclick="accounting.submitExpense()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition">
                            ثبت نهایی هزینه و سند
                        </button>
                    </div>
                </div>
            `);
        } catch (e) {
            app.showNotification('خطا در آماده‌سازی فرم هزینه', 'error');
        }
    },

    async submitExpense() {
        const category = document.getElementById('expenseCategory').value;
        const amount = Number(document.getElementById('expenseAmount').value) || 0;
        const bankAccountId = Number(document.getElementById('expenseBank').value);
        const paidTo = document.getElementById('expensePaidTo').value;
        const description = document.getElementById('expenseDesc').value;

        if (amount <= 0) {
            app.showNotification('لطفاً مبلغ معتبر وارد نمایید', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/accounting/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, amount, bankAccountId, paidTo, description, createdBy: 1 })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('هزینه با موفقیت ثبت شد و سند دوبل صادر گردید.', 'success');
                app.closeModal();
                this.switchTab('expenses');
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ثبت هزینه', 'error');
        }
    },

    // 4.1 Fixed Costs View (مدیریت هزینه‌های ثابت و دوره‌ای)
    async renderFixedCosts(container) {
        try {
            const res = await fetch('/api/accounting/fixed-costs');
            const json = await res.json();
            const { items = [], monthlyBurnRate = 0, activeCount = 0 } = json.data || {};

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Burn-Rate KPI Card & Actions -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl">
                            <div class="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5 mb-1">
                                <i data-lucide="calculator" class="w-4 h-4"></i>
                                <span>نرخ ماهانه هزینه‌های ثابت (Monthly Burn-Rate)</span>
                            </div>
                            <div class="text-2xl font-bold font-mono text-indigo-950 mt-1">
                                ${Number(monthlyBurnRate).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-500">تومان در ماه</span>
                            </div>
                            <div class="text-[10px] text-slate-500 mt-1">مجموع تعهدات دوره‌ای اجاره، حقوق، شارژ و اشتراک‌ها</div>
                        </div>

                        <div class="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col justify-between">
                            <div class="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
                                <span>تعداد هزینه‌های فعال</span>
                            </div>
                            <div class="text-2xl font-bold font-mono text-slate-800">
                                ${activeCount} <span class="text-xs font-normal text-slate-400">مورد ثبت شده</span>
                            </div>
                            <div class="text-[10px] text-slate-400">موعد پرداخت خودکار یا دستی</div>
                        </div>

                        <div class="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col justify-center items-stretch gap-2">
                            <button onclick="accounting.openNewFixedCostModal()" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition">
                                <i data-lucide="plus-circle" class="w-4 h-4"></i>
                                <span>+ تعریف هزینه ثابت جدید</span>
                            </button>
                        </div>
                    </div>

                    <!-- Fixed Costs Table -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <i data-lucide="repeat" class="w-4 h-4 text-indigo-600"></i>
                                <span>فهرست هزینه‌های ثابت و دوره‌ای فروشگاه</span>
                            </h3>
                            <span class="text-[11px] text-slate-400">امکان پرداخت مستقیم و صدور آنی سند دوبل حسابداری</span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-right text-xs">
                                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th class="p-3.5">عنوان هزینه ثابت</th>
                                        <th class="p-3.5">دسته‌بندی</th>
                                        <th class="p-3.5">سرفصل حساب معین</th>
                                        <th class="p-3.5">مبلغ دوره</th>
                                        <th class="p-3.5 text-center">دوره تکرار</th>
                                        <th class="p-3.5 text-center">روز موعد</th>
                                        <th class="p-3.5 text-center">آخرین پرداخت</th>
                                        <th class="p-3.5 text-center">عملیات مالی</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${items.map(fc => `
                                        <tr class="hover:bg-slate-50/80 transition">
                                            <td class="p-3.5">
                                                <div class="font-bold text-slate-900">${fc.title}</div>
                                                ${fc.notes ? `<div class="text-[10px] text-slate-400 mt-0.5">${fc.notes}</div>` : ''}
                                            </td>
                                            <td class="p-3.5">
                                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                                    ${fc.category === 'RENT' ? 'اجاره ملک' :
                                                      fc.category === 'SALARY' ? 'حقوق ثابت' :
                                                      fc.category === 'MAINTENANCE' ? 'شارژ و خدمات' :
                                                      fc.category === 'SUBSCRIPTION' ? 'اینترنت و نرم‌افزار' : fc.category}
                                                </span>
                                            </td>
                                            <td class="p-3.5 font-mono text-slate-700 font-medium">
                                                ${fc.account_code} - ${fc.account_name}
                                            </td>
                                            <td class="p-3.5 font-bold font-mono text-slate-900">
                                                ${Number(fc.amount).toLocaleString('fa-IR')} تومان
                                            </td>
                                            <td class="p-3.5 text-center">
                                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                                    ${fc.frequency === 'MONTHLY' ? 'ماهانه' : fc.frequency === 'YEARLY' ? 'سالانه' : fc.frequency === 'QUARTERLY' ? 'فصلی' : 'هفتگی'}
                                                </span>
                                            </td>
                                            <td class="p-3.5 text-center font-mono text-slate-600 font-bold">
                                                روز ${fc.due_day || 1}
                                            </td>
                                            <td class="p-3.5 text-center font-mono text-[11px] text-slate-500">
                                                ${fc.last_paid_at ? app.formatDateFa(fc.last_paid_at) : '<span class="text-slate-400">هنوز ثبت نشده</span>'}
                                            </td>
                                            <td class="p-3.5 text-center">
                                                <div class="flex items-center justify-center gap-1.5">
                                                    <button onclick="accounting.payFixedCostModal(${fc.id}, '${fc.title.replace(/'/g, "\\'")}', ${fc.amount})" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1">
                                                        <i data-lucide="check" class="w-3 h-3"></i>
                                                        <span>پرداخت (سند دوبل)</span>
                                                    </button>
                                                    <button onclick="accounting.openEditFixedCostModal(${JSON.stringify(fc).replace(/"/g, '&quot;')})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition">
                                                        ویرایش
                                                    </button>
                                                    <button onclick="accounting.deleteFixedCost(${fc.id})" class="px-1.5 py-1 text-slate-400 hover:text-rose-600 rounded-lg transition" title="حذف">
                                                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری هزینه‌های ثابت</div>';
        }
    },

    async openNewFixedCostModal() {
        try {
            const res = await fetch('/api/accounting/chart-of-accounts');
            const json = await res.json();
            const coa = (json.data || []).filter(c => c.type === 'EXPENSE');

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-2">تعریف هزینه ثابت و دوره‌ای جدید</h3>
                <p class="text-xs text-slate-500 mb-4">هزینه‌های مستمر مانند اجاره، حقوق، شارژ پاساژ و اشتراک‌ها را اینجا ثبت کنید.</p>

                <div class="space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">عنوان هزینه <span class="text-rose-500">*</span></label>
                        <input type="text" id="nfcTitle" placeholder="مثلاً: اجاره ماهانه فروشگاه یا شارژ پاساژ" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold">
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">دسته‌بندی</label>
                            <select id="nfcCategory" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                                <option value="RENT">اجاره ملک تجاری</option>
                                <option value="SALARY">حقوق و دستمزد پرسنل</option>
                                <option value="MAINTENANCE">شارژ و نگهداری مجتمع</option>
                                <option value="SUBSCRIPTION">اشتراک اینترنت و نرم‌افزار</option>
                                <option value="UTILITIES">قبوض و انرژی</option>
                                <option value="OTHER">سایر هزینه‌های ثابت</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">سرفصل حسابداری معین <span class="text-rose-500">*</span></label>
                            <select id="nfcAccount" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-mono">
                                ${coa.map(c => `<option value="${c.id}">${c.code} - ${c.name_fa}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">مبلغ دوره (تومان) <span class="text-rose-500">*</span></label>
                            <input type="number" id="nfcAmount" placeholder="30000000" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-indigo-700">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">دوره تکرار</label>
                            <select id="nfcFrequency" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                                <option value="MONTHLY">ماهانه</option>
                                <option value="QUARTERLY">فصلی (۳ ماهه)</option>
                                <option value="YEARLY">سالانه</option>
                                <option value="WEEKLY">هفتگی</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">روز سررسید در ماه</label>
                            <input type="number" id="nfcDueDay" value="1" min="1" max="31" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-center">
                        </div>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">یادداشت و توضیحات</label>
                        <textarea id="nfcNotes" rows="2" placeholder="شماره قرارداد، شماره شبا یا توضیحات تکمیلی..." class="w-full p-2.5 border border-slate-200 rounded-xl"></textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                        <button onclick="accounting.submitNewFixedCost()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition flex items-center gap-1.5">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            <span>ثبت هزینه ثابت</span>
                        </button>
                    </div>
                </div>
            `);
            lucide.createIcons();
        } catch (e) {
            app.showNotification('خطا در آماده‌سازی فرم هزینه ثابت', 'error');
        }
    },

    async submitNewFixedCost() {
        const title = document.getElementById('nfcTitle')?.value.trim();
        const category = document.getElementById('nfcCategory')?.value;
        const accountId = Number(document.getElementById('nfcAccount')?.value);
        const amount = Number(document.getElementById('nfcAmount')?.value) || 0;
        const frequency = document.getElementById('nfcFrequency')?.value;
        const dueDay = Number(document.getElementById('nfcDueDay')?.value) || 1;
        const notes = document.getElementById('nfcNotes')?.value.trim();

        if (!title || !accountId || amount <= 0) {
            app.showNotification('لطفاً عنوان، سرفصل حساب و مبلغ معتبر را وارد کنید.', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/accounting/fixed-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, category, accountId, amount, frequency, dueDay, notes })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('هزینه ثابت جدید با موفقیت تعریف شد.', 'success');
                app.closeModal();
                this.switchTab('fixedCosts');
            } else {
                app.showNotification(json.error || 'خطا در ثبت', 'error');
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    async openEditFixedCostModal(fc) {
        try {
            const res = await fetch('/api/accounting/chart-of-accounts');
            const json = await res.json();
            const coa = (json.data || []).filter(c => c.type === 'EXPENSE');

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-2">ویرایش هزینه ثابت: ${fc.title}</h3>
                <div class="space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">عنوان هزینه</label>
                        <input type="text" id="efcTitle" value="${fc.title}" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold">
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">دسته‌بندی</label>
                            <select id="efcCategory" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                                <option value="RENT" ${fc.category === 'RENT' ? 'selected' : ''}>اجاره ملک تجاری</option>
                                <option value="SALARY" ${fc.category === 'SALARY' ? 'selected' : ''}>حقوق و دستمزد پرسنل</option>
                                <option value="MAINTENANCE" ${fc.category === 'MAINTENANCE' ? 'selected' : ''}>شارژ و نگهداری مجتمع</option>
                                <option value="SUBSCRIPTION" ${fc.category === 'SUBSCRIPTION' ? 'selected' : ''}>اشتراک اینترنت و نرم‌افزار</option>
                                <option value="UTILITIES" ${fc.category === 'UTILITIES' ? 'selected' : ''}>قبوض و انرژی</option>
                                <option value="OTHER" ${fc.category === 'OTHER' ? 'selected' : ''}>سایر هزینه‌های ثابت</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">سرفصل حسابداری معین</label>
                            <select id="efcAccount" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-mono">
                                ${coa.map(c => `<option value="${c.id}" ${c.id === fc.account_id ? 'selected' : ''}>${c.code} - ${c.name_fa}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">مبلغ دوره (تومان)</label>
                            <input type="number" id="efcAmount" value="${fc.amount}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-indigo-700">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">دوره تکرار</label>
                            <select id="efcFrequency" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                                <option value="MONTHLY" ${fc.frequency === 'MONTHLY' ? 'selected' : ''}>ماهانه</option>
                                <option value="QUARTERLY" ${fc.frequency === 'QUARTERLY' ? 'selected' : ''}>فصلی</option>
                                <option value="YEARLY" ${fc.frequency === 'YEARLY' ? 'selected' : ''}>سالانه</option>
                                <option value="WEEKLY" ${fc.frequency === 'WEEKLY' ? 'selected' : ''}>هفتگی</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">روز سررسید</label>
                            <input type="number" id="efcDueDay" value="${fc.due_day || 1}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-center">
                        </div>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">وضعیت هزینه</label>
                        <select id="efcStatus" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                            <option value="ACTIVE" ${fc.status === 'ACTIVE' ? 'selected' : ''}>فعال (در گردش)</option>
                            <option value="PAUSED" ${fc.status === 'PAUSED' ? 'selected' : ''}>متوقف شده</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">یادداشت</label>
                        <textarea id="efcNotes" rows="2" class="w-full p-2.5 border border-slate-200 rounded-xl">${fc.notes || ''}</textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                        <button onclick="accounting.submitEditFixedCost(${fc.id})" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition">
                            ذخیره تغییرات
                        </button>
                    </div>
                </div>
            `);
        } catch (e) {
            app.showNotification('خطا در باز کردن فرم ویرایش', 'error');
        }
    },

    async submitEditFixedCost(id) {
        const title = document.getElementById('efcTitle')?.value.trim();
        const category = document.getElementById('efcCategory')?.value;
        const accountId = Number(document.getElementById('efcAccount')?.value);
        const amount = Number(document.getElementById('efcAmount')?.value) || 0;
        const frequency = document.getElementById('efcFrequency')?.value;
        const dueDay = Number(document.getElementById('efcDueDay')?.value) || 1;
        const status = document.getElementById('efcStatus')?.value;
        const notes = document.getElementById('efcNotes')?.value.trim();

        try {
            const res = await fetch(`/api/accounting/fixed-costs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, category, accountId, amount, frequency, dueDay, status, notes })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('هزینه ثابت با موفقیت به‌روزرسانی شد.', 'success');
                app.closeModal();
                this.switchTab('fixedCosts');
            }
        } catch (e) {
            app.showNotification('خطا در ذخیره تغییرات', 'error');
        }
    },

    async deleteFixedCost(id) {
        if (!confirm('آیا از حذف این هزینه ثابت اطمینان دارید؟')) return;
        try {
            await fetch(`/api/accounting/fixed-costs/${id}`, { method: 'DELETE' });
            app.showNotification('هزینه ثابت با موفقیت حذف شد.', 'info');
            this.switchTab('fixedCosts');
        } catch (e) {
            app.showNotification('خطا در حذف هزینه ثابت', 'error');
        }
    },

    async payFixedCostModal(id, title, amount) {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">ثبت پرداخت هزینه ثابت: ${title}</h3>
            <p class="text-xs text-slate-500 mb-4">با تایید این مرحله، سند دوبل حسابداری صادر شده و موجودی بانک یا صندوق کسر می‌گردد.</p>

            <div class="space-y-4 text-xs">
                <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <span class="font-bold text-emerald-800">مبلغ قابل پرداخت:</span>
                    <span class="font-bold font-mono text-emerald-900 text-sm">${Number(amount).toLocaleString('fa-IR')} تومان</span>
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">روش و حساب پرداخت</label>
                    <select id="pfcMethod" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                        <option value="BANK">حساب‌های بانکی و کارتخوان (۱۰۲)</option>
                        <option value="CASH">صندوق و وجه نقد فروشگاه (۱۰۱)</option>
                    </select>
                </div>

                <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="accounting.submitPayFixedCost(${id})" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition flex items-center gap-1.5">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                        <span>صدور سند و ثبت پرداخت</span>
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    async submitPayFixedCost(id) {
        const paymentMethod = document.getElementById('pfcMethod')?.value || 'BANK';
        try {
            const res = await fetch(`/api/accounting/fixed-costs/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentMethod })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`سند حسابداری ${json.data.entryNumber} با موفقیت صادر و پرداخت ثبت گردید.`, 'success');
                app.closeModal();
                this.switchTab('fixedCosts');
            } else {
                app.showNotification(json.error || 'خطا در ثبت پرداخت', 'error');
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    // Edit Chart of Accounts Modal
    openEditAccountModal(acc) {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">ویرایش سرفصل حساب: ${acc.code}</h3>
            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">کد حساب معین / کل</label>
                    <input type="text" id="eaccCode" value="${acc.code}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-slate-900">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">نام فارسی حساب</label>
                    <input type="text" id="eaccNameFa" value="${acc.name_fa}" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">توضیحات و ماهیت</label>
                    <textarea id="eaccDesc" rows="2" class="w-full p-2.5 border border-slate-200 rounded-xl">${acc.description || ''}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="accounting.submitEditAccount(${acc.id})" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md transition">
                        ذخیره تغییرات سرفصل
                    </button>
                </div>
            </div>
        `);
    },

    async submitEditAccount(id) {
        const code = document.getElementById('eaccCode')?.value.trim();
        const nameFa = document.getElementById('eaccNameFa')?.value.trim();
        const description = document.getElementById('eaccDesc')?.value.trim();

        try {
            const res = await fetch(`/api/accounting/accounts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, nameFa, description })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('سرفصل حساب با موفقیت ویرایش شد.', 'success');
                app.closeModal();
                this.switchTab('coa');
            }
        } catch (e) {
            app.showNotification('خطا در ذخیره سرفصل', 'error');
        }
    },

    // Edit Journal Entry Description Modal
    openEditJournalModal(entry) {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">ویرایش سند حسابداری: ${entry.entry_number}</h3>
            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">تاریخ سند</label>
                    <input type="date" id="ejeDate" value="${entry.date}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">شرح سند</label>
                    <textarea id="ejeDesc" rows="3" class="w-full p-2.5 border border-slate-200 rounded-xl font-medium">${entry.description || ''}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="accounting.submitEditJournal(${entry.id})" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md transition">
                        ذخیره شرح سند
                    </button>
                </div>
            </div>
        `);
    },

    async submitEditJournal(id) {
        const date = document.getElementById('ejeDate')?.value;
        const description = document.getElementById('ejeDesc')?.value.trim();

        try {
            const res = await fetch(`/api/accounting/journal-entries/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('شرح سند با موفقیت به‌روزرسانی شد.', 'success');
                app.closeModal();
                this.switchTab('journals');
            }
        } catch (e) {
            app.showNotification('خطا در به‌روزرسانی سند', 'error');
        }
    }
};
