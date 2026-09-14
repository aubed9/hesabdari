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

module.exports = {
    normalizePersian,
    roundMoney
};
