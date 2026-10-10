<template>
    <div ref="el" class="code-editor"/>
</template>

<script>
import { EditorView, basicSetup } from 'codemirror';
import { json, jsonLanguage, jsonParseLinter } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { linter, lintGutter } from '@codemirror/lint';
import schema from '@preschen/gen-vis/schema.json';
import { schemaCompletion } from '../editor/schema.js';

// the font and the colors of the editor, the highlighting is the default one
const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '12.5px', backgroundColor: '#FFFFFF' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.55' },
    // the lines wrapped are indented
    '.cm-line': { paddingLeft: 'calc(6px + 6ch)', textIndent: '-6ch' },
    '.cm-gutters': { backgroundColor: '#FAFAF9', color: '#A8A29E', borderRight: '1px solid #EEECE9' },
    '.cm-activeLineGutter': { backgroundColor: '#F1EFEC' },
    '.cm-activeLine': { backgroundColor: '#F7F6F4' },
    '&.cm-focused': { outline: 'none' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#1F2937' },
    '.cm-completionInfo': { maxWidth: '360px', whiteSpace: 'normal', fontFamily: 'system-ui, sans-serif', fontSize: '12px', lineHeight: '1.4' },
});

// a json definition with the completion of the schema, or css
const languages = {
    json: () => [json(), jsonLanguage.data.of({ autocomplete: schemaCompletion(schema) }), linter(jsonParseLinter(), { delay: 300 }), lintGutter()],
    css: () => [css()],
};

export default {
    props: {
        modelValue: { type: String, default: '' },
        lang: { type: String, default: 'json' },
        label: { type: String, default: null },
    },
    emits: ['update:modelValue'],
    mounted() {
        this.view = new EditorView({
            parent: this.$refs.el,
            doc: this.modelValue,
            extensions: [
                basicSetup,
                theme,
                EditorView.lineWrapping,
                ...languages[this.lang](),
                EditorView.contentAttributes.of(this.label ? { 'aria-label': this.label } : {}),
                EditorView.updateListener.of(u => {
                    if (u.docChanged)
                        this.$emit('update:modelValue', u.state.doc.toString());
                }),
            ],
        });
    },
    beforeUnmount() {
        this.view.destroy();
    },
    watch: {
        // a value from outside, e.g. of reset, the own changes come back unchanged
        modelValue(value) {
            const doc = this.view.state.doc.toString();
            if (value != doc)
                this.view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
        },
    },
};
</script>

<style>
    .code-editor {
        height: 100%;
        overflow: hidden;
    }
</style>
