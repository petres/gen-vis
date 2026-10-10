<template>
    <!-- the space of the visualisation is kept while it is loaded, so the page
         does not move when it is drawn -->
    <div class="vis-outer" :class="{ 'vis-loading': waiting }" :style="waiting && reserved ? { minHeight: `${reserved}px` } : null">
        <div v-if="error" class="vis-error">{{ error }}</div>
        <!-- a new definition is drawn anew, the one before is shown while it is loaded -->
        <vis-base v-else-if="store.loaded" :key="store.loads" :download="download" :copy="copy" :csv="csv" @state-changed="$emit('update:state', store.state)" @rendered="rendered"/>
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
import { h } from 'vue';
import { sameValue } from "@/utils/def";
import { selection, renderImage, saveFile, csvOf, copyImage, defaultWidth } from '@/utils/export.js';
import { layout } from '@/layout';
import VisBase from '@/comp/Vis.vue';

// the heights of the visualisations drawn on the page by their definition and
// width, one drawn again, e.g. after a navigation of the page, has the space
// of the one before while it is loaded, the last ones are kept
const heights = new Map();
const keptHeights = 500;

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
        // rows, a CSV/JSON string or parquet as an ArrayBuffer or Uint8Array
        data: {
           type: [Array, String, ArrayBuffer, Uint8Array],
           default: null
        },
        // the changes of the user, e.g. kept by the page, see utils/state.js,
        // with v-model:state it is updated on every change
        state: {
           type: Object,
           default: null
        },
        // a button in the footer to save it as a PNG, a string is the name of the file
        download: {
           type: [Boolean, String],
           default: false
        },
        // a button in the footer to copy the PNG to the clipboard
        copy: {
           type: Boolean,
           default: false
        },
        // a button in the footer to save the data shown as CSV, a string is the name of the file
        csv: {
           type: [Boolean, String],
           default: false
        },
        // the width of the images, independent of the screen, the one of the
        // definition otherwise or 1200, `screen` is the one on the screen
        imageWidth: {
           type: [Number, String],
           default: null
        },
    },
    // update:state of the changes of the user, hover and select of the rows
    // of the hover and of a click, see Facet.vue, rendered once it is drawn,
    // error with the message
    emits: ['update:state', 'hover', 'select', 'rendered', 'error'],
    data: () => ({
        store: createStore(),
        error: null,
        // the height of the visualisation of the same definition and width
        // drawn before, null if there is none, see heights
        reserved: null,
    }),
    computed: {
        // nothing is drawn yet, the space is the one drawn before or the css
        // variable --gen-vis-loading-height
        waiting() { return !this.store.loaded && !this.error },
    },
    // the slots (hover, header, footer) and the events (hover, select) are the
    // ones of the components inside
    provide() {
        return {
            store: this.store,
            slots: this.$slots,
            emit: (name, payload) => this.$emit(name, payload),
            files: { save: () => this.exportPng(), copy: () => this.copyPng(), csv: () => this.exportCsv() },
        };
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
        this.reserved = heights.get(this.sourceKey()) ?? null;
        this.init();
    },
    beforeUnmount() {
        this.remember();
    },
    // errors while rendering
    errorCaptured(error) {
        this.showError(error);
        return false;
    },
    methods: {
        async init() {
            this.heightKey = this.sourceKey();
            if (this.def === null && this.defFile === null)
                return this.showError(new Error('No definition given.'));
            try {
                await this.store.init({ def: this.def, defUrl: this.defFile, data: this.data, state: this.state });
                // the error is kept while the new definition is loaded, a
                // definition which could not be drawn is not drawn again meanwhile
                this.error = null;
                // the state might have changed while loading
                this.syncState();
            } catch (error) {
                this.showError(error);
            }
        },
        // the definition and the width of the visualisation, the key of its height
        sourceKey() {
            const source = this.defFile ?? (typeof this.def == 'string' ? this.def : JSON.stringify(this.def));
            return `${Math.round(this.$el.getBoundingClientRect().width)} ${source}`;
        },
        rendered() {
            this.remember();
            this.$emit('rendered');
        },
        // the height of the visualisation drawn, see heights
        remember() {
            if (!this.store.loaded || this.error || this.debug)
                return;
            heights.delete(this.heightKey);
            heights.set(this.heightKey, Math.round(this.$el.getBoundingClientRect().height));
            if (heights.size > keptHeights)
                heights.delete(heights.keys().next().value);
        },
        // only if it differs, the own updates of v-model come back unchanged
        syncState() {
            if (this.store.loaded && !sameValue(this.state ?? {}, this.store.state))
                this.store.setState(this.state);
        },
        // the visualisation as a PNG (a Blob) without the form elements, of a
        // copy of the width of the images, see utils/export.js
        image() {
            const options = this.store.def.options;
            const width = this.imageWidth == 'screen'
                ? this.$el.querySelector('.vis').getBoundingClientRect().width
                : Number(this.imageWidth || options.width || defaultWidth);
            // the rows already loaded, the data is not loaded and parsed again
            const props = {
                def: this.def, defFile: this.defFile, data: this.store.rows,
                state: JSON.parse(JSON.stringify(this.store.state)),
                class: this.$attrs.class,
            };
            return renderImage(this.$el, done => {
                const vnode = h(this.$.type, { ...props, onRendered: done.resolve, onError: done.reject }, this.$slots);
                // the components and plugins of the page, e.g. of the slots
                vnode.appContext = this.$.appContext;
                return vnode;
            }, { width, text: selection(this.store.def), facets: this.store.def.facets?.dim });
        },
        // the name of a file, the one of the prop, e.g. `download`, or the
        // title (with the values of the globals)
        fileName(prop) {
            const title = this.store.def.options.title;
            return typeof prop == 'string' && prop ? prop : (title ? this.store.text(title) : 'gen-vis');
        },
        // the name of the file is the argument or the one of fileName
        async exportPng(name) {
            saveFile(await this.image(), `${name ?? this.fileName(this.download)}.png`);
        },
        // the rows shown in the columns of their mappings, see utils/export.js
        exportCsv(name) {
            const rows = layout(this.store, this.store.totalWidth).rows;
            saveFile(new Blob([csvOf(this.store, rows)], { type: 'text/csv' }), `${name ?? this.fileName(this.csv)}.csv`);
        },
        copyPng() {
            return copyImage(this.image());
        },
        showError(error) {
            console.error(error);
            this.error = error.message;
            this.$emit('error', error.message);
        },
    },
}
</script>

<style lang="scss" scoped>
    // the space while the visualisation is loaded, e.g. 450px, set by the page
    .vis-outer.vis-loading {
        min-height: var(--gen-vis-loading-height, 0px);
    }

    .vis-error {
        font-size: 13px;
        color: var(--gen-vis-error-color, #B00);
    }
</style>
