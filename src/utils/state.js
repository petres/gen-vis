export { snapshot, diffState, applyState, applyGlobals };

import { sameValue } from "@/utils/def";

/**
 * The state of a visualisation is what the user can change: the globals of
 * the controls and the visible entries of the legends, e.g.
 * { globals: { column: "share" }, visible: { year: { "2019": false } } }
 */

// the controls of the user, not the hidden ones, their globals are set
// by the page, see applyGlobals
const userControls = def => (def.controls ?? []).filter(e => e.type != 'hidden');

// the complete state of a prepared definition
const snapshot = def => ({
    globals: Object.fromEntries(userControls(def).map(e => [e.global, def.globals?.[e.global]])),
    visible: Object.fromEntries(Object.entries(def.dims)
        .filter(([n, m]) => m.legend && m.categoryProps)
        .map(([n, m]) => [n, Object.fromEntries(Object.entries(m.categoryProps).map(([k, p]) => [k, p.visible]))])),
});

// the entries of the state which differ from the defaults, empty parts are omitted
const diffState = (state, defaults) => {
    const diff = {};
    const globals = Object.fromEntries(Object.entries(state.globals)
        .filter(([r, v]) => !sameValue(v, defaults.globals[r])));
    if (Object.keys(globals).length > 0)
        diff.globals = globals;

    const visible = Object.fromEntries(Object.entries(state.visible)
        .map(([n, keys]) => [n, Object.fromEntries(Object.entries(keys).filter(([k, v]) => v != (Object.hasOwn(defaults.visible[n] ?? {}, k) ? defaults.visible[n][k] : true)))])
        .filter(([n, keys]) => Object.keys(keys).length > 0));
    if (Object.keys(visible).length > 0)
        diff.visible = visible;

    return diff;
};

// a (partial) state is applied to the prepared definition, unknown globals,
// values, dims and entries are ignored, e.g. of an older definition
const applyState = (def, state) => {
    Object.entries(state?.globals ?? {}).forEach(([r, v]) => {
        const entry = userControls(def).filter(e => e.global == r)
            .flatMap(e => e.values).find(e => sameValue(e.value, v));
        if (entry)
            def.globals[r] = entry.value;
    });

    Object.entries(state?.visible ?? {}).forEach(([n, keys]) => {
        const m = Object.hasOwn(def.dims, n) ? def.dims[n] : null;
        if (!m?.legend || !m.categoryProps)
            return;
        Object.entries(keys ?? {}).forEach(([k, v]) => {
            if (Object.hasOwn(m.categoryProps, k))
                m.categoryProps[k].visible = Boolean(v);
        });
    });
};

// the globals of the page, e.g. the language, of a control (also a
// hidden one) only one of its values, other globals are set as they are,
// e.g. ones of the texts
const applyGlobals = (def, globals) => {
    Object.entries(globals ?? {}).forEach(([r, v]) => {
        const elements = (def.controls ?? []).filter(e => e.global == r);
        if (elements.length == 0) {
            def.globals[r] = v;
            return;
        }
        const entry = elements.flatMap(e => e.values).find(e => sameValue(e.value, v));
        if (entry)
            def.globals[r] = entry.value;
    });
};
