<template>
    <div :style="`width: ${width}px;`" class="vis-inner">
        <svg ref="svg" :width="width" :height="height" class="facet">
            <g ref="inner" :transform="`translate(${margins.left + origin[0]} ${margins.top + origin[1]})`">
                <g :visibility="hover.visible ? 'visible' : 'hidden'" class="hoverMarker" ref="hoverMarker">
                    <line/>
                </g>
            </g>
        </svg>
        <div :style="`transform: translate(${margins.left + origin[0] + hover.x}px, ${margins.top + origin[1] + hover.y}px); position: absolute; top: 0; left: 0;`">
            <hover v-if="hover.visible" :title="hover.title" :data="hover.data" :side="hover.side"/>
        </div>
    </div>
</template>


<script>
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import { plotTypes } from "@/plots";

import Hover from '@/comp/Hover.vue';

export default {
    props: ["shared", "height", "width", "margins", "data"],
    inject: ['store'],
    data: () => ({
        hover: {
            visible: false,
            x: 0,
            y: 0,
        }
    }),
    computed: {
        innerWidth() { return this.width - (this.margins.left + this.margins.right) },
        innerHeight() { return this.height - (this.margins.top + this.margins.bottom) },
        // the origin of the plots and axes in the inner area, e.g. its center
        origin() { return this.store.coord.origin?.(this.innerWidth, this.innerHeight) ?? [0, 0] },
        relativeBases() {
            return {
                width: this.width,
                innerWidth: this.innerWidth,
                height: this.height,
                innerHeight: this.innerHeight,
            }
        }
    },
    components: {
        Hover
    },
    mounted() {
        // the context of the plot types and the coordinate system, the scales
        // are not reactive, they are only replaced with the facet
        this.ctx = {
            store: this.store,
            inner: d3.select(this.$refs.inner),
            data: this.data,
            info: this.scales(),
            dims: this.store.coord.dims(this.innerWidth, this.innerHeight),
            innerWidth: this.innerWidth,
            innerHeight: this.innerHeight,
            relativeBases: this.relativeBases,
        };

        this.store.coord.prepare?.(this.ctx);
        this.store.coord.axes(this.ctx);
        this.plot();
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
                const groups = ju.getProps(du.groupBy(this.data, plotDef.categories), plotDef, this.relativeBases, this.store.def.mapping);

                const parent = this.ctx.inner.append("g")
                    .classed("plotGroup", true)
                    .classed(plotDef.id, true)
                    .attr("data-plot", plotDef.id)
                plotTypes[plotDef.type].render(groups, parent, plotDef, this.ctx);
            });
        },

        // the scales of the facet and the shared ones of all facets
        scales() {
            const coord = this.store.coord;
            const infos = {};
            this.store.mappingNamesWithKey('scale')
                .filter(n => !(n in this.shared))
                .forEach(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n),
                    };
                    du.addDimInfo(info, this.data)
                    pu.addScale(info, coord.dims(this.innerWidth, this.innerHeight), coord);
                    infos[n] = info;
                });
            du.addScaledData(this.data, infos);
            return {...this.shared, ...infos};
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

            const hide = () => {
                this.hover.visible = false;
                pu.highlightElements(ctx.inner, store.def.plot);
            };

            // a touch keeps the hover until the next touch outside of the facet
            this.hideOnPointerOutside = e => {
                if (this.hover.visible && !this.$refs.svg.contains(e.target))
                    hide();
            };
            document.addEventListener("pointerdown", this.hideOnPointerOutside);

            // mouse, touch and pen, vertical swipes still scroll the page
            coord.hover.area(ctx, ctx.inner)
                .attr("class", "events")
                .attr("opacity", 0)
                .style("touch-action", "pan-y")
                .on("pointerdown pointermove", e => {
                    this.hover.visible = true;

                    const position = coord.hover.locate(ctx, d3.pointer(e), names, e);
                    if (!position)
                        return;
                    const { key, value } = position;

                    // the rows from the top to the bottom, stacks as they are drawn
                    const rows = du.filter(this.data, [{dim: names.h, key}])
                        .filter(e => e[v] !== null)
                        .map(e => {
                            const entries = Object.fromEntries(categories.map(n =>
                                [n, ju.fillDirect(store.mapping(n).hover.props, store.prop(n, e[n]))]));
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

                    // there is no entry e.g. if all categories are hidden, without
                    // a value the elements of the key are highlighted, e.g. a region
                    if (nearest)
                        nearest.nearest = true;
                    pu.highlightElements(ctx.inner, store.def.plot, nearest?.data ?? (value === undefined ? {[names.h]: key} : null));

                    Object.assign(this.hover, coord.hover.marker(ctx, key, names, marker), {
                        data: rows,
                        title: coord.hover.title ? coord.hover.title(ctx, key, names) : format.h(key),
                    });
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
