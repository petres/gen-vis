// the comparisons of the values of definitions and of the data, e.g. of
// categories, used by the other parts, so they import no part of their own
export { isObject, numericText, compareCategories, comparison, toNumber, sameValue };

// an object of a definition, e.g. a mapping, not a list and not null
const isObject = v => v !== null && typeof v == 'object' && !Array.isArray(v);

// a number or the text of one, e.g. the category "2004", not an empty text
const numericText = v => typeof v == 'number' || (typeof v == 'string' && v.trim() !== '' && !isNaN(+v));

// categories compared as numbers if both are numbers, e.g. "9" before "10",
// otherwise as texts
const compareCategories = (a, b) => numericText(a) && numericText(b) ? a - b : String(a).localeCompare(String(b));

// the comparison of the values of a list, as numbers if all of them are
// numbers, otherwise as texts, e.g. of the categories of a scale
const comparison = values => values.every(numericText) ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b));

// a decimal number, also with an exponent and spaces around it, e.g. " 12 ",
// "-.5" or "1e3", not the other texts of Number, e.g. "0x10" or "Infinity"
const decimalNumber = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

// missing, invalid and infinite values are null, only numbers and texts of
// decimal numbers are numbers, not e.g. true or [1], which Number reads as
// 1, integers of 64 bits are numbers
const toNumber = v => {
    const n = typeof v == 'number' || typeof v == 'bigint' ? Number(v)
        : (typeof v == 'string' && decimalNumber.test(v) ? Number(v) : NaN);
    return Number.isFinite(n) ? n : null;
};

// values of globals and entries are the same as strings, e.g. the year 2024
// of the data and "2024" of a definition, but not 0 and "", missing ones are
// null, lists and objects are compared by their content
const scalar = v => v === null || v === undefined || typeof v != 'object';
const sameValue = (a, b) => {
    if (!scalar(a) || !scalar(b))
        return JSON.stringify(a) == JSON.stringify(b);
    if (a === null || a === undefined || b === null || b === undefined)
        return (a ?? null) === (b ?? null);
    return String(a) === String(b);
};
