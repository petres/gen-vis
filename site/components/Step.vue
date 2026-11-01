<template>
    <div :id="step.id" class="step">
        <h3><span>{{ number }}</span> {{ step.title }}</h3>
        <p v-html="step.text"/>

        <div class="example-body step-body">
            <div class="stage demo-live"><GenVis :def="def"/></div>

            <div class="panel step-panel">
                <div class="panel-bar">
                    <div class="tabs" role="tablist" :aria-label="`${step.title}: definition`">
                        <button v-for="t in tabs" :key="t.id" :id="`${step.id}-tab-${t.id}`" role="tab" type="button"
                            :aria-selected="tab == t.id" :aria-controls="`${step.id}-panel-${t.id}`" @click="tab = t.id">{{ t.name }}</button>
                    </div>
                    <div class="actions">
                        <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
                        <button type="button" :disabled="!defChanged" @click="defText = originalDef()">Reset</button>
                    </div>
                </div>

                <div class="editor-wrap">
                    <div v-show="tab == 'add'" :id="`${step.id}-panel-add`" role="tabpanel" :aria-labelledby="`${step.id}-tab-add`" class="tab-panel step-added">
                        <pre><code>{{ added }}</code></pre>
                    </div>
                    <div v-show="tab == 'def'" :id="`${step.id}-panel-def`" role="tabpanel" :aria-labelledby="`${step.id}-tab-def`" class="tab-panel">
                        <CodeEditor v-model="defText" lang="json" :label="`${step.title}: definition`"/>
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
    </div>
</template>

<script>
import { GenVis } from '@preschen/gen-vis';
import CodeEditor from './CodeEditor.vue';
import { liveDefinition, json } from '../editor/live.js';

// a step of the page how it works (guide/steps.js): the chart of its
// definition, what the step adds to the one before and the whole definition,
// which can be edited, the chart follows
export default {
    components: { GenVis, CodeEditor },
    mixins: [liveDefinition],
    props: { step: Object, index: Number },
    data: () => ({
        tab: 'def',
        tabs: [{ id: 'def', name: 'Definition' }, { id: 'add', name: 'Added in this step' }],
        copied: false,
    }),
    computed: {
        number() { return String(this.index + 1).padStart(2, '0') },
        added() { return json(this.step.add) },
        status() {
            if (this.parseError)
                return { type: 'error', text: this.parseError };
            if (this.warnings.length)
                return { type: 'warning', text: `Drawn, with ${this.warnings.length} warning${this.warnings.length > 1 ? 's' : ''}` };
            return { type: 'ok', text: this.defChanged ? 'Drawn from your changes' : 'Edit the definition, the chart follows' };
        },
    },
    methods: {
        // the text of the definition it starts with, see editor/live.js
        originalDef() { return json(this.step.def) },
        async copy() {
            await navigator.clipboard.writeText(this.tab == 'add' ? this.added : this.defText);
            this.copied = true;
            setTimeout(() => this.copied = false, 1500);
        },
    },
};
</script>
