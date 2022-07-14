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
        const d = Object.keys(i.props.manual).map(d => ({
            key: d,
            props: ju.merged(i.props, d)
        }))
        // const d = Object.values(def.mapping[n].manual)
        const e = d3.select(this.$refs.legend)
        .attr("class", `legend`)
            .attr("data-dim", n)
            .selectAll("div.entry")
            .data(d)
            .enter()
            .append("div")
            .attr("class", d => `entry`)
            .attr("data-visible", d => d.props.visible)
            .attr("data-key", d => d.key)

        const size = i.legend.size;
        const s = e.append("svg")
            .attr("height", size)
            .attr("width", size)

        i.legend.elements.forEach(e => {
            s.append(e.type)
                .each(function(a, b) {
                    // console.log([a, b])
                    // console.log(ju.fill(e.props, a.props))
                    pu.setProps.call(this, ju.fill(e.props, a.props))
                })
        });
        e.append("span").text(d => d.props.label ? d.props.label : d.key)

        e.on('click', function(ev, d) {
            const e = d3.select(this);
            const visible = (e.attr('data-visible') === 'true');
            const dim = n;
            const key = d.key;
            // console.log(`legend click ${dim} -> ${key}`)

            d3.selectAll(`.vis svg.facet g.group[data-group-${dim}="${key}"], .vis svg.facet path[data-group-${dim}="${key}"]`)
                .attr(`data-visible-${dim}`, !visible)
                .each(function() {
                    const show = this.getAttributeNames()
                        .filter(name => name.startsWith('data-visible-'))
                        .map(dv => this.getAttribute(dv) === "true").reduce((s, v) => s && v, true)
                    this.setAttribute('data-visible', show);
                })

            e.attr('data-visible', !visible);

        })
    }
}
</script>
