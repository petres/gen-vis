<template>
    <div class="vis-outer">
        <div v-if="error" class="vis-error">{{ error }}</div>
        <vis-base v-else-if="store.loaded" :download="download" :copy="copy" @state-changed="$emit('update:state', store.state)" @rendered="$emit('rendered')"/>
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
import { selection, renderImage, saveImage, copyImage, defaultWidth } from '@/utils/export.js';
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
    }),
    // the slots (hover, header, footer) and the events (hover, select) are the
    // ones of the components inside
    provide() {
        return {
            store: this.store,
            slots: this.$slots,
            emit: (name, payload) => this.$emit(name, payload),
            image: { save: () => this.exportPng(), copy: () => this.copyPng() },
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
        // the name of the file is the argument, the one of `download` or the
        // title (with the values of the globals)
        async exportPng(name) {
            const title = this.store.def.options.title;
            name ??= typeof this.download == 'string' && this.download ? this.download
                : (title ? this.store.text(title) : 'gen-vis');
            saveImage(await this.image(), name);
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
    .vis-error {
        font-size: 13px;
        color: #B00;
    }
</style>
