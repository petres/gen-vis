export { createLegend, createAnnotationLegend, annotationEntries };

import { create, itemOf, join } from "@/utils/dom";
import { evaluate } from "@/utils/expr";
import { setProps } from "@/utils/draw";
import { withColor } from "@/layout";
import { el, patch, setText } from "@/comp/html";
import { symbolDefaults } from "@/utils/defaults";

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
// again if they change, e.g. of the globals of a form element
const drawSymbol = (svg, info, scope) => {
    const props = info.elements.map(e => evaluate(e.props, scope));
    const key = JSON.stringify(props);
    if (svg[drawn] === key)
        return;
    svg[drawn] = key;
    svg.replaceChildren();
    info.elements.forEach((e, i) => {
        const node = svg.appendChild(create(e.type));
        setProps.call(node, props[i]);
    });
};

/**
 * The legend of the categories of the mapping `legend`: an entry is a
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

    // the mapping, a form element can replace it, e.g. by another column
    const info = () => store.mapping(legend);
    // the categories of the entries, without the ones with `"legend": false`,
    // e.g. headers, they stay visible, also the ones which are not in the rows
    const categories = () => { const m = info(); return m.keys.filter(key => m.categoryProps[key].legend !== false) };

    const changed = () => vis.changeSelected({ dim: legend });
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
            // the symbol of the category or the one of the legend
            const symbol = entry.props.symbol ?? m.legend.symbol;
            let svg = div.firstElementChild?.tagName == 'svg' ? div.firstElementChild : null;
            let span = div.lastElementChild?.tagName == 'SPAN' ? div.lastElementChild : null;
            if (symbol && !svg)
                svg = div.insertBefore(create('svg'), div.firstChild);
            else if (!symbol && svg) {
                svg.remove();
                svg = null;
            }
            if (svg) {
                // the box of the symbol, its middle at the middle of the
                // capitals of the name (--gen-vis-legend-symbol-middle above
                // the baseline), the bottom of an inline svg is on the
                // baseline, see styles.css
                const height = symbol.height ?? symbol.size ?? 16;
                patch(svg, { width: symbol.width ?? symbol.size ?? 16, height,
                    style: `vertical-align: calc(var(--gen-vis-legend-symbol-middle, 0.36em) - ${height/2}px)` });
                drawSymbol(svg, symbol, { ...scope, ...colored });
            }
            span ??= div.appendChild(el('span'));
            setText(span, store.text(filled.name));
        });
    };

    return { el: root, update };
};

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
    const box = kind => {
        const d = defaults?.[kind] ?? {};
        const size = d.size ?? defaults?.size ?? 16;
        return { width: d.width ?? defaults?.width ?? size, height: d.height ?? defaults?.height ?? size };
    };
    const seen = new Set();
    return store.def.plot.filter(p => p.type?.startsWith('annotation:') && p.legend !== undefined && p.legend !== null).flatMap(p => {
        const name = store.text(String(p.legend));
        if (seen.has(name))
            return [];
        seen.add(name);
        const type = p.type.split(':')[1];
        const row = p.data?.[0] ?? {};
        const vertical = Object.keys(row).some(k => row[k] !== null && store.def.mapping[k]?.scale?.orientation == 'horizontal');
        const kind = type == 'band' ? 'rect' : type == 'circle' ? 'circle' : 'line';
        const { width, height } = box(kind);
        const shape = type == 'band' ? { element: 'rect', attrs: { x: 0, y: 0.5, width, height: height - 1 } }
            : type == 'circle' ? { element: 'circle', attrs: { cx: width/2, cy: height/2, r: Math.min(4, Math.min(width, height)/2 - 1) } }
            : vertical ? { element: 'line', attrs: { x1: width/2, x2: width/2, y1: 0, y2: height } }
            : { element: 'line', attrs: { x1: 0, x2: width, y1: height/2, y2: height/2 } };
        const props = evaluate(p.props ?? {}, store.scope);
        return [{ name, width, height, element: shape.element, attrs: { ...shape.attrs, ...props, class: `vis-annotation vis-${type}` } }];
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
            patch(svg, { width: e.width, height: e.height,
                style: `vertical-align: calc(var(--gen-vis-legend-symbol-middle, 0.36em) - ${e.height/2}px)` });
            const shape = svg.appendChild(create(e.element));
            setProps.call(shape, e.attrs);
            const span = div.appendChild(el('span'));
            setText(span, e.name);
        });
    };
    return { el: root, update };
};
