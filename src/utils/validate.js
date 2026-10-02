export { validateDef, curveNames };

import * as d3 from "d3";
import * as eu from "@/utils/else.js";
import { templateRefs } from "@/utils/json.js";
import { curves } from "@/utils/plot.js";
import { plotTypes } from "@/plots";
import { coords } from "@/coords";
import { dataFormats } from "@/utils/data.js";

// the interpolations of the plot types with a curve, e.g. svg:path
const curveNames = Object.keys(curves);

const mappingTypes = ['numeric', 'date', 'categorical'];
const formElementTypes = ['switch', 'select'];
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

    // the plot types and coordinate systems known at the time of the check,
    // also registered ones
    const types = Object.keys(plotTypes);
    const curvePlots = types.filter(t => plotTypes[t].curve);
    const coordName = def.options?.coord ?? 'cartesian';
    if (!Object.hasOwn(coords, coordName))
        warn('options.coord', `unknown coordinate system '${coordName}', expected one of ${list(Object.keys(coords))}`);
    const coord = coords[coordName] ?? coords.cartesian;
    const orientations = Object.keys(coord.ranges);

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
                // e.g. linear, time or threshold vs. point or band
                const continuous = typeof scale().ticks == 'function' || typeof scale().invertExtent == 'function';
                if (continuous != ['numeric', 'date'].includes(m.type))
                    warn(`${path}.scale.type`, `a ${type} scale does not fit the type '${m.type}'`);
                if (m.scale.interpolator !== undefined && typeof scale().interpolator != 'function')
                    warn(`${path}.scale.interpolator`, `a ${type} scale has no interpolator, e.g. a sequential one has`);
            }
            if (m.scale.interpolator !== undefined && typeof d3[`interpolate${eu.capitalize(String(m.scale.interpolator))}`] != 'function')
                warn(`${path}.scale.interpolator`, `unknown d3 interpolator '${m.scale.interpolator}', e.g. 'Blues'`);
            if (m.scale.scheme !== undefined && !Array.isArray(d3[`scheme${eu.capitalize(String(m.scale.scheme))}`]))
                warn(`${path}.scale.scheme`, `unknown d3 scheme '${m.scale.scheme}', e.g. 'Blues'`);
            if (type == 'threshold' && !(Array.isArray(m.scale.domain) && m.scale.domain.every(v => v !== null)))
                warn(`${path}.scale.domain`, `a threshold scale needs the values between its classes`);
            if (m.scale.orientation !== undefined && !orientations.includes(m.scale.orientation))
                warn(`${path}.scale.orientation`, `unknown orientation '${m.scale.orientation}', expected one of ${list(orientations)}`);
        }
        if (m.axis) {
            if (!m.scale)
                warn(`${path}.axis`, `an axis needs a 'scale'`);
            if (!coord.positions.includes(m.axis.position))
                warn(`${path}.axis.position`, `unknown position '${m.axis.position}', expected one of ${list(coord.positions)}`);
            checkProp(m.axis.ticks, `${path}.axis.ticks`, warn);
        }
    });

    const plots = [].concat(def.plot ?? []);
    if (plots.length == 0)
        warn('plot', 'missing');
    plots.forEach((p, i) => {
        const path = `plot[${i}]`;
        if (!types.includes(p.type))
            warn(`${path}.type`, `unknown type '${p.type}', expected one of ${list(types)}`);
        else if (plotTypes[p.type].coords && !plotTypes[p.type].coords.includes(coordName))
            warn(`${path}.type`, `not available in the coordinate system '${coordName}'`);
        (p.categories ?? []).filter(c => !(c in mapping)).forEach(c =>
            warn(`${path}.categories`, `unknown mapping '${c}'`));
        if (p.curve !== undefined && !curveNames.includes(p.curve))
            warn(`${path}.curve`, `unknown curve '${p.curve}', expected one of ${list(curveNames)}`);
        else if (p.curve !== undefined && types.includes(p.type) && !curvePlots.includes(p.type))
            warn(`${path}.curve`, `only used by ${list(curvePlots)}`);
        checkProp(p.props, `${path}.props`, warn);
    });

    if (coordName == 'geo') {
        if (typeof def.geo?.data != 'string' && typeof def.geo?.data != 'object')
            warn('geo.data', `a map needs its geometry, GeoJSON or TopoJSON or their url`);
        if (def.geo?.join !== undefined && !(def.geo.join in mapping))
            warn('geo.join', `unknown mapping '${def.geo.join}'`);
        const projection = def.geo?.projection?.type ?? 'mercator';
        if (typeof d3[`geo${eu.capitalize(projection)}`] != 'function')
            warn('geo.projection.type', `unknown d3 projection '${projection}', e.g. 'mercator' or 'conicConformal'`);
    }

    Object.keys(def.filter ?? {}).filter(n => !(n in mapping)).forEach(n =>
        warn(`filter.${n}`, `unknown mapping '${n}'`));

    (def.formElements ?? []).forEach((e, i) => {
        if (!formElementTypes.includes(e.type))
            warn(`formElements[${i}].type`, `unknown type '${e.type}', expected one of ${list(formElementTypes)}`);
        // parts of entries are patches of a parent, the merged ones are complete
        if (typeof e.ref != 'string')
            warn(`formElements[${i}].ref`, `no global`);
        (e.values ?? []).filter(v => !('value' in v)).forEach(v =>
            warn(`formElements[${i}].values`, `no value of '${v.id}'`));
    });

    if (def.facets) {
        const dims = [].concat(def.facets.dim ?? []);
        if (dims.length != 1)
            warn('facets.dim', `expected the name of one mapping`);
        dims.filter(d => !(d in mapping)).forEach(d => warn('facets.dim', `unknown mapping '${d}'`));
    }

    // column templates, e.g. "{values}{share}", need the globals
    const checkTemplate = (column, path) => templateRefs(column).filter(r => !(r in (def.globals ?? {}))).forEach(r =>
        warn(path, `unknown global '${r}' in the column template`));
    Object.entries(mapping).forEach(([n, m]) => checkTemplate(m.column, `mapping.${n}.column`));
    (def.formElements ?? []).forEach((e, i) => (e.values ?? []).forEach((v, j) =>
        Object.entries(v.mapping ?? {}).forEach(([n, m]) =>
            checkTemplate(m.column, `formElements[${i}].values[${j}].mapping.${n}.column`))));

    if (def.dataFormat !== undefined && !dataFormats.includes(def.dataFormat))
        warn('dataFormat', `unknown format '${def.dataFormat}', expected one of ${list(dataFormats)}`);

    checkProp(def.options?.height, 'options.height', warn);
    checkProp(def.facets?.cols, 'facets.cols', warn);

    return warnings;
};
