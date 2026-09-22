// Main Application Controller & Router
const app = {
    currentSection: 'dashboard',
    currentUser: null,

    init() {
        this.bindNav();
        this.bindModals();
        this.updatePersianDate();
        this.updateAlertCount();

        // Check login state from localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
            } catch (e) {
                this.currentUser = null;
            }
        }

        if (!this.currentUser) {
            this.showLoginModal();
            return;
        }

        this.applyUserPermissions();
        let hash = window.location.hash.replace('#', '') || (this.currentUser.role === 'ADMIN' ? 'pos' : 'dashboard');
        if (this.currentUser.role === 'ADMIN' && hash !== 'pos' && hash !== 'crm' && hash !== 'alerts') {
            hash = 'pos';
        }
        this.showSection(hash);
    },

    showLoginModal() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            const errEl = document.getElementById('loginErrorMessage');
            if (errEl) errEl.classList.add('hidden');
            lucide.createIcons();
        }
    },

    hideLoginModal() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },

    async handleLoginForm(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsernameInput')?.value;
        const password = document.getElementById('loginPasswordInput')?.value;
        await this.login(username, password);
    },

    async login(username, password) {
        const btn = document.getElementById('loginSubmitBtn');
        const errEl = document.getElementById('loginErrorMessage');
        if (errEl) errEl.classList.add('hidden');
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error || 'نام کاربری یا رمز عبور اشتباه است');
            }

            this.currentUser = json.user;
            localStorage.setItem('currentUser', JSON.stringify(json.user));

            this.hideLoginModal();
            this.applyUserPermissions();

            const targetSection = (this.currentUser.role === 'ADMIN') ? 'pos' : 'dashboard';
            this.showSection(targetSection);
        } catch (err) {
            if (errEl) {
                errEl.innerText = err.message;
                errEl.classList.remove('hidden');
            } else {
                alert(err.message);
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    logout() {
        localStorage.removeItem('currentUser');
        this.currentUser = null;
        this.showLoginModal();
    },

    applyUserPermissions() {
        if (!this.currentUser) return;

        const role = this.currentUser.role;
        const isManager = (role === 'MANAGER');

        // Update header user badge
        const nameEl = document.getElementById('headerUserName');
        const roleEl = document.getElementById('headerUserRole');
        const avatarEl = document.getElementById('headerUserAvatar');
        const btnSimulate = document.getElementById('headerBtnSimulate');
        const btnReports = document.getElementById('headerBtnReports');

        if (nameEl) nameEl.innerText = this.currentUser.fullName || (isManager ? 'مدیر ارشد فروشگاه' : 'ادمین فروش و صندوق');
        if (roleEl) roleEl.innerText = isManager ? 'مدیر کل (دسترسی نامحدود)' : 'ادمین فروش (صندوق و CRM)';
        if (avatarEl) avatarEl.innerText = isManager ? 'مد' : 'اد';

        // Toggle Quick Header Buttons
        if (btnSimulate) btnSimulate.style.display = isManager ? 'flex' : 'none';
        if (btnReports) btnReports.style.display = isManager ? 'flex' : 'none';

        // Sidebar Navigation Visibility based on dynamic allowedSections
        const allSections = [
            'dashboard', 'pos', 'products', 'inventory', 'purchasing',
            'omnichannel', 'crm', 'marketing', 'accounting', 'reports',
            'bi', 'audit', 'alerts', 'settings'
        ];

        const allowed = Array.isArray(this.currentUser.allowedSections)
            ? this.currentUser.allowedSections
            : (isManager ? allSections : ['pos', 'crm', 'alerts']);

        for (const sec of allSections) {
            const navEl = document.getElementById(`nav-${sec}`);
            if (navEl) {
                // Settings is strictly for MANAGER
                const isPermitted = (sec === 'settings') ? isManager : allowed.includes(sec);
                navEl.style.display = isPermitted ? 'flex' : 'none';
            }
        }
    },

    updatePersianDate() {
        const el = document.getElementById('persianCurrentDate');
        if (el) {
            el.innerText = this.getCurrentJalaliDateText();
        }
    },

    formatDateFa(dateStr, includeTime = false) {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
            if (includeTime) {
                opts.hour = '2-digit';
                opts.minute = '2-digit';
            }
            return new Intl.DateTimeFormat('fa-IR-u-ca-persian', opts).format(d);
        } catch (e) {
            return dateStr;
        }
    },

    formatBirthDateFa(dateStr) {
        if (!dateStr || dateStr === '-') return 'ثبت نشده';
        try {
            const clean = String(dateStr).trim().split('T')[0];
            const parts = clean.split(/[-/]/);
            if (parts.length === 3 && Number(parts[0]) >= 1300 && Number(parts[0]) <= 1450) {
                const months = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
                return `${Number(parts[2])} ${months[Number(parts[1])] || ''} ${parts[0]}`;
            }
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
        } catch (e) {
            return dateStr;
        }
    },

    formatBirthDateShortFa(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const clean = String(dateStr).trim().split('T')[0];
            const parts = clean.split(/[-/]/);
            if (parts.length === 3 && Number(parts[0]) >= 1300 && Number(parts[0]) <= 1450) {
                return `${parts[0]}/${String(parts[1]).padStart(2, '0')}/${String(parts[2]).padStart(2, '0')}`;
            }
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        } catch (e) {
            return dateStr;
        }
    },

    getCurrentJalaliDateText() {
        try {
            return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(new Date());
        } catch (e) {
            return new Date().toLocaleDateString('fa-IR');
        }
    },

    bindNav() {
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '') || 'dashboard';
            this.showSection(hash);
        });
    },

    bindModals() {
        // Close modal when clicking outside on dark backdrop
        const overlay = document.getElementById('modalOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }
        // Close modal when pressing Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    },

    showSection(name) {
        if (!this.currentUser) {
            this.showLoginModal();
            return;
        }

        const isManager = (this.currentUser.role === 'MANAGER');
        const allSections = [
            'dashboard', 'pos', 'products', 'inventory', 'purchasing',
            'omnichannel', 'crm', 'marketing', 'accounting', 'reports',
            'bi', 'audit', 'alerts', 'settings'
        ];
        const allowed = Array.isArray(this.currentUser.allowedSections) 
            ? this.currentUser.allowedSections 
            : (isManager ? allSections : ['pos', 'crm', 'alerts']);

        // Check if current target section is permitted
        if (name === 'settings' && !isManager) {
            this.showNotification('⚠️ بخش تنظیمات فقط مخصوص مدیر ارشد فروشگاه است.', 'error');
            name = allowed[0] || 'pos';
        } else if (!isManager && !allowed.includes(name)) {
            this.showNotification(`⚠️ دسترسی غیرمجاز: حساب کاربری شما به بخش «${name}» دسترسی ندارد.`, 'error');
            name = allowed[0] || 'pos';
        }

        this.currentSection = name;
        window.location.hash = name;

        // Update active sidebar link
        document.querySelectorAll('.nav-item').forEach(el => {
            el.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition';
        });
        const activeLink = document.getElementById(`nav-${name}`);
        if (activeLink) {
            activeLink.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-purple-700 bg-purple-50 transition';
        }

        // Dispatch section
        if (name === 'dashboard') this.renderDashboard();
        else if (name === 'pos') pos.init();
        else if (name === 'inventory') inventory.init();
        else if (name === 'accounting') accounting.init();
        else if (name === 'crm') crm.init();
        else if (name === 'bi') bi.init();
        else if (name === 'reports') reports.init();
        else if (name === 'products') this.renderProducts();
        else if (name === 'purchasing') this.renderPurchasing();
        else if (name === 'omnichannel') this.renderOmnichannel();
        else if (name === 'audit') this.renderAuditLogs();
        else if (name === 'marketing') marketing.init();
        else if (name === 'alerts') this.renderAlerts();
        else if (name === 'settings') this.renderSettings();
        else this.renderDashboard();

        lucide.createIcons();
    },

    // 1. Executive Control Center (داشبورد اصلی مدیر)
    async renderDashboard(range = 'TODAY') {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال بارگذاری مرکز فرماندهی مدیر...</div>`;

        try {
            const res = await fetch(`/api/dashboard/overview?range=${range}`);
            const json = await res.json();
            const d = json.data;

            const insightsRes = await fetch('/api/dashboard/insights');
            const insightsJson = await insightsRes.json();
            const insights = insightsJson.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Top Notification / Status Banner -->
                    <div class="bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-white rounded-3xl p-6 shadow-xl shadow-purple-200/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div class="space-y-1">
                            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-purple-100">مرکز فرماندهی اجرایی (Executive Control Center)</span>
                            <h2 class="text-2xl font-black mt-2">وضعیت زنده فروشگاه آرایشی و بهداشتی کیهان بیوتی</h2>
                            <p class="text-xs text-purple-100">تمامی شاخص‌های کلیدی، زنجیره تأمین، سودآوری و کنترل انقضا در یک نگاه</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-3">
                            <!-- Date Range Selector -->
                            <div class="flex items-center gap-1.5 bg-white/15 px-3 py-2 rounded-xl border border-white/25">
                                <i data-lucide="calendar" class="w-4 h-4 text-purple-200"></i>
                                <span class="text-xs text-purple-200 font-medium">بازه:</span>
                                <select onchange="app.renderDashboard(this.value)" class="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer">
                                    <option value="TODAY" ${range === 'TODAY' ? 'selected' : ''} class="text-slate-900">امروز</option>
                                    <option value="YESTERDAY" ${range === 'YESTERDAY' ? 'selected' : ''} class="text-slate-900">دیروز</option>
                                    <option value="WEEK" ${range === 'WEEK' ? 'selected' : ''} class="text-slate-900">۷ روز گذشته</option>
                                    <option value="MONTH" ${range === 'MONTH' ? 'selected' : ''} class="text-slate-900">۳۰ روز گذشته</option>
                                    <option value="SEASON" ${range === 'SEASON' ? 'selected' : ''} class="text-slate-900">فصل جاری (۹۰ روز)</option>
                                    <option value="YEAR" ${range === 'YEAR' ? 'selected' : ''} class="text-slate-900">سال جاری</option>
                                    <option value="ALL" ${range === 'ALL' ? 'selected' : ''} class="text-slate-900">کل دوره (۹۰ روز)</option>
                                </select>
                            </div>

                            <a href="/api/export/orders" target="_blank" class="bg-white/10 hover:bg-white/20 text-white font-medium px-3 py-2.5 rounded-xl text-xs border border-white/20 transition flex items-center gap-1.5">
                                <i data-lucide="sheet" class="w-3.5 h-3.5"></i>
                                <span>خروجی اکسل</span>
                            </a>

                            <button onclick="app.showSection('pos')" class="bg-white hover:bg-purple-50 text-purple-900 font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-2">
                                <i data-lucide="shopping-cart" class="w-4 h-4 text-purple-600"></i>
                                <span>ورود به صندوق POS</span>
                            </button>
                        </div>
                    </div>

                    ${d.period && range !== 'TODAY' ? `
                        <!-- Selected Period Highlight Banner -->
                        <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-2xl border border-purple-200 flex flex-wrap items-center justify-between gap-4">
                            <div class="flex items-center gap-2">
                                <span class="w-3 h-3 rounded-full bg-purple-600"></span>
                                <span class="font-bold text-sm text-purple-900">عملکرد منتخب: ${d.period.label}</span>
                            </div>
                            <div class="flex items-center gap-6 text-xs">
                                <div>فروش دوره: <strong class="text-slate-900 font-mono text-sm">${Number(d.period.sales).toLocaleString('fa-IR')} تومان</strong></div>
                                <div>سود ناخالص دوره: <strong class="text-emerald-700 font-mono text-sm">${Number(d.period.grossProfit).toLocaleString('fa-IR')} تومان</strong></div>
                                <div>تعداد فاکتور: <strong class="text-purple-700 font-mono text-sm">${d.period.invoicesCount}</strong></div>
                                <div>میانگین هر فاکتور: <strong class="text-slate-700 font-mono">${Number(d.period.averageOrderValue).toLocaleString('fa-IR')} تومان</strong></div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 14 Mandatory KPIs Grid (دقیقاً مطابق جدول نیازمندی‌های کاربر) -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 text-xs">
                        <!-- 1. فروش امروز -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">فروش امروز</span>
                                <i data-lucide="sun" class="w-4 h-4 text-amber-500"></i>
                            </div>
                            <div class="text-xl font-black text-slate-900 mt-2 font-mono">${Number(d.today.sales).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-emerald-600 font-medium mt-1">${d.today.invoicesCount} فاکتور صادر شده</div>
                        </div>

                        <!-- 2. فروش این ماه -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">فروش این ماه</span>
                                <i data-lucide="calendar" class="w-4 h-4 text-purple-600"></i>
                            </div>
                            <div class="text-xl font-black text-purple-700 mt-2 font-mono">${Number(d.month.sales).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">عملکرد ماه جاری</div>
                        </div>

                        <!-- 3. سود ناخالص امروز -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">سود ناخالص امروز</span>
                                <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
                            </div>
                            <div class="text-xl font-black text-emerald-600 mt-2 font-mono">${Number(d.today.grossProfit).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">حاشیه سود: ${d.today.sales > 0 ? Math.round((d.today.grossProfit / d.today.sales) * 100) : 0}٪</div>
                        </div>

                        <!-- 4. سود این ماه -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">سود ناخالص این ماه</span>
                                <i data-lucide="badge-dollar-sign" class="w-4 h-4 text-emerald-600"></i>
                            </div>
                            <div class="text-xl font-black text-emerald-700 mt-2 font-mono">${Number(d.month.grossProfit).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">سود عملیاتی خالص</div>
                        </div>

                        <!-- 5. میانگین هر فاکتور (AOV) -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">میانگین ارزش فاکتور (AOV)</span>
                                <i data-lucide="receipt" class="w-4 h-4 text-indigo-500"></i>
                            </div>
                            <div class="text-xl font-black text-slate-900 mt-2 font-mono">${Number(d.today.averageOrderValue).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">شاخص سبد خرید</div>
                        </div>

                        <!-- 6. ارزش موجودی انبار -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-purple-300 transition" onclick="app.showSection('inventory')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">ارزش سرمایه انبار</span>
                                <i data-lucide="boxes" class="w-4 h-4 text-blue-500"></i>
                            </div>
                            <div class="text-xl font-black text-blue-600 mt-2 font-mono">${Number(d.inventory.totalCostValue).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-500 mt-1">${d.inventory.totalUnits} واحد کالایی موجود</div>
                        </div>

                        <!-- 7. کالاهای کم‌موجودی -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-rose-300 transition" onclick="app.showSection('inventory')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">کالاهای زیر نقطه سفارش</span>
                                <i data-lucide="alert-circle" class="w-4 h-4 text-rose-500"></i>
                            </div>
                            <div class="text-xl font-black text-rose-600 mt-2 font-mono">${d.inventory.lowStockCount} <span class="text-xs font-normal text-slate-400">قلم کالا</span></div>
                            <div class="text-[11px] text-rose-500 mt-1">نیازمند ثبت سفارش خرید</div>
                        </div>

                        <!-- 8. کالاهای نزدیک انقضا (زیر ۶۰ روز) -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-300 transition" onclick="app.showSection('inventory')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">کالاهای نزدیک انقضا (FEFO)</span>
                                <i data-lucide="hourglass" class="w-4 h-4 text-amber-500"></i>
                            </div>
                            <div class="text-xl font-black text-amber-600 mt-2 font-mono">${d.inventory.nearExpiryUnits} <span class="text-xs font-normal text-slate-400">عدد (${d.inventory.nearExpiryBatches} بچ)</span></div>
                            <div class="text-[11px] text-amber-700 mt-1 font-mono">ارزش: ${Number(d.inventory.nearExpiryValue).toLocaleString('fa-IR')} ت</div>
                        </div>

                        <!-- 9. بدهی به تأمین‌کنندگان -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-300 transition" onclick="app.showSection('accounting')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">بدهی تأمین‌کنندگان / چک‌ها</span>
                                <i data-lucide="credit-card" class="w-4 h-4 text-rose-500"></i>
                            </div>
                            <div class="text-xl font-black text-rose-700 mt-2 font-mono">${Number(d.finances.accountsPayable).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">تعهدات در سررسید</div>
                        </div>

                        <!-- 10. مطالبات فروشگاه -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-300 transition" onclick="app.showSection('accounting')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">مطالبات / چک‌های دریافتی</span>
                                <i data-lucide="check-square" class="w-4 h-4 text-emerald-500"></i>
                            </div>
                            <div class="text-xl font-black text-emerald-700 mt-2 font-mono">${Number(d.finances.accountsReceivable).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-400 mt-1">اسناد دریافتنی معتبر</div>
                        </div>

                        <!-- 11. نقدینگی و بانک -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">کل نقدینگی (بانک + صندوق)</span>
                                <i data-lucide="wallet" class="w-4 h-4 text-purple-600"></i>
                            </div>
                            <div class="text-xl font-black text-slate-900 mt-2 font-mono">${Number(d.finances.totalLiquidity).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                            <div class="text-[11px] text-slate-500 mt-1">حساب‌های سامان و ملت</div>
                        </div>

                        <!-- 12. مشتریان در خطر ریزش -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-300 transition" onclick="app.showSection('crm')">
                            <div class="flex items-center justify-between text-slate-400">
                                <span class="font-medium">مشتریان در خطر ریزش (RFM)</span>
                                <i data-lucide="user-x" class="w-4 h-4 text-amber-600"></i>
                            </div>
                            <div class="text-xl font-black text-amber-700 mt-2 font-mono">${d.customers.at_risk_customers} <span class="text-xs font-normal text-slate-400">نفر</span></div>
                            <div class="text-[11px] text-amber-700 mt-1">بدون خرید بیش از ۶۰ روز</div>
                        </div>
                    </div>

                    <!-- Intelligent Insights Engine Cards -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="sparkles" class="w-4 h-4 text-purple-600"></i>
                                <span>بینش‌های هوشمند تحلیلی فروشگاه (Smart Insights Engine)</span>
                            </h3>
                            <span class="text-[11px] text-purple-600 font-bold bg-purple-50 px-2.5 py-0.5 rounded-full">تحلیل زنده</span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            ${insights.map(item => `
                                <div class="p-4 rounded-2xl border ${
                                    item.severity === 'CRITICAL' ? 'bg-rose-50/70 border-rose-200 text-rose-900' :
                                    item.severity === 'WARNING' ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-purple-50/70 border-purple-200 text-purple-900'
                                }">
                                    <div class="font-bold flex items-center gap-2">
                                        <i data-lucide="${item.severity === 'CRITICAL' ? 'alert-octagon' : 'info'}" class="w-4 h-4"></i>
                                        <span>${item.title}</span>
                                    </div>
                                    <p class="mt-1.5 leading-relaxed text-[11px] opacity-90">${item.message}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری اطلاعات داشبورد</div>`;
        }
    },

    // 2. Products Catalog View
    async renderProducts() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال بارگذاری کاتالوگ محصولات...</div>`;

        try {
            const res = await fetch('/api/products');
            const json = await res.json();
            const products = json.data || [];
            const summary = json.summary || {
                grand_total_stock: products.reduce((sum, p) => sum + (p.total_stock || 0), 0),
                grand_total_cost_value: products.reduce((sum, p) => sum + (p.total_cost_value || 0), 0),
                grand_total_retail_value: products.reduce((sum, p) => sum + (p.total_retail_value || 0), 0)
            };

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="palette" class="w-5 h-5 text-purple-600"></i>
                                <span>کاتالوگ تخصصی محصولات، برندها و ارزش‌گذاری موجودی</span>
                            </h2>
                            <p class="text-xs text-slate-500">شامل ارزش کل انبار، بهای تمام شده، قیمت مصرف‌کننده، موجودی لحظه‌ای و بارکد واریانت‌ها</p>
                        </div>
                        <button onclick="app.openNewProductModal()" class="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-100 transition shrink-0">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i>
                            <span>+ افزودن کالای جدید به انبار و صندوق</span>
                        </button>
                    </div>

                    <!-- Inventory Valuation KPI Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div class="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200/80 rounded-2xl shadow-sm">
                            <div class="text-[11px] font-bold text-purple-800 flex items-center gap-1.5">
                                <i data-lucide="vault" class="w-4 h-4 text-purple-600"></i>
                                <span>ارزش کل انبار (بهای خرید / تمام شده)</span>
                            </div>
                            <div class="text-lg font-black font-mono text-purple-950 mt-2">
                                ${Number(summary.grand_total_cost_value || 0).toLocaleString('fa-IR')} <span class="text-xs font-normal text-purple-700">تومان</span>
                            </div>
                            <div class="text-[10px] text-purple-600 mt-1">سرمایه نقدی خوابیده در موجودی کالاها</div>
                        </div>

                        <div class="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl shadow-sm">
                            <div class="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                                <i data-lucide="tag" class="w-4 h-4 text-emerald-600"></i>
                                <span>ارزش کل فروشگاهی (قیمت مصرف‌کننده)</span>
                            </div>
                            <div class="text-lg font-black font-mono text-emerald-950 mt-2">
                                ${Number(summary.grand_total_retail_value || 0).toLocaleString('fa-IR')} <span class="text-xs font-normal text-emerald-700">تومان</span>
                            </div>
                            <div class="text-[10px] text-emerald-600 mt-1">درآمد ناخالص در صورت فروش تمام موجودی</div>
                        </div>

                        <div class="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200/80 rounded-2xl shadow-sm">
                            <div class="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                                <i data-lucide="trending-up" class="w-4 h-4 text-amber-600"></i>
                                <span>سود ناخالص بالقوه کل انبار</span>
                            </div>
                            <div class="text-lg font-black font-mono text-amber-950 mt-2">
                                ${Number(Math.max(0, (summary.grand_total_retail_value || 0) - (summary.grand_total_cost_value || 0))).toLocaleString('fa-IR')} <span class="text-xs font-normal text-amber-700">تومان</span>
                            </div>
                            <div class="text-[10px] text-amber-600 mt-1">مارجین سود ریالی اقلام موجود در فروشگاه</div>
                        </div>

                        <div class="p-4 bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200/80 rounded-2xl shadow-sm">
                            <div class="text-[11px] font-bold text-blue-800 flex items-center gap-1.5">
                                <i data-lucide="boxes" class="w-4 h-4 text-blue-600"></i>
                                <span>تعداد کل اقلام موجود در انبار</span>
                            </div>
                            <div class="text-lg font-black font-mono text-blue-950 mt-2">
                                ${Number(summary.grand_total_stock || 0).toLocaleString('fa-IR')} <span class="text-xs font-normal text-blue-700">عدد کالا</span>
                            </div>
                            <div class="text-[10px] text-blue-600 mt-1">شامل ${products.length} عنوان محصول فعال</div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">عنوان کالا</th>
                                    <th class="p-3.5">برند و کشور</th>
                                    <th class="p-3.5">دسته‌بندی</th>
                                    <th class="p-3.5 text-center">واریانت‌ها</th>
                                    <th class="p-3.5 text-center">موجودی انبار</th>
                                    <th class="p-3.5">ارزش خرید (بهای تمام شده)</th>
                                    <th class="p-3.5">ارزش فروشگاهی</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${products.map(p => `
                                    <tr class="hover:bg-slate-50/80 transition">
                                        <td class="p-3.5">
                                            <div class="font-bold text-slate-900">${p.name_fa}</div>
                                            <div class="text-[11px] text-slate-400">${p.name}</div>
                                        </td>
                                        <td class="p-3.5">
                                            <div class="font-bold text-slate-700">${p.brand_name}</div>
                                            <div class="text-[10px] text-slate-400">${p.country_of_origin || 'خارجی'}</div>
                                        </td>
                                        <td class="p-3.5 text-slate-700">${p.category_name}</td>
                                        <td class="p-3.5 text-center font-bold text-purple-700 font-mono">${p.variant_count} واریانت</td>
                                        <td class="p-3.5 text-center font-bold font-mono ${p.total_stock > 5 ? 'text-emerald-600' : 'text-rose-600'}">
                                            ${p.total_stock} عدد
                                        </td>
                                        <td class="p-3.5 font-bold font-mono text-slate-800">
                                            ${Number(p.total_cost_value || 0).toLocaleString('fa-IR')} ت
                                        </td>
                                        <td class="p-3.5 font-bold font-mono text-emerald-700">
                                            ${Number(p.total_retail_value || 0).toLocaleString('fa-IR')} ت
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
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری محصولات</div>`;
        }
    },

    // 3. Purchasing & Suppliers View
    async renderPurchasing() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال دریافت زنجیره تأمین...</div>`;

        try {
            const res = await fetch('/api/suppliers');
            const json = await res.json();
            const suppliers = json.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="truck" class="w-5 h-5 text-purple-600"></i>
                                <span>زنجیره تأمین، تأمین‌کنندگان و خرید کالا</span>
                            </h2>
                            <p class="text-xs text-slate-500">امتیازدهی اصالت کالا، مدت تحویل، شرایط پرداخت و رسید انبار با ثبت سری ساخت و انقضا</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        ${suppliers.map(s => `
                            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <h4 class="font-bold text-sm text-slate-900">${s.name}</h4>
                                    <span class="text-amber-500 font-bold flex items-center gap-1">
                                        ★ ${s.authenticity_rating}
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 text-slate-600">
                                    <div>شرایط پرداخت: <strong>${s.payment_terms}</strong></div>
                                    <div>زمان تحویل: <strong>${s.lead_time_days} روز</strong></div>
                                    <div>شماره تماس: <span class="font-mono">${s.phone || s.mobile}</span></div>
                                    <div>سقف اعتبار: <strong class="font-mono text-emerald-700">${Number(s.credit_limit).toLocaleString('fa-IR')} ت</strong></div>
                                </div>
                                <div class="text-[11px] text-slate-400 pt-1">${s.address || 'تهران'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری تأمین‌کنندگان</div>`;
        }
    },

    // 4. Workforce & Commissions View
    async renderWorkforce() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال بارگذاری پرسنل...</div>`;

        try {
            const res = await fetch('/api/workforce/employees');
            const json = await res.json();
            const emps = json.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="badge-percent" class="w-5 h-5 text-purple-600"></i>
                                <span>مدیریت پرسنل، شیفت‌ها و پورسانت فروشندگان</span>
                            </h2>
                            <p class="text-xs text-slate-500">محاسبه خودکار پورسانت فروش، پایش فروش هر صندوق‌دار و مانیتورینگ تخفیف‌های بالا جهت جلوگیری از سوءاستفاده</p>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">نام همکار</th>
                                    <th class="p-3.5">نقش سازمانی</th>
                                    <th class="p-3.5">حقوق پایه ماهانه</th>
                                    <th class="p-3.5 text-center">نرخ پورسانت</th>
                                    <th class="p-3.5 text-center">تعداد فاکتور صادره</th>
                                    <th class="p-3.5">مجموع فروش</th>
                                    <th class="p-3.5 text-left">پورسانت کسب‌شده</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${emps.map(e => `
                                    <tr>
                                        <td class="p-3.5">
                                            <div class="font-bold text-slate-900">${e.full_name}</div>
                                            <div class="text-[11px] text-slate-400 font-mono">${e.username}</div>
                                        </td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${e.role}</span>
                                        </td>
                                        <td class="p-3.5 font-mono text-slate-700">${Number(e.base_salary).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 text-center font-bold text-purple-700 font-mono">${e.commission_rate}٪</td>
                                        <td class="p-3.5 text-center font-bold">${e.orders_sold}</td>
                                        <td class="p-3.5 font-bold font-mono text-slate-900">${Number(e.total_sales_amount).toLocaleString('fa-IR')} ت</td>
                                        <td class="p-3.5 text-left font-bold font-mono text-emerald-600 text-sm">${Number(e.estimated_commission).toLocaleString('fa-IR')} تومان</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در دریافت اطلاعات پرسنل</div>`;
        }
    },

    // 5. Marketing & Campaigns View
    async renderMarketing() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال بارگذاری کمپین‌ها...</div>`;

        try {
            const res = await fetch('/api/marketing/campaigns');
            const json = await res.json();
            const camps = json.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="megaphone" class="w-5 h-5 text-purple-600"></i>
                                <span>کمپین‌های بازاریابی، پیامک، کوپن‌ها و تحلیل بازگشت سرمایه (ROI)</span>
                            </h2>
                            <p class="text-xs text-slate-500">هدف‌گیری مشتریان بر اساس RFM، تولد، کالاهای نزدیک انقضا و محاسبه سود ناشی از کمپین</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        ${camps.map(c => `
                            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <span class="font-bold text-slate-900 text-sm">${c.title}</span>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">${c.channel}</span>
                                </div>
                                <div class="space-y-1 text-slate-600">
                                    <div>مشتریان هدف: <strong>${c.target_segment}</strong></div>
                                    <div>درصد تخفیف: <strong class="text-rose-600 font-mono">${c.discount_percent}٪</strong></div>
                                    <div>هزینه تبلیغات: <span class="font-mono">${Number(c.cost || c.budget).toLocaleString('fa-IR')} ت</span></div>
                                    <div>فروش ایجادشده: <strong class="font-mono text-emerald-700">${Number(c.revenue_generated).toLocaleString('fa-IR')} ت</strong></div>
                                </div>
                                <div class="pt-2 border-t border-slate-100 flex justify-between items-center">
                                    <span class="text-slate-400">نرخ تبدیل:</span>
                                    <span class="font-bold text-emerald-600 font-mono">${c.conversions_count} خرید موفق</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در دریافت کمپین‌ها</div>`;
        }
    },

    // 6. Alerts Center View
    async renderAlerts() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال دریافت هشدارها...</div>`;

        try {
            const res = await fetch('/api/alerts');
            const json = await res.json();
            const alerts = json.data || [];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto space-y-4">
                    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="alert-triangle" class="w-5 h-5 text-rose-500"></i>
                                <span>مرکز هشدارهای بلادرنگ سیستم</span>
                            </h2>
                            <p class="text-xs text-slate-500">هشدارهای کمبود موجودی، تاریخ انقضا، مغایرت صندوق و سررسید چک‌ها</p>
                        </div>
                    </div>

                    ${alerts.length === 0 ? `
                        <div class="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                            هیچ هشدار فعالی وجود ندارد. تمامی بخش‌های فروشگاه در وضعیت مطلوب هستند.
                        </div>
                    ` : alerts.map(a => `
                        <div class="bg-white p-4 rounded-2xl border ${
                            a.severity === 'CRITICAL' ? 'border-rose-300 bg-rose-50/40' : 'border-amber-300 bg-amber-50/40'
                        } shadow-sm flex items-start justify-between gap-4 text-xs">
                            <div class="space-y-1">
                                <div class="font-bold text-sm ${a.severity === 'CRITICAL' ? 'text-rose-900' : 'text-amber-900'} flex items-center gap-1.5">
                                    <i data-lucide="${a.severity === 'CRITICAL' ? 'alert-octagon' : 'alert-circle'}" class="w-4 h-4 text-rose-600"></i>
                                    <span>${a.title}</span>
                                </div>
                                <p class="text-slate-700 leading-relaxed">${a.message}</p>
                                <span class="text-[10px] text-slate-400 font-mono">${a.created_at}</span>
                            </div>
                            <button onclick="app.resolveAlert(${a.id})" class="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-medium shrink-0 shadow-sm transition">
                                بررسی و رفع
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری هشدارها</div>`;
        }
    },

    // 7. Omnichannel & Online Orders View
    async renderOmnichannel() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال دریافت سفارشات آنلاین و پیک...</div>`;

        try {
            const res = await fetch('/api/omnichannel/orders');
            const json = await res.json();
            const orders = json.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                                <i data-lucide="globe" class="w-5 h-5 text-purple-600"></i>
                                <span>سفارشات آنلاین، شبکه‌های اجتماعی و ارسال با پیک</span>
                            </h2>
                            <p class="text-xs text-slate-500">پشتیبانی از اینستاگرام، واتساپ، اسنپ‌شاپ، دیجی‌کالا و تخصیص پیک (الوپیک / تیپاکس)</p>
                        </div>
                    </div>

                    ${orders.length === 0 ? `
                        <div class="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                            در حال حاضر سفارش آنلاینی در صف ارسال نیست.
                        </div>
                    ` : `
                        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <table class="w-full text-right text-xs">
                                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th class="p-3.5">شماره سفارش</th>
                                        <th class="p-3.5">کانال ورودی</th>
                                        <th class="p-3.5">مشتری و تماس</th>
                                        <th class="p-3.5">مبلغ فاکتور</th>
                                        <th class="p-3.5">وضعیت ارسال</th>
                                        <th class="p-3.5">کد رهگیری / پیک</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${orders.map(o => `
                                        <tr>
                                            <td class="p-3.5 font-bold font-mono text-purple-700">${o.order_number}</td>
                                            <td class="p-3.5">
                                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    o.channel === 'INSTAGRAM' ? 'bg-pink-100 text-pink-700' :
                                                    o.channel === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                }">${o.channel}</span>
                                            </td>
                                            <td class="p-3.5">
                                                <div class="font-bold text-slate-900">${o.customer_name || 'مشتری آنلاین'}</div>
                                                <div class="text-[11px] text-slate-400 font-mono">${o.customer_mobile || '-'}</div>
                                            </td>
                                            <td class="p-3.5 font-bold font-mono text-slate-900">${Number(o.total_amount).toLocaleString('fa-IR')} ت</td>
                                            <td class="p-3.5">
                                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${o.shipment_status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}">
                                                    ${o.shipment_status || 'در انتظار تخصیص پیک'}
                                                </span>
                                            </td>
                                            <td class="p-3.5 font-mono text-slate-600">
                                                ${o.tracking_number ? `${o.courier_name || 'الوپیک'}: ${o.tracking_number}` : '<button class="text-purple-600 font-bold hover:underline">تخصیص پیک</button>'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری سفارشات آنلاین</div>`;
        }
    },

    // 8. Add New Product & Initial Batch Modal (ثبت کالای جدید و شارژ در صندوق)
    async openNewProductModal() {
        try {
            const [catRes, brandRes] = await Promise.all([
                fetch('/api/categories'),
                fetch('/api/brands')
            ]);
            const cats = (await catRes.json()).data || [];
            const brands = (await brandRes.json()).data || [];

            const autoBarcode = '626' + Math.floor(1000000000 + Math.random() * 9000000000);
            const autoLot = 'LOT-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + Math.floor(100 + Math.random() * 900);
            
            const expD = new Date();
            expD.setFullYear(expD.getFullYear() + 2);
            const autoExp = expD.toISOString().split('T')[0];

            this.openModal(`
                <div class="space-y-4 text-xs">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                            <h3 class="text-base font-bold text-slate-900 flex items-center gap-1.5">
                                <i data-lucide="plus-circle" class="w-5 h-5 text-purple-600"></i>
                                <span>ثبت کالای جدید و شارژ انبار (نمایش آنی در صندوق POS)</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">ثبت مشخصات محصول، شید، قیمت‌گذاری و شارژ بچ اولیه انبار با تاریخ انقضا</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <!-- Name FA -->
                        <div class="md:col-span-2">
                            <label class="block font-bold text-slate-700 mb-1">نام محصول (فارسی) <span class="text-rose-500">*</span></label>
                            <input type="text" id="npNameFa" placeholder="مثلاً کرم پودر ۲۴ ساعته سوپراستی" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-purple-600 outline-none">
                        </div>

                        <!-- Name EN -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">نام انگلیسی / برند لاتین</label>
                            <input type="text" id="npNameEn" placeholder="e.g. SuperStay 24H Foundation" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono">
                        </div>

                        <!-- Shade / Model -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">شید رنگی / مدل / حجم <span class="text-rose-500">*</span></label>
                            <input type="text" id="npShade" placeholder="مثلاً شید ۱۲۰ عاجی (Ivory) یا حجم 30ml" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-purple-700">
                        </div>

                        <!-- Category -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="font-bold text-slate-700">دسته‌بندی کالا <span class="text-rose-500">*</span></label>
                                <button type="button" onclick="const c = document.getElementById('npNewCatBox'); c.classList.toggle('hidden'); if(!c.classList.contains('hidden')) document.getElementById('npCustomCategory').focus();" class="text-[10px] text-purple-600 hover:text-purple-800 font-bold flex items-center gap-0.5">
                                    <i data-lucide="plus" class="w-3 h-3"></i>
                                    <span>+ دسته‌بندی جدید</span>
                                </button>
                            </div>
                            <select id="npCategory" onchange="if(this.value === '__NEW__'){ document.getElementById('npNewCatBox').classList.remove('hidden'); document.getElementById('npCustomCategory').focus(); } else { document.getElementById('npNewCatBox').classList.add('hidden'); }" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white">
                                <option value="">-- انتخاب از دسته‌بندی‌های موجود --</option>
                                ${cats.map(c => `<option value="${c.id}">${c.name_fa}</option>`).join('')}
                                <option value="__NEW__" class="text-purple-700 font-bold">+ افزودن دسته‌بندی جدید دستی...</option>
                            </select>
                            <div id="npNewCatBox" class="hidden mt-1.5 p-2 bg-purple-50/70 border border-purple-200 rounded-xl">
                                <label class="block text-[10px] font-bold text-purple-800 mb-0.5">نام دسته‌بندی جدید دستی:</label>
                                <input type="text" id="npCustomCategory" placeholder="مثلاً: ماسک صورت، پالت سایه، بادی اسپلش..." class="w-full p-2 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-900 outline-none">
                            </div>
                        </div>

                        <!-- Brand -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="font-bold text-slate-700">برند سازنده <span class="text-rose-500">*</span></label>
                                <button type="button" onclick="const b = document.getElementById('npNewBrandBox'); b.classList.toggle('hidden'); if(!b.classList.contains('hidden')) document.getElementById('npCustomBrand').focus();" class="text-[10px] text-purple-600 hover:text-purple-800 font-bold flex items-center gap-0.5">
                                    <i data-lucide="plus" class="w-3 h-3"></i>
                                    <span>+ نوشتن برند دستی</span>
                                </button>
                            </div>
                            <select id="npBrand" onchange="if(this.value === '__NEW__'){ document.getElementById('npNewBrandBox').classList.remove('hidden'); document.getElementById('npCustomBrand').focus(); } else { document.getElementById('npNewBrandBox').classList.add('hidden'); }" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white">
                                <option value="">-- انتخاب از برندهای موجود --</option>
                                ${brands.map(b => `<option value="${b.id}">${b.name} (${b.name_fa || ''})</option>`).join('')}
                                <option value="__NEW__" class="text-purple-700 font-bold">+ نوشتن نام برند جدید دستی...</option>
                            </select>
                            <div id="npNewBrandBox" class="hidden mt-1.5 p-2 bg-purple-50/70 border border-purple-200 rounded-xl">
                                <label class="block text-[10px] font-bold text-purple-800 mb-0.5">نام برند سازنده (دستی):</label>
                                <input type="text" id="npCustomBrand" placeholder="مثلاً: Huda Beauty، نارس، سینره، مای..." class="w-full p-2 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-900 outline-none">
                            </div>
                        </div>

                        <!-- Barcode -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">کد بارکد محصول</label>
                            <div class="flex gap-1.5">
                                <input type="text" id="npBarcode" value="${autoBarcode}" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800">
                                <button onclick="document.getElementById('npBarcode').value='626' + Math.floor(1000000000 + Math.random() * 9000000000)" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] shrink-0 font-medium">تولید بارکد</button>
                            </div>
                        </div>

                        <!-- Initial Quantity -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">موجودی اولیه ورودی انبار (تعداد) <span class="text-rose-500">*</span></label>
                            <input type="number" id="npQuantity" value="10" min="1" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-purple-700">
                        </div>

                        <!-- Purchase Price -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">قیمت خرید از تأمین‌کننده (تومان) <span class="text-rose-500">*</span></label>
                            <input type="number" id="npPurchasePrice" value="350000" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono">
                        </div>

                        <!-- Selling Price -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">قیمت فروش در صندوق POS (تومان) <span class="text-rose-500">*</span></label>
                            <input type="number" id="npSellingPrice" value="520000" class="w-full p-2.5 border border-purple-300 bg-purple-50/40 rounded-xl text-xs font-mono font-bold text-slate-900">
                        </div>

                        <!-- Batch Number -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">شماره بچ / سری ساخت (Lot)</label>
                            <input type="text" id="npBatchNumber" value="${autoLot}" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono">
                        </div>

                        <!-- Expiry Date -->
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">تاریخ انقضا (FEFO) <span class="text-rose-500">*</span></label>
                            <input type="date" id="npExpiryDate" value="${autoExp}" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800">
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                        <button onclick="app.submitNewProduct()" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md shadow-purple-100 transition flex items-center gap-1.5">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            <span>ثبت کالا و نمایش در صندوق</span>
                        </button>
                    </div>
                </div>
            `);
            lucide.createIcons();
        } catch (e) {
            this.showNotification('خطا در بارگذاری فرم کالا', 'error');
        }
    },

    async submitNewProduct() {
        const nameFa = document.getElementById('npNameFa')?.value.trim();
        const nameEn = document.getElementById('npNameEn')?.value.trim();
        const shade = document.getElementById('npShade')?.value.trim();
        
        const catSelect = document.getElementById('npCategory')?.value;
        const customCategoryName = document.getElementById('npCustomCategory')?.value.trim();
        const categoryId = (catSelect && catSelect !== '__NEW__') ? Number(catSelect) : null;

        const brandSelect = document.getElementById('npBrand')?.value;
        const customBrandName = document.getElementById('npCustomBrand')?.value.trim();
        const brandId = (brandSelect && brandSelect !== '__NEW__') ? Number(brandSelect) : null;

        const barcode = document.getElementById('npBarcode')?.value.trim();
        const quantity = Number(document.getElementById('npQuantity')?.value) || 0;
        const purchasePrice = Number(document.getElementById('npPurchasePrice')?.value) || 0;
        const sellingPrice = Number(document.getElementById('npSellingPrice')?.value) || 0;
        const batchNumber = document.getElementById('npBatchNumber')?.value.trim();
        const expiryDate = document.getElementById('npExpiryDate')?.value;

        if (!nameFa || !shade || (!categoryId && !customCategoryName) || (!brandId && !customBrandName) || quantity <= 0 || sellingPrice <= 0 || !expiryDate) {
            this.showNotification('لطفاً تمامی فیلدهای الزامی (شامل نام، شید، دسته‌بندی، برند و انقضا) را تکمیل نمایید.', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/products/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nameFa,
                    nameEn,
                    shade,
                    categoryId,
                    customCategoryName,
                    brandId,
                    customBrandName,
                    barcode,
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    batchNumber,
                    expiryDate
                })
            });

            const json = await res.json();
            if (json.success) {
                this.closeModal();
                this.showNotification(`کالای «${nameFa}» با موجودی ${quantity} عدد در انبار ثبت شد و فوراً در صندوق فروش POS قرار گرفت.`, 'success');
                if (this.currentSection === 'products') this.renderProducts();
                else if (this.currentSection === 'inventory') inventory.loadTabContent();
                else if (this.currentSection === 'pos') {
                    if (pos.loadProducts) pos.loadProducts();
                    if (pos.loadCategoryPills) pos.loadCategoryPills();
                }
            } else {
                this.showNotification(json.error || 'خطا در ثبت کالا', 'error');
            }
        } catch (e) {
            this.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    // 9. Audit Logs View
    async renderAuditLogs() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال دریافت لاگ‌های ممیزی...</div>`;

        try {
            const res = await fetch('/api/audit-logs');
            const json = await res.json();
            const logs = json.data || [];

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="shield-check" class="w-5 h-5 text-purple-600"></i>
                            <span>لاگ ممیزی و پایش فعالیت‌های کاربران (Audit Logs)</span>
                        </h2>
                        <p class="text-xs text-slate-500">ثبت وقایع حساس: تغییرات قیمت، تخفیف‌های بالا، باز و بسته شدن صندوق و دسترسی‌ها</p>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="p-3.5">زمان رویداد</th>
                                    <th class="p-3.5">کاربر</th>
                                    <th class="p-3.5">نوع عملیات</th>
                                    <th class="p-3.5">شرح واقعه</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${logs.map(l => `
                                    <tr>
                                        <td class="p-3.5 font-mono text-slate-500">${l.created_at}</td>
                                        <td class="p-3.5 font-bold text-slate-800">${l.employee_name || 'سیستم'}</td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">${l.action_type}</span>
                                        </td>
                                        <td class="p-3.5 text-slate-700">${l.details}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری لاگ‌ها</div>`;
        }
    },

    // 10. Trigger 90-Day Simulation
    async trigger90DaySimulation() {
        this.openModal(`
            <div class="space-y-4 text-center p-4">
                <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <i data-lucide="play-circle" class="w-6 h-6 animate-spin"></i>
                </div>
                <h3 class="text-base font-bold text-slate-900">شبیه‌سازی ۹۰ روز عملیات واقعی فروشگاه</h3>
                <p class="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    در حال اجرای روزبه‌روز بیش از ۱۰۰۰ فاکتور فروش POS، کسر انبار بر اساس FEFO، خریدهای جدید، پاس شدن چک‌های تأمین‌کنندگان، ثبت تسترها، حقوق و هزینه‌ها، و آزمون تراز بودن ۱۰۰٪ دفاتر دوبل...
                </p>
                <div class="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-600">
                    لطفاً چند ثانیه شکیبا باشید...
                </div>
            </div>
        `);

        try {
            const res = await fetch('/api/simulate-90-days', { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                const r = json.data;
                this.openModal(`
                    <div class="space-y-4 p-4 text-xs">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                            <i data-lucide="check-circle" class="w-6 h-6"></i>
                        </div>
                        <h3 class="text-base font-bold text-slate-900 text-center">شبیه‌سازی ۹۰ روزه با موفقیت ۱۰۰٪ پایان یافت!</h3>
                        <div class="bg-slate-50 p-4 rounded-xl space-y-2">
                            <div class="flex justify-between"><span>تعداد فاکتورهای فروش صادر شده:</span><strong class="font-mono text-purple-700">${r.totalOrdersGenerated} فاکتور</strong></div>
                            <div class="flex justify-between"><span>مجموع فروش خرده‌فروشی:</span><strong class="font-mono text-slate-900">${Number(r.totalRevenue).toLocaleString('fa-IR')} تومان</strong></div>
                            <div class="flex justify-between"><span>رسیدهای انبار و خریدهای جدید (FEFO):</span><strong class="font-mono text-blue-700">${r.totalRestocks} محموله</strong></div>
                            <div class="flex justify-between"><span>چک‌های پاس‌شده تأمین‌کنندگان:</span><strong class="font-mono text-emerald-700">${r.totalChequesCleared} فقره چک</strong></div>
                            <div class="flex justify-between"><span>هزینه‌ها، حقوق و اجاره ثبت‌شده:</span><strong class="font-mono text-rose-700">${Number(r.totalExpenses).toLocaleString('fa-IR')} تومان</strong></div>
                            <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-emerald-800">
                                <span>آزمون تراز دفاتر دوبل (Trial Balance):</span>
                                <span>مغایرت صفر مطلق ✅</span>
                            </div>
                        </div>
                        <div class="flex justify-center pt-2">
                            <button onclick="app.closeModal(); app.renderDashboard('SEASON');" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition">
                                مشاهده در داشبورد
                            </button>
                        </div>
                    </div>
                `);
                this.showNotification('شبیه‌سازی ۹۰ روزه با موفقیت انجام شد!', 'success');
            }
        } catch (e) {
            this.openModal(`
                <div class="p-4 text-center space-y-3">
                    <h3 class="text-rose-600 font-bold">خطا در شبیه‌سازی</h3>
                    <p class="text-xs text-slate-500">${e.message}</p>
                    <button onclick="app.closeModal()" class="px-4 py-2 bg-slate-100 rounded-xl text-xs">بستن</button>
                </div>
            `);
        }
    },

    async resolveAlert(id) {
        await fetch(`/api/alerts/${id}/resolve`, { method: 'POST' });
        this.renderAlerts();
        this.updateAlertCount();
        this.showNotification('هشدار برطرف شد', 'info');
    },

    async updateAlertCount() {
        try {
            const res = await fetch('/api/alerts');
            const json = await res.json();
            const count = (json.data || []).length;
            const badge = document.getElementById('unreadAlertCount');
            if (badge) {
                badge.innerText = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        } catch (e) {}
    },

    // 14. Settings & User Management View (تنظیمات مدیر و سطوح دسترسی)
    async renderSettings() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `<div class="py-12 text-center text-slate-400">در حال دریافت فهرست کاربران و تنظیمات دسترسی...</div>`;

        try {
            const res = await fetch('/api/admin/users');
            const json = await res.json();
            const users = json.data || [];
            this.cachedUsers = users;

            const moduleLabels = {
                'dashboard': 'داشبورد',
                'pos': 'صندوق POS',
                'products': 'کالاها',
                'inventory': 'انبارداری',
                'purchasing': 'خرید',
                'omnichannel': 'آنلاین/پیک',
                'crm': 'باشگاه مشتریان',
                'marketing': 'بازاریابی',
                'accounting': 'حسابداری',
                'reports': 'گزارشات',
                'bi': 'هوش تجاری',
                'audit': 'امنیت',
                'alerts': 'هشدارها',
                'settings': 'تنظیمات'
            };

            const activeAdminsCount = users.filter(u => u.is_active && u.role !== 'MANAGER').length;
            const managersCount = users.filter(u => u.role === 'MANAGER').length;

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Header -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div>
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl shadow-inner">
                                    <i data-lucide="settings" class="w-6 h-6"></i>
                                </div>
                                <div>
                                    <h1 class="text-xl font-black text-slate-900">تنظیمات سامانه و مدیریت ادمین‌ها</h1>
                                    <p class="text-xs text-slate-500 mt-0.5">تعریف ادمین جدید، تغییر رمز عبور و تنظیم دقیق سطوح دسترسی به ماژول‌های سیستم</p>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <button onclick="app.openUserModal()" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-200 flex items-center gap-2 transition cursor-pointer">
                                <i data-lucide="user-plus" class="w-4 h-4"></i>
                                <span>+ ایجاد کاربر / ادمین جدید</span>
                            </button>
                        </div>
                    </div>

                    <!-- KPI Cards Row -->
                    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                <i data-lucide="users" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-[11px] text-slate-400 font-bold">کل کاربران سامانه</div>
                                <div class="text-lg font-black text-slate-800">${users.length} نفر</div>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <i data-lucide="user-check" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-[11px] text-slate-400 font-bold">ادمین‌های فعال</div>
                                <div class="text-lg font-black text-emerald-600">${activeAdminsCount} نفر</div>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <i data-lucide="shield" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-[11px] text-slate-400 font-bold">مدیران سیستم</div>
                                <div class="text-lg font-black text-indigo-600">${managersCount} نفر</div>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <i data-lucide="wifi-off" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-[11px] text-slate-400 font-bold">وضعیت اینترنت</div>
                                <div class="text-xs font-bold text-amber-600">۱۰۰٪ آفلاین محلی</div>
                            </div>
                        </div>
                    </div>

                    <!-- Users Table -->
                    <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div class="font-bold text-sm text-slate-800 flex items-center gap-2">
                                <i data-lucide="shield-check" class="w-4 h-4 text-purple-600"></i>
                                <span>فهرست حساب‌های کاربری و سطوح دسترسی</span>
                            </div>
                            <span class="text-xs text-slate-400">بانک اطلاعات محلی SQLite</span>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="w-full text-right text-xs">
                                <thead class="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold">
                                    <tr>
                                        <th class="p-4">شناسه / نام کاربری</th>
                                        <th class="p-4">نام و نام خانوادگی</th>
                                        <th class="p-4">نقش سازمانی</th>
                                        <th class="p-4">شماره تماس</th>
                                        <th class="p-4">وضعیت</th>
                                        <th class="p-4">بخش‌های مجاز (سطح دسترسی)</th>
                                        <th class="p-4 text-center">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${users.map(u => {
                                        const isMan = u.role === 'MANAGER';
                                        const roleBadge = isMan 
                                            ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">مدیر کل</span>'
                                            : '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">ادمین / صندوق‌دار</span>';
                                        
                                        const statusBadge = u.is_active
                                            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600">فعال</span>'
                                            : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600">غیرفعال</span>';

                                        const permChips = isMan 
                                            ? '<span class="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg">دسترسی کامل به تمام ماژول‌ها</span>'
                                            : (Array.isArray(u.permissions) && u.permissions.length > 0 
                                                ? u.permissions.map(p => `<span class="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] m-0.5 font-medium">${moduleLabels[p] || p}</span>`).join('')
                                                : '<span class="text-slate-400">صندوق و CRM (پیش‌فرض)</span>');

                                        return `
                                            <tr class="hover:bg-slate-50/70 transition">
                                                <td class="p-4 font-mono font-bold text-slate-800">
                                                    <div class="flex items-center gap-1.5">
                                                        <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
                                                        <span>${u.username}</span>
                                                    </div>
                                                </td>
                                                <td class="p-4 font-bold text-slate-900">${u.full_name}</td>
                                                <td class="p-4">${roleBadge}</td>
                                                <td class="p-4 font-mono text-slate-600">${u.phone || '-'}</td>
                                                <td class="p-4">${statusBadge}</td>
                                                <td class="p-4 max-w-xs">${permChips}</td>
                                                <td class="p-4">
                                                    <div class="flex items-center justify-center gap-2">
                                                        <button onclick="app.openUserModal(${u.id})" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer" title="ویرایش مشخصات و دسترسی">
                                                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                                                            <span>ویرایش و رمز</span>
                                                        </button>
                                                        ${!isMan && u.username !== 'admin' ? `
                                                            <button onclick="app.deleteUser(${u.id}, '${u.username}')" class="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold transition cursor-pointer" title="حذف کاربر">
                                                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                                            </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
        } catch (err) {
            container.innerHTML = `<div class="p-6 text-center text-rose-500">خطا در بارگذاری بخش تنظیمات: ${err.message}</div>`;
        }
    },

    openUserModal(userId = null) {
        const user = userId ? (this.cachedUsers || []).find(u => u.id === userId) : null;
        const isEdit = !!user;

        const availableModules = [
            { key: 'pos', label: 'صندوق فروش و تسویه فاکتور (POS)', desc: 'ثبت فاکتور، تسویه کارت/نقد، جستجوی بارکد' },
            { key: 'crm', label: 'باشگاه مشتریان و CRM', desc: 'مشاهده مشتریان، کیف پول، امتیاز وفاداری، تاریخچه خرید' },
            { key: 'alerts', label: 'مرکز هشدارها', desc: 'مشاهده هشدارهای کسری کالا و انقضا' },
            { key: 'products', label: 'کاتالوگ و تعریف کالاها', desc: 'افزودن و ویرایش محصولات، بارکد، شید رنگی' },
            { key: 'inventory', label: 'انبارداری و تاریخ انقضا (FEFO)', desc: 'موجودی انبارها، انبارگردانی، ضایعات و تستر' },
            { key: 'purchasing', label: 'خرید و زنجیره تأمین', desc: 'فاکتور خرید، تأمین‌کنندگان، بستانکاران' },
            { key: 'omnichannel', label: 'فروش آنلاین و پیک', desc: 'سفارشات اینستاگرام و سایت، وضعیت ارسال پیک' },
            { key: 'marketing', label: 'کمپین‌های بازاریابی و پیامک', desc: 'طراحی کمپین‌های تخفیفی و مناسبتی' },
            { key: 'accounting', label: 'حسابداری دوبل و خزانه‌داری', desc: 'اسناد دوبل، دفتر روزنامه، چک‌ها، تراز مالی' },
            { key: 'reports', label: 'گزارشات فروش و Z-Report', desc: 'گزارش روزانه صندوق، بستن صندوق، سود ناخالص' },
            { key: 'bi', label: 'هوش تجاری و تحلیل سود (BI)', desc: 'نمودارهای روند فروش، مشتریان وفادار، سودآوری' },
            { key: 'audit', label: 'لاگ ممیزی و امنیت', desc: 'ثبت کلیه لاگ‌های ورود، حذف و تغییرات دیتابیس' }
        ];

        const userPerms = user ? (user.permissions || []) : ['pos', 'crm', 'alerts'];
        const isUserAdmin = user ? (user.role === 'ADMIN') : true;
        const isUserManager = user ? (user.role === 'MANAGER') : false;

        this.openModal(`
            <div class="space-y-4 text-xs">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                            <i data-lucide="${isEdit ? 'user-cog' : 'user-plus'}" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-sm text-slate-900">${isEdit ? `ویرایش کاربر: ${user.full_name}` : 'تعریف کاربر / ادمین جدید'}</h3>
                            <p class="text-[11px] text-slate-500">${isEdit ? 'تغییر رمز عبور، نقش و ماژول‌های مجاز کاربر' : 'مشخصات حساب کاربری و تنظیم سطح دسترسی دقیق'}</p>
                        </div>
                    </div>
                </div>

                <form onsubmit="event.preventDefault(); app.saveUser(${userId});" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">نام و نام خانوادگی <span class="text-rose-500">*</span></label>
                            <input type="text" id="userFullNameInput" value="${user?.full_name || ''}" placeholder="مثلاً: علی رضایی" required class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold focus:border-purple-600 outline-none">
                        </div>

                        <div>
                            <label class="block font-bold text-slate-700 mb-1">نام کاربری (لاگین) <span class="text-rose-500">*</span></label>
                            <input type="text" id="userUsernameInput" value="${user?.username || ''}" ${isEdit ? 'readonly disabled' : ''} placeholder="e.g. admin_pos" required class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:border-purple-600 outline-none ${isEdit ? 'bg-slate-100 text-slate-500' : ''}">
                        </div>

                        <div>
                            <label class="block font-bold text-slate-700 mb-1">رمز عبور ${isEdit ? '(اگر تغییر نمی‌کند خالی بگذارید)' : '<span class="text-rose-500">*</span>'}</label>
                            <input type="password" id="userPasswordInput" placeholder="${isEdit ? 'رمز جدید را وارد کنید...' : 'حداقل ۳ رقم (مثلاً ۱۲۳۴۵۶)'}" ${isEdit ? '' : 'required'} class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:border-purple-600 outline-none">
                        </div>

                        <div>
                            <label class="block font-bold text-slate-700 mb-1">شماره همراه پرسنل</label>
                            <input type="text" id="userPhoneInput" value="${user?.phone || ''}" placeholder="09120000000" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:border-purple-600 outline-none">
                        </div>

                        <div>
                            <label class="block font-bold text-slate-700 mb-1">نقش سازمانی</label>
                            <select id="userRoleSelect" onchange="app.handleRoleChange(this.value)" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:border-purple-600 outline-none">
                                <option value="ADMIN" ${isUserAdmin ? 'selected' : ''}>ادمین فروشگاه (دسترسی انتخابی)</option>
                                <option value="MANAGER" ${isUserManager ? 'selected' : ''}>مدیر ارشد فروشگاه (دسترسی نامحدود به همه چیز)</option>
                            </select>
                        </div>

                        <div>
                            <label class="block font-bold text-slate-700 mb-1">وضعیت حساب</label>
                            <div class="mt-2 flex items-center gap-2">
                                <label class="inline-flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="userActiveCheck" ${user ? (user.is_active ? 'checked' : '') : 'checked'} class="w-4 h-4 text-purple-600 rounded">
                                    <span class="font-bold text-slate-700">حساب کاربری فعال است و امکان ورود دارد</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Permissions Section -->
                    <div id="permissionsContainer" class="pt-3 border-t border-slate-100 ${isUserManager ? 'opacity-50 pointer-events-none' : ''}">
                        <div class="flex items-center justify-between mb-2">
                            <label class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                <i data-lucide="key" class="w-3.5 h-3.5 text-purple-600"></i>
                                <span>سطح دسترسی و ماژول‌های مجاز برای این کاربر:</span>
                            </label>
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="app.setAllPermissions(true)" class="text-[10px] text-purple-600 hover:text-purple-800 font-bold cursor-pointer">انتخاب همه</button>
                                <span class="text-slate-300">|</span>
                                <button type="button" onclick="app.setAllPermissions(false)" class="text-[10px] text-slate-500 hover:text-slate-700 font-bold cursor-pointer">عدم انتخاب</button>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                            ${availableModules.map(m => {
                                const checked = userPerms.includes(m.key) ? 'checked' : '';
                                return `
                                    <label class="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white transition cursor-pointer border border-transparent hover:border-slate-200">
                                        <input type="checkbox" name="modulePerm" value="${m.key}" ${checked} class="w-4 h-4 mt-0.5 text-purple-600 rounded">
                                        <div>
                                            <div class="font-bold text-slate-800 text-xs">${m.label}</div>
                                            <div class="text-[10px] text-slate-500">${m.desc}</div>
                                        </div>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Footer Buttons -->
                    <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button type="button" onclick="app.closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition cursor-pointer">انصراف</button>
                        <button type="submit" id="saveUserSubmitBtn" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 transition cursor-pointer flex items-center gap-1.5">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            <span>${isEdit ? 'ذخیره تغییرات' : 'ایجاد کاربر جدید'}</span>
                        </button>
                    </div>
                </form>
            </div>
        `);
    },

    handleRoleChange(role) {
        const permContainer = document.getElementById('permissionsContainer');
        if (!permContainer) return;
        if (role === 'MANAGER') {
            permContainer.classList.add('opacity-50', 'pointer-events-none');
        } else {
            permContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
    },

    setAllPermissions(selectAll) {
        document.querySelectorAll('input[name="modulePerm"]').forEach(cb => {
            cb.checked = selectAll;
        });
    },

    async saveUser(userId = null) {
        const btn = document.getElementById('saveUserSubmitBtn');
        if (btn) btn.disabled = true;

        try {
            const full_name = document.getElementById('userFullNameInput')?.value?.trim();
            const username = document.getElementById('userUsernameInput')?.value?.trim();
            const password = document.getElementById('userPasswordInput')?.value?.trim();
            const phone = document.getElementById('userPhoneInput')?.value?.trim();
            const role = document.getElementById('userRoleSelect')?.value || 'ADMIN';
            const is_active = document.getElementById('userActiveCheck')?.checked ? 1 : 0;

            const selectedPerms = [];
            document.querySelectorAll('input[name="modulePerm"]:checked').forEach(cb => {
                selectedPerms.push(cb.value);
            });

            if (!full_name) throw new Error('نام و نام خانوادگی الزامی است.');

            const allSections = [
                'dashboard', 'pos', 'products', 'inventory', 'purchasing',
                'omnichannel', 'crm', 'marketing', 'accounting', 'reports',
                'bi', 'audit', 'alerts', 'settings'
            ];

            if (!userId) {
                // New User Creation
                if (!username) throw new Error('نام کاربری الزامی است.');
                if (!password) throw new Error('رمز عبور الزامی است.');

                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        full_name,
                        username,
                        password,
                        phone,
                        role,
                        permissions: role === 'MANAGER' ? allSections : selectedPerms
                    })
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'خطا در ثبت کاربر جدید');

                this.showNotification('کاربر جدید با موفقیت ایجاد شد.', 'success');
            } else {
                // Existing User Update
                const payload = {
                    full_name,
                    phone,
                    role,
                    is_active,
                    permissions: role === 'MANAGER' ? allSections : selectedPerms
                };
                if (password && password.length > 0) {
                    payload.password = password;
                }

                const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'خطا در ویرایش کاربر');

                this.showNotification('مشخصات و دسترسی‌های کاربر با موفقیت به‌روز شد.', 'success');
            }

            this.closeModal();
            await this.renderSettings();
        } catch (err) {
            alert(err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async deleteUser(userId, username) {
        if (!confirm(`آیا از حذف یا غیرفعال‌سازی کاربر «${username}» اطمینان دارید؟`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE'
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'خطا در حذف کاربر');

            this.showNotification('کاربر با موفقیت حذف یا غیرفعال شد.', 'success');
            await this.renderSettings();
        } catch (err) {
            alert(err.message);
        }
    },

    // Global Modal Helpers
    openModal(html) {
        const overlay = document.getElementById('modalOverlay');
        const content = document.getElementById('modalContent');
        if (overlay && content) {
            content.innerHTML = html;
            overlay.classList.remove('hidden');
            lucide.createIcons();
        }
    },

    closeModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.add('hidden');
    },

    // Toast Notification
    showNotification(msg, type = 'info') {
        const div = document.createElement('div');
        const bg = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : (type === 'warning' ? 'bg-amber-600' : 'bg-purple-600'));
        div.className = `fixed bottom-5 left-5 ${bg} text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-bold z-50 transition-all transform duration-300 translate-y-10 opacity-0 flex items-center gap-2`;
        div.innerHTML = `<span>${msg}</span>`;
        document.body.appendChild(div);

        setTimeout(() => {
            div.classList.remove('translate-y-10', 'opacity-0');
        }, 10);

        setTimeout(() => {
            div.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => div.remove(), 300);
        }, 4000);
    }
};

// Start application on load
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
