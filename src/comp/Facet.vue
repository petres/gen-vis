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
        getFormatterByType: t => t == "time" ? eu.localeTime.format : eu.locale.format,
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
                // console.log(plotDef.id)
                // console.log(dataGroupedProps)

                const parent = this.inner.append("g")
                    .classed("plotGroup", true)
                    .classed(plotDef.id, true)
                this[plotDef.type](dataGroupedProps, parent);
            });
        },
        _groupwise: function(data, parent) {
            // console.log(data)
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
            // console.log(data);
            return parent
                .classed(type, true)
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

        'svg:path': function(data, parent) {
            this._groupwise(data, parent)
                .attr("d", d => d3.line()
                    .x(e => e.x)
                    .y(e => e.y)
                    (d.values.map(e => ju.fillProps(d.props.d, e, true)))
                )
        },


        'svg:circle': function(data, parent) { this._pointwise(data, parent, "circle") },
        'svg:line':   function(data, parent) { this._pointwise(data, parent, "line") },
        'svg:rect':   function(data, parent) { this._pointwise(data, parent, "rect") },
        'svg:text':   function(data, parent) { this._pointwise(data, parent, "text") },

        'base:area': function(data) {
            this._groupwise(data, parent)
                .attr("d", d => d3.area()
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
            const self = this;
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

                    if (i.format) {
                        a.tickFormat(this.getFormatterByType(m.scale.type)(i.format))
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
                a.formatter = this.getFormatterByType(m.scale.type)(i.format);
            });

            axis = Object.fromEntries(axis.map(a => [a.axis, a]))

            // console.log(axis)

            const categories = this.store.mappingNamesWithKey('hover').filter(e => !Object.values(axis).map(t => t.name).includes(e));
            // console.log(categories)

            const hoverMarker = d3.select(this.$refs.hoverMarker);
            const hoverLine = hoverMarker.select("line");

            const hoverDiv = d3.select(this.$refs.hover);

            hoverDiv.select('table.entries').selectAll('*').remove();
            // let xo = null;
            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .on("mousemove", function(e) {
                    const c = d3.pointer(e);
                    const i = self.info[axis.h.name];

                    // get next existing x value with data
                    const x = i.scale.invertCustom(c[0]);
                    const xs = i.scale(x);

                    hoverLine.attr("x1", xs)
                        .attr("x2", xs)
                        .attr("y1", 0)
                        .attr("y2", self.innerHeight)

                    // console.log(self.data)
                    const tt = du.filter(self.data, [{dim: axis.h.name, key: x}])
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

                    const ttt = tt.map((e, i) => ({v: e.entries[axis.v.name].value, i: i})).sort((a, b) => a.v - b.v)

                    const nearestElement = tt[ttt[d3.bisectCenter(ttt.map(e => e.v), ys)].i]
                    nearestElement.nearest = true;

                    
                    self.def.plot.filter(p => p.hoverProps.length > 0).forEach(plotDef => {
                        const t = plotDef.categories.map(c => ({name: c, value: nearestElement.data[c]}));

                        const f = t.map(e => `[data-group-${e.name}='${e.value}']`).join('');
                        const selectorToHover = `g.plotGroup.${plotDef.id} ${f}`;

                        const selectorHovered = `g.plotGroup.${plotDef.id} .hover`;

                        const esToHover = self.inner.selectAll(selectorToHover);
                        const esHovered = self.inner.selectAll(selectorHovered);

                        // remove hover
                        if (esHovered.size() > 0) {
                            esHovered.classed('hover', false)
                            plotDef.hoverProps.forEach(n => {
                                esHovered.attr(n, esHovered.attr(`default-${n}`));
                            })
                        }

                        // add hover
                        const esNew = esToHover.filter(":not(.hover)")
                        if (esNew.size() > 0) {
                            esNew.classed('hover', true)
                                .raise();
                            
                            plotDef.hoverProps.forEach(n => {
                                esNew.attr(`default-${n}`, esNew.attr(n))
                                    .attr(n, esNew.attr(`hover-${n}`))
                            })
                        }
                    })

                    // console.log(tt)
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
                    // console.log(self.hover.axis)

                    self.hover.side = xs > self.innerWidth/2 ? "left" : "right";

                })
                .on("mouseout", function(e) {
                    self.hover.visible = false;

                    // remove hover
                    self.def.plot.filter(p => p.hoverProps.length > 0).forEach(plotDef => {
                        const selectorHovered = `g.plotGroup.${plotDef.id} .hover`;
                        const esHovered = self.inner.selectAll(selectorHovered);
                        if (esHovered.size() > 0) {
                            esHovered.classed('hover', false)
                            plotDef.hoverProps.forEach(n => {
                                esHovered.attr(n, esHovered.attr(`default-${n}`));
                            })
                        }
                    })
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
                    stroke-width: 0.75px;
                    stroke: #AAA;
                }
            }
        }
    }
</style>
