// the comparisons of the values of definitions and of the data, e.g. of
// categories, used by the other parts, so they import no part of their own
export { isObject, numericText, compareCategories, comparison };

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
