<template>
    <div class="hover" ref="hover">
        <div class="title"/>
        <table class="entries"/>
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
    props: [],
    data: () => ({
    }),
    computed: {
    },
    components: {
    },
    created() {
    },
    mounted() {
    },
    methods: {
        
        hover() {
            const self = this;

            let axis = [
                { axis: 'x', name: 'x' },
                { axis: 'y', name: 'y' },
            ];
            // console.log(this.def)
            axis.forEach(a => {
                const m = this.def.mapping[a.name];
                const i = m.hover;
                let format = 'c';
                if (i && i.format) {
                    format = i.format;
                }

                if (m.scale.type == "time")
                    a.formatter = eu.localeTime.format(format);
                else
                    a.formatter = eu.locale.format(format);
            });

            axis = Object.fromEntries(axis.map(a => [a.axis, a]))

            const categories = this.store.mappingNamesWithKey('hover').filter(e => !Object.keys(axis).includes(e));

            const hover = this.inner.append("g")
                .attr("class", "hover")
                .attr("visibility", "hidden")

            const hoverLine = hover
                .append("line");

            const hoverDiv = d3.select(this.$refs.hover)
                .style("visibility", "hidden");

            this.inner.append("rect")
                .attr("class", "events")
                .attr("width", this.innerWidth)
                .attr("height", this.innerHeight)
                .attr("opacity", 0)
                .on("mousemove", function(e) {
                    const c = d3.pointer(e);
                    const i = self.info[axis['x'].name];
                    // console.log(self.info)
                    const xii = d3.bisectCenter(i.values, i.scale.invert(c[0]))
                    const x = i.values[xii];
                    const xs = i.scale(x);
                    hoverLine.attr("x1", xs)
                    hoverLine.attr("x2", xs)
                    hoverLine.attr("y1", 0)
                    hoverLine.attr("y2", self.innerHeight)
                    //
                    hoverDiv.select('div.title')
                        .text(axis['x'].formatter(x))

                    let tt = du.filter(self.data, [{dim: axis['x'].name, key: x}]).sort((a, b) => b[axis['y'].name] - a[axis['y'].name]);
                    // console.log(tt)

                    if (xs >= self.innerWidth/2) {
                        hoverDiv.style("left", `${xs + self.margins.left - 20}px`)
                        hoverDiv.style("transform", `translate(-100%, -50%)`)
                    } else {
                        hoverDiv.style("left", `${xs + self.margins.left + 20}px`)
                        hoverDiv.style("transform", `translate(0, -50%)`)
                    }

                    let entries = hoverDiv.select('table.entries').selectAll('tr.entry')
                        .data(tt)
                        .join('tr')
                        .attr('class', "entry")


                    entries.selectAll("td.value")
                        .data(d => [d])
                        .join("td")
                        .attr('class', "value")
                        .text(d => axis['y'].formatter(d[axis['y'].name]))


                    categories.forEach(n => {
                        entries.selectAll(`td.${n}`)
                            .data(d => [d])
                            .join("td")
                            .attr('class', n)
                            .text(d => self.store.prop(n, d[n]).name)
                    });


                })
                .on("mouseout", function(e) {
                    hover.attr("visibility", "hidden")
                    hoverDiv.style("visibility", "hidden")
                })
                .on("mouseenter", function(e) {
                    hover.attr("visibility", "visible")
                    hoverDiv.style("visibility", "visible")

                })
        }
    }
}
</script>


<style lang="scss" scoped>
    .vis-inner {
        position: relative;
        display: inline-block;
        .debug {
            font-size: 12px;
        }
        :deep(svg) {
            g.axis-x g.tick line {transform: translate(0px, -4px);}
            g.axis-y g.tick line {transform: translate(5px, 0px);}
            g.tick {
                text {
                    font-size: 13px;
                }
            }
            .axis-title {
                font-size: 13px;
            }

            g.group, path {
                &[data-visible="false"] {
                    opacity: 0.01;
                }
            }

            g.grid {
                stroke: #CCC;
                stroke-width: 0.75px;
            }
            g.hover {
                line {
                    stroke: #999;
                }
            }
        }
        :deep(div.hover) {
            position: absolute;
            font-size: 13px;

            .title {
                font-weight: bold;
                padding: 1px 3px;
                border-bottom: 2px solid #000;
                text-align: center;
            }
            background-color: #FFFFFFAA;
            top: 40%;

            // margin: 20px;

            table {
                border-collapse: collapse;
                td {
                    text-align: left;
                    padding: 1px 3px;
                    &.value {
                        text-align: right;
                    }
                }
                margin-left: auto;
                margin-right: auto;
            }
            pointer-events:none;

        }
    }




</style>
