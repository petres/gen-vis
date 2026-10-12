// the d3 locale definitions of the languages of Intl, loaded for a locale
// which is not built in, see loadLocale of utils/locale.js
export { intlLocale };

// the d3 format of the parts of a date of Intl, e.g. "%d.%m.%Y" of de
const pattern = (parts, codes) => parts.map(p => codes[p.type] ?? (p.type == 'literal' ? p.value.replace(/%/g, '%%') : '')).join('');

// the dates and numbers of Intl in the calendar and the digits of d3, e.g.
// the months of the gregorian calendar of Persian, not of its own one
const intlDates = { calendar: 'gregory', numberingSystem: 'latn', timeZone: 'UTC' };

// the names of the days (from Sunday) and the months of a language
const names = (tag, key, style, dates) => dates.map(d => new Intl.DateTimeFormat(tag, { [key]: style, ...intlDates }).format(d));

/**
 * The d3 locale definitions of a language tag of Intl, e.g. "fr" or "de-CH":
 * the separators of numbers, the formats of dates and times, the names of
 * the days and months, the formats of the ticks of time axes in the order of
 * the day and the month and the texts of the buttons (german for german
 * tags, english otherwise), the currency is the euro.
 */
const intlLocale = (tag, builtIn) => {
    const number = new Intl.NumberFormat(tag, { useGrouping: true, numberingSystem: 'latn' });
    const part = (parts, type, fallback) => parts.find(p => p.type == type)?.value ?? fallback;
    // the symbol of the currency before or after the number, with the space between them
    const currency = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', numberingSystem: 'latn' }).formatToParts(1);
    const symbol = currency.findIndex(p => p.type == 'currency');
    const before = symbol < currency.findIndex(p => p.type == 'integer');
    const next = currency[before ? symbol + 1 : symbol - 1];
    const space = next?.type == 'literal' ? next.value : '';
    const german = tag.toLowerCase().startsWith('de');

    const date = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', ...intlDates }).formatToParts(Date.UTC(2020, 10, 22));
    const clock = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', second: '2-digit', ...intlDates });
    const hour12 = clock.resolvedOptions().hourCycle?.startsWith('h1');
    const time = clock.formatToParts(Date.UTC(2020, 10, 22, 13, 5, 9));
    const periods = [1, 13].map(h => part(new Intl.DateTimeFormat(tag, { hour: 'numeric', hour12: true, ...intlDates })
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
        texts: (german ? builtIn.de : builtIn.en).texts,
    };
};
