<template>
    <div :style="`width: ${facet.width}px;`" class="vis-inner">
        <svg ref="svg" :width="facet.width" :height="facet.height" class="facet">
            <g ref="inner" :transform="`translate(${facet.margins.left + origin[0]} ${facet.margins.top + origin[1]})`">
                <g :visibility="hover.visible ? 'visible' : 'hidden'" class="hoverMarker" ref="hoverMarker">
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
import { groupBy } from "@/utils/data";
import { fillDirect, getProps } from "@/utils/props";
import { highlightElements } from "@/utils/draw";
import { plotTypes } from "@/plots";

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
        // the origin of the plots and axes in the inner area, e.g. its center
        origin() { return this.store.coord.origin?.(this.facet.innerWidth, this.facet.innerHeight) ?? [0, 0] },
    },
    components: {
        Hover
    },
    mounted() {
        // the context of the plot types and the coordinate system, the scales
        // are not reactive, they are only replaced with the facet
        const { rows, info, innerWidth, innerHeight, scope } = this.facet;
        this.data = rows;
        this.ctx = {
            store: this.store,
            inner: d3.select(this.$refs.inner),
            data: rows,
            info,
            dims: this.store.coord.dims(innerWidth, innerHeight),
            innerWidth,
            innerHeight,
            relativeBases: scope,
        };

        this.store.coord.prepare?.(this.ctx);
        // the annotations below the plots are also below the grid lines and axes
        this.annotate(false);
        this.store.coord.axes(this.ctx);
        this.plot();
        // also without annotations above the plots, for the labels of the ones below
        this.annotate(true);
        this.store.coord.raise?.(this.ctx);
        this.hoverInit();
    },
    unmounted() {
        document.removeEventListener("pointerdown", this.hideOnPointerOutside);
    },
    methods: {
        plot() {
            this.store.def.plot.forEach(plotDef => {
                if (!Object.hasOwn(plotTypes, plotDef.type))
                    throw new Error(`Unknown plot type '${plotDef.type}'`);
                const groups = getProps(groupBy(this.data, plotDef.categories), plotDef, this.ctx.relativeBases, this.store.def.mapping);

                const parent = this.ctx.inner.append("g")
                    .classed("plotGroup", true)
                    .classed(plotDef.id, true)
                    .attr("data-plot", plotDef.id)
                plotTypes[plotDef.type].render(groups, parent, plotDef, this.ctx);
            });
        },

        // the annotations below or `above` the plots, of all facets or the ones
        // of `facet`, e.g. "Wien" or a list of keys
        annotate(above) {
            const coord = this.store.coord;
            const annotations = (this.store.def.annotations ?? []).filter(a => Boolean(a.above) == above
                && (a.facet === undefined || [a.facet].flat().map(String).includes(String(this.facet.key))));
            if (!coord.annotate || (annotations.length == 0 && !(above && this.ctx.inner.select(".annotation-label").node())))
                return;
            const g = this.ctx.inner.append("g").attr("class", `annotations ${above ? 'above' : 'below'}`);
            annotations.forEach(a => coord.annotate(this.ctx, g, a));
            // the labels are above the plots, also the ones of annotations below them
            if (above) {
                const labels = this.ctx.inner.append("g").attr("class", "annotation-labels");
                this.ctx.inner.selectAll(".annotations .annotation-label").each(function() { labels.node().appendChild(this) });
            }
        },

        hoverInit() {
            const { store, ctx } = this;
            const coord = store.coord;

            // the hover needs the mappings of the positions and of the values
            const names = store.axis;
            if (!names.h || !names.v)
                return;

            const formatter = n => {
                const m = store.mapping(n);
                const format = m.hover?.format ?? m.axis?.format ?? (['time', 'utc'].includes(m.scale?.type) ? '%x' : 'c');
                return store.formatter(m.scale?.type)(format);
            };
            const format = { h: formatter(names.h), v: formatter(names.v) };
            const v = names.v;
            const stacked = store.mapping(v).stacked;

            // categorical mappings, e.g. not a second vertical axis
            const categories = store.mappingNamesWithKey('hover')
                .filter(n => n != names.h && n != v && store.mapping(n).props);

            const marker = d3.select(this.$refs.hoverMarker).select("line");
            const bases = store.bases;

            // the rows by their key, e.g. of the horizontal axis, compared as strings
            const rowsByKey = d3.group(this.data.filter(e => e[v] !== null), e => String(e[names.h]));
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
                        const entries = Object.fromEntries(categories.map(n =>
                            [n, fillDirect(store.mapping(n).hover.props, { ...bases, ...store.prop(n, e[n]) })]));
                        entries[v] = { value: e[v], name: format.v(e[v]) };
                        const order = stacked ? (e[`${v}:start`] + e[`${v}:end`])/2 : e[v];
                        return { entries, data: e, nearest: false, order };
                    });

                // stacked: the segment under the pointer, outside of the stack the closest one
                const distance = stacked ? e => {
                    const [lo, hi] = d3.extent([e.data[`${v}:start`], e.data[`${v}:end`]]);
                    return value < lo ? lo - value : (value > hi ? value - hi : 0);
                } : e => Math.abs(e.data[v] - value);
                const nearest = value === undefined ? undefined : d3.least(rows, distance);
                const title = coord.hover.title ? coord.hover.title(ctx, key, names) : format.h(key);
                return { key, value, rows, nearest, title };
            };

            // the rows of the events and the slot, the values of the mappings
            // without the computed ones, e.g. of the scales
            const plain = row => Object.fromEntries(Object.entries(row).filter(([k]) => !k.includes(':')));
            const payload = ({ key, title, rows, nearest }) => ({
                key,
                title,
                rows: rows.map(r => plain(r.data)),
                nearest: nearest ? plain(nearest.data) : null,
            });

            // mouse, touch and pen, vertical swipes still scroll the page
            coord.hover.area(ctx, ctx.inner)
                .attr("class", "events")
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
    .vis-inner {
        position: relative;
        display: inline-block;
        :deep(svg) {
            g.axis-position-bottom g.tick line {transform: translate(0px, -4px);}
            g.axis-position-top g.tick line {transform: translate(0px, 5px);}
            g.axis-position-right g.tick line {transform: translate(-4px, 0px);}
            g.axis-position-left g.tick line {transform: translate(5px, 0px);}
            g.tick {
                text {
                    font-size: 13px;
                }
            }
            .axis-title {
                font-size: 13px;
            }

            g.group, path {
                &[data-visible="false"] {
                    opacity: 0.01;
                }
            }

            g.grid {
                stroke: #CCC;
                stroke-width: 0.75px;
            }
            g.hoverMarker {
                line {
                    stroke-width: 0.75px;
                    stroke: #AAA;
                }
            }
        }
    }
</style>
