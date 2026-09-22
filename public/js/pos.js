// POS & Checkout Client Module
if (typeof window !== 'undefined' && !window.normalizePersian) {
    window.normalizePersian = function(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/ة/g, 'ه')
            .replace(/ؤ/g, 'و')
            .replace(/إ/g, 'ا')
            .replace(/أ/g, 'ا')
            .replace(/ء/g, '')
            .replace(/[\u064B-\u065F]/g, '')
            .trim();
    };
}
const normalizePersian = typeof window !== 'undefined' && window.normalizePersian 
    ? window.normalizePersian 
    : (str) => (!str ? '' : String(str).replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim());

const pos = {
    cart: [],
    selectedCustomer: null,
    discountAmount: 0,
    discountReason: '',
    activeSession: null,

    async init() {
        await this.loadActiveSession();
        this.render();
        this.bindEvents();
    },

    async loadActiveSession() {
        try {
            const res = await fetch('/api/pos/active-session');
            const data = await res.json();
            if (data.success) {
                this.activeSession = data.data;
            }
        } catch (e) {
            console.error('Failed to load active cash session', e);
        }
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6">
                <!-- Left Column: Product Search & Quick Catalog (60%) -->
                <div class="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
                    <!-- Search & Barcode Input Bar -->
                    <div class="flex items-center gap-3 mb-4">
                        <!-- Quick Sidebar Toggle Button for Cashier / Admin / Manager -->
                        <button onclick="app.toggleSidebar()" title="باز / بستن هسته‌های مدیریتی برای صفحه عریض فروشگاه [Ctrl+B]" class="px-3 py-2.5 bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-700 rounded-xl text-xs font-bold border border-slate-200 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm">
                            <i data-lucide="panel-right" class="w-4 h-4 text-purple-600"></i>
                            <span id="posSidebarBtnText">صفحه عریض</span>
                        </button>

                        <div class="relative flex-1">
                            <i data-lucide="scan-barcode" class="w-5 h-5 absolute right-3 top-3 text-slate-400"></i>
                            <input type="text" id="posSearchInput" placeholder="اسکن بارکد کالا یا جستجوی نام، برند، شید رنگ (مثلاً 120 Artist)... [F2]" 
                                   class="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition">
                        </div>
                        <button onclick="pos.handleBarcodeScan()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>افزودن</span>
                        </button>
                    </div>

                    <!-- Category Pills -->
                    <div id="posCategoryPills" class="flex items-center gap-2 pb-3 overflow-x-auto border-b border-slate-100 text-xs">
                        <button onclick="pos.filterCategory('')" class="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 font-bold whitespace-nowrap">همه محصولات</button>
                    </div>

                    <!-- Products Grid -->
                    <div id="posProductGrid" class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pt-3">
                        <div class="col-span-full py-12 text-center text-slate-400">در حال بارگذاری محصولات...</div>
                    </div>
                </div>

                <!-- Right Column: Cart, Customer & Checkout (40%) -->
                <div class="w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
                    <!-- Customer Selection & CRM Integration Box -->
                    <div class="pb-3.5 border-b border-slate-100 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <span class="p-1 rounded-lg bg-purple-100 text-purple-700">
                                    <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                                </span>
                                <span>باشگاه مشتریان و CRM</span>
                            </div>
                            <button onclick="pos.openCustomerModal()" class="text-[11px] text-purple-700 hover:text-purple-900 font-bold bg-purple-50 hover:bg-purple-100 border border-purple-200/70 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer">
                                <i data-lucide="user-plus" class="w-3 h-3"></i>
                                <span>+ ثبت / لیست CRM</span>
                            </button>
                        </div>

                        <!-- Selected Customer Card (Large & Prominent) -->
                        <div id="selectedCustomerBadge"></div>

                        <!-- Integrated Real-time CRM Customer Search Input -->
                        <div class="relative">
                            <div class="relative flex items-center">
                                <i data-lucide="search" class="w-3.5 h-3.5 text-purple-500 absolute right-3 pointer-events-none"></i>
                                <input type="text" id="posInlineCustomerSearch" 
                                       placeholder="🔍 جستجوی مشتری (نام، موبایل ۰۹... یا کد)..." 
                                       oninput="pos.handleInlineCustomerSearch(this.value)" 
                                       onfocus="pos.handleInlineCustomerSearch(this.value)"
                                       autocomplete="off"
                                       class="w-full pr-9 pl-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 rounded-xl text-xs font-semibold text-slate-800 outline-none transition shadow-inner">
                                <button id="posClearCustSearchBtn" onclick="pos.clearInlineCustomerSearch()" type="button" class="hidden absolute left-2.5 text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer" title="پاک کردن جستجو">
                                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>

                            <!-- Live Dropdown Results -->
                            <div id="posInlineCustomerResults" class="hidden absolute z-30 top-full mt-1.5 right-0 left-0 bg-white rounded-xl border border-purple-200 shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100"></div>
                        </div>
                    </div>

                    <!-- Cart Items List -->
                    <div class="flex-1 overflow-y-auto divide-y divide-slate-100 py-2" id="cartItemList">
                        <div class="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                            <i data-lucide="shopping-bag" class="w-10 h-10 text-slate-300"></i>
                            <span class="text-sm">سبد خرید خالی است</span>
                            <span class="text-xs text-slate-400">با کلیک روی کالا یا اسکن بارکد، اقلام اضافه می‌شوند</span>
                        </div>
                    </div>

                    <!-- Cart Summary & Calculation -->
                    <div class="pt-3 border-t border-slate-100 space-y-2 text-xs">
                        <div class="flex justify-between text-slate-600">
                            <span>جمع اقلام:</span>
                            <span id="posSubtotal" class="font-bold">۰ تومان</span>
                        </div>
                        <div class="flex justify-between items-center text-slate-600">
                            <span class="flex items-center gap-1">
                                <span>تخفیف:</span>
                                <button onclick="pos.openDiscountModal()" class="text-[10px] text-purple-600 hover:underline">[F8 تنظیم]</button>
                            </span>
                            <span id="posDiscount" class="text-rose-600 font-bold">۰ تومان</span>
                        </div>
                        <div class="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                            <span>مبلغ قابل پرداخت:</span>
                            <span id="posTotal" class="text-purple-700 text-lg">۰ تومان</span>
                        </div>

                        <!-- Action Buttons -->
                        <div class="space-y-2 pt-2">
                            <!-- Primary Full Checkout -->
                            <button onclick="pos.openCheckoutModal('POS')" class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white py-3 rounded-xl font-bold text-sm shadow-md shadow-emerald-100 flex items-center justify-center gap-2 transition cursor-pointer">
                                <i data-lucide="credit-card" class="w-5 h-5"></i>
                                <span>ثبت و تسویه فاکتور [F4]</span>
                            </button>

                            <!-- Dedicated Split Payment Button -->
                            <button onclick="pos.openCheckoutModal('SPLIT')" class="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white py-2.5 rounded-xl font-black text-xs shadow-md shadow-orange-100 flex items-center justify-center gap-2 transition cursor-pointer">
                                <i data-lucide="pie-chart" class="w-4 h-4"></i>
                                <span>پرداخت ترکیبی (نقد + کارتخوان + کارت‌به‌کارت)</span>
                            </button>

                            <!-- Secondary Utilities -->
                            <div class="grid grid-cols-2 gap-2 pt-0.5">
                                <button onclick="pos.openExchangeModal()" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer">
                                    <i data-lucide="repeat" class="w-4 h-4 text-amber-600"></i>
                                    <span>تعویض کالا</span>
                                </button>

                                <button onclick="pos.openCloseSessionModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer">
                                    <i data-lucide="lock" class="w-4 h-4"></i>
                                    <span>بستن شیفت صندوق</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.app && typeof app.updateSidebarUIState === 'function') {
            app.updateSidebarUIState();
        }
        this.renderSelectedCustomerBadge();
        lucide.createIcons();
        this.loadCategoryPills();
        this.loadProducts();
    },

    bindEvents() {
        const searchInput = document.getElementById('posSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.loadProducts(e.target.value);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleBarcodeScan();
                }
            });
        }

        // Global Shortcuts (F2, F4, F8)
        window.onkeydown = (e) => {
            if (e.key === 'F2') {
                e.preventDefault();
                document.getElementById('posSearchInput')?.focus();
            } else if (e.key === 'F4') {
                e.preventDefault();
                pos.openCheckoutModal('POS');
            } else if (e.key === 'F8') {
                e.preventDefault();
                pos.openDiscountModal();
            }
        };

        // Close inline customer search when clicking outside
        document.addEventListener('click', (e) => {
            const box = e.target.closest('#posInlineCustomerSearch, #posInlineCustomerResults, #posClearCustSearchBtn');
            if (!box) {
                this.closeCustomerSearchResults();
            }
        });
    },

    async loadProducts(query = '') {
        try {
            const res = await fetch(`/api/pos/products?q=${encodeURIComponent(query)}`);
            const json = await res.json();
            if (json.success) {
                this.renderProductGrid(json.data);
            }
        } catch (e) {
            console.error('Error loading products', e);
        }
    },

    renderProductGrid(products) {
        const grid = document.getElementById('posProductGrid');
        if (!grid) return;

        if (products.length === 0) {
            grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400">کالایی با این مشخصات یافت نشد</div>';
            return;
        }

        grid.innerHTML = products.map(p => `
            <div onclick="pos.addToCart(${JSON.stringify(p).replace(/"/g, '&quot;')})" 
                 class="group relative bg-white border ${p.total_stock === 0 ? 'border-slate-200 opacity-60' : (p.total_stock < 3 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200')} hover:border-purple-400 hover:shadow-md rounded-xl p-3 cursor-pointer transition flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between text-[11px] mb-1">
                        <span class="font-bold text-slate-700">${p.brand_name}</span>
                        ${p.total_stock === 0 
                            ? `<span class="text-rose-700 font-bold bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">اتمام موجودی</span>` 
                            : (p.total_stock < 3 
                                ? `<span class="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-[10px] animate-pulse">هشدار کسری: ${p.total_stock} عدد</span>` 
                                : `<span class="text-slate-500 text-[10px]">موجودی: ${p.total_stock}</span>`)}
                    </div>
                    <div class="text-xs font-semibold text-slate-800 group-hover:text-purple-700 line-clamp-2 leading-tight mb-2">
                        ${p.product_name_fa || p.product_name}
                    </div>
                    ${p.shade ? `
                        <div class="text-[11px] text-slate-600 flex items-center mb-2">
                            <span class="shade-swatch" style="background-color: ${p.color_hex || '#ccc'}"></span>
                            <span class="font-medium">${p.shade}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span class="text-xs font-bold text-purple-700">${Number(p.selling_price).toLocaleString('fa-IR')} تومان</span>
                    <span class="w-6 h-6 rounded-lg ${p.total_stock === 0 ? 'bg-slate-100 text-slate-400' : 'bg-purple-50 group-hover:bg-purple-600 group-hover:text-white text-purple-600'} flex items-center justify-center text-xs transition">
                        +
                    </span>
                </div>
            </div>
        `).join('');
    },

    async loadCategoryPills(activeCat = '') {
        const container = document.getElementById('posCategoryPills');
        if (!container) return;

        try {
            const res = await fetch('/api/categories');
            const json = await res.json();
            const cats = json.data || [];

            container.innerHTML = `
                <button onclick="pos.filterCategory('')" class="px-3 py-1.5 rounded-lg ${!activeCat ? 'bg-purple-100 text-purple-700 font-bold' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} whitespace-nowrap transition">همه محصولات</button>
                ${cats.map(c => `
                    <button onclick="pos.filterCategory('${c.name_fa}')" class="px-3 py-1.5 rounded-lg ${activeCat === c.name_fa ? 'bg-purple-100 text-purple-700 font-bold' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} whitespace-nowrap transition">${c.name_fa}</button>
                `).join('')}
            `;
        } catch (e) {
            console.error('Error loading category pills', e);
        }
    },

    filterCategory(catName) {
        this.loadCategoryPills(catName);
        this.loadProducts(catName);
    },

    async handleBarcodeScan() {
        const input = document.getElementById('posSearchInput');
        const val = input.value.trim();
        if (!val) return;

        try {
            const res = await fetch(`/api/pos/barcode/${encodeURIComponent(val)}`);
            const json = await res.json();
            if (json.success && json.data) {
                this.addToCart(json.data);
                input.value = '';
                app.showNotification(`کالای ${json.data.product_name_fa} اضافه شد`, 'success');
            } else {
                // If not exact barcode, filter list
                this.loadProducts(val);
            }
        } catch (e) {
            this.loadProducts(val);
        }
    },

    addToCart(product) {
        if (product.total_stock <= 0) {
            app.showNotification('این کالا در انبار ناموجود است!', 'error');
            return;
        }

        const existing = this.cart.find(item => item.variantId === product.variant_id);
        if (existing) {
            if (existing.quantity + 1 > product.total_stock) {
                app.showNotification(`حداکثر موجودی قابل سفارش (${product.total_stock} عدد) رعایت شده است.`, 'warning');
                return;
            }
            existing.quantity++;
        } else {
            this.cart.push({
                variantId: product.variant_id,
                name: product.product_name_fa || product.product_name,
                brand: product.brand_name,
                shade: product.shade,
                colorHex: product.color_hex,
                unitPrice: Number(product.selling_price),
                maxStock: product.total_stock,
                quantity: 1
            });
        }

        this.renderCart();
    },

    updateCartQuantity(variantId, delta) {
        const item = this.cart.find(i => i.variantId === variantId);
        if (!item) return;

        item.quantity += delta;
        if (item.quantity <= 0) {
            this.cart = this.cart.filter(i => i.variantId !== variantId);
        } else if (item.quantity > item.maxStock) {
            item.quantity = item.maxStock;
            app.showNotification('حداکثر موجودی انبار رعایت شد', 'warning');
        }

        this.renderCart();
    },

    renderCart() {
        const list = document.getElementById('cartItemList');
        if (!list) return;

        if (this.cart.length === 0) {
            list.innerHTML = `
                <div class="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                    <i data-lucide="shopping-bag" class="w-10 h-10 text-slate-300"></i>
                    <span class="text-sm">سبد خرید خالی است</span>
                    <span class="text-xs text-slate-400">با کلیک روی کالا یا اسکن بارکد، اقلام اضافه می‌شوند</span>
                </div>
            `;
            this.updateTotals();
            lucide.createIcons();
            return;
        }

        list.innerHTML = this.cart.map(item => `
            <div class="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-slate-800 truncate">${item.name}</div>
                    <div class="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span>${item.brand}</span>
                        ${item.shade ? `
                            <span>•</span>
                            <span class="shade-swatch !w-2.5 !h-2.5" style="background-color: ${item.colorHex || '#ccc'}"></span>
                            <span>${item.shade}</span>
                        ` : ''}
                    </div>
                    <div class="text-[11px] text-purple-700 font-semibold mt-1">
                        ${(item.unitPrice * item.quantity).toLocaleString('fa-IR')} تومان
                    </div>
                </div>

                <!-- Quantity Controls -->
                <div class="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <button onclick="pos.updateCartQuantity(${item.variantId}, -1)" class="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
                        -
                    </button>
                    <span class="w-8 text-center font-bold text-slate-800">${item.quantity}</span>
                    <button onclick="pos.updateCartQuantity(${item.variantId}, 1)" class="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
                        +
                    </button>
                </div>
            </div>
        `).join('');

        this.updateTotals();
        lucide.createIcons();
    },

    updateTotals() {
        const subtotal = this.cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
        const total = Math.max(0, subtotal - this.discountAmount);

        document.getElementById('posSubtotal').innerText = `${subtotal.toLocaleString('fa-IR')} تومان`;
        document.getElementById('posDiscount').innerText = `${this.discountAmount.toLocaleString('fa-IR')} تومان`;
        document.getElementById('posTotal').innerText = `${total.toLocaleString('fa-IR')} تومان`;
    },

    // Customer Selection Modal
    async openCustomerModal() {
        try {
            const res = await fetch('/api/crm/customers');
            const json = await res.json();
            this.allCustomers = json.data || [];

            app.openModal(`
                <div class="space-y-4 text-xs">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                            <h3 class="text-base font-bold text-slate-900 flex items-center gap-1.5">
                                <i data-lucide="user-check" class="w-5 h-5 text-purple-600"></i>
                                <span>انتخاب یا جستجوی مشتری (باشگاه مشتریان و تخفیف)</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">جستجو بر اساس نام، شماره همراه، کد مشتری یا ثبت سریع مشتری جدید</p>
                        </div>
                    </div>

                    <!-- Search Input & Quick Add Button -->
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <input type="text" id="custSearchInput" oninput="pos.filterCustomers(this.value)" 
                                   placeholder="🔍 تایپ کنید: نام مشتری، شماره موبایل یا کد..." 
                                   class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-purple-600 outline-none transition">
                        </div>
                        <button onclick="pos.toggleQuickCustomerForm()" class="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-xl font-bold flex items-center gap-1 transition shrink-0">
                            <i data-lucide="user-plus" class="w-4 h-4"></i>
                            <span>+ مشتری جدید</span>
                        </button>
                    </div>

                    <!-- Quick Register Collapsible Form -->
                    <div id="quickCustForm" class="hidden p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-2.5">
                        <div class="flex items-center justify-between font-bold text-purple-900 text-xs">
                            <span>ثبت سریع مشتری جدید در باشگاه:</span>
                            <span id="qcMobileCount" class="text-[11px] font-mono font-bold text-slate-400">۰ / ۱۱ رقم</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="text" id="qcName" placeholder="نام و نام خانوادگی *" class="p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-purple-600">
                            <input type="tel" id="qcMobile" maxlength="11" placeholder="شماره همراه (۰۹۱۲۳۴۵۶۷۸۹) *" 
                                   oninput="pos.handleQuickMobileInput(this)"
                                   dir="ltr" class="p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-left outline-none focus:border-purple-600">
                        </div>
                        <div id="qcMobileError" class="hidden p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
                            <i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0 text-rose-600"></i>
                            <span id="qcMobileErrorText">شماره همراه باید دقیقاً ۱۱ رقم و با ۰۹ شروع شود.</span>
                        </div>
                        <div class="flex justify-end gap-2 pt-1">
                            <button onclick="pos.toggleQuickCustomerForm()" class="px-3 py-1.5 text-slate-500 hover:bg-white rounded-lg cursor-pointer">انصراف</button>
                            <button onclick="pos.saveQuickCustomer()" class="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-sm cursor-pointer">ذخیره و انتخاب در فاکتور</button>
                        </div>
                    </div>

                    <!-- Customers List Container -->
                    <div class="space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100" id="custModalList">
                        ${this.renderCustomerRows(this.allCustomers)}
                    </div>

                    <div class="flex justify-end pt-2 border-t border-slate-100">
                        <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl">بستن پنجره</button>
                    </div>
                </div>
            `);
            lucide.createIcons();
            setTimeout(() => document.getElementById('custSearchInput')?.focus(), 150);
        } catch (e) {
            app.showNotification('خطا در دریافت لیست مشتریان', 'error');
        }
    },

    renderCustomerRows(customers) {
        let html = `
            <div onclick="pos.selectCustomer(null)" class="p-2.5 hover:bg-purple-50 rounded-xl cursor-pointer flex items-center justify-between border border-transparent hover:border-purple-200 transition">
                <div>
                    <div class="font-bold text-xs text-slate-800">👤 مشتری عادی / گذری (Walk-in)</div>
                    <div class="text-[10px] text-slate-400">بدون نیاز به ثبت شماره، کیف پول و امتیاز باشگاه</div>
                </div>
                <span class="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">انتخاب گذری</span>
            </div>
        `;

        if (!customers || customers.length === 0) {
            html += `<div class="py-8 text-center text-slate-400 text-xs">مشتری با این مشخصات یافت نشد</div>`;
            return html;
        }

        html += customers.map(c => `
            <div onclick="pos.selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})" class="p-2.5 hover:bg-purple-50 rounded-xl cursor-pointer flex items-center justify-between transition">
                <div>
                    <div class="font-bold text-xs text-slate-800 flex items-center gap-2">
                        <span>${c.full_name}</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.loyalty_tier === 'VIP' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-700'}">${c.loyalty_tier}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5">موبایل: <span class="font-mono font-bold">${c.mobile}</span> | کیف پول: ${Number(c.wallet_balance).toLocaleString('fa-IR')} تومان</div>
                </div>
                <div class="text-left">
                    <div class="text-xs font-bold text-purple-700 font-mono">${c.loyalty_points} امتیاز</div>
                    <div class="text-[10px] text-slate-400">${c.rfm_segment || ''}</div>
                </div>
            </div>
        `).join('');

        return html;
    },

    filterCustomers(query) {
        const q = normalizePersian(query || '').toLowerCase();
        if (!this.allCustomers) return;

        const filtered = this.allCustomers.filter(c => {
            const nameMatch = normalizePersian(c.full_name || '').toLowerCase().includes(q);
            const mobileMatch = (c.mobile || '').includes(q);
            const codeMatch = normalizePersian(c.customer_code || '').toLowerCase().includes(q);
            return nameMatch || mobileMatch || codeMatch;
        });

        const listEl = document.getElementById('custModalList');
        if (listEl) {
            listEl.innerHTML = this.renderCustomerRows(filtered);
            lucide.createIcons();
        }
    },

    toggleQuickCustomerForm() {
        const f = document.getElementById('quickCustForm');
        if (f) {
            f.classList.toggle('hidden');
            if (!f.classList.contains('hidden')) {
                document.getElementById('qcName')?.focus();
            }
        }
    },

    handleQuickMobileInput(inputEl) {
        if (!inputEl) return;
        let str = String(inputEl.value || '').trim();
        const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        const arabicDigits  = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        for (let i = 0; i < 10; i++) {
            str = str.replace(new RegExp(persianDigits[i], 'g'), String(i));
            str = str.replace(new RegExp(arabicDigits[i], 'g'), String(i));
        }
        str = str.replace(/[^\d]/g, '');
        if (str.startsWith('0098')) str = '0' + str.slice(4);
        else if (str.startsWith('98') && str.length === 12) str = '0' + str.slice(2);
        else if (str.length === 10 && str.startsWith('9')) str = '0' + str;

        if (inputEl.value !== str && str.length <= 11) {
            inputEl.value = str;
        }

        const countEl = document.getElementById('qcMobileCount');
        const errEl = document.getElementById('qcMobileError');
        if (countEl) countEl.textContent = `${str.length} / ۱۱ رقم`;

        if (str.length === 11 && str.startsWith('09')) {
            inputEl.classList.remove('border-rose-500', 'ring-2', 'ring-rose-200');
            inputEl.classList.add('border-emerald-500');
            if (errEl) errEl.classList.add('hidden');
        } else if (str.length > 0 && !str.startsWith('09')) {
            inputEl.classList.add('border-rose-500');
            inputEl.classList.remove('border-emerald-500');
        } else {
            inputEl.classList.remove('border-emerald-500', 'border-rose-500');
            if (errEl) errEl.classList.add('hidden');
        }
    },

    async saveQuickCustomer() {
        const nameEl = document.getElementById('qcName');
        const mobileEl = document.getElementById('qcMobile');
        const errEl = document.getElementById('qcMobileError');
        const errText = document.getElementById('qcMobileErrorText');

        const fullName = nameEl ? nameEl.value.trim() : '';
        const rawMobile = mobileEl ? mobileEl.value.trim() : '';

        if (!fullName) {
            app.showNotification('لطفاً نام و نام خانوادگی مشتری را وارد نمایید.', 'warning');
            nameEl?.focus();
            return;
        }

        let mobile = (rawMobile || '')
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[^\d]/g, '');
        if (mobile.startsWith('0098')) mobile = '0' + mobile.slice(4);
        else if (mobile.startsWith('98') && mobile.length === 12) mobile = '0' + mobile.slice(2);
        else if (mobile.length === 10 && mobile.startsWith('9')) mobile = '0' + mobile;

        if (mobileEl) mobileEl.value = mobile;

        if (!mobile || !/^09\d{9}$/.test(mobile)) {
            let msg = '⚠️ اخطار: فرمت شماره همراه نامعتبر است! شماره همراه باید دقیقاً ۱۱ رقم بوده و با ۰۹ شروع شود (مثال: ۰۹۱۲۳۴۵۶۷۸۹). لطفاً اصلاح نموده و سپس ثبت کنید.';
            if (mobile.length !== 11) {
                msg = `⚠️ اخطار: شماره تلفن وارد شده ${mobile.length} رقم است! شماره تلفن همراه باید دقیقاً ۱۱ رقم باشد (مثال: ۰۹۱۲۳۴۵۶۷۸۹).`;
            } else if (!mobile.startsWith('09')) {
                msg = '⚠️ اخطار: شماره تلفن همراه باید حتماً با ۰۹ آغاز شود (مثال: ۰۹۱۲۳۴۵۶۷۸۹).';
            }

            app.showNotification(msg, 'warning');
            if (errEl) {
                errEl.classList.remove('hidden');
                if (errText) errText.textContent = msg;
                lucide.createIcons();
            }
            mobileEl?.classList.add('border-rose-500', 'ring-2', 'ring-rose-200');
            mobileEl?.focus();
            return;
        }

        // Clear error styling if valid
        mobileEl?.classList.remove('border-rose-500', 'ring-2', 'ring-rose-200');
        if (errEl) errEl.classList.add('hidden');

        try {
            const res = await fetch('/api/crm/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, mobile })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`مشتری «${fullName}» با موفقیت در باشگاه ثبت و انتخاب شد.`, 'success');
                const newCust = {
                    id: json.data.customerId,
                    full_name: fullName,
                    mobile: mobile,
                    loyalty_tier: 'BRONZE',
                    loyalty_points: 0,
                    wallet_balance: 0,
                    rfm_segment: 'جدید'
                };
                if (this.allCustomers) this.allCustomers.unshift(newCust);
                this.selectCustomer(newCust);
                this.toggleQuickCustomerForm();
            } else {
                app.showNotification(json.error || 'خطا در ثبت مشتری', 'error');
                if (json.error && (json.error.includes('شماره') || json.error.includes('تکراری'))) {
                    if (errEl) {
                        errEl.classList.remove('hidden');
                        if (errText) errText.textContent = json.error;
                        lucide.createIcons();
                    }
                    mobileEl?.classList.add('border-rose-500', 'ring-2', 'ring-rose-200');
                    mobileEl?.focus();
                }
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    renderSelectedCustomerBadge() {
        const badge = document.getElementById('selectedCustomerBadge');
        if (!badge) return;
        const cust = this.selectedCustomer;
        if (cust) {
            badge.innerHTML = `
                <div class="flex items-center justify-between w-full bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 border border-purple-200/90 rounded-2xl p-2.5 shadow-xs transition">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                            ${(cust.full_name || 'م').slice(0, 1)}
                        </div>
                        <div class="min-w-0 space-y-0.5">
                            <div class="flex items-center gap-1.5 truncate">
                                <span class="text-xs font-black text-slate-900 truncate">${cust.full_name}</span>
                                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${cust.loyalty_tier === 'VIP' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-purple-100 text-purple-800'}">${cust.loyalty_tier || 'BRONZE'}</span>
                            </div>
                            <div class="text-[11px] text-slate-500 font-mono font-bold flex items-center gap-1">
                                <i data-lucide="phone" class="w-3 h-3 text-slate-400"></i>
                                <span>${cust.mobile || 'فاقد شماره تماس'}</span>
                            </div>
                            <div class="text-[10px] flex items-center gap-2 pt-0.5">
                                <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">کیف پول: <b class="font-mono">${Number(cust.wallet_balance || 0).toLocaleString('fa-IR')}</b> ت</span>
                                <span class="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">امتیاز: <b class="font-mono">${cust.loyalty_points || 0}</b></span>
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="pos.selectCustomer(null)" title="لغو انتخاب و بازگشت به مشتری گذری" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition shrink-0 cursor-pointer" aria-label="لغو انتخاب">
                        <i data-lucide="user-x" class="w-4 h-4"></i>
                    </button>
                </div>
            `;
        } else {
            badge.innerHTML = `
                <div class="flex items-center justify-between w-full bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 transition">
                    <div class="flex items-center gap-2.5">
                        <div class="w-10 h-10 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-base shrink-0">
                            <i data-lucide="user" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <div class="text-xs font-black text-slate-800">مشتری عادی / گذری (Walk-in)</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">بدون تخصیص کیف پول و امتیاز باشگاه</div>
                        </div>
                    </div>
                    <span class="text-[10px] bg-slate-200/70 text-slate-600 font-bold px-2 py-1 rounded-lg">گذری</span>
                </div>
            `;
        }
        lucide.createIcons();
    },

    async ensureCustomersLoaded() {
        if (!this.allCustomers || this.allCustomers.length === 0) {
            try {
                const res = await fetch('/api/crm/customers');
                const json = await res.json();
                this.allCustomers = json.data || [];
            } catch (e) {
                console.error('Failed to load CRM customers for POS', e);
            }
        }
    },

    normalizeSearchText(str) {
        if (!str) return '';
        let s = String(str).toLowerCase().trim();
        s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
        const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        const arabicDigits  = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        for (let i = 0; i < 10; i++) {
            s = s.replace(new RegExp(persianDigits[i], 'g'), String(i));
            s = s.replace(new RegExp(arabicDigits[i], 'g'), String(i));
        }
        return s;
    },

    async handleInlineCustomerSearch(query) {
        await this.ensureCustomersLoaded();
        const resultsContainer = document.getElementById('posInlineCustomerResults');
        const clearBtn = document.getElementById('posClearCustSearchBtn');
        if (!resultsContainer) return;

        const raw = (query || '').trim();
        if (clearBtn) {
            if (raw.length > 0) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }

        if (!raw) {
            resultsContainer.classList.add('hidden');
            return;
        }

        const q = this.normalizeSearchText(raw);
        const filtered = (this.allCustomers || []).filter(c => {
            const name = this.normalizeSearchText(c.full_name || '');
            const mob = String(c.mobile || '').replace(/[^\d]/g, '');
            const code = this.normalizeSearchText(c.customer_code || '');
            return name.includes(q) || mob.includes(q) || code.includes(q);
        });

        resultsContainer.classList.remove('hidden');
        let html = '';

        if (this.selectedCustomer) {
            html += `
                <div onclick="pos.selectCustomer(null)" class="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs text-slate-600 border-b border-slate-100 transition">
                    <span class="flex items-center gap-1.5"><i data-lucide="user-x" class="w-3.5 h-3.5 text-slate-400"></i> تغییر به مشتری گذری (بدون ثبت مشخصات)</span>
                    <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">انتخاب گذری</span>
                </div>
            `;
        }

        if (filtered.length === 0) {
            html += `
                <div class="p-3 text-center text-xs text-slate-500 space-y-2">
                    <div>مشتری با نام یا شماره «<b class="text-slate-700">${raw}</b>» در CRM یافت نشد.</div>
                    <button type="button" onclick="pos.openQuickAddFromInline('${raw.replace(/'/g, "\\'")}')" class="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer">
                        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
                        <span>+ ثبت سریع «${raw}» در باشگاه CRM</span>
                    </button>
                </div>
            `;
        } else {
            html += filtered.slice(0, 10).map(c => `
                <div onclick="pos.selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})" 
                     class="p-2.5 hover:bg-purple-50/80 cursor-pointer flex items-center justify-between transition group">
                    <div class="min-w-0 pr-1">
                        <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                            <span class="truncate group-hover:text-purple-700 font-extrabold">${c.full_name}</span>
                            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${c.loyalty_tier === 'VIP' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-purple-100 text-purple-700'}">${c.loyalty_tier || 'BRONZE'}</span>
                        </div>
                        <div class="text-[11px] text-slate-500 font-mono mt-0.5">📞 ${c.mobile || '—'}</div>
                    </div>
                    <div class="text-left shrink-0 pl-1">
                        <div class="text-[11px] font-bold text-purple-700 font-mono">${c.loyalty_points || 0} امتیاز</div>
                        <div class="text-[10px] text-emerald-700 font-bold">${Number(c.wallet_balance || 0).toLocaleString('fa-IR')} ت</div>
                    </div>
                </div>
            `).join('');

            if (filtered.length > 10) {
                html += `
                    <div onclick="pos.openCustomerModal()" class="p-2 text-center text-[11px] text-purple-600 hover:bg-purple-50 font-bold cursor-pointer transition">
                        نمایش همه ${filtered.length} مشتری منطبق در پنجره کامل...
                    </div>
                `;
            }
        }

        resultsContainer.innerHTML = html;
        lucide.createIcons();
    },

    clearInlineCustomerSearch() {
        const input = document.getElementById('posInlineCustomerSearch');
        if (input) input.value = '';
        const clearBtn = document.getElementById('posClearCustSearchBtn');
        if (clearBtn) clearBtn.classList.add('hidden');
        const res = document.getElementById('posInlineCustomerResults');
        if (res) res.classList.add('hidden');
    },

    closeCustomerSearchResults() {
        const res = document.getElementById('posInlineCustomerResults');
        if (res) res.classList.add('hidden');
    },

    async openQuickAddFromInline(query) {
        this.closeCustomerSearchResults();
        await this.openCustomerModal();
        const form = document.getElementById('quickCustForm');
        if (form && form.classList.contains('hidden')) {
            this.toggleQuickCustomerForm();
        }
        const cleanDigits = (query || '').replace(/[^\d]/g, '');
        if (cleanDigits.length >= 7) {
            const mobileInput = document.getElementById('qcMobile');
            if (mobileInput) {
                mobileInput.value = query;
                this.handleQuickMobileInput(mobileInput);
            }
            document.getElementById('qcName')?.focus();
        } else {
            const nameInput = document.getElementById('qcName');
            if (nameInput) {
                nameInput.value = query;
            }
            document.getElementById('qcMobile')?.focus();
        }
    },

    selectCustomer(cust) {
        this.selectedCustomer = cust;
        this.renderSelectedCustomerBadge();
        this.clearInlineCustomerSearch();
        app.closeModal();
        lucide.createIcons();
    },

    openDiscountModal() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-3">اعمال تخفیف روی فاکتور</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">مبلغ تخفیف (تومان)</label>
                    <input type="number" id="discountInput" value="${this.discountAmount}" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">علت / نوع تخفیف</label>
                    <select id="discountReasonSelect" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm">
                        <option value="تخفیف مشتری وفادار">تخفیف مشتری وفادار</option>
                        <option value="تخفیف مناسبتی">تخفیف مناسبتی</option>
                        <option value="تخفیف مدیر فروشگاه">تخفیف مدیر فروشگاه</option>
                        <option value="جشنواره کالاهای نزدیک انقضا">جشنواره کالاهای نزدیک انقضا</option>
                    </select>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-xs text-slate-600">انصراف</button>
                    <button onclick="pos.applyDiscount()" class="px-4 py-2 text-xs bg-purple-600 text-white rounded-xl font-bold">تایید تخفیف</button>
                </div>
            </div>
        `);
    },

    applyDiscount() {
        const val = Number(document.getElementById('discountInput').value) || 0;
        const reason = document.getElementById('discountReasonSelect').value;
        this.discountAmount = val;
        this.discountReason = reason;
        this.updateTotals();
        app.closeModal();
        app.showNotification('تخفیف فاکتور اعمال شد', 'info');
    },

    // Open Checkout Modal (Unified Payment Options: POS, Cash, Card to Card, Split)
    openCheckoutModal(initialMode = 'POS') {
        if (this.cart.length === 0) {
            app.showNotification('سبد خرید خالی است!', 'warning');
            return;
        }

        const subtotal = this.cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
        const total = Math.max(0, subtotal - this.discountAmount);
        const walletAvail = this.selectedCustomer ? this.selectedCustomer.wallet_balance : 0;

        this.checkoutState = {
            mode: initialMode, // POS, CASH, TRANSFER, SPLIT
            total: total
        };

        app.openModal(`
            <div class="space-y-4 text-xs">
                <!-- Header -->
                <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                        <h3 class="text-base font-bold text-slate-900 flex items-center gap-1.5">
                            <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i>
                            <span>تسویه حساب، انتخاب شیوه پرداخت و اتمام خرید</span>
                        </h3>
                        <p class="text-[11px] text-slate-500 mt-0.5">صندوق‌دار: علی رضایی | مشتری: ${this.selectedCustomer ? this.selectedCustomer.full_name : 'مشتری گذری'}</p>
                    </div>
                </div>

                <!-- Total Bill Display Box -->
                <div class="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-2xl p-4 text-white flex items-center justify-between shadow-md">
                    <div>
                        <div class="text-[11px] text-purple-200">مبلغ کل فاکتور:</div>
                        <div class="text-2xl font-black font-mono mt-0.5 text-white">${total.toLocaleString('fa-IR')} <span class="text-xs font-normal text-purple-200">تومان</span></div>
                    </div>
                    <div class="text-left text-[11px] text-purple-200 border-r border-purple-700/50 pr-4">
                        <div>جمع اقلام: <span class="font-mono text-white font-bold">${subtotal.toLocaleString('fa-IR')}</span> ت</div>
                        <div>تخفیف: <span class="font-mono text-amber-300 font-bold">-${Number(this.discountAmount).toLocaleString('fa-IR')}</span> ت</div>
                    </div>
                </div>

                <!-- Payment Method Tabs -->
                <div class="space-y-2">
                    <label class="block font-bold text-slate-700">انتخاب روش پرداخت و تسویه:</label>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button type="button" onclick="pos.setPaymentMode('POS')" id="pmTab-POS" 
                                class="p-2.5 rounded-xl border-2 ${initialMode === 'POS' ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 hover:border-slate-300 text-slate-700'} font-bold flex flex-col items-center gap-1 transition cursor-pointer">
                            <i data-lucide="credit-card" class="w-5 h-5 ${initialMode === 'POS' ? 'text-purple-600' : 'text-slate-600'}"></i>
                            <span class="text-xs">کارتخوان (POS)</span>
                        </button>
                        
                        <button type="button" onclick="pos.setPaymentMode('CASH')" id="pmTab-CASH" 
                                class="p-2.5 rounded-xl border-2 ${initialMode === 'CASH' ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 hover:border-slate-300 text-slate-700'} font-bold flex flex-col items-center gap-1 transition cursor-pointer">
                            <i data-lucide="banknote" class="w-5 h-5 ${initialMode === 'CASH' ? 'text-emerald-600' : 'text-slate-600'}"></i>
                            <span class="text-xs">نقدی (اسکناس)</span>
                        </button>

                        <button type="button" onclick="pos.setPaymentMode('TRANSFER')" id="pmTab-TRANSFER" 
                                class="p-2.5 rounded-xl border-2 ${initialMode === 'TRANSFER' ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 hover:border-slate-300 text-slate-700'} font-bold flex flex-col items-center gap-1 transition cursor-pointer">
                            <i data-lucide="arrow-left-right" class="w-5 h-5 ${initialMode === 'TRANSFER' ? 'text-blue-600' : 'text-slate-600'}"></i>
                            <span class="text-xs">کارت به کارت</span>
                        </button>

                        <button type="button" onclick="pos.setPaymentMode('SPLIT')" id="pmTab-SPLIT" 
                                class="p-2.5 rounded-xl border-2 ${initialMode === 'SPLIT' ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 hover:border-slate-300 text-slate-700'} font-bold flex flex-col items-center gap-0.5 transition cursor-pointer">
                            <i data-lucide="pie-chart" class="w-5 h-5 ${initialMode === 'SPLIT' ? 'text-amber-600' : 'text-slate-600'}"></i>
                            <span class="text-xs">پرداخت ترکیبی</span>
                            <span class="text-[9px] ${initialMode === 'SPLIT' ? 'text-amber-700' : 'text-slate-400'} font-normal">نقد + پوز + کارت</span>
                        </button>
                    </div>
                </div>

                <!-- Mode 1: POS Card Container -->
                <div id="modePanel-POS" class="${initialMode === 'POS' ? '' : 'hidden'} p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-purple-900">دستگاه کارتخوان فعال:</span>
                        <span class="text-xs bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded">کارتخوان مرکزی (سامان)</span>
                    </div>
                    <div class="flex items-center justify-between text-slate-700 pt-1">
                        <span>مبلغ ارسال به کارتخوان:</span>
                        <span class="font-bold font-mono text-purple-700 text-sm">${total.toLocaleString('fa-IR')} تومان</span>
                    </div>
                </div>

                <!-- Mode 2: CASH Container -->
                <div id="modePanel-CASH" class="${initialMode === 'CASH' ? '' : 'hidden'} p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-emerald-900">دریافت نقد داخل کشوی دخل:</span>
                        <span class="font-mono text-xs font-bold text-emerald-700">مبلغ فاکتور: ${total.toLocaleString('fa-IR')} ت</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-slate-600 mb-1">مبلغ دریافتی از مشتری (اسکناس):</label>
                            <input type="number" id="cashReceivedInput" value="${total}" oninput="pos.calcCashChange()" 
                                    class="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-sm font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">مبلغ عودت به مشتری (پول خرد):</label>
                            <div id="cashChangeDisplay" class="p-2 bg-white border border-slate-300 rounded-lg font-bold text-sm font-mono text-emerald-600">۰ تومان</div>
                        </div>
                    </div>
                </div>

                <!-- Mode 3: TRANSFER (Card-to-Card) Container -->
                <div id="modePanel-TRANSFER" class="${initialMode === 'TRANSFER' ? '' : 'hidden'} p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-blue-900">انتقال بانکی / کارت به کارت:</span>
                        <span class="font-mono text-xs font-bold text-blue-700">${total.toLocaleString('fa-IR')} ت</span>
                    </div>
                    <div>
                        <label class="block text-slate-700 font-bold mb-1">شماره ارجاع / پیگیری یا ۴ رقم کارت واریزی (اختیاری):</label>
                        <input type="text" id="transferRefInput" placeholder="مثلاً: ۶۸۲۹۴۲ یا سپهر-۸۹۱۰" 
                                class="w-full p-2.5 bg-white border border-blue-200 rounded-lg text-xs font-mono font-bold">
                    </div>
                </div>

                <!-- Mode 4: SPLIT Container (پرداخت ترکیبی پیشرفته) -->
                <div id="modePanel-SPLIT" class="${initialMode === 'SPLIT' ? '' : 'hidden'} space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div class="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                            <i data-lucide="pie-chart" class="w-4 h-4 text-amber-600"></i>
                            <span>تعریف و تفکیک پرداخت ترکیبی (نقدی + کارتخوان + کارت به کارت)</span>
                        </div>
                        <span class="text-xs text-purple-700 font-bold font-mono">مبلغ کل فاکتور: ${total.toLocaleString('fa-IR')} تومان</span>
                    </div>

                    <!-- 3 Payment Method Input Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <!-- 1. سهم نقدی (دخل) -->
                        <div class="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-emerald-900 text-xs flex items-center gap-1">
                                    <i data-lucide="banknote" class="w-3.5 h-3.5 text-emerald-600"></i>
                                    <span>۱. سهم نقدی (دخل)</span>
                                </span>
                                <button type="button" onclick="pos.fillRemaining('cash')" class="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer" title="تخصیص تمام باقیمانده به نقد">
                                    + تکمیل مانده
                                </button>
                            </div>
                            <input type="number" id="splitCash" value="0" min="0" oninput="pos.checkSplitTotal()" placeholder="مبلغ نقد..." 
                                   class="w-full p-2 bg-white border border-emerald-300 rounded-lg font-black text-sm font-mono text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <div class="flex justify-between items-center text-[10px] text-emerald-700">
                                <span id="hint_splitCash" class="font-mono">۰ تومان</span>
                                <button type="button" onclick="document.getElementById('splitCash').value = 0; pos.checkSplitTotal();" class="text-slate-400 hover:text-rose-500">صفر</button>
                            </div>
                        </div>

                        <!-- 2. سهم کارتخوان (POS) -->
                        <div class="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-purple-900 text-xs flex items-center gap-1">
                                    <i data-lucide="credit-card" class="w-3.5 h-3.5 text-purple-600"></i>
                                    <span>۲. سهم کارتخوان (پوز)</span>
                                </span>
                                <button type="button" onclick="pos.fillRemaining('card')" class="text-[10px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer" title="تخصیص تمام باقیمانده به پوز">
                                    + تکمیل مانده
                                </button>
                            </div>
                            <input type="number" id="splitCard" value="${total}" min="0" oninput="pos.checkSplitTotal()" placeholder="مبلغ پوز..." 
                                   class="w-full p-2 bg-white border border-purple-300 rounded-lg font-black text-sm font-mono text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500">
                            <div class="flex justify-between items-center text-[10px] text-purple-700">
                                <span id="hint_splitCard" class="font-mono">${total.toLocaleString('fa-IR')} تومان</span>
                                <button type="button" onclick="document.getElementById('splitCard').value = 0; pos.checkSplitTotal();" class="text-slate-400 hover:text-rose-500">صفر</button>
                            </div>
                        </div>

                        <!-- 3. سهم کارت به کارت -->
                        <div class="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-blue-900 text-xs flex items-center gap-1">
                                    <i data-lucide="arrow-left-right" class="w-3.5 h-3.5 text-blue-600"></i>
                                    <span>۳. کارت به کارت</span>
                                </span>
                                <button type="button" onclick="pos.fillRemaining('transfer')" class="text-[10px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer" title="تخصیص تمام باقیمانده به کارت به کارت">
                                    + تکمیل مانده
                                </button>
                            </div>
                            <input type="number" id="splitTransfer" value="0" min="0" oninput="pos.checkSplitTotal()" placeholder="مبلغ کارت به کارت..." 
                                   class="w-full p-2 bg-white border border-blue-300 rounded-lg font-black text-sm font-mono text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="flex justify-between items-center text-[10px] text-blue-700">
                                <span id="hint_splitTransfer" class="font-mono">۰ تومان</span>
                                <button type="button" onclick="document.getElementById('splitTransfer').value = 0; pos.checkSplitTotal();" class="text-slate-400 hover:text-rose-500">صفر</button>
                            </div>
                        </div>
                    </div>

                    <!-- Reference info for Card-to-Card -->
                    <div class="p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center gap-2">
                        <label class="font-bold text-blue-950 text-xs whitespace-nowrap flex items-center gap-1">
                            <i data-lucide="file-text" class="w-3.5 h-3.5 text-blue-600"></i>
                            <span>مشخصات کارت‌به‌کارت:</span>
                        </label>
                        <input type="text" id="splitTransferRef" placeholder="شماره پیگیری، ۴ رقم آخر کارت مشتری یا نام بانک (اختیاری)..." 
                               class="w-full p-2 bg-white border border-blue-200 rounded-lg text-xs font-mono font-medium focus:outline-none focus:border-blue-500">
                    </div>

                    ${walletAvail > 0 ? `
                        <div class="p-2.5 border border-indigo-200 bg-indigo-50/70 rounded-xl flex items-center justify-between gap-3">
                            <div class="flex items-center gap-1.5">
                                <i data-lucide="wallet" class="w-4 h-4 text-indigo-600"></i>
                                <div>
                                    <span class="font-bold text-indigo-900 text-xs">کسر از کیف پول مشتری</span>
                                    <span class="text-[10px] text-indigo-600 block">مانده اعتبار مشتری: ${Number(walletAvail).toLocaleString('fa-IR')} تومان</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <input type="number" id="splitWallet" value="0" min="0" max="${Math.min(walletAvail, total)}" oninput="pos.checkSplitTotal()" 
                                       class="w-28 p-1.5 bg-white border border-indigo-300 rounded-lg font-bold text-xs font-mono text-indigo-800 text-center">
                                <button type="button" onclick="pos.fillRemaining('wallet')" class="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2 py-1 rounded font-bold">
                                    تکمیل با کیف پول
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Quick Split Presets -->
                    <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                        <div class="flex items-center gap-1 text-[11px] text-slate-500 font-bold">
                            <span>الگوهای آماده:</span>
                            <button type="button" onclick="pos.splitPreset('half_cash_card')" class="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 text-[10px] font-bold">
                                ۵۰٪ نقد + ۵۰٪ پوز
                            </button>
                            <button type="button" onclick="pos.splitPreset('half_card_transfer')" class="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 text-[10px] font-bold">
                                ۵۰٪ پوز + ۵۰٪ کارت‌به‌کارت
                            </button>
                            <button type="button" onclick="pos.splitPreset('third_equal')" class="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 text-[10px] font-bold">
                                یک‌سوم مساوی هر سه
                            </button>
                        </div>
                        <button type="button" onclick="pos.resetSplitAmounts()" class="text-[11px] text-rose-600 hover:underline font-bold">
                            پاکسازی همه مبالغ
                        </button>
                    </div>

                    <!-- Live Reconciliation Status Box -->
                    <div id="splitStatus" class="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-center font-bold text-xs shadow-xs transition">
                        ✅ مبالغ تقسیمی کاملاً با کل فاکتور تراز است.
                    </div>
                </div>

                <!-- One-Click Instant Finalize Button -->
                <button onclick="pos.submitCheckout()" 
                        class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition cursor-pointer">
                    <i data-lucide="check-circle" class="w-5 h-5"></i>
                    <span>ثبت نهایی فاکتور و اتمام خرید [Enter]</span>
                </button>

                <div class="flex justify-between items-center pt-2 border-t border-slate-100 text-slate-400">
                    <span class="text-[10px]">تخصیص انبار با متد FEFO و ثبت اتوماتیک سند دوبل حسابداری</span>
                    <button onclick="app.closeModal()" class="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl">انصراف / بستن</button>
                </div>
            </div>
        `);
        lucide.createIcons();
        if (initialMode === 'SPLIT') {
            this.checkSplitTotal();
        }
    },

    setPaymentMode(mode) {
        if (!this.checkoutState) return;
        this.checkoutState.mode = mode;
        ['POS', 'CASH', 'TRANSFER', 'SPLIT'].forEach(m => {
            const tab = document.getElementById(`pmTab-${m}`);
            const panel = document.getElementById(`modePanel-${m}`);
            if (m === mode) {
                if (tab) tab.className = 'p-2.5 rounded-xl border-2 border-purple-600 bg-purple-50 text-purple-900 font-bold flex flex-col items-center gap-1 transition cursor-pointer';
                panel?.classList.remove('hidden');
                if (m === 'SPLIT') {
                    this.checkSplitTotal();
                }
            } else {
                if (tab) tab.className = 'p-2.5 rounded-xl border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold flex flex-col items-center gap-1 transition cursor-pointer';
                panel?.classList.add('hidden');
            }
        });
    },

    calcCashChange() {
        const received = Number(document.getElementById('cashReceivedInput')?.value) || 0;
        const total = this.checkoutState?.total || 0;
        const change = Math.max(0, received - total);
        const el = document.getElementById('cashChangeDisplay');
        if (el) el.innerText = `${change.toLocaleString('fa-IR')} تومان`;
    },

    fillRemaining(target) {
        const total = this.checkoutState?.total || 0;
        const c = Number(document.getElementById('splitCard')?.value) || 0;
        const ca = Number(document.getElementById('splitCash')?.value) || 0;
        const t = Number(document.getElementById('splitTransfer')?.value) || 0;
        const w = Number(document.getElementById('splitWallet')?.value) || 0;

        if (target === 'cash') {
            const others = c + t + w;
            const rem = Math.max(0, total - others);
            const el = document.getElementById('splitCash');
            if (el) el.value = rem;
        } else if (target === 'card') {
            const others = ca + t + w;
            const rem = Math.max(0, total - others);
            const el = document.getElementById('splitCard');
            if (el) el.value = rem;
        } else if (target === 'transfer') {
            const others = ca + c + w;
            const rem = Math.max(0, total - others);
            const el = document.getElementById('splitTransfer');
            if (el) el.value = rem;
        } else if (target === 'wallet') {
            const walletAvail = this.selectedCustomer?.wallet_balance || 0;
            const others = ca + c + t;
            const rem = Math.min(walletAvail, Math.max(0, total - others));
            const el = document.getElementById('splitWallet');
            if (el) el.value = rem;
        }

        this.checkSplitTotal();
    },

    splitPreset(type) {
        const total = this.checkoutState?.total || 0;
        const elCash = document.getElementById('splitCash');
        const elCard = document.getElementById('splitCard');
        const elTransfer = document.getElementById('splitTransfer');
        const elWallet = document.getElementById('splitWallet');
        if (elWallet) elWallet.value = 0;

        if (type === 'half_cash_card') {
            const half = Math.floor(total / 2);
            if (elCash) elCash.value = half;
            if (elCard) elCard.value = total - half;
            if (elTransfer) elTransfer.value = 0;
        } else if (type === 'half_card_transfer') {
            const half = Math.floor(total / 2);
            if (elCash) elCash.value = 0;
            if (elCard) elCard.value = half;
            if (elTransfer) elTransfer.value = total - half;
        } else if (type === 'third_equal') {
            const third = Math.floor(total / 3);
            if (elCash) elCash.value = third;
            if (elCard) elCard.value = third;
            if (elTransfer) elTransfer.value = total - (third * 2);
        }
        this.checkSplitTotal();
    },

    resetSplitAmounts() {
        const elCash = document.getElementById('splitCash');
        const elCard = document.getElementById('splitCard');
        const elTransfer = document.getElementById('splitTransfer');
        const elWallet = document.getElementById('splitWallet');
        if (elCash) elCash.value = 0;
        if (elCard) elCard.value = 0;
        if (elTransfer) elTransfer.value = 0;
        if (elWallet) elWallet.value = 0;
        this.checkSplitTotal();
    },

    checkSplitTotal() {
        const total = this.checkoutState?.total || 0;
        const c = Number(document.getElementById('splitCard')?.value) || 0;
        const ca = Number(document.getElementById('splitCash')?.value) || 0;
        const t = Number(document.getElementById('splitTransfer')?.value) || 0;
        const w = Number(document.getElementById('splitWallet')?.value) || 0;

        // Update hints
        const hintCard = document.getElementById('hint_splitCard');
        if (hintCard) hintCard.textContent = c.toLocaleString('fa-IR') + ' تومان';
        const hintCash = document.getElementById('hint_splitCash');
        if (hintCash) hintCash.textContent = ca.toLocaleString('fa-IR') + ' تومان';
        const hintTransfer = document.getElementById('hint_splitTransfer');
        if (hintTransfer) hintTransfer.textContent = t.toLocaleString('fa-IR') + ' تومان';

        const sum = c + ca + t + w;
        const diff = sum - total;

        const el = document.getElementById('splitStatus');
        if (!el) return;
        if (Math.abs(diff) <= 0.5) {
            el.className = 'p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-center font-bold text-xs shadow-xs';
            el.innerHTML = `✅ مجموع مبالغ ترکیبی (${sum.toLocaleString('fa-IR')} تومان) کاملاً با فاکتور تراز است. آماده ثبت فاکتور.`;
        } else if (diff > 0) {
            el.className = 'p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-center font-bold text-xs shadow-xs';
            el.innerHTML = `❌ مبلغ ${diff.toLocaleString('fa-IR')} تومان اضافه بر مبلغ فاکتور وارد شده است! (مجموع پرداختی: ${sum.toLocaleString('fa-IR')} ت)`;
        } else {
            const rem = Math.abs(diff);
            el.className = 'p-2.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-center font-bold text-xs shadow-xs';
            el.innerHTML = `⚠️ مبلغ ${rem.toLocaleString('fa-IR')} تومان هنوز تسویه نشده است (مجموع تا الان: ${sum.toLocaleString('fa-IR')} ت). روی «تکمیل مانده» بزنید.`;
        }
    },


    async submitCheckout() {
        const subtotal = this.cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
        const total = Math.max(0, subtotal - this.discountAmount);
        const mode = this.checkoutState ? this.checkoutState.mode : 'POS';

        let payments = [];

        if (mode === 'POS') {
            payments.push({ method: 'CARD', amount: total });
        } else if (mode === 'CASH') {
            payments.push({ method: 'CASH', amount: total });
        } else if (mode === 'TRANSFER') {
            const ref = document.getElementById('transferRefInput')?.value.trim();
            payments.push({ method: 'CARD_TO_CARD', amount: total, ref: ref || 'کارت به کارت' });
        } else if (mode === 'SPLIT') {
            const payCard = Number(document.getElementById('splitCard')?.value) || 0;
            const payCash = Number(document.getElementById('splitCash')?.value) || 0;
            const payTransfer = Number(document.getElementById('splitTransfer')?.value) || 0;
            const transferRef = document.getElementById('splitTransferRef')?.value.trim();
            const payWallet = Number(document.getElementById('splitWallet')?.value) || 0;
            const sum = payCard + payCash + payTransfer + payWallet;

            if (Math.abs(sum - total) > 10) {
                app.showNotification(`جمع مبالغ پرداختی (${sum.toLocaleString('fa-IR')}) با مبلغ کل فاکتور (${total.toLocaleString('fa-IR')}) برابر نیست!`, 'error');
                return;
            }

            if (payCard > 0) payments.push({ method: 'CARD', amount: payCard });
            if (payCash > 0) payments.push({ method: 'CASH', amount: payCash });
            if (payTransfer > 0) payments.push({ method: 'CARD_TO_CARD', amount: payTransfer, ref: transferRef || 'کارت به کارت' });
            if (payWallet > 0) payments.push({ method: 'WALLET', amount: payWallet });
        }

        try {
            const res = await fetch('/api/pos/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: this.selectedCustomer ? this.selectedCustomer.id : null,
                    employeeId: 3, // علی رضایی صندوق‌دار
                    cashSessionId: this.activeSession ? this.activeSession.id : 1,
                    items: this.cart.map(i => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
                    discountAmount: this.discountAmount,
                    discountReason: this.discountReason,
                    payments: payments
                })
            });

            const json = await res.json();
            if (json.success) {
                app.showNotification(`فاکتور ${json.data.orderNumber} با موفقیت صادر و ثبت شد.`, 'success');
                const orderData = json.data;
                this.cart = [];
                this.discountAmount = 0;
                this.renderCart();
                app.closeModal();
                app.updateAlertCount();

                // Reload products in POS to show updated stocks
                this.loadProducts();

                // Show Printable Receipt
                this.printReceipt(orderData.orderId);
            } else {
                app.showNotification(json.error || 'خطا در ثبت فاکتور', 'error');
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    async printReceipt(orderId) {
        try {
            const res = await fetch(`/api/orders/${orderId}`);
            const json = await res.json();
            if (!json.success || !json.data) return;

            const o = json.data;
            const container = document.getElementById('printableReceipt');
            container.innerHTML = `
                <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                    <h2 style="font-size: 14px; font-weight: bold; margin: 0;">فروشگاه کیهان بیوتی</h2>
                    <p style="margin: 2px 0;">لوازم آرایشی و مراقبت پوستی تخصصی</p>
                    <p style="font-size: 10px; margin: 0;">شماره فاکتور: ${o.order_number}</p>
                    <p style="font-size: 10px; margin: 0;">تاریخ: ${o.created_at}</p>
                    <p style="font-size: 10px; margin: 0;">صندوق‌دار: ${o.cashier_name || 'صندوق مرکزی'}</p>
                    ${o.customer_name ? `<p style="font-size: 10px; margin: 0;">مشتری: ${o.customer_name}</p>` : ''}
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000;">
                            <th style="text-align: right; padding: 2px;">شرح کالا</th>
                            <th style="text-align: center; padding: 2px;">تعداد</th>
                            <th style="text-align: left; padding: 2px;">قیمت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${o.items.map(it => `
                            <tr>
                                <td style="padding: 2px;">${it.product_name} ${it.shade ? `(${it.shade})` : ''}</td>
                                <td style="text-align: center; padding: 2px;">${it.quantity}</td>
                                <td style="text-align: left; padding: 2px;">${Number(it.total_price).toLocaleString('fa-IR')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="border-top: 1px dashed #000; padding-top: 6px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>جمع کل:</span>
                        <span>${Number(o.subtotal).toLocaleString('fa-IR')} تومان</span>
                    </div>
                    ${o.discount_amount > 0 ? `
                        <div style="display: flex; justify-content: space-between;">
                            <span>تخفیف:</span>
                            <span>-${Number(o.discount_amount).toLocaleString('fa-IR')} تومان</span>
                        </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; margin-top: 4px;">
                        <span>مبلغ نهایی:</span>
                        <span>${Number(o.total_amount).toLocaleString('fa-IR')} تومان</span>
                    </div>

                    ${(o.payments && o.payments.length > 0) ? `
                        <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dotted #ccc; font-size: 10px;">
                            <div style="font-weight: bold; margin-bottom: 3px; color: #333;">نحوه تسویه (روش‌های پرداخت):</div>
                            ${o.payments.map(p => `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                                    <span>
                                        ${p.payment_method === 'CASH' ? '💵 نقدی' :
                                          p.payment_method === 'CARD' ? '💳 کارتخوان (پوز)' :
                                          p.payment_method === 'ONLINE' ? '📲 کارت به کارت' :
                                          p.payment_method === 'WALLET' ? '👛 کیف پول' :
                                          p.payment_method === 'POINTS' ? '⭐ امتیاز' : p.payment_method}
                                        ${p.reference_code ? `<span style="font-size: 8px; color: #555;">[${p.reference_code}]</span>` : ''}
                                    </span>
                                    <span style="font-weight: bold;">${Number(p.amount).toLocaleString('fa-IR')} تومان</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>


                <div style="text-align: center; font-size: 9px; margin-top: 12px; border-top: 1px solid #eee; padding-top: 6px;">
                    از خرید شما سپاسگزاریم!<br>
                    مهلت تعویض کالای پلمپ: ۴۸ ساعت با ارائه فاکتور
                </div>
            `;

            window.print();
        } catch (e) {
            console.error('Print failed', e);
        }
    },

    // Exchange Modal (Return old + Buy new)
    openExchangeModal() {
        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">فرآیند تعویض کالا (Exchange)</h3>
            <p class="text-xs text-slate-500 mb-4">مرجوع کردن کالای قبلی و انتخاب کالای جدید با تسویه آنی مابه‌التفاوت</p>

            <div class="space-y-4 text-xs">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">شماره فاکتور قبلی مشتری</label>
                    <input type="text" id="exchOrderNum" placeholder="مثلاً ORD-140506-001" class="w-full p-2.5 border border-slate-200 rounded-xl">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">وضعیت کالا</label>
                    <select id="exchOpened" class="w-full p-2.5 border border-slate-200 rounded-xl">
                        <option value="0">پلمپ و باز نشده (قابل بازگشت به انبار)</option>
                        <option value="1">بسته باز شده (انتقال مستقیم به ضایعات آرایشی)</option>
                    </select>
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">علت تعویض</label>
                    <input type="text" id="exchReason" placeholder="مثلاً عدم تطابق شید کرم‌پودر با رنگ پوست" class="w-full p-2.5 border border-slate-200 rounded-xl">
                </div>

                <div class="p-3 bg-purple-50 rounded-xl text-purple-900 leading-relaxed">
                    💡 <strong>راهنما:</strong> پس از ثبت مرجوعی، فاکتور جدید از کالاهای موجود در سبد خرید صادر شده و مابه‌التفاوت به صورت اتوماتیک از مشتری دریافت یا به کیف پولش مسترد می‌شود.
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                    <button id="btnSubmitExchange" onclick="pos.submitExchange()" class="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition">
                        تایید تعویض و تسویه مابه‌التفاوت
                    </button>
                </div>
            </div>
        `);
    },

    // Submit Exchange against backend API /api/pos/exchanges
    async submitExchange() {
        const orderNum = document.getElementById('exchOrderNum')?.value?.trim();
        const isOpened = document.getElementById('exchOpened')?.value === '1';
        const reason = document.getElementById('exchReason')?.value?.trim() || 'تعویض کالا در صندوق فروشگاه';

        if (!orderNum) {
            app.showNotification('شماره فاکتور قبلی الزامی است.', 'warning');
            return;
        }

        if (this.cart.length === 0) {
            app.showNotification('ابتدا کالای جدید جایگزین را به سبد خرید اضافه کنید.', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubmitExchange');
        if (btn) btn.disabled = true;

        try {
            // 1. Fetch original order details
            const ordRes = await fetch(`/api/pos/orders/${orderNum}`);
            const ordJson = await ordRes.json();
            if (!ordJson.success || !ordJson.data) {
                throw new Error(ordJson.error || 'فاکتور مرجع با این شماره یافت نشد.');
            }

            const origOrder = ordJson.data;
            if (!origOrder.items || origOrder.items.length === 0) {
                throw new Error('اقلام فاکتور مرجع یافت نشد.');
            }

            // Return the first eligible item (or full order item)
            const firstItem = origOrder.items[0];
            const returnData = {
                originalOrderId: origOrder.id,
                customerId: this.selectedCustomer ? this.selectedCustomer.id : origOrder.customer_id,
                employeeId: 1,
                reason,
                refundMethod: 'WALLET_CREDIT',
                items: [{
                    orderItemId: firstItem.id,
                    quantity: 1,
                    isOpened: isOpened,
                    isRestockable: !isOpened
                }]
            };

            const subtotal = this.cart.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
            const discount = Math.min(this.discountAmount, subtotal);
            const total = Math.max(0, subtotal - discount);

            const newOrderData = {
                customerId: this.selectedCustomer ? this.selectedCustomer.id : origOrder.customer_id,
                employeeId: 1,
                cashSessionId: this.activeSession?.id || null,
                items: this.cart.map(i => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
                discountAmount: discount,
                channel: 'STORE_POS',
                orderType: 'SALE',
                notes: `تعویض متصل به فاکتور ${orderNum}`,
                payments: [{ method: 'CARD', amount: total }]
            };

            const exchRes = await fetch('/api/pos/exchanges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnData, newOrderData })
            });

            const exchJson = await exchRes.json();
            if (exchJson.success) {
                app.showNotification('فرآیند تعویض با موفقیت ثبت و اسناد دوبل صادر گردید.', 'success');
                this.cart = [];
                this.discountAmount = 0;
                this.renderCart();
                app.closeModal();
            } else {
                throw new Error(exchJson.error || 'خطا در ثبت فرآیند تعویض');
            }
        } catch (e) {
            app.showNotification(e.message, 'error');
            if (btn) btn.disabled = false;
        }
    },

    // Close Shift Modal
    openCloseSessionModal() {
        if (!this.activeSession) {
            app.showNotification('شیفت بازی برای صندوق یافت نشد', 'info');
            return;
        }

        const cashSales = this.activeSession.total_cash_sales || 0;
        const expected = this.activeSession.opening_balance + cashSales;

        app.openModal(`
            <h3 class="text-base font-bold text-slate-900 mb-2">بستن شیفت صندوق فروشگاه</h3>
            <p class="text-xs text-slate-500 mb-4">صندوق: ${this.activeSession.register_name} | متصدی: ${this.activeSession.employee_name}</p>

            <div class="space-y-4 text-xs">
                <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <span class="text-slate-500">موجودی اول وقت:</span>
                        <div class="font-bold text-slate-800">${Number(this.activeSession.opening_balance).toLocaleString('fa-IR')} تومان</div>
                    </div>
                    <div>
                        <span class="text-slate-500">فروش نقدی شیفت:</span>
                        <div class="font-bold text-emerald-600">+${Number(cashSales).toLocaleString('fa-IR')} تومان</div>
                    </div>
                    <div class="col-span-2 pt-2 border-t border-slate-200">
                        <span class="text-slate-500">موجودی مورد انتظار سیستم:</span>
                        <div class="font-bold text-purple-700 text-sm">${Number(expected).toLocaleString('fa-IR')} تومان</div>
                    </div>
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">موجودی شمارش شده فیزیکی داخل صندوق (تومان)</label>
                    <input type="number" id="actualCashInput" value="${expected}" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm">
                </div>

                <div>
                    <label class="block font-bold text-slate-700 mb-1">یادداشت پایانی شیفت</label>
                    <textarea id="sessionCloseNotes" rows="2" placeholder="توضیحات در صورت وجود مغایرت..." class="w-full p-2.5 border border-slate-200 rounded-xl"></textarea>
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                    <button onclick="pos.submitCloseSession(${expected})" class="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl font-bold transition">
                        بستن نهایی شیفت
                    </button>
                </div>
            </div>
        `);
    },

    async submitCloseSession(expected) {
        const actual = Number(document.getElementById('actualCashInput').value) || 0;
        const notes = document.getElementById('sessionCloseNotes').value;

        try {
            const res = await fetch('/api/pos/close-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.activeSession.id,
                    actualBalance: actual,
                    notes: notes
                })
            });

            const json = await res.json();
            if (json.success) {
                const diff = json.data.variance;
                if (diff === 0) {
                    app.showNotification('شیفت بدون مغایرت با موفقیت بسته شد.', 'success');
                } else if (diff < 0) {
                    app.showNotification(`شیفت با کسری ${Math.abs(diff).toLocaleString('fa-IR')} تومان بسته شد و هشدار ثبت شد.`, 'error');
                } else {
                    app.showNotification(`شیفت با اضافه ${diff.toLocaleString('fa-IR')} تومان بسته شد.`, 'info');
                }
                this.activeSession = null;
                app.closeModal();
                this.render();
            }
        } catch (e) {
            app.showNotification('خطا در بستن شیفت', 'error');
        }
    },

    async saveAsProforma() {
        if (this.cart.length === 0) {
            app.showNotification('سبد خرید خالی است!', 'warning');
            return;
        }

        const items = this.cart.map(i => ({
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice
        }));

        try {
            const res = await fetch('/api/pos/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: this.selectedCustomer ? this.selectedCustomer.id : null,
                    employeeId: 1,
                    items,
                    discountAmount: this.discountAmount,
                    orderType: 'PROFORMA',
                    notes: 'پیش‌فاکتور استعلام قیمت'
                })
            });
            const json = await res.json();
            if (json.success) {
                app.showNotification(`پیش‌فاکتور ${json.data.orderNumber} با موفقیت صادر شد (بدون کسر انبار).`, 'success');
                this.cart = [];
                this.discountAmount = 0;
                this.renderCart();
            }
        } catch (e) {
            app.showNotification('خطا در صدور پیش‌فاکتور', 'error');
        }
    },

    openLayawayModal() {
        if (this.cart.length === 0) {
            app.showNotification('سبد خرید خالی است!', 'warning');
            return;
        }

        const total = Math.max(0, this.cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0) - this.discountAmount);
        const minDeposit = Math.round(total * 0.3);

        app.openModal(`
            <div class="space-y-4 text-xs">
                <h3 class="text-base font-bold text-slate-900">رزرو کالا و ودیعه (Layaway)</h3>
                <p class="text-slate-500">کالاها در انبار رزرو شده و تا تسویه نهایی نگهداری می‌شوند.</p>
                <div class="p-3 bg-purple-50 rounded-xl space-y-1">
                    <div class="flex justify-between"><span>مبلغ کل سفارش:</span><strong class="font-mono">${total.toLocaleString('fa-IR')} تومان</strong></div>
                    <div class="flex justify-between text-purple-700"><span>حداقل بیعانه (۳۰٪):</span><strong class="font-mono">${minDeposit.toLocaleString('fa-IR')} تومان</strong></div>
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-1">مبلغ بیعانه دریافتی</label>
                    <input type="number" id="layawayDepositInput" value="${minDeposit}" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm font-mono">
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600">انصراف</button>
                    <button onclick="pos.submitLayaway(${total})" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition">
                        ثبت رزرو و ودیعه
                    </button>
                </div>
            </div>
        `);
    },

    saveAsLayaway() {
        this.openLayawayModal();
    },

    async submitLayaway(total) {
        const deposit = Number(document.getElementById('layawayDepositInput').value) || 0;
        const items = this.cart.map(i => ({
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice
        }));

        try {
            const res = await fetch('/api/pos/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: this.selectedCustomer ? this.selectedCustomer.id : null,
                    employeeId: 1,
                    items,
                    discountAmount: this.discountAmount,
                    payments: [{ method: 'CARD', amount: deposit }],
                    orderType: 'LAYAWAY',
                    notes: `سفارش رزرو با بیعانه دریافتی ${deposit.toLocaleString('fa-IR')} تومان`
                })
            });
            const json = await res.json();
            if (json.success) {
                app.closeModal();
                app.showNotification(`سفارش رزرو ${json.data.orderNumber} ثبت شد و اقلام در انبار رزرو گردید.`, 'success');
                this.cart = [];
                this.discountAmount = 0;
                this.renderCart();
            }
        } catch (e) {
            app.showNotification('خطا در ثبت رزرو کالا', 'error');
        }
    }
};
