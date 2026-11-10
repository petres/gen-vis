// the check of the CLI (gen-vis check, and the one of gen-vis export, see
// bin/gen-vis.js and docs/export.md) in node, without a browser: a
// definition file merged with its parents, the JSON Schema of the package
// (ajv) on the merged definition and validateDef with the rows of its data,
// read as the load reads them (CSV, TSV, JSON, parquet). The files are the
// ones of the paths of the urls of the export page (bin/export.js), so a
// site-absolute path, e.g. "/geo/europe.json", is a file of `root`.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fileOf, fileUrl } from './export.js';

const require = createRequire(import.meta.url);
const schemaFile = fileURLToPath(new URL('../schema.json', import.meta.url));
const checkModule = fileURLToPath(new URL('../dist/check.js', import.meta.url));

// the path of a part of the definition as the ones of validateDef, e.g.
// "/marks/0/type" is "marks[0].type", the parts of a single mark, annotation
// or transform (an object) are the ones of the first of a list ("marks[0]")
const pathOf = (pointer, def) => {
    const keys = pointer.split('/').slice(1).map(k => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (['marks', 'annotations', 'transform'].includes(keys[0]) && def?.[keys[0]] !== null && typeof def?.[keys[0]] == 'object' && !Array.isArray(def[keys[0]]))
        keys.splice(1, 0, '0');
    return keys.reduce((p, k) => /^\d+$/.test(k) ? `${p}[${k}]` : p ? `${p}.${k}` : k, '');
};

const show = v => JSON.stringify(v);

// the errors of ajv as warnings [path, message]: one per path, the types of
// the alternatives of a value as one, without the summaries (anyOf, oneOf,
// the if of the branches of the schema by the type of a value)
const schemaErrors = (errors, def) => {
    const kept = errors.filter(e => !['anyOf', 'oneOf', 'if'].includes(e.keyword));
    const types = new Map();
    kept.filter(e => e.keyword == 'type').forEach(e => types.set(e.instancePath, [...new Set([...(types.get(e.instancePath) ?? []), e.params.type])]));
    const out = new Map();
    kept.forEach(e => {
        const path = pathOf(e.instancePath, def);
        const at = (p, message) => out.has(`${p}: ${message}`) || out.set(`${p}: ${message}`, [p, message]);
        if (e.keyword == 'additionalProperties')
            return at(path ? `${path}.${e.params.additionalProperty}` : e.params.additionalProperty, 'unknown key');
        if (e.keyword == 'enum') {
            const values = e.params.allowedValues;
            return at(path, `${show(e.data)} is none of ${values.length > 12 ? `the ${values.length} values of the schema` : values.map(show).join(', ')}`);
        }
        if (e.keyword == 'type')
            return at(path, `expected ${types.get(e.instancePath).join(' or ')}`);
        if (e.keyword == 'required')
            return at(path, `'${e.params.missingProperty}' is needed`);
        // the pattern of a reference or an expression beside the types of its alternatives
        if (e.keyword == 'pattern' && types.has(e.instancePath))
            return at(path, `expected ${types.get(e.instancePath).join(' or ')} or an expression ("=..." or "@name")`);
        return at(path, e.message);
    });
    // a path whose alternatives are of another type than the value has no
    // error of its own beside the one of a part below it, e.g. a mark of a list
    const entries = [...out.values()];
    return entries.filter(([p, m]) => !m.startsWith('expected') || !entries.some(([q]) => q.startsWith(`${p}.`) || q.startsWith(`${p}[`)));
};

/**
 * The checker of definition files: `check(file, { data })` resolves to the
 * warnings of the file (texts "path: message", `migrated` of a definition
 * of gen-vis 4, which is checked as migrated), `data` is a file of the
 * data instead of the one of the definition; it rejects of an error, e.g.
 * a missing parent or invalid JSON. `root` is the directory of
 * site-absolute paths.
 */
export const createChecker = async ({ root = null } = {}) => {
    if (!existsSync(checkModule))
        throw new Error(`the check module ${checkModule} is missing, it is built by npm run build`);
    const gv = await import(checkModule);
    await gv.loadTransforms();
    // the schema of the package with ajv, if it is installed
    let validate = null;
    try {
        const Ajv = require('ajv').default ?? require('ajv');
        validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(schemaFile, 'utf8')));
    } catch {
        // without ajv only validateDef, which walks the same schema
    }
    // the file of an url of a definition, its parents or its data
    const fileOfUrl = url => {
        const file = fileOf(url, root);
        if (!file || !existsSync(file))
            throw new Error(`the file ${file ?? new URL(url).pathname} does not exist${file || root ? '' : ' (a site-absolute path: set --root to the site\'s directory)'}`);
        return file;
    };
    // `warn(message)` of the warnings of the data, e.g. CSV of semicolons
    const rowsOf = async (def, url, data, warn) => {
        let file = data ?? null;
        if (file === null) {
            if (typeof def.data != 'string')
                return null;
            // a template of the globals, e.g. "{region}.csv", of their values
            const name = def.data.replace(/\{([^{}]+)\}/g, (t, n) => def.globals?.[n] !== undefined ? String(def.globals[n]) : t);
            if (/\{[^{}]+\}/.test(name))
                return null;
            file = fileOfUrl(new URL(name, url).href);
        } else if (!existsSync(file))
            throw new Error(`the data ${file} does not exist`);
        const format = gv.dataFormat(file, data == null ? def.dataFormat : undefined);
        try {
            return await gv.parseData(format == 'parquet' || /\.parquet$/i.test(file) ? readFileSync(file) : readFileSync(file, 'utf8'), format, null,
                message => warn(`${data == null ? 'data' : `data ${file}`}: ${message}`));
        } catch (error) {
            throw new Error(`the data ${file} could not be read: ${error.message}`);
        }
    };
    const check = async (file, { data = null } = {}) => {
        if (!existsSync(file))
            throw new Error(`the definition ${file} does not exist`);
        const url = fileUrl(file);
        let raw;
        try {
            raw = JSON.parse(readFileSync(file, 'utf8'));
        } catch (error) {
            throw new Error(`invalid JSON: ${error.message}`);
        }
        // the urls of the messages as the paths of their files
        const paths = error => Object.assign(error, { message: error.message.replaceAll(`${fileUrl('/').replace(/\/$/, '')}`, '') });
        const def = await gv.resolveParents(raw, url, u => readFileSync(fileOfUrl(u), 'utf8')).catch(error => {
            throw paths(error);
        });
        const read = [];
        const rows = await rowsOf(def, url, data, message => read.push(message));
        const warnings = [...read, ...gv.validateDef(def, rows)];
        // the errors of the schema of a definition of 5.0, not the ones validateDef names
        const old = gv.isDefinition4(def);
        // (of the file as it is written, as an editor checks it: the merge
        // writes the switches of the parts as operator objects, e.g. a match
        // at a text, which no file has)
        const schema = validate && !old && !gv.isDefinition4(raw) && !validate(raw) ? schemaErrors(validate.errors, raw) : [];
        const named = warnings.map(w => w.split(': ')[0]);
        const extra = schema.filter(([p]) => !named.some(n => n == p || p.startsWith(`${n}.`) || p.startsWith(`${n}[`) || n.startsWith(`${p}.`)));
        // `migrated`: a definition of 4.x, the warnings are the ones of its migration
        return Object.assign([...warnings, ...extra.map(([p, m]) => `${p || 'the definition'}: ${m}`)], { migrated: old });
    };
    return { check };
};
