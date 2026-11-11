export { createLegend, createAnnotationLegend, drawSymbol, entrySymbol };

import { create, itemOf, join } from "@/utils/dom";
import { textWidth } from '@/utils/measure';
import { evaluate } from "@/utils/expr";
import { setProps } from "@/utils/draw";
import { withColor } from "@/layout";
import { el, patch, setText } from "@/comp/html";
import { symbolDefaults } from "@/utils/defaults";
import { symbolOf, symbolShape } from "@/utils/def";
import { symbolVars } from "@/utils/highlight";

// the class of a value of a prop, e.g. of the legend props, as Vue joins
// them: a string, the names of an object with a true value, a list of them
const classOf = c => typeof c == 'string' ? c
    : Array.isArray(c) ? c.map(classOf).filter(Boolean).join(' ')
    : c && typeof c == 'object' ? Object.keys(c).filter(k => c[k]).join(' ')
    : '';

// the attributes of an entry: its own ones, the legend props (without the
// name, e.g. a class), the ones of the checkbox after them, see the
// mergeProps of Vue, a prop of the same name as one before stays in its place
const entryAttrs = (own, props, after) => {
    const attrs = { ...own };
    Object.entries(props).forEach(([k, v]) => {
        if (k == 'class')
            attrs.class = [attrs.class, classOf(v)].filter(Boolean).join(' ');
        else if (k !== '')
            attrs[k] = v;
    });
    return Object.assign(attrs, after);
};

// the props of the elements of the symbol drawn, see drawSymbol
const drawn = Symbol('symbol');

// the symbol of an entry, its elements with the props of the category, drawn
// again if they change, e.g. of the globals of a control; an element
// of a mark with a highlight (`mark`, see symbolHighlight of utils/def.js)
// is of the stylesheet of its highlight (`data-symbol-of`), with the values
// of the category of its props, e.g. "@color" (see symbolVars)
const drawSymbol = (svg, info, scope) => {
    const props = info.elements.map(e => evaluate(e.props, scope));
    const vars = info.elements.map(e => e.mark === undefined ? null : symbolVars(e.highlight, scope));
    const key = JSON.stringify([props, vars]);
    if (svg[drawn] === key)
        return;
    svg[drawn] = key;
    svg.replaceChildren();
    info.elements.forEach((e, i) => {
        const node = svg.appendChild(create(e.type));
        setProps.call(node, props[i]);
        if (e.mark !== undefined) {
            node.setAttribute('data-symbol-of', e.mark);
            Object.entries(vars[i]).forEach(([k, v]) => v !== null && node.style.setProperty(k, v));
        }
    });
};

// the symbol of the entry of a category (its props, of the dim `m`):
// the one of the category or the one of the legend, null of none or of an
// empty one (no elements or a box of no size), e.g. of "symbol": null
const entrySymbol = (m, props) => {
    const given = props?.symbol !== undefined ? props.symbol : m.legend?.symbol;
    return given && !(Array.isArray(given.elements) && given.elements.length == 0)
        && (given.width ?? given.size ?? 16) > 0 && (given.height ?? given.size ?? 16) > 0 ? given : null;
};

/**
 * The legend of the categories of the dim `legend`: an entry is a
 * checkbox, also of the keyboard (enter, space), a double click shows only
 * it, the next one all entries. `update(inData)` draws it again, `inData`
 * are the categories of the filtered rows of a legend with `onlyData`.
 * `vis` has the store, `changeSelected` of a change and `highlight` of the
 * categories of an entry, see vis.js.
 */
const createLegend = (vis, legend) => {
    const { store } = vis;
    const root = el('div', { class: 'vis-legend', 'data-dim': legend });
    const title = root.appendChild(el('div', { class: 'vis-legend-title' }));
    const list = root.appendChild(el('div'));
    let before = null;

    // the dim, a control can replace it, e.g. by another column
    const info = () => store.dim(legend);
    // the categories of the entries, without the ones with `"legend": false`,
    // e.g. headers, they stay visible, also the ones which are not in the rows
    const categories = () => { const m = info(); return m.keys.filter(key => m.categoryProps[key].legend !== false) };

    const changed = () => vis.changeSelected();
    const switched = entry => {
        entry.props.visible = !entry.props.visible;
        changed();
    };
    // the second click of a double click is the one of `only`, the
    // visibility before the first one is kept for it
    const clicked = (entry, event) => {
        if (event.detail > 1)
            return;
        before = { key: entry.key, visible: categories().map(key => info().categoryProps[key].visible) };
        switched(entry);
    };
    // only the entry, if it is the only one already all entries, also
    // the categories which are not in the rows of a legend with `onlyData`,
    // so they stay hidden when they are in the rows again, e.g. of a filter
    const only = entry => {
        const all = categories();
        const m = info();
        const visible = before?.key === entry.key ? before.visible : all.map(key => m.categoryProps[key].visible);
        const alone = all.every((key, i) => visible[i] == (key === entry.key));
        all.forEach(key => m.categoryProps[key].visible = alone || key === entry.key);
        changed();
    };
    const highlight = entry => vis.highlight(entry ? { dim: legend, key: entry.key } : {});
    // the highlight of the mouse, not of a touch, it has no end
    const hovered = (entry, event) => {
        if (event.pointerType != 'touch')
            highlight(entry);
    };

    // an entry, its listeners take its entry of the last draw
    const createEntry = () => {
        const div = el('div');
        const entry = () => div[itemOf];
        const on = (name, fn) => div.addEventListener(name, e => vis.guard(() => fn(e)));
        on('click', e => clicked(entry(), e));
        on('dblclick', () => only(entry()));
        on('keydown', e => {
            if (e.key == 'Enter' || e.key == ' ') {
                e.preventDefault();
                switched(entry());
            }
        });
        on('pointerenter', e => hovered(entry(), e));
        on('pointerleave', e => hovered(null, e));
        on('focus', () => highlight(entry()));
        on('blur', () => highlight(null));
        return div;
    };

    const update = inData => {
        const m = info();
        const name = store.text(m.name);
        setText(title, name);
        patch(list, { class: 'vis-legend-entries', role: 'group', 'aria-label': name });
        // with `onlyData` without the ones which are not in the rows
        const entries = categories().filter(key => !inData || inData.has(key)).map(key => ({ key, props: m.categoryProps[key] }));
        const scope = store.scope;
        join(list, entries, { key: e => e.key, create: createEntry }).forEach((div, i) => {
            const entry = entries[i];
            // the props of the entry with its default colors, see withColor of
            // layout.js, its legend props also with the globals of the store
            const colored = withColor([entry.props]);
            const filled = evaluate(m.legend.props, { ...scope, ...colored });
            patch(div, entryAttrs({ class: 'vis-legend-entry', 'data-visible': entry.props.visible, 'data-key': entry.key },
                { ...filled, name: null },
                { role: 'checkbox', tabindex: '0', 'aria-checked': String(entry.props.visible) }));
            // the symbol of the category or the one of the legend, none of
            // an empty one (no elements or a box of no size), so the name has
            // no space before it, also of a category of "symbol": null
            const symbol = entrySymbol(m, entry.props);
            let svg = div.firstElementChild?.tagName == 'svg' ? div.firstElementChild : null;
            let span = div.lastElementChild?.tagName == 'SPAN' ? div.lastElementChild : null;
            if (symbol && !svg)
                svg = div.insertBefore(create('svg'), div.firstChild);
            else if (!symbol && svg) {
                svg.remove();
                svg = null;
            }
            if (svg) {
                symbolBox(svg, symbol.width ?? symbol.size ?? 16, symbol.height ?? symbol.size ?? 16);
                drawSymbol(svg, symbol, { ...scope, ...colored });
            }
            span ??= div.appendChild(el('span'));
            const name = store.text(filled.name);
            setText(span, name);
            // as wide as the bold name of the highlight, so no entry moves, see styles.css
            const cs = typeof getComputedStyle == 'function' && span.isConnected ? getComputedStyle(span) : null;
            if (cs?.fontSize)
                span.style.minWidth = `${Math.ceil(textWidth(name, `600 ${cs.fontSize} ${cs.fontFamily}`))}px`;
        });
    };

    return { el: root, update };
};

// the box of the symbol of an entry, its middle at the middle of the
// capitals of the name (--gen-vis-legend-symbol-middle above the baseline),
// the bottom of an inline svg is on the baseline, see styles.css
const symbolBox = (svg, width, height) => patch(svg, { width, height,
    style: `vertical-align: calc(var(--gen-vis-legend-symbol-middle, 0.36em) - ${height/2}px)` });

/**
 * The entries of the annotations with a `legend` (a name, also a template
 * of the globals), one per name: its symbol of the type of the annotation,
 * a vertical line of a line at a value of a horizontal scale (e.g. a date
 * of x), a horizontal one otherwise, a box of a band, a dot of a circle,
 * with the props and the classes of the annotation, in the box of the
 * defaults of the line (or of the rect or circle) of the chart.
 */
const annotationEntries = store => {
    const defaults = symbolDefaults(store.chartDefaults);
    const seen = new Set();
    return store.def.marks.filter(p => p.type?.startsWith('annotation:') && p.legend !== undefined && p.legend !== null).flatMap(p => {
        const name = store.text(String(p.legend));
        if (seen.has(name))
            return [];
        seen.add(name);
        const type = p.type.split(':')[1];
        const row = p.data?.[0] ?? {};
        const vertical = Object.keys(row).some(k => row[k] !== null && store.def.dims[k]?.scale?.orientation == 'horizontal');
        const kind = type == 'band' ? 'rect' : type == 'circle' ? 'circle' : 'line';
        // the box of the shortcut of the defaults, the shape without the
        // colors of categories, the ones of the annotation and its class
        const { width, height } = symbolOf(kind, new Set(), defaults);
        const { stroke, fill, 'stroke-width': _, ...shape } = symbolShape(kind, width, height);
        const attrs = type == 'circle' ? { ...shape, r: Math.min(4, Math.min(width, height)/2 - 1) }
            : vertical ? { x1: width/2, x2: width/2, y1: 0, y2: height } : shape;
        const props = evaluate(p.props ?? {}, store.scope);
        return [{ name, width, height, element: kind, attrs: { ...attrs, ...props, class: `vis-annotation vis-${type}` } }];
    });
};

/**
 * The legend of the annotations with a `legend` (see annotationEntries):
 * an entry per name with its symbol, not a toggle. `update()` draws it again.
 */
const createAnnotationLegend = vis => {
    const root = el('div', { class: 'vis-legend vis-legend-annotations' });
    const list = root.appendChild(el('div', { class: 'vis-legend-entries' }));
    const update = () => {
        const entries = annotationEntries(vis.store);
        join(list, entries, { key: e => e.name, create: () => el('div', { class: 'vis-legend-entry' }) }).forEach((div, i) => {
            const e = entries[i];
            div.replaceChildren();
            const svg = div.appendChild(create('svg'));
            symbolBox(svg, e.width, e.height);
            const shape = svg.appendChild(create(e.element));
            setProps.call(shape, e.attrs);
            const span = div.appendChild(el('span'));
            setText(span, e.name);
        });
    };
    return { el: root, update };
};
