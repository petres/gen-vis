<template>
    <div class="vis-outer">
        <div v-if="error" class="vis-error">{{ error }}</div>
        <vis-base v-else-if="store.loaded" @state-changed="$emit('update:state', store.state)"/>
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
import { sameValue } from '@/utils/json.js';
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
        // the changes of the user, e.g. kept by the page, see utils/state.js,
        // with v-model:state it is updated on every change
        state: {
           type: Object,
           default: null
        },
    },
    emits: ['update:state'],
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
        state: {
            handler: 'syncState',
            deep: true,
        },
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
                await this.store.init({ def: this.def, defUrl: this.defFile, data: this.data, state: this.state });
                // the state might have changed while loading
                this.syncState();
            } catch (error) {
                this.showError(error);
            }
        },
        // only if it differs, the own updates of v-model come back unchanged
        syncState() {
            if (this.store.loaded && !sameValue(this.state ?? {}, this.store.state))
                this.store.setState(this.state);
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
