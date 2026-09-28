<template>
    <div class="vis-outer">
        <div v-if="error" class="vis-error">{{ error }}</div>
        <vis-base v-else-if="store.loaded"/>
        <div v-if="debug && store.def">
            <h3>prepared:</h3>
            <pre style="height: 500px; overflow: auto; font-size: 11px;">{{ JSON.stringify(store.def, null, 4) }}</pre>
            <h3>org:</h3>
            <pre style="height: 500px; overflow: auto; font-size: 11px;">{{ JSON.stringify(store.defOrg, null, 4) }}</pre>
        </div>
    </div>
</template>

<script>
import { createStore } from '@/store.js';
import VisBase from '@/comp/Vis.vue';

export default {
    name: 'GenVis',
    props: {
        debug: {
           type: Boolean,
           default: false
        },
        defFile: {
           type: String,
           default: null
        },
        // an object or a JSON string
        def: {
           type: [Object, String],
           default: null
        },
        // rows or a CSV/JSON string
        data: {
           type: [Array, String],
           default: null
        },
    },
    data: () => ({
        store: createStore(),
        error: null,
    }),
    provide() {
        return { store: this.store };
    },
    components: {
        VisBase
    },
    watch: {
        def: 'init',
        defFile: 'init',
        data: 'init',
    },
    mounted() {
        this.init();
    },
    // errors while rendering
    errorCaptured(error) {
        this.showError(error);
        return false;
    },
    methods: {
        async init() {
            this.error = null;
            if (this.def === null && this.defFile === null)
                return this.showError(new Error('No definition given.'));
            try {
                await this.store.init({ def: this.def, defUrl: this.defFile, data: this.data });
            } catch (error) {
                this.showError(error);
            }
        },
        showError(error) {
            console.error(error);
            this.error = error.message;
        },
    },
}
</script>

<style lang="scss" scoped>
    .vis-error {
        font-size: 13px;
        color: #B00;
    }
</style>
