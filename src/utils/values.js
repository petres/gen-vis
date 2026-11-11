// the comparisons of the values of definitions and of the data, e.g. of
// categories, used by the other parts, so they import no part of their own
export { isObject, missing, compareCategories, comparison, toNumber, sameValue, inherited, ownValue, truthy };

// an object of a definition, e.g. a dim, not a list and not null
const isObject = v => v !== null && typeof v == 'object' && !Array.isArray(v);

// a missing value: null, undefined or a text of only whitespace, e.g. an
// empty cell of csv
const missing = v => v === null || v === undefined || (typeof v == 'string' && v.trim() === '');

// a name every object has of its prototype, e.g. "constructor" or
// "__proto__": no column of a row which has none of the name, its value is
// only the one of the row itself (`ownValue`), checked once per name, not
// per row
const inherited = name => (typeof name == 'string' || typeof name == 'symbol') && name in Object.prototype;
const ownValue = (row, name) => row !== null && row !== undefined && Object.hasOwn(row, name) ? row[name] : undefined;

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
// the same, e.g. null and "", lists and objects are compared by their content
const scalar = v => v === null || v === undefined || typeof v != 'object';
const sameValue = (a, b) => {
    if (!scalar(a) || !scalar(b))
        return JSON.stringify(a) == JSON.stringify(b);
    if (missing(a) || missing(b))
        return missing(a) && missing(b);
    return String(a) === String(b);
};

// the truth of a value of a condition, e.g. of `if`, `and` or a filter:
// false are false, 0, NaN, null, no value, empty lists and the texts which
// are empty (also of whitespace, a missing value), a number 0 or "false" of
// any case, e.g. the flags "0" and "FALSE" of a column of csv, all other
// values are true
const falseText = /^\s*(?:false|[+-]?(?:0+\.?0*|\.0+)(?:e[+-]?\d+)?)?\s*$/i;
const truthy = v => typeof v == 'string' ? !falseText.test(v) : (Array.isArray(v) ? v.length > 0 : Boolean(v));
