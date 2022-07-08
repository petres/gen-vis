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
        const inner = d3.select(this.$refs.inner);
        const def = store.def;

        const mapping = def.mapping;

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

        const xs = d3.scaleLinear()
            .domain(xr)
            .range([ 0, this.innerWidth]);

        const ys = d3.scaleLinear()
            .domain(yr)
            .range([ this.innerHeight, 0]);

        d3.select(this.$refs.x)
            .call(d3.axisBottom(xs).ticks(5))
            .attr('transform', `translate(0, ${this.innerHeight})`)

        d3.select(this.$refs.y)
            .call(d3.axisLeft(ys).ticks(5))

        const splitted = {};
        data.forEach((d, i) => {
            const g = d[mapping.g];
            if (!(g in splitted))
                splitted[g] = [];
            splitted[g].push(v[i])
        });

        if (def.paths) {
            const linesData = Object.keys(splitted).map(d => ({
                g: d,
                a: Object.assign({}, def.paths.attrs.common, def.paths.attrs.manual[d]),
                vs: splitted[d],
            }))

            inner.append("g")
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
                    .x(e => xs(e.x))
                    .y(e => ys(e.y))
                    (d.vs)
                )
        }

        if (def.circles) {
            const circlesData = Object.keys(splitted).map(d => ({
                g: d,
                a: Object.assign({}, def.circles.attrs.common, def.circles.attrs.manual[d]),
                vs: splitted[d],
            }))

            inner.append("g")
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
                .each(function(d, i , j) {
                    const e = d3.select(this);
                    for (const [key, value] of Object.entries(d.a)) {
                        e.attr(key, value);
                    }
                })
                .attr('cx', d => xs(d.v.x))
                .attr('cy', d => ys(d.v.y))
        }
    }
}
</script>
