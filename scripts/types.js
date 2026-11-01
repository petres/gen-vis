// the types of TypeScript of the definitions, types/definition.d.ts, of the
// schema, `npm run types` writes them, a test checks that they are the ones
// of the schema, see tests/schema.test.js
import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const target = fileURLToPath(new URL('types/definition.d.ts', root));

// own names of types of parts of the schema: `number` is a global type of
// TypeScript, the one of a mapping (`mapping.x`) is not the one of the
// mappings (`mapping`), the names of titles are the same at every reference
const names = { number: 'NumberValue' };
const titles = { mapping: 'MappingEntry' };

export const definitionTypes = async () => {
    const schema = JSON.parse(readFileSync(new URL('schema.json', root), 'utf8'));
    Object.entries(titles).forEach(([key, title]) => schema.definitions[key].title = title);
    // the names of registered plot types and coordinate systems beside the
    // built-in ones, `string & {}` keeps the built-in ones for the completion
    // of editors, `string` would replace them
    [schema.definitions.plot.properties.type, schema.definitions.options.properties.coord]
        .forEach(t => t.anyOf.filter(b => b.pattern).forEach(b => b.tsType = 'string & {}'));
    const types = await compile(schema, 'Definition', {
        bannerComment: '// the types of the definitions, generated of schema.json by `npm run types`, see scripts/types.js',
        customName: (part, key) => names[key],
        style: { tabWidth: 4, printWidth: 120, singleQuote: true },
    });
    return types;
};

if (process.argv[1] === fileURLToPath(import.meta.url))
    writeFileSync(target, await definitionTypes());
