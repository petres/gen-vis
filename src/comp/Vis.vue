<template>
    <div class="vis">
        <div class="header">
            <div class="title">{{ title }}</div>
            <div class="subtitle">{{ subtitle }}</div>
        </div>
        <div ref="legends" class="legends">
            <legend-entry v-for="legend in legends" :legend="legend" />
        </div>
        <!-- {{ facets.shared }} -->
        <template v-if="facets.filters.length > 0" v-for="f in facets.filters">
            <div class="facet-title">{{ f.key }}</div>
            <facet :filter="f" :shared="facets.shared" :height='height' :width='width' :margins='margins'/>
        </template>
        <template v-else>
            <facet :filter="facets.filters" :shared="facets.shared" :height='height' :width='width' :margins='margins'/>
        </template>
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
        margins: {top: 0, right: 0, bottom: 0, left: 0},
        width: 600,
        height: 300,

        title: "",
        subtitle: "",
        footer: "",

        legends: [],
        facets: {
            shared: {},
            filters: {},
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

        this.margins =  def.options.margins;
        this.height = def.options.height;
        this.width = def.options.width;

        if (def.facets) {

            // console.log(d)

            // scales
            const sharedList = def.facets.scales.map(n => {
                // console.log(n)
                const m = store.mapping(n);
                // console.log(m)
                const info = {
                    dim: n
                }
                du.addDimInfo(info, data)
                pu.addScale(info, m.scale, this.constants);
                return info;
            });
            console.log(sharedList)
            this.facets.shared = Object.fromEntries(sharedList.map(e => [e.dim, e]))
            // du.addScaledData(data, infos);

            const d = def.facets.dim;
            this.facets.filters = Object.keys(def.mapping[d].props.manual).map(k => ({
                dim: d, key: k
            }));
        }
    }
}
</script>
