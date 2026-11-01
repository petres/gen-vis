<template>
    <div :style="`width: ${facet.width}px;`" class="vis-facet">
        <!-- with a hover the facet is in the order of the tab key, the arrow keys move the
             hover, it is an application of screen readers, so they pass the keys to it -->
        <svg ref="svg" :width="facet.width" :height="facet.height" class="vis-svg" :role="keyboard ? 'application' : 'img'" :aria-label="label"
            :aria-roledescription="keyboard ? store.locale.texts.chart : undefined" :aria-describedby="describedBy"
            :tabindex="keyboard ? 0 : undefined" @keydown="key" @blur="hide?.()">
            <g ref="inner" :transform="innerTransform">
                <g :visibility="hover.visible && hoverOptions.marker !== false ? 'visible' : 'hidden'" class="vis-hover-marker" ref="hoverMarker">
                    <line/>
                </g>
            </g>
        </svg>
        <span v-if="description" :id="`${uid}-subtitle`" hidden>{{ description }}</span>
        <span v-if="keyboard" :id="`${uid}-keys`" hidden>{{ store.locale.texts.keys }}</span>
        <!-- the hover is read by screen readers when the keyboard moves it, not on every move of the mouse -->
        <div :aria-live="announced ? 'polite' : 'off'" :style="`transform: translate(${facet.margins.left + origin[0] + hover.x}px, ${facet.margins.top + origin[1] + hover.y}px); position: absolute; top: 0; left: 0;`">
            <hover v-if="hover.visible && hoverOptions.box !== false" :title="hover.title" :data="hover.data" :side="hover.side" :payload="hover.payload"/>
        </div>
    </div>
</template>


<script>
import { toRaw } from 'vue';
import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { dataAttribute, drawLayer, highlighter, reducedMotion, withMotion } from "@/utils/draw";
import { drawAxis } from "@/utils/axis";
import { plotTypes } from "@/plots";
import { plotGroups, plotRows } from "@/layout";
import { filter, rowFilter } from "@/utils/data";
import { orderOf, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp } from "@/utils/hover";

import Hover from '@/comp/Hover.vue';

// the descriptions of the keys of the facets of a page have their own ids
let count = 0;

export default {
    // a facet of the view, its rows, sizes and scales, see layout.js, its key
    // is the one of its category, e.g. for annotations. A new view, e.g. of
    // a toggle of a legend, is drawn into the elements of the one before.
    props: ["facet"],
    inject: ['store', 'emit'],
    data: () => ({
        hover: {
            visible: false,
            x: 0,
            y: 0,
        },
        // the facet has a hover, it can be moved by the keyboard
        keyboard: false,
        // the hover was moved by the keyboard, so screen readers read it
        announced: false,
    }),
    computed: {
        // the name of the chart for screen readers, the title and the facet,
        // without a title the subtitle or the localized name of a chart
        label() {
            const { title, subtitle } = this.store.def.options;
            const name = [title || subtitle, this.facet.name].filter(Boolean).map(t => this.store.text(t)).join(': ');
            return name || this.store.locale.texts.chart;
        },
        // the subtitle of a chart with a title describes it
        description() {
            const { title, subtitle } = this.store.def.options;
            return title && subtitle ? this.store.text(subtitle) : undefined;
        },
        describedBy() {
            return [this.description && `${this.uid}-subtitle`, this.keyboard && `${this.uid}-keys`].filter(Boolean).join(' ') || undefined;
        },
        // the options of the hover, see README "Events and slots"
        hoverOptions() { return this.store.def.options.hover ?? {} },
        // the origin of the plots and axes in the inner area, e.g. its center
        origin() { return this.store.coord.origin?.(this.facet.innerWidth, this.facet.innerHeight) ?? [0, 0] },
        innerTransform() { return `translate(${this.facet.margins.left + this.origin[0]} ${this.facet.margins.top + this.origin[1]})` },
    },
    components: {
        Hover
    },
    watch: {
        facet() {
            this.draw();
        },
    },
    created() {
        // the elements which are kept from one draw to the next by their key,
        // e.g. the groups of the plots, see keep
        this.kept = new Map();
        this.uid = `gen-vis-facet-${count++}`;
    },
    mounted() {
        // a touch keeps the hover until the next touch outside of the facet
        this.hideOnPointerOutside = e => {
            if (this.hover.visible && !this.$refs.svg.contains(e.target))
                this.hide?.();
        };
        document.addEventListener("pointerdown", this.hideOnPointerOutside);
        this.draw();
    },
    // the transitions of the elements end with the facet, so their timers do
    // not set the attributes of removed elements, d3-transition is loaded
    // only for definitions with a transition (see loadTransition)
    beforeUnmount() {
        const inner = d3.select(this.$refs.inner);
        if (d3.hasTransitions(inner))
            inner.selectAll("*").interrupt("vis").interrupt("highlight");
    },
    unmounted() {
        document.removeEventListener("pointerdown", this.hideOnPointerOutside);
    },
    methods: {
        // the element of `key` of the draw before or a new one, `create()`
        // appends it to the plot area, it is placed after the element drawn
        // before (the cursor), so the elements are in the order of the draw,
        // an element in its place is not moved, as a move costs the browser
        // the style of all its elements, e.g. of the circles of a plot
        keep(key, create) {
            let node = this.kept.get(key);
            if (!node)
                this.kept.set(key, node = create().node());
            if (this.cursor.nextSibling !== node)
                this.$refs.inner.insertBefore(node, this.cursor.nextSibling);
            this.cursor = node;
            this.used.add(key);
            return d3.select(node);
        },

        // the parts of the axes of the coordinate system (see `axes` of
        // coords/index.js), an element per part, kept from one draw to the next
        // by its key, after the elements drawn before: an axis (see drawAxis),
        // or an element with the attributes `attrs`, the `text` and the
        // elements of a `layer` (see drawLayer), of a `fresh` part drawn anew
        drawParts(parts) {
            (parts ?? []).forEach(part => {
                const node = this.keep(part.key, () => this.ctx.inner.append(part.element ?? "g"));
                if (part.axis)
                    return drawAxis(node, part.axis);
                Object.entries(part.attrs ?? {}).forEach(([k, v]) => node.attr(k, v));
                if (part.text !== undefined)
                    node.text(part.text);
                if (part.layer) {
                    if (part.fresh)
                        node.selectAll("*").remove();
                    drawLayer(node, part.layer);
                }
            });
        },

        draw() {
            // the elements are the ones without a highlight, also the one of
            // the page, at once, a transition would replace the new values
            this.highlighter?.(null, true);
            // the elements which are not kept are drawn anew, e.g. the axes
            const inner = this.$refs.inner;
            // the position of the plots of the new facet already, before vue
            // renders it, e.g. of the hover of the draw before at its pointer
            // in the center of a polar plot of a new width
            inner.setAttribute('transform', this.innerTransform);
            const kept = new Set(this.kept.values());
            [...inner.children].filter(c => c !== this.$refs.hoverMarker && !kept.has(c)).forEach(c => c.remove());
            this.used = new Set();
            this.cursor = this.$refs.hoverMarker;

            // the context of the plot types and the coordinate system, see
            // plots/index.js, the scales are not reactive, they are only replaced
            // with the facet
            const { key, rows, scales, axis, stackOf, isStacked, stackOrder, scope, dims, innerWidth, innerHeight, margins } = this.facet;
            this.ctx = {
                store: this.store,
                // the id of the facet on the page, e.g. of the ids of elements
                uid: this.uid,
                inner: d3.select(inner),
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

            this.store.coord.prepare?.(this.ctx);
            // the plots below the axes and grid lines, e.g. the bands of annotations,
            // the ones above the other plots, e.g. labels, the elements of the
            // draw before move with the transition of the view, see utils/draw.js
            const plots = this.store.def.plot.filter(p => p.facet === undefined
                || [p.facet].flat().map(String).includes(String(key)));
            withMotion(this.facet.transition ?? 0, () => {
                this.plot(plots.filter(p => p.layer == 'below'));
                this.drawParts(this.store.coord.axes(this.ctx));
                this.plot(plots.filter(p => p.layer != 'below' && p.layer != 'above'));
                this.plot(plots.filter(p => p.layer == 'above'));
            });
            // the labels of the annotations are above the plots, also the ones below them
            const labels = this.ctx.inner.selectAll(".vis-annotation-label");
            if (!labels.empty()) {
                const g = this.ctx.inner.append("g").attr("class", "vis-annotation-labels");
                labels.each(function() { g.node().appendChild(this) });
            }
            this.store.coord.raise?.(this.ctx);

            // the elements of the draw before which are not drawn again
            this.kept.forEach((node, k) => {
                if (!this.used.has(k)) {
                    node.remove();
                    this.kept.delete(k);
                }
            });
            // the highlight moves in the milliseconds of `options.highlight.transition`,
            // not if the user prefers less motion
            const duration = reducedMotion() ? 0 : Number(this.store.def.options.highlight?.transition) || 0;
            // the plots without the proxies of vue, the highlighter reads their props per element
            this.highlighter = highlighter(toRaw(this.store.def.plot), plot => this.kept.get(this.plotKey(plot)), duration);
            this.hoverInit();
            // the highlight of the page
            if (this.store.highlighted)
                this.highlight(null);
        },

        // the key of the group of a plot, its place in the definition (the ids
        // of two plots can be the same, e.g. of a parent), its id and type,
        // e.g. a plot of a patch is not drawn into the elements of another one
        plotKey(plot) {
            return `plot ${this.store.def.plot.indexOf(plot)} ${plot.id} ${plot.type}`;
        },

        // a group per plot, kept from one draw to the next, the layer of the
        // marks of its type (see plots/index.js) is drawn into it, of the
        // types with `update` into the elements of the draw before, the
        // elements of the others are removed
        plot(plots) {
            plots.forEach(plot => {
                if (!Object.hasOwn(plotTypes, plot.type))
                    throw new Error(`Unknown plot type '${plot.type}'`);
                const type = plotTypes[plot.type];
                // the types of a coordinate system, e.g. no bars in a map
                const coord = this.store.def.options.coord ?? 'cartesian';
                if (type.coords && !type.coords.includes(coord))
                    throw new Error(`The plot type '${plot.type}' is not available in the coordinate system '${coord}'`);
                const parent = this.keep(this.plotKey(plot), () => {
                    const g = this.ctx.inner.append("g")
                        .classed("vis-plot", true)
                        .classed(plot.id, true)
                        .attr("data-plot", plot.id);
                    if (plot.layer)
                        g.classed(`vis-${plot.layer}`, true);
                    return g;
                });
                if (!type.update)
                    parent.selectAll("*").remove();
                const rows = plotRows(this.store, plot, this.facet);
                drawLayer(parent, type.marks(plotGroups(plot, rows, this.ctx), plot, this.ctx));
            });
        },

        // the highlight of the elements of the categories of a row, e.g. of
        // an entry of a legend, null ends it, see utils/draw.js
        // without one the one of the page, see the prop highlight of App.vue
        highlight(dataEntry) {
            this.highlighter?.(dataEntry ?? this.store.highlighted ?? null);
        },

        // the keys of the hover: the arrows to the left and the right move it
        // to the position before and after, the ones up and down to the row
        // above and below, home and end to the first and the last position,
        // enter and space select it, as a click, escape hides it
        key(e) {
            const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up', Home: 'first', End: 'last' }[e.key];
            if (e.key == 'Escape') {
                this.hide?.();
            } else if ((e.key == 'Enter' || e.key == ' ') && this.selectShown) {
                e.preventDefault();
                this.selectShown();
            } else if (step !== undefined && this.step) {
                e.preventDefault();
                this.step(step);
            }
        },

        hoverInit() {
            const { store, ctx } = this;
            const coord = store.coord;
            this.hide = null;
            this.move = null;
            this.step = null;
            this.selectShown = null;

            // the hover needs the mappings of the positions and of the values,
            // of a coordinate system with `values` of the hover only the ones
            // of the values, e.g. of a pie without rings, all rows are one position
            const names = ctx.axis;
            this.keyboard = Boolean(names.v && (names.h || coord.hover.values));
            if (!this.keyboard) {
                this.hover.visible = false;
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

            const marker = d3.select(this.$refs.hoverMarker).select("line");
            const scope = store.scope;

            // the rows of the hover, with a value and of its `filter`, by their
            // key, e.g. of the horizontal axis, compared as strings
            const hoverOptions = store.def.options.hover ?? {};
            const hoverRows = filter(ctx.rows.filter(e => e[v] !== null), rowFilter(hoverOptions.filter, store.def.mapping, ctx.scope, 'options.hover.filter'));
            const rowsByKey = d3.group(hoverRows, e => String(e[names.h]));
            // the nearest key is one with rows, e.g. not one of null values, of
            // the coordinate systems with the `nearest` of the context, unless
            // the hover of keys without rows is shown (`"empty": true`)
            const located = hoverOptions.empty ? ctx
                : { ...ctx, nearest: nearestWithRows(ctx.scales[names.h], [...rowsByKey.values()].map(rows => rows[0][names.h])) };
            let last = null;
            // the rows of the hover shown, e.g. for a select by the keyboard
            let current = null;

            // a hidden hover has no position, as the one of a new facet
            const hide = this.hide = () => {
                if (this.hover.visible)
                    this.emit('hover', null);
                last = null;
                current = null;
                this.lastEvent = null;
                this.lastKey = null;
                Object.assign(this.hover, { visible: false, x: 0, y: 0 });
                marker.attr("x1", null).attr("x2", null).attr("y1", null).attr("y2", null);
                this.highlight(null);
            };

            // the hover of the nearest point, e.g. of a scatter plot, within
            // `radius` pixels, of the coordinate systems with points of rows,
            // the points of the rows are placed at the first use
            const pointMode = hoverOptions.mode == 'point' && coord.hover.point;
            let points = null;
            let nearestPoint = null;
            const preparePoints = () => {
                points ??= hoverRows.filter(row => row[names.h] !== null)
                    .map(row => [...coord.hover.point(ctx, row, names), row]);
                nearestPoint ??= pointFinder(points, hoverOptions.radius ?? 30);
            };

            // the rows at the pointer and the nearest one, stacked: the segment
            // under the pointer, outside of the stack the closest one, null
            // without a key, the rows are not formatted yet
            const at = e => {
                if (pointMode) {
                    preparePoints();
                    const point = nearestPoint(d3.pointer(e, ctx.inner.node()));
                    return point && { key: point[2][names.h], rows: [point[2]], nearest: point[2], point };
                }
                const position = coord.hover.locate(located, d3.pointer(e, ctx.inner.node()), names, e);
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
                // later mappings override the ones before, see Hover.vue
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
                if (rows.length == 0 && !hoverOptions.empty) {
                    hide();
                    return;
                }
                this.hover.visible = true;
                current = found;

                // the same key and row as before, e.g. a move within a step
                // of the axis, nothing is formatted or drawn, a hover at the
                // pointer moves with it
                if (last && last.key === key && last.nearest === nearest) {
                    if (hoverOptions.position == 'pointer' && this.pointerAt)
                        Object.assign(this.hover, placed(last.position, hoverOptions, this.pointerAt));
                    return;
                }

                // there is no entry e.g. if all categories are hidden, without
                // a value the elements of the key are highlighted, e.g. a region
                this.highlight(nearest ?? (value === undefined ? {[names.h]: key} : null));

                const p = payload(found);
                // a point has no line, the hover is beside it
                const position = found.point
                    ? (marker.attr("x1", null).attr("x2", null).attr("y1", null).attr("y2", null), pointPosition(found.point, ctx.innerWidth))
                    : coord.hover.marker(ctx, key, names, marker, nearest);
                last = { key, nearest, position };
                Object.assign(this.hover, placed(position, hoverOptions, this.pointerAt), {
                    data: entriesOf(rows, nearest),
                    title: p.title,
                    payload: p,
                });
                this.emit('hover', p);
            };

            // the hover of the pointer, also the one of the draw before at its
            // position, e.g. after a toggle by the keyboard
            const move = this.move = e => {
                // nothing under the pointer, e.g. the sea of a map, no empty or old hover
                const found = at(e);
                if (!found) {
                    hide();
                    return;
                }
                this.lastEvent = e;
                this.lastKey = null;
                // the hover of the pointer is not read by screen readers
                this.announced = false;
                this.pointerAt = d3.pointer(e, ctx.inner.node());
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
                this.lastEvent = null;
                this.pointerAt = null;
                // the hover of the keyboard is read by screen readers
                this.announced = true;
                this.lastKey = { index: i, row: r, key };
                show({ key, rows, nearest: rows[r], point });
            };
            this.selectShown = () => {
                if (current)
                    this.emit('select', payload(current));
            };
            this.step = step => {
                const current = this.lastKey;
                if (step == 'first' || step == 'last')
                    return showKey(step == 'first' ? 0 : Infinity, 0);
                if (step == 'up' || step == 'down')
                    return current ? showKey(current.index, current.row + (step == 'down' ? 1 : -1)) : showKey(0, 0);
                showKey(current ? current.index + step : (step > 0 ? 0 : Infinity), 0);
            };

            // mouse, touch and pen, vertical swipes still scroll the page
            // the area of the events, the plot area or with `"area": "facet"` also
            // the margins, e.g. the labels of the rows of horizontal bars
            const area = coord.hover.area(ctx, ctx.inner);
            if (hoverOptions.area == 'facet' && area.node().tagName == 'rect')
                area.attr("x", -(this.facet.margins.left + this.origin[0])).attr("y", -(this.facet.margins.top + this.origin[1]))
                    .attr("width", this.facet.width).attr("height", this.facet.height);
            // the full text of a cut text under the pointer (see fitText of
            // utils/draw.js) is the title of the area, it is above the texts,
            // so the browser shows it as their tooltip
            let tooltip = null;
            // the texts are cut in the draw, before the hover, so they are searched once
            const anyCut = Boolean(this.$refs.inner.querySelector('text > title'));
            const cutText = e => {
                const text = e.pointerType == 'mouse' && anyCut
                    ? document.elementsFromPoint?.(e.clientX, e.clientY)
                        .find(el => el.tagName == 'text' && this.$refs.inner.contains(el) && el.querySelector(':scope > title'))
                    : null;
                const full = text ? text.querySelector(':scope > title').textContent : '';
                if (full || tooltip)
                    tooltip ??= area.append("title");
                if (tooltip && tooltip.text() !== full)
                    tooltip.text(full);
            };
            area
                .attr("class", "vis-events")
                .attr("opacity", 0)
                .style("touch-action", "pan-y")
                .on("pointerdown pointermove", move)
                .on("pointermove.title", cutText)
                // a click or a tap, e.g. on a region of a map
                .on("click", e => {
                    const found = at(e);
                    if (found)
                        this.emit('select', payload(found));
                })
                .on("pointerleave", e => {
                    if (e.pointerType != "touch")
                        hide();
                })
                // the browser scrolls the page instead
                .on("pointercancel", hide);

            // the hover of the draw before with the rows of this one
            if (this.hover.visible && this.lastEvent)
                move(this.lastEvent);
            else if (this.hover.visible && this.lastKey)
                showKey(this.lastKey.index, this.lastKey.row, this.lastKey.key);
            else
                this.hover.visible = false;
        }
    }
}
</script>


<style lang="scss" scoped>
    .vis-facet {
        position: relative;
        display: inline-block;
        // the focus of the keyboard, e.g. to move the hover
        .vis-svg:focus-visible {
            outline: 2px solid var(--gen-vis-focus-color, #1E4F77);
            outline-offset: 1px;
        }
        :deep(svg) {
            g.vis-axis-bottom g.tick line {transform: translate(0px, -4px);}
            g.vis-axis-top g.tick line {transform: translate(0px, 5px);}
            g.vis-axis-right g.tick line {transform: translate(-4px, 0px);}
            g.vis-axis-left g.tick line {transform: translate(5px, 0px);}
            // the size of the labels of the ticks without one of their props, see `axis.labels`
            g.tick text:not([font-size]) {
                font-size: 13px;
            }
            .vis-axis-title {
                font-size: 13px;
            }

            g.vis-grid {
                stroke: var(--gen-vis-grid-color, #CCC);
                stroke-width: 0.75px;
            }
            // the texts of the plots without a fill of their props, black by default as in svg
            .vis-plot:not(.vis-annotations) text:not([fill]) { fill: var(--gen-vis-text-color, black); }
            // the colors of the annotations without the ones of their props
            .vis-annotation.vis-band:not([fill]) { fill: var(--gen-vis-band-color, #EEE); }
            .vis-annotation.vis-line:not([stroke]) { stroke: var(--gen-vis-line-color, #999); }
            .vis-annotation.vis-text:not([fill]) { fill: var(--gen-vis-annotation-color, #444); }
            .vis-annotation.vis-circle:not([fill]) { fill: var(--gen-vis-annotation-color, #666); }
            // the labels of annotations and radial axes on the plots, with a
            // halo, the props of the labels of an axis replace its stroke and
            // its width, see `axis.labels`
            .vis-annotation-label {
                font-size: 11px;
                fill: var(--gen-vis-annotation-color, #555);
            }
            .vis-annotation-label, g.vis-axis-radial text {
                paint-order: stroke;
                &:not([stroke]) { stroke: var(--gen-vis-halo-color, white); }
                &:not([stroke-width]) { stroke-width: 3px; }
            }
            g.vis-hover-marker {
                line {
                    stroke-width: 0.75px;
                    stroke: var(--gen-vis-marker-color, #AAA);
                }
            }
        }
    }
</style>
