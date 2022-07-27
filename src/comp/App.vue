<template>
    <div class="vis-outer">
        <vis v-if="store.loaded"/>
        <div v-if="debug">
            <h3>prepared:</h3>
            <pre style="height: 500px; overflow: auto; font-size: 11px;">{{ JSON.stringify(store.def, null, 4) }}</pre>
            <h3>org:</h3>
            <pre style="height: 500px; overflow: auto; font-size: 11px;">{{ JSON.stringify(store.defOrg, null, 4) }}</pre>
        </div>
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
        defFile: {
           type: String,
           default: null
        },
        def: {
           type: String,
           default: null
        },
        data: {
           type: String,
           default: null
        },
    },
    data: () => ({
        store: baseStore(),
    }),
    components: {
        Vis
    },
    mounted() {
        if (this.def !== null) {
            this.store.init(JSON.parse(this.def), this.data);
        } else if (this.defFile !== null)  {
            this.store.load(this.defFile);
        } else {
            console.log('No definition given.')
        }
    }
}
</script>
