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
            <hover v-if="hover.visible" :title="hover.title" :data="hover.data" :side="hover.side" :payload="hover.payload" :value="store.axis.v"/>
        </div>
    </div>
</template>


<script>
import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { highlightElements } from "@/utils/draw";
import { plotTypes } from "@/plots";
import { plotGroups, plotRows } from "@/layout";

import Hover from '@/comp/Hover.vue';

export default {
    // a facet of the view, its rows, sizes and scales, see layout.js, its key
    // is the one of its category, e.g. for annotations
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
    mounted() {
        // the context of the plot types and the coordinate system, see
        // plots/index.js, the scales are not reactive, they are only replaced
        // with the facet
        const { key, rows, scales, axis, stackOf, scope, dims, innerWidth, innerHeight } = this.facet;
        this.ctx = {
            store: this.store,
            inner: d3.select(this.$refs.inner),
            key,
            rows,
            scales,
            axis,
            stackOf,
            scope,
            dims,
            innerWidth,
            innerHeight,
        };

        this.store.coord.prepare?.(this.ctx);
        // the plots below the axes and grid lines, e.g. the bands of annotations,
        // the ones above the other plots, e.g. labels
        const plots = this.store.def.plot.filter(p => p.facet === undefined
            || [p.facet].flat().map(String).includes(String(key)));
        this.plot(plots.filter(p => p.layer == 'below'));
        this.store.coord.axes(this.ctx);
        this.plot(plots.filter(p => p.layer != 'below' && p.layer != 'above'));
        this.plot(plots.filter(p => p.layer == 'above'));
        // the labels of the annotations are above the plots, also the ones below them
        const labels = this.ctx.inner.selectAll(".vis-annotation-label");
        if (!labels.empty()) {
            const g = this.ctx.inner.append("g").attr("class", "vis-annotation-labels");
            labels.each(function() { g.node().appendChild(this) });
        }
        this.store.coord.raise?.(this.ctx);
        this.hoverInit();
    },
    unmounted() {
        document.removeEventListener("pointerdown", this.hideOnPointerOutside);
    },
    methods: {
        plot(plots) {
            plots.forEach(plot => {
                if (!Object.hasOwn(plotTypes, plot.type))
                    throw new Error(`Unknown plot type '${plot.type}'`);
                const parent = this.ctx.inner.append("g")
                    .classed("vis-plot", true)
                    .classed(plot.id, true)
                    .attr("data-plot", plot.id);
                if (plot.layer)
                    parent.classed(`vis-${plot.layer}`, true);
                const rows = plotRows(this.store, plot, this.facet);
                plotTypes[plot.type].render(plotGroups(plot, rows, this.ctx), parent, plot, this.ctx);
            });
        },

        hoverInit() {
            const { store, ctx } = this;
            const coord = store.coord;

            // the hover needs the mappings of the positions and of the values
            const names = ctx.axis;
            if (!names.h || !names.v)
                return;

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

            const hide = () => {
                if (this.hover.visible)
                    this.emit('hover', null);
                last = null;
                this.hover.visible = false;
                highlightElements(ctx.inner, store.def.plot);
            };

            // a touch keeps the hover until the next touch outside of the facet
            this.hideOnPointerOutside = e => {
                if (this.hover.visible && !this.$refs.svg.contains(e.target))
                    hide();
            };
            document.addEventListener("pointerdown", this.hideOnPointerOutside);

            // the rows at the pointer from the top to the bottom, stacks as they
            // are drawn, the nearest one, null without a key
            const at = e => {
                const position = coord.hover.locate(ctx, d3.pointer(e), names, e);
                if (!position)
                    return null;
                const { key, value } = position;
                const rows = (rowsByKey.get(String(key)) ?? [])
                    .map(e => {
                        const entries = Object.fromEntries(categories.map(n => {
                            const values = evaluate(store.mapping(n).hover.props, { ...scope, ...store.prop(n, e[n]) });
                            return [n, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, store.text(v)]))];
                        }));
                        entries[v] = { value: e[v], name: format.v(e[v]) };
                        const order = stackOf ? d3.mean(stackOf(e)) : e[v];
                        return { entries, data: e, nearest: false, order };
                    });

                // stacked: the segment under the pointer, outside of the stack the closest one
                const distance = stackOf ? e => {
                    const [lo, hi] = d3.extent(stackOf(e.data));
                    return value < lo ? lo - value : (value > hi ? value - hi : 0);
                } : e => Math.abs(e.data[v] - value);
                const nearest = value === undefined ? undefined : d3.least(rows, distance);
                const title = coord.hover.title ? coord.hover.title(ctx, key, names) : format.h(key);
                return { key, value, rows, nearest, title };
            };

            // the rows of the events and the slot, copies of the values of the mappings
            const plain = row => ({ ...row });
            const payload = ({ key, title, rows, nearest }) => ({
                key,
                title,
                rows: rows.map(r => plain(r.data)),
                nearest: nearest ? plain(nearest.data) : null,
            });

            // mouse, touch and pen, vertical swipes still scroll the page
            coord.hover.area(ctx, ctx.inner)
                .attr("class", "vis-events")
                .attr("opacity", 0)
                .style("touch-action", "pan-y")
                .on("pointerdown pointermove", e => {
                    // nothing under the pointer, e.g. the sea of a map, no empty or old hover
                    const found = at(e);
                    if (!found) {
                        hide();
                        return;
                    }
                    this.hover.visible = true;
                    const { key, value, rows, nearest } = found;

                    // the same key and row as before, e.g. a move within a step of the axis
                    if (last && last.key === key && last.nearest === nearest?.data)
                        return;
                    last = { key, nearest: nearest?.data };

                    // there is no entry e.g. if all categories are hidden, without
                    // a value the elements of the key are highlighted, e.g. a region
                    if (nearest)
                        nearest.nearest = true;
                    highlightElements(ctx.inner, store.def.plot, nearest?.data ?? (value === undefined ? {[names.h]: key} : null));

                    const p = payload(found);
                    Object.assign(this.hover, coord.hover.marker(ctx, key, names, marker), {
                        data: rows,
                        title: found.title,
                        payload: p,
                    });
                    this.emit('hover', p);
                })
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
                .on("pointercancel", hide)
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
