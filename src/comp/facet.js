export { createFacet };

import { drawLayer, highlighter, reducedMotion, withMotion } from "@/utils/draw";
import { drawAxis } from "@/utils/axis";
import { create, interruptAll, setAttr } from "@/utils/dom";
import { plotTypes } from "@/plots";
import { inFacet, plotGroups, plotRows } from "@/layout";
import { el, patch, place, setText } from "@/comp/html";
import { createFacetHover } from "@/comp/facet-hover";

// the elements in an element are removed
const removeElements = node => [...node.children].forEach(c => c.remove());

// the descriptions of the keys of the facets of a page have their own ids
let count = 0;

/**
 * A facet of the view, its rows, sizes and scales, see layout.js, its key
 * is the one of its category, e.g. for annotations. A new view, e.g. of a
 * toggle of a legend, is drawn into the elements of the one before
 * (`update(facet)`). `vis` is the store, the slots and `emit` of the hover
 * and select events, see app.js. `highlight(entry)` highlights the elements
 * of the categories of a row, `destroy()` ends its animations and its
 * listeners.
 */
const createFacet = (vis, initial) => {
    const { store, slots, emit } = vis;
    // the elements which are kept from one draw to the next by their key,
    // e.g. the groups of the plots, see keep
    const kept = new Map();
    const uid = `gen-vis-facet-${count++}`;
    let facet = initial;
    let used = null;
    let cursor = null;
    let ctx = null;
    let highlight = null;
    // the origin of the plots and axes in the inner area, e.g. its center
    const origin = () => store.coord.origin?.(facet.innerWidth, facet.innerHeight) ?? [0, 0];
    const innerTransform = () => { const o = origin(); return `translate(${facet.margins.left + o[0]} ${facet.margins.top + o[1]})` };
    // the name of the chart for screen readers, the title and the facet,
    // without a title the subtitle or the localized name of a chart
    const label = () => {
        const { title, subtitle } = store.def.options;
        const name = [title || subtitle, facet.name].filter(Boolean).map(t => store.text(t)).join(': ');
        return name || store.locale.texts.chart;
    };
    // the subtitle of a chart with a title describes it
    const description = () => {
        const { title, subtitle } = store.def.options;
        return title && subtitle ? store.text(subtitle) : undefined;
    };

    // with a hover the facet is in the order of the tab key, the arrow keys move the
    // hover, it is an application of screen readers, so they pass the keys to it
    const root = el('div', { style: `width: ${facet.width}px;`, class: 'vis-facet' });
    const svg = root.appendChild(create('svg'));
    const inner = svg.appendChild(create('g'));
    const marker = inner.appendChild(create('g'));
    marker.appendChild(create('line'));
    // the hover is read by screen readers when the keyboard moves it, not on every move of the mouse
    const live = root.appendChild(el('div'));
    let subtitleSpan = null, keysSpan = null;
    // the hover of the pointer and of the keyboard, see comp/facet-hover.js
    const hover = createFacetHover({ store, slots, emit, marker, live, highlight: entry => highlightEntry(entry), origin, facetOf: () => facet });
    svg.addEventListener('keydown', e => vis.guard(() => hover.key(e)));
    svg.addEventListener('blur', () => vis.guard(() => hover.hide()));

    // the attributes of the elements of the facet, of its sizes, the hover and the keyboard
    const render = () => {
        const o = origin();
        const keyboard = hover.keyboard;
        const text = description();
        patch(root, { style: `width: ${facet.width}px;`, class: 'vis-facet' });
        patch(svg, {
            width: facet.width, height: facet.height, class: 'vis-svg', role: keyboard ? 'application' : 'img', 'aria-label': label(),
            'aria-roledescription': keyboard ? store.locale.texts.chart : undefined,
            'aria-describedby': [text && `${uid}-subtitle`, keyboard && `${uid}-keys`].filter(Boolean).join(' ') || undefined,
            tabindex: keyboard ? 0 : undefined,
        });
        patch(inner, { transform: innerTransform() });
        if (text) {
            subtitleSpan ??= el('span', { id: `${uid}-subtitle`, hidden: true });
            setText(place(root, subtitleSpan, keysSpan ?? live), text);
        } else {
            subtitleSpan?.remove();
            subtitleSpan = null;
        }
        if (keyboard) {
            keysSpan ??= el('span', { id: `${uid}-keys`, hidden: true });
            setText(place(root, keysSpan, live), store.locale.texts.keys);
        } else {
            keysSpan?.remove();
            keysSpan = null;
        }
        hover.render(o);
    };

    // the element of `key` of the draw before or a new one, `make()`
    // returns a new one, it is placed after the element drawn
    // before (the cursor), so the elements are in the order of the draw,
    // an element in its place is not moved, as a move costs the browser
    // the style of all its elements, e.g. of the circles of a plot
    const keep = (key, make) => {
        let node = kept.get(key);
        if (!node)
            kept.set(key, node = make());
        if (cursor.nextSibling !== node)
            inner.insertBefore(node, cursor.nextSibling);
        cursor = node;
        used.add(key);
        return node;
    };

    // the parts of the axes of the coordinate system (see `axes` of
    // coords/index.js), an element per part, kept from one draw to the next
    // by its key, after the elements drawn before: an axis (see drawAxis),
    // or an element with the attributes `attrs`, the `text` and the
    // elements of a `layer` (see drawLayer), of a `fresh` part drawn anew
    const drawParts = parts => {
        (parts ?? []).forEach(part => {
            const node = keep(part.key, () => create(part.element ?? "g"));
            if (part.axis)
                return drawAxis(node, part.axis);
            Object.entries(part.attrs ?? {}).forEach(([k, v]) => setAttr(node, k, v));
            if (part.text !== undefined)
                node.textContent = part.text ?? '';
            if (part.layer) {
                // the elements of the draw before, not the text
                if (part.fresh)
                    removeElements(node);
                drawLayer(node, part.layer);
            }
        });
    };

    // the key of the group of a plot, its place in the definition (the ids
    // of two plots can be the same, e.g. of a parent), its id and type,
    // e.g. a plot of a patch is not drawn into the elements of another one
    const plotKey = plot => `plot ${store.def.plot.indexOf(plot)} ${plot.id} ${plot.type}`;

    // a group per plot, kept from one draw to the next, the layer of the
    // marks of its type (see plots/index.js) is drawn into it, of the
    // types with `update` into the elements of the draw before, the
    // elements of the others are removed
    const plot = plots => {
        plots.forEach(plot => {
            if (!Object.hasOwn(plotTypes, plot.type))
                throw new Error(`Unknown plot type '${plot.type}'`);
            const type = plotTypes[plot.type];
            // the types of a coordinate system, e.g. no bars in a map
            const coord = store.def.options.coord ?? 'cartesian';
            if (type.coords && !type.coords.includes(coord))
                throw new Error(`The plot type '${plot.type}' is not available in the coordinate system '${coord}'`);
            const parent = keep(plotKey(plot), () => {
                const g = create("g");
                // an id with spaces is several classes, e.g. "1st line"
                g.classList.add("vis-plot", ...String(plot.id).trim().split(/^|\s+/));
                g.setAttribute("data-plot", plot.id);
                if (plot.layer)
                    g.classList.add(`vis-${plot.layer}`);
                return g;
            });
            if (!type.update)
                removeElements(parent);
            const groups = ctx.groupsOf(plot.id);
            drawLayer(parent, type.marks(groups, plot, ctx));
        });
    };

    // the highlight of the elements of the categories of a row, e.g. of
    // an entry of a legend, null ends it, see utils/draw.js, without one
    // the one of the page, see the prop highlight of app.js
    const highlightEntry = dataEntry => {
        const entry = dataEntry ?? store.highlighted ?? null;
        highlight?.(entry);
        vis.markLegends?.(entry);
    };

    const draw = () => {
        // the elements are the ones without a highlight, also the one of
        // the page, at once, a transition would replace the new values
        highlight?.(null, true);
        // the position of the plots of the new facet already, e.g. of the
        // hover of the draw before at its pointer in the center of a polar
        // plot of a new width
        inner.setAttribute('transform', innerTransform());
        // the elements which are not kept are drawn anew, e.g. the axes
        const keptNodes = new Set(kept.values());
        [...inner.children].filter(c => c !== marker && !keptNodes.has(c)).forEach(c => c.remove());
        used = new Set();
        cursor = marker;

        // the context of the plot types and the coordinate system, see
        // plots/index.js, the scales are only replaced with the facet
        const { key, rows, scales, axis, stackOf, isStacked, stackOrder, scope, dims, innerWidth, innerHeight, margins, outer, cell, sharing } = facet;
        ctx = {
            store,
            // the id of the facet on the page, e.g. of the ids of elements
            uid,
            // the element of the plots and axes, the origin is the one of the coordinate system
            inner,
            key,
            rows,
            scales,
            axis,
            stackOf,
            isStacked,
            stackOrder,
            scope,
            dims,
            innerWidth,
            innerHeight,
            margins,
            // the edges of the grid of facets the facet is at, its cell of a
            // grid and the sharing of the scales, see layout.js
            outer,
            cell,
            sharing,
            // the groups of a plot of the facet by its id, of this draw, e.g.
            // the bands of an area of labels inside them (plots/inside.js)
            groupsOf: id => {
                if (!drawnGroups.has(id)) {
                    const p = store.def.plot.find(q => q.id === id);
                    drawnGroups.set(id, p ? plotGroups(p, plotRows(store, p, facet), ctx) : []);
                }
                return drawnGroups.get(id);
            },
        };
        const drawnGroups = new Map();

        store.coord.prepare?.(ctx);
        // the plots below the axes and grid lines, e.g. the bands of annotations,
        // the ones above the other plots, e.g. labels, the elements of the
        // draw before move with the transition of the view, see utils/draw.js
        const plots = store.def.plot.filter(p => inFacet(store.def, p, facet));
        withMotion(facet.transition ?? 0, () => {
            plot(plots.filter(p => p.layer == 'below'));
            drawParts(store.coord.axes(ctx));
            plot(plots.filter(p => p.layer != 'below' && p.layer != 'above'));
            plot(plots.filter(p => p.layer == 'above'));
        });
        // the labels of the annotations are above the plots, also the ones below them
        const labels = inner.querySelectorAll(".vis-annotation-label");
        if (labels.length > 0) {
            const g = inner.appendChild(create("g"));
            g.setAttribute("class", "vis-annotation-labels");
            g.append(...labels);
        }
        store.coord.raise?.(ctx);

        // the elements of the draw before which are not drawn again
        kept.forEach((node, k) => {
            if (!used.has(k)) {
                node.remove();
                kept.delete(k);
            }
        });
        // the highlight moves in the milliseconds of `options.highlight.transition`,
        // not if the user prefers less motion
        const duration = reducedMotion() ? 0 : Number(store.def.options.highlight?.transition) || 0;
        highlight = highlighter(store.def.plot, plot => kept.get(plotKey(plot)), duration);
        hover.init(ctx);
        // the highlight of the page
        if (store.highlighted)
            highlightEntry(null);
    };

    // a touch keeps the hover until the next touch outside of the facet
    const hideOnPointerOutside = e => {
        if (hover.visible && !svg.contains(e.target))
            hover.hide();
    };

    // the elements before the first draw, the ones of a facet without a
    // hover, the attributes added later are after the others
    render();

    return {
        el: root,
        uid,
        // the first draw, once the facet is in the page, e.g. for the sizes of texts
        mounted() {
            document.addEventListener("pointerdown", hideOnPointerOutside);
            draw();
            render();
        },
        // a new facet of the view, e.g. of a toggle of a legend, drawn into
        // the elements of the one before
        update(next) {
            facet = next;
            draw();
            render();
        },
        highlight: highlightEntry,
        // the animations of the elements end with the facet, so their frames do
        // not set the attributes of removed elements: the ones of the plots and
        // of the axes (see utils/dom.js)
        destroy() {
            interruptAll(inner);
            document.removeEventListener("pointerdown", hideOnPointerOutside);
        },
    };
};
