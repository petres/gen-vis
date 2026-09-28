export { validateDef, plotTypes };

import * as d3 from "d3";
import * as eu from "@/utils/else.js";

// the plot types implemented by Facet.vue
const plotTypes = ['svg:path', 'svg:circle', 'svg:line', 'svg:rect', 'svg:text', 'base:area', 'bar', 'stackedBar'];

const mappingTypes = ['numeric', 'date', 'categorical'];
const orientations = ['horizontal', 'vertical'];
const positions = ['top', 'bottom', 'left', 'right'];
const propKinds = ['fixed', 'ref', 'relative', 'steps'];

const list = a => a.map(e => `'${e}'`).join(', ');

// objects are nested props unless they have a `prop` key
const checkProp = (value, path, warn) => {
    if (value === null || typeof value != 'object' || Array.isArray(value))
        return;
    if ('prop' in value) {
        if (!propKinds.includes(value.prop))
            warn(path, `unknown prop '${value.prop}', expected one of ${list(propKinds)}`);
        else if (value.prop != 'fixed' && typeof value.ref != 'string')
            warn(path, `a '${value.prop}' prop needs a 'ref'`);
        return;
    }
    const keys = ['ratio', 'steps', 'ref', 'mode'].filter(k => k in value);
    if (keys.length > 0)
        return warn(path, `has ${list(keys)} but no 'prop', so it is not evaluated`);
    Object.entries(value).forEach(([k, v]) => checkProp(v, `${path}.${k}`, warn));
};

/**
 * Returns warnings for common mistakes in a (merged) definition, e.g. unknown
 * plot types or props which are not evaluated.
 */
const validateDef = def => {
    const warnings = [];
    const warn = (path, message) => warnings.push(`${path}: ${message}`);
    const mapping = def.mapping ?? {};

    if (!def.mapping)
        warn('mapping', 'missing');

    Object.entries(mapping).forEach(([n, m]) => {
        const path = `mapping.${n}`;
        if (typeof m.column != 'string')
            warn(path, `no 'column'`);
        if (m.type !== undefined && !mappingTypes.includes(m.type))
            warn(`${path}.type`, `unknown type '${m.type}', expected one of ${list(mappingTypes)}`);
        if (m.props && !m.props.manual)
            warn(`${path}.props`, `expected 'manual' (and optional 'common') entries`);
        if (m.scale) {
            const type = m.scale.type ?? 'linear';
            const scale = d3[`scale${eu.capitalize(type)}`];
            if (typeof scale != 'function') {
                warn(`${path}.scale.type`, `unknown d3 scale '${type}'`);
            } else {
                // e.g. linear or time vs. point or band
                const continuous = typeof scale().ticks == 'function';
                if (continuous != ['numeric', 'date'].includes(m.type))
                    warn(`${path}.scale.type`, `a ${type} scale does not fit the type '${m.type}'`);
            }
            if (m.scale.orientation !== undefined && !orientations.includes(m.scale.orientation))
                warn(`${path}.scale.orientation`, `unknown orientation '${m.scale.orientation}', expected one of ${list(orientations)}`);
        }
        if (m.axis) {
            if (!m.scale)
                warn(`${path}.axis`, `an axis needs a 'scale'`);
            if (!positions.includes(m.axis.position))
                warn(`${path}.axis.position`, `unknown position '${m.axis.position}', expected one of ${list(positions)}`);
            checkProp(m.axis.ticks, `${path}.axis.ticks`, warn);
        }
    });

    const plots = [].concat(def.plot ?? []);
    if (plots.length == 0)
        warn('plot', 'missing');
    plots.forEach((p, i) => {
        const path = `plot[${i}]`;
        if (!plotTypes.includes(p.type))
            warn(`${path}.type`, `unknown type '${p.type}', expected one of ${list(plotTypes)}`);
        (p.categories ?? []).filter(c => !(c in mapping)).forEach(c =>
            warn(`${path}.categories`, `unknown mapping '${c}'`));
        checkProp(p.props, `${path}.props`, warn);
    });

    if (def.facets && !(def.facets.dim in mapping))
        warn('facets.dim', `unknown mapping '${def.facets.dim}'`);

    checkProp(def.options?.height, 'options.height', warn);
    checkProp(def.facets?.cols, 'facets.cols', warn);

    return warnings;
};
