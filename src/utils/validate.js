export { validateDef, curveNames };

import * as d3 from "@/utils/d3";
import { dataFormats } from "@/utils/data";
import { getLocale } from "@/utils/locale";
import { symbolShortcuts, templateRefs } from "@/utils/def";
import { curves } from "@/utils/draw";
import { plotTypes } from "@/plots";
import { coords } from "@/coords";
import { annotationKeys } from "@/coords/annotations.js";
import { projectionNames } from "@/coords/geo.js";
import { transformTypes } from "@/utils/transform";

// the interpolations of the plot types with a curve, e.g. cartesian:line
const curveNames = Object.keys(curves);

const mappingTypes = ['numeric', 'date', 'categorical'];
const formElementTypes = ['radio', 'select', 'slider'];
const propKinds = ['fixed', 'ref', 'relative', 'steps', 'format'];

const list = a => a.map(e => `'${e}'`).join(', ');

// the names of a template of html, e.g. "land.unit" of "{land.unit}"
const templateNames = text => typeof text == 'string' ? [...text.matchAll(/\{([\w.-]+)\}/g)].map(m => m[1]) : [];

// a reference to a name which is not known where it is used is undefined,
// short lists of the known names are part of the warning
const checkRef = (ref, path, warn, names) => {
    if (!names || names.has(ref))
        return;
    const known = names.size <= 12 ? `, expected one of ${list([...names])}` : '';
    warn(path, `unknown reference '${ref}'${known}`);
};

// objects are nested props unless they have a `prop` key, `names` are the
// names of the references known at the place of the props
const checkProp = (value, path, warn, names = null) => {
    if (typeof value == 'string' && value.charAt() == '@')
        return checkRef(value.substring(1), path, warn, names);
    if (value === null || typeof value != 'object' || Array.isArray(value))
        return;
    if ('prop' in value) {
        if (!propKinds.includes(value.prop))
            warn(path, `unknown prop '${value.prop}', expected one of ${list(propKinds)}`);
        else if (value.prop != 'fixed' && typeof value.ref != 'string')
            warn(path, `a '${value.prop}' prop needs a 'ref'`);
        else if (value.prop == 'format' && typeof value.format != 'string')
            warn(path, `a 'format' prop needs a 'format', e.g. ",.1f"`);
        else if (value.prop != 'fixed')
            checkRef(value.ref, path, warn, names);
        return;
    }
    const keys = ['ratio', 'steps', 'ref', 'mode', 'format'].filter(k => k in value);
    if (keys.length > 0)
        return warn(path, `has ${list(keys)} but no 'prop', so it is not evaluated`);
    Object.entries(value).forEach(([k, v]) => checkProp(v, `${path}.${k}`, warn, names));
};

// the values of the rows of a mapping, e.g. `x:scaled`, see rowValue of
// layout.js
const rowNames = (n, m) => [
    n,
    `${n}:formatted`,
    ...(m.scale ? [`${n}:scaled`, `${n}:scaled:center`, `${n}:scaled:0`, `${n}:scaled:min`, `${n}:scaled:max`] : []),
    ...(m.stacked ? [`${n}:start`, `${n}:end`] : []),
    ...(m.stacked && m.scale ? [`${n}:start:scaled`, `${n}:end:scaled`, `${n}:height:scaled`] : []),
];

// the props of the categories of a mapping, `name` and `visible` are set by
// default, `color` by a scheme
const categoryNames = m => m?.props ? ['name', 'visible', ...(m.props.scheme ? ['color'] : []),
    ...Object.keys(m.props.common ?? {}),
    ...[m.props.ranks ?? []].flat().flatMap(e => Object.keys(e ?? {})),
    ...Object.values(m.props.categories ?? {}).flatMap(e => Object.keys(e ?? {}))] : [];

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

    // the names of the references, see README "Props": everywhere the globals
    // (also the ones of form elements) and the width of the visualisation, in
    // a facet its sizes, in a plot the props of its categories and the rows,
    // in a range the sizes of the coordinate system, e.g. `radius`
    const globalNames = [
        ...Object.keys(def.globals ?? {}),
        ...(def.formElements ?? []).map(e => e.ref).filter(r => typeof r == 'string'),
        'totalWidth',
    ];
    const facetNames = [...globalNames, 'width', 'innerWidth', 'height', 'innerHeight'];
    const names = {
        global: new Set(globalNames),
        facet: new Set(facetNames),
        category: n => new Set([...globalNames, ...categoryNames(mapping[n])]),
        plot: categories => new Set([
            ...facetNames,
            ...Object.entries(mapping).flatMap(([n, m]) => rowNames(n, m ?? {})),
            ...categories.flatMap(c => categoryNames(mapping[c])),
        ]),
        range: new Set([...facetNames, ...Object.keys(coord.dims?.(1, 1) ?? {})]),
    };

    Object.entries(mapping).forEach(([n, m]) => {
        const path = `mapping.${n}`;
        if (typeof m.column != 'string')
            warn(path, `no 'column'`);
        if (m.type !== undefined && !mappingTypes.includes(m.type))
            warn(`${path}.type`, `unknown type '${m.type}', expected one of ${list(mappingTypes)}`);
        // the names of the alphas before, the categories were `manual`
        if (m.props?.manual !== undefined)
            warn(`${path}.props.manual`, `renamed to 'categories'`);
        else if (m.props && !m.props.categories && !m.props.fromData)
            warn(`${path}.props`, `expected 'categories' or the ones of the data ('fromData'), and optional 'common' props`);
        const order = m.props?.order;
        if (order !== undefined && order != 'ascending' && order != 'descending' && !Array.isArray(order))
            warn(`${path}.props.order`, `expected 'ascending', 'descending' or a list of keys`);
        if (m.props?.ranks !== undefined && !(Array.isArray(m.props.ranks) && m.props.ranks.every(r => r !== null && typeof r == 'object' && !Array.isArray(r))))
            warn(`${path}.props.ranks`, `expected a list of props, of the first category, the second one, ...`);
        if (m.props?.scheme !== undefined && !d3.named(d3.schemeNames, m.props.scheme))
            warn(`${path}.props.scheme`, `unknown scheme '${m.props.scheme}', e.g. 'Tableau10'`);
        if (m.scale) {
            const type = m.scale.type ?? 'linear';
            const scale = d3.named(d3.scales, type);
            if (!scale) {
                warn(`${path}.scale.type`, `unknown scale '${type}', e.g. 'linear', 'time' or 'band'`);
            } else {
                // e.g. linear, time or threshold vs. point or band
                const continuous = typeof scale().ticks == 'function' || typeof scale().invertExtent == 'function';
                if (continuous != ['numeric', 'date'].includes(m.type))
                    warn(`${path}.scale.type`, `a ${type} scale does not fit the type '${m.type}'`);
                if (m.scale.interpolator !== undefined && typeof scale().interpolator != 'function')
                    warn(`${path}.scale.interpolator`, `a ${type} scale has no interpolator, e.g. a sequential one has`);
            }
            if (m.scale.interpolator !== undefined && !d3.named(d3.interpolatorNames, m.scale.interpolator))
                warn(`${path}.scale.interpolator`, `unknown interpolator '${m.scale.interpolator}', e.g. 'Blues'`);
            if (m.scale.scheme !== undefined && !d3.named(d3.schemeNames, m.scale.scheme))
                warn(`${path}.scale.scheme`, `unknown scheme '${m.scale.scheme}', e.g. 'Blues'`);
            if (type == 'threshold' && !(Array.isArray(m.scale.domain) && m.scale.domain.every(v => v !== null)))
                warn(`${path}.scale.domain`, `a threshold scale needs the values between its classes`);
            if (Array.isArray(m.scale.range))
                m.scale.range.forEach((v, j) => checkProp(v, `${path}.scale.range[${j}]`, warn, names.range));
            [m.scale.inset].flat().forEach((v, j) => checkProp(v, `${path}.scale.inset`, warn, names.range));
            if (Array.isArray(m.scale.domain))
                m.scale.domain.forEach((v, j) => checkProp(v, `${path}.scale.domain[${j}]`, warn, names.facet));
            if (m.scale.orientation !== undefined && !orientations.includes(m.scale.orientation))
                warn(`${path}.scale.orientation`, orientations.length > 0
                    ? `unknown orientation '${m.scale.orientation}', expected one of ${list(orientations)}`
                    : `the coordinate system '${coordName}' has no orientations, e.g. a scale of colors has none`);
        }
        if (m.axis) {
            if (!m.scale)
                warn(`${path}.axis`, `an axis needs a 'scale'`);
            if (!coord.positions.includes(m.axis.position))
                warn(`${path}.axis.position`, `unknown position '${m.axis.position}', expected one of ${list(coord.positions)}`);
            checkProp(m.axis.ticks, `${path}.axis.ticks`, warn, names.facet);
            checkProp(m.axis.tickSpacing, `${path}.axis.tickSpacing`, warn, names.facet);
        }
        // the props of the legend and the hover of the categories
        if (m.props) {
            checkProp(m.legend?.props, `${path}.legend.props`, warn, names.category(n));
            checkProp(m.hover?.props, `${path}.hover.props`, warn, names.category(n));
            [].concat(m.legend?.symbol?.elements ?? []).forEach((e, j) =>
                checkProp(e?.props, `${path}.legend.symbol.elements[${j}].props`, warn, names.category(n)));
            const symbol = m.legend?.symbol;
            const shortcut = typeof symbol == 'string' ? symbol : symbol?.type;
            if (shortcut !== undefined && !symbolShortcuts.includes(shortcut))
                warn(`${path}.legend.symbol`, `unknown symbol '${shortcut}', expected one of ${list(symbolShortcuts)} or the svg 'elements'`);
            checkProp(symbol?.props, `${path}.legend.symbol.props`, warn, names.category(n));
        }
    });

    const plots = [].concat(def.plot ?? []);
    if (plots.length == 0)
        warn('plot', 'missing');
    plots.forEach((p, i) => {
        const path = `plot[${i}]`;
        if (!types.includes(p.type))
            warn(`${path}.type`, `unknown type '${p.type}', expected one of ${list(types)}`);
        else if (plotTypes[p.type].coords && coordName in coords && !plotTypes[p.type].coords.includes(coordName))
            warn(`${path}.type`, `not available in the coordinate system '${coordName}'`);
        (p.categories ?? []).filter(c => !(c in mapping)).forEach(c =>
            warn(`${path}.categories`, `unknown mapping '${c}'`));
        if (p.highlight !== undefined && !['group', 'row'].includes(p.highlight))
            warn(`${path}.highlight`, `unknown highlight '${p.highlight}', expected one of 'group', 'row'`);
        if (p.curve !== undefined && !curveNames.includes(p.curve))
            warn(`${path}.curve`, `unknown curve '${p.curve}', expected one of ${list(curveNames)}`);
        else if (p.curve !== undefined && types.includes(p.type) && !curvePlots.includes(p.type))
            warn(`${path}.curve`, `only used by ${list(curvePlots)}`);
        // the data of the plot: rows of the definition, their names are known
        // to the props, their values are props of the facet, or a url
        const rows = Array.isArray(p.data) ? p.data : [];
        if (p.data !== undefined && typeof p.data != 'string' && !(Array.isArray(p.data) && p.data.every(r => r !== null && typeof r == 'object' && !Array.isArray(r))))
            warn(`${path}.data`, `expected a list of rows or the url of the data`);
        rows.forEach((r, j) => Object.entries(r ?? {}).forEach(([k, v]) => checkProp(v, `${path}.data[${j}].${k}`, warn, names.facet)));
        if (p.dataFormat !== undefined && !dataFormats.includes(p.dataFormat))
            warn(`${path}.dataFormat`, `unknown format '${p.dataFormat}', expected one of ${list(dataFormats)}`);
        if (p.select !== undefined && !['first', 'last'].includes(p.select)) {
            const [kind, name] = Object.entries(typeof p.select == 'object' && p.select ? p.select : {})[0] ?? [];
            if (!['min', 'max'].includes(kind))
                warn(`${path}.select`, `expected 'first', 'last' or the min or max of a mapping, e.g. { "max": "x" }`);
            else if (!(name in mapping))
                warn(`${path}.select.${kind}`, `unknown mapping '${name}'`);
        }
        if (p.dodge !== undefined && (typeof p.dodge != 'number' || p.type != 'svg:text'))
            warn(`${path}.dodge`, `the distance of the texts of a plot of 'svg:text', a number`);
        if (p.layer !== undefined && !['below', 'above'].includes(p.layer))
            warn(`${path}.layer`, `unknown layer '${p.layer}', expected one of 'below', 'above'`);
        // the annotations of the coordinate system, e.g. no bands of maps
        const annotation = typeof p.type == 'string' && p.type.startsWith('annotation:') && p.type.substring(11);
        if (annotation && types.includes(p.type) && !(coord.annotations ?? []).includes(annotation))
            warn(`${path}.type`, `not available in the coordinate system '${coordName}'`);
        // the names of the rows of a url are not known
        const plotNames = typeof p.data == 'string' ? null
            : new Set([...names.plot((p.categories ?? []).filter(c => c in mapping)), ...rows.flatMap(r => Object.keys(r ?? {}))]);
        checkProp(p.props, `${path}.props`, warn, plotNames);
    });

    if (coordName == 'geo') {
        if (typeof def.geo?.data != 'string' && typeof def.geo?.data != 'object')
            warn('geo.data', `a map needs its geometry, GeoJSON or TopoJSON or their url`);
        if (def.geo?.join !== undefined && !(def.geo.join in mapping))
            warn('geo.join', `unknown mapping '${def.geo.join}'`);
        const projection = def.geo?.projection?.type ?? 'mercator';
        if (!d3.named(Object.fromEntries(projectionNames.map(n => [n, true])), projection))
            warn('geo.projection.type', `unknown projection '${projection}', expected one of ${list(projectionNames)}`);
    }

    Object.keys(def.filter ?? {}).filter(n => !(n in mapping)).forEach(n =>
        warn(`filter.${n}`, `unknown mapping '${n}'`));
    Object.entries(def.filter ?? {}).forEach(([n, v]) => checkProp(v, `filter.${n}`, warn, names.global));

    // the values of an annotation are of mappings with a scale, of maps `lon` and `lat`
    const annotationTypes = coord.annotations ?? [];
    [].concat(def.annotations ?? []).forEach((a, i) => {
        const path = `annotations[${i}]`;
        if (!annotationTypes.includes(a.type))
            warn(`${path}.type`, `unknown type '${a.type}', expected one of ${list(annotationTypes)}`);
        Object.keys(a).filter(k => !annotationKeys.includes(k)).forEach(k => {
            if (!(k in mapping))
                warn(`${path}.${k}`, `unknown mapping '${k}'`);
            else if (!mapping[k].scale)
                warn(`${path}.${k}`, `the mapping has no scale`);
            // the values can be references, e.g. to a global
            [a[k]].flat().forEach(v => checkProp(v, `${path}.${k}`, warn, names.facet));
        });
        if (coordName == 'geo' && !(typeof a.lon == 'number' && typeof a.lat == 'number'))
            warn(path, `an annotation of a map needs 'lon' and 'lat'`);
        checkProp(a.props, `${path}.props`, warn, names.facet);
    });

    (def.formElements ?? []).forEach((e, i) => {
        // radio buttons were `switch` in the alphas before
        if (e.type == 'switch')
            warn(`formElements[${i}].type`, `'switch' is renamed to 'radio'`);
        else if (!formElementTypes.includes(e.type))
            warn(`formElements[${i}].type`, `unknown type '${e.type}', expected one of ${list(formElementTypes)}`);
        // parts of entries are patches of a parent, the merged ones are complete
        if (typeof e.ref != 'string')
            warn(`formElements[${i}].ref`, `no global`);
        // a list of entries or the values of a column of the data
        if (e.values !== undefined && !Array.isArray(e.values) && typeof e.values?.column != 'string')
            warn(`formElements[${i}].values`, `expected a list of entries or the column of the values, e.g. { "column": "year" }`);
        (Array.isArray(e.values) ? e.values : []).filter(v => !('value' in v)).forEach(v =>
            warn(`formElements[${i}].values`, `no value of '${v.id}'`));
    });

    if (def.facets) {
        if (typeof def.facets.dim != 'string')
            warn('facets.dim', `expected the name of a mapping`);
        else if (!(def.facets.dim in mapping))
            warn('facets.dim', `unknown mapping '${def.facets.dim}'`);
    }

    // column templates, e.g. "{values}{share}", need the globals
    const checkTemplate = (column, path) => templateRefs(column).filter(r => !(r in (def.globals ?? {}))).forEach(r =>
        warn(path, `unknown global '${r}' in the column template`));
    Object.entries(mapping).forEach(([n, m]) => checkTemplate(m.column, `mapping.${n}.column`));
    // and the ones of the texts, e.g. "Durchschnitt {base} = 100" of the subtitle
    const checkText = (text, path) => templateRefs(text).filter(r => !(r in (def.globals ?? {}))).forEach(r =>
        warn(path, `unknown global '${r}' in the text`));
    ['title', 'subtitle', 'footer'].forEach(o => checkText(def.options?.[o], `options.${o}`));
    // the templates of the hover, the names of the title and of a row, e.g. {land.unit}
    const hover = def.options?.hover ?? {};
    const checkHover = (template, path, known) => templateNames(template).filter(r => !known(r)).forEach(r =>
        warn(path, `unknown name '${r}' in the template`));
    const isGlobal = r => r in (def.globals ?? {});
    checkHover(hover.title, 'options.hover.title', r => r == 'title' || isGlobal(r));
    if (hover.mode !== undefined && !['position', 'point'].includes(hover.mode))
        warn('options.hover.mode', `unknown mode '${hover.mode}', expected one of 'position', 'point'`);
    checkHover(hover.row, 'options.hover.row', r => isGlobal(r) || r.split('.')[0] in mapping);
    Object.entries(mapping).forEach(([n, m]) => {
        checkText(m.name, `mapping.${n}.name`);
        checkText(m.axis?.title?.name, `mapping.${n}.axis.title.name`);
        checkText(m.legend?.missing?.name, `mapping.${n}.legend.missing.name`);
        checkText(m.props?.common?.name, `mapping.${n}.props.common.name`);
        Object.entries(m.props?.categories ?? {}).forEach(([k, e]) => checkText(e?.name, `mapping.${n}.props.categories.${k}.name`));
    });
    [].concat(def.annotations ?? []).forEach((a, i) => ['label', 'text'].forEach(k => checkText(a[k], `annotations[${i}].${k}`)));
    (def.formElements ?? []).forEach((e, i) => (Array.isArray(e.values) ? e.values : []).forEach((v, j) =>
        Object.entries(v.mapping ?? {}).forEach(([n, m]) =>
            checkTemplate(m.column, `formElements[${i}].values[${j}].mapping.${n}.column`))));

    // a built-in locale or a language of Intl, e.g. "fr"
    const locale = typeof def.options?.locale == 'object' ? def.options.locale?.base : def.options?.locale;
    if (locale !== undefined) {
        try {
            getLocale(locale);
        } catch (error) {
            warn('options.locale', error.message.replace(/^Unknown/, 'unknown'));
        }
    }

    // the transforms, a column of the values, the globals of their templates
    const transformNames = Object.keys(transformTypes);
    [def.transform ?? []].flat().forEach((t, i) => {
        const path = `transform[${i}]`;
        if (t === null || typeof t != 'object')
            return warn(path, `expected a transform, e.g. { "type": "index", "column": "value", "base": { "year": "{base}" } }`);
        if (!transformNames.includes(t.type))
            warn(`${path}.type`, `unknown transform '${t.type}', expected one of ${list(transformNames)}`);
        if (typeof t.column != 'string')
            warn(`${path}.column`, `the column of the values is needed`);
        if (t.by !== undefined && ![t.by].flat().every(c => typeof c == 'string'))
            warn(`${path}.by`, `expected a column or a list of columns`);
        if (t.type == 'rolling' && !(Number.isInteger(t.size) && t.size > 0))
            warn(`${path}.size`, `the number of the rows of the window is needed, e.g. 7`);
        if (t.type == 'index' && (t.base === null || typeof t.base != 'object' || Array.isArray(t.base)))
            warn(`${path}.base`, `the rows of the base are needed, e.g. { "year": "{base}" }`);
        if (t.align !== undefined && !['end', 'center'].includes(t.align))
            warn(`${path}.align`, `expected 'end' or 'center'`);
        templateRefs(JSON.stringify(t)).filter(r => !(r in (def.globals ?? {}))).forEach(r =>
            warn(path, `unknown global '${r}' in the template`));
    });

    if (def.dataFormat !== undefined && !dataFormats.includes(def.dataFormat))
        warn('dataFormat', `unknown format '${def.dataFormat}', expected one of ${list(dataFormats)}`);

    checkProp(def.options?.height, 'options.height', warn, names.global);
    checkProp(def.facets?.cols, 'facets.cols', warn, names.global);
    checkProp(def.facets?.scales, 'facets.scales', warn, names.global);

    return warnings;
};
