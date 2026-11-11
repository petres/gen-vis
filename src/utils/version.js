export { schemaUrl, versionError, languageError };

// the version of the definition language of a definition is its `$schema`,
// the url of the schema of gen-vis which editors validate it with, the
// `$id` of schema.json
const schemaUrl = 'https://unpkg.com/@preschen/gen-vis@5/schema.json';

/**
 * The major version of gen-vis of a `$schema`: a url or a path which ends in
 * `@preschen/gen-vis@<version>/schema.json`, e.g. of unpkg or jsdelivr, the
 * version a major one or a full one (`@5`, `@5.1`, `@5.0.2`,
 * `@5.0.0-alpha.1`), or the schema.json of the installed package
 * (`node_modules/@preschen/gen-vis/schema.json`, also a relative path), the
 * one of this version. Undefined of a schema of gen-vis without a version
 * (the newest one, e.g. https://unpkg.com/@preschen/gen-vis/schema.json),
 * null of any other value, e.g. the schema of another library.
 */
const schemaMajor = schema => {
    const m = typeof schema == 'string' ? /@preschen\/gen-vis(?:@(\d+)(?:[.-][\w.+-]*)?)?\/schema\.json$/.exec(schema) : null;
    if (!m)
        return null;
    if (m[1] !== undefined)
        return Number(m[1]);
    return /(^|\/)node_modules\/@preschen\/gen-vis\/schema\.json$/.test(schema) ? 5 : undefined;
};

/**
 * Why a definition of its `$schema` is none of gen-vis 5, e.g. "its $schema
 * is the one of gen-vis 4", null if it is one. A definition file needs one
 * (`required`), an inline definition may have none.
 */
const versionError = (schema, required = false) => {
    if (schema === undefined && !required)
        return null;
    const major = schemaMajor(schema);
    if (major === 5)
        return null;
    const reason = schema === undefined ? 'its $schema is missing'
        : major === undefined ? `its $schema ${JSON.stringify(schema)} names no major version of gen-vis`
            : major === null ? `its $schema ${JSON.stringify(schema)} is none of gen-vis`
                : `its $schema is the one of gen-vis ${major}`;
    return `${reason}, e.g. "$schema": "${schemaUrl}", see the changelog of gen-vis 5.0.0 of the changes of the definitions`;
};

// the keys of the definition language of gen-vis 4, gen-vis 5 reads none of them
const keys4 = ['mapping', 'plot', 'formElements', 'options'];

/**
 * Why a definition (or a part of one, e.g. a parent) is none of gen-vis 5
 * by its keys: it has the ones of gen-vis 4, e.g. 'a definition of gen-vis
 * 4 (its "mapping", "plot"): …', null if it has none of them. It is not
 * read, see checkVersion of utils/load.js and validateDef.
 */
const languageError = def => {
    const found = def !== null && typeof def == 'object' ? keys4.filter(k => def[k] !== undefined) : [];
    return found.length ? `a definition of gen-vis 4 (its ${found.map(k => `"${k}"`).join(', ')}): gen-vis 5 reads "dims", "marks", "controls" and the options at the top level, see "Upgrading from 4.x" of the changelog of gen-vis 5.0.0` : null;
};
