<template>
    <div class="vis" ref="vis" :style="{'--gen-vis-font-family': options.fontFamily}">
        <div class="vis-header">
            <div class="title">{{ options.title }}</div>
            <div class="subtitle">{{ options.subtitle }}</div>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :key="element.id" :element="element" :globals="globals" @changeSelected="formChanged"/>
        </div>
        <div ref="legends" class="vis-legends">
            <legend-entry v-for="legend in legends" :key="legend" :legend="legend" @changeSelected="changeSelected" @highlight="highlight"/>
        </div>
        <div v-if="initialized" class="vis-body">
            <!-- the facets are rendered again if their data changes -->
            <template v-if="facets.entries.length > 0">
                <div v-for="e in facets.entries" :key="e.key" :style="`width: ${facets.width}px; display: inline-block;`">
                    <div class="facet-title" :style="`margin-left: ${facets.margins.left}px`">{{ e.name }}</div>
                    <facet :key="e.data" :data="e.data" :shared="facets.shared" :height='facets.height' :width='facets.width' :margins='facets.margins'/>
                </div>
            </template>
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
    // the user changed the state, see store.state
    emits: ['stateChanged'],
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
    components: {
        Facet, LegendEntry, FormElement,
    },
    watch: {
        // the state was set from outside
        'store.stateSets'() {
            this.dataInit();
            this.scales();
        },
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

            // the visible categories
            this.filter = this.store.mappingNamesWithKey('props').map(c => ({
                dim: c,
                key: Object.keys(this.store.mapping(c).props).filter(k => this.store.mapping(c).props[k].visible)
            }));

            this.data = markRaw(du.filter(this.store.data, this.filter));

            // stacked in the order of the categories, not of the rows
            if (axis.v && this.store.mapping(axis.v).stacked) {
                const order = du.categoryOrder(this.filter.map(f => ({ dim: f.dim, keys: f.key })));
                du.addStackedData(this.data, axis, def.facets ? [def.facets.dim] : [], order);
            }

            if (def.facets) {
                this.facets.margins = this.options.margins;
                this.facets.height = this.options.height;

                const cols = ju.entryToValue(def.facets.cols, {
                    totalWidth: this.options.width
                });

                this.facets.width = this.options.width/cols;

                // in the order of the categories, not of the rows
                const d = def.facets.dim;
                const keys = Object.keys(this.store.mapping(d).props);
                const dataGroupedByFacets = du.groupBy(this.data, [d]);

                this.facets.entries = dataGroupedByFacets
                    .filter(e => keys.includes(e.group[d]))
                    .sort((a, b) => keys.indexOf(a.group[d]) - keys.indexOf(b.group[d]))
                    .map(e => ({
                        key: e.group[d],
                        name: this.store.mapping(d).props[e.group[d]].name,
                        data: markRaw(e.entries),
                    }))
            }
        },
        scales() {
            const def = this.store.def;
            const coord = this.store.coord;
            if (def.facets && def.facets.scales) {
                const scales = ju.entryToValue(def.facets.scales, def.globals);
                const infos = scales.map(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n),
                    };
                    du.addDimInfo(info, this.data);
                    pu.addScale(info, coord.dims(
                        this.facets.width - (this.facets.margins.left + this.facets.margins.right),
                        this.facets.height - (this.facets.margins.top + this.facets.margins.bottom),
                    ), coord.ranges);

                    return info;
                });

                du.addScaledData(this.data, infos);
                this.facets.shared = Object.fromEntries(infos.map(e => [e.dim, e]));
            }

            this.initialized = true;
        },
        changeSelected() {
            this.dataInit();
            this.scales();
            this.$emit('stateChanged');
        },
        formChanged() {
            this.store.applyFormElements();
            this.changeSelected();
        },
        highlight(info) {
            pu.highlightElements(d3.select(this.$refs.vis), this.store.def.plot, {[info.dim]: info.key})
        }
    }
}
</script>


<style lang="scss" scoped>
    // the font can be set with options.fontFamily or the css variable
    .vis {
        :deep(text), :deep(span), :deep(div) {
            font-family: var(--gen-vis-font-family, Century Gothic, sans-serif);
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
