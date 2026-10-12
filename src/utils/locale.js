export { getLocale, loadLocale, checkLocale, localeNames };

import * as d3 from "@/utils/d3";
import { lazy } from "@/utils/lazy";

// d3 locale definitions, see d3.formatLocale and d3.timeFormatLocale
const locales = {
    'de': {
        number: {
            decimal: ',',
            thousands: '.',
            grouping: [3],
            currency: ['', ' €'],
        },
        time: {
            dateTime: "%A, der %e. %B %Y, %X",
            date: "%d.%m.%Y",
            time: "%H:%M:%S",
            periods: ["AM", "PM"],
            days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
            shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
            months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
            shortMonths: ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
        },
        timeTicks: {
            millisecond: ".%L", second: ":%S", minute: "%H:%M", hour: "%H:%M",
            day: "%a %d", week: "%d. %b", month: "%B", year: "%Y",
        },
        // the titles of the buttons of the footer, the kind of the facets
        // with a hover and the description of their keys, of screen readers
        texts: {
            download: 'Als PNG speichern',
            copy: 'Als PNG in die Zwischenablage kopieren',
            copied: 'Kopiert',
            csv: 'Die Daten als CSV speichern',
            chart: 'Diagramm',
            keys: 'Die Pfeiltasten zeigen die Werte der Positionen und Zeilen, die Eingabetaste wählt sie aus, Escape schließt sie.',
        },
    },
    'en': {
        number: {
            decimal: '.',
            thousands: ',',
            grouping: [3],
            currency: ['$', ''],
        },
        time: {
            dateTime: "%x, %X",
            date: "%-m/%-d/%Y",
            time: "%-I:%M:%S %p",
            periods: ["AM", "PM"],
            days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
            shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        },
        timeTicks: {
            millisecond: ".%L", second: ":%S", minute: "%I:%M", hour: "%I %p",
            day: "%a %d", week: "%b %d", month: "%B", year: "%Y",
        },
        texts: {
            download: 'Save as PNG',
            copy: 'Copy as PNG to the clipboard',
            copied: 'Copied',
            csv: 'Save the data as CSV',
            chart: 'chart',
            keys: 'The arrow keys show the values of the positions and rows, enter selects them, escape hides them.',
        },
    },
}

const localeNames = Object.keys(locales);

const timeIntervals = {
    time: [d3.timeSecond, d3.timeMinute, d3.timeHour, d3.timeDay, d3.timeWeek, d3.timeMonth, d3.timeYear],
    utc: [d3.utcSecond, d3.utcMinute, d3.utcHour, d3.utcDay, d3.utcWeek, d3.utcMonth, d3.utcYear],
};

// the default tick format of d3 time scales, the formats depend on the interval of the date
const timeTickFormat = (format, formats, intervals) => {
    const f = Object.fromEntries(Object.entries(formats).map(([k, v]) => [k, format(v)]));
    const [second, minute, hour, day, week, month, year] = intervals;
    return date => (
        second(date) < date ? f.millisecond
        : minute(date) < date ? f.second
        : hour(date) < date ? f.minute
        : day(date) < date ? f.hour
        : month(date) < date ? (week(date) < date ? f.day : f.week)
        : year(date) < date ? f.month
        : f.year
    )(date);
};

// the definitions of the languages of Intl which are loaded, see loadLocale
const intlLocales = new Map();
let intl = null;

// an error if a tag is neither a built-in locale nor a language of Intl
const checkLocale = tag => {
    if (Object.hasOwn(locales, tag))
        return;
    let supported = [];
    try {
        supported = Intl.NumberFormat.supportedLocalesOf(tag);
    } catch {
        // an invalid tag
    }
    if (supported.length == 0)
        throw new Error(`Unknown locale '${tag}', expected one of ${localeNames.map(n => `'${n}'`).join(', ')} or a language of Intl, e.g. 'fr'`);
};

// the tag of the base of a locale, see getLocale
const baseOf = locale => (typeof locale == 'string' ? locale : locale?.base) ?? 'de';

// the definitions of a language of Intl, loaded with the first one
const loadLocale = async (locale = 'de') => {
    const tag = baseOf(locale);
    checkLocale(tag);
    if (Object.hasOwn(locales, tag) || intlLocales.has(tag))
        return;
    intl ??= await lazy.intl();
    intlLocales.set(tag, intl.intlLocale(tag, locales));
};

// the definitions of a locale, a built-in one or the one of Intl
const localeOf = tag => {
    checkLocale(tag);
    if (Object.hasOwn(locales, tag))
        return locales[tag];
    if (!intlLocales.has(tag))
        throw new Error(`The locale '${tag}' is not loaded, see loadLocale`);
    return intlLocales.get(tag);
};

/**
 * The formatters of a locale, `locale` is the name of a built-in locale (de
 * or en), a language tag of Intl (e.g. "fr" or "de-CH", loaded before, see
 * loadLocale) or an object with the `base` locale (`de` by default) and
 * `number`, `time`, `timeTicks` and `texts` parts which are merged into it.
 */
const getLocale = (locale = 'de') => {
    const custom = typeof locale == 'string' ? { base: locale } : (locale ?? {});
    const base = localeOf(baseOf(locale));
    const number = d3.formatLocale({ ...base.number, ...custom.number });
    const time = d3.timeFormatLocale({ ...base.time, ...custom.time });
    const timeTicks = { ...base.timeTicks, ...custom.timeTicks };
    return {
        number,
        time,
        texts: { ...base.texts, ...custom.texts },
        // the default format of the ticks of an axis without format, as the
        // one of d3 but in the locale, null for other scales
        tickFormat(scale, type, count = 10) {
            if (['linear', 'pow', 'sqrt'].includes(type)) {
                const [d0, d1] = scale.domain();
                const precision = d3.precisionFixed(d3.tickStep(d0, d1, count));
                return number.format(`,.${Number.isFinite(precision) ? precision : 0}f`);
            }
            if (type == 'time')
                return timeTickFormat(time.format, timeTicks, timeIntervals.time);
            if (type == 'utc')
                return timeTickFormat(time.utcFormat, timeTicks, timeIntervals.utc);
            return null;
        },
        // the default format of the values of the hover and of labels: dates
        // as the date of the locale, numbers with its decimal mark and up to
        // 6 decimals without trailing zeros, with thousands separators if the
        // domain of the scale reaches 10 000, so years are e.g. 2024, other
        // values as they are
        valueFormat(mapping, scale) {
            if (mapping.type == 'date')
                return (mapping.scale?.type == 'utc' ? time.utcFormat : time.format)('%x');
            if (mapping.type != 'numeric')
                return v => v;
            const plain = number.format('.6~f');
            const grouped = number.format(',.6~f');
            const domain = (scale?.domain?.() ?? []).filter(Number.isFinite);
            if (domain.length > 0)
                return d3.max(domain, Math.abs) >= 1e4 ? grouped : plain;
            return v => (Math.abs(v) >= 1e4 ? grouped : plain)(v);
        },
    };
};
