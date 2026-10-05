<template>
    <div class="vis" ref="vis" :style="{'--gen-vis-font-family': options.fontFamily}">
        <div class="vis-header">
            <slot-content v-if="slots.header" :fn="slots.header" :props="{ title: options.title, subtitle: options.subtitle }"/>
            <template v-else>
                <div class="title">{{ options.title }}</div>
                <div class="subtitle">{{ options.subtitle }}</div>
            </template>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :key="element.id" :element="element" :globals="globals" @changeSelected="formChanged"/>
        </div>
        <div ref="legends" class="vis-legends">
            <!-- toggles of categories, the colors of a scale otherwise -->
            <template v-for="legend in legends" :key="legend">
                <legend-entry v-if="store.mapping(legend).props" :legend="legend" @changeSelected="changeSelected" @highlight="highlight"/>
                <color-legend v-else-if="store.mapping(legend).scale" :legend="legend" :data="data"/>
            </template>
        </div>
        <div v-if="initialized" class="vis-body">
            <!-- the facets are rendered again if their data changes -->
            <template v-if="facets.entries.length > 0">
                <div v-for="e in facets.entries" :key="e.key" :style="`width: ${facets.width}px; display: inline-block;`">
                    <div class="facet-title" :style="`margin-left: ${facets.margins.left}px`">{{ e.name }}</div>
                    <facet :key="e.data" :data="e.data" :facet-key="e.key" :shared="facets.shared" :height='facets.height' :width='facets.width' :margins='facets.margins'/>
                </div>
            </template>
            <facet v-else :key="data" :data="data" :shared="{}" :height='options.height' :width='options.width' :margins='options.margins'/>
        </div>
        <div class="vis-footer">
            <slot-content v-if="slots.footer" :fn="slots.footer" :props="{ footer: options.footer }"/>
            <span v-else v-html="options.footer"/>
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
import ColorLegend from '@/comp/ColorLegend.vue';
import SlotContent from '@/comp/SlotContent.vue';
import FormElement from '@/comp/FormElement.vue';


export default {
    inject: ['store', 'slots'],
    // the user changed the state, see store.state
    emits: ['stateChanged'],
    // the options of the definition already in the first render, e.g. of the header slot
    data() { return {
        initialized: false,

        options: { ...this.store.def.options },
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
    } },
    components: {
        Facet, LegendEntry, ColorLegend, FormElement, SlotContent,
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
            this.store.totalWidth = this.options.width;
            this.options.height = ju.entryToValue(options.height, this.store.bases);
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

            // the rows of the values of `filter`, e.g. of a global of a form element,
            // they are compared as the values of the rows, e.g. dates as timestamps
            const values = Object.entries(def.filter ?? {}).map(([dim, v]) => ({
                dim,
                key: [ju.entryToValue(v, this.store.bases)].flat().map(k => du.convert(this.store.mapping(dim), k)),
            }));

            this.data = markRaw(du.filter(this.store.data, [...this.filter, ...values]));

            // stacked in the order of the categories, not of the rows
            if (axis.v && this.store.mapping(axis.v).stacked) {
                const order = du.categoryOrder(this.filter.map(f => ({ dim: f.dim, keys: f.key })));
                du.addStackedData(this.data, axis, def.facets ? [def.facets.dim] : [], order);
            }

            if (def.facets) {
                this.facets.margins = this.options.margins;
                this.facets.height = this.options.height;

                const cols = ju.entryToValue(def.facets.cols, this.store.bases);

                this.facets.width = this.options.width/cols;

                // in the order of the categories, not of the rows
                const d = def.facets.dim;
                const keys = Object.keys(this.store.mapping(d).props);
                const dataGroupedByFacets = du.groupBy(this.data, [d]);

                this.facets.entries = dataGroupedByFacets
                    .filter(e => keys.includes(String(e.group[d])))
                    .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
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
            if (def.facets) {
                // the scales of all facets, also the ones without orientation, e.g. of colors
                const shared = def.facets.scales ? ju.entryToValue(def.facets.scales, this.store.bases) : [];
                const colors = this.store.mappingNamesWithKey('scale').filter(n => !this.store.mapping(n).scale.orientation);
                // the sizes of a facet, as the ones of Facet.vue
                const { width, height, margins } = this.facets;
                const innerWidth = width - (margins.left + margins.right);
                const innerHeight = height - (margins.top + margins.bottom);
                const bases = { ...this.store.bases, width, innerWidth, height, innerHeight };
                const infos = [...new Set([...shared, ...colors])].map(n => {
                    const info = {
                        dim: n,
                        mapping: this.store.mapping(n),
                    };
                    du.addDimInfo(info, this.data);
                    pu.addScale(info, coord.dims(innerWidth, innerHeight), coord, bases);

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
