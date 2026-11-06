// schema.json of the package, written of src/schema/definition.js by
// `npm run schema` (a test checks that the file is the one of the source,
// see tests/schema.test.js): the file is the one editors validate and
// complete definitions with (their `$schema`), the site's editor and ajv
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schema } from '../src/schema/definition.js';

const target = fileURLToPath(new URL('../schema.json', import.meta.url));

// the JSON as the files of gen-vis are written: an indent of four spaces,
// objects and lists which fit into a line on one line
const format = (value, indent = 4, width = 120, level = 0) => {
    if (value === null || typeof value != 'object')
        return JSON.stringify(value);
    const line = oneLine(value);
    if (line.length + level*indent <= width)
        return line;
    const pad = ' '.repeat((level + 1)*indent);
    const end = ' '.repeat(level*indent);
    if (Array.isArray(value))
        return `[\n${value.map(v => pad + format(v, indent, width, level + 1)).join(',\n')}\n${end}]`;
    return `{\n${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${format(v, indent, width, level + 1)}`).join(',\n')}\n${end}}`;
};
const oneLine = value => {
    if (value === null || typeof value != 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(oneLine).join(', ')}]`;
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length == 0 ? '{}' : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(', ')} }`;
};

export const schemaText = () => `${format(schema)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url))
    writeFileSync(target, schemaText());
