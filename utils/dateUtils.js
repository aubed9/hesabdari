// Solar Hijri (Jalali / Shamsi) Date Utilities
// Completely offline, deterministic algorithms for Gregorian <-> Jalali conversion

const PERSIAN_MONTH_NAMES = [
    '',
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند'
];

function gregorianToJalali(gy, gm, gd) {
    gy = Number(gy);
    gm = Number(gm);
    gd = Number(gd);
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    let jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    let jd = 1 + (days < 186 ? (days % 31) : ((days - 186) % 30));
    return { jy, jm, jd };
}

function jalaliToGregorian(jy, jm, jd) {
    jy = Number(jy);
    jm = Number(jm);
    jd = Number(jd);
    let gy = (jy <= 979) ? 621 : 1600;
    jy -= (jy <= 979) ? 0 : 979;
    let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
        gy += 100 * Math.floor(--days / 36524);
        days %= 36524;
        if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        gy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    let gd = days + 1;
    const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm;
    for (gm = 1; gm <= 12; gm++) {
        if (gd <= sal_a[gm]) break;
        gd -= sal_a[gm];
    }
    return { gy, gm, gd };
}

function toJalaliDateString(dateStr) {
    if (!dateStr) return '';
    try {
        const clean = String(dateStr).trim().split('T')[0].split(' ')[0];
        const parts = clean.split(/[-/]/);
        if (parts.length !== 3) return String(dateStr);
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return String(dateStr);
        
        // If already Jalali (e.g. 1300 to 1450)
        if (y >= 1300 && y <= 1450) {
            return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
        }

        const { jy, jm, jd } = gregorianToJalali(y, m, d);
        return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    } catch (e) {
        return String(dateStr);
    }
}

function toPersianDigits(str) {
    if (!str && str !== 0) return '';
    const pDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return String(str).replace(/[0-9]/g, w => pDigits[+w]);
}

function toJalaliFriendly(dateStr) {
    if (!dateStr) return 'ثبت نشده';
    const jStr = toJalaliDateString(dateStr);
    if (!jStr || !jStr.includes('/')) return dateStr;
    const parts = jStr.split('/').map(Number);
    if (parts.length !== 3) return dateStr;
    const [jy, jm, jd] = parts;
    const mName = PERSIAN_MONTH_NAMES[jm] || '';
    return toPersianDigits(`${jd} ${mName} ${jy}`);
}

function getCurrentJalaliDate() {
    const now = new Date();
    const { jy, jm, jd } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return {
        year: jy,
        month: jm,
        day: jd,
        monthName: PERSIAN_MONTH_NAMES[jm] || '',
        formatted: `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`,
        friendly: toPersianDigits(`${jd} ${PERSIAN_MONTH_NAMES[jm]} ${jy}`)
    };
}

function parseJalaliInputToGregorian(inputStr) {
    if (!inputStr) return null;
    let str = String(inputStr).trim();
    // Convert Persian/Arabic digits
    const pDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    const aDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    for (let i = 0; i < 10; i++) {
        str = str.replace(new RegExp(pDigits[i], 'g'), String(i)).replace(new RegExp(aDigits[i], 'g'), String(i));
    }
    const clean = str.replace(/[^0-9/-]/g, '').replace(/-/g, '/');
    const parts = clean.split('/').map(Number);
    if (parts.length !== 3) return null;
    let [y, m, d] = parts;
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;

    if (y < 100) y += 1300; // e.g. 71 -> 1371
    if (y >= 1300 && y <= 1450) {
        const { gy, gm, gd } = jalaliToGregorian(y, m, d);
        return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    }
    // Assume Gregorian
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getJalaliMonthName(m) {
    const num = Number(m);
    return PERSIAN_MONTH_NAMES[num] || '';
}

module.exports = {
    PERSIAN_MONTH_NAMES,
    gregorianToJalali,
    jalaliToGregorian,
    toJalaliDateString,
    toJalaliFriendly,
    getCurrentJalaliDate,
    parseJalaliInputToGregorian,
    getJalaliMonthName
};
