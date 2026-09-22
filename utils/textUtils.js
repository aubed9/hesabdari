// Text & Persian Character Normalization Utilities
function normalizePersian(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/إ/g, 'ا')
        .replace(/أ/g, 'ا')
        .replace(/ء/g, '')
        .replace(/[\u064B-\u065F]/g, '') // Remove Arabic diacritics (fatha, damma, etc.)
        .trim();
}

function roundMoney(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
}

function normalizeIranianMobile(raw) {
    if (!raw) return '';
    let str = String(raw).trim();
    // Convert Persian & Arabic digits to English
    const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    const arabicDigits  = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    for (let i = 0; i < 10; i++) {
        str = str.replace(new RegExp(persianDigits[i], 'g'), String(i));
        str = str.replace(new RegExp(arabicDigits[i], 'g'), String(i));
    }
    // Remove non-digit characters (spaces, dashes, parentheses, plus, etc.)
    str = str.replace(/[^\d]/g, '');

    // Handle international prefixes: +98 or 0098 or 98
    if (str.startsWith('0098')) {
        str = '0' + str.slice(4);
    } else if (str.startsWith('98') && str.length === 12) {
        str = '0' + str.slice(2);
    } else if (str.length === 10 && str.startsWith('9')) {
        str = '0' + str;
    }

    // An Iranian mobile number must start with 09 and be exactly 11 digits
    if (/^09\d{9}$/.test(str)) {
        return str;
    }
    if (str.length > 0 && !str.startsWith('0')) {
        str = '0' + str;
    }
    return str;
}

function formatMobileForExcel(raw) {
    const mob = normalizeIranianMobile(raw);
    if (!mob) return '""';
    // Format as ="09..." so Microsoft Excel treats it as a string formula and preserves the leading zero
    return `="${mob}"`;
}

function formatMobileWithoutZero(raw) {
    const mob = normalizeIranianMobile(raw);
    if (!mob) return '';
    return mob.startsWith('0') ? mob.slice(1) : mob;
}

function validateIranianMobile(raw) {
    if (!raw || !String(raw).trim()) {
        return { valid: false, message: 'شماره تلفن همراه الزامی است.' };
    }
    const normalized = normalizeIranianMobile(raw);
    if (!/^09\d{9}$/.test(normalized)) {
        return {
            valid: false,
            normalized,
            message: 'فرمت شماره تلفن همراه نامعتبر است. شماره همراه باید دقیقاً ۱۱ رقم بوده و با ۰۹ شروع شود (مثال: ۰۹۱۲۳۴۵۶۷۸۹).'
        };
    }
    return { valid: true, mobile: normalized };
}

module.exports = {
    normalizePersian,
    roundMoney,
    normalizeIranianMobile,
    formatMobileForExcel,
    formatMobileWithoutZero,
    validateIranianMobile
};
