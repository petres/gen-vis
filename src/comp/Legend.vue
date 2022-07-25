<template>
    <div ref="legend" class="legend"></div>
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
        // const n = this.legend;

        const i = store.mapping(this.legend);
        const d = Object.keys(i.props).map(d => ({
            key: d,
            props: i.props[d]
        }))
        // const d = Object.values(def.mapping[n].manual)
        const legendElement = d3.select(this.$refs.legend)
            .attr("data-dim", this.legend)

        legendElement.append("div")
            .attr("class", `title`)
            .text(i.name)

        const e = legendElement.append("div")
            .attr("class", `entries`)
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
        e.append("span").text(d => d.props.name ? d.props.name : d.key)

        const self = this;
        e.on('click', function(ev, d) {
            const e = d3.select(this);
            const visible = (e.attr('data-visible') === 'true');
            const dim = self.legend;
            const key = d.key;

            self.$emit('changeSelected', {
                dim: dim, key: key, selected: !visible
            })
            // console.log(`legend click ${dim} -> ${key}`)

            d3.select(self.$refs.legend.closest('.vis'))
                .selectAll(`svg.facet g.group[data-group-${dim}="${key}"], .vis svg.facet path[data-group-${dim}="${key}"]`)
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


<style lang="scss" scoped>
    .legend {
        :deep(.title) {
            font-weight: bold;
            font-size: 13px;
            margin: 3px;
            // display: inline-block;
            // top: -4px;
            position: relative;
            // margin-right: 20px;
        }
        :deep(.entries) {
            // display: inline-block;
            .entry {
                cursor: pointer;
                display: inline-block;
                margin: 0px 5px;

                svg {
                    display: inline-block;
                    margin-right: 5px;
                    // border: 1px solid #BBB;
                    // border-radius: 3px;
                }

                &[data-visible="false"] {
                    opacity: 0.3;
                }

                span {
                    top: -4px;
                    display: inline-block;
                    position: relative;
                    font-size: 13px;
                }
            }
        }
    }
</style>
