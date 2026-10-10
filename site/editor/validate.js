// the errors of the JSON Schema of the package, e.g. typos of keys, without
// the summaries of the alternatives (oneOf, anyOf) and the ones the warnings of
// the package already name, e.g. an unknown plot type
import Ajv from 'ajv';
import schema from '@preschen/gen-vis/schema.json';

export { schemaErrors };

const validate = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false, verbose: true }).compile(schema);

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
    return [...new Set(errors
        // the type of an alternative which is not taken, e.g. a plot of a list of plots
        .filter(e => !(e.keyword == 'type' && errors.some(o => o.instancePath.startsWith(`${e.instancePath}/`))))
        .filter(e => !(e.keyword == 'enum' && warnings.some(w => w.includes(`'${e.data}'`))))
        .map(message))]
        .slice(0, 8);
};
