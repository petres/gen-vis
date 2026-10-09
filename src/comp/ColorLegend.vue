<template>
    <div class="legend color-legend" :data-dim="legend">
        <div class="title">{{ store.mapping(legend).name }}</div>
        <div class="scale">
            <svg ref="svg" :width="width + 2*padding" height="34"/>
            <!-- the regions without a value, e.g. the color of geo:base -->
            <div v-if="missing" class="missing">
                <span class="swatch" :style="{ background: missing.color ?? '#EEE' }"/>
                <span v-html="missing.name"/>
            </div>
        </div>
    </div>
</template>

<script>
import * as d3 from "@/utils/d3";
import { addDimInfo } from "@/utils/data";
import { addScale } from "@/utils/scales";

// the gradients of the legends of a page have their own ids
let count = 0;

// a scale of colors whose positions are linear in the values, e.g. not a sqrt,
// log or a diverging one with a middle which is not in the center
const isLinear = s => {
    const d = s.domain();
    const t = s.copy().interpolator(t => t);
    return d.length == 2 && Math.abs(t((d[0] + d[1])/2) - 0.5) < 1e-9;
};

// ticks of 1, 2 and 5 (and 0) of the decades of the domain with at least
// `space` pixels between them, e.g. 0, 2%, 10%, 20%, 50%, 100% of a sqrt scale,
// as ticks of a linear scale crowd at one end, the middle of a diverging domain
// and 0 first, then the powers of 10, the 5s and the 2s
const spacedTicks = (domain, position, space) => {
    const [lo, hi] = d3.extent(domain);
    const top = Math.ceil(Math.log10(Math.max(Math.abs(lo), Math.abs(hi)) || 1));
    const decades = d3.range(top, top - 7, -1);
    const steps = [1, 5, 2].flatMap(m => decades.map(e => +(m*10**e).toPrecision(12))).flatMap(v => [v, -v]);
    const ticks = [];
    [...(domain.length == 3 ? [domain[1]] : []), 0, ...steps]
        .filter(v => v >= lo && v <= hi && Number.isFinite(position(v)))
        .forEach(v => {
            if (ticks.every(t => Math.abs(position(v) - position(t)) >= space))
                ticks.push(v);
        });
    return ticks.sort((a, b) => position(a) - position(b));
};

// the digits of the smallest tick, e.g. 0,02 and 0,1, without trailing zeros
const fixedFormat = (locale, ticks) => {
    const small = d3.min(ticks.filter(v => v != 0).map(Math.abs));
    return locale.number.format(`,.${small ? d3.precisionFixed(small) : 0}~f`);
};

// the colors of a scale without orientation, a gradient of a continuous scale,
// the classes of a threshold, quantize or quantile scale, the scale is the one
// of all facets
export default {
    props: ["legend", "data"],
    inject: ['store'],
    data: () => ({ width: 240, padding: 16 }),
    computed: {
        missing() { return this.store.mapping(this.legend).legend?.missing },
    },
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
            addDimInfo(info, this.data);
            addScale(info, {}, this.store.coord);
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
            } else if (s.interpolator) {
                // sequential and diverging scales: the gradient and the ticks at
                // the positions of the colors, e.g. of a sqrt or a log scale, the
                // middle of a diverging domain is in the middle
                const position = s.copy().interpolator(t => t*this.width);
                const gradient = svg.append("defs").append("linearGradient").attr("id", this.uid);
                d3.range(11).forEach(i => gradient.append("stop")
                    .attr("offset", `${i*10}%`)
                    .attr("stop-color", s.interpolator()(i/10)));
                g.append("rect").attr("width", this.width).attr("height", 10).attr("fill", `url(#${this.uid})`);
                const domain = s.domain();
                const ticks = isLinear(s) ? d3.ticks(domain[0], domain.at(-1), 4) : spacedTicks(domain, position, 30);
                const format = given || isLinear(s) ? formatOf(ticks) : fixedFormat(this.store.locale, ticks);
                ticks.forEach(v => label(position(v), v, format));
            } else {
                // e.g. a linear scale with a range of colors
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
        .scale {
            display: flex;
            align-items: flex-start;
        }
        svg {
            display: block;
            font-size: 11px;
        }
        .missing {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            .swatch {
                width: 10px;
                height: 10px;
                margin-top: 2px;
            }
        }
    }
</style>
