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
        const xr = d3.extent(v.map(d => d.x))
        const yr = d3.extent(v.map(d => d.y))

        this.xs = d3.scaleLinear()
            .domain(xr)
            .range([ 0, this.innerWidth]);

        this.ys = d3.scaleLinear()
            .domain(yr)
            .range([ this.innerHeight, 0]);

        d3.select(this.$refs.x)
            .call(d3.axisBottom(this.xs).ticks(5))
            .attr('transform', `translate(0, ${this.innerHeight})`)

        d3.select(this.$refs.y)
            .call(d3.axisLeft(this.ys).ticks(5))

        const dataGrouped = {};
        data.forEach((d, i) => {
            const g = d[mapping.g];
            if (!(g in dataGrouped))
                dataGrouped[g] = [];
            dataGrouped[g].push(v[i])
        });

        if (this.def.paths) this.paths(dataGrouped);
        if (this.def.circles) this.circles(dataGrouped);

    },
    methods: {
        paths(dataGrouped) {
            const linesData = Object.keys(dataGrouped).map(d => ({
                g: d,
                a: ju.fill(this.def.paths.attrs, ju.merged(this.def.g, d)),
                vs: dataGrouped[d],
            }))

            this.inner.append("g")
                .attr("class", "paths")
                .selectAll("path")
                .data(linesData)
                .enter()
                .append("path")
                .each(function(d) {
                    const e = d3.select(this);
                    for (const [key, value] of Object.entries(d.a)) {
                        e.attr(key, value);
                    }
                })
                .attr("d", d => d3.line()
                    .x(e => this.xs(e.x))
                    .y(e => this.ys(e.y))
                    (d.vs)
                )
        },
        circles(dataGrouped) {
            const circlesData = Object.keys(dataGrouped).map(d => ({
                g: d,
                a: ju.fill(this.def.circles.attrs, ju.merged(this.def.g, d)),
                vs: dataGrouped[d],
            }))

            this.inner.append("g")
                .attr("class", "circles")
                .selectAll("g.circleGroup")
                .data(circlesData)
                .enter()
                .append("g")
                .attr("class", "circleGroup")
                .selectAll("circle")
                .data(d => {
                    return d.vs.map(e => ({
                        a: d.a,
                        v: e
                    }))
                })
                .enter()
                .append("circle")
                .each(function(d) {
                    const e = d3.select(this);
                    for (const [key, value] of Object.entries(d.a)) {
                        e.attr(key, value);
                    }
                })
                .attr('cx', d => this.xs(d.v.x))
                .attr('cy', d => this.ys(d.v.y))
        },
    }
}
</script>
