<template>
    <div class="vis" ref="vis">
        <div class="vis-header">
            <div class="title">{{ options.title }}</div>
            <div class="subtitle">{{ options.subtitle }}</div>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :element="element" :globals="this.globals" @changeSelected="changeSelected"/>
        </div>
        <div ref="legends" class="vis-legends">
            <legend-entry v-for="legend in legends" :legend="legend" @changeSelected="changeSelected"/>
        </div>
        <div v-if="initialized" class="vis-body">
            <div v-if="facets.entries.length > 0" v-for="e in facets.entries" :style="`width: ${facets.width}px; display: inline-block;`">
                <div class="facet-title" :style="`margin-left: ${facets.margins.left}px`">{{ e.filter.name }}</div>
                <facet :key="e.data" :data="e.data" :shared="facets.shared" :height='facets.height' :width='facets.width' :margins='facets.margins'/>
            </div>
            <facet v-else :key="data" :data="data" :shared="{}" :height='options.height' :width='options.width' :margins='options.margins'/>
        </div>
        <div class="vis-footer">
            <span v-html="options.footer"/>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";

import * as du from "@/utils/data.js";
import * as pu from "@/utils/plot.js";
import * as ju from "@/utils/json.js";

import Facet from '@/comp/Facet.vue';
import LegendEntry from '@/comp/Legend.vue';
import FormElement from '@/comp/FormElement.vue';


export default {
    data: () => ({
        initialized: false,

        options: {},
        globals: {},

        legends: [],
        formElements: [],
        filter: [],
        data: [],

        facets: {
            shared: {},
            entries: [],
            height: 0,
            width: 0,
            margins: {top: 0, right: 0, bottom: 0, left: 0},
        },

        data: null,
    }),
    computed: {
        innerWidth() { return this.options.width - (this.options.margins.left + this.options.margins.right) },
        innerHeight() { return this.options.height - (this.options.margins.top + this.options.margins.bottom) },
    },
    components: {
        Facet, LegendEntry, FormElement,
    },
    created() {
        window.addEventListener("resize", this.resized);
    },
    mounted() {
        this.baseInit();
        this.dataInit();
        this.scales();
    },
    destroyed() {
        window.removeEventListener("resize", this.resized);
    },
    methods: {
        baseInit() {
            this.store = baseStore();

            this.legends = this.store.mappingNamesWithKey('legend')
            this.formElements = this.store.def.formElements;
            this.globals = this.store.def.globals;

            this.options = Object.assign({}, this.store.def.options);

            if (!this.options.width) {
                this.options.width = this.$refs.vis.getBoundingClientRect().width
            }

            this.options.height = ju.entryToValue(this.options.height, {
                totalWidth: this.options.width
            }, true, true);
        },
        resized() {
            if (!this.store.def.options.width) {
                this.options.width = this.$refs.vis.getBoundingClientRect().width
                this.options.height = ju.entryToValue(this.store.def.options.height, {
                    totalWidth: this.options.width
                }, true, true);
                this.dataInit();
                this.scales();
            }

        },
        dataInit() {
            const def = this.store.def;
            const axis = this.store.axis;

            // console.log(axis);

            // filter
            this.filter = this.store.mappingNamesWithKey('props').map(c => ({
                dim: c,
                key: Object.keys(this.store.mapping(c).props).filter(k => this.store.mapping(c).props[k].visible)
            }));

            this.data = du.filter(this.store.data, this.filter)
            // console.log(this.store.data)
            // console.log(this.filter)
            // console.log(this.data)

            // stacked
            // axis.v.forEach(a => {
            //     if (this.store.mapping(a).stacked)
            //         du.addStackedData(this.data, axis, def.facets ? def.facets.dim : []);
            // });
            if (this.store.mapping(axis.v).stacked)
                du.addStackedData(this.data, axis, def.facets ? def.facets.dim : []);


            // console.log(JSON.stringify(this.data))


            if (def.facets) {
                this.facets.margins = this.options.margins;
                this.facets.height = this.options.height;

                const cols = ju.entryToValue(def.facets.cols, {
                    totalWidth: this.options.width
                }, true, true);

                this.facets.width = this.options.width/cols;

                // dims
                const d = def.facets.dim;
                const dataGroupedByFacets = du.groupBy(this.data, [d]);

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
        },
        scales() {
            const def = this.store.def;
            if (def.facets && def.facets.scales) {
                const scales = ju.entryToValue(def.facets.scales, def.globals, true, true);
                // if (scales) {
                    const infos = scales.map(n => {
                        const m = this.store.mapping(n);
                        const info = {
                            dim: n,
                            mapping: m,
                        };
                        du.addDimInfo(info, this.data);
                        pu.addScale(info, {
                            "width": this.facets.width - (this.facets.margins.left + this.facets.margins.right),
                            "height": this.facets.height - (this.facets.margins.top + this.facets.margins.bottom),
                        });

                        return info;
                    });
                
                    du.addScaledData(this.data, infos);
                    this.facets.shared = Object.fromEntries(infos.map(e => [e.dim, e]));
                // }
            }

            this.initialized = true;
        },
        changeSelected(info) {
            this.dataInit();
            this.scales();
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
