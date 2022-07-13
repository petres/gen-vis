<template>
    <div>
        <vis v-if="store.loaded"/>
        <pre v-if="debug">{{ JSON.stringify(store.defOrg, null, 4) }}</pre>
    </div>
</template>

<script>
import { baseStore } from '@/store.js';
import * as d3 from "d3";
import Vis from '@/comp/Vis.vue';

export default {
    props: {
        debug: {
           type: Boolean,
           default: false
        },
        def: {
           type: String
        },
    },
    data: () => ({
        store: baseStore(),
    }),
    components: {
        Vis
    },
    mounted() {
        this.store.load(this.def);
    }
}
</script>
