export { createFacet };

import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { dataAttribute, drawLayer, highlighter, reducedMotion, withMotion } from "@/utils/draw";
import { drawAxis } from "@/utils/axis";
import { create, interruptAll, pointer, setAttr } from "@/utils/dom";
import { plotTypes } from "@/plots";
import { plotGroups, plotRows } from "@/layout";
import { filter, rowFilter } from "@/utils/data";
import { orderOf, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp } from "@/utils/hover";
import { el, patch, place, setText } from "@/comp/html";
import { createHover } from "@/comp/hover";

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
    // the hover shown and its position, see hoverInit
    const hover = { visible: false, x: 0, y: 0 };
    // the facet has a hover, it can be moved by the keyboard
    let keyboard = false;
    // the hover was moved by the keyboard, so screen readers read it
    let announced = false;
    // the functions of the hover of the draw, see hoverInit
    let hide = null, step = null, selectShown = null;
    let lastEvent = null, lastKey = null, pointerAt = null;
    let box = null;

    // the options of the hover, see docs/usage.md "Events and slots"
    const hoverOptions = () => store.def.options.hover ?? {};
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

    // the keys of the hover: the arrows to the left and the right move it
    // to the position before and after, the ones up and down to the row
    // above and below, home and end to the first and the last position,
    // enter and space select it, as a click, escape hides it
    const key = e => {
        const s = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up', Home: 'first', End: 'last' }[e.key];
        if (e.key == 'Escape') {
            hide?.();
        } else if ((e.key == 'Enter' || e.key == ' ') && selectShown) {
            e.preventDefault();
            selectShown();
        } else if (s !== undefined && step) {
            e.preventDefault();
            step(s);
        }
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
    svg.addEventListener('keydown', e => vis.guard(() => key(e)));
    svg.addEventListener('blur', () => vis.guard(() => hide?.()));

    // the attributes of the elements of the facet, of its sizes, the hover and the keyboard
    const render = () => {
        const o = origin();
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
        renderHover(o);
    };

    // the marker of the position and the box of the hover beside it, also
    // of the hover slot
    const renderHover = (o = origin()) => {
        patch(marker, { visibility: hover.visible && hoverOptions().marker !== false ? 'visible' : 'hidden', class: 'vis-hover-marker' });
        patch(live, {
            'aria-live': announced ? 'polite' : 'off',
            style: `transform: translate(${facet.margins.left + o[0] + hover.x}px, ${facet.margins.top + o[1] + hover.y}px); position: absolute; top: 0; left: 0;`,
        });
        if (hover.visible && hoverOptions().box !== false) {
            if (!box) {
                box = createHover(store, slots);
                box.show(hover);
                live.appendChild(box.el);
            } else
                box.show(hover);
        } else if (box) {
            box.el.remove();
            box = null;
        }
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
            const rows = plotRows(store, plot, facet);
            drawLayer(parent, type.marks(plotGroups(plot, rows, ctx), plot, ctx));
        });
    };

    // the highlight of the elements of the categories of a row, e.g. of
    // an entry of a legend, null ends it, see utils/draw.js, without one
    // the one of the page, see the prop highlight of app.js
    const highlightEntry = dataEntry => {
        highlight?.(dataEntry ?? store.highlighted ?? null);
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
        const { key, rows, scales, axis, stackOf, isStacked, stackOrder, scope, dims, innerWidth, innerHeight, margins } = facet;
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
        };

        store.coord.prepare?.(ctx);
        // the plots below the axes and grid lines, e.g. the bands of annotations,
        // the ones above the other plots, e.g. labels, the elements of the
        // draw before move with the transition of the view, see utils/draw.js
        const plots = store.def.plot.filter(p => p.facet === undefined
            || [p.facet].flat().map(String).includes(String(key)));
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
        hoverInit();
        // the highlight of the page
        if (store.highlighted)
            highlightEntry(null);
    };

    const hoverInit = () => {
        const coord = store.coord;
        hide = null;
        step = null;
        selectShown = null;

        // the hover needs the mappings of the positions and of the values,
        // of a coordinate system with `values` of the hover only the ones
        // of the values, e.g. of a pie without rings, all rows are one position
        const names = ctx.axis;
        keyboard = Boolean(names.v && (names.h || coord.hover.values));
        if (!keyboard) {
            hover.visible = false;
            return;
        }

        const format = { h: names.h ? store.valueFormat(names.h, ctx.scales[names.h]) : () => '', v: store.valueFormat(names.v, ctx.scales[names.v]) };
        const v = names.v;
        // the start and the end of a stacked value
        const stackOf = ctx.stackOf;
        // the place of a row in the hover, see utils/hover.js
        const stacks = { v, stackOf, isStacked: ctx.isStacked, stackOrder: ctx.stackOrder };

        // categorical mappings, and other values with a hover, e.g. of a second vertical axis
        const categories = store.mappingNamesWithKey('hover')
            .filter(n => n != names.h && n != v && store.mapping(n).props);
        const others = store.mappingNamesWithKey('hover')
            .filter(n => n != names.h && n != v && !store.mapping(n).props && ['numeric', 'date'].includes(store.mapping(n).type));
        const formats = Object.fromEntries(others.map(n => [n, store.valueFormat(n, ctx.scales[n])]));
        // the mappings whose categories style the rows (`hover.row.props`),
        // and the ones of categories as attributes of the rows, e.g. data-type="load"
        const styled = categories.filter(n => store.mapping(n).hover.row?.props);
        const keyed = Object.keys(store.def.mapping).filter(n => store.mapping(n).props && dataAttribute(n));

        const line = marker.querySelector("line");
        // the marker without a line, e.g. of a hidden hover or of a point
        const noLine = () => {
            line.removeAttribute("x1");
            line.removeAttribute("x2");
            line.removeAttribute("y1");
            line.removeAttribute("y2");
        };
        const scope = store.scope;

        // the rows of the hover, with a value and of its `filter`, by their
        // key, e.g. of the horizontal axis, compared as strings
        const options = hoverOptions();
        const hoverRows = filter(ctx.rows.filter(e => e[v] !== null), rowFilter(options.filter, store.def.mapping, ctx.scope, 'options.hover.filter'));
        const rowsByKey = d3.group(hoverRows, e => String(e[names.h]));
        // the nearest key is one with rows, e.g. not one of null values, of
        // the coordinate systems with the `nearest` of the context, unless
        // the hover of keys without rows is shown (`"empty": true`)
        const located = options.empty ? ctx
            : { ...ctx, nearest: nearestWithRows(ctx.scales[names.h], [...rowsByKey.values()].map(rows => rows[0][names.h])) };
        let last = null;
        // the rows of the hover shown, e.g. for a select by the keyboard
        let current = null;

        // a hidden hover has no position, as the one of a new facet
        hide = () => {
            if (hover.visible)
                emit('hover', null);
            last = null;
            current = null;
            lastEvent = null;
            lastKey = null;
            Object.assign(hover, { visible: false, x: 0, y: 0 });
            noLine();
            highlightEntry(null);
            renderHover();
        };

        // the hover of the nearest point, e.g. of a scatter plot, within
        // `radius` pixels, of the coordinate systems with points of rows,
        // the points of the rows are placed at the first use
        const pointMode = options.mode == 'point' && coord.hover.point;
        let points = null;
        let nearestPoint = null;
        const preparePoints = () => {
            points ??= hoverRows.filter(row => row[names.h] !== null)
                .map(row => [...coord.hover.point(ctx, row, names), row]);
            nearestPoint ??= pointFinder(points, options.radius ?? 30);
        };

        // the rows at the pointer and the nearest one, stacked: the segment
        // under the pointer, outside of the stack the closest one, null
        // without a key, the rows are not formatted yet
        const at = e => {
            if (pointMode) {
                preparePoints();
                const point = nearestPoint(pointer(e, ctx.inner));
                return point && { key: point[2][names.h], rows: [point[2]], nearest: point[2], point };
            }
            const position = coord.hover.locate(located, pointer(e, ctx.inner), names, e);
            if (!position)
                return null;
            const { key, value } = position;
            const rows = rowsByKey.get(String(key)) ?? [];
            return { key, value, rows, nearest: nearestRow(rows, value, v, stackOf) };
        };

        const titleOf = key => coord.hover.title ? coord.hover.title(ctx, key, names) : format.h(key);

        // the rows of the table from the top to the bottom, stacks as they
        // are drawn, the cells are a cell per hover prop of the categories,
        // e.g. their name, and the value
        const entriesOf = (rows, nearest) => rows.map(row => {
            const cells = [];
            const entries = Object.fromEntries(categories.map(n => {
                const values = evaluate(store.mapping(n).hover.props, { ...scope, ...store.prop(n, row[n]) });
                const texts = Object.fromEntries(Object.entries(values).map(([k, t]) => [k, store.text(t)]));
                Object.entries(texts).filter(([, t]) => t !== null && t !== undefined)
                    .forEach(([k, t]) => cells.push({ mapping: n, prop: k == 'name' ? null : k, text: t }));
                return [n, texts];
            }));
            entries[v] = { value: row[v], name: format.v(row[v]) };
            cells.push({ mapping: v, value: true, text: entries[v].name });
            others.forEach(n => {
                entries[n] = { value: row[n], name: row[n] === null ? '' : formats[n](row[n]) };
                cells.push({ mapping: n, value: true, text: entries[n].name });
            });
            // the styles of the row, of the props of its categories, the
            // later mappings override the ones before, see hover.js
            const style = {};
            styled.forEach(n => Object.entries(evaluate(store.mapping(n).hover.row.props, { ...scope, ...store.prop(n, row[n]) }))
                .filter(([, s]) => s !== null && s !== undefined && s !== '')
                .forEach(([k, s]) => style[k] = String(s)));
            const attrs = Object.fromEntries(keyed.filter(n => row[n] !== null && row[n] !== undefined)
                .map(n => [dataAttribute(n), String(row[n])]));
            return { entries, cells, data: row, nearest: row === nearest, order: orderOf(row, rows, stacks), style, attrs };
        });

        // the rows of the events and the slot, copies of the values of the mappings
        const plain = row => ({ ...row });
        const payload = ({ key, rows, nearest }) => ({
            key,
            title: titleOf(key),
            rows: rows.map(plain),
            nearest: nearest ? plain(nearest) : null,
        });

        // the hover of the rows of a position and the nearest one
        const show = found => {
            const { key, value, rows, nearest } = found;
            // no hover without rows, e.g. of a region without a value,
            // unless `"empty": true`, e.g. the name of every region
            if (rows.length == 0 && !options.empty) {
                hide();
                return;
            }
            hover.visible = true;
            current = found;

            // the same key and row as before, e.g. a move within a step
            // of the axis, nothing is formatted or drawn, a hover at the
            // pointer moves with it
            if (last && last.key === key && last.nearest === nearest) {
                if (options.position == 'pointer' && pointerAt)
                    Object.assign(hover, placed(last.position, options, pointerAt));
                renderHover();
                return;
            }

            // there is no entry e.g. if all categories are hidden, without
            // a value the elements of the key are highlighted, e.g. a region
            highlightEntry(nearest ?? (value === undefined ? {[names.h]: key} : null));

            const p = payload(found);
            // a point has no line, the hover is beside it
            const position = found.point
                ? (noLine(), pointPosition(found.point, ctx.innerWidth))
                : coord.hover.marker(ctx, key, names, line, nearest);
            last = { key, nearest, position };
            Object.assign(hover, placed(position, options, pointerAt), {
                data: entriesOf(rows, nearest),
                title: p.title,
                payload: p,
            });
            emit('hover', p);
            renderHover();
        };

        // the hover of the pointer, also the one of the draw before at its
        // position, e.g. after a toggle by the keyboard
        const move = e => {
            // nothing under the pointer, e.g. the sea of a map, no empty or old hover
            const found = at(e);
            if (!found) {
                hide();
                return;
            }
            lastEvent = e;
            lastKey = null;
            // the hover of the pointer is not read by screen readers
            announced = false;
            pointerAt = pointer(e, ctx.inner);
            show(found);
        };

        // the positions with rows in their order, e.g. from the left to
        // the right, the ones of a map by their titles, and of the points
        // their order from the left, the rows of a position as in the table
        let positions = null;
        const positionsOf = () => {
            if (pointMode) {
                preparePoints();
                return [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
                    .map(point => ({ key: point[2][names.h], rows: [point[2]], point }));
            }
            const all = [...rowsByKey.values()].map(rows => ({ key: rows[0][names.h], rows: sortedByOrder(rows, row => orderOf(row, rows, stacks)) }));
            return positionsInOrder(all, ctx.scales[names.h], titleOf);
        };
        // the position of an index, of a key before, e.g. of the draw before
        // with other positions, at its index if it has none anymore
        const showKey = (index, row, before) => {
            positions ??= positionsOf();
            if (positions.length == 0) {
                hide();
                return;
            }
            const same = before === undefined ? -1 : positions.findIndex(p => String(p.key) === String(before));
            const i = same >= 0 ? same : clamp(index, positions.length);
            const { key, rows, point } = positions[i];
            const r = clamp(row, rows.length);
            lastEvent = null;
            pointerAt = null;
            // the hover of the keyboard is read by screen readers
            announced = true;
            lastKey = { index: i, row: r, key };
            show({ key, rows, nearest: rows[r], point });
        };
        selectShown = () => {
            if (current)
                emit('select', payload(current));
        };
        step = s => {
            const current = lastKey;
            if (s == 'first' || s == 'last')
                return showKey(s == 'first' ? 0 : Infinity, 0);
            if (s == 'up' || s == 'down')
                return current ? showKey(current.index, current.row + (s == 'down' ? 1 : -1)) : showKey(0, 0);
            showKey(current ? current.index + s : (s > 0 ? 0 : Infinity), 0);
        };

        // mouse, touch and pen, vertical swipes still scroll the page
        // the area of the events, the plot area or with `"area": "facet"` also
        // the margins, e.g. the labels of the rows of horizontal bars
        const area = coord.hover.area(ctx, ctx.inner);
        if (options.area == 'facet' && area.tagName == 'rect') {
            const o = origin();
            area.setAttribute("x", -(facet.margins.left + o[0]));
            area.setAttribute("y", -(facet.margins.top + o[1]));
            area.setAttribute("width", facet.width);
            area.setAttribute("height", facet.height);
        }
        // the full text of a cut text under the pointer (see fitText of
        // utils/draw.js) is the title of the area, it is above the texts,
        // so the browser shows it as their tooltip
        let tooltip = null;
        // the texts are cut in the draw, before the hover, so they are searched once
        const anyCut = Boolean(inner.querySelector('text > title'));
        const cutText = e => {
            const text = e.pointerType == 'mouse' && anyCut
                ? document.elementsFromPoint?.(e.clientX, e.clientY)
                    .find(el => el.tagName == 'text' && inner.contains(el) && el.querySelector(':scope > title'))
                : null;
            const full = text ? text.querySelector(':scope > title').textContent : '';
            if (full || tooltip)
                tooltip ??= area.appendChild(create("title"));
            if (tooltip && tooltip.textContent !== full)
                tooltip.textContent = full;
        };
        area.setAttribute("class", "vis-events");
        area.setAttribute("opacity", 0);
        area.style.setProperty("touch-action", "pan-y");
        area.addEventListener("pointerdown", move);
        area.addEventListener("pointermove", move);
        area.addEventListener("pointermove", cutText);
        // a click or a tap, e.g. on a region of a map
        area.addEventListener("click", e => {
            const found = at(e);
            if (found)
                emit('select', payload(found));
        });
        area.addEventListener("pointerleave", e => {
            if (e.pointerType != "touch")
                hide();
        });
        // the browser scrolls the page instead
        area.addEventListener("pointercancel", hide);

        // the hover of the draw before with the rows of this one
        if (hover.visible && lastEvent)
            move(lastEvent);
        else if (hover.visible && lastKey)
            showKey(lastKey.index, lastKey.row, lastKey.key);
        else
            hover.visible = false;
    };

    // a touch keeps the hover until the next touch outside of the facet
    const hideOnPointerOutside = e => {
        if (hover.visible && !svg.contains(e.target))
            hide?.();
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
