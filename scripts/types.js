// the types of TypeScript of the definitions, types/definition.d.ts, of the
// schema (src/schema/definition.js), `npm run types` writes them, a test
// checks that they are the ones of the schema, see tests/schema.test.js
import { compile } from 'json-schema-to-typescript';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schema as schemaSource } from '../src/schema/definition.js';

const root = new URL('..', import.meta.url);
const target = fileURLToPath(new URL('types/definition.d.ts', root));

// own names of types of parts of the schema: `number` is a global type of
// TypeScript
const names = { number: 'NumberValue' };

// the schema as json-schema-to-typescript reads it: an if/then/else (see
// cases of src/schema/dsl.js, the branches by the type of a value) is the
// union of its branches, an expression of the globals in the string syntax
// a template literal type ("=..." or "@..."), so the enums stay precise
const typed = node => {
    if (Array.isArray(node))
        return node.map(typed);
    if (node === null || typeof node != 'object')
        return node;
    // the keys of `properties` and `definitions` are names, e.g. the operator if
    const named = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, typed(v)]));
    const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k == 'enum' || k == 'const' ? v
        : (k == 'properties' || k == 'definitions') && v && typeof v == 'object' ? named(v) : typed(v)]));
    if (out.if && ('then' in out || 'else' in out)) {
        const { if: _, then, else: otherwise, ...rest } = out;
        const branches = [then, otherwise].filter(Boolean).flatMap(b => b.anyOf && Object.keys(b).length == 1 ? b.anyOf : [b]);
        return { ...rest, anyOf: branches };
    }
    if (out.type == 'string' && out.pattern == '^=')
        return { ...out, tsType: '`=${string}`' };
    if (out.type == 'string' && out.pattern == '^[=@]')
        return { ...out, tsType: '`=${string}` | `@${string}`' };
    return out;
};

export const definitionTypes = async () => {
    const schema = typed(JSON.parse(JSON.stringify(schemaSource)));
    // the names of registered mark types and coordinate systems beside the
    // built-in ones, `string & {}` keeps the built-in ones for the completion
    // of editors, `string` would replace them; the names of the else branch
    // are the ones of the enums before
    [schema.definitions.mark.properties.type, schema.properties.coord].forEach(t => {
        const branches = t.anyOf.flatMap(b => b.anyOf ?? [b]);
        // an enum whose names the other enums have, from the last one
        for (let i = branches.length - 1; i >= 0; i--) {
            const others = branches.filter((b, j) => j != i && b.enum).flatMap(b => b.enum);
            if (branches[i].enum?.every(v => others.includes(v)))
                branches.splice(i, 1);
        }
        t.anyOf = branches;
        t.anyOf.filter(b => b.pattern && b.pattern != '^=').forEach(b => b.tsType = 'string & {}');
    });
    const types = await compile(schema, 'Definition', {
        bannerComment: '// the types of the definitions, generated of src/schema/definition.js by `npm run types`, see scripts/types.js',
        customName: (part, key) => names[key],
        style: { tabWidth: 4, printWidth: 120, singleQuote: true },
    });
    return types;
};

if (process.argv[1] === fileURLToPath(import.meta.url))
    writeFileSync(target, await definitionTypes());
