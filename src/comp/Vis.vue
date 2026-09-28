<template>
    <div class="vis" ref="vis">
        <div class="vis-header">
            <div class="title">{{ options.title }}</div>
            <div class="subtitle">{{ options.subtitle }}</div>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :element="element" :globals="globals" @changeSelected="formChanged"/>
        </div>
        <div ref="legends" class="vis-legends">
            <legend-entry v-for="legend in legends" :legend="legend" @changeSelected="changeSelected" @highlight="highlight"/>
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
import { markRaw } from 'vue';
import * as d3 from "d3";

import * as du from "@/utils/data.js";
import * as pu from "@/utils/plot.js";
import * as ju from "@/utils/json.js";

import Facet from '@/comp/Facet.vue';
import LegendEntry from '@/comp/Legend.vue';
import FormElement from '@/comp/FormElement.vue';


export default {
    inject: ['store'],
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
    }),
    computed: {
        innerWidth() { return this.options.width - (this.options.margins.left + this.options.margins.right) },
        innerHeight() { return this.options.height - (this.options.margins.top + this.options.margins.bottom) },
    },
    components: {
        Facet, LegendEntry, FormElement,
    },
    mounted() {
        this.baseInit();
        this.dataInit();
        this.scales();

        // without a fixed width the visualisation fills its container
        if (!this.store.def.options.width) {
            this.resizeObserver = new ResizeObserver(() => {
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(this.resized, 100);
            });
            this.resizeObserver.observe(this.$refs.vis);
        }
    },
    unmounted() {
        this.resizeObserver?.disconnect();
        clearTimeout(this.resizeTimeout);
    },
    methods: {
        baseInit() {
            this.legends = this.store.mappingNamesWithKey('legend')
            this.formElements = this.store.def.formElements;
            this.globals = this.store.def.globals;

            this.options = Object.assign({}, this.store.def.options);
            this.measure();
        },
        measure() {
            const options = this.store.def.options;
            this.options.width = options.width || this.$refs.vis.getBoundingClientRect().width;
            this.options.height = ju.entryToValue(options.height, {
                totalWidth: this.options.width
            });
        },
        resized() {
            const width = this.$refs.vis?.getBoundingClientRect().width;
            if (!width || width == this.options.width)
                return;
            this.measure();
            this.dataInit();
            this.scales();
        },
        dataInit() {
            const def = this.store.def;
            const axis = this.store.axis;

            // filter
            this.filter = this.store.mappingNamesWithKey('props').map(c => ({
                dim: c,
                key: Object.keys(this.store.mapping(c).props).filter(k => this.store.mapping(c).props[k].visible)
            }));

            this.data = markRaw(du.filter(this.store.data, this.filter));

            // stacked
            if (axis.v && this.store.mapping(axis.v).stacked)
                du.addStackedData(this.data, axis, def.facets ? def.facets.dim : []);

            if (def.facets) {
                this.facets.margins = this.options.margins;
                this.facets.height = this.options.height;

                const cols = ju.entryToValue(def.facets.cols, {
                    totalWidth: this.options.width
                });

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
                        data: markRaw(e.entries)
                    }))
            }
        },
        scales() {
            const def = this.store.def;
            if (def.facets && def.facets.scales) {
                const scales = ju.entryToValue(def.facets.scales, def.globals);
                const infos = scales.map(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n),
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
            }

            this.initialized = true;
        },
        changeSelected(info) {
            this.dataInit();
            this.scales();
        },
        formChanged(info) {
            this.store.applyFormElements();
            this.changeSelected(info);
        },
        highlight(info) {
            pu.highlightElements(d3.select(this.$refs.vis), this.store.def.plot, {[info.dim]: info.key})
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
