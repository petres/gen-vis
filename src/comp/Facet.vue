<template>
    <div v-if="info" :style="`width: ${width}px; display: inline-block;`">
        <span v-if="debug" style="font-size: 13px;">{{ debug }}</span>
        <svg ref="svg" :width="width" :height="height" class="facet">
            <g ref="inner" :transform="`translate(${this.margins.left} ${this.margins.top})`"/>
        </svg>
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
    props: ["filter", "shared", "height", "width", "margins"],
    data: () => ({
        info: null,
        debug: null
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
        this.info = {};
    },
    mounted() {
        // console.log(this.shared)
        this.inner = d3.select(this.$refs.inner);

        let data = this.store.data;
        let def = this.store.def;

        if (this.filter) {
            data = du.filter(data, [this.filter]);
        }

        this.scales(data);
        this.axis();

        def.plot.forEach(d => {
            const dataGrouped = du.groupBy(data, d.categories);
            const dataGroupedProps = ju.getProps(dataGrouped, d.props, def.mapping);
            this[d.type](dataGroupedProps);
        });






        this.hover();


    },
    methods: {
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
        circle(data) {
            this.pointwise(data, "circle")
        },
        line(data) {
            this.pointwise(data, "line")
        },
        rect(data) {
            this.pointwise(data, "rect")
        },
        text(data) {
            this.pointwise(data, "text")
        },

        scales(data) {
            this.info = {...this.shared};
            this.store.mappingNamesWithKey('scale')
                .filter(n => !Object.keys(this.info).includes(n))
                .forEach(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n)
                    }
                    du.addDimInfo(info, data)
                    pu.addScale(info, this.constants);
                    this.info[n] = info;
                });
            du.addScaledData(data, this.info);
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
                    const a = d3[`axis${eu.capitalize(i.position)}`](s).ticks(i.ticks);
                    if (m.scale.format)
                        a.tickFormat(eu.locale.format(m.scale.format))

                    if (m.scale.timeFormat)
                        a.tickFormat(eu.localeTime.format(m.scale.timeFormat))

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
            const xAxis = 'x';
            const self = this;
            const hover = this.inner.append("g")
                .attr("class", "hover")
                .attr("visibility", "hidden")

            const hoverLine = hover
                .append("line")

            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .on("mousemove", function(e) {
                    const c = d3.pointer(e);
                    const i = self.info[xAxis];
                    // console.log(self.info)
                    const xv = d3.bisectCenter(i.values, i.scale.invert(c[0]))
                    // console.log(i.values[xv])

                    const xx = i.scale(i.values[xv]);
                    hoverLine.attr("x1", xx)
                    hoverLine.attr("x2", xx)
                    hoverLine.attr("y1", 0)
                    hoverLine.attr("y2", self.innerHeight)

                })
                .on("mouseout", function(e) {
                    hover.attr("visibility", "hidden")
                })
                .on("mouseenter", function(e) {
                    hover.attr("visibility", "visible")
                })
        }
    }
}
</script>
