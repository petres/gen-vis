<template>
    <section :id="example.id" class="example">
        <header class="example-head">
            <div class="example-kicker"><span>{{ number }}</span></div>
            <h2>{{ example.name }}</h2>
            <p>{{ example.description }}</p>
            <ul class="example-features">
                <li v-for="f in example.features" :key="f"><code>{{ f }}</code></li>
            </ul>
        </header>

        <div class="example-body">
            <div class="stage" :class="example.theme">
                <GenVis :def="def" table download csv svg/>
            </div>

            <div class="panel">
                <div class="panel-bar">
                    <div class="tabs" role="tablist" :aria-label="`${example.name}: source`">
                        <button v-for="t in tabs" :key="t.id" :id="`${example.id}-tab-${t.id}`" role="tab" type="button"
                            :aria-selected="tab == t.id" :aria-controls="`${example.id}-panel-${t.id}`" @click="tab = t.id">{{ t.name }}</button>
                    </div>
                    <div class="actions">
                        <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
                        <button type="button" :disabled="!changed" @click="reset">Reset</button>
                    </div>
                </div>

                <div class="editor-wrap">
                    <div v-show="tab == 'def'" :id="`${example.id}-panel-def`" role="tabpanel" :aria-labelledby="`${example.id}-tab-def`" class="tab-panel">
                        <CodeEditor v-model="defText" lang="json" :label="`${example.name}: definition`"/>
                    </div>
                    <div v-show="tab == 'css'" :id="`${example.id}-panel-css`" role="tabpanel" :aria-labelledby="`${example.id}-tab-css`" class="tab-panel">
                        <CodeEditor v-model="cssText" lang="css" :label="`${example.name}: styles`"/>
                    </div>
                    <div v-if="tab == 'data'" :id="`${example.id}-panel-data`" role="tabpanel" :aria-labelledby="`${example.id}-tab-data`" class="tab-panel data-preview">
                        <DataPreview :url="dataUrl"/>
                    </div>
                </div>

                <div class="status" :class="status.type" role="status">
                    <span class="status-dot"/>
                    <span>{{ status.text }}</span>
                </div>
                <ul v-if="warnings.length" class="warnings">
                    <li v-for="w in warnings" :key="w">{{ w }}</li>
                </ul>
            </div>
        </div>
    </section>
</template>

<script>
import { GenVis } from '@preschen/gen-vis/vue';
import CodeEditor from './CodeEditor.vue';
import DataPreview from './DataPreview.vue';
import { liveDefinition } from '../editor/live.js';

export default {
    components: { GenVis, CodeEditor, DataPreview },
    mixins: [liveDefinition],
    props: { example: Object, index: Number },
    data() {
        return {
            tab: 'def',
            tabs: [{ id: 'def', name: 'Definition' }, { id: 'css', name: 'CSS' }, { id: 'data', name: 'Data' }],
            cssText: this.example.css,
            copied: false,
        };
    },
    computed: {
        number() { return String(this.index + 1).padStart(2, '0') },
        changed() { return this.defChanged || this.cssText != this.example.css },
        dataUrl() { return typeof this.def.data == 'string' ? new URL(this.def.data, document.baseURI).href : null },
        status() {
            if (this.parseError)
                return { type: 'error', text: this.parseError };
            if (this.warnings.length)
                return { type: 'warning', text: `Drawn, with ${this.warnings.length} warning${this.warnings.length > 1 ? 's' : ''}` };
            return { type: 'ok', text: this.changed ? 'Drawn from your changes' : 'Edit the definition or the CSS, the chart follows' };
        },
    },
    watch: {
        cssText(text) {
            this.style.textContent = text;
        },
    },
    created() {
        // the styles of the example, unlayered, so they override the ones of the package
        this.style = document.createElement('style');
        this.style.dataset.example = this.example.id;
        this.style.textContent = this.cssText;
        document.head.appendChild(this.style);
    },
    beforeUnmount() {
        this.style.remove();
    },
    methods: {
        // the text of the definition it starts with, see editor/live.js
        originalDef() { return this.example.def },
        reset() {
            this.defText = this.example.def;
            this.cssText = this.example.css;
        },
        async copy() {
            await navigator.clipboard.writeText(this.tab == 'css' ? this.cssText : this.defText);
            this.copied = true;
            setTimeout(() => this.copied = false, 1500);
        },
    },
};
</script>
