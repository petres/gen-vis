export { createVis };

import { gridOf, layout } from "@/layout";
import { clearMeasures } from '@/utils/measure';
import { rowHeadersOf } from "@/utils/normalize";
import { evaluate } from "@/utils/expr";
import { markPath, sizeOf, warnOnce } from "@/utils/warn";
import { dataAttribute, reducedMotion } from "@/utils/draw";
import { canCopy } from "@/utils/clipboard.js";
import { create } from "@/utils/dom";
import { cleanHtml, el, patch, place, setHtml, setText, slotNodes, takeRange } from "@/comp/html";
import { createFacets } from "@/comp/facets";
import { createLegends, annotationsLegend } from "@/comp/legends";
import { createControl } from "@/comp/control";
import { highlightStyle } from "@/utils/highlight";
import { lazy } from "@/utils/lazy";

// the width of the visualisation inside its padding and border, e.g. of a card
// styled by the page, the svg fills only this part
const innerWidth = el => {
    const style = getComputedStyle(el);
    const sides = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((sum, p) => sum + (parseFloat(style[p]) || 0), 0);
    return el.getBoundingClientRect().width - sides;
};

// the icons of the buttons, copy, check, file-text, image and download of
// the feather icons, table of the lucide icons
const icons = {
    copy: 'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    copied: 'M20 6L9 17l-5-5',
    csv: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    svg: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    table: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M3 15h18M12 3v18',
};

// a button of the footer with its icon, type="button" does not submit a
// form around the visualisation
const button = (cls, onClick) => {
    const b = el('button', { type: 'button', class: cls });
    const svg = b.appendChild(create('svg'));
    patch(svg, { viewBox: '0 0 24 24', width: '14', height: '14' });
    svg.appendChild(create('path'));
    b.addEventListener('click', onClick);
    return b;
};

// the charts of a page have ids of their own, the scope of their stylesheets
let count = 0;

// the same props of a slot, its content is drawn again otherwise
const sameProps = (a, b) => a && b && Object.keys(a).length == Object.keys(b).length
    && Object.keys(a).every(k => a[k] === b[k]);

// the content of a slot in `parent` before `before`, drawn again if the
// slot or its props change, see docs/usage.md "Events and slots". Its nodes are
// the ones from its first to its last, also the ones which the slot adds
// between them later, e.g. Vue (see vue-adapter.js), they are removed
// together, see takeRange
const slotPart = () => {
    let first = null, last = null, fn = null, props = null;
    const remove = () => {
        if (first)
            takeRange(first, last);
        first = last = null;
    };
    return {
        draw(parent, slot, next, before = null) {
            if (slot === fn && sameProps(props, next)) {
                if (first && (first.parentNode !== parent || last.nextSibling !== before))
                    parent.insertBefore(takeRange(first, last), before);
                return;
            }
            remove();
            fn = slot;
            props = next;
            const nodes = slotNodes(slot(next));
            nodes.forEach(n => parent.insertBefore(n, before));
            first = nodes[0] ?? null;
            last = nodes.at(-1) ?? null;
        },
        clear() {
            remove();
            fn = props = null;
        },
    };
};

// a length of css in pixels, e.g. of a variable of the margins: a number
// or of the units px, rem (of the font size of the page), em (of the one of
// the chart, `styles`) or pt, undefined otherwise
const cssPixels = (value, styles) => {
    const m = /^(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(px|rem|em|pt)?$/i.exec(value ?? '');
    if (!m)
        return undefined;
    const n = Number(m[1]);
    const unit = (m[2] ?? 'px').toLowerCase();
    const fontSize = element => parseFloat(element ? getComputedStyle(element).fontSize : NaN) || 16;
    return unit == 'px' ? n : unit == 'pt' ? n*4/3
        : unit == 'rem' ? n*fontSize(typeof document != 'undefined' ? document.documentElement : null)
        : n*(parseFloat(styles?.fontSize) || 16);
};

/**
 * The visualisation of a loaded definition (the element `.vis`): the
 * header, the form elements, the legends, the facets and the footer. `app`
 * has the store, the slots (`slots()`), the props of the buttons
 * (`props()`), the files (save, copy, csv), `emit` of the events of the
 * hover, `stateChanged()` of a change of the user, `rendered()` once it is
 * drawn, `drawn()` after every draw and `showError(error)`, see app.js.
 * Changes are drawn together in a microtask (see invalidate), a new view
 * (see update) only after a change of the state or of the width.
 */
const createVis = app => {
    const { store, files } = app;
    const slots = () => app.slots() ?? {};
    const texts = () => store.locale.texts;
    const options = () => store.def.options;

    // the rows, facets and scales, see layout.js, the width of the plots and
    // of the visualisation, see measure
    let view = null;
    let width = null;
    let fullWidth = null;
    let globals = {};
    let formElements = [];
    // the check instead of the icon of the copy for a while
    let copied = false;
    const clipboard = canCopy();
    let removed = false;
    let resizeObserver = null, resizeTimeout = null, copiedTimeout = null;
    // a draw is due (see invalidate), a new view of a state set from outside
    let queued = false;
    let stateSet = false;

    // the errors of the listeners and the draws are shown instead of the visualisation
    const guard = fn => {
        try {
            return fn();
        } catch (error) {
            app.showError(error);
        }
    };

    // the mappings of the legends by their position, `top` by default, a
    // global can change them
    const legendsAt = () => {
        const at = { top: [], bottom: [], left: [], right: [] };
        // a prop of the width of the visualisation, e.g. below the plots of a phone
        const scope = { ...store.scope, totalWidth: fullWidth };
        // the legends of the width of the visualisation, see color-legend.js
        store.mappingNamesWithKey('legend').forEach(n => at[evaluate(store.mapping(n).legend.position, scope) ?? 'top']?.push(n));
        // the annotations with a name after the legends of the mappings, at
        // the position of the first one
        if (store.def.plot.some(p => p.type?.startsWith('annotation:') && p.legend !== undefined && p.legend !== null))
            (Object.values(at).find(names => names.length > 0) ?? at.top).push(annotationsLegend);
        return at;
    };
    // the text instead of the plots: `options.message`, a prop of the
    // globals and the width, e.g. steps of `totalWidth` or a global of a
    // control, or `options.empty` without rows
    const messageOf = () => {
        const scope = { ...store.scope, totalWidth: width };
        const message = store.text(evaluate(options().message ?? null, scope));
        if (message !== null && message !== undefined && message !== '')
            return String(message);
        return view && view.rows.length == 0 && options().empty ? store.text(options().empty) : null;
    };
    // legends beside the plots
    const sidesOf = at => at.left.length > 0 || at.right.length > 0;

    // the elements, see render
    const uid = count++;
    const root = el('div', { 'data-vis': uid });
    // the stylesheet of the highlights of the plots, see utils/highlight.js
    const style = root.appendChild(el('style'));
    const header = root.appendChild(el('div', { class: 'vis-header' }));
    const form = root.appendChild(el('div', { class: 'vis-controls' }));
    const footer = el('div', { class: 'vis-footer' });
    const footerContent = footer.appendChild(el('div', { class: 'vis-footer-content' }));
    let headerTitle = null, headerSubtitle = null, footerSpan = null;
    let message = null;
    // the parts of the plots: the containers of the legends and their
    // legends (see legends.js), the body and the facets in it (see facets.js)
    const parts = { top: null, left: null, right: null, bottom: null };
    const legends = {};
    let body = null, bodyKind = null, plots = null, sides = null, facets = null, facetsIn = null, drawnView = null;
    let buttons = null, copyButton = null, csvButton = null, svgButton = null, downloadButton = null, tableButton = null;
    // the table instead of the plots (see app.table), its module, loaded
    // with the first one, and the view drawn in it
    let table = null, tableModule = null, tableLoad = null, tableView = null;
    const toggleTable = on => app.table.show(on);
    const headerSlot = slotPart(), footerSlot = slotPart(), buttonsSlot = slotPart();
    root.appendChild(footer);

    const highlight = info => facets?.highlight(info.dim === undefined ? null : {[info.dim]: info.key});

    // the entries of the legends of the categories of a highlighted row,
    // e.g. of the line under the pointer, of an entry of a legend or of the
    // page, the class `vis-legend-highlight` (bold), null ends it
    // The legends and the key marked in each are kept until the legends are
    // drawn again (drawLegends), so a move of the hover within the same
    // category does not search and toggle all entries of the chart.
    let marked = null;
    const markLegends = row => {
        marked ??= [...root.querySelectorAll('.vis-legend[data-dim]')].map(legend => ({ legend, key: undefined }));
        marked.forEach(m => {
            const value = row?.[m.legend.dataset.dim];
            const key = value === null || value === undefined ? null : String(value);
            if (key === m.key)
                return;
            m.key = key;
            m.legend.querySelectorAll(':scope > .vis-legend-entries > .vis-legend-entry')
                .forEach(entry => entry.classList.toggle('vis-legend-highlight', entry.dataset.key === key));
        });
    };

    const vis = { store, slots, emit: app.emit, guard, highlight, markLegends, changeSelected: () => changeSelected() };

    // the rows, facets and scales of the store, `animated` of a change of
    // the user or the state, the elements move with the transition of
    // the definition, not the ones of a new width, a new width (`resize`)
    // keeps the rows of the view, see layout
    const update = (animated = false, resize = false) => {
        const next = layout(store, width, resize ? view : null);
        const transition = options().transition;
        // no motion if the user prefers it, a setting of the system
        const duration = animated && !reducedMotion() ? (transition === true ? 300 : (Number(transition) || 0)) : 0;
        next.facets.forEach(f => f.transition = duration);
        view = next;
        invalidate();
    };

    const changeSelected = () => {
        update(true);
        app.stateChanged();
    };
    const formChanged = () => {
        store.applyFormElements();
        changeSelected();
    };

    // the width of the plots, of the visualisation or of the definition,
    // beside legends the rest of it, `rootWidth` the one inside the padding
    // of the visualisation if it is known, e.g. of the ResizeObserver, it
    // is measured otherwise
    // the width of the chart of its own: of an export (`store.fixedWidth`,
    // see staticCopy of utils/export.js), else of the definition
    const ownWidth = () => store.fixedWidth || sizeOf(store, options().width, 'width', null);
    const plotsWidth = (rootWidth = undefined) => {
        const total = ownWidth() || (rootWidth ?? innerWidth(root));
        fullWidth = store.visWidth = total;
        if (!sidesOf(legendsAt()))
            return total;
        const besides = [...root.querySelectorAll(':scope > .vis-body-sides > .vis-legends')]
            .reduce((sum, e) => sum + e.getBoundingClientRect().width + 10, 0);
        return ownWidth() || !plots ? Math.max(0, total - besides) : innerWidth(plots);
    };
    // the width of the headers of the rows of a grid of facets: of the
    // longest one left of them, of a line of rotated text right of them,
    // measured in elements of their class, see facets.js
    const rowHeaderWidth = () => {
        const grid = store.def?.facets ? gridOf(store.def) : null;
        const m = grid?.rows ? store.def.mapping[grid.rows] : null;
        if (!m?.categoryProps)
            return 0;
        const { side, vertical } = rowHeadersOf(store.def.facets);
        const probe = root.appendChild(el('div', { class: `vis-facet-row-title vis-facet-row-title-${side} vis-facet-row-title-${vertical ? 'vertical' : 'horizontal'}`,
            style: 'position: absolute; visibility: hidden; height: auto; padding-top: 0; padding-bottom: 0; white-space: nowrap;' }));
        const names = m.keys.map(k => store.text(m.categoryProps[k].name));
        const size = !vertical
            ? Math.max(0, ...names.map(n => { setText(probe, n); return probe.getBoundingClientRect().width; }))
            : (setText(probe, names[0] ?? ''), probe.getBoundingClientRect().height + 4);
        probe.remove();
        // at most 40% of the width, the rest is the one of the facets
        return Math.ceil(Math.min(size, 0.4*width));
    };
    // an element of the texts of the chart, of their font, see measure
    const fontProbe = root.appendChild(el('span', { 'aria-hidden': 'true', style: 'position: absolute; visibility: hidden; width: 0; height: 0; overflow: hidden;' }));
    const measure = (rootWidth = undefined) => {
        width = plotsWidth(rootWidth);
        store.totalWidth = width;
        store.rowHeaderWidth = rowHeaderWidth();
        const styles = typeof getComputedStyle == 'function' ? getComputedStyle(root) : null;
        // the font of the texts of the chart (`.vis span`, see styles.css: the
        // variable of the page or Inter), not the one of the page around it
        store.fontFamily = typeof getComputedStyle == 'function' ? getComputedStyle(fontProbe).fontFamily || null : null;
        // the size of the texts of the marks without one of their own (they inherit it), see textBoxes of layout.js
        store.fontSize = parseFloat(styles?.fontSize) || null;
        // the margins of the styles of the page, a length in pixels or "auto"
        // (measured), e.g. --gen-vis-margin-left: 60px of a house style
        store.styleMargins = styles ? Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => {
            const value = styles.getPropertyValue(`--gen-vis-margin-${side}`).trim();
            return [side, value == 'auto' ? 'auto' : cssPixels(value, styles)];
        }).filter(([, v]) => v !== undefined)) : null;
    };
    // `rootWidth` is the one of the ResizeObserver, see plotsWidth
    const resized = (rootWidth = undefined) => {
        if (removed)
            return;
        const w = plotsWidth(rootWidth);
        if (!w || w == width)
            return;
        measure(rootWidth);
        update(false, true);
    };
    // the texts in a web font loaded after the first draw, e.g. Inter:
    // their sizes are measured again, e.g. of the headers of the rows of a
    // grid and the width beside legends
    // only of the fonts of the visualisation, not of other charts or of the
    // page (the families of its font, e.g. Inter of the 600 weight)
    const fontsLoaded = event => guard(() => {
        if (removed)
            return;
        const families = event?.fontfaces?.map(f => f.family.replace(/^["']|["']$/g, '').toLowerCase());
        if (families?.length && typeof getComputedStyle == 'function') {
            const used = getComputedStyle(root).fontFamily.toLowerCase();
            if (!families.some(f => used.includes(f)))
                return;
        }
        clearMeasures();
        measure();
        update(false, true);
    });

    const savePng = async () => {
        try {
            await files.save();
        } catch (error) {
            console.error(error);
        }
    };
    const copyPng = async () => {
        try {
            await files.copy();
            copied = true;
            invalidate();
            clearTimeout(copiedTimeout);
            copiedTimeout = setTimeout(() => {
                copied = false;
                invalidate();
            }, 1500);
        } catch (error) {
            console.error(error);
        }
    };

    // the legends of a position in their container, a new container has new legends
    const drawLegends = (key, container, names) => {
        // the entries may be new ones, see markLegends
        marked = null;
        if (legends[key]?.container !== container)
            legends[key] = { container, legends: createLegends(vis, container) };
        legends[key].legends.update(names, view);
    };

    // an element which is `wanted`, the one before or a new one, removed otherwise
    const keepIf = (node, wanted, make) => {
        if (wanted)
            return node ?? make();
        node?.remove();
        return null;
    };

    // the facets in their container, new ones in a new one
    const drawFacets = container => {
        if (facetsIn !== container) {
            facets?.destroy();
            facets = container && view ? createFacets(vis, container) : null;
            facetsIn = facets ? container : null;
            drawnView = null;
        }
        // the plots hidden by the table are drawn when they are shown again
        if (facets && drawnView !== view && !table) {
            drawnView = view;
            facets.update(view);
        }
    };

    // the rows of the view in the table, its module is loaded with the first one
    const drawTable = caption => {
        if (!tableModule) {
            tableLoad ??= lazy.table().then(m => {
                tableModule = m;
                invalidate();
            }, app.showError);
            return;
        }
        // a region of its own which keyboards can scroll
        patch(table, { class: 'vis-table-wrapper', tabindex: '0', role: 'region', 'aria-label': caption });
        if (tableView !== view || table.dataset.caption !== caption) {
            tableView = view;
            table.dataset.caption = caption;
            tableModule.drawTable(table, store, view.rows, { caption });
        }
    };

    const render = () => {
        const opts = options();
        // the class of the definition, a template of the globals, e.g. for
        // the styles of a page, the globals as data-global- attributes,
        // e.g. for the styles of a page of a form element, only the ones of
        // names and values of text
        const rootClass = opts.class ? store.text(opts.class) : null;
        const globalAttrs = Object.fromEntries(Object.entries(store.def.globals)
            .filter(([k, v]) => dataAttribute(k, 'global-') && ['string', 'number', 'boolean'].includes(typeof v))
            .map(([k, v]) => [dataAttribute(k, 'global-'), String(v)]));
        patch(root, { class: rootClass ? `vis ${rootClass}` : 'vis', 'data-vis': uid, ...globalAttrs, style: { '--gen-vis-font-family': opts.fontFamily } });
        const css = highlightStyle(store.def.plot, { scope: `.vis[data-vis="${uid}"]`, transition: Number(opts.highlight?.transition) || 0,
            warn: (plot, message) => warnOnce(store, `highlight:${plot.id}:${message}`, `${markPath(store.def, plot, true)}.${message}`) });
        if (style.textContent !== css)
            style.textContent = css;

        // the title and the subtitle with the values of the globals, e.g.
        // "Durchschnitt {base} = 100" of a form element
        const own = slots();
        const head = { title: store.text(opts.title), subtitle: store.text(opts.subtitle) };
        if (own.header) {
            headerTitle?.remove();
            headerSubtitle?.remove();
            headerTitle = headerSubtitle = null;
            headerSlot.draw(header, own.header, head);
        } else {
            headerSlot.clear();
            headerTitle ??= header.appendChild(el('div', { class: 'vis-title' }));
            headerSubtitle ??= header.appendChild(el('div', { class: 'vis-subtitle' }));
            setText(headerTitle, head.title);
            setText(headerSubtitle, head.subtitle);
        }

        formElements.forEach(f => f.update());

        // a text instead of the plots and the legends, e.g. of a narrow screen
        const text = messageOf();
        const at = legendsAt();
        sides = sidesOf(at);
        const shown = text === null;
        // the rows as a table instead of the plots, the height of the
        // plots at most, so the page does not move
        const tableOn = shown && Boolean(view) && app.table.shown();
        if (tableOn && !table) {
            const height = body?.getBoundingClientRect().height;
            table = el('div');
            table.style.maxHeight = height > 200 ? `${height}px` : '';
            tableView = null;
        } else if (!tableOn && table) {
            table.remove();
            table = tableView = null;
            // the width of plots beside legends, not measured while they were hidden
            if (sides)
                queueMicrotask(() => guard(resized));
        }
        // the legends beside the plots, the plots have the width of the rest
        const bodySides = shown && sides;
        const wantBody = shown && (sides || Boolean(view));
        if (body && (!wantBody || bodyKind !== bodySides)) {
            body.remove();
            body = plots = parts.left = parts.right = null;
        }
        if (wantBody && !body) {
            bodyKind = bodySides;
            body = el('div', { class: bodySides ? 'vis-body vis-body-sides' : 'vis-body' });
            if (bodySides)
                plots = body.appendChild(el('div', { class: 'vis-plots' }));
        }
        message = keepIf(message, !shown, () => el('div', { class: 'vis-message' }));
        if (message)
            setText(message, text);
        parts.top = keepIf(parts.top, shown, () => el('div', { class: 'vis-legends' }));
        parts.bottom = keepIf(parts.bottom, shown && at.bottom.length > 0, () => el('div', { class: 'vis-legends vis-legends-bottom' }));
        if (body)
            body.hidden = tableOn;
        [message, parts.top, body, table, parts.bottom].filter(Boolean).reduceRight((after, n) => place(root, n, after), footer);
        if (table)
            drawTable(head.title || head.subtitle || texts().chart);
        if (parts.top)
            drawLegends('top', parts.top, at.top);
        if (bodySides) {
            parts.left = keepIf(parts.left, at.left.length > 0, () => el('div', { class: 'vis-legends vis-legends-left' }));
            parts.right = keepIf(parts.right, at.right.length > 0, () => el('div', { class: 'vis-legends vis-legends-right' }));
            if (parts.left)
                drawLegends('left', place(body, parts.left, plots), at.left);
            if (parts.right)
                drawLegends('right', place(body, parts.right, null), at.right);
        }
        if (parts.bottom)
            drawLegends('bottom', parts.bottom, at.bottom);
        drawFacets(bodySides ? plots : body);

        // the footer, html of the definition, e.g. a link of the source,
        // the values of the globals are text, cleaned (see parsed of
        // comp/html.js), also the one of the slot
        const footerHtml = store.html(opts.footer);
        if (own.footer) {
            footerSpan?.remove();
            footerSpan = null;
            footerSlot.draw(footerContent, own.footer, { footer: cleanHtml(footerHtml) });
        } else {
            footerSlot.clear();
            footerSpan ??= footerContent.appendChild(el('span'));
            setHtml(footerSpan, footerHtml);
        }
        drawButtons(own);
        app.drawn();
    };

    // the buttons of the page (the slot buttons), table, copy, csv, svg and
    // download, at the right end of the plots
    const drawButtons = own => {
        const { copy, csv, svg, download, table: tableProp } = app.props();
        if (!(own.buttons || (copy && clipboard) || csv || svg || download || tableProp)) {
            buttons?.remove();
            buttonsSlot.clear();
            buttons = copyButton = csvButton = svgButton = downloadButton = tableButton = null;
            return;
        }
        buttons ??= footer.appendChild(el('div', { class: 'vis-buttons' }));
        patch(buttons, { class: 'vis-buttons', style: { marginRight: `${view?.facets[0]?.margins.right ?? 0}px` } });
        const t = texts();
        const tableShown = app.table.shown();
        tableButton = keepIf(tableButton, tableProp, () => button('vis-table', () => toggleTable()));
        copyButton = keepIf(copyButton, copy && clipboard, () => button('vis-copy', () => copyPng()));
        csvButton = keepIf(csvButton, csv, () => button('vis-csv', () => files.csv().catch(app.showError)));
        svgButton = keepIf(svgButton, svg, () => button('vis-download-svg', () => files.svg().catch(console.error)));
        downloadButton = keepIf(downloadButton, download, () => button('vis-download', () => savePng()));
        // a toggle of a constant name, pressed while the table is shown
        if (tableButton) {
            patch(tableButton, { type: 'button', class: 'vis-button vis-table', title: tableShown ? t.showChart : t.table, 'aria-label': t.table, 'aria-pressed': String(tableShown) });
            patch(tableButton.querySelector('path'), { d: icons.table });
        }
        if (copyButton) {
            patch(copyButton, { type: 'button', class: 'vis-button vis-copy', title: copied ? t.copied : t.copy, 'aria-label': copied ? t.copied : t.copy });
            patch(copyButton.querySelector('path'), { d: icons[copied ? 'copied' : 'copy'] });
        }
        if (csvButton) {
            patch(csvButton, { type: 'button', class: 'vis-button vis-csv', title: t.csv, 'aria-label': t.csv });
            patch(csvButton.querySelector('path'), { d: icons.csv });
        }
        if (svgButton) {
            patch(svgButton, { type: 'button', class: 'vis-button vis-download-svg', title: t.svg, 'aria-label': t.svg });
            patch(svgButton.querySelector('path'), { d: icons.svg });
        }
        if (downloadButton) {
            patch(downloadButton, { type: 'button', class: 'vis-button vis-download', title: t.download, 'aria-label': t.download });
            patch(downloadButton.querySelector('path'), { d: icons.download });
        }
        const order = [tableButton, copyButton, csvButton, svgButton, downloadButton].filter(Boolean);
        order.reduceRight((after, b) => place(buttons, b, after), null);
        if (own.buttons)
            buttonsSlot.draw(buttons, own.buttons, { save: files.save, copy: files.copy, csv: files.csv, svg: files.svg, canCopy: clipboard, table: toggleTable, tableShown }, order[0] ?? null);
        else
            buttonsSlot.clear();
    };

    // the changes are drawn together, once, in a microtask, e.g. of
    // several changes of the state of one event
    const invalidate = () => {
        if (queued || removed)
            return;
        queued = true;
        queueMicrotask(flush);
    };
    const flush = () => {
        if (!queued || removed)
            return;
        queued = false;
        guard(() => {
            if (stateSet) {
                stateSet = false;
                update(true);
                queued = false;
            }
            const before = sides;
            render();
            // legends beside the plots or not anymore, e.g. of a new width,
            // the plots have another width
            if (before !== null && before !== sides)
                queueMicrotask(() => guard(resized));
        });
    };

    // the state was set from outside, see setState of store.js
    const stateListener = () => {
        stateSet = true;
        invalidate();
    };

    // the elements before the first measure, as the ones of Vue: without
    // the view, the form elements and the width
    render();

    return {
        el: root,
        // once it is in the page: the form elements, the width, the view
        mounted() {
            // hidden form elements have no element, their globals are set by the page
            globals = store.def.globals;
            formElements = store.def.formElements.filter(e => e.type != 'hidden')
                .map(e => createControl(vis, e, globals, formChanged));
            form.append(...formElements.map(f => f.el));
            measure();
            update();
            store.listeners.add(stateListener);
            // without a fixed width the visualisation fills its container
            if (!ownWidth() && typeof ResizeObserver == 'function') {
                // the width of its content box (the one of innerWidth) without a measure
                resizeObserver = new ResizeObserver(entries => {
                    const rootWidth = entries.at(-1)?.contentRect.width;
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => guard(() => resized(rootWidth)), 100);
                });
                resizeObserver.observe(root);
            }
            document.fonts?.addEventListener?.('loadingdone', fontsLoaded);
            const before = sides;
            queued = false;
            render();
            // the plots beside legends have the width of the rest, e.g. after the
            // first draw of a legend of colors
            if (sides || (before !== null && before !== sides))
                queueMicrotask(() => guard(resized));
        },
        // the props of the buttons or the slots changed
        invalidate,
        highlight,
        destroy() {
            removed = true;
            store.listeners.delete(stateListener);
            resizeObserver?.disconnect();
            document.fonts?.removeEventListener?.('loadingdone', fontsLoaded);
            clearTimeout(resizeTimeout);
            clearTimeout(copiedTimeout);
            facets?.destroy();
            formElements.forEach(f => f.destroy());
            headerSlot.clear();
            footerSlot.clear();
            buttonsSlot.clear();
        },
    };
};
