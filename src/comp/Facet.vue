<template>
    <div :style="`width: ${width}px;`" class="vis-inner">
        <svg ref="svg" :width="width" :height="height" class="facet">
            <g ref="inner" :transform="`translate(${margins.left} ${margins.top})`"/>
        </svg>
        <div class="hover" ref="hover">
            <div class="title"/>
            <table class="entries"/>
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

export default {
    props: ["filter", "shared", "height", "width", "margins", "data"],
    data: () => ({
        info: {},
        debug: null,
        def: null,
    }),
    computed: {
        innerWidth() { return this.width - (this.margins.left + this.margins.right) },
        innerHeight() { return this.height - (this.margins.top + this.margins.bottom) },
        constants() {
            return {
                "width": this.innerWidth,
                "height": this.innerHeight,
            }
        }
    },
    components: {
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
        this.hover();
    },
    methods: {
        plot() {
            this.def.plot.forEach(d => {
                const dataGrouped = du.groupBy(this.data, d.categories);
                const dataGroupedProps = ju.getProps(dataGrouped, d.props, this.def.mapping);
                this[d.type](dataGroupedProps);
            });
        },
        path(data) {
            // console.log(data);
            this.inner.append("g")
                .attr("class", "paths")
                .selectAll("path")
                .data(data)
                .enter()
                .append("path")
                .each(function(d) {pu.setProps.call(this, d.props)})
                .each(pu.setGroupData)
                .attr("d", d => d3.line()
                    .x(e => e.x)
                    .y(e => e.y)
                    (d.values.map(e => ju.fill(d.props.d, e)))
                )
        },
        pointwise(data, type) {
            return this.inner.append("g")
                .attr("class", type)
                .selectAll(`g.group`)
                .data(data)
                .enter()
                .append("g")
                .attr("class", `group`)
                .each(pu.setGroupData)
                .selectAll(type)
                .data(d => d.values.map(e => ju.fill(d.props, e)))
                .enter()
                .append(type)
                .each(pu.setProps)
        },
        circle(data) { this.pointwise(data, "circle") },
        line(data)   { this.pointwise(data, "line") },
        rect(data)   { this.pointwise(data, "rect") },
        text(data)   { this.pointwise(data, "text") },

        scales() {
            const tinfo = {};
            this.store.mappingNamesWithKey('scale')
                .filter(n => !Object.keys(this.shared).includes(n))
                .forEach(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n)
                    }
                    du.addDimInfo(info, this.data)
                    pu.addScale(info, this.constants);
                    tinfo[n] = info;
                });
            du.addScaledData(this.data, tinfo);
            this.info = {...this.shared, ...tinfo};
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
                        .ticks(i.ticks)
                        .tickSizeInner(9)
                        .tickSizeOuter(0)

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
                        .attr("class", `axis-${n}`)
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
        hover() {
            const self = this;

            let axis = [
                { axis: 'x', name: 'x' },
                { axis: 'y', name: 'y' },
            ];
            // console.log(this.def)
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

            const categories = this.store.mappingNamesWithKey('hover').filter(e => !Object.keys(axis).includes(e));

            const hover = this.inner.append("g")
                .attr("class", "hover")
                .attr("visibility", "hidden")

            const hoverLine = hover
                .append("line");

            const hoverDiv = d3.select(this.$refs.hover)
                .style("visibility", "hidden");

            hoverDiv.select('table.entries').selectAll('*').remove();

            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .on("mousemove", function(e) {
                    const c = d3.pointer(e);
                    const i = self.info[axis['x'].name];
                    // console.log(self.info)
                    const xii = d3.bisectCenter(i.values, i.scale.invert(c[0]))
                    const x = i.values[xii];
                    const xs = i.scale(x);
                    hoverLine.attr("x1", xs)
                    hoverLine.attr("x2", xs)
                    hoverLine.attr("y1", 0)
                    hoverLine.attr("y2", self.innerHeight)
                    //
                    hoverDiv.select('div.title')
                        .text(axis['x'].formatter(x))

                    const tt = du.filter(self.data, [{dim: axis['x'].name, key: x}]).sort((a, b) => b[axis['y'].name] - a[axis['y'].name]);
                    // console.log(tt)

                    if (xs >= self.innerWidth/2) {
                        hoverDiv.style("left", `${xs + self.margins.left - 20}px`)
                        hoverDiv.style("transform", `translate(-100%, -50%)`)
                    } else {
                        hoverDiv.style("left", `${xs + self.margins.left + 20}px`)
                        hoverDiv.style("transform", `translate(0, -50%)`)
                    }

                    const entries = hoverDiv.select('table.entries').selectAll('tr.entry')
                        .data(tt)
                        .join('tr')
                        .attr('class', "entry")


                    entries.selectAll("td.value")
                        .data(d => [d])
                        .join("td")
                        .attr('class', "value")
                        .text(d => axis['y'].formatter(d[axis['y'].name]))


                    categories.forEach(n => {
                        entries.selectAll(`td.${n}`)
                            .data(d => [d])
                            .join("td")
                            .attr('class', n)
                            .text(d => self.store.prop(n, d[n]).name)
                    });
                })
                .on("mouseout", function(e) {
                    hover.attr("visibility", "hidden")
                    hoverDiv.style("visibility", "hidden")
                })
                .on("mouseenter", function(e) {
                    hover.attr("visibility", "visible")
                    hoverDiv.style("visibility", "visible")

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
            g.axis-x g.tick line {transform: translate(0px, -4px);}
            g.axis-y g.tick line {transform: translate(5px, 0px);}
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
            g.hover {
                line {
                    stroke: #999;
                }
            }
        }
        :deep(div.hover) {
            position: absolute;
            font-size: 13px;

            .title {
                font-weight: bold;
                padding: 1px 3px;
                border-bottom: 2px solid #000;
                text-align: center;
            }
            background-color: #FFFFFFAA;
            top: 40%;

            // margin: 20px;

            table {
                border-collapse: collapse;
                td {
                    text-align: left;
                    padding: 1px 3px;
                    &.value {
                        text-align: right;
                    }
                }
                margin-left: auto;
                margin-right: auto;
            }
            pointer-events:none;

        }
    }
</style>
