<template>
    <div :style="`width: ${width}px;`" class="vis-inner">
        <svg ref="svg" :width="width" :height="height" class="facet">
            <g ref="inner" :transform="`translate(${margins.left} ${margins.top})`">
                <g :visibility="hover.visible ? 'visible' : 'hidden'" class="hoverMarker" ref="hoverMarker">
                    <line/>
                </g>
            </g>
        </svg>
        <div :style="`transform: translate(${margins.left}px, ${margins.top + innerHeight/2}px); position: absolute; top: 0; left: 0;`">
            <hover v-if="hover.visible" :data="hover.data" :side="hover.side" :axis="hover.axis"/>
        </div>
        <span v-if="debug" class="debug">{{ debug }}</span>
    </div>
</template>


<script>
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import * as eu from "@/utils/else";

import Hover from '@/comp/Hover.vue';

const finite = (...values) => values.every(v => Number.isFinite(v));

export default {
    props: ["filter", "shared", "height", "width", "margins", "data"],
    inject: ['store'],
    data: () => ({
        info: {},
        debug: null,
        def: null,
        hover: {
            visible: false
        }
    }),
    computed: {
        innerWidth() { return this.width - (this.margins.left + this.margins.right) },
        innerHeight() { return this.height - (this.margins.top + this.margins.bottom) },
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
    created() {
        this.def = this.store.def;
    },
    mounted() {
        this.inner = d3.select(this.$refs.inner);

        this.scales();
        this.axis();
        this.plot();
        this.hoverInit();
    },
    unmounted() {
        document.removeEventListener("pointerdown", this.hideOnPointerOutside);
    },
    methods: {
        plot() {
            this.def.plot.forEach(plotDef => {
                const dataGrouped = du.groupBy(this.data, plotDef.categories);
                const dataGroupedProps = ju.getProps(dataGrouped, plotDef, this.relativeBases, this.def.mapping);

                const parent = this.inner.append("g")
                    .classed("plotGroup", true)
                    .classed(plotDef.id, true)
                this[plotDef.type](dataGroupedProps, parent, plotDef);
            });
        },
        _groupwise: function(data, parent) {
            return parent
                .classed("paths", true)
                .selectAll("path")
                .data(data)
                .enter()
                .append("path")
                .each(function(d) {pu.setProps.call(this, d.props)})
                .each(pu.setGroupData)
        },
        _pointwise(data, parent, type, translate = v => v) {
            return parent
                .classed(type, true)
                .selectAll(`g.group`)
                .data(data)
                .enter()
                .append("g")
                .attr("class", `group`)
                .each(pu.setGroupData)
                .selectAll(type)
                .data(d => {
                    // entries with missing values are not drawn
                    const names = ju.refNames(d.props);
                    return d.values
                        .filter(e => names.every(n => e[n] !== null))
                        .map(e => translate(ju.fillProps(d.props, e)));
                })
                .enter()
                .append(type)
                .each(pu.setProps)
        },

        // missing values are gaps in paths and areas
        'svg:path': function(data, parent, plotDef) {
            this._groupwise(data, parent)
                .attr("d", d => d3.line()
                    .curve(pu.curves[plotDef.curve ?? 'linear'] ?? d3.curveLinear)
                    .defined(e => finite(e.x, e.y))
                    .x(e => e.x)
                    .y(e => e.y)
                    (d.values.map(e => ju.fillProps(d.props.d, e, true)))
                )
        },


        'svg:circle': function(data, parent) { this._pointwise(data, parent, "circle") },
        'svg:line':   function(data, parent) { this._pointwise(data, parent, "line") },
        'svg:rect':   function(data, parent) { this._pointwise(data, parent, "rect") },
        'svg:text':   function(data, parent) { this._pointwise(data, parent, "text") },

        'base:area': function(data, parent, plotDef) {
            this._groupwise(data, parent)
                .attr("d", d => d3.area()
                    .curve(pu.curves[plotDef.curve ?? 'linear'] ?? d3.curveLinear)
                    .defined(e => finite(e.x, e.y0, e.y1))
                    .x(e => e.x)
                    .y1(e => e.y1)
                    .y0(e => e.y0)
                    (d.values.map(e => ju.fillProps(d.props.d, e, true)))
                )
        },

        bar(data, parent) {
            const self = this;
            this._pointwise(data, parent, "rect", (v) => {
                const yBase = v.height.parts[0];
                const yZero = self.info[yBase].scale(0);

                if (v.width === undefined) {
                    const xBase = v.cx.parts[0];
                    v.width = ju.entryToProp(self.info[xBase].scale.step()*(1-self.info[xBase].scale.padding()));
                }

                v.x = ju.entryToProp(v.cx.value - v.width.value/2);
                delete v.cx;

                v.y = ju.entryToProp(v.height.value);
                v.height = ju.entryToProp(yZero - v.height.value);
                return v;
            })
        },

        stackedBar(data, parent) {
            data.forEach(g => {
                const x = g.props["x"].ref;
                const y = g.props["y"].ref;
                g.props["x"] = ju.entryToProp(`@${x}:scaled`);
                g.props["y"] = ju.entryToProp(`@${y}:st:e:scaled`);

                g.props["height"] = ju.entryToProp(`@${y}:st:h:scaled`);

                g.props["transform"] = ju.entryToProp(`translate(-${g.props.width.value/2} 0)`);
            });
            this._pointwise(data, parent, "rect", (v) => {
                if(v.height.value < 0) {
                    v.y.value += v.height.value;
                    v.height.value = -v.height.value;
                }
                return v;
            });
        },

        scales() {
            const tinfo = {};
            this.store.mappingNamesWithKey('scale')
                .filter(n => !Object.keys(this.shared).includes(n))
                .forEach(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n),
                    };
                    du.addDimInfo(info, this.data)
                    pu.addScale(info, {
                        width: this.innerWidth,
                        height: this.innerHeight,
                    });
                    tinfo[n] = info;
                });
            du.addScaledData(this.data, tinfo);
            this.info = {...this.shared, ...tinfo};
        },

        axis() {
            this.store.mappingNamesWithKey('axis').forEach(n => {
                const m = this.store.mapping(n);
                const i = m.axis;
                const s = this.info[n].scale;
                const ticks = ju.entryToValue(i.ticks, this.relativeBases);

                const a = d3[`axis${eu.capitalize(i.position)}`](s)
                    .tickSizeInner(9)
                    .tickSizeOuter(0)
                    .ticks(ticks)
                    .tickPadding(i.padding)

                if (i.format) {
                    a.tickFormat(this.store.formatter(m.scale.type)(i.format))
                } else if (!i.values) {
                    const format = this.store.locale.tickFormat(s, m.scale.type, ticks);
                    if (format)
                        a.tickFormat(format);
                }

                if (i.values) {
                    a.tickValues(i.values)
                }

                // the grid lines are at the ticks of the axis
                if (i.grid) {
                    const values = i.values ?? (s.ticks ? s.ticks(ticks) : s.domain());
                    this.grid(s, values, ['left', 'right'].includes(i.position));
                }

                const ga = this.inner.append("g")
                    .attr("class", `axis-name-${n} axis-position-${i.position}`)
                    .call(a)

                if (i.position == 'bottom')
                    ga.attr('transform', `translate(0, ${this.innerHeight})`)
                if (i.position == 'right')
                    ga.attr('transform', `translate(${this.innerWidth}, 0)`)

                // positive angles rotate counterclockwise, negative ones
                // clockwise, the labels start at their tick in both cases
                if (i.rotate)
                    ga.selectAll("text")
                        .attr("text-anchor", i.rotate > 0 ? "end" : "start")
                        .attr("transform", `rotate(${-i.rotate})`)

                if (i.title) {
                    const at = this.inner.append("text")
                        .attr('class', 'axis-title')
                        .attr('y', 0)
                        .attr('x', 0)
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "middle")
                        .text(i.title.name)

                    if (i.position == 'left')
                        at.attr("transform", `rotate(-90) translate(-${this.innerHeight/2} -${i.title.offset})`)

                    if (i.position == 'right')
                        at.attr("transform", `rotate(90) translate(${this.innerHeight/2} -${this.innerWidth + i.title.offset})`)

                    if (i.position == 'top')
                        at.attr("transform", `translate(${this.innerWidth/2} -${i.title.offset})`)

                    if (i.position == 'bottom')
                        at.attr("transform", `translate(${this.innerWidth/2} ${this.innerHeight + i.title.offset})`)
                }
            });
        },
        // horizontal lines for a vertical axis and vice versa
        grid(s, values, vertical) {
            const offset = s.bandwidth ? s.bandwidth()/2 : 0;
            const lines = this.inner.append("g")
                .attr("class", "grid")
                .selectAll('line')
                .data(values)
                .enter()
                .append("line")

            if (vertical) {
                lines.attr('x1', 0)
                    .attr('x2', this.innerWidth)
                    .attr('y1', d => s(d) + offset)
                    .attr('y2', d => s(d) + offset)
            } else {
                lines.attr('y1', 0)
                    .attr('y2', this.innerHeight)
                    .attr('x1', d => s(d) + offset)
                    .attr('x2', d => s(d) + offset)
            }
        },
        hoverInit() {
            const self = this;

            // the hover needs a horizontal and a vertical axis
            const names = this.store.axis;
            if (!names.h || !names.v)
                return;

            const axis = Object.fromEntries(Object.entries(names).map(([t, name]) => {
                const m = this.def.mapping[name];
                const format = m.hover?.format ?? m.axis?.format ?? (['time', 'utc'].includes(m.scale.type) ? '%x' : 'c');
                return [t, {axis: t, name, formatter: this.store.formatter(m.scale.type)(format)}];
            }));

            // categorical mappings, e.g. not a second vertical axis
            const categories = this.store.mappingNamesWithKey('hover')
                .filter(n => n != names.h && n != names.v && this.store.mapping(n).props);

            const hoverLine = d3.select(this.$refs.hoverMarker).select("line");

            const hide = () => {
                self.hover.visible = false;
                pu.highlightElements(self.inner, self.def.plot);
            };

            // a touch keeps the hover until the next touch outside of the facet
            this.hideOnPointerOutside = e => {
                if (self.hover.visible && !self.$refs.svg.contains(e.target))
                    hide();
            };
            document.addEventListener("pointerdown", this.hideOnPointerOutside);

            // mouse, touch and pen, vertical swipes still scroll the page
            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .style("touch-action", "pan-y")
                .on("pointerdown pointermove", function(e) {
                    self.hover.visible = true;
                    const c = d3.pointer(e);
                    const i = self.info[axis.h.name];

                    // get next existing x value with data
                    const x = i.scale.invertCustom(c[0]);
                    if (x === undefined)
                        return;
                    const xs = i.scale(x);

                    hoverLine.attr("x1", xs)
                        .attr("x2", xs)
                        .attr("y1", 0)
                        .attr("y2", self.innerHeight)

                    const tt = du.filter(self.data, [{dim: axis.h.name, key: x}])
                        .filter(e => e[axis.v.name] !== null)
                        .map(e => {
                            const t = {entries: {}, data: e, nearest: false};
                            categories.forEach(n => {
                                t.entries[n] = ju.fillDirect(self.store.mapping(n).hover.props, self.store.prop(n, e[n]))
                            })
                            t.entries[axis.v.name] = {
                                value: e[axis.v.name],
                                name: axis.v.formatter(e[axis.v.name])
                            };
                            return t;
                        })

                    const ys = self.info[axis.v.name].scale.invert(c[1]);
                    const v = axis.v.name;

                    let nearestElement;
                    if (self.store.mapping(v).stacked) {
                        // stacked: the segment under the mouse, outside of the stack the closest one
                        nearestElement = d3.least(tt, e => {
                            const [lo, hi] = d3.extent([e.data[`${v}:st:s`], e.data[`${v}:st:e`]]);
                            return ys < lo ? lo - ys : (ys > hi ? ys - hi : 0);
                        });
                    } else {
                        nearestElement = d3.least(tt, e => Math.abs(e.data[v] - ys));
                    }

                    // there is no entry e.g. if all categories are hidden
                    if (nearestElement)
                        nearestElement.nearest = true;
                    pu.highlightElements(self.inner, self.def.plot, nearestElement?.data);

                    self.hover.data = tt;

                    self.hover.axis = {
                        h: {
                            col: axis.h.name,
                            value: xs,
                            name: axis.h.formatter(x),
                        },
                        v: {
                            col: axis.v.name,
                            value: ys,
                        }
                    }
                    self.hover.side = xs > self.innerWidth/2 ? "left" : "right";
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
        .debug {
            font-size: 12px;
        }
        :deep(svg) {
            g.axis-position-bottom g.tick line {transform: translate(0px, -4px);}
            g.axis-position-top g.tick line {transform: translate(0px, 5px);}
            g.axis-position-right g.tick line {transform: translate(-4px, 0px);}
            g.axis-position-bottom g.tick line {transform: translate(0px, -4px);}
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
