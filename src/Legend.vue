<template>
    <div ref="legend"></div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";


export default {
    props: ["legend"],
    mounted() {
        const store = baseStore();
        const def = store.def;
        const n = this.legend;

        const i = def.mapping[n];
        const d = Object.keys(i.manual).map(d => ({
            key: d,
            props: i.manual[d]
        }))
        // const d = Object.values(def.mapping[n].manual)
        const e = d3.select(this.$refs.legend)
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

        i.legend.elements.forEach(e => {
            s.append(e.type)
                .each(function(a, b) {
                    // console.log([a, b])
                    // console.log(ju.fill(e.attrs, a.props))
                    pu.setAttrs.call(this, ju.fill(e.attrs, a.props))
                })
        });
        e.append("span").text(d => d.props.label)

        e.on('click', (e, d) => {
            console.log(`legend click ${n} -> ${d.key}`)
        })
    }
}
</script>
