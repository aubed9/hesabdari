// Marketing & Campaigns Client Module (مدیریت کمپین‌های پیامکی، جشنواره‌ها، کوپن و مخاطبان)
const marketing = {
    campaigns: [],
    selectedAudience: [],

    async init() {
        this.render();
        await this.loadStats();
        await this.loadCampaigns();
    },

    render() {
        const container = document.getElementById('mainContainer');
        container.innerHTML = `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <i data-lucide="megaphone" class="w-5 h-5 text-purple-600"></i>
                            <span>کمپین‌های بازاریابی، پیامک هوشمند و جشنواره‌های تخفیف</span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">ارسال پیامک هدفمند، دریافت فایل شماره و اسم مشتریان، کوپن‌های یکپارچه با POS و رهگیری فروش و ROI</p>
                    </div>

                    <div class="flex items-center gap-2">
                        <button onclick="marketing.openNewCampaignModal()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-100 transition">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i>
                            <span>+ ایجاد کمپین جدید</span>
                        </button>
                    </div>
                </div>

                <!-- KPI Stats Row -->
                <div id="marketingStatsContainer" class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div class="py-6 text-center text-slate-400 col-span-full">در حال بارگذاری آمار بازاریابی...</div>
                </div>

                <!-- Campaigns Table -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <i data-lucide="layers" class="w-4 h-4 text-purple-600"></i>
                            <span>فهرست کمپین‌های بازاریابی و جشنواره‌های فروش</span>
                        </h3>
                        <span class="text-[11px] text-slate-400">یکپارچه با صندوق فروشگاه POS و کدهای تخفیف</span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px]">
                                <tr>
                                    <th class="p-3.5">عنوان کمپین و هدف</th>
                                    <th class="p-3.5">نوع و کانال</th>
                                    <th class="p-3.5">کد تخفیف</th>
                                    <th class="p-3.5 text-center">مخاطبان هدف</th>
                                    <th class="p-3.5">هزینه پیامک</th>
                                    <th class="p-3.5">درآمد حاصله</th>
                                    <th class="p-3.5 text-center">بازگشت سرمایه (ROI)</th>
                                    <th class="p-3.5 text-center">وضعیت</th>
                                    <th class="p-3.5 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody id="campaignsTableBody" class="divide-y divide-slate-100">
                                <tr><td colspan="9" class="p-8 text-center text-slate-400">در حال دریافت لیست کمپین‌ها...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        lucide.createIcons();
    },

    async loadStats() {
        const container = document.getElementById('marketingStatsContainer');
        if (!container) return;

        try {
            const res = await fetch('/api/marketing/stats');
            const json = await res.json();
            const s = json.data || {};

            container.innerHTML = `
                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-slate-500 mb-1">کمپین‌های فعال</div>
                    <div class="text-2xl font-bold font-mono text-purple-700">${s.active_campaigns || 0} <span class="text-xs font-normal text-slate-400">از ${s.total_campaigns || 0}</span></div>
                    <div class="text-[10px] text-slate-400 mt-1">جشنواره و پیامک جاری</div>
                </div>

                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-slate-500 mb-1">کل مخاطبان پیامک</div>
                    <div class="text-2xl font-bold font-mono text-indigo-700">${Number(s.total_reach || 0).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">پیامک</span></div>
                    <div class="text-[10px] text-slate-400 mt-1">ارسال شده به مشتریان</div>
                </div>

                <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-slate-500 mb-1">فروش حاصل از کمپین‌ها</div>
                    <div class="text-2xl font-bold font-mono text-emerald-600">${Number(s.total_revenue || 0).toLocaleString('fa-IR')} <span class="text-xs font-normal text-slate-400">تومان</span></div>
                    <div class="text-[10px] text-slate-400 mt-1">${s.total_conversions || 0} فاکتور با کوپن کمپین</div>
                </div>

                <div class="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl shadow-sm">
                    <div class="text-[11px] font-bold text-purple-800 mb-1">میانگین بازگشت سرمایه (ROI)</div>
                    <div class="text-2xl font-bold font-mono text-purple-900">${s.avgRoi || 0}٪ <span class="text-xs font-normal text-purple-600">سودآوری</span></div>
                    <div class="text-[10px] text-purple-600 mt-1">نسبت سود به هزینه پیامک</div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading marketing stats', e);
        }
    },

    async loadCampaigns() {
        const body = document.getElementById('campaignsTableBody');
        if (!body) return;

        try {
            const res = await fetch('/api/marketing/campaigns');
            const json = await res.json();
            this.campaigns = json.data || [];

            if (this.campaigns.length === 0) {
                body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400">هنوز کمپینی ایجاد نشده است. با دکمه بالا اولین کمپین خود را تعریف کنید.</td></tr>`;
                return;
            }

            body.innerHTML = this.campaigns.map(c => `
                <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3.5">
                        <div class="font-bold text-slate-900">${c.title}</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">جامعه: ${c.target_segment || 'همه'} (${app.formatDateFa(c.start_date)} تا ${app.formatDateFa(c.end_date)})</div>
                    </td>
                    <td class="p-3.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                            ${c.type === 'EXPIRING_STOCK' ? 'کالای انقضا نزدیک' :
                              c.type === 'FESTIVAL' ? 'جشنواره فصلی' :
                              c.type === 'BIRTHDAY' ? 'تخفیف تولد' :
                              c.type === 'WIN_BACK' ? 'مشتریان غیرفعال' : 'فروش ویژه'}
                        </span>
                    </td>
                    <td class="p-3.5 font-mono font-bold text-slate-800">
                        ${c.coupon_code ? `<span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-purple-700">${c.coupon_code} (${c.discount_percent}٪)</span>` : '-'}
                    </td>
                    <td class="p-3.5 text-center font-mono font-bold text-indigo-700">
                        ${Number(c.total_recipients || c.recipients_count || 0).toLocaleString('fa-IR')} نفر
                    </td>
                    <td class="p-3.5 font-mono text-slate-600">
                        ${Number(c.cost || 0).toLocaleString('fa-IR')} ت
                    </td>
                    <td class="p-3.5 font-mono font-bold text-emerald-600">
                        ${Number(c.revenue_generated || 0).toLocaleString('fa-IR')} ت
                    </td>
                    <td class="p-3.5 text-center font-mono font-bold ${c.roi > 0 ? 'text-emerald-700' : 'text-slate-500'}">
                        ${c.roi > 0 ? `+${c.roi}٪` : `${c.roi}٪`}
                    </td>
                    <td class="p-3.5 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                            ${c.is_active ? 'فعال' : 'پایان یافته'}
                        </span>
                    </td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="marketing.sendCampaign(${c.id})" class="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1" title="ارسال پیامک">
                                <i data-lucide="send" class="w-3 h-3"></i>
                                <span>ارسال</span>
                            </button>
                            <button onclick="marketing.openCampaignDetailsModal(${c.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition">
                                مخاطبان
                            </button>
                            <button onclick="marketing.deleteCampaign(${c.id})" class="px-1.5 py-1 text-slate-400 hover:text-rose-600 rounded-lg transition" title="حذف">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            lucide.createIcons();
        } catch (e) {
            body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-rose-500">خطا در بارگذاری کمپین‌ها</td></tr>`;
        }
    },

    // Modal: New Campaign Wizard with File/Audience Import
    openNewCampaignModal() {
        this.selectedAudience = [];

        const autoCoupon = 'SALE' + Math.floor(10 + Math.random() * 90);
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

        app.openModal(`
            <div class="space-y-4 text-xs">
                <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                        <h3 class="text-base font-bold text-slate-900 flex items-center gap-1.5">
                            <i data-lucide="megaphone" class="w-5 h-5 text-purple-600"></i>
                            <span>ایجاد کمپین تبلیغاتی و جشنواره فروش جدید</span>
                        </h3>
                        <p class="text-[11px] text-slate-500 mt-0.5">تعیین هدف، سرفصل مخاطبان (باشگاه یا دریافت فایل شماره‌ها) و تنظیم متن پیامک</p>
                    </div>
                </div>

                <!-- 1. Campaign Details -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="sm:col-span-2">
                        <label class="block font-bold text-slate-700 mb-1">عنوان کمپین <span class="text-rose-500">*</span></label>
                        <input type="text" id="ncTitle" placeholder="مثلاً: جشنواره بهاره تخفیف ۲۰٪ لوازم آرایشی و مراقبت پوست" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">نوع کمپین</label>
                        <select id="ncType" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                            <option value="FESTIVAL">جشنواره فصلی و مناسبتی (Festive Sale)</option>
                            <option value="EXPIRING_STOCK">حراج کالاهای انقضا نزدیک (Clearance)</option>
                            <option value="WIN_BACK">بازگشت مشتریان خاموش (Win-Back)</option>
                            <option value="BIRTHDAY">تخفیف تبریک تولد (Birthday Offer)</option>
                            <option value="VIP">پیشنهاد ویژه مشتریان VIP</option>
                            <option value="PROMO">فروش ویژه عمومی (Flash Promo)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">کانال ارتباطی</label>
                        <select id="ncChannel" class="w-full p-2.5 border border-slate-200 rounded-xl bg-white">
                            <option value="SMS">پیامک هوشمند متنی (SMS)</option>
                            <option value="NOTIFICATION">نوتیفیکیشن وب و موبایل</option>
                            <option value="SOCIAL">لینک کمپین اینستاگرام و کانال</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">کد تخفیف اختصاصی (کوپن)</label>
                        <input type="text" id="ncCoupon" value="${autoCoupon}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-purple-700">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">درصد تخفیف کوپن (٪)</label>
                        <input type="number" id="ncDiscount" value="20" min="0" max="100" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-center font-bold">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">تاریخ شروع</label>
                        <input type="date" id="ncStartDate" value="${today}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">تاریخ پایان</label>
                        <input type="date" id="ncEndDate" value="${nextMonth}" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono">
                    </div>
                </div>

                <!-- 2. Target Audience & File Import -->
                <div class="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-purple-900 flex items-center gap-1.5">
                            <i data-lucide="users" class="w-4 h-4 text-purple-600"></i>
                            <span>انتخاب مخاطبان و جامعه هدف پیامک</span>
                        </span>
                        <span id="ncAudienceCountBadge" class="font-mono font-bold text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                            ۰ مخاطب انتخاب شده
                        </span>
                    </div>

                    <!-- Preset Target Selection -->
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">انتخاب از گروه‌های باشگاه مشتریان:</label>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button type="button" onclick="marketing.selectPresetAudience('ALL')" class="p-2 bg-white hover:bg-purple-100 border border-slate-200 rounded-xl text-center font-medium">همه مشتریان باشگاه</button>
                            <button type="button" onclick="marketing.selectPresetAudience('VIP')" class="p-2 bg-white hover:bg-purple-100 border border-slate-200 rounded-xl text-center font-medium">مشتریان VIP و طلایی</button>
                            <button type="button" onclick="marketing.selectPresetAudience('AT_RISK')" class="p-2 bg-white hover:bg-purple-100 border border-slate-200 rounded-xl text-center font-medium">مشتریان در معرض ریزش</button>
                            <button type="button" onclick="marketing.selectPresetAudience('BIRTHDAYS')" class="p-2 bg-white hover:bg-purple-100 border border-slate-200 rounded-xl text-center font-medium">متولدین ماه جاری</button>
                        </div>
                    </div>

                    <!-- File / Text Paste Import Area -->
                    <div class="pt-2 border-t border-purple-200/60">
                        <div class="flex items-center justify-between mb-1">
                            <label class="font-bold text-purple-950 flex items-center gap-1">
                                <i data-lucide="file-up" class="w-3.5 h-3.5 text-purple-600"></i>
                                <span>یا دریافت فایل شماره و اسم‌های مشتریان (CSV / Excel / متن):</span>
                            </label>
                            <input type="file" id="ncFileInput" accept=".csv,.txt" class="hidden" onchange="marketing.handleFileSelect(event)">
                            <button type="button" onclick="document.getElementById('ncFileInput').click()" class="text-[11px] text-purple-700 bg-white border border-purple-300 px-2.5 py-1 rounded-lg font-bold hover:bg-purple-100 transition">
                                📁 انتخاب فایل CSV یا TXT
                            </button>
                        </div>
                        <textarea id="ncAudienceText" rows="3" placeholder="شماره‌ها و اسامی را اینجا پیست کنید (مثلاً: ۰۹۱۲۳۴۵۶۷۸۹,مریم رضایی یا فقط شماره موبایل‌ها در هر سطر)..." class="w-full p-2.5 bg-white border border-purple-300 rounded-xl font-mono text-xs text-slate-800 outline-none"></textarea>
                        <div class="flex justify-between items-center mt-1 text-[11px]">
                            <span class="text-slate-500">پشتیبانی از فرمت‌های ۰۹۱۲..., +۹۸۹۱۲... و نام مشتری</span>
                            <button type="button" onclick="marketing.processAudienceText()" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition">
                                استخراج و افزودن به لیست
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 3. SMS Message Template & Live Preview -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="font-bold text-slate-700">متن پیامک تبلیغاتی <span class="text-rose-500">*</span></label>
                            <div class="flex gap-1 text-[10px]">
                                <button type="button" onclick="marketing.insertTag('{نام}')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold">+ {نام}</button>
                                <button type="button" onclick="marketing.insertTag('{کد_تخفیف}')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold">+ {کد_تخفیف}</button>
                                <button type="button" onclick="marketing.insertTag('{تخفیف}')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold">+ {تخفیف}٪</button>
                            </div>
                        </div>
                        <textarea id="ncMessage" rows="4" oninput="marketing.updateSmsPreview()" class="w-full p-2.5 border border-slate-200 rounded-xl text-xs leading-relaxed" placeholder="سلام {نام} عزیز! جشنواره ویژه کیهان بیوتی آغاز شد. {تخفیف}٪ تخفیف روی تمام محصولات با کد: {کد_تخفیف} - لینک: keyhanbeauty.ir/sale">سلام {نام} عزیز! جشنواره بهاره کیهان بیوتی آغاز شد. {تخفیف}٪ تخفیف روی تمامی محصولات با کد اختصاصی: {کد_تخفیف}
لینک خرید: keyhanbeauty.ir/sale</textarea>
                        <div class="flex justify-between text-[11px] text-slate-500 mt-1">
                            <span id="smsCharCount">۰ کاراکتر (۱ صفحه فارسی)</span>
                            <span id="smsCostEstimate" class="font-bold font-mono text-purple-700">برآورد هزینه: ۰ تومان</span>
                        </div>
                    </div>

                    <!-- Live Mobile Mockup Preview -->
                    <div class="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div class="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
                            <span>پیش‌نمایش زنده در گوشی مشتری:</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-xs leading-relaxed text-slate-800 font-sans min-h-[90px]" id="smsPreviewBox">
                            <!-- Populated by JS -->
                        </div>
                        <div class="text-[9px] text-slate-400 text-left mt-1 font-mono">SMS Center: 983000...</div>
                    </div>
                </div>

                <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button onclick="app.closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition">انصراف</button>
                    <button onclick="marketing.submitNewCampaign()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition flex items-center gap-1.5">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        <span>ثبت و فعال‌سازی کمپین</span>
                    </button>
                </div>
            </div>
        `);

        lucide.createIcons();
        this.updateSmsPreview();
    },

    async selectPresetAudience(segment) {
        try {
            const res = await fetch(`/api/marketing/target-audience?segment=${segment}`);
            const json = await res.json();
            const list = json.data || [];
            this.selectedAudience = list;

            const badge = document.getElementById('ncAudienceCountBadge');
            if (badge) badge.innerText = `${list.length} مخاطب انتخاب شده`;

            this.updateSmsPreview();
            app.showNotification(`${list.length} مخاطب از گروه ${segment} انتخاب شدند.`, 'success');
        } catch (e) {
            app.showNotification('خطا در بارگذاری مخاطبان', 'error');
        }
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            document.getElementById('ncAudienceText').value = text;
            this.processAudienceText();
        };
        reader.readAsText(file);
    },

    async processAudienceText() {
        const text = document.getElementById('ncAudienceText')?.value;
        if (!text || !text.trim()) {
            app.showNotification('لطفاً شماره‌ها را وارد کنید یا فایل انتخاب نمایید', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/marketing/import-audience', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawText: text })
            });
            const json = await res.json();
            const { recipients = [], validCount = 0 } = json.data || {};

            // Merge with existing selected audience avoiding duplicate mobiles
            const map = new Map();
            this.selectedAudience.forEach(r => map.set(r.mobile, r));
            recipients.forEach(r => map.set(r.mobile, r));

            this.selectedAudience = Array.from(map.values());

            const badge = document.getElementById('ncAudienceCountBadge');
            if (badge) badge.innerText = `${this.selectedAudience.length} مخاطب آماده ارسال`;

            this.updateSmsPreview();
            app.showNotification(`تعداد ${validCount} شماره معتبر از فایل/متن استخراج و به کمپین اضافه شد.`, 'success');
        } catch (e) {
            app.showNotification('خطا در پردازش فایل شماره‌ها', 'error');
        }
    },

    insertTag(tag) {
        const textarea = document.getElementById('ncMessage');
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + tag + text.substring(end);
        textarea.focus();
        this.updateSmsPreview();
    },

    updateSmsPreview() {
        const msg = document.getElementById('ncMessage')?.value || '';
        const coupon = document.getElementById('ncCoupon')?.value || 'SALE20';
        const discount = document.getElementById('ncDiscount')?.value || '20';

        const previewText = msg
            .replace(/{نام}/g, 'سارا محمدی')
            .replace(/{کد_تخفیف}/g, coupon)
            .replace(/{تخفیف}/g, discount);

        const previewBox = document.getElementById('smsPreviewBox');
        if (previewBox) previewBox.innerText = previewText;

        const charCount = msg.length;
        const pages = Math.ceil(charCount / 70) || 1;
        const charBadge = document.getElementById('smsCharCount');
        if (charBadge) charBadge.innerText = `${charCount} کاراکتر (${pages} صفحه پیامک)`;

        const costEstimate = this.selectedAudience.length * pages * 120;
        const costBadge = document.getElementById('smsCostEstimate');
        if (costBadge) costBadge.innerText = `برآورد هزینه: ${Number(costEstimate).toLocaleString('fa-IR')} تومان`;
    },

    async submitNewCampaign() {
        const title = document.getElementById('ncTitle')?.value.trim();
        const type = document.getElementById('ncType')?.value;
        const channel = document.getElementById('ncChannel')?.value;
        const couponCode = document.getElementById('ncCoupon')?.value.trim();
        const discountPercent = Number(document.getElementById('ncDiscount')?.value) || 0;
        const startDate = document.getElementById('ncStartDate')?.value;
        const endDate = document.getElementById('ncEndDate')?.value;
        const messageTemplate = document.getElementById('ncMessage')?.value.trim();

        if (!title) {
            app.showNotification('لطفاً عنوان کمپین را وارد کنید.', 'warning');
            return;
        }

        if (this.selectedAudience.length === 0) {
            await this.selectPresetAudience('ALL');
        }

        try {
            const res = await fetch('/api/marketing/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    type,
                    channel,
                    targetSegment: `جامعه هدف (${this.selectedAudience.length} مخاطب)`,
                    discountPercent,
                    startDate,
                    endDate,
                    messageTemplate,
                    couponCode,
                    recipients: this.selectedAudience
                })
            });

            const json = await res.json();
            if (json.success) {
                app.showNotification(`کمپین «${title}» با موفقیت ثبت شد و آماده ارسال به ${this.selectedAudience.length} مخاطب است.`, 'success');
                app.closeModal();
                await this.loadStats();
                await this.loadCampaigns();
            } else {
                app.showNotification(json.error || 'خطا در ثبت کمپین', 'error');
            }
        } catch (e) {
            app.showNotification('خطای شبکه در ارتباط با سرور', 'error');
        }
    },

    async sendCampaign(id) {
        if (!confirm('آیا از ارسال پیامک‌های این کمپین به مخاطبان اطمینان دارید؟')) return;

        try {
            const res = await fetch(`/api/marketing/campaigns/${id}/send`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                app.showNotification('پیامک‌های کمپین با موفقیت به صف ارسال مخابرات تحویل داده شدند.', 'success');
                await this.loadStats();
                await this.loadCampaigns();
            }
        } catch (e) {
            app.showNotification('خطا در ارسال کمپین', 'error');
        }
    },

    async deleteCampaign(id) {
        if (!confirm('آیا از حذف این کمپین اطمینان دارید؟')) return;

        try {
            await fetch(`/api/marketing/campaigns/${id}`, { method: 'DELETE' });
            app.showNotification('کمپین با موفقیت حذف شد.', 'info');
            await this.loadStats();
            await this.loadCampaigns();
        } catch (e) {
            app.showNotification('خطا در حذف کمپین', 'error');
        }
    },

    async openCampaignDetailsModal(id) {
        try {
            const res = await fetch(`/api/marketing/campaigns/${id}`);
            const json = await res.json();
            const c = json.data;
            if (!c) return;

            app.openModal(`
                <div class="space-y-4 text-xs">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                            <h3 class="text-base font-bold text-slate-900">${c.title}</h3>
                            <div class="text-[11px] text-slate-500 mt-0.5">کد تخفیف: <strong>${c.coupon_code || '-'}</strong> (${c.discount_percent}٪ تخفیف)</div>
                        </div>
                        <span class="px-3 py-1 rounded-full font-bold text-xs ${c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                            ${c.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </div>

                    <!-- Stats in Details -->
                    <div class="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl">
                        <div class="text-center">
                            <div class="text-slate-400 text-[10px]">تعداد مخاطبان</div>
                            <div class="text-base font-bold font-mono text-purple-700">${c.recipients ? c.recipients.length : c.recipients_count} نفر</div>
                        </div>
                        <div class="text-center">
                            <div class="text-slate-400 text-[10px]">فروش ایجادی</div>
                            <div class="text-base font-bold font-mono text-emerald-700">${Number(c.revenue_generated || 0).toLocaleString('fa-IR')} ت</div>
                        </div>
                        <div class="text-center">
                            <div class="text-slate-400 text-[10px]">هزینه کمپین</div>
                            <div class="text-base font-bold font-mono text-slate-800">${Number(c.cost || 0).toLocaleString('fa-IR')} ت</div>
                        </div>
                    </div>

                    <!-- Message Template Display -->
                    <div class="p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
                        <div class="font-bold text-purple-900 mb-1">متن پیام ارسالی:</div>
                        <div class="text-slate-700 leading-relaxed font-sans">${c.message_template || 'متن پیام ثبت نشده است.'}</div>
                    </div>

                    <!-- Recipients Sample Table -->
                    <div>
                        <div class="font-bold text-slate-800 mb-2">فهرست دریافت‌کنندگان پیامک:</div>
                        <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                            <table class="w-full text-right text-[11px]">
                                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th class="p-2">نام مخاطب</th>
                                        <th class="p-2">شماره تماس</th>
                                        <th class="p-2 text-center">وضعیت ارسال</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${(c.recipients || []).map(r => `
                                        <tr>
                                            <td class="p-2 font-medium text-slate-900">${r.customer_name || r.name || 'مشتری'}</td>
                                            <td class="p-2 font-mono text-slate-600">${r.mobile}</td>
                                            <td class="p-2 text-center">
                                                <span class="px-2 py-0.5 rounded text-[9px] font-bold ${r.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                                    ${r.status === 'SENT' ? 'ارسال شده' : 'در صف'}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-end pt-2 border-t border-slate-100">
                        <button onclick="app.closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">بستن</button>
                    </div>
                </div>
            `);

            lucide.createIcons();
        } catch (e) {
            app.showNotification('خطا در دریافت جزئیات کمپین', 'error');
        }
    }
};
