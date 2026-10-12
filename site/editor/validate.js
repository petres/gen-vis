// the errors of the JSON Schema of the package, e.g. typos of keys, without
// the summaries of the alternatives (oneOf, anyOf) and the ones the warnings of
// the package already name, e.g. an unknown plot type
import Ajv from 'ajv';
import schema from '@preschen/gen-vis/schema.json';

export { schemaErrors };

const validate = new Ajv({ allErrors: true, strict: false, verbose: true }).compile(schema);

const message = e => {
    const path = e.instancePath || 'the definition';
    if (e.keyword == 'additionalProperties')
        return `${path}: unknown key "${e.params.additionalProperty}"`;
    if (e.keyword == 'enum') {
        const values = e.params.allowedValues;
        return values.length > 6
            ? `${path}: ${JSON.stringify(e.data)} is none of the ${values.length} values of the schema`
            : `${path}: one of ${values.map(v => JSON.stringify(v)).join(', ')}`;
    }
    return `${path}: ${e.message}`;
};

const schemaErrors = (def, warnings = []) => {
    if (validate(def))
        return [];
    const errors = validate.errors.filter(e => !['oneOf', 'anyOf', 'if'].includes(e.keyword));
    // the types of the alternatives of a value are one error, e.g. a number or
    // a boolean, also a reference of a string, e.g. "@height"
    const types = new Map();
    const reference = e => e.keyword == 'pattern' && e.params.pattern == '^@';
    errors.filter(e => e.keyword == 'type' || reference(e)).forEach(e =>
        types.set(e.instancePath, [...(types.get(e.instancePath) ?? []), reference(e) ? 'a reference "@name"' : e.params.type]));
    return [...new Set(errors
        .filter(e => !reference(e) || !errors.some(o => o.keyword == 'type' && o.instancePath == e.instancePath))
        // the type of an alternative which is not taken, e.g. a plot of a list of plots
        .filter(e => !(e.keyword == 'type' && errors.some(o => o.instancePath.startsWith(`${e.instancePath}/`))))
        .filter(e => !(e.keyword == 'enum' && warnings.some(w => w.includes(`'${e.data}'`))))
        .map(e => e.keyword == 'type' || reference(e) ? `${e.instancePath || 'the definition'}: must be ${types.get(e.instancePath).join(' or ')}` : message(e)))]
        .slice(0, 8);
};
