<template>
    <div :style="`width: ${facet.width}px;`" class="vis-facet">
        <svg ref="svg" :width="facet.width" :height="facet.height" class="vis-svg" role="img" :aria-label="label">
            <g ref="inner" :transform="`translate(${facet.margins.left + origin[0]} ${facet.margins.top + origin[1]})`">
                <g :visibility="hover.visible ? 'visible' : 'hidden'" class="vis-hover-marker" ref="hoverMarker">
                    <line/>
                </g>
            </g>
        </svg>
        <div :style="`transform: translate(${facet.margins.left + origin[0] + hover.x}px, ${facet.margins.top + origin[1] + hover.y}px); position: absolute; top: 0; left: 0;`">
            <hover v-if="hover.visible" :title="hover.title" :data="hover.data" :side="hover.side" :payload="hover.payload"/>
        </div>
    </div>
</template>


<script>
import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { highlighter } from "@/utils/draw";
import { plotTypes } from "@/plots";
import { plotGroups, plotRows } from "@/layout";

import Hover from '@/comp/Hover.vue';

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
        }
    }),
    computed: {
        // the name of the chart for screen readers, the title and the facet
        label() {
            return [this.store.def.options.title, this.facet.name].filter(Boolean).map(t => this.store.text(t)).join(': ') || undefined;
        },
        // the origin of the plots and axes in the inner area, e.g. its center
        origin() { return this.store.coord.origin?.(this.facet.innerWidth, this.facet.innerHeight) ?? [0, 0] },
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
            if (this.holder)
                this.holder.appendChild(node);
            else if (this.cursor.nextSibling !== node)
                this.$refs.inner.insertBefore(node, this.cursor.nextSibling);
            if (!this.holder)
                this.cursor = node;
            this.used.add(key);
            return d3.select(node);
        },

        // the elements which `draw(ctx)` appends to the plot area, e.g. the
        // axes, are placed after the cursor, not at the end of the plot area
        place(draw) {
            const inner = this.$refs.inner;
            const holder = this.holder = inner.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'g'), this.cursor.nextSibling);
            const plotArea = this.ctx.inner;
            this.ctx.inner = d3.select(holder);
            try {
                draw(this.ctx);
            } finally {
                this.ctx.inner = plotArea;
                this.holder = null;
                for (const node of [...holder.childNodes]) {
                    inner.insertBefore(node, holder);
                    this.cursor = node;
                }
                holder.remove();
            }
        },

        draw() {
            this.highlight(null);
            // the elements which are not kept are drawn anew, e.g. the axes
            const inner = this.$refs.inner;
            const kept = new Set(this.kept.values());
            [...inner.children].filter(c => c !== this.$refs.hoverMarker && !kept.has(c)).forEach(c => c.remove());
            this.used = new Set();
            this.cursor = this.$refs.hoverMarker;

            // the context of the plot types and the coordinate system, see
            // plots/index.js, the scales are not reactive, they are only replaced
            // with the facet
            const { key, rows, scales, axis, stackOf, scope, dims, innerWidth, innerHeight } = this.facet;
            this.ctx = {
                store: this.store,
                inner: d3.select(inner),
                key,
                rows,
                scales,
                axis,
                stackOf,
                scope,
                dims,
                innerWidth,
                innerHeight,
                keep: (key, create) => this.keep(key, create),
            };

            this.store.coord.prepare?.(this.ctx);
            // the plots below the axes and grid lines, e.g. the bands of annotations,
            // the ones above the other plots, e.g. labels
            const plots = this.store.def.plot.filter(p => p.facet === undefined
                || [p.facet].flat().map(String).includes(String(key)));
            this.plot(plots.filter(p => p.layer == 'below'));
            this.place(ctx => this.store.coord.axes(ctx));
            this.plot(plots.filter(p => p.layer != 'below' && p.layer != 'above'));
            this.plot(plots.filter(p => p.layer == 'above'));
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
            this.highlighter = highlighter(inner, this.store.def.plot);
            this.hoverInit();
        },

        // a group per plot, kept from one draw to the next, the plot types
        // with `update` draw into the elements of the draw before, e.g. with
        // pointwise, the elements of the others are removed
        plot(plots) {
            plots.forEach(plot => {
                if (!Object.hasOwn(plotTypes, plot.type))
                    throw new Error(`Unknown plot type '${plot.type}'`);
                const type = plotTypes[plot.type];
                const parent = this.keep(`plot ${plot.id}`, () => {
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
                type.render(plotGroups(plot, rows, this.ctx), parent, plot, this.ctx);
            });
        },

        // the highlight of the elements of the categories of a row, e.g. of
        // an entry of a legend, null ends it, see utils/draw.js
        highlight(dataEntry) {
            this.highlighter?.(dataEntry);
        },

        hoverInit() {
            const { store, ctx } = this;
            const coord = store.coord;
            this.hide = null;
            this.move = null;

            // the hover needs the mappings of the positions and of the values
            const names = ctx.axis;
            if (!names.h || !names.v) {
                this.hover.visible = false;
                return;
            }

            const format = { h: store.valueFormat(names.h, ctx.scales[names.h]), v: store.valueFormat(names.v, ctx.scales[names.v]) };
            const v = names.v;
            // the start and the end of a stacked value
            const stackOf = ctx.stackOf;

            // categorical mappings, e.g. not a second vertical axis
            const categories = store.mappingNamesWithKey('hover')
                .filter(n => n != names.h && n != v && store.mapping(n).props);

            const marker = d3.select(this.$refs.hoverMarker).select("line");
            const scope = store.scope;

            // the rows by their key, e.g. of the horizontal axis, compared as strings
            const rowsByKey = d3.group(ctx.rows.filter(e => e[v] !== null), e => String(e[names.h]));
            let last = null;

            // a hidden hover has no position, as the one of a new facet
            const hide = this.hide = () => {
                if (this.hover.visible)
                    this.emit('hover', null);
                last = null;
                this.lastEvent = null;
                Object.assign(this.hover, { visible: false, x: 0, y: 0 });
                marker.attr("x1", null).attr("x2", null).attr("y1", null).attr("y2", null);
                this.highlight(null);
            };

            // the rows at the pointer and the nearest one, stacked: the segment
            // under the pointer, outside of the stack the closest one, null
            // without a key, the rows are not formatted yet
            const at = e => {
                const position = coord.hover.locate(ctx, d3.pointer(e, ctx.inner.node()), names, e);
                if (!position)
                    return null;
                const { key, value } = position;
                const rows = rowsByKey.get(String(key)) ?? [];
                const distance = stackOf ? row => {
                    const [lo, hi] = d3.extent(stackOf(row));
                    return value < lo ? lo - value : (value > hi ? value - hi : 0);
                } : row => Math.abs(row[v] - value);
                const nearest = value === undefined ? undefined : d3.least(rows, distance);
                return { key, value, rows, nearest };
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
                const order = stackOf ? d3.mean(stackOf(row)) : row[v];
                return { entries, cells, data: row, nearest: row === nearest, order };
            });

            // the rows of the events and the slot, copies of the values of the mappings
            const plain = row => ({ ...row });
            const payload = ({ key, rows, nearest }) => ({
                key,
                title: titleOf(key),
                rows: rows.map(plain),
                nearest: nearest ? plain(nearest) : null,
            });

            // the hover of the pointer, also the one of the draw before at its
            // position, e.g. after a toggle by the keyboard
            const move = this.move = e => {
                // nothing under the pointer, e.g. the sea of a map, no empty or old hover
                const found = at(e);
                if (!found) {
                    hide();
                    return;
                }
                this.hover.visible = true;
                this.lastEvent = e;
                const { key, value, rows, nearest } = found;

                // the same key and row as before, e.g. a move within a step
                // of the axis, nothing is formatted or drawn
                if (last && last.key === key && last.nearest === nearest)
                    return;
                last = { key, nearest };

                // there is no entry e.g. if all categories are hidden, without
                // a value the elements of the key are highlighted, e.g. a region
                this.highlight(nearest ?? (value === undefined ? {[names.h]: key} : null));

                const p = payload(found);
                Object.assign(this.hover, coord.hover.marker(ctx, key, names, marker), {
                    data: entriesOf(rows, nearest),
                    title: p.title,
                    payload: p,
                });
                this.emit('hover', p);
            };

            // mouse, touch and pen, vertical swipes still scroll the page
            coord.hover.area(ctx, ctx.inner)
                .attr("class", "vis-events")
                .attr("opacity", 0)
                .style("touch-action", "pan-y")
                .on("pointerdown pointermove", move)
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
        :deep(svg) {
            g.vis-axis-bottom g.tick line {transform: translate(0px, -4px);}
            g.vis-axis-top g.tick line {transform: translate(0px, 5px);}
            g.vis-axis-right g.tick line {transform: translate(-4px, 0px);}
            g.vis-axis-left g.tick line {transform: translate(5px, 0px);}
            g.tick {
                text {
                    font-size: 13px;
                }
            }
            .vis-axis-title {
                font-size: 13px;
            }

            g.vis-grid {
                stroke: var(--gen-vis-grid-color, #CCC);
                stroke-width: 0.75px;
            }
            // the colors of the annotations without the ones of their props
            .vis-annotation.vis-band:not([fill]) { fill: var(--gen-vis-band-color, #EEE); }
            .vis-annotation.vis-line:not([stroke]) { stroke: var(--gen-vis-line-color, #999); }
            .vis-annotation.vis-text:not([fill]) { fill: var(--gen-vis-annotation-color, #444); }
            .vis-annotation.vis-circle:not([fill]) { fill: var(--gen-vis-annotation-color, #666); }
            // the labels of annotations and radial axes on the plots, with a halo
            .vis-annotation-label {
                font-size: 11px;
                fill: var(--gen-vis-annotation-color, #555);
            }
            .vis-annotation-label, g.vis-axis-radial text {
                stroke: var(--gen-vis-halo-color, white);
                stroke-width: 3px;
                paint-order: stroke;
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
