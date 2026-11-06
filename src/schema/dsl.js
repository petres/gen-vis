// a small vocabulary of the nodes of JSON Schema (draft-07), the schema of
// the definitions is written with it (see definition.js), so it is short
// and its texts are next to their rules; every function takes the text of
// the node (`description`, left out if undefined) and `more` keywords
export { describe, string, number, integer, boolean, nul, constant, choice, object, map, array, anyOf, oneOf, ref, pattern, text };

const describe = (node, description, more = {}) => ({ ...node, ...(description !== undefined ? { description } : {}), ...more });

const string = (description, more) => describe({ type: 'string' }, description, more);
const number = (description, more) => describe({ type: 'number' }, description, more);
const integer = (description, more) => describe({ type: 'integer' }, description, more);
const boolean = (description, more) => describe({ type: 'boolean' }, description, more);
const nul = description => describe({ type: 'null' }, description);
const constant = (value, description) => describe({ const: value }, description);
// one of the values
const choice = (values, description, more) => describe({ enum: values }, description, more);
// an object of the keys `properties`, other keys are unknown (`additional`
// false) or of a schema, e.g. the categories by their keys
const object = (properties, description, { additional = false, ...more } = {}) => describe({ type: 'object', additionalProperties: additional, properties }, description, more);
// an object of any keys of the values of a schema
const map = (values, description, more) => describe({ type: 'object', additionalProperties: values }, description, more);
const array = (items, description, more) => describe({ type: 'array', items }, description, more);
const anyOf = (branches, description, more) => describe({ anyOf: branches }, description, more);
const oneOf = (branches, description, more) => describe({ oneOf: branches }, description, more);
// a part of the definitions, e.g. "scale"
const ref = (name, description) => describe({ $ref: `#/definitions/${name}` }, description);
const pattern = (regex, description, more) => describe({ type: 'string', pattern: regex }, description, more);
// a text, also in several languages (see inLanguages)
const text = description => anyOf([{ type: 'string' }, ref('inLanguages')], description);
