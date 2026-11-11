export { createHover, byOrder };

import { create, join, setAttr } from "@/utils/dom";
import { fillHtml } from "@/utils/def";
import { drawSymbol } from "@/comp/legend";
import { el, patch, setHtml, setText, slotNodes, takeRange } from "@/comp/html";

// the higher order first, a total order, also of two rows above or below
// all stacks (Infinity - Infinity is NaN), the same orders keep their order
const byOrder = (a, b) => (b > a) - (b < a);

// the space between the marker and the hover
const space = 20;

// beside the marker, above or below it, e.g. of horizontal bars, or on it
const transforms = {
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
    above: `translate(-50%, calc(-100% - ${space}px))`,
    below: `translate(-50%, ${space}px)`,
    // on the position, e.g. in the center of a polar plot
    center: 'translate(-50%, -50%)',
};

// the names of the templates of a row: the globals, the names of the
// categories of its entries and their hover props, e.g. {land} and
// {land.unit}, the formatted values and the values, e.g. {y} and {y.value}
const namesOf = (store, row) => {
    const names = { ...store.names };
    Object.entries(row?.entries ?? {}).forEach(([n, e]) => {
        names[n] = e.name;
        Object.entries(e).forEach(([k, v]) => names[`${n}.${k}`] = v);
    });
    return names;
};

// the styles of a row, the nearest one is bold, see vis-nearest
const styleOf = row => {
    const { 'font-weight': weight, ...style } = row.style ?? {};
    return row.nearest || weight === undefined ? style : { ...style, 'font-weight': weight };
};

/**
 * The box of the hover of a facet, beside the marker, on the `side` with
 * more space. `show(hover)` draws the `title`, the `data` and the `payload`
 * of the rows of the slot and the events (see init of comp/facet-hover.js): the
 * `cells` of a row are the hover props of its categories (`data-dim`,
 * other props than the name as `data-prop`) and the value (`vis-value`),
 * the `style` of a row are the styles of the props of its categories
 * (`hover.row.props`), the nearest one stays bold, its `attrs` the keys of
 * its categories, e.g. data-type="load". The content is the one of the
 * hover slot, of the templates of the definition (`hover`) or the
 * table of the rows. `slots()` are the slots of the page.
 */
// the row of the total of a table of the hover, see totalRow
const totalOf = Symbol('total');

const createHover = (store, slots) => {
    const root = el('div', { class: 'vis-hover' });
    // the data drawn and the kind of the content, see show
    let drawn = null;
    let mode = null;
    let title = null;
    let table = null;

    const template = () => store.def.hover ?? {};
    // the rows from the top to the bottom, see orderOf of comp/facet-hover.js
    const sortedOf = data => [...(data ?? [])].sort((a, b) => byOrder(a.order, b.order));

    // the title has the names of the nearest row (or of the first one),
    // e.g. {definition} of a category of the position
    const filledTitle = hover => {
        const row = (hover.data ?? []).find(d => d.nearest) ?? hover.data?.[0];
        return fillHtml(template().title ?? '{title}', { ...namesOf(store, row), title: hover.title, total: hover.total?.name ?? '' });
    };

    // the row of the sum of the stacked values below the rows (`total`, true
    // or its name), its value in the cell of the values, see vis-hover-total
    const totalRow = hover => {
        const t = template().total;
        // the row of the total, without a total none, kept, not looked up
        let tr = table[totalOf] ?? null;
        if (!t || !hover.total) {
            tr?.remove();
            table[totalOf] = null;
            return;
        }
        tr ??= table[totalOf] = table.appendChild(document.createElement('tr'));
        tr.setAttribute('class', 'vis-hover-total');
        const swatched = (hover.data ?? []).some(d => d.swatch) ? 1 : 0;
        const width = Math.max(...(hover.data ?? []).map(d => d.cells.length + swatched), 2);
        const found = (hover.data?.[0]?.cells ?? []).findIndex(c => c.value);
        const value = found < 0 ? -1 : found + swatched;
        const at = value < 0 ? width - 1 : value;
        tr.replaceChildren(...Array.from({ length: width }, (_, i) => {
            const td = document.createElement('td');
            if (i == 0)
                td.textContent = store.text(t === true ? store.locale.texts.total : String(t));
            if (i == at) {
                td.setAttribute('class', 'vis-value');
                td.textContent = hover.total.name;
            }
            return td;
        }));
        table.appendChild(tr);
    };

    // the row of the names of the values above the rows (`vis-hover-head`),
    // if a row has more than one value, e.g. x, y and the size of a point
    const head = (data, swatched) => {
        const cells = data[0]?.cells ?? [];
        const named = cells.filter(c => c.value).length > 1;
        let tr = table.querySelector(':scope > tr.vis-hover-head');
        if (!named) {
            tr?.remove();
            return;
        }
        tr ??= table.insertBefore(document.createElement('tr'), table.firstChild);
        tr.setAttribute('class', 'vis-hover-head');
        tr.replaceChildren(...[...(swatched ? [{ swatch: true }] : []), ...cells].map(c => {
            const td = document.createElement('td');
            if (c.swatch)
                td.setAttribute('class', 'vis-swatch');
            if (c.value) {
                td.setAttribute('class', 'vis-value');
                td.textContent = c.label ?? '';
            }
            return td;
        }));
    };

    // the rows of the table of the default content, a swatch of the color
    // of the category of a row before its cells (`vis-swatch`), if a row has one
    const rows = data => {
        const swatched = data.some(d => d.swatch);
        head(data, swatched);
        const tr = join(table, data, { select: 'tr.vis-hover-entry', create: () => document.createElement('tr') });
        tr.forEach((tr, i) => {
            const d = data[i];
            tr.setAttribute('class', d.nearest ? "vis-hover-entry vis-nearest" : "vis-hover-entry");
            // the styles and the keys of the categories of the row, the
            // ones of the row before are removed
            tr.removeAttribute('style');
            [...tr.attributes].filter(a => a.name.startsWith('data-')).forEach(a => tr.removeAttribute(a.name));
            Object.entries(styleOf(d)).forEach(([k, v]) => tr.style.setProperty(k, v));
            Object.entries(d.attrs ?? {}).forEach(([k, v]) => tr.setAttribute(k, v));
            // the cells are new ones
            const swatch = [];
            if (swatched) {
                const td = document.createElement('td');
                td.setAttribute('class', 'vis-swatch');
                if (d.swatch?.symbol) {
                    // the symbol of the legend, in the height of a square of the swatch
                    const { symbol } = d.swatch;
                    const width = symbol.width ?? symbol.size ?? 16, height = symbol.height ?? symbol.size ?? 16;
                    const svg = td.appendChild(create('svg'));
                    patch(svg, { class: 'vis-swatch-symbol', viewBox: `0 0 ${width} ${height}`, width: `${(width/height*0.85).toFixed(3)}em`, height: '0.85em' });
                    drawSymbol(svg, symbol, d.swatch.scope);
                } else if (d.swatch)
                    td.appendChild(el('span', { style: { background: d.swatch.color } }));
                swatch.push(td);
            }
            tr.replaceChildren(...swatch, ...d.cells.map(c => {
                const td = document.createElement('td');
                setAttr(td, 'data-dim', c.dim);
                setAttr(td, 'data-prop', c.prop);
                if (c.value)
                    td.setAttribute('class', 'vis-value');
                td.textContent = c.text ?? '';
                return td;
            }));
        });
    };

    // the content of the hover, again for other rows, a title or a payload
    const content = hover => {
        const t = template();
        const own = slots();
        const kind = own?.hover ? 'slot' : t.row ? 'row' : t.title ? 'title' : 'table';
        if (kind != mode) {
            if (root.firstChild)
                takeRange(root.firstChild, root.lastChild);
            title = table = null;
            mode = kind;
            drawn = null;
        }
        if (drawn && drawn.data === hover.data && drawn.title === hover.title && drawn.payload === hover.payload)
            return;
        const first = !drawn;
        drawn = { data: hover.data, title: hover.title, payload: hover.payload };
        const sorted = sortedOf(hover.data);
        if (kind == 'slot') {
            // the rows and their formatted values, as the ones of the default table
            const props = { ...hover.payload, entries: sorted.map(d => ({ ...d.entries, nearest: d.nearest })) };
            // the nodes before stay together, see takeRange
            if (root.firstChild)
                takeRange(root.firstChild, root.lastChild);
            root.append(...slotNodes(own.hover(props)));
        } else if (kind == 'row') {
            // the rows of the template, its names are the ones of the entries of
            // the slot: {land} is the name of the category, {land.unit} another
            // hover prop, {y} the formatted value and {y.value} the value, and the globals
            title ??= root.appendChild(el('div', { class: 'vis-hover-title' }));
            setHtml(title, filledTitle(hover));
            const divs = join(root, sorted, { select: '.vis-hover-row', create: () => el('div') });
            divs.forEach((div, i) => {
                const d = sorted[i];
                patch(div, { class: d.nearest ? 'vis-hover-row vis-nearest' : 'vis-hover-row', style: styleOf(d), ...d.attrs });
                setHtml(div, fillHtml(t.row, namesOf(store, d)));
            });
        } else {
            if (!title) {
                title = root.appendChild(el('div', { class: 'vis-hover-title' }));
                table = root.appendChild(el('table', { class: 'vis-hover-entries' }));
            }
            if (kind == 'title')
                setHtml(title, filledTitle(hover));
            else
                setText(title, hover.title);
            // the rows are also drawn when the hover is shown, e.g. by a touch
            if (hover.data || first) {
                hover.data && rows(sorted);
                totalRow(hover);
            }
        }
    };

    return {
        el: root,
        // the position and the content of the hover
        show(hover) {
            patch(root, { class: 'vis-hover', style: { left: { left: `${-space}px`, right: `${space}px` }[hover.side] ?? '0px', transform: transforms[hover.side] } });
            content(hover);
        },
    };
};
