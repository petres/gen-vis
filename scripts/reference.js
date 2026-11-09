// docs/reference.md, the keys of the definition language in tables, written
// of src/schema/definition.js by `npm run schema` (a test checks that the
// file is the one of the source, see tests/schema.test.js): a table per part
// of a definition with the type, the default and the text of every key, the
// texts are the ones editors show; docs/definition.md is the prose
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schema } from '../src/schema/definition.js';

const target = fileURLToPath(new URL('../docs/reference.md', import.meta.url));

// the parts of a definition with a table, in the order of definition.md
const parts = [
    ['The top level', null, 'definition'],
    ['A dim (`dims.<name>`)', 'dim', 'dims'],
    ['The scale of a dim (`dims.<name>.scale`)', 'scale', 'scales'],
    ['The axis of a dim (`dims.<name>.axis`)', 'axis', 'axes'],
    ['The legend of a dim (`dims.<name>.legend`)', 'legend', 'legends'],
    ['The hover of a dim (`dims.<name>.hover`)', 'dimHover', 'the-hover-of-a-dim'],
    ['A mark (`marks[]`)', 'mark', 'marks'],
    ['An annotation (`annotations[]`)', 'annotation', 'annotations'],
    ['The hover (`hover`)', 'hover', 'hover'],
    ['The highlight (`highlight`)', 'highlight', 'highlight'],
    ['The facets (`facets`)', 'facets', 'facets'],
    ['A map (`geo`)', 'geo', 'maps'],
    ['A control (`controls[]`)', 'control', 'globals-and-controls'],
    ['An entry of a control (`controls[].values[]`)', 'controlValue', 'globals-and-controls'],
];

const refName = node => node.$ref?.replace('#/definitions/', '');
const resolveNode = node => refName(node) ? schema.definitions[refName(node)] : node;

// the type of a node in a few words, e.g. "number | expression"
const typeOf = (node, depth = 0) => {
    if (!node || depth > 3)
        return '';
    const name = refName(node);
    if (name) {
        const named = { expression: 'expression', number: 'number', inLanguages: 'text', removed: 'null', none: 'null', conditions: 'condition',
            filter: 'condition', props: 'attributes', channel: 'dim, number or expression', margins: 'margins', locale: 'locale', value: 'value' };
        // a part with a table of its own is a link to it
        return named[name] ?? (parts.some(([, n]) => n == name) ? `[${name}](#${name})` : name);
    }
    if (node.enum)
        return node.enum.map(v => `\`${JSON.stringify(v)}\``).join(', ');
    if ('const' in node)
        return `\`${JSON.stringify(node.const)}\``;
    const branches = node.anyOf ?? node.oneOf ?? (node.if ? [node.then, node.else].filter(Boolean) : undefined);
    if (branches)
        return [...new Set(branches.map(b => typeOf(b, depth + 1)).filter(Boolean))].join(' | ');
    if (node.pattern == '^[=@]' || node.pattern == '^=')
        return 'expression';
    if (node.type == 'array')
        return `list of ${typeOf(node.items ?? {}, depth + 1) || 'values'}`;
    if (node.type == 'object')
        return node.properties ? 'object' : 'map';
    return [node.type].flat().filter(Boolean).join(' | ');
};

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

const table = node => {
    const n = resolveNode(node);
    // a part of several forms: the keys of all of its objects
    const objects = n.properties ? [n] : (n.anyOf ?? n.oneOf ?? (n.if ? [n.then, n.else].filter(Boolean) : [])).map(resolveNode).filter(b => b?.properties);
    const keys = new Map();
    objects.forEach(o => Object.entries(o.properties).forEach(([k, v]) => keys.has(k) || keys.set(k, v)));
    const rows = [...keys].map(([k, v]) => {
        const r = resolveNode(v);
        const def = v.default ?? r?.default;
        return `| \`${k}\` | ${cell(typeOf(v))} | ${def === undefined ? '' : `\`${cell(JSON.stringify(def))}\``} | ${cell(v.description ?? r?.description ?? '')} |`;
    });
    return ['| Key | Type | Default | |', '|-----|------|---------|-|', ...rows].join('\n');
};

export const referenceText = () => [
    '# Reference of the definition',
    '',
    'The keys of every part of a definition of gen-vis 5, with their types, their defaults and the',
    'texts editors show, written of `src/schema/definition.js` (`npm run schema`, do not edit this',
    'file). The language with its examples is [definition.md](definition.md). "expression" is a value',
    'which can also be an [expression](definition.md#expressions), e.g. `"=@innerWidth * 0.5"` or a',
    '`match` of a global.',
    '',
    ...parts.flatMap(([title, name, anchor]) => [
        `## ${title}<a id="${name ?? 'top'}"></a>`,
        '',
        `See [definition.md](definition.md#${anchor}).`,
        '',
        table(name ? { $ref: `#/definitions/${name}` } : schema),
        '',
    ]),
].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url))
    writeFileSync(target, referenceText());
