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
            csv: 'Die Daten als CSV speichern',
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

// the d3 format of the parts of a date of Intl, e.g. "%d.%m.%Y" of de
const pattern = (parts, codes) => parts.map(p => codes[p.type] ?? (p.type == 'literal' ? p.value.replace(/%/g, '%%') : '')).join('');

// the names of the days (from Sunday) and the months of a language
const names = (tag, key, style, dates) => dates.map(d => new Intl.DateTimeFormat(tag, { [key]: style, timeZone: 'UTC' }).format(d));

/**
 * The d3 locale definitions of a language tag of Intl, e.g. "fr" or "de-CH":
 * the separators of numbers, the formats of dates and times, the names of
 * the days and months, the formats of the ticks of time axes in the order of
 * the day and the month and the texts of the buttons (german for german
 * tags, english otherwise), the currency is the euro.
 */
const intlLocale = tag => {
    const number = new Intl.NumberFormat(tag, { useGrouping: true });
    const part = (parts, type, fallback) => parts.find(p => p.type == type)?.value ?? fallback;
    // the symbol of the currency before or after the number, with the space between them
    const currency = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' }).formatToParts(1);
    const symbol = currency.findIndex(p => p.type == 'currency');
    const before = symbol < currency.findIndex(p => p.type == 'integer');
    const next = currency[before ? symbol + 1 : symbol - 1];
    const space = next?.type == 'literal' ? next.value : '';
    const german = tag.toLowerCase().startsWith('de');

    const date = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).formatToParts(Date.UTC(2020, 10, 22));
    const clock = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    const hour12 = clock.resolvedOptions().hourCycle?.startsWith('h1');
    const time = clock.formatToParts(Date.UTC(2020, 10, 22, 13, 5, 9));
    const periods = [1, 13].map(h => part(new Intl.DateTimeFormat(tag, { hour: 'numeric', hour12: true, timeZone: 'UTC' })
        .formatToParts(Date.UTC(2020, 0, 1, h)), 'dayPeriod', h < 12 ? 'AM' : 'PM'));
    const dayFirst = date.findIndex(p => p.type == 'day') < date.findIndex(p => p.type == 'month');

    const days = [...Array(7).keys()].map(i => Date.UTC(2023, 0, 1 + i));
    const months = [...Array(12).keys()].map(i => Date.UTC(2023, i, 15));
    return {
        number: {
            decimal: part(number.formatToParts(1.5), 'decimal', '.'),
            thousands: part(number.formatToParts(12345), 'group', ','),
            grouping: [3],
            currency: before ? [currency[symbol].value + space, ''] : ['', space + currency[symbol].value],
        },
        time: {
            dateTime: '%x, %X',
            date: pattern(date, { day: '%d', month: '%m', year: '%Y' }),
            time: pattern(time, { hour: hour12 ? '%I' : '%H', minute: '%M', second: '%S', dayPeriod: '%p' }),
            periods,
            days: names(tag, 'weekday', 'long', days),
            shortDays: names(tag, 'weekday', 'short', days),
            months: names(tag, 'month', 'long', months),
            shortMonths: names(tag, 'month', 'short', months),
        },
        timeTicks: {
            millisecond: '.%L', second: ':%S', minute: hour12 ? '%I:%M' : '%H:%M', hour: hour12 ? '%I %p' : '%H:%M',
            day: '%a %d', week: dayFirst ? (german ? '%d. %b' : '%d %b') : '%b %d', month: '%B', year: '%Y',
        },
        texts: (german ? locales.de : locales.en).texts,
    };
};

// the definitions of a locale, a built-in one or the one of Intl
const localeOf = tag => {
    if (Object.hasOwn(locales, tag))
        return locales[tag];
    let supported = [];
    try {
        supported = Intl.NumberFormat.supportedLocalesOf(tag);
    } catch {
        // an invalid tag
    }
    if (supported.length == 0)
        throw new Error(`Unknown locale '${tag}', expected one of ${localeNames.map(n => `'${n}'`).join(', ')} or a language of Intl, e.g. 'fr'`);
    return intlLocale(tag);
};

/**
 * The formatters of a locale, `locale` is the name of a built-in locale (de
 * or en), a language tag of Intl (e.g. "fr" or "de-CH") or an object with
 * the `base` locale (`de` by default) and `number`, `time`, `timeTicks` and
 * `texts` parts which are merged into it.
 */
const getLocale = (locale = 'de') => {
    const custom = typeof locale == 'string' ? { base: locale } : locale;
    const base = localeOf(custom.base ?? 'de');
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
    };
};
