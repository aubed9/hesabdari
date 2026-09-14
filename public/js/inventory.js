// Inventory, Batches, FEFO, Expiry & Tester Client Module
const inventory = {
    activeTab: 'stock', // stock, expiry, testers, count, reorder, txs

    async init() {
        this.render();
        this.loadTabContent();
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="space-y-6">
                <!-- Top Header & Tabs -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="boxes" class="w-5 h-5 text-purple-600"></i>
                            <span>مدیریت انبار، سری ساخت (Batch) و خروج هوشمند FEFO</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">کنترل دقیق تاریخ‌های انقضا، تسترها، انبارگردانی و پیشنهاد خرید خودکار</p>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex flex-wrap items-center gap-2">
                        <button onclick="app.openNewProductModal()" class="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i>
                            <span>+ افزودن کالای جدید به انبار و صندوق</span>
                        </button>

                        <button onclick="inventory.openTesterModal()" class="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="sparkles" class="w-4 h-4 text-pink-600"></i>
                            <span>تبدیل به تستر</span>
                        </button>

                        <button onclick="inventory.openStockCountModal()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="clipboard-check" class="w-4 h-4"></i>
                            <span>انبارگردانی</span>
                        </button>
                    </div>
                </div>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 gap-4 text-xs font-medium">
                    <button onclick="inventory.switchTab('stock')" id="invTab-stock" class="pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5">
                        <i data-lucide="layers" class="w-4 h-4"></i>
                        <span>موجودی لحظه‌ای کالاها</span>
                    </button>
                    <button onclick="inventory.switchTab('expiry')" id="invTab-expiry" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
                        <i data-lucide="hourglass" class="w-4 h-4 text-amber-500"></i>
                        <span>کنترل بازه‌های انقضا (FEFO)</span>
                    </button>
                    <button onclick="inventory.switchTab('testers')" id="invTab-testers" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
                        <i data-lucide="smile" class="w-4 h-4 text-pink-500"></i>
                        <span>مدیریت تسترها (Tester)</span>
                    </button>
                    <button onclick="inventory.switchTab('reorder')" id="invTab-reorder" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
                        <i data-lucide="shopping-cart" class="w-4 h-4 text-blue-500"></i>
                        <span>پیشنهاد خرید هوشمند</span>
                    </button>
                    <button onclick="inventory.switchTab('txs')" id="invTab-txs" class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
                        <i data-lucide="history" class="w-4 h-4"></i>
                        <span>گردش و لاگ تراکنش‌ها</span>
                    </button>
                </div>

                <!-- Dynamic Tab Content Pane -->
                <div id="invContentPane">
                    <div class="py-12 text-center text-slate-400">در حال بارگذاری اطلاعات انبار...</div>
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('[id^="invTab-"]').forEach(el => {
            el.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5';
        });
        const activeBtn = document.getElementById(`invTab-${tab}`);
        if (activeBtn) {
            activeBtn.className = 'pb-3 border-b-2 border-purple-600 text-purple-700 font-bold flex items-center gap-1.5';
        }
        this.loadTabContent();
    },

    async loadTabContent() {
        const pane = document.getElementById('invContentPane');
        if (!pane) return;

        if (this.activeTab === 'stock') {
            await this.renderStockView(pane);
        } else if (this.activeTab === 'expiry') {
            await this.renderExpiryView(pane);
        } else if (this.activeTab === 'testers') {
            await this.renderTestersView(pane);
        } else if (this.activeTab === 'reorder') {
            await this.renderReorderView(pane);
        } else if (this.activeTab === 'txs') {
            await this.renderTransactionsView(pane);
        }
        lucide.createIcons();
    },

    // 1. Stock Overview View
    async renderStockView(container) {
        try {
            const res = await fetch('/api/inventory/stock');
            const json = await res.json();
            const items = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">نام محصول و برند</th>
                                    <th class="p-3.5">شید رنگ / مشخصه</th>
                                    <th class="p-3.5">بارکد و SKU</th>
                                    <th class="p-3.5 text-center">موجودی کل</th>
                                    <th class="p-3.5">نقطه سفارش</th>
                                    <th class="p-3.5">ارزش بهای تمام شده</th>
                                    <th class="p-3.5">نزدیک‌ترین انقضا</th>
                                    <th class="p-3.5 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${items.map(item => `
                                    <tr class="hover:bg-slate-50/80 transition">
                                        <td class="p-3.5">
                                            <div class="font-bold text-slate-900">${item.product_name_fa || item.product_name}</div>
                                            <div class="text-[11px] text-slate-400">${item.brand_name} | ${item.category_name}</div>
                                        </td>
                                        <td class="p-3.5">
                                            ${item.shade ? `
                                                <div class="flex items-center gap-1.5 font-medium">
                                                    <span class="shade-swatch" style="background-color: ${item.color_hex || '#ccc'}"></span>
                                                    <span>${item.shade}</span>
                                                </div>
                                            ` : '<span class="text-slate-400">-</span>'}
                                        </td>
                                        <td class="p-3.5 font-mono text-[11px] text-slate-600">
                                            <div>${item.barcode}</div>
                                            <div class="text-[10px] text-slate-400">${item.sku}</div>
                                        </td>
                                        <td class="p-3.5 text-center">
                                            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                                item.total_stock <= item.reorder_point 
                                                    ? 'bg-rose-100 text-rose-800 animate-pulse' 
                                                    : 'bg-emerald-100 text-emerald-800'
                                            }">
                                                ${item.total_stock} عدد
                                            </span>
                                        </td>
                                        <td class="p-3.5 text-slate-600">
                                            ${item.reorder_point} (ایمن: ${item.safety_stock})
                                        </td>
                                        <td class="p-3.5 font-bold text-slate-800">
                                            ${Number(item.total_cost_value).toLocaleString('fa-IR')} تومان
                                        </td>
                                        <td class="p-3.5 text-[11px]">
                                            <span class="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                                                ${item.earliest_expiry || '-'}
                                            </span>
                                        </td>
                                        <td class="p-3.5 text-center">
                                            <button onclick="inventory.viewBatches(${item.variant_id})" class="text-purple-600 hover:text-purple-800 font-medium hover:underline text-xs">
                                                مشاهده بچ‌ها (${item.batch_count})
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت اطلاعات موجودی</div>';
        }
    },

    // 2. Expiry Analysis View (6 Buckets)
    async renderExpiryView(container) {
        try {
            const res = await fetch('/api/inventory/expiry-analysis');
            const json = await res.json();
            const data = json.data;

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- 6 Expiry Cards -->
                    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                        <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                            <div class="text-xs font-bold text-rose-800">منقضی شده (Expired)</div>
                            <div class="text-2xl font-black text-rose-600 mt-2">${data.expired.quantity} عدد</div>
                            <div class="text-[11px] text-rose-700 mt-1">${data.expired.count} بچ | ${data.expired.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>

                        <div class="p-4 rounded-2xl bg-red-50 border border-red-200">
                            <div class="text-xs font-bold text-red-800">۰ تا ۳۰ روز (بحرانی)</div>
                            <div class="text-2xl font-black text-red-600 mt-2">${data.days_0_30.quantity} عدد</div>
                            <div class="text-[11px] text-red-700 mt-1">${data.days_0_30.count} بچ | ${data.days_0_30.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>

                        <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                            <div class="text-xs font-bold text-amber-800">۳۱ تا ۶۰ روز (نزدیک انقضا)</div>
                            <div class="text-2xl font-black text-amber-600 mt-2">${data.days_31_60.quantity} عدد</div>
                            <div class="text-[11px] text-amber-700 mt-1">${data.days_31_60.count} بچ | ${data.days_31_60.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>

                        <div class="p-4 rounded-2xl bg-yellow-50 border border-yellow-200">
                            <div class="text-xs font-bold text-yellow-800">۶۱ تا ۹۰ روز</div>
                            <div class="text-2xl font-black text-yellow-600 mt-2">${data.days_61_90.quantity} عدد</div>
                            <div class="text-[11px] text-yellow-700 mt-1">${data.days_61_90.count} بچ | ${data.days_61_90.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>

                        <div class="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                            <div class="text-xs font-bold text-blue-800">۹۱ تا ۱۸۰ روز</div>
                            <div class="text-2xl font-black text-blue-600 mt-2">${data.days_91_180.quantity} عدد</div>
                            <div class="text-[11px] text-blue-700 mt-1">${data.days_91_180.count} بچ | ${data.days_91_180.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>

                        <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                            <div class="text-xs font-bold text-emerald-800">بیش از ۱۸۰ روز (سالم)</div>
                            <div class="text-2xl font-black text-emerald-600 mt-2">${data.days_180_plus.quantity} عدد</div>
                            <div class="text-[11px] text-emerald-700 mt-1">${data.days_180_plus.count} بچ | ${data.days_180_plus.costValue.toLocaleString('fa-IR')} ت</div>
                        </div>
                    </div>

                    <!-- Critical Alert Banner with 1-Click Promo Action -->
                    <div class="p-4 bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-rose-100">
                        <div>
                            <div class="font-bold text-sm flex items-center gap-2">
                                <i data-lucide="alert-octagon" class="w-5 h-5"></i>
                                <span>هشدار سرمایه در معرض سوخت شدن: ${data.days_0_30.count + data.days_31_60.count} بچ کالا تا ۶۰ روز آینده منقضی می‌شوند!</span>
                            </div>
                            <div class="text-xs text-rose-100 mt-1">ارزش خرید این کالاها ${(data.days_0_30.costValue + data.days_31_60.costValue).toLocaleString('fa-IR')} تومان است.</div>
                        </div>
                        <button onclick="inventory.createNearExpiryCampaign()" class="bg-white hover:bg-rose-50 text-rose-700 font-bold px-4 py-2.5 rounded-xl text-xs shadow transition whitespace-nowrap">
                            ایجاد خودکار کمپین حراج ۲۵٪ با پیامک
                        </button>
                    </div>

                    <!-- Detailed Critical Items Table -->
                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-slate-700 mb-3">کالاهای با اولویت ترخیص سریع (زیر ۶۰ روز تا انقضا)</h4>
                        <div class="divide-y divide-slate-100 text-xs">
                            ${[...data.days_0_30.items, ...data.days_31_60.items].map(it => `
                                <div class="py-2.5 flex items-center justify-between">
                                    <div>
                                        <span class="font-bold text-slate-800">${it.product_name}</span>
                                        <span class="text-slate-400">(${it.brand_name})</span>
                                        ${it.shade ? `<span class="text-purple-700 mr-2">شید: ${it.shade}</span>` : ''}
                                        <div class="text-[11px] text-slate-400 font-mono mt-0.5">شماره بچ: ${it.batch_number} | تاریخ انقضا: ${it.expiry_date}</div>
                                    </div>
                                    <div class="text-left">
                                        <span class="inline-block px-2.5 py-1 rounded-lg font-bold ${it.days_left <= 30 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">
                                            مانده: ${it.days_left} روز (${it.quantity} عدد)
                                        </span>
                                        <div class="text-[11px] text-slate-500 mt-0.5">ارزش خرید: ${(it.quantity * it.purchase_price).toLocaleString('fa-IR')} تومان</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در محاسبه تحلیل انقضا</div>';
        }
    },

    // 3. Testers View
    async renderTestersView(container) {
        try {
            const res = await fetch('/api/inventory/testers');
            const json = await res.json();
            const testers = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-right text-xs">
                        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th class="p-3.5">محصول و شید</th>
                                <th class="p-3.5">شماره بچ منبع</th>
                                <th class="p-3.5">تاریخ افتتاح تستر</th>
                                <th class="p-3.5 text-center">حجم باقیمانده</th>
                                <th class="p-3.5">وضعیت</th>
                                <th class="p-3.5">مسئول / متصدی</th>
                                <th class="p-3.5 text-center">عملیات</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${testers.map(t => `
                                <tr>
                                    <td class="p-3.5">
                                        <div class="font-bold text-slate-900">${t.product_name}</div>
                                        <div class="text-[11px] text-slate-400">${t.brand_name} ${t.shade ? `| شید: ${t.shade}` : ''}</div>
                                    </td>
                                    <td class="p-3.5 font-mono text-slate-600">${t.batch_number || '-'}</td>
                                    <td class="p-3.5 text-slate-600">${t.opened_at.split(' ')[0]}</td>
                                    <td class="p-3.5 text-center">
                                        <div class="w-24 mx-auto bg-slate-200 rounded-full h-2 overflow-hidden mb-1">
                                            <div class="bg-pink-600 h-2 rounded-full" style="width: ${t.remaining_percentage}%"></div>
                                        </div>
                                        <span class="text-[11px] font-bold text-pink-700">${t.remaining_percentage}٪</span>
                                    </td>
                                    <td class="p-3.5">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            t.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                        }">${t.status === 'ACTIVE' ? 'فعال روی استند' : t.status}</span>
                                    </td>
                                    <td class="p-3.5 text-slate-600">${t.employee_name || 'صندوق'}</td>
                                    <td class="p-3.5 text-center">
                                        <button onclick="inventory.editTester(${t.id}, ${t.remaining_percentage})" class="text-purple-600 hover:text-purple-800 text-xs font-medium">
                                            به‌روزرسانی
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت لیست تسترها</div>';
        }
    },

    // 4. Smart Reorder Suggestions View
    async renderReorderView(container) {
        try {
            const res = await fetch('/api/inventory/reorder-suggestions');
            const json = await res.json();
            const suggestions = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
                    <div class="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs leading-relaxed">
                        💡 <strong>الگوریتم پیشنهاد خرید:</strong> این فهرست بر اساس ترکیب <strong>آهنگ فروش روزانه ۳۰ روز گذشته</strong>، <strong>زمان تحویل تأمین‌کننده (Lead Time)</strong> و <strong>ذخیره احتیاطی</strong> برای هر کالا محاسبه شده است تا از اتمام موجودی (Out-of-Stock) جلوگیری شود.
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3">کالا و شید</th>
                                    <th class="p-3">موجودی فعلی</th>
                                    <th class="p-3">فروش روزانه</th>
                                    <th class="p-3">تحویل تأمین‌کننده</th>
                                    <th class="p-3 text-center">پیشنهاد سفارش</th>
                                    <th class="p-3">هزینه تخمینی</th>
                                    <th class="p-3">تأمین‌کننده</th>
                                    <th class="p-3 text-center">فوریت</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${suggestions.map(s => `
                                    <tr>
                                        <td class="p-3">
                                            <div class="font-bold text-slate-900">${s.productName}</div>
                                            <div class="text-[11px] text-slate-400">${s.brandName} ${s.shade ? `| شید: ${s.shade}` : ''}</div>
                                        </td>
                                        <td class="p-3 font-bold text-rose-600">${s.currentStock} عدد</td>
                                        <td class="p-3 text-slate-600">${s.dailySales} عدد در روز</td>
                                        <td class="p-3 text-slate-600">${s.leadTimeDays} روز</td>
                                        <td class="p-3 text-center">
                                            <span class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs">
                                                ${s.suggestedQuantity} عدد
                                            </span>
                                        </td>
                                        <td class="p-3 font-bold text-slate-800">${s.estimatedCost.toLocaleString('fa-IR')} تومان</td>
                                        <td class="p-3 text-slate-600">${s.supplierName || 'تأمین‌کننده اصلی'}</td>
                                        <td class="p-3 text-center">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                s.urgency === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                            }">${s.urgency === 'CRITICAL' ? 'فوری / اتمام' : 'بالا'}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در محاسبه پیشنهاد خرید</div>';
        }
    },

    // 5. Transactions Audit Log View
    async renderTransactionsView(container) {
        try {
            const res = await fetch('/api/inventory/transactions');
            const json = await res.json();
            const txs = json.data || [];

            container.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-right text-xs">
                        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th class="p-3">تاریخ و زمان</th>
                                <th class="p-3">نوع عملیات</th>
                                <th class="p-3">کالا و شید</th>
                                <th class="p-3 font-mono">بچ</th>
                                <th class="p-3 text-center">تعداد</th>
                                <th class="p-3">بهای واحد</th>
                                <th class="p-3">متصدی</th>
                                <th class="p-3">توضیحات</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${txs.map(t => `
                                <tr>
                                    <td class="p-3 text-slate-500 font-mono text-[11px]">${t.created_at}</td>
                                    <td class="p-3">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                            t.transaction_type === 'SALE' ? 'bg-blue-100 text-blue-800' :
                                            t.transaction_type === 'PURCHASE' ? 'bg-emerald-100 text-emerald-800' :
                                            t.transaction_type === 'TESTER' ? 'bg-pink-100 text-pink-800' : 'bg-slate-100 text-slate-800'
                                        }">${t.transaction_type}</span>
                                    </td>
                                    <td class="p-3 font-bold text-slate-800">${t.product_name} ${t.shade ? `(${t.shade})` : ''}</td>
                                    <td class="p-3 font-mono text-slate-600">${t.batch_number || '-'}</td>
                                    <td class="p-3 text-center font-bold ${t.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}">
                                        ${t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                                    </td>
                                    <td class="p-3 text-slate-700">${Number(t.unit_cost).toLocaleString('fa-IR')} ت</td>
                                    <td class="p-3 text-slate-600">${t.employee_name || 'سیستم'}</td>
                                    <td class="p-3 text-slate-500 text-[11px]">${t.note || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در بارگذاری گردش انبار</div>';
        }
    },

    // Convert stock to tester modal
    async openTesterModal() {
        try {
            const res = await fetch('/api/inventory/stock');
            const json = await res.json();
            const items = (json.data || []).filter(i => i.total_stock > 0);

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-2">تبدیل کالای انبار به تستر (Tester)</h3>
                <p class="text-xs text-slate-500 mb-4">با این عملیات، کالا از موجودی قابل فروش کسر شده، به تسترها اضافه می‌شود و سند حسابداری هزینه بازاریابی (کد ۶۰۴) صادر می‌گردد.</p>

                <div class="space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">انتخاب محصول و شید</label>
                        <select id="testerVariantSelect" onchange="inventory.loadVariantBatchesForTester(this.value)" class="w-full p-2.5 border border-slate-200 rounded-xl">
                            <option value="">-- انتخاب کنید --</option>
                            ${items.map(i => `
                                <option value="${i.variant_id}">${i.product_name_fa} (${i.brand_name}) - ${i.shade || 'استاندارد'}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div id="testerBatchSelectContainer" class="hidden">
                        <label class="block font-bold text-slate-700 mb-1">انتخاب سری ساخت / بچ کالا (پیشنهاد FEFO: بچ نزدیک‌تر به انقضا)</label>
                        <select id="testerBatchSelect" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono"></select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">یادداشت و محل استقرار تستر</label>
                        <input type="text" id="testerNote" placeholder="مثلاً: استند مرکزی شعبه ونک" class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>

                    <div class="flex justify-end gap-2 pt-2">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                        <button onclick="inventory.submitConvertTester()" class="bg-pink-600 hover:bg-pink-700 text-white font-bold px-5 py-2.5 rounded-xl transition">
                            ثبت تستر و صدور سند هزینه
                        </button>
                    </div>
                </div>
            `);
        } catch (e) {
            app.showNotification('خطا در آماده‌سازی فرم تستر', 'error');
        }
    },

    async loadVariantBatchesForTester(variantId) {
        if (!variantId) return;
        const container = document.getElementById('testerBatchSelectContainer');
        const select = document.getElementById('testerBatchSelect');
        const res = await fetch(`/api/inventory/batches/${variantId}`);
        const json = await res.json();
        const batches = json.data || [];

        select.innerHTML = batches.map(b => `
            <option value="${b.id}">بچ ${b.batch_number} | انقضا: ${b.expiry_date} (${b.days_until_expiry} روز مانده) | موجود: ${b.quantity} عدد</option>
        `).join('');
        container.classList.remove('hidden');
    },

    async submitConvertTester() {
        const variantId = document.getElementById('testerVariantSelect').value;
        const batchId = document.getElementById('testerBatchSelect').value;
        const note = document.getElementById('testerNote').value;

        if (!variantId || !batchId) {
            app.showNotification('لطفاً محصول و بچ را انتخاب کنید', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/inventory/convert-tester', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variantId: Number(variantId), batchId: Number(batchId), quantity: 1, note })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('کالا با موفقیت به تستر تبدیل شد و سند حسابداری دوبل ثبت گردید.', 'success');
                app.closeModal();
                this.switchTab('testers');
            } else {
                app.showNotification(json.error || 'خطا در تبدیل تستر', 'error');
            }
        } catch (e) {
            app.showNotification('خطای شبکه', 'error');
        }
    },

    // Batch Viewer Modal
    async viewBatches(variantId) {
        try {
            const res = await fetch(`/api/inventory/batches/${variantId}`);
            const json = await res.json();
            const batches = json.data || [];

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-3">سری‌های ساخت و تاریخ‌های انقضا (FEFO Log)</h3>
                <div class="space-y-3 max-h-80 overflow-y-auto">
                    ${batches.map(b => `
                        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                            <div>
                                <div class="font-bold text-slate-800 font-mono">بچ: ${b.batch_number}</div>
                                <div class="text-slate-500 mt-0.5">تولید: ${b.manufacture_date || '-'} | انقضا: ${b.expiry_date}</div>
                                <div class="text-[11px] text-slate-400">تأمین‌کننده: ${b.supplier_name || 'نامشخص'}</div>
                            </div>
                            <div class="text-left">
                                <span class="font-bold text-sm ${b.days_until_expiry <= 30 ? 'text-rose-600' : 'text-purple-700'}">
                                    ${b.quantity} عدد
                                </span>
                                <div class="text-[11px] text-slate-500">${b.days_until_expiry} روز مانده</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `);
        } catch (e) {
            app.showNotification('خطا در دریافت لیست بچ‌ها', 'error');
        }
    },

    async createNearExpiryCampaign() {
        try {
            const res = await fetch('/api/marketing/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'حراج ویژه اقلام نزدیک به انقضا (Clearance Sale)',
                    type: 'EXPIRING_STOCK',
                    channel: 'SMS',
                    targetSegment: 'مشتریان وفادار و خریداران قبلی برند',
                    discountPercent: 25,
                    budget: 1500000
                })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('کمپین حراج ۲۵٪ با موفقیت ایجاد شد و برای ارسال صف‌بندی گردید.', 'success');
            }
        } catch (e) {
            app.showNotification('خطا در ایجاد کمپین', 'error');
        }
    },

    // Stock Count Wizard (انبارگردانی)
    async openStockCountModal() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">شروع انبارگردانی فیزیکی (Stock Count)</h3>
            <p class="text-xs text-slate-500 mb-4">سیستم موجودی دفتری فعلی را منجمد کرده و امکان ورود شمارش واقعی و محاسبه مغایرت کسر/اضافه را فراهم می‌کند.</p>

            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">یادداشت انبارگردانی</label>
                    <input type="text" id="countNotes" placeholder="مثلاً: انبارگردانی پایان فصل شهریور ۱۴۰۵" class="w-full p-2.5 border border-slate-200 rounded-xl">
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                    <button onclick="inventory.startStockCount()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition">
                        ایجاد و ورود فرم شمارش
                    </button>
                </div>
            </div>
        `);
    },

    async startStockCount() {
        const notes = document.getElementById('countNotes')?.value || 'انبارگردانی دوره‌ای';
        try {
            const res = await fetch('/api/inventory/stock-count', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ warehouseId: 1, conductedBy: 5, notes })
            });
            const json = await res.json();
            if (json.success) {
                app.closeModal();
                this.openStockCountWorksheet(json.data.countId);
            }
        } catch (e) {
            app.showNotification('خطا در شروع انبارگردانی', 'error');
        }
    },

    async openStockCountWorksheet(countId) {
        try {
            const res = await fetch(`/api/inventory/stock-count/${countId}`);
            const json = await res.json();
            const details = json.data;

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-1">برگه انبارگردانی شماره #${details.id}</h3>
                <p class="text-xs text-slate-500 mb-3">شمارش فیزیکی واقعی هر قلم را در کادر مربوطه وارد نمایید:</p>

                <div class="space-y-3 max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                    ${details.items.map(it => `
                        <div class="pt-2.5 flex items-center justify-between gap-3">
                            <div class="flex-1">
                                <div class="font-bold text-slate-800">${it.product_name} (${it.brand_name})</div>
                                <div class="text-[11px] text-slate-400">بچ: ${it.batch_number} | موجودی دفتری: ${it.system_quantity} عدد</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-slate-500 text-[11px]">شمارش واقعی:</span>
                                <input type="number" value="${it.counted_quantity}" onchange="inventory.saveCountItem(${it.id}, this.value)" class="w-16 p-1.5 border border-slate-200 rounded-lg text-center font-bold">
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="pt-4 border-t border-slate-200 flex justify-between items-center">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-xs text-slate-600">ذخیره و ادامه بعداً</button>
                    <button onclick="inventory.finalizeCount(${countId})" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition">
                        تایید نهایی، اصلاح موجودی و صدور سند تعدیل
                    </button>
                </div>
            `);
        } catch (e) {
            app.showNotification('خطا در دریافت برگه انبارگردانی', 'error');
        }
    },

    async saveCountItem(itemId, val) {
        await fetch(`/api/inventory/stock-count/item/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countedQuantity: Number(val) })
        });
    },

    async finalizeCount(countId) {
        try {
            const res = await fetch(`/api/inventory/stock-count/${countId}/finalize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvedBy: 1 })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('انبارگردانی با موفقیت نهایی شد و اسناد تعدیل صادر گردید.', 'success');
                app.closeModal();
                this.loadTabContent();
            }
        } catch (e) {
            app.showNotification('خطا در نهایی‌سازی انبارگردانی', 'error');
        }
    }
};
