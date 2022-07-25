<template>
    <div class="vis" ref="vis">
        <div class="vis-header">
            <div class="title">{{ title }}</div>
            <div class="subtitle">{{ subtitle }}</div>
        </div>
        <div ref="legends" class="vis-legends">
            <legend-entry v-for="legend in legends" :legend="legend" @changeSelectedLegend="changeSelected"/>
        </div>
        <div v-if="initialized" class="vis-body">
            <div v-if="facets.entries.length > 0" v-for="e in facets.entries" :style="`width: ${facets.width}px; display: inline-block;`">
                <div class="facet-title" :style="`margin-left: ${facets.margins.left}px`">{{ e.filter.name }}</div>
                <facet :data="e.data" :shared="facets.shared" :height='facets.height' :width='facets.width' :margins='facets.margins'/>
            </div>
            <facet v-else :filter="[]" :data="this.data" :shared="{}" :height='height' :width='width' :margins='margins'/>
        </div>
        <div class="vis-footer">
            <span v-html="footer"/>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as du from "@/utils/data.js";
import * as pu from "@/utils/plot.js";
import Facet from '@/comp/Facet.vue';
import LegendEntry from '@/comp/Legend.vue';


export default {
    data: () => ({
        initialized: false,

        margins: {top: 0, right: 0, bottom: 0, left: 0},
        width: 0,
        height: 0,

        title: "",
        subtitle: "",
        footer: "",

        legends: [],

        selected: {},

        facets: {
            shared: {},
            entries: [],
            height: 0,
            width: 0,
            margins: {top: 0, right: 0, bottom: 0, left: 0},
        },

        data: null,
        def: null,
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
        Facet, LegendEntry
    },
    mounted() {
        this.store = baseStore();

        this.legends = this.store.mappingNamesWithKey('legend')

        this.title = this.store.def.options.title;
        this.subtitle = this.store.def.options.subtitle;
        this.footer = this.store.def.options.footer;

        this.margins = this.store.def.options.margins;
        this.height = this.store.def.options.height;

        if (this.store.def.options.width) {
            this.width = this.store.def.options.width;
        } else {
            this.width = this.$refs.vis.getBoundingClientRect().width
            // console.log(this.width)
        }

        this.plot();
    },
    methods: {
        plot() {
            const def = this.store.def;
            const axis = {
                x: 'x',
                y: 'y'
            };

            // stacked
            du.addStackedData(this.store.data, axis, def.facets ? def.facets.dim : []);

            
            if (def.facets) {
                this.facets.margins = this.margins;
                this.facets.height = this.height;
                this.facets.width = this.width/def.facets.cols;

                // dims
                const d = def.facets.dim;
                const dataGroupedByFacets = du.groupBy(this.store.data, [d]);

                this.facets.entries = dataGroupedByFacets
                    .filter(e => Object.keys(this.store.mapping(d).props).includes(e.group[d]))
                    .map(e => ({
                        filter: {
                            dim: e.group[d],
                            key: d,
                            name: this.store.mapping(d).props[e.group[d]].name
                        },
                        data: e.entries
                    }))

            }



            // scales
            if (def.facets && def.facets.scales) {
                const infos = def.facets.scales.map(n => {
                    const m = store.mapping(n);
                    const info = {
                        dim: n,
                        mapping: m,
                    };
                    du.addDimInfo(info, this.store.data);
                    pu.addScale(info, this.constants);

                    return info;
                });
                du.addScaledData(this.store.data, infos);
                this.facets.shared = Object.fromEntries(infos.map(e => [e.dim, e]));
            }

            this.initialized = true;
        },
        changeSelected(info) {
            d3.select(this.$refs.vis)
                .selectAll(`svg.facet g.group[data-group-${info.dim}="${info.key}"], .vis svg.facet path[data-group-${info.dim}="${info.key}"]`)
                .attr(`data-visible-${info.dim}`, info.selected)
                .each(function() {
                    const show = this.getAttributeNames()
                        .filter(name => name.startsWith('data-visible-'))
                        .map(dv => this.getAttribute(dv) === "true").reduce((s, v) => s && v, true)
                    this.setAttribute('data-visible', show);
                })
        }
    }
}
</script>


<style lang="scss" scoped>
    .vis {
        :deep(text), :deep(span), :deep(div) {
            font-family: Century Gothic, sans-serif;
        }
    }

    .vis-header {
        .title {
            font-size: 22px;
            font-weight: bold;
        }

        .subtitle {
            font-size: 13px;
            margin-top: 3px;
            // font-weight: bold;
        }
        margin-bottom: 10px;
    }

    .vis-footer {
        span {
            font-size: 13px;
        }
    }

    .facet-title {
        font-size: 13px;
        font-weight: bold;
        margin-top: 8px;
    }
</style>
