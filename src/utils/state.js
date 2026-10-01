export { snapshot, diffState, applyState };

import { sameValue } from "@/utils/json";

/**
 * The state of a visualisation is what the user can change: the globals of
 * the form elements and the visible entries of the legends, e.g.
 * { globals: { column: "share" }, visible: { year: { "2019": false } } }
 */

// the complete state of a prepared definition
const snapshot = def => ({
    globals: Object.fromEntries((def.formElements ?? []).map(e => [e.ref, def.globals?.[e.ref]])),
    visible: Object.fromEntries(Object.entries(def.mapping)
        .filter(([n, m]) => m.legend && m.props)
        .map(([n, m]) => [n, Object.fromEntries(Object.entries(m.props).map(([k, p]) => [k, p.visible]))])),
});

// the entries of the state which differ from the defaults, empty parts are omitted
const diffState = (state, defaults) => {
    const diff = {};
    const globals = Object.fromEntries(Object.entries(state.globals)
        .filter(([r, v]) => !sameValue(v, defaults.globals[r])));
    if (Object.keys(globals).length > 0)
        diff.globals = globals;

    const visible = Object.fromEntries(Object.entries(state.visible)
        .map(([n, keys]) => [n, Object.fromEntries(Object.entries(keys).filter(([k, v]) => v != defaults.visible[n]?.[k]))])
        .filter(([n, keys]) => Object.keys(keys).length > 0));
    if (Object.keys(visible).length > 0)
        diff.visible = visible;

    return diff;
};

// a (partial) state is applied to the prepared definition, unknown globals,
// values, mappings and entries are ignored, e.g. of an older definition
const applyState = (def, state) => {
    Object.entries(state?.globals ?? {}).forEach(([r, v]) => {
        const entry = (def.formElements ?? []).filter(e => e.ref == r)
            .flatMap(e => e.values).find(e => sameValue(e.value, v));
        if (entry && def.globals)
            def.globals[r] = entry.value;
    });

    Object.entries(state?.visible ?? {}).forEach(([n, keys]) => {
        const m = def.mapping[n];
        if (!m?.legend || !m.props)
            return;
        Object.entries(keys).forEach(([k, v]) => {
            if (k in m.props)
                m.props[k].visible = Boolean(v);
        });
    });
};
