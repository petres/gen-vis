export { isLegacy };

import { isObject } from '@/utils/values';

// the kinds of the props of 3.x, e.g. { "prop": "relative", ... }
const legacyProps = new Set(['fixed', 'ref', 'relative', 'steps', 'format', 'match']);

/**
 * A definition with constructs of 3.x, which the load migrates (see
 * utils/migrate.js): props of `prop` (e.g. { "prop": "relative" }).
 */
const isLegacy = def => {
    const visit = v => Array.isArray(v) ? v.some(visit)
        : isObject(v) && ((typeof v.prop == 'string' && legacyProps.has(v.prop)) || Object.values(v).some(visit));
    return visit(def);
};
