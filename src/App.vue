<template>
    <div>
        <vis v-if="store.loaded"/>
        <pre>{{ JSON.stringify(store.defOrg, null, 4) }}</pre>
    </div>
</template>

<script>
import { baseStore } from '@/store.js';
import * as d3 from "d3";
import Vis from '@/Vis.vue';


export default {
    data: () => ({
        store: baseStore(),
    }),
    components: {
        Vis
    },
    mounted() {
        this.store.load();
    }
}
</script>
