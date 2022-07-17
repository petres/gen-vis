<template>
    <div class="vis" ref="vis">
        <div class="header">
            <div class="title">{{ title }}</div>
            <div class="subtitle">{{ subtitle }}</div>
        </div>
        <div ref="legends" class="legends">
            <legend-entry v-for="legend in legends" :legend="legend" />
        </div>
        <div v-if="initialized" class="vis-inner">
            <div v-if="facets.filters.length > 0" v-for="f in facets.filters" :style="`width: ${facets.width}px; display: inline-block;`">
                <div class="facet-title">{{ f.name }}</div>
                <facet :filter="f" :shared="facets.shared" :height='facets.height' :width='facets.width' :margins='facets.margins'/>
            </div>
            <facet v-else :filter="facets.filters" :shared="facets.shared" :height='height' :width='width' :margins='margins'/>
        </div>
        <div class="footer">
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
        facets: {
            shared: {},
            filters: {},
            height: 0,
            width: 0,
            margins: {top: 0, right: 0, bottom: 0, left: 0},
        },
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
        const store = baseStore();
        const data = store.data;
        const def = store.def;

        this.legends = store.mappingNamesWithKey('legend')

        this.title = def.options.title;
        this.subtitle = def.options.subtitle;
        this.footer = def.options.footer;

        this.margins = def.options.margins;
        this.height = def.options.height;

        if (def.options.width) {
            this.width = def.options.width;
        } else {
            this.width = this.$refs.vis.getBoundingClientRect().width
            console.log(this.width)
        }

        if (def.facets) {
            this.facets.margins = this.margins;
            this.facets.height = this.height;
            this.facets.width = this.width/def.facets.cols;

            // scales
            if (def.facets.scales) {
                const sharedList = def.facets.scales.map(n => {
                    const info = {
                        dim: n,
                        mapping: store.mapping(n),
                    }
                    du.addDimInfo(info, data)
                    pu.addScale(info, this.constants);
                    return info;
                });
                // console.log(sharedList)
                this.facets.shared = Object.fromEntries(sharedList.map(e => [e.dim, e]))
                // du.addScaledData(data, infos);
            }

            const d = def.facets.dim;
            this.facets.filters = Object.keys(store.mapping(d).props.manual).map(k => ({
                dim: d, key: k, name: store.mapping(d).props.manual[k].name
            }));
        }

        this.initialized = true;
    }
}
</script>
