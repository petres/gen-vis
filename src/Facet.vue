<template>
    <div>
        {{ f }}
        <div>
            <svg ref="svg" :width="width" :height="height">
                <g ref="inner" :transform="`translate(${this.margin.l} ${this.margin.t})`">
                    <g ref="x"/>
                    <g ref="y"/>
                </g>
            </svg>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as pu from "@/plot-utils";
import * as du from "@/data-utils";
import * as ju from "@/json-utils";


export default {
    props: {
        f: {
            default: null,
        }
    },
    data: () => ({
        margin: {l: 50, r: 50, t: 50, b: 50},
        width: 600,
        height: 300,
        xs: null,
        ys: null,
        def: null,
        inner: null,
    }),
    computed: {
        innerWidth() { return this.width - (this.margin.l + this.margin.r) },
        innerHeight() { return this.height - (this.margin.t + this.margin.b) },
    },
    components: {
    },
    mounted() {
        const store = baseStore();
        // const svg = d3.select(this.$refs.svg);
        this.inner = d3.select(this.$refs.inner);
        this.def = store.def;

        const mapping = this.def.mapping;

        let data = store.data;

        if (this.f) {
            data = data.filter(d => d[mapping.f] == this.f)
        }

        const v = data.map(d => ({
            x: +d[mapping.x],
            y: +d[mapping.y],
        }))

        this.xs = pu.scale(this.def.x, () => v.map(d => d.x))
            .range([ 0, this.innerWidth]);

        this.ys = pu.scale(this.def.y, () => v.map(d => d.y))
            .range([ this.innerHeight, 0]);

        // pu.axis(this.$refs.x, this.def.x.axis, scale)
        d3.select(this.$refs.x)
            .call(d3.axisBottom(this.xs).ticks(5))
            .attr('transform', `translate(0, ${this.innerHeight})`)

        d3.select(this.$refs.y)
            .call(d3.axisLeft(this.ys).ticks(5))

        const dataGrouped = du.group(data, v, mapping.g)

        if (this.def.paths) this.paths(dataGrouped);
        if (this.def.circles) this.circles(dataGrouped);
        if (this.def.lines) this.lines(dataGrouped);
        if (this.def.rects) this.rects(dataGrouped);

    },
    methods: {
        paths(dataGrouped) {
            const data = ju.getAttrs(dataGrouped, this.def.paths.attrs, this.def.g);


            this.inner.append("g")
                .attr("class", "paths")
                .selectAll("path.pathsGroup")
                .data(data)
                .enter()
                .append("path")
                .attr("class", "pathsGroup")
                .each(pu.setAttrs)
                .attr("d", d => d3.line()
                    .x(e => this.xs(e.x))
                    .y(e => this.ys(e.y))
                    (d.vs)
                )
        },
        circles(dataGrouped) {
            const data = ju.getAttrs(dataGrouped, this.def.circles.attrs, this.def.g);

            this.inner.append("g")
                .attr("class", "circles")
                .selectAll("g.circlesGroup")
                .data(data)
                .enter()
                .append("g")
                .attr("class", "circlesGroup")
                .selectAll("circle")
                .data(d => d.vs.map(e => ({
                    a: d.a,
                    v: e
                })))
                .enter()
                .append("circle")
                .each(pu.setAttrs)
                .attr('cx', d => this.xs(d.v.x))
                .attr('cy', d => this.ys(d.v.y))
        },
        lines(dataGrouped) {
            const data = ju.getAttrs(dataGrouped, this.def.lines.attrs, this.def.g);

            this.inner.append("g")
                .attr("class", "lines")
                .selectAll("g.linesGroup")
                .data(data)
                .enter()
                .append("g")
                .attr("class", "linesGroup")
                .selectAll("line")
                .data(d => d.vs.map(e => ({
                    a: d.a,
                    v: e
                })))
                .enter()
                .append("line")
                .each(pu.setAttrs)
                .attr('x1', d => this.xs(d.v.x))
                .attr('x2', d => this.xs(d.v.x) + 10)
                .attr('y1', d => this.ys(d.v.y))
                .attr('y2', d => this.ys(d.v.y) + 10)
        },
        rects(dataGrouped) {
            const data = ju.getAttrs(dataGrouped, this.def.rects.attrs, this.def.g);

            this.inner.append("g")
                .attr("class", "rects")
                .selectAll("g.rectsGroup")
                .data(data)
                .enter()
                .append("g")
                .attr("class", "rectsGroup")
                .selectAll("rect")
                .data(d => d.vs.map(e => ({
                    a: d.a,
                    v: e
                })))
                .enter()
                .append("rect")
                .each(pu.setAttrs)
                .attr('x', d => this.xs(d.v.x))
                .attr('y', d => this.ys(d.v.y))
                .attr('width', 10)
                .attr('height', 10)
        },
    }
}
</script>
