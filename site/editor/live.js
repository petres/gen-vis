// a definition edited on the page, the chart follows the text: the examples
// (components/Example.vue) and the steps of the page how it works
// (components/Step.vue), and the JSON of the definitions shown
import { validateDef } from '@preschen/gen-vis/check';
import { schemaErrors } from './validate.js';

export { liveDefinition, parseDef, checkDef, json };

// the time after the last key stroke the chart is drawn again
const delay = 300;

// the definition of a text or the message why it is none
const parseDef = text => {
    let def;
    try {
        def = JSON.parse(text);
    } catch (error) {
        return { error: `Invalid JSON: ${error.message}` };
    }
    if (def === null || typeof def != 'object' || Array.isArray(def))
        return { error: 'The definition is an object.' };
    return { def };
};

// the warnings of the package and the errors of the schema which the package
// does not name, e.g. not an unknown key twice (`"/dims/x": unknown key
// "colum"` beside `dims.x.colum: unknown key, did you mean 'column'?`)
const checkDef = def => {
    let warnings;
    try {
        warnings = validateDef(def);
    } catch (error) {
        warnings = [error.message];
    }
    const named = error => {
        const key = error.match(/unknown key "(.+)"$/)?.[1];
        return key !== undefined && warnings.some(w => w.includes(`${key}: unknown key`));
    };
    return [...new Set([...warnings, ...schemaErrors(def, warnings).filter(e => !named(e))])];
};

// JSON with the short objects and lists in one line, e.g. the props of a
// plot, in the width of the editor beside a chart, `prefix` is the length of
// the key before it
const width = 64;
const json = (value, indent = '', prefix = 0) => {
    const line = JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');
    if (value === null || typeof value != 'object' || indent.length + prefix + line.length <= width)
        return line;
    const inner = `${indent}  `;
    const entries = Array.isArray(value)
        ? value.map(v => `${inner}${json(v, inner)}`)
        : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${json(v, inner, JSON.stringify(k).length + 2)}`);
    return Array.isArray(value) ? `[\n${entries.join(',\n')}\n${indent}]` : `{\n${entries.join(',\n')}\n${indent}}`;
};

// the mixin of a component with the method `originalDef()`, the text of the
// definition it starts with: `defText` is the text of the editor, `def` the
// definition drawn, the last valid one, `parseError` why the text is none
const liveDefinition = {
    data() {
        const text = this.originalDef();
        const def = JSON.parse(text);
        return { defText: text, def, parseError: null, warnings: checkDef(def) };
    },
    computed: {
        defChanged() { return this.defText != this.originalDef() },
    },
    watch: {
        defText(text) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.applyDef(text), delay);
        },
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    },
    methods: {
        applyDef(text) {
            const { def, error } = parseDef(text);
            this.parseError = error ?? null;
            if (error)
                return;
            this.warnings = checkDef(def);
            this.def = def;
        },
    },
};
