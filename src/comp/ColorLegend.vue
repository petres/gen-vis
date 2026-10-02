<template>
    <div class="legend color-legend" :data-dim="legend">
        <div class="title">{{ store.mapping(legend).name }}</div>
        <svg ref="svg" :width="width + 2*padding" height="34"/>
    </div>
</template>

<script>
import * as d3 from "d3";
import * as du from "@/utils/data";
import * as pu from "@/utils/plot";

// the gradients of the legends of a page have their own ids
let count = 0;

// the colors of a scale without orientation, a gradient of a continuous scale,
// the classes of a threshold, quantize or quantile scale, the scale is the one
// of all facets
export default {
    props: ["legend", "data"],
    inject: ['store'],
    data: () => ({ width: 240, padding: 16 }),
    created() {
        this.uid = `gen-vis-gradient-${count++}`;
    },
    mounted() {
        this.render();
    },
    watch: {
        data: 'render',
    },
    methods: {
        render() {
            const m = this.store.mapping(this.legend);
            const info = { dim: this.legend, mapping: m };
            du.addDimInfo(info, this.data);
            pu.addScale(info, {}, this.store.coord);
            const s = info.scale;

            const svg = d3.select(this.$refs.svg);
            svg.selectAll("*").remove();
            const g = svg.append("g").attr("transform", `translate(${this.padding}, 2)`);
            const label = (x, v, format) => {
                g.append("line").attr("x1", x).attr("x2", x).attr("y1", 10).attr("y2", 14).attr("stroke", "currentColor");
                g.append("text").attr("x", x).attr("y", 26).attr("text-anchor", "middle").attr("fill", "currentColor").text(format(v));
            };
            // the format of the legend or the hover, by default the one of the ticks of an axis
            const given = m.legend.format ?? m.hover?.format;
            const formatOf = values => given
                ? this.store.formatter(m.scale.type)(given)
                : this.store.locale.tickFormat(d3.scaleLinear(d3.extent(values)), 'linear', 4);

            if (s.invertExtent) {
                // a box per class, the limits between them
                const colors = s.range();
                const w = this.width/colors.length;
                g.selectAll("rect").data(colors).join("rect")
                    .attr("x", (c, i) => i*w).attr("width", w).attr("height", 10).attr("fill", c => c);
                const limits = colors.slice(1).map(c => s.invertExtent(c)[0]);
                const format = formatOf(limits);
                limits.forEach((v, i) => label((i + 1)*w, v, format));
            } else {
                const domain = s.domain();
                const x = d3.scaleLinear([domain[0], domain.at(-1)], [0, this.width]);
                const gradient = svg.append("defs").append("linearGradient").attr("id", this.uid);
                d3.range(11).forEach(i => gradient.append("stop")
                    .attr("offset", `${i*10}%`)
                    .attr("stop-color", s(x.invert(i*this.width/10))));
                g.append("rect").attr("width", this.width).attr("height", 10).attr("fill", `url(#${this.uid})`);
                const ticks = x.ticks(4);
                const format = formatOf(ticks);
                ticks.forEach(v => label(x(v), v, format));
            }
        },
    },
};
</script>

<style lang="scss" scoped>
    .color-legend {
        display: inline-block;
        vertical-align: top;
        .title {
            font-weight: bold;
            font-size: 13px;
            margin: 3px;
        }
        svg {
            display: block;
            font-size: 11px;
        }
    }
</style>
