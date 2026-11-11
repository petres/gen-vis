// the rows shown as a table: the cells of the CSV (see csvOf of
// utils/export.js) and the table of the button `table` instead of the
// plots, loaded with its first click, see comp/vis.js
export { tableOf, drawTable, maxRows };

import { extent } from "@/utils/d3";
import { columnValues } from "@/utils/data";

// the rows of the table drawn, the others are named by a note, so a chart
// of many rows does not stop the page
const maxRows = 1000;

/**
 * The rows in the columns of the dims: `columns` (their names, each
 * once, also the columns of transforms), `cells` (a list per row) and
 * `numeric` (per column, of a numeric dim). The values are the ones of the
 * data (e.g. dates as they are in the file), `formatted` ones are the texts
 * of the hover: numbers and dates in the format of their dim or of the
 * locale, the categories by their names, empty without a value.
 */
const tableOf = (store, rows, { formatted = false } = {}) => {
    const columns = [...new Set(Object.values(store.def.dims).map(m => m.column).filter(c => typeof c == 'string'))];
    // the first dim of a column, its type and format
    const dims = columns.map(c => Object.keys(store.def.dims).find(n => store.def.dims[n].column === c));
    const numeric = dims.map(n => store.def.dims[n].type == 'numeric');
    if (!formatted) {
        const positions = new Map(store.data.map((r, i) => [r, i]));
        const values = columns.map(c => columnValues(store.rows, store.columns, c));
        return { columns, numeric, cells: rows.map(r => {
            const i = positions.get(r);
            return values.map(v => v(i));
        }) };
    }
    const formats = dims.map(n => {
        const m = store.def.dims[n];
        if (m.type == 'numeric' || m.type == 'date') {
            // the thousands separators of the values of the column, as of
            // the domain of a scale, see valueFormat of utils/locale.js
            const domain = m.type == 'numeric' ? extent(rows, r => Number.isFinite(r[n]) ? r[n] : undefined) : [];
            const format = store.valueFormat(n, { domain: () => domain });
            return v => v === null || v === undefined || (typeof v == 'number' && !Number.isFinite(v))
                || (v instanceof Date && isNaN(v)) ? '' : format(v);
        }
        if (m.categoryProps)
            return v => v === null || v === undefined ? '' : String(store.text(store.prop(n, v)?.name ?? v) ?? '');
        return v => v === null || v === undefined ? '' : String(v);
    });
    return { columns, numeric, cells: rows.map(r => dims.map((n, j) => formats[j](r[n]))) };
};

// an element of the table
const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined)
        node.textContent = text;
    if (cls)
        node.className = cls;
    return node;
};

/**
 * The table of the rows shown (of the visible categories and the filter)
 * in `wrapper`, which replaces its content: `<table class="vis-table">`
 * with the `caption` (visually hidden, the title is above it), a header of
 * the names of the columns as in the CSV and the formatted values, numbers
 * at the right (`vis-number`); of more than maxRows rows the first ones and
 * a note of the others (`more` of the locale texts, `{n}` their number).
 */
const drawTable = (wrapper, store, rows, { caption }) => {
    const { columns, numeric, cells } = tableOf(store, rows.slice(0, maxRows), { formatted: true });
    const table = make('table', undefined, 'vis-table');
    if (caption)
        table.appendChild(make('caption', caption, 'vis-visually-hidden'));
    const head = table.appendChild(make('thead')).appendChild(make('tr'));
    columns.forEach((c, j) => {
        const th = head.appendChild(make('th', c, numeric[j] ? 'vis-number' : undefined));
        th.scope = 'col';
    });
    const body = table.appendChild(make('tbody'));
    cells.forEach(row => {
        const tr = body.appendChild(make('tr'));
        row.forEach((v, j) => tr.appendChild(make('td', v, numeric[j] ? 'vis-number' : undefined)));
    });
    const parts = [table];
    if (rows.length > maxRows) {
        const n = store.locale.number.format(',')(rows.length - maxRows);
        parts.push(make('div', store.locale.texts.more.replace('{n}', n), 'vis-table-more'));
    }
    wrapper.replaceChildren(...parts);
};
