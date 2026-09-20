// CRM, Customer 360, Loyalty Club & RFM Client Module
const crm = {
    async init() {
        this.render();
        this.loadCustomers();
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="users" class="w-5 h-5 text-purple-600"></i>
                            <span>CRM ۳۶۰ درجه، باشگاه مشتریان و تحلیل RFM آرایشی</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">ثبت تاریخچه شیدهای رنگی خریداری شده، ترجیحات پوست و مو، کیف پول و پیشگیری از ریزش مشتریان</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <button onclick="crm.openFarazSmsModal()" class="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-orange-100 transition cursor-pointer">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>استخراج شماره‌ها (پنل فراز اس‌ام‌اس)</span>
                        </button>
                        <button onclick="crm.openImportModal()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                            <i data-lucide="file-up" class="w-4 h-4 text-purple-600"></i>
                            <span>دریافت فایل مشتریان</span>
                        </button>
                        <button onclick="crm.exportCustomersCsv()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                            <i data-lucide="download" class="w-4 h-4 text-slate-600"></i>
                            <span>خروجی اکسل عمومی</span>
                        </button>
                        <button onclick="crm.openBirthdaysModal()" class="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                            <i data-lucide="gift" class="w-4 h-4 text-pink-600"></i>
                            <span>متولدین ماه جاری</span>
                        </button>
                        <button onclick="crm.openNewCustomerModal()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer">
                            <i data-lucide="user-plus" class="w-4 h-4"></i>
                            <span>+ ثبت مشتری جدید</span>
                        </button>
                    </div>
                </div>

                <!-- RFM & Customer Segment Summary Cards with 1-Click Excel Download -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <!-- 1. خرید منظم و سبد بالا -->
                    <div class="p-3.5 bg-gradient-to-br from-purple-50 to-indigo-50/50 border border-purple-200 rounded-2xl flex flex-col justify-between hover:shadow-md transition">
                        <div onclick="crm.filterSegment('high_basket_regular')" class="cursor-pointer">
                            <div class="flex items-center justify-between text-slate-600 font-medium">
                                <span class="font-bold">مشتریان قهرمان (Champions)</span>
                                <span id="count_high_basket_regular" class="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full font-bold text-[10px] font-mono">-</span>
                            </div>
                            <div class="text-sm font-black text-purple-900 mt-1">خرید منظم و سبد بالا</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">پرتکرارترین خریدها با بالاترین ارزش فاکتور</div>
                        </div>
                        <div class="pt-3 mt-2 border-t border-purple-100/80 flex items-center justify-between gap-2">
                            <button onclick="crm.downloadSegmentExcel('high_basket_regular')" class="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black flex items-center justify-center gap-1.5 shadow-sm transition text-xs cursor-pointer">
                                <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                                <span>دانلود اکسل این دسته</span>
                            </button>
                        </div>
                    </div>

                    <!-- 2. تکرار خرید مداوم -->
                    <div class="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-2xl flex flex-col justify-between hover:shadow-md transition">
                        <div onclick="crm.filterSegment('regular_buyers')" class="cursor-pointer">
                            <div class="flex items-center justify-between text-slate-600 font-medium">
                                <span class="font-bold">مشتریان وفادار (Loyal)</span>
                                <span id="count_regular_buyers" class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] font-mono">-</span>
                            </div>
                            <div class="text-sm font-black text-emerald-900 mt-1">تکرار خرید مداوم</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">مشتریان راضی با چرخه خرید پیوسته و منظم</div>
                        </div>
                        <div class="pt-3 mt-2 border-t border-emerald-100/80 flex items-center justify-between gap-2">
                            <button onclick="crm.downloadSegmentExcel('regular_buyers')" class="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black flex items-center justify-center gap-1.5 shadow-sm transition text-xs cursor-pointer">
                                <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                                <span>دانلود اکسل این دسته</span>
                            </button>
                        </div>
                    </div>

                    <!-- 3. عدم مراجعه ۳۵ روزه -->
                    <div class="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200 rounded-2xl flex flex-col justify-between hover:shadow-md transition">
                        <div onclick="crm.filterSegment('absent_35_days')" class="cursor-pointer">
                            <div class="flex items-center justify-between text-slate-600 font-medium">
                                <span class="font-bold">در معرض ریزش (At Risk)</span>
                                <span id="count_absent_35_days" class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px] font-mono">-</span>
                            </div>
                            <div class="text-sm font-black text-amber-900 mt-1">عدم مراجعه بالای ۳۵ روز</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">مشتریان قبلی بدون خرید در ۳۵ روز اخیر</div>
                        </div>
                        <div class="pt-3 mt-2 border-t border-amber-100/80 flex items-center justify-between gap-2">
                            <button onclick="crm.downloadSegmentExcel('absent_35_days')" class="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black flex items-center justify-center gap-1.5 shadow-sm transition text-xs cursor-pointer">
                                <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                                <span>دانلود اکسل این دسته</span>
                            </button>
                        </div>
                    </div>

                    <!-- 4. مشتریان جدید و سایر موارد -->
                    <div class="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200 rounded-2xl flex flex-col justify-between hover:shadow-md transition">
                        <div onclick="crm.filterSegment('new_customers')" class="cursor-pointer">
                            <div class="flex items-center justify-between text-slate-600 font-medium">
                                <span class="font-bold">مشتریان جدید و غیره</span>
                                <span id="count_new_customers" class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[10px] font-mono">-</span>
                            </div>
                            <div class="text-sm font-black text-blue-900 mt-1">مشتریان جدید (New)</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">اعضای تازه ثبت‌نام و نیازمند پیگیری</div>
                        </div>
                        <div class="pt-3 mt-2 border-t border-blue-100/80 flex items-center justify-between gap-1.5">
                            <button onclick="crm.downloadSegmentExcel('new_customers')" class="flex-1 py-2 px-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black flex items-center justify-center gap-1 shadow-sm transition text-[11px] cursor-pointer">
                                <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5"></i>
                                <span>دانلود اکسل جدیدها</span>
                            </button>
                            <button onclick="crm.openOtherExportsMenu()" class="py-2 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-1 transition text-[11px] cursor-pointer shadow-xs" title="سایر خروجی‌های اکسل">
                                <i data-lucide="more-horizontal" class="w-4 h-4 text-purple-600"></i>
                                <span>سایر موارد...</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Customer Search & Filter Bar -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div class="relative flex-1 w-full">
                        <i data-lucide="search" class="w-4 h-4 absolute right-3 top-2.5 text-slate-400"></i>
                        <input type="text" id="crmSearchInput" oninput="crm.handleSearch(event)" placeholder="جستجوی نام مشتری، شماره موبایل یا کد اشتراک..." class="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-purple-600 transition">
                    </div>

                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <select id="crmTierFilter" onchange="crm.applyFilters()" class="p-2 border border-slate-200 rounded-xl bg-white font-medium">
                            <option value="">همه سطوح وفاداری</option>
                            <option value="VIP">سطح VIP</option>
                            <option value="GOLD">سطح طلایی (Gold)</option>
                            <option value="SILVER">سطح نقره‌ای (Silver)</option>
                            <option value="BRONZE">سطح برنزی (Bronze)</option>
                        </select>

                        <select id="crmSegmentFilter" onchange="crm.applyFilters()" class="p-2 border border-slate-200 rounded-xl bg-white font-medium">
                            <option value="">همه سگمنت‌ها</option>
                            <option value="high_basket_regular">خرید منظم و سبد بالا (قهرمانان)</option>
                            <option value="regular_buyers">تکرار خرید مداوم (وفادار)</option>
                            <option value="absent_35_days">عدم مراجعه بالای ۳۵ روز (در معرض ریزش)</option>
                            <option value="new_customers">مشتریان جدید (New)</option>
                            <option value="wallet_balance">دارای مانده کیف پول</option>
                            <option value="vip_gold">سطح VIP و طلایی</option>
                        </select>
                    </div>
                </div>

                <!-- Customer Table -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="customerTableContainer">
                    <div class="py-12 text-center text-slate-400">در حال بارگذاری اطلاعات مشتریان...</div>
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    async loadCustomers() {
        try {
            const res = await fetch('/api/crm/customers');
            const json = await res.json();
            this.customers = json.data || [];
            this.filteredCustomers = [...this.customers];
            this.renderCustomerTable();
            this.loadSegmentCounts();
        } catch (e) {
            document.getElementById('customerTableContainer').innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت لیست مشتریان</div>';
        }
    },

    async loadSegmentCounts() {
        try {
            const res = await fetch('/api/crm/segment-counts');
            const json = await res.json();
            if (json.success && json.data) {
                const c = json.data;
                const elHigh = document.getElementById('count_high_basket_regular');
                if (elHigh) elHigh.textContent = (c.high_basket_regular || 0) + ' مشتری';

                const elLoyal = document.getElementById('count_regular_buyers');
                if (elLoyal) elLoyal.textContent = (c.regular_buyers || 0) + ' مشتری';

                const elAbsent = document.getElementById('count_absent_35_days');
                if (elAbsent) elAbsent.textContent = (c.absent_35_days || 0) + ' مشتری';

                const elNew = document.getElementById('count_new_customers');
                if (elNew) elNew.textContent = (c.new_customers || 0) + ' مشتری';
            }
        } catch (e) {
            console.warn('Failed to load segment counts', e);
        }
    },

    renderCustomerTable() {
        const container = document.getElementById('customerTableContainer');
        if (!container) return;

        if (!this.filteredCustomers || this.filteredCustomers.length === 0) {
            container.innerHTML = '<div class="py-12 text-center text-slate-400">مشتری با این مشخصات یافت نشد</div>';
            return;
        }

        container.innerHTML = `
            <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px]">
                    <tr>
                        <th class="p-3.5">نام و شماره تماس</th>
                        <th class="p-3.5">سطح وفاداری</th>
                        <th class="p-3.5 text-center">امتیاز باشگاه</th>
                        <th class="p-3.5">موجودی کیف پول</th>
                        <th class="p-3.5 text-center">تعداد سفارش</th>
                        <th class="p-3.5">مجموع خرید</th>
                        <th class="p-3.5">بخش‌بندی RFM</th>
                        <th class="p-3.5 text-center">عملیات</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${this.filteredCustomers.map(c => `
                        <tr class="hover:bg-slate-50/80 transition">
                            <td class="p-3.5">
                                <div class="font-bold text-slate-900">${c.full_name}</div>
                                <div class="text-[11px] text-slate-400 font-mono">${c.mobile}</div>
                                ${c.skin_type ? `<span class="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">پوست: ${c.skin_type}</span>` : ''}
                            </td>
                            <td class="p-3.5">
                                <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                    c.loyalty_tier === 'VIP' ? 'bg-amber-100 text-amber-800' :
                                    c.loyalty_tier === 'GOLD' ? 'bg-yellow-100 text-yellow-800' :
                                    c.loyalty_tier === 'SILVER' ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-800'
                                }">${c.loyalty_tier}</span>
                            </td>
                            <td class="p-3.5 text-center font-bold text-purple-700 font-mono">
                                ${c.loyalty_points || 0} امتیاز
                            </td>
                            <td class="p-3.5 font-bold font-mono text-emerald-600">
                                ${Number(c.wallet_balance || 0).toLocaleString('fa-IR')} تومان
                            </td>
                            <td class="p-3.5 text-center font-bold text-slate-800 font-mono">
                                ${c.total_orders_count || 0}
                            </td>
                            <td class="p-3.5 font-bold font-mono text-slate-900">
                                ${Number(c.total_spent || 0).toLocaleString('fa-IR')} ت
                            </td>
                            <td class="p-3.5">
                                <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                    c.rfm_segment === 'Champions' ? 'bg-purple-100 text-purple-800' :
                                    c.rfm_segment === 'Loyal' ? 'bg-emerald-100 text-emerald-800' :
                                    c.rfm_segment === 'At Risk' ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-slate-100 text-slate-700'
                                }">
                                    ${c.rfm_segment || 'New'}
                                </span>
                            </td>
                            <td class="p-3.5 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    <button onclick="crm.openProfile360(${c.id})" class="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg transition text-[11px]" title="مشاهده پروفایل ۳۶۰ و شیدها">
                                        ۳۶۰°
                                    </button>
                                    <button onclick="crm.openWalletModal(${c.id}, '${c.full_name.replace(/'/g, "\\'")}', ${c.wallet_balance || 0})" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg transition text-[11px]" title="شارژ کیف پول">
                                        کیف پول
                                    </button>
                                    <button onclick="crm.openEditCustomerModal(${JSON.stringify(c).replace(/"/g, '&quot;')})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition text-[11px]" title="ویرایش">
                                        ویرایش
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        lucide.createIcons();
    },

    handleSearch(e) {
        this.applyFilters();
    },

    filterSegment(segment) {
        const el = document.getElementById('crmSegmentFilter');
        if (el) el.value = segment;
        this.applyFilters();
    },

    applyFilters() {
        const q = (document.getElementById('crmSearchInput')?.value || '').trim().toLowerCase();
        const tier = document.getElementById('crmTierFilter')?.value || '';
        const seg = document.getElementById('crmSegmentFilter')?.value || '';

        this.filteredCustomers = this.customers.filter(c => {
            const matchesQ = !q || 
                (c.full_name && c.full_name.toLowerCase().includes(q)) || 
                (c.mobile && c.mobile.includes(q)) || 
                (c.referral_code && c.referral_code.toLowerCase().includes(q)) ||
                (c.customer_code && c.customer_code.toLowerCase().includes(q));

            const matchesTier = !tier || c.loyalty_tier === tier;

            let matchesSeg = true;
            if (seg === 'high_basket_regular' || seg === 'Champions') {
                matchesSeg = c.rfm_segment === 'Champions' || (c.total_orders_count >= 2 && c.total_spent >= 2000000 && (c.days_since_last_order === null || c.days_since_last_order <= 35));
            } else if (seg === 'regular_buyers' || seg === 'Loyal') {
                matchesSeg = c.rfm_segment === 'Loyal' || (c.total_orders_count >= 2 && (c.days_since_last_order === null || c.days_since_last_order <= 60));
            } else if (seg === 'absent_35_days' || seg === 'At Risk') {
                matchesSeg = (c.total_orders_count > 0 && c.days_since_last_order !== null && c.days_since_last_order >= 35) || c.rfm_segment === 'At Risk';
            } else if (seg === 'new_customers' || seg === 'New') {
                matchesSeg = c.total_orders_count <= 1 || c.rfm_segment === 'New' || c.rfm_segment === 'NEW';
            } else if (seg === 'wallet_balance') {
                matchesSeg = Number(c.wallet_balance || 0) > 0;
            } else if (seg === 'vip_gold') {
                matchesSeg = c.loyalty_tier === 'VIP' || c.loyalty_tier === 'GOLD';
            } else if (seg) {
                matchesSeg = c.rfm_segment === seg;
            }

            return matchesQ && matchesTier && matchesSeg;
        });

        this.renderCustomerTable();
    },

    // 1-Click Excel Download for Specific Customer Segment
    async downloadSegmentExcel(segmentKey) {
        try {
            app.showNotification('در حال آماده‌سازی و دانلود فایل اکسل...', 'info');
            const res = await fetch(`/api/crm/export-segment/csv?segment=${segmentKey}`);
            if (!res.ok) throw new Error('خطا در دریافت فایل اکسل از سرور');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            const disposition = res.headers.get('content-disposition') || '';
            let filename = `مشتریان_${segmentKey}.csv`;
            const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            if (utf8Match && utf8Match[1]) {
                filename = decodeURIComponent(utf8Match[1]);
            } else {
                const asciiMatch = disposition.match(/filename="([^"]+)"/i);
                if (asciiMatch && asciiMatch[1]) filename = asciiMatch[1];
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 1000);

            app.showNotification('فایل اکسل مشتریان با موفقیت دانلود شد', 'success');
        } catch (err) {
            app.showNotification('خطا در دانلود فایل اکسل: ' + err.message, 'error');
        }
    },

    // Export Currently Filtered Customers to Excel CSV
    exportCustomersCsv() {
        const list = this.filteredCustomers || this.customers || [];
        if (list.length === 0) {
            app.showNotification('هیچ رکوردی برای خروجی اکسل وجود ندارد', 'warning');
            return;
        }

        const headers = [
            'ردیف',
            'کد اشتراک',
            'نام و نام خانوادگی',
            'شماره همراه',
            'دسته‌بندی / سگمنت',
            'سطح وفاداری',
            'مانده کیف پول (تومان)',
            'امتیاز باشگاه',
            'تعداد سفارش‌ها',
            'مجموع خرید (تومان)',
            'میانگین هر خرید (تومان)',
            'تاریخ آخرین خرید',
            'روزهای سپری‌شده',
            'نوع پوست',
            'ترجیحات مو / یادداشت'
        ];

        let csv = '\uFEFF' + headers.join(',') + '\r\n';
        list.forEach((c, idx) => {
            const row = [
                idx + 1,
                `"${(c.referral_code || c.customer_code || ('CUST-' + c.id)).replace(/"/g, '""')}"`,
                `"${(c.full_name || '').replace(/"/g, '""')}"`,
                `"${c.mobile || ''}"`,
                `"${(c.rfm_segment || 'عادی').replace(/"/g, '""')}"`,
                `"${c.loyalty_tier || 'BRONZE'}"`,
                Number(c.wallet_balance || 0),
                Number(c.loyalty_points || 0),
                Number(c.total_orders_count || 0),
                Number(c.total_spent || 0),
                Math.round(Number(c.average_order_value || 0)),
                `"${c.last_order_date || '-'}"`,
                c.days_since_last_order !== null && c.days_since_last_order !== undefined ? c.days_since_last_order : '-',
                `"${(c.skin_type || '-').replace(/"/g, '""')}"`,
                `"${(c.notes || c.hair_preferences || '-').replace(/"/g, '""')}"`
            ];
            csv += row.join(',') + '\r\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `لیست_مشتریان_انتخابی_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 1000);
        app.showNotification(`خروجی اکسل ${list.length} مشتری با موفقیت دانلود شد`, 'success');
    },

    // Modal: Other Excel Export Segments
    openOtherExportsMenu() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
                <span>سایر خروجی‌های اکسل مشتریان (دسته‌های اختصاصی)</span>
            </h3>
            <p class="text-xs text-slate-500 mb-4">برای دانلود اکسل هر دسته، روی گزینه مورد نظر کلیک فرمایید:</p>

            <div class="space-y-3 text-xs">
                <div class="p-3 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-xl flex items-center justify-between transition cursor-pointer" onclick="crm.downloadSegmentExcel('wallet_balance'); app.closeModal();">
                    <div>
                        <div class="font-bold text-emerald-900 text-sm">اکسل مشتریان دارای مانده کیف پول</div>
                        <div class="text-[11px] text-emerald-700 mt-0.5">شامل مشتریانی که شارژ و بستانکاری نقدی در کیف پول دارند</div>
                    </div>
                    <button class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i>
                        <span>دانلود اکسل</span>
                    </button>
                </div>

                <div class="p-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 rounded-xl flex items-center justify-between transition cursor-pointer" onclick="crm.downloadSegmentExcel('vip_gold'); app.closeModal();">
                    <div>
                        <div class="font-bold text-amber-900 text-sm">اکسل مشتریان سطح VIP و طلایی (Gold)</div>
                        <div class="text-[11px] text-amber-700 mt-0.5">ویژه ارائه آفرها و خدمات ویژه به مشتریان رده‌بالا</div>
                    </div>
                    <button class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-1">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i>
                        <span>دانلود اکسل</span>
                    </button>
                </div>

                <div class="p-3 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 rounded-xl flex items-center justify-between transition cursor-pointer" onclick="crm.downloadSegmentExcel('all'); app.closeModal();">
                    <div>
                        <div class="font-bold text-purple-900 text-sm">اکسل جامع کل مشتریان فروشگاه</div>
                        <div class="text-[11px] text-purple-700 mt-0.5">دریافت دیتابیس کامل اعضای باشگاه با کلیه مشخصات</div>
                    </div>
                    <button class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold flex items-center gap-1">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i>
                        <span>دانلود اکسل</span>
                    </button>
                </div>
            </div>

            <div class="flex justify-end pt-4 border-t border-slate-100 mt-4">
                <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition">بستن</button>
            </div>
        `);
        lucide.createIcons();
    },


    // Customer 360 Modal
    async openProfile360(customerId) {
        try {
            const res = await fetch(`/api/crm/customers/${customerId}`);
            const json = await res.json();
            const c = json.data;

            app.openModal(`
                <div class="space-y-6 text-xs">
                    <!-- Top Summary Card -->
                    <div class="p-4 bg-gradient-to-r from-purple-700 to-pink-600 rounded-2xl text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-lg">
                                ${c.full_name.slice(0, 1)}
                            </div>
                            <div>
                                <h3 class="text-base font-bold flex items-center gap-2">
                                    <span>${c.full_name}</span>
                                    <span class="text-xs bg-white/30 px-2 py-0.5 rounded-full">${c.loyalty_tier}</span>
                                </h3>
                                <p class="text-xs text-purple-100 mt-0.5 font-mono">${c.mobile} | عضو از: ${c.membership_date}</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-4 text-left">
                            <div>
                                <div class="text-[10px] text-purple-200">ارزش طول عمر (CLV)</div>
                                <div class="text-sm font-bold font-mono">${Number(c.clv).toLocaleString('fa-IR')} ت</div>
                            </div>
                            <div class="border-r border-white/20 pr-4">
                                <div class="text-[10px] text-purple-200">کیف پول</div>
                                <div class="text-sm font-bold font-mono text-amber-200">${Number(c.wallet_balance).toLocaleString('fa-IR')} ت</div>
                            </div>
                        </div>
                    </div>

                    <!-- Cosmetic Preferences & Favorite Brand -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span class="text-slate-400">نوع پوست:</span>
                            <div class="font-bold text-slate-800 mt-0.5">${c.skin_type || 'ثبت نشده'}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span class="text-slate-400">ترجیحات مو:</span>
                            <div class="font-bold text-slate-800 mt-0.5">${c.hair_preferences || 'ثبت نشده'}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span class="text-slate-400">برند محبوب مشتری:</span>
                            <div class="font-bold text-purple-700 mt-0.5">${c.favoriteBrand}</div>
                        </div>
                    </div>

                    <!-- Previously Purchased Shades (خیلی حیاتی برای مغازه آرایشی!) -->
                    <div class="p-4 bg-white border border-slate-200 rounded-2xl">
                        <h4 class="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                            <i data-lucide="palette" class="w-4 h-4 text-purple-600"></i>
                            <span>شیدهای رنگی خریداری‌شده در فاکتورهای گذشته:</span>
                        </h4>
                        ${c.purchasedShades.length > 0 ? `
                            <div class="flex flex-wrap gap-2 pt-1">
                                ${c.purchasedShades.map(s => `
                                    <div class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                                        <span class="shade-swatch" style="background-color: ${s.color_hex || '#ccc'}"></span>
                                        <div>
                                            <div class="font-bold text-slate-800 text-[11px]">${s.product_name} (${s.brand_name})</div>
                                            <div class="text-[10px] text-purple-700 font-medium">${s.shade}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div class="text-slate-400 py-2">هنوز سابقه خریدی برای شیدهای رنگی ثبت نشده است</div>'}
                    </div>

                    <!-- Wishlist & Point Conversion -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <!-- Points to Wallet -->
                        <div class="p-3.5 bg-purple-50/50 border border-purple-200 rounded-2xl flex flex-col justify-between">
                            <div>
                                <h5 class="font-bold text-purple-900 mb-1">تبدیل امتیاز وفاداری به کیف پول</h5>
                                <p class="text-[11px] text-purple-700 mb-3">امتیاز فعلی: <strong>${c.loyalty_points} امتیاز</strong> (هر ۱۰ امتیاز = ۵,۰۰۰ تومان اعتبار)</p>
                            </div>
                            <button onclick="crm.convertPoints(${c.id}, ${c.loyalty_points})" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl text-xs transition">
                                تبدیل تمام امتیازات به شارژ کیف پول
                            </button>
                        </div>

                        <!-- Wishlist -->
                        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                            <h5 class="font-bold text-slate-800 mb-2">لیست علاقه‌مندی‌ها (Wishlist):</h5>
                            <div class="space-y-1.5 max-h-28 overflow-y-auto">
                                ${c.wishlist.map(w => `
                                    <div class="flex justify-between items-center text-[11px]">
                                        <span>${w.product_name} (${w.brand_name})</span>
                                        <span class="${w.in_stock_qty > 0 ? 'text-emerald-600 font-bold' : 'text-rose-500'}">
                                            ${w.in_stock_qty > 0 ? `موجود (${w.in_stock_qty} عدد)` : 'ناموجود'}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `);
            lucide.createIcons();
        } catch (e) {
            app.showNotification('خطا در دریافت پروفایل ۳۶۰', 'error');
        }
    },

    async convertPoints(customerId, points) {
        if (points < 10) {
            app.showNotification('حداقل ۱۰ امتیاز برای تبدیل نیاز است', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/crm/convert-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId, points })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`مبلغ ${json.data.cashValue.toLocaleString('fa-IR')} تومان به کیف پول مشتری شارژ شد.`, 'success');
                app.closeModal();
                this.loadCustomers();
            }
        } catch (e) {
            app.showNotification('خطا در تبدیل امتیاز', 'error');
        }
    },

    // Birthdays Modal
    async openBirthdaysModal() {
        try {
            const res = await fetch('/api/crm/birthdays');
            const json = await res.json();
            const list = json.data || [];

            app.openModal(`
                <h3 class="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <i data-lucide="gift" class="w-5 h-5 text-pink-600"></i>
                    <span>متولدین ماه جاری (کمپین تخفیف تولد)</span>
                </h3>
                <p class="text-xs text-slate-500 mb-4">برای این مشتریان کد تخفیف اختصاصی تولد و پیامک تبریک آماده ارسال است:</p>

                <div class="space-y-3 max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                    ${list.map(c => `
                        <div class="pt-2.5 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-slate-900">${c.full_name}</div>
                                <div class="text-slate-500 mt-0.5">${c.mobile} | متولد: روز ${c.birth_day} این ماه</div>
                            </div>
                            <span class="px-2.5 py-1 bg-pink-50 text-pink-700 font-bold rounded-lg">
                                کدتخفیف BDAY15
                            </span>
                        </div>
                    `).join('')}
                </div>

                <div class="pt-4 border-t border-slate-200 flex justify-end">
                    <button onclick="app.showNotification('پیامک‌های تبریک تولد به همراه کد تخفیف با موفقیت ارسال شدند.', 'success'); app.closeModal();" class="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2 rounded-xl font-bold text-xs transition">
                        ارسال پیامک تبریک گروهی به متولدین
                    </button>
                </div>
            `);
            lucide.createIcons();
        } catch (e) {
            app.showNotification('خطا در دریافت متولدین ماه', 'error');
        }
    },

    // New Customer Modal
    openNewCustomerModal() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">ثبت مشتری جدید فروشگاه</h3>
            <p class="text-xs text-slate-500 mb-4">اطلاعات هویتی و ترجیحات زیبایی مشتری را وارد نمایید:</p>

            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">نام و نام خانوادگی</label>
                    <input type="text" id="newCustName" placeholder="مثلاً: هانیه سلیمانی" class="w-full p-2.5 border border-slate-200 rounded-xl font-medium">
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">شماره همراه</label>
                    <input type="tel" id="newCustMobile" placeholder="0912..." class="w-full p-2.5 border border-slate-200 rounded-xl font-mono">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نوع پوست</label>
                        <select id="newCustSkin" class="w-full p-2.5 border border-slate-200 rounded-xl">
                            <option value="چرب و مستعد جوش">چرب و مستعد جوش</option>
                            <option value="خشک و دهیدراته">خشک و دهیدراته</option>
                            <option value="مختلط و حساس">مختلط و حساس</option>
                            <option value="معمولی">معمولی</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">تاریخ تولد</label>
                        <input type="date" id="newCustBirth" class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">ترجیحات یا مشکلات مو</label>
                    <input type="text" id="newCustHair" placeholder="مثلاً: رنگ شده و کراتینه" class="w-full p-2.5 border border-slate-200 rounded-xl">
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                    <button onclick="crm.submitNewCustomer()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition">
                        عضویت در باشگاه و ذخیره
                    </button>
                </div>
            </div>
        `);
    },

    async submitNewCustomer() {
        const fullName = document.getElementById('newCustName').value;
        const mobile = document.getElementById('newCustMobile').value;
        const skinType = document.getElementById('newCustSkin').value;
        const birthDate = document.getElementById('newCustBirth').value;
        const hairPreferences = document.getElementById('newCustHair').value;

        if (!fullName || !mobile) {
            app.showNotification('نام و شماره همراه الزامی است', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/crm/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, mobile, skinType, birthDate, hairPreferences })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('مشتری با موفقیت عضو باشگاه شد و کد معرف اختصاص یافت.', 'success');
                app.closeModal();
                this.loadCustomers();
            } else {
                app.showNotification(json.error || 'شماره همراه تکراری است', 'error');
            }
        } catch (e) {
            app.showNotification('خطا در ثبت مشتری', 'error');
        }
    },

    // Modal: Edit Customer
    openEditCustomerModal(c) {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">ویرایش مشخصات مشتری: ${c.full_name}</h3>
            <div class="space-y-4 text-xs">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نام و نام خانوادگی</label>
                        <input type="text" id="ecName" value="${c.full_name}" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">شماره همراه</label>
                        <input type="text" id="ecMobile" value="${c.mobile}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">سطح وفاداری</label>
                        <select id="ecTier" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                            <option value="BRONZE" ${c.loyalty_tier === 'BRONZE' ? 'selected' : ''}>برنزی (Bronze)</option>
                            <option value="SILVER" ${c.loyalty_tier === 'SILVER' ? 'selected' : ''}>نقره‌ای (Silver)</option>
                            <option value="GOLD" ${c.loyalty_tier === 'GOLD' ? 'selected' : ''}>طلایی (Gold)</option>
                            <option value="VIP" ${c.loyalty_tier === 'VIP' ? 'selected' : ''}>VIP ویژه</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">امتیاز باشگاه</label>
                        <input type="number" id="ecPoints" value="${c.loyalty_points || 0}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-center font-bold text-purple-700">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نوع پوست</label>
                        <input type="text" id="ecSkin" value="${c.skin_type || ''}" placeholder="چرب، خشک، مختلط..." class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نوع مو</label>
                        <input type="text" id="ecHair" value="${c.hair_type || ''}" placeholder="کراتینه، رنگ شده..." class="w-full p-2.5 border border-slate-200 rounded-xl">
                    </div>
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="crm.submitEditCustomer(${c.id})" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition">
                        ذخیره تغییرات
                    </button>
                </div>
            </div>
        `);
    },

    async submitEditCustomer(id) {
        const fullName = document.getElementById('ecName')?.value.trim();
        const mobile = document.getElementById('ecMobile')?.value.trim();
        const loyaltyTier = document.getElementById('ecTier')?.value;
        const loyaltyPoints = Number(document.getElementById('ecPoints')?.value) || 0;
        const skinType = document.getElementById('ecSkin')?.value.trim();
        const hairType = document.getElementById('ecHair')?.value.trim();

        try {
            const res = await fetch(`/api/crm/customers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, mobile, loyaltyTier, loyaltyPoints, skinType, hairType })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification('مشخصات مشتری به‌روزرسانی شد.', 'success');
                app.closeModal();
                await this.loadCustomers();
            }
        } catch (e) {
            app.showNotification('خطا در به‌روزرسانی مشتری', 'error');
        }
    },

    // Modal: Wallet Adjustment
    openWalletModal(id, name, currentBalance) {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">مدیریت کیف پول: ${name}</h3>
            <div class="space-y-4 text-xs">
                <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <span class="font-bold text-emerald-800">موجودی فعلی کیف پول:</span>
                    <span class="font-mono font-bold text-emerald-900 text-sm">${Number(currentBalance).toLocaleString('fa-IR')} تومان</span>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نوع عملیات</label>
                        <select id="wType" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-medium">
                            <option value="CREDIT">افزایش اعتبار (شارژ)</option>
                            <option value="DEBIT">کاهش اعتبار (برداشت)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">مبلغ تراکنش (تومان)</label>
                        <input type="number" id="wAmount" placeholder="100000" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-emerald-700">
                    </div>
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">علت و بابت</label>
                    <input type="text" id="wNote" placeholder="شارژ هدیه، عودت وجه یا پرداخت دستی..." class="w-full p-2.5 border border-slate-200 rounded-xl">
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="crm.submitAdjustWallet(${id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition">
                        اعمال تراکنش کیف پول
                    </button>
                </div>
            </div>
        `);
    },

    async submitAdjustWallet(id) {
        const type = document.getElementById('wType')?.value || 'CREDIT';
        const amount = Number(document.getElementById('wAmount')?.value) || 0;
        const note = document.getElementById('wNote')?.value.trim();

        if (amount <= 0) {
            app.showNotification('لطفاً مبلغ معتبر وارد کنید', 'warning');
            return;
        }

        try {
            const res = await fetch(`/api/crm/customers/${id}/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, amount, note })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`موجودی کیف پول با موفقیت به‌روزرسانی شد. مانده جدید: ${Number(json.data.newBalance).toLocaleString('fa-IR')} تومان`, 'success');
                app.closeModal();
                await this.loadCustomers();
            }
        } catch (e) {
            app.showNotification('خطا در اعمال تراکنش کیف پول', 'error');
        }
    },

    // Modal: Import Customers
    openImportModal() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">دریافت فایل و افزودن دسته‌جمعی مشتریان</h3>
            <p class="text-xs text-slate-500 mb-4">شماره‌ها و نام‌های مشتریان را از فایل CSV یا متن وارد کنید تا به باشگاه اضافه شوند.</p>

            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">متن یا محتوای فایل (هر سطر: نام,شماره یا فقط شماره):</label>
                    <textarea id="importCustText" rows="6" placeholder="مریم رضایی,09121112233&#10;سارا علوی,09192223344&#10;09353334455" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono"></textarea>
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="crm.submitImportCustomers()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        <span>شروع ورود اطلاعات</span>
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    async submitImportCustomers() {
        const text = document.getElementById('importCustText')?.value;
        if (!text || !text.trim()) {
            app.showNotification('لطفاً اطلاعات را وارد کنید', 'warning');
            return;
        }

        const lines = text.split(/\r?\n/);
        const list = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/[,;\t]/).map(p => p.trim());
            if (parts.length >= 2) {
                if (/^0?9\d{9}$/.test(parts[0].replace(/\s+/g, ''))) {
                    list.push({ mobile: parts[0], name: parts[1] });
                } else {
                    list.push({ name: parts[0], mobile: parts[1] });
                }
            } else {
                list.push({ mobile: trimmed });
            }
        }

        try {
            const res = await fetch('/api/crm/customers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customers: list })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`تعداد ${json.data.inserted} مشتری جدید ثبت شد (${json.data.skipped} شماره تکراری رد شد).`, 'success');
                app.closeModal();
                await this.loadCustomers();
            }
        } catch (e) {
            app.showNotification('خطا در ورود اطلاعات مشتریان', 'error');
        }
    },

    exportCustomersCsv() {
        if (!this.customers || this.customers.length === 0) {
            app.showNotification('اطلاعاتی برای خروجی وجود ندارد', 'warning');
            return;
        }

        let csv = 'کد اشتراک,نام و نام خانوادگی,شماره همراه,سطح وفاداری,امتیاز,کیف پول,تعداد سفارش,مجموع خرید,سگمنت RFM\n';
        for (const c of this.customers) {
            csv += `"${c.customer_code || ''}","${c.full_name || ''}","${c.mobile || ''}","${c.loyalty_tier || ''}",${c.loyalty_points || 0},${c.wallet_balance || 0},${c.total_orders_count || 0},${c.total_spent || 0},"${c.rfm_segment || ''}"\n`;
        }

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_keyhan_beauty_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        app.showNotification('فایل اکسل مشتریان دانلود شد', 'success');
    },

    // =========================================================
    // FARAZ SMS / IPPANEL PHONEBOOK & BULK EXTRACTION SUITE
    // =========================================================
    async openFarazSmsModal() {
        this.smsContactsData = null;
        this.currentSmsPreset = 'ALL';

        app.openModal(`
            <div class="space-y-4 text-xs">
                <!-- Modal Title -->
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shadow-inner">
                            <i data-lucide="message-square-share" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-sm text-slate-900">استخراج هوشمند شماره‌ها ویژه پنل پیامکی فراز اس‌ام‌اس (Faraz SMS)</h3>
                            <p class="text-[11px] text-slate-500">فیلتر کاستوم مشتریان، پاک‌سازی شماره‌ها و دریافت خروجی اکسل یا کپی مستقیم برای ارسال پیامک انبوه</p>
                        </div>
                    </div>
                </div>

                <!-- Quick Presets -->
                <div>
                    <label class="block font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500"></i>
                        <span>سناریوها و دسته‌بندی‌های سریع پیامک انبوه:</span>
                    </label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <button type="button" onclick="crm.applySmsPreset('ALL')" id="smsPreset_ALL" class="sms-preset-btn p-2 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>👥 همه مشتریان معتبر</span>
                            <span class="text-[9px] bg-white px-1.5 py-0.5 rounded text-amber-700 font-mono">کل</span>
                        </button>
                        <button type="button" onclick="crm.applySmsPreset('VIP_GOLD')" id="smsPreset_VIP_GOLD" class="sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>👑 مشتریان VIP و طلایی</span>
                            <span class="text-[9px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">خاص</span>
                        </button>
                        <button type="button" onclick="crm.applySmsPreset('LOYAL')" id="smsPreset_LOYAL" class="sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>🌟 مشتریان وفادار (تکرار خرید)</span>
                            <span class="text-[9px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">وفادار</span>
                        </button>
                        <button type="button" onclick="crm.applySmsPreset('AT_RISK')" id="smsPreset_AT_RISK" class="sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>⚠️ در معرض ریزش (>۴۵ روز)</span>
                            <span class="text-[9px] bg-rose-100 px-1.5 py-0.5 rounded text-rose-800">یادآوری</span>
                        </button>
                        <button type="button" onclick="crm.applySmsPreset('DORMANT')" id="smsPreset_DORMANT" class="sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>💤 غیرفعال (>۹۰ روز بدون خرید)</span>
                            <span class="text-[9px] bg-purple-100 px-1.5 py-0.5 rounded text-purple-800">کمپین بازگشت</span>
                        </button>
                        <button type="button" onclick="crm.applySmsPreset('WALLET')" id="smsPreset_WALLET" class="sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between">
                            <span>💰 دارای مانده کیف پول</span>
                            <span class="text-[9px] bg-blue-100 px-1.5 py-0.5 rounded text-blue-800">خرج اعتبار</span>
                        </button>
                    </div>
                </div>

                <!-- Custom Filters Accordion / Box -->
                <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                            <i data-lucide="sliders" class="w-3.5 h-3.5 text-slate-500"></i>
                            <span>تنظیمات کاستوم و فیلترهای دلخواه:</span>
                        </span>
                        <button type="button" onclick="crm.resetSmsFilters()" class="text-[10px] text-slate-500 hover:text-purple-700 font-bold cursor-pointer">بازنشانی فیلترها</button>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <!-- Tier -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">سطح وفاداری مشتری</label>
                            <select id="smsFilterTier" onchange="crm.applySmsFilters()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                                <option value="">همه سطوح</option>
                                <option value="VIP">سطح VIP</option>
                                <option value="GOLD">سطح طلایی (Gold)</option>
                                <option value="SILVER">سطح نقره‌ای (Silver)</option>
                                <option value="BRONZE">سطح برنزی (Bronze)</option>
                            </select>
                        </div>

                        <!-- RFM Segment -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">سگمنت رفتار خرید (RFM)</label>
                            <select id="smsFilterSegment" onchange="crm.applySmsFilters()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                                <option value="">همه سگمنت‌ها</option>
                                <option value="Champions">قهرمانان (Champions)</option>
                                <option value="Loyal">وفادار (Loyal)</option>
                                <option value="At Risk">در معرض ریزش (At Risk)</option>
                                <option value="New">مشتریان جدید (New)</option>
                            </select>
                        </div>

                        <!-- Recency -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">زمان آخرین خرید</label>
                            <select id="smsFilterRecency" onchange="crm.applySmsFilters()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                                <option value="">همه زمان‌ها</option>
                                <option value="RECENT_30">خرید در ۳۰ روز گذشته</option>
                                <option value="DAYS_30_90">بین ۳۰ تا ۹۰ روز پیش</option>
                                <option value="OVER_90">بیش از ۹۰ روز پیش</option>
                                <option value="NEVER">بدون ثبت خرید</option>
                            </select>
                        </div>

                        <!-- Min Spent -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">حداقل کل خرید (تومان)</label>
                            <input type="number" id="smsFilterMinSpent" oninput="crm.applySmsFilters()" placeholder="مثلاً 1000000" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none">
                        </div>

                        <!-- Min Orders -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">حداقل تعداد فاکتور</label>
                            <input type="number" id="smsFilterMinOrders" oninput="crm.applySmsFilters()" placeholder="مثلاً 2" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none">
                        </div>

                        <!-- Phonebook Group Name for Faraz SMS -->
                        <div>
                            <label class="block text-[10px] font-bold text-slate-600 mb-1">نام گروه در دفترچه تلفن فراز</label>
                            <input type="text" id="smsGroupNameInput" oninput="crm.applySmsFilters()" value="باشگاه مشتریان کیهان بیوتی" placeholder="مثلاً: کمپین تخفیف یلدا" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        </div>
                    </div>

                    <!-- Checkbox Toggles -->
                    <div class="flex flex-wrap gap-4 pt-1 text-[11px]">
                        <label class="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                            <input type="checkbox" id="smsFilterWallet" onchange="crm.applySmsFilters()" class="w-4 h-4 text-purple-600 rounded">
                            <span>فقط مشتریان با مانده کیف پول مثبت</span>
                        </label>
                        <label class="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                            <input type="checkbox" id="smsFilterPoints" onchange="crm.applySmsFilters()" class="w-4 h-4 text-purple-600 rounded">
                            <span>فقط مشتریان با امتیاز وفاداری</span>
                        </label>
                        <label class="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                            <input type="checkbox" id="smsFilterBirthMonth" onchange="crm.applySmsFilters()" class="w-4 h-4 text-purple-600 rounded">
                            <span>فقط متولدین این ماه</span>
                        </label>
                    </div>
                </div>

                <!-- Live Results Summary Card -->
                <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-amber-200 flex items-center justify-center text-amber-600 font-black text-lg font-mono" id="smsLiveValidCount">
                            ...
                        </div>
                        <div>
                            <div class="font-black text-slate-900 text-sm flex items-center gap-2">
                                <span>شماره موبایل‌های آماده استخراج و ارسال</span>
                                <span class="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">فرمت معتبر 09xxxxxxxx</span>
                            </div>
                            <div class="text-[11px] text-slate-500 mt-0.5" id="smsLiveDetails">
                                در حال بارگذاری اطلاعات مخاطبین...
                            </div>
                        </div>
                    </div>

                    <!-- Quick Action Chips -->
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="crm.copySmsNumbers('newline')" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-[11px] flex items-center gap-1 shadow-sm transition cursor-pointer" title="کپی یک شماره در هر خط (مناسب ارسال انبوه فراز اس‌ام‌اس)">
                            <i data-lucide="copy" class="w-3.5 h-3.5 text-amber-600"></i>
                            <span>کپی شماره‌ها (خطی)</span>
                        </button>
                        <button type="button" onclick="crm.copySmsNumbers('comma')" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-[11px] flex items-center gap-1 shadow-sm transition cursor-pointer" title="کپی با کاما (مناسب کادر گیرندگان)">
                            <i data-lucide="copy" class="w-3.5 h-3.5 text-blue-600"></i>
                            <span>کپی با کاما (,)</span>
                        </button>
                    </div>
                </div>

                <!-- Preview Mini Table (First 10 Contacts) -->
                <div class="border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    <table class="w-full text-right text-[11px]">
                        <thead class="bg-slate-100 text-slate-600 font-bold sticky top-0">
                            <tr>
                                <th class="p-2">شماره همراه</th>
                                <th class="p-2">نام و نام خانوادگی</th>
                                <th class="p-2">گروه دفترچه تلفن</th>
                                <th class="p-2">سطح</th>
                                <th class="p-2">مانده کیف پول</th>
                                <th class="p-2">امتیاز</th>
                            </tr>
                        </thead>
                        <tbody id="smsPreviewTableBody" class="divide-y divide-slate-100 bg-white">
                            <tr>
                                <td colspan="6" class="p-3 text-center text-slate-400">در حال دریافت پیش‌نمایش...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Modal Footer with Main Export Buttons -->
                <div class="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div class="text-[11px] text-slate-500">
                        <span>سازگار با سامانه فراز اس‌ام‌اس، IPPanel و تمامی درگاه‌های پیامکی ایران</span>
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="crm.downloadSmsTxt()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
                            <i data-lucide="file-text" class="w-4 h-4"></i>
                            <span>دانلود فایل متنی (TXT)</span>
                        </button>

                        <button type="button" onclick="crm.downloadFarazSmsCsv()" class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-black text-xs shadow-lg shadow-amber-200 flex items-center gap-2 transition cursor-pointer">
                            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                            <span>دانلود اکسل استاندارد فراز اس‌ام‌اس (CSV / Excel)</span>
                        </button>
                    </div>
                </div>
            </div>
        `);

        await this.applySmsFilters();
    },

    applySmsPreset(presetKey) {
        this.currentSmsPreset = presetKey;
        document.querySelectorAll('.sms-preset-btn').forEach(btn => {
            btn.className = 'sms-preset-btn p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 text-slate-700 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between';
        });
        const activeBtn = document.getElementById(`smsPreset_${presetKey}`);
        if (activeBtn) {
            activeBtn.className = 'sms-preset-btn p-2 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-bold text-[11px] text-right transition cursor-pointer flex items-center justify-between';
        }

        const tier = document.getElementById('smsFilterTier');
        const seg = document.getElementById('smsFilterSegment');
        const rec = document.getElementById('smsFilterRecency');
        const minSpent = document.getElementById('smsFilterMinSpent');
        const minOrders = document.getElementById('smsFilterMinOrders');
        const wallet = document.getElementById('smsFilterWallet');
        const points = document.getElementById('smsFilterPoints');
        const bmonth = document.getElementById('smsFilterBirthMonth');
        const group = document.getElementById('smsGroupNameInput');

        if (tier) tier.value = '';
        if (seg) seg.value = '';
        if (rec) rec.value = '';
        if (minSpent) minSpent.value = '';
        if (minOrders) minOrders.value = '';
        if (wallet) wallet.checked = false;
        if (points) points.checked = false;
        if (bmonth) bmonth.checked = false;

        if (presetKey === 'VIP_GOLD') {
            if (tier) tier.value = 'VIP';
            if (group) group.value = 'مشتریان VIP و طلایی';
        } else if (presetKey === 'LOYAL') {
            if (seg) seg.value = 'Loyal';
            if (group) group.value = 'مشتریان وفادار با تکرار خرید';
        } else if (presetKey === 'AT_RISK') {
            if (seg) seg.value = 'At Risk';
            if (rec) rec.value = 'DAYS_30_90';
            if (group) group.value = 'مشتریان در معرض ریزش';
        } else if (presetKey === 'DORMANT') {
            if (rec) rec.value = 'OVER_90';
            if (group) group.value = 'مشتریان خاموش و بدون خرید';
        } else if (presetKey === 'WALLET') {
            if (wallet) wallet.checked = true;
            if (group) group.value = 'مشتریان دارای مانده کیف پول';
        } else {
            if (group) group.value = 'باشگاه مشتریان کیهان بیوتی';
        }

        this.applySmsFilters();
    },

    resetSmsFilters() {
        this.applySmsPreset('ALL');
    },

    async applySmsFilters() {
        const tier = document.getElementById('smsFilterTier')?.value || '';
        const rfmSegment = document.getElementById('smsFilterSegment')?.value || '';
        const lastOrderRecency = document.getElementById('smsFilterRecency')?.value || '';
        const minSpent = Number(document.getElementById('smsFilterMinSpent')?.value || 0);
        const minOrders = Number(document.getElementById('smsFilterMinOrders')?.value || 0);
        const hasWalletBalance = !!document.getElementById('smsFilterWallet')?.checked;
        const hasLoyaltyPoints = !!document.getElementById('smsFilterPoints')?.checked;
        const birthMonth = document.getElementById('smsFilterBirthMonth')?.checked ? 'CURRENT' : '';
        const groupName = document.getElementById('smsGroupNameInput')?.value?.trim() || 'باشگاه مشتریان کیهان بیوتی';

        try {
            const res = await fetch('/api/crm/sms-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier,
                    rfmSegment,
                    lastOrderRecency,
                    minSpent,
                    minOrders,
                    hasWalletBalance,
                    hasLoyaltyPoints,
                    birthMonth,
                    groupName
                })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'خطا در فیلتر شماره‌ها');

            this.smsContactsData = json.data;
            const contacts = json.data.contacts || [];

            // Update Counter
            const countEl = document.getElementById('smsLiveValidCount');
            if (countEl) countEl.innerText = contacts.length;

            // Update Details
            const detEl = document.getElementById('smsLiveDetails');
            if (detEl) {
                detEl.innerHTML = `
                    <span>تعداد کل مخاطبین فیلتر شده: <strong>${contacts.length}</strong> نفر</span>
                    ${json.data.invalidCount > 0 ? `<span class="text-rose-600 mr-2">(${json.data.invalidCount} شماره نامعتبر رد شد)</span>` : ''}
                    ${json.data.duplicateCount > 0 ? `<span class="text-amber-600 mr-2">(${json.data.duplicateCount} شماره تکراری حذف شد)</span>` : ''}
                `;
            }

            // Update Preview Table
            const tbody = document.getElementById('smsPreviewTableBody');
            if (tbody) {
                if (contacts.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">هیچ مشتری با این شرایط یافت نشد. فیلترها را تغییر دهید.</td></tr>';
                } else {
                    tbody.innerHTML = contacts.slice(0, 10).map(c => `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-2 font-mono font-bold text-purple-700">${c.mobile}</td>
                            <td class="p-2 font-bold text-slate-800">${c.fullName}</td>
                            <td class="p-2 text-slate-600">${c.groupName}</td>
                            <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 font-bold">${c.tier}</span></td>
                            <td class="p-2 font-mono text-emerald-600 font-bold">${c.walletBalance.toLocaleString('fa-IR')} ت</td>
                            <td class="p-2 font-mono text-amber-600 font-bold">${c.loyaltyPoints.toLocaleString('fa-IR')}</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    async downloadFarazSmsCsv() {
        if (!this.smsContactsData || !this.smsContactsData.contacts || this.smsContactsData.contacts.length === 0) {
            app.showNotification('هیچ شماره‌ای در فیلتر جاری یافت نشد', 'warning');
            return;
        }

        const tier = document.getElementById('smsFilterTier')?.value || '';
        const rfmSegment = document.getElementById('smsFilterSegment')?.value || '';
        const lastOrderRecency = document.getElementById('smsFilterRecency')?.value || '';
        const minSpent = Number(document.getElementById('smsFilterMinSpent')?.value || 0);
        const minOrders = Number(document.getElementById('smsFilterMinOrders')?.value || 0);
        const hasWalletBalance = !!document.getElementById('smsFilterWallet')?.checked;
        const hasLoyaltyPoints = !!document.getElementById('smsFilterPoints')?.checked;
        const birthMonth = document.getElementById('smsFilterBirthMonth')?.checked ? 'CURRENT' : '';
        const groupName = document.getElementById('smsGroupNameInput')?.value?.trim() || 'باشگاه مشتریان کیهان بیوتی';

        try {
            const res = await fetch('/api/crm/sms-export/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier,
                    rfmSegment,
                    lastOrderRecency,
                    minSpent,
                    minOrders,
                    hasWalletBalance,
                    hasLoyaltyPoints,
                    birthMonth,
                    groupName
                })
            });

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `FarazSMS_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            app.showNotification(`فایل اکسل ویژه فراز اس‌ام‌اس با ${this.smsContactsData.contacts.length} شماره دانلود شد.`, 'success');
        } catch (err) {
            app.showNotification('خطا در دانلود فایل اکسل: ' + err.message, 'error');
        }
    },

    async copySmsNumbers(format = 'newline') {
        const contacts = this.smsContactsData?.contacts || [];
        if (contacts.length === 0) {
            app.showNotification('هیچ شماره‌ای برای کپی وجود ندارد', 'warning');
            return;
        }

        const numbers = contacts.map(c => c.mobile);
        const textToCopy = (format === 'comma') ? numbers.join(', ') : numbers.join('\n');

        const success = await this.copyToClipboard(textToCopy);
        if (success) {
            app.showNotification(`تعداد ${numbers.length} شماره موبایل در کلیپ‌بورد کپی شد. آماده چسباندن در پنل فراز اس‌ام‌اس!`, 'success');
        } else {
            app.showNotification('امکان دسترسی به کلیپ‌بورد وجود نداشت', 'error');
        }
    },

    downloadSmsTxt() {
        const contacts = this.smsContactsData?.contacts || [];
        if (contacts.length === 0) {
            app.showNotification('هیچ شماره‌ای برای دانلود وجود ندارد', 'warning');
            return;
        }

        const lines = contacts.map(c => `${c.mobile}\t${c.fullName}\t${c.groupName}`).join('\r\n');
        const blob = new Blob(['\uFEFF' + lines], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FarazSMS_Numbers_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        app.showNotification(`فایل متنی شماره‌ها با موفقیت دانلود شد.`, 'success');
    },

    async copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {}
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (err) {
            document.body.removeChild(ta);
            return false;
        }
    }
};
