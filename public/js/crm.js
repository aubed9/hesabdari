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
                        <button onclick="crm.openImportModal()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="file-up" class="w-4 h-4 text-purple-600"></i>
                            <span>دریافت فایل مشتریان</span>
                        </button>
                        <button onclick="crm.exportCustomersCsv()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="download" class="w-4 h-4 text-slate-600"></i>
                            <span>خروجی اکسل</span>
                        </button>
                        <button onclick="crm.openBirthdaysModal()" class="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                            <i data-lucide="gift" class="w-4 h-4 text-pink-600"></i>
                            <span>متولدین ماه جاری</span>
                        </button>
                        <button onclick="crm.openNewCustomerModal()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                            <i data-lucide="user-plus" class="w-4 h-4"></i>
                            <span>+ ثبت مشتری جدید</span>
                        </button>
                    </div>
                </div>

                <!-- RFM Summary Chips -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div onclick="crm.filterSegment('Champions')" class="p-3 bg-purple-50 hover:bg-purple-100/70 border border-purple-200 rounded-xl cursor-pointer transition">
                        <div class="text-slate-500">مشتریان قهرمان (Champions)</div>
                        <div class="text-xl font-bold text-purple-800 mt-1">خرید منظم و سبد بالا</div>
                    </div>
                    <div onclick="crm.filterSegment('Loyal')" class="p-3 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 rounded-xl cursor-pointer transition">
                        <div class="text-slate-500">مشتریان وفادار (Loyal)</div>
                        <div class="text-xl font-bold text-emerald-800 mt-1">تکرار خرید مداوم</div>
                    </div>
                    <div onclick="crm.filterSegment('At Risk')" class="p-3 bg-amber-50 hover:bg-amber-100/70 border border-amber-200 rounded-xl cursor-pointer transition">
                        <div class="text-slate-500">در معرض ریزش (At Risk)</div>
                        <div class="text-xl font-bold text-amber-800 mt-1">عدم مراجعه بالای ۴۵ روز</div>
                    </div>
                    <div onclick="crm.filterSegment('New')" class="p-3 bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200 rounded-xl cursor-pointer transition">
                        <div class="text-slate-500">مشتریان جدید (New)</div>
                        <div class="text-xl font-bold text-indigo-800 mt-1">نیازمند ترغیب خرید دوم</div>
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
                            <option value="">همه سگمنت‌های RFM</option>
                            <option value="Champions">قهرمانان (Champions)</option>
                            <option value="Loyal">وفادار (Loyal)</option>
                            <option value="At Risk">در معرض ریزش (At Risk)</option>
                            <option value="New">جدید (New)</option>
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
        } catch (e) {
            document.getElementById('customerTableContainer').innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت لیست مشتریان</div>';
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
            const matchesQ = !q || (c.full_name && c.full_name.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)) || (c.customer_code && c.customer_code.toLowerCase().includes(q));
            const matchesTier = !tier || c.loyalty_tier === tier;
            const matchesSeg = !seg || c.rfm_segment === seg;
            return matchesQ && matchesTier && matchesSeg;
        });

        this.renderCustomerTable();
    },
                </table>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = '<div class="p-6 text-center text-rose-500">خطا در دریافت لیست مشتریان</div>';
        }
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
    }
};
