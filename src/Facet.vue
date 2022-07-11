<template>
    <div>
        {{ f }}
        <div :style="`width: ${width}px`">
            <div ref="legends" class="legends"/>
            <svg ref="svg" :width="width" :height="height">
                <g ref="inner" :transform="`translate(${this.margin.l} ${this.margin.t})`"/>
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
    }),
    computed: {
        innerWidth() { return this.width - (this.margin.l + this.margin.r) },
        innerHeight() { return this.height - (this.margin.t + this.margin.b) },
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
    },
    mounted() {
        const dataRaw = this.store.data;
        const def = this.store.def;

        this.height = this.store.def.options.height;
        this.width = this.store.def.options.width;

        // const svg = d3.select(this.$refs.svg);
        this.inner = d3.select(this.$refs.inner);

        const mapping = Object.keys(def.mapping).map(n => ({
            name: n,
            column: def.mapping[n].column,
            numeric: def.mapping[n].type == 'numeric',
            date: def.mapping[n].type == 'date',
        }));

        let data = dataRaw.map(d => {
            const e = {};
            mapping.forEach(c => {
                let ev = d[c.column];
                if (c.date)
                    ev = Date.parse(ev);
                if (c.numeric)
                    ev = 1 * ev;
                e[c.name] = ev;
            });
            return e;
        })
        console.log(data)

        const scales = Object.keys(def.mapping).filter(n => ('scale' in def.mapping[n]))
        scales.forEach(n => {
            def.mapping[n]._scale = pu.scale(def.mapping[n].scale, this.constants, () => data.map(d => d[n]));
        });

        console.log(def.mapping)

        data = data.map(d => {
            scales.forEach(n => {
                d[`${n}:scaled`] = def.mapping[n]._scale(d[n])
            });
            return d;
        })


        const axis = scales.filter(n => ('axis' in def.mapping[n]));
        axis.forEach(n => {
            const i = def.mapping[n].axis;
            const s = def.mapping[n]._scale;
            const a = this.inner.append("g")
                .attr("class", `axis-${n}`)
                .call(d3[`axis${du.capitalize(i.position)}`](s).ticks(i.ticks))
            if (i.position == 'bottom')
                 a.attr('transform', `translate(0, ${this.innerHeight})`)
            if (i.position == 'right')
                a.attr('transform', `translate(${this.innerWidth}, 0)`)
        });

        const legendsContainer = d3.select(this.$refs.legends);
        const legends = Object.keys(def.mapping).filter(n => ('legend' in def.mapping[n]))
        legends.forEach(n => {
            const i = def.mapping[n];
            const d = Object.keys(i.manual).map(d => ({
                key: d,
                props: i.manual[d]
            }))
            // const d = Object.values(def.mapping[n].manual)
            const e = legendsContainer.append("div")
                .attr("class", `legend legend-${n}`)
                .selectAll("div.entry")
                .data(d)
                .enter()
                .append("div")
                .attr("class", d => `entry entry-${d.key}`)

            const size = i.legend.size;
            const s = e.append("svg")
                .attr("height", size)
                .attr("width", size)

            // console.log(d)

            i.legend.elements.forEach(e => {
                s.append(e.type)
                    .each(function(a, b) {
                        // console.log([a, b])
                        // console.log(ju.fill(e.attrs, a.props))
                        pu.setAttrs.call(this, ju.fill(e.attrs, a.props))
                    })
            });
            e.append("span").text(d => d.props.label)
        });



        const dataGrouped = du.group(data, "nuts")
        def.plot.forEach(d => {
            const data = ju.getAttrs(dataGrouped, d.attrs, def.mapping.nuts);
            this[d.type](data);
        });
    },
    methods: {
        path(data) {
            this.inner.append("g")
                .attr("class", "paths")
                .selectAll("path")
                .data(data)
                .enter()
                .append("path")
                .each(function(d) {pu.setAttrs.call(this, d.attrs)})
                .attr("d", d => d3.line()
                    .x(e => e.x)
                    .y(e => e.y)
                    (d.values.map(e => ju.fill(d.attrs.d, e)))
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
                .selectAll(type)
                .data(d => d.values.map(e => ju.fill(d.attrs, e)))
                .enter()
                .append(type)
                .each(pu.setAttrs)
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
    }
}
</script>
