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

export const definitionTypes = async () => {
    const schema = JSON.parse(JSON.stringify(schemaSource));
    // the names of registered plot types and coordinate systems beside the
    // built-in ones, `string & {}` keeps the built-in ones for the completion
    // of editors, `string` would replace them
    [schema.definitions.mark.properties.type, schema.properties.coord]
        .forEach(t => t.anyOf.filter(b => b.pattern).forEach(b => b.tsType = 'string & {}'));
    const types = await compile(schema, 'Definition', {
        bannerComment: '// the types of the definitions, generated of src/schema/definition.js by `npm run types`, see scripts/types.js',
        customName: (part, key) => names[key],
        style: { tabWidth: 4, printWidth: 120, singleQuote: true },
    });
    return types;
};

if (process.argv[1] === fileURLToPath(import.meta.url))
    writeFileSync(target, await definitionTypes());
