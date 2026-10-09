export { getLocale, localeNames };

import * as d3 from "@/utils/d3";

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
        // the titles of the buttons of the footer
        texts: {
            download: 'Als PNG speichern',
            copy: 'Als PNG in die Zwischenablage kopieren',
            copied: 'Kopiert',
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

/**
 * The formatters of a locale, `locale` is the name of a built-in locale or
 * an object with the `base` locale (`de` by default) and `number`, `time`
 * and `timeTicks` parts which are merged into it.
 */
const getLocale = (locale = 'de') => {
    const custom = typeof locale == 'string' ? { base: locale } : locale;
    const base = locales[custom.base ?? 'de'];
    if (!base)
        throw new Error(`Unknown locale '${custom.base}', expected one of ${localeNames.map(n => `'${n}'`).join(', ')}`);
    const number = d3.formatLocale({ ...base.number, ...custom.number });
    const time = d3.timeFormatLocale({ ...base.time, ...custom.time });
    const timeTicks = { ...base.timeTicks, ...custom.timeTicks };
    return {
        number,
        time,
        texts: base.texts,
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
    };
};
