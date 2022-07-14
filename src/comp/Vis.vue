<template>
    <div class="vis">
        <div class="header">
            <div class="title">{{ title }}</div>
            <div class="subtitle">{{ subtitle }}</div>
        </div>
        <div ref="legends" class="legends">
            <legend-entry v-for="legend in legends" :legend="legend" />
        </div>
        <template v-if="facets.length > 0">
            <facet v-for="f in facets" :f="f"/>
        </template>
        <template v-else>
            <facet/>
        </template>
        <div class="footer">
            <span v-html="footer"/>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import Facet from '@/comp/Facet.vue';
import LegendEntry from '@/comp/Legend.vue';


export default {
    data: () => ({
        margins: {l: 50, r: 50, t: 50, b: 50},
        width: 600,
        height: 300,
        def: null,
        facets: [],
        title: "",
        subtitle: "",
        legends: [],
    }),
    computed: {
        innerWidth() { return this.width - (this.margin.l + this.margin.r) },
        innerHeight() { return this.height - (this.margin.t + this.margin.b) },
    },
    components: {
        Facet, LegendEntry
    },
    mounted() {
        const store = baseStore();
        const def = store.def;

        this.legends = Object.keys(def.mapping).filter(n => ('legend' in def.mapping[n]))

        this.title = def.options.title;
        this.subtitle = def.options.subtitle;
        this.footer = def.options.footer;

        this.margins =  def.options.margins;
        this.height = def.options.height;
        this.width = def.options.width;


        // this.facets = ['X', 'Y'];
    }
}
</script>
