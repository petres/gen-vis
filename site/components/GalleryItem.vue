<template>
    <section :id="entry.id" class="example">
        <header class="example-head">
            <div class="example-kicker"><span>{{ number }}</span> data/{{ entry.file }}</div>
            <h2>{{ entry.name }}</h2>
            <p>{{ entry.description }}</p>
            <ul class="example-features">
                <li v-for="f in entry.features" :key="f"><code>{{ f }}</code></li>
            </ul>
        </header>

        <div class="example-body">
            <div class="stage">
                <GenVis :def="def" :def-file="url" table download csv svg/>
            </div>

            <div class="panel">
                <div class="panel-bar">
                    <div class="tabs" role="tablist" :aria-label="`${entry.name}: source`">
                        <button v-for="t in tabs" :key="t.id" :id="`${entry.id}-tab-${t.id}`" role="tab" type="button"
                            :aria-selected="tab == t.id" :aria-controls="`${entry.id}-panel-${t.id}`" @click="tab = t.id">{{ t.name }}</button>
                    </div>
                    <div class="actions">
                        <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
                        <button type="button" :disabled="!defChanged" @click="reset">Reset</button>
                    </div>
                </div>

                <div class="editor-wrap">
                    <div v-show="tab == 'def'" :id="`${entry.id}-panel-def`" role="tabpanel" :aria-labelledby="`${entry.id}-tab-def`" class="tab-panel">
                        <CodeEditor v-model="defText" lang="json" :label="`${entry.name}: definition`"/>
                    </div>
                    <div v-if="tab == 'merged'" :id="`${entry.id}-panel-merged`" role="tabpanel" :aria-labelledby="`${entry.id}-tab-merged`" class="tab-panel">
                        <CodeEditor :model-value="mergedText" lang="json" :label="`${entry.name}: merged with its parents`" readonly/>
                    </div>
                    <div v-if="tab == 'data' && dataUrl" :id="`${entry.id}-panel-data`" role="tabpanel" :aria-labelledby="`${entry.id}-tab-data`" class="tab-panel data-preview">
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
import { resolveParents, validateDef } from '@preschen/gen-vis/check';
import CodeEditor from './CodeEditor.vue';
import DataPreview from './DataPreview.vue';
import { liveDefinition, parseDef, json } from '../editor/live.js';

// a chart of the gallery: the definition of a file of data/ with its
// parents (the tab "Merged"), edited on the page, the chart follows, the
// relative urls of the definition are the ones of its file (`defFile`)
export default {
    components: { GenVis, CodeEditor, DataPreview },
    mixins: [liveDefinition],
    props: { entry: Object, index: Number, text: String },
    data() {
        return { tab: 'def', copied: false, merged: null };
    },
    computed: {
        number() { return String(this.index + 1).padStart(2, '0') },
        url() { return new URL(`gallery-data/${this.entry.file}`, document.baseURI).href },
        hasParents() { return this.def.parent !== undefined },
        tabs() {
            return [
                { id: 'def', name: 'Definition' },
                ...(this.hasParents ? [{ id: 'merged', name: 'With its parents' }] : []),
                ...(this.dataUrl ? [{ id: 'data', name: 'Data' }] : []),
            ];
        },
        // the data of the definition, or of its parents (the merged one)
        dataUrl() {
            const data = typeof this.def.data == 'string' ? this.def.data : (typeof this.merged?.data == 'string' ? this.merged.data : null);
            return data && !data.includes('{') ? new URL(data, this.url).href : null;
        },
        mergedText() { return this.merged ? json(this.merged) : 'loading the parents ...' },
        status() {
            if (this.parseError)
                return { type: 'error', text: this.parseError };
            if (this.warnings.length)
                return { type: 'warning', text: `Drawn, with ${this.warnings.length} warning${this.warnings.length > 1 ? 's' : ''}` };
            return { type: 'ok', text: this.defChanged ? 'Drawn from your changes' : 'Edit the definition, the chart follows' };
        },
    },
    created() {
        this.warnings = [];
        this.check(this.def);
    },
    methods: {
        originalDef() { return this.text },
        reset() {
            this.defText = this.text;
        },
        // the definition drawn, its warnings are the ones of the merged one
        applyDef(text) {
            const { def, error } = parseDef(text);
            this.parseError = error ?? null;
            if (error)
                return;
            this.def = def;
            this.check(def);
        },
        async check(def) {
            try {
                const merged = await resolveParents(JSON.parse(JSON.stringify(def)), this.url);
                if (this.def !== def)
                    return;
                this.merged = merged;
                this.warnings = validateDef(merged);
            } catch (error) {
                if (this.def === def)
                    this.warnings = [error.message];
            }
        },
        async copy() {
            await navigator.clipboard.writeText(this.tab == 'merged' ? this.mergedText : this.defText);
            this.copied = true;
            setTimeout(() => this.copied = false, 1500);
        },
    },
};
</script>
