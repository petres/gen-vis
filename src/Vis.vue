<template>
    <div>
        <template v-if="facets.length > 0">
            <facet v-for="f in facets" :f="f"/>
        </template>
        <template v-else>
            <facet/>
            <!-- <legend/> -->
        </template>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import Facet from '@/Facet.vue';
import Legend from '@/Legend.vue';


export default {
    data: () => ({
        margin: {l: 50, r: 50, t: 50, b: 50},
        width: 600,
        height: 300,
        facets: [],
    }),
    computed: {
        innerWidth() { return this.width - (this.margin.l + this.margin.r) },
        innerHeight() { return this.height - (this.margin.t + this.margin.b) },
    },
    components: {
        Facet, Legend
    },
    mounted() {
        const store = baseStore();
        // this.facets = ['X', 'Y'];
    }
}
</script>
