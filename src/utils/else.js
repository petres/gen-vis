export { capitalize, locale, localeTime };

import * as d3 from "d3";



const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1);

const locales = {
    'de': {
        decimal: ',',
        thousands: '.',
        grouping: [3],
        currency: '€',
    }
}
const timeLocales = {
    'de': {
        dateTime: "%A, der %e. %B %Y, %X",
        date: "%d.%m.%Y",
        time: "%H:%M:%S",
        periods: ["AM", "PM"],
        days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
        shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
        months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
        shortMonths: ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
    }
}


const locale = d3.formatLocale(locales['de'])
const localeTime = d3.timeFormatLocale(timeLocales['de'])
