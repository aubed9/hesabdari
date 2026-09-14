// Business Intelligence (BI), Data Visualizations & Cafe-Grade Analytics Client Module
const bi = {
    salesChart: null,
    brandChart: null,

    async init() {
        this.render();
        await this.loadAnalytics();
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="space-y-6">
                <!-- Header -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-5 h-5 text-purple-600"></i>
                            <span>تحلیل‌های پیشرفته هوش تجاری (Retail BI & Advanced Analytics)</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">ساعات اوج تردد، روزهای پرفروش، ماتریس بوستون (BCG)، ابعاد سبد خرید و پیش‌بینی هوشمند فروش</p>
                    </div>

                    <div class="flex items-center gap-2">
                        <span class="text-xs bg-purple-50 text-purple-700 font-bold px-3 py-1.5 rounded-xl border border-purple-200">
                            موتور BI فعال
                        </span>
                    </div>
                </div>

                <!-- 1. Sales Forecasting & Run-Rate Row -->
                <div id="biForecastContainer" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="py-6 text-center text-slate-400 col-span-full">در حال محاسبه پیش‌بینی و شاخص‌های فروش...</div>
                </div>

                <!-- 2. Charts Row: Sales Trend + Brand Margin Performance -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Sales Trend Line Chart -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <i data-lucide="activity" class="w-4 h-4 text-purple-600"></i>
                                <span>روند روزانه فروش و سود ناخالص (تومان)</span>
                            </h3>
                            <span class="text-[10px] text-slate-400">۱۴ روز گذشته</span>
                        </div>
                        <div class="h-64 relative">
                            <canvas id="salesTrendCanvas"></canvas>
                        </div>
                    </div>

                    <!-- Brand Margins Bar Chart -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <i data-lucide="bar-chart-3" class="w-4 h-4 text-indigo-600"></i>
                                <span>مقایسه فروش و حاشیه سود برندهای آرایشی</span>
                            </h3>
                            <span class="text-[10px] text-slate-400">سهم برندها در درآمد</span>
                        </div>
                        <div class="h-64 relative">
                            <canvas id="brandMarginCanvas"></canvas>
                        </div>
                    </div>
                </div>

                <!-- 3. Boston Consulting Group (BCG) Matrix Quadrant -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="grid" class="w-4 h-4 text-purple-600"></i>
                                <span>ماتریس بوستون کالاها و برندها (BCG Matrix Analysis)</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">طبقه‌بندی محصولات به ۴ دسته: ستاره‌ها (Stars)، گاوهای شیرده (Cash Cows)، علامت سوال (Question Marks) و سگ‌ها (Dogs)</p>
                        </div>
                    </div>

                    <div id="biBcgContainer" class="overflow-x-auto">
                        <div class="py-6 text-center text-slate-400">در حال ارزیابی ماتریس بوستون...</div>
                    </div>
                </div>

                <!-- 4. Peak Shopping Hours & Day-of-Week Row -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Hourly Peak Hours Breakdown -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="clock" class="w-4 h-4 text-amber-500"></i>
                                <span>ساعات اوج و پیک فروشگاه (Rush Hours)</span>
                            </h3>
                            <span class="text-[10px] text-slate-400">توزیع زمانی فاکتورها</span>
                        </div>
                        <div id="biHourlyContainer" class="space-y-2 max-h-72 overflow-y-auto pr-1">
                            <div class="py-6 text-center text-slate-400">در حال تحلیل ساعات پیک...</div>
                        </div>
                    </div>

                    <!-- Day of Week Performance -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="calendar" class="w-4 h-4 text-indigo-600"></i>
                                <span>الگوی فروش در روزهای هفته (شنبه تا جمعه)</span>
                            </h3>
                            <span class="text-[10px] text-slate-400">درآمد و سهم فروش روزها</span>
                        </div>
                        <div id="biDayOfWeekContainer" class="space-y-2">
                            <div class="py-6 text-center text-slate-400">در حال تحلیل روزهای هفته...</div>
                        </div>
                    </div>
                </div>

                <!-- 5. Basket Depth & Cross-Sell Analysis -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="shopping-bag" class="w-4 h-4 text-emerald-600"></i>
                                <span>تحلیل عمق سبد خرید و کالاهای مکمل (Basket Size & Cross-Sell)</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">توزیع فاکتورهای تک‌قلمی در برابر سبدهای بزرگ و تخصصی</p>
                        </div>
                        <div id="biAvgBasketBadge" class="text-xs font-bold font-mono px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">
                            متوسط: - قلم
                        </div>
                    </div>
                    <div id="biBasketContainer" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <!-- Populated by JS -->
                    </div>
                </div>

                <!-- 6. Dead Stock Row -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <i data-lucide="archive" class="w-4 h-4 text-rose-500"></i>
                        <span>کالاهای راکد و خواب سرمایه بیش از ۳۰ روز (Dead Stock Alert)</span>
                    </h3>
                    <div class="overflow-x-auto max-h-72 overflow-y-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 text-[11px]">
                                <tr>
                                    <th class="p-2">نام کالا</th>
                                    <th class="p-2">موجودی</th>
                                    <th class="p-2">سرمایه قفل شده</th>
                                    <th class="p-2">روز بدون فروش</th>
                                </tr>
                            </thead>
                            <tbody id="deadStockTableBody" class="divide-y divide-slate-100">
                                <tr><td colspan="4" class="p-4 text-center text-slate-400">در حال بررسی موجودی راکد...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        lucide.createIcons();
    },

    async loadAnalytics() {
        await Promise.all([
            this.loadSalesForecast(),
            this.loadCharts(),
            this.loadBcgMatrix(),
            this.loadHourlyPeak(),
            this.loadDayOfWeek(),
            this.loadBasketMetrics(),
            this.loadDeadStock()
        ]);
        lucide.createIcons();
    },

    async loadSalesForecast() {
        const container = document.getElementById('biForecastContainer');
        if (!container) return;

        try {
            const res = await fetch('/api/bi/sales-forecast');
            const json = await res.json();
            const f = json.data || {};

            container.innerHTML = `
                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-slate-500 mb-1">فروش ماه جاری تا کنون (MTD)</div>
                    <div class="text-xl font-bold font-mono text-purple-700">${Number(f.mtdSales || 0).toLocaleString('fa-IR')} <span class="text-[10px] font-normal text-slate-400">تومان</span></div>
                    <div class="text-[10px] text-slate-400 mt-1">${f.mtdOrders || 0} فاکتور ثبت شده</div>
                </div>

                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-slate-500 mb-1">نرخ فروش روزانه (Daily Run-Rate)</div>
                    <div class="text-xl font-bold font-mono text-slate-800">${Number(f.dailyRunRate || 0).toLocaleString('fa-IR')} <span class="text-[10px] font-normal text-slate-400">تومان/روز</span></div>
                    <div class="text-[10px] text-slate-400 mt-1">میانگین فروش هر روز ماه</div>
                </div>

                <div class="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-purple-800 mb-1">پیش‌بینی فروش پایان ماه</div>
                    <div class="text-xl font-bold font-mono text-purple-900">${Number(f.projectedMonthSales || 0).toLocaleString('fa-IR')} <span class="text-[10px] font-normal text-slate-500">تومان</span></div>
                    <div class="text-[10px] text-purple-600 mt-1">برآورد سیستم با شتاب فعلی</div>
                </div>

                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between">
                    <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>پیشرفت ماه</span>
                        <span class="font-mono text-slate-800">${f.completionPercent || 0}٪</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div class="bg-gradient-to-r from-purple-600 to-indigo-600 h-2.5 rounded-full" style="width: ${Math.min(100, f.completionPercent || 0)}%"></div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1">بر مبنای تقویم ۳۰ روزه</div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading sales forecast', e);
        }
    },

    async loadBcgMatrix() {
        const container = document.getElementById('biBcgContainer');
        if (!container) return;

        try {
            const res = await fetch('/api/bi/bcg-matrix');
            const json = await res.json();
            const items = json.data || [];

            container.innerHTML = `
                <table class="w-full text-right text-xs">
                    <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px]">
                        <tr>
                            <th class="p-3">نام محصول و برند</th>
                            <th class="p-3">دسته‌بندی</th>
                            <th class="p-3 text-center">تعداد فروش</th>
                            <th class="p-3">کل درآمد فروش</th>
                            <th class="p-3">سود ناخالص</th>
                            <th class="p-3 text-center">حاشیه سود</th>
                            <th class="p-3 text-center">جایگاه در ماتریس بوستون</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${items.slice(0, 10).map(p => `
                            <tr class="hover:bg-slate-50/80 transition">
                                <td class="p-3">
                                    <div class="font-bold text-slate-900">${p.productName}</div>
                                    <div class="text-[10px] text-slate-400">${p.brandName}</div>
                                </td>
                                <td class="p-3 text-slate-600">${p.categoryName}</td>
                                <td class="p-3 text-center font-bold font-mono">${p.unitsSold} عدد</td>
                                <td class="p-3 font-mono font-bold text-slate-800">${Number(p.totalRevenue).toLocaleString('fa-IR')} ت</td>
                                <td class="p-3 font-mono text-emerald-600">${Number(p.profit).toLocaleString('fa-IR')} ت</td>
                                <td class="p-3 text-center font-mono font-bold ${p.margin >= 35 ? 'text-emerald-700' : 'text-slate-600'}">${p.margin}٪</td>
                                <td class="p-3 text-center">
                                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                        p.quadrant === 'STAR' ? 'bg-emerald-100 text-emerald-800' :
                                        p.quadrant === 'CASH_COW' ? 'bg-blue-100 text-blue-800' :
                                        p.quadrant === 'QUESTION_MARK' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                    }">
                                        ${p.quadrantLabel}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-4 text-center text-rose-500">خطا در بارگذاری ماتریس بوستون</div>';
        }
    },

    async loadHourlyPeak() {
        const container = document.getElementById('biHourlyContainer');
        if (!container) return;

        try {
            const res = await fetch('/api/bi/hourly-peak');
            const json = await res.json();
            const hours = json.data || [];

            if (hours.length === 0) {
                container.innerHTML = '<div class="py-6 text-center text-slate-400">اطلاعات ساعتی ثبت نشده است</div>';
                return;
            }

            container.innerHTML = hours.map(h => `
                <div class="flex items-center gap-3 p-2 rounded-xl ${h.isPeak ? 'bg-amber-50/70 border border-amber-200' : 'hover:bg-slate-50'} transition text-xs">
                    <div class="w-24 font-mono font-bold ${h.isPeak ? 'text-amber-900' : 'text-slate-700'}">
                        ${h.hourLabel}
                    </div>
                    <div class="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div class="${h.isPeak ? 'bg-amber-500' : 'bg-purple-600'} h-2 rounded-full" style="width: ${h.intensityPercent}%"></div>
                    </div>
                    <div class="w-16 text-left font-mono font-bold text-slate-800">
                        ${h.orderCount} فاکتور
                    </div>
                    <div class="w-16 text-left font-mono text-[11px] text-slate-400">
                        ${h.trafficSharePercent}٪ سهم
                    </div>
                    ${h.isPeak ? `<span class="text-[9px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded">پیک اوج</span>` : ''}
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<div class="p-4 text-center text-rose-500">خطا در دریافت ساعات پیک</div>';
        }
    },

    async loadDayOfWeek() {
        const container = document.getElementById('biDayOfWeekContainer');
        if (!container) return;

        try {
            const res = await fetch('/api/bi/day-of-week');
            const json = await res.json();
            const { days = [], bestDay } = json.data || {};

            container.innerHTML = days.map(d => `
                <div class="flex items-center justify-between p-2.5 rounded-xl ${bestDay && bestDay.dayName === d.dayName ? 'bg-purple-50 border border-purple-200' : 'bg-slate-50'} text-xs">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-900 w-16">${d.dayName}</span>
                        ${bestDay && bestDay.dayName === d.dayName ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white">پرفروش‌ترین روز</span>` : ''}
                    </div>
                    <div class="font-mono text-slate-600">${d.orderCount} فاکتور</div>
                    <div class="font-mono font-bold text-slate-900">${Number(d.totalSales).toLocaleString('fa-IR')} ت</div>
                    <div class="font-mono text-[11px] text-purple-700 font-bold">${d.revenueSharePercent}٪ کل</div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<div class="p-4 text-center text-rose-500">خطا در دریافت الگوی روزهای هفته</div>';
        }
    },

    async loadBasketMetrics() {
        const container = document.getElementById('biBasketContainer');
        const badge = document.getElementById('biAvgBasketBadge');
        if (!container) return;

        try {
            const res = await fetch('/api/bi/basket-metrics');
            const json = await res.json();
            const b = json.data || {};

            if (badge) badge.innerText = `میانگین اقلام سبد: ${b.avgUnitsPerBasket || 1} کالا`;

            container.innerHTML = (b.distribution || []).map(dist => `
                <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                    <div>
                        <div class="text-xs font-bold text-slate-800">${dist.label}</div>
                        <div class="text-2xl font-bold font-mono text-purple-800 mt-2">${dist.percentage}٪</div>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-2 font-mono">${dist.count} سفارش صادر شده</div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<div class="p-4 text-center text-rose-500">خطا در دریافت تحلیل سبد خرید</div>';
        }
    },

    async loadCharts() {
        try {
            const res = await fetch('/api/dashboard/charts?days=14');
            const json = await res.json();
            const data = json.data || {};

            // 1. Sales Trend Line Chart
            const salesCtx = document.getElementById('salesTrendCanvas')?.getContext('2d');
            if (salesCtx && data.salesTrend) {
                if (this.salesChart) this.salesChart.destroy();
                this.salesChart = new Chart(salesCtx, {
                    type: 'line',
                    data: {
                        labels: data.salesTrend.map(d => app.formatDateFa(d.date)),
                        datasets: [
                            {
                                label: 'فروش (تومان)',
                                data: data.salesTrend.map(d => d.sales),
                                borderColor: '#9333ea',
                                backgroundColor: 'rgba(147, 51, 234, 0.1)',
                                fill: true,
                                tension: 0.3
                            },
                            {
                                label: 'سود ناخالص (تومان)',
                                data: data.salesTrend.map(d => d.grossProfit),
                                borderColor: '#10b981',
                                borderDash: [5, 5],
                                fill: false,
                                tension: 0.3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'top', rtl: true } }
                    }
                });
            }

            // 2. Brand Performance Bar Chart
            const brandCtx = document.getElementById('brandMarginCanvas')?.getContext('2d');
            if (brandCtx && data.brands) {
                if (this.brandChart) this.brandChart.destroy();
                this.brandChart = new Chart(brandCtx, {
                    type: 'bar',
                    data: {
                        labels: data.brands.map(b => b.brand_name),
                        datasets: [
                            {
                                label: 'فروش برند (تومان)',
                                data: data.brands.map(b => b.total_sales),
                                backgroundColor: '#6366f1',
                                borderRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'top', rtl: true } }
                    }
                });
            }
        } catch (e) {
            console.error('Error loading charts', e);
        }
    },

    async loadDeadStock() {
        const body = document.getElementById('deadStockTableBody');
        if (!body) return;

        try {
            const res = await fetch('/api/dashboard/dead-stock');
            const json = await res.json();
            const items = json.data || [];

            if (items.length === 0) {
                body.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-emerald-600">کالای راکد با خواب سرمایه بالا یافت نشد</td></tr>';
                return;
            }

            body.innerHTML = items.slice(0, 8).map(i => `
                <tr>
                    <td class="p-2 font-medium text-slate-800 truncate max-w-[120px]">${i.product_name}</td>
                    <td class="p-2 font-bold">${i.stock_qty} عدد</td>
                    <td class="p-2 font-mono font-bold text-rose-600">${Number(i.locked_capital).toLocaleString('fa-IR')} ت</td>
                    <td class="p-2 text-slate-500 font-mono">${i.days_without_sale} روز</td>
                </tr>
            `).join('');
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">خطا در دریافت اطلاعات</td></tr>';
        }
    }
};