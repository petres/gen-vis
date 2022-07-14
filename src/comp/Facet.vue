<template>
    <div v-if="show">
        {{ f }}
        <div :style="`width: ${width}px`">
            <svg ref="svg" :width="width" :height="height" class="facet">
                <g ref="inner" :transform="`translate(${this.margins.left} ${this.margins.top})`"/>
            </svg>
        </div>
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
    props: {
        f: {
            default: null,
        }
    },
    data: () => ({
        margins: {top: 0, right: 0, bottom: 0, left: 0},
        width: 0,
        height: 0,
        show: false
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

        this.height = this.store.def.options.height;
        this.width = this.store.def.options.width;

        this.margins = this.store.def.options.margins;

        this.show = true;
    },
    mounted() {
        let data = this.store.data;
        let def = this.store.def;

        this.inner = d3.select(this.$refs.inner);

        const scales = Object.keys(def.mapping).filter(n => ('scale' in def.mapping[n]))
        scales.forEach(n => {
            def.mapping[n]._values = data.map(d => d[n]);
            def.mapping[n]._extent = d3.extent(def.mapping[n]._values);
            def.mapping[n]._scale = pu.scale(def.mapping[n].scale, def.mapping[n]._extent, this.constants);
        });

        data = data.map(d => {
            scales.forEach(n => {
                d[`${n}:scaled`] = def.mapping[n]._scale(d[n])
            });
            return d;
        })

        const axis = scales.filter(n => ('axis' in def.mapping[n]));
        axis.forEach(n => {
            const m = def.mapping[n];
            const i = m.axis;
            const s = m._scale;
            const a = d3[`axis${eu.capitalize(i.position)}`](s).ticks(i.ticks);

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


        });

        def.plot.forEach(d => {
            const dataGrouped = du.groupBy(data, d.categories);
            const dataGroupedProps = ju.getProps(dataGrouped, d.props, def.mapping);
            this[d.type](dataGroupedProps);
        });

        const xa = def.mapping.x;

        this.inner.append("rect")
            .attr("class", "events")
            .attr("width", this.innerWidth)
            .attr("height", this.innerHeight)
            .attr("opacity", 0)
            .on("mousemove", function(e) {
                const c = d3.pointer(e);
                const i = d3.bisectCenter(xa._values, xa._scale.invert(c[0]))
                console.log(xa._values[i])

            })
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
    }
}
</script>
