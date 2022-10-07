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
            <hover v-if="hover.visible" :data="hover.data" :side="hover.side" :x="hover.x" :title="hover.title" />
        </div>
        <span v-if="debug" class="debug">{{ debug }}</span>
    </div>
</template>


<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import * as eu from "@/utils/else";

import Hover from '@/comp/Hover.vue';

export default {
    props: ["filter", "shared", "height", "width", "margins", "data"],
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
        this.store = baseStore();
        this.def = this.store.def;
    },
    mounted() {
        this.inner = d3.select(this.$refs.inner);

        this.scales();
        this.axis();
        this.plot();
        this.hoverInit();
    },
    methods: {
        plot() {
            this.def.plot.forEach(plotDef => {
                // d.props = ju.fillProps(d.props, );
                const dataGrouped = du.groupBy(this.data, plotDef.categories);
                // const filter = plotDef.filter.map(f => {
                //     const r = RegExp(f.regexp, 'i');
                //     return {
                //         dim: f.dim,
                //         key: v => r.test(v),
                //     }
                // })
                // const dataFiltered = du.filter(this.data, filter);
                // const dataGrouped = du.groupBy(dataFiltered, plotDef.categories);
                // // console.log(d)
                const dataGroupedProps = ju.getProps(dataGrouped, plotDef, this.relativeBases, this.def.mapping);
                // console.log(dataGroupedProps)
                this[plotDef.type](dataGroupedProps);
            });
        },
        _groupwise: function(data) {
            // console.log(data)
            return this.inner.append("g")
                .attr("class", "paths")
                .selectAll("path")
                .data(data)
                .enter()
                .append("path")
                .each(function(d) {pu.setProps.call(this, d.props)})
                .each(pu.setGroupData)
        },
        _pointwise(data, type, translate = v => v) {
            // console.log(data);
            return this.inner.append("g")
                .attr("class", type)
                .selectAll(`g.group`)
                .data(data)
                .enter()
                .append("g")
                .attr("class", `group`)
                .each(pu.setGroupData)
                .selectAll(type)
                .data(d => d.values.map(e => translate(ju.fillProps(d.props, e))))
                .enter()
                .append(type)
                .each(pu.setProps)
        },

        'svg:path': function(data) {
            this._groupwise(data)
                .attr("d", d => d3.line()
                    .x(e => e.x)
                    .y(e => e.y)
                    (d.values.map(e => ju.fillProps(d.props.d, e, true)))
                )
        },


        'svg:circle': function(data) { this._pointwise(data, "circle") },
        'svg:line': function(data)   { this._pointwise(data, "line") },
        'svg:rect': function(data)   { this._pointwise(data, "rect") },
        'svg:text': function(data)   { this._pointwise(data, "text") },

        'base:area': function(data) {
            this._groupwise(data)
                .attr("d", d => d3.area()
                    .x(e => e.x)
                    .y1(e => e.y1)
                    .y0(e => e.y0)
                    (d.values.map(e => ju.fillProps(d.props.d, e, true)))
                )
        },

        bar(data) {
            const self = this;
            this._pointwise(data, "rect", (v) => {
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

        stackedBar(data) {
            const self = this;
            data.forEach(g => {
                const x = g.props["x"].ref;
                const y = g.props["y"].ref;
                g.props["x"] = ju.entryToProp(`@${x}:scaled`);
                g.props["y"] = ju.entryToProp(`@${y}:st:e:scaled`);

                g.props["height"] = ju.entryToProp(`@${y}:st:h:scaled`);

                g.props["transform"] = ju.entryToProp(`translate(-${g.props.width.value/2} 0)`);
            });
            this._pointwise(data, "rect", (v) => {
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
                    const m = this.store.mapping(n);
                    const info = {
                        dim: n,
                        mapping: m,
                    };
                    // console.log(this.data)
                    du.addDimInfo(info, this.data)
                    // console.log(info.values)
                    pu.addScale(info, {
                        width: this.innerWidth,
                        height: this.innerHeight,
                    });
                    tinfo[n] = info;
                    // console.log(info)
                });
            du.addScaledData(this.data, tinfo);
            this.info = {...this.shared, ...tinfo};
            // console.log(this.info)
            // this.debug = this.info;
        },

        axis() {
            this.store.mappingNamesWithKey('axis')
                // .filter(n => !Object.keys(this.shared).includes(n))
                .forEach(n => {
                    const m = this.store.mapping(n);
                    const i = m.axis;
                    const s = this.info[n].scale;
                    // const s = m._scale;

                    const a = d3[`axis${eu.capitalize(i.position)}`](s)
                        .tickSizeInner(9)
                        .tickSizeOuter(0)
                        .ticks(ju.entryToValue(i.ticks, this.relativeBases))
                        .tickPadding(i.padding)

                    // console.log({ n , value: ju.entryToValue(i.ticks, this.relativeBases) })
                    // console.log(this.relativeBases)

                    if (i.format) {
                        if (m.scale.type == "time")
                            a.tickFormat(eu.localeTime.format(i.format))
                        else
                            a.tickFormat(eu.locale.format(i.format))
                    }

                    if (i.values) {
                        a.tickValues(i.values)
                    }

                    // console.log('ticks')
                    // console.log()
                    if (i.grid) {
                        const g = this.inner.append("g")
                            .attr("class", "grid")
                            .selectAll('line')
                            .data(s.ticks(i.ticks))
                            .enter()
                            .append("line")
                            .attr('x1', 0)
                            .attr('x2', this.innerWidth)
                            .attr('y1', d => s(d))
                            .attr('y2', d => s(d))
                    }

                    const ga = this.inner.append("g")
                        .attr("class", `axis-name-${n} axis-position-${i.position}`)
                        .call(a)

                    if (i.position == 'bottom')
                        ga.attr('transform', `translate(0, ${this.innerHeight})`)
                    if (i.position == 'right')
                        ga.attr('transform', `translate(${this.innerWidth}, 0)`)

                    if (['top', 'bottom'])

                    if (i.rotate)
                        ga.selectAll("text")
                            .attr("text-anchor", "end")
                            .attr("transform", `rotate(-${i.rotate})`)

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
                            at.attr("transform", `translate(${this.innerHeight/2} -${i.title.offset})`)
                    }

                });
        },
        hoverInit() {
            const self = this;

            let axis = this.store.axis;

            axis = Object.keys(axis).map(t => ({
                axis: t, name: axis[t]
            }))

            // console.log(axis)
            axis.forEach(a => {
                const m = this.def.mapping[a.name];
                const i = m.hover;
                let format = 'c';
                if (i && i.format) {
                    format = i.format;
                }

                if (m.scale.type == "time")
                    a.formatter = eu.localeTime.format(format);
                else
                    a.formatter = eu.locale.format(format);
            });

            axis = Object.fromEntries(axis.map(a => [a.axis, a]))

            // console.log(axis)

            const categories = this.store.mappingNamesWithKey('hover').filter(e => !Object.values(axis).map(t => t.name).includes(e));
            // console.log(categories)

            const hoverMarker = d3.select(this.$refs.hoverMarker);
            const hoverLine = hoverMarker.select("line");

            const hoverDiv = d3.select(this.$refs.hover);

            hoverDiv.select('table.entries').selectAll('*').remove();
            let xo = null;
            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .on("mousemove", function(e) {
                    const c = d3.pointer(e);
                    // console.log(c[0])
                    const i = self.info[axis.h.name];
                    // console.log(i.scale.domain())
                    const x = i.scale.invertCustom(c[0]);
                    // console.log(x)
                    if (x == xo)
                        return;

                    xo = x;

                    const xs = i.scale(x);
                    hoverLine.attr("x1", xs)
                    hoverLine.attr("x2", xs)
                    hoverLine.attr("y1", 0)
                    hoverLine.attr("y2", self.innerHeight)

                    self.hover.title = axis.h.formatter(x);
                    // console.log(categories)
                    const tt = du.filter(self.data, [{dim: axis.h.name, key: x}])
                        .sort((a, b) => b[axis.v.name] - a[axis.v.name])
                        .map(e => {
                            const t = {};

                            categories.forEach(n => {
                                // t[n] = self.store.prop(n, e[n]).name
                                t[n] = ju.fillDirect(self.store.mapping(n).hover.props, self.store.prop(n, e[n]))
                            })

                            t[axis.v.name] = axis.v.formatter(e[axis.v.name]);
                            return t;
                        })

                    // console.log(tt)

                    self.hover.data = tt;
                    self.hover.x = xs;
                    self.hover.side = xs > self.innerWidth/2 ? "left" : "right";

                })
                .on("mouseout", function(e) {
                    self.hover.visible = false;
                    xo = null;
                })
                .on("mouseenter", function(e) {
                    self.hover.visible = true;
                })
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
                    stroke: #999;
                }
            }
        }
    }
</style>
