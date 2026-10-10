// completion of the keys and values of a definition from the JSON Schema of the
// package, e.g. the keys of `mapping.x.axis` or the plot types, with their
// descriptions, the path of the cursor is taken from the syntax tree
import { syntaxTree } from '@codemirror/language';

export { schemaCompletion };

// the schema of a `$ref` of the definitions, e.g. #/definitions/plot
const resolve = (root, s) => s?.$ref ? resolve(root, s.$ref.split('/').slice(1).reduce((o, k) => o[k], root)) : s;

// the alternatives of a schema, e.g. a plot or a list of plots
const variants = (root, s) => {
    s = resolve(root, s);
    if (!s || typeof s != 'object')
        return [];
    const parts = [...(s.oneOf ?? []), ...(s.anyOf ?? [])];
    return parts.length ? [s, ...parts.flatMap(p => variants(root, p))] : [s];
};

// the schemas of a key or of the entries of an array (`null`)
const child = (root, schemas, key) => schemas.flatMap(s => {
    if (key === null)
        return s.items ? variants(root, s.items) : [];
    if (s.properties?.[key])
        return variants(root, s.properties[key]);
    return typeof s.additionalProperties == 'object' ? variants(root, s.additionalProperties) : [];
});

const schemasAt = (root, path) => path.reduce((schemas, key) => child(root, schemas, key), variants(root, root));

// the keys and the indices of the arrays (null) from the root to the node
const pathOf = (node, doc) => {
    const path = [];
    for (let n = node; n; n = n.parent) {
        if (n.name == 'Property') {
            const name = n.getChild('PropertyName');
            if (name)
                path.unshift(JSON.parse(doc.sliceString(name.from, name.to)));
        } else if (n.name == 'Array') {
            path.unshift(null);
        }
    }
    return path;
};

const objectOf = node => {
    while (node && node.name != 'Object')
        node = node.parent;
    return node;
};

// the end of the name or the string at the cursor, e.g. the closing quote
// inserted with the opening one, it is replaced by the completion
const tokenEnd = (state, pos) => {
    const n = syntaxTree(state).resolveInner(pos, -1);
    return ['PropertyName', 'String'].includes(n.name) && n.from < pos && n.to > pos ? n.to : pos;
};

const insert = (view, from, to, text) => view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.complete',
});

// the text typed is the one from `from` to the cursor, it is matched with the labels
const word = /[\w$:@.-]*$/;

const schemaCompletion = root => context => {
    const { state, pos } = context;
    const typed = context.matchBefore(/"?[\w$:@.-]*/);
    const quoted = typed.text.startsWith('"');
    const from = quoted ? typed.from + 1 : typed.from;
    const node = syntaxTree(state).resolveInner(pos, -1);
    const before = state.doc.sliceString(Math.max(0, typed.from - 200), typed.from).trimEnd();

    // a key: the name typed or a new one after `{` or `,`, an existing colon is kept
    if (node.name == 'PropertyName' || /[{,]$/.test(before)) {
        const object = objectOf(node.name == 'PropertyName' ? node.parent?.parent : node);
        if (!object)
            return null;
        const options = new Map();
        schemasAt(root, pathOf(object, state.doc)).forEach(s => Object.entries(s.properties ?? {}).forEach(([key, p]) => {
            if (options.has(key))
                return;
            options.set(key, {
                label: key,
                type: 'property',
                info: resolve(root, p)?.description ?? null,
                apply: (view, completion, from, to) => {
                    const end = tokenEnd(view.state, to);
                    const colon = /^\s*:/.test(view.state.sliceDoc(end, end + 20));
                    insert(view, from, end, `${quoted ? '' : '"'}${key}"${colon ? '' : ': '}`);
                },
            });
        }));
        return options.size ? { from, options: [...options.values()], validFor: word } : null;
    }

    // the value of a key, e.g. the plot types, the labels are the values without quotes
    const property = /"([^"]+)"\s*:\s*$/.exec(before);
    const object = property && objectOf(node);
    if (!object)
        return null;
    const schemas = child(root, schemasAt(root, pathOf(object, state.doc)), property[1]);
    const values = [...new Set(schemas.flatMap(s => s.enum ?? (s.const !== undefined ? [s.const] : [])))];
    if (!values.length)
        return null;
    return {
        from,
        options: values.map(v => ({
            label: String(v),
            type: 'enum',
            apply: (view, completion, from, to) => insert(view, quoted ? from - 1 : from, tokenEnd(view.state, to), JSON.stringify(v)),
        })),
        validFor: word,
    };
};
