export { migrate, migrateExpr };

import { isObject } from '@/utils/values';

/**
 * The migration of a definition of 3.x to 4.0, see docs/design-4.0.md, a
 * definition of 4.0 stays as it is (migrate is idempotent), so a definition
 * of both, e.g. of a parent of 3.x, is migrated as well. It is loaded with
 * the check (`@preschen/gen-vis/check`) and by the load of a definition with
 * constructs of 3.x, see isLegacy of utils/normalize.js.
 */

// a value which is not evaluated: texts of references, objects and lists as
// `literal`, others as they are
const literal = v => (typeof v == 'string' && v.startsWith('@')) || (v !== null && typeof v == 'object') ? { literal: v } : v;

// the 3.x props of a reference (`ref`) or of another prop (`of`)
const source = raw => 'of' in raw ? migrateExpr(raw.of) : `@${raw.ref}`;

/**
 * The expressions of 4.0 of the props of 3.x, also nested ones:
 * { "prop": "relative", "ref": "x", "ratio": 2, "offset": 1 } is
 * { "+": [{ "*": ["@x", 2] }, 1] }, `steps` are an object of their cuts,
 * ascending, `fixed` is `literal`.
 */
const migrateExpr = raw => {
    if (Array.isArray(raw))
        return raw.map(migrateExpr);
    if (!isObject(raw))
        return raw;
    if (!('prop' in raw) || typeof raw.prop != 'string')
        return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, migrateExpr(v)]));
    switch (raw.prop) {
        case 'ref':
            return source(raw);
        case 'relative': {
            const ratio = raw.ratio ?? 1;
            const offset = raw.offset ?? 0;
            const scaled = ratio === 1 ? source(raw) : { '*': [source(raw), ratio] };
            return offset === 0 ? scaled : { '+': [scaled, offset] };
        }
        case 'steps': {
            const steps = [...(raw.steps ?? [])].sort((a, b) => a.cut - b.cut);
            return { steps: [source(raw), Object.fromEntries(steps.map(s => [String(s.cut), literal(s.value)]))] };
        }
        case 'format':
            return { format: [source(raw), raw.format] };
        case 'match': {
            const cases = Object.fromEntries(Object.entries(raw.cases ?? {}).map(([k, v]) => [k, migrateExpr(v)]));
            return { match: [source(raw), cases, ...(raw.default === undefined ? [] : [migrateExpr(raw.default)])] };
        }
    }
    return literal(raw.value);
};

// the definition of 4.0 of one of 3.x
const migrate = def => migrateExpr(def);
