export { validateDef, curveNames };

import { intervalOf } from "@/utils/scales";
import * as d3 from "@/utils/d3";
import { checkLocale } from "@/utils/locale";
import { mergeAll, patchable, templateRefs } from "@/utils/def";
import { curves } from "@/utils/draw";
import { plotTypes } from "@/plots";
import { coords } from "@/coords";
import { annotationKeys } from "@/coords/annotations.js";
import { projectionNames } from "@/coords/geo.js";
import { applyTransforms, transformNames, utcColumns } from "@/utils/transform";
import { isObject } from "@/utils/values";
import { isOperator, operators, refNames } from "@/utils/expr";
import { defaultScaleType, facetMappings, hasCategories, normalize, scaleTypeOf } from "@/utils/normalize";
import { inferTypes } from "@/utils/data";
import { versionError } from "@/utils/version";
// without its descriptions, see checkSchema of vite.config.js
import schema from "../../schema.json?check";

// the interpolations of the plot types with a curve, e.g. cartesian:line
const curveNames = Object.keys(curves);

const show = v => typeof v == 'string' ? `'${v}'` : String(v);
const list = a => a.map(show).join(', ');

// the number of the edits of one name to the other one (Levenshtein), e.g. 1
// of "positon" and "position"
const distance = (a, b) => {
    let row = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
        const next = [i];
        for (let j = 1; j <= b.length; j++)
            next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
        row = next;
    }
    return row[b.length];
};

// the known name a typo of a name probably is, at most two edits away and
// fewer than half of its length, e.g. not "y" of "x", undefined otherwise
const similar = (name, names) => typeof name != 'string' ? undefined : names
    .filter(n => typeof n == 'string')
    .map(n => [distance(name, n), n])
    .filter(([d]) => d <= 2 && 2*d < name.length)
    .sort(([a], [b]) => a - b)[0]?.[1];

// the known names of a warning of an unknown one, the one it is probably a
// typo of or a list of them if it is short
const choices = (name, names) => {
    const close = similar(name, names);
    if (close !== undefined)
        return `, did you mean ${show(close)}?`;
    return names.length <= 24 ? `, expected one of ${list(names)}` : '';
};

// the parts of a mapping which are objects, see prepareMapping of utils/def.js
const mappingParts = ['scale', 'axis', 'legend', 'hover'];

// the names of a template of html, e.g. "land.unit" of "{land.unit}"
const templateNames = text => typeof text == 'string' ? [...text.matchAll(/\{([\p{L}\p{N}_.:-]+)\}/gu)].map(m => m[1]) : [];

// a reference to a name which is not known where it is used is undefined,
// short lists of the known names are part of the warning
const checkRef = (ref, path, warn, names) => {
    if (!names || names.has(ref))
        return;
    const close = similar(ref, [...names]);
    const known = close !== undefined ? `, did you mean ${show(close)}?` : names.size <= 12 ? `, expected one of ${list([...names])}` : '';
    warn(path, `unknown reference '${ref}'${known}`);
};

// the expressions of props (see utils/expr.js): references, operators and
// nested props, `names` are the names of the references known at the place of
// the props
const checkProp = (value, path, warn, names = null) => {
    if (typeof value == 'string' && value.charAt() == '@')
        return checkRef(value.substring(1), path, warn, names);
    if (!isObject(value))
        return;
    if (!isOperator(value)) {
        const keys = Object.keys(value);
        const close = keys.length == 1 ? similar(keys[0], operators.filter(o => /^[a-z]/.test(o))) : undefined;
        if (close !== undefined)
            warn(`${path}.${keys[0]}`, `a nested prop, not an operator, did you mean '${close}'?`);
        return Object.entries(value).forEach(([k, v]) => checkProp(v, `${path}.${k}`, warn, names));
    }
    const op = Object.keys(value)[0];
    const args = Array.isArray(value[op]) ? value[op] : [value[op]];
    const at = `${path}.${op}`;
    const each = list => list.forEach((v, i) => checkProp(v, `${at}[${i}]`, warn, names));
    switch (op) {
        case 'literal':
            return;
        case 'var':
            if (typeof args[0] != 'string')
                return warn(at, `expected a name or a name and its default, e.g. ["year", 2024]`);
            checkRef(args[0], at, warn, names);
            return checkProp(args[1], `${at}[1]`, warn, names);
        case 'steps':
        case 'match':
            checkProp(args[0], `${at}[0]`, warn, names);
            if (!isObject(args[1]))
                return warn(at, op == 'steps' ? `expected a value and its steps, e.g. ["@totalWidth", { "0": 220, "550": 250 }]`
                    : `expected a value, its cases and a default, e.g. ["@level", { "header": 4.5 }, 0]`);
            if (op == 'steps')
                Object.keys(args[1]).filter(k => !Number.isFinite(Number(k)) || k.trim() === '').forEach(k => warn(`${at}[1].${k}`, `the cut of a step is a number`));
            Object.entries(args[1]).forEach(([k, v]) => checkProp(v, `${at}[1].${k}`, warn, names));
            return checkProp(args[2], `${at}[2]`, warn, names);
        case 'format':
            checkProp(args[0], `${at}[0]`, warn, names);
            if (typeof args[1] != 'string')
                warn(at, `expected a value and a d3 format, e.g. ["@y", ",.1f"]`);
            return;
        case 'if':
            if (args.length < 2)
                warn(at, `expected a condition, its value and the value otherwise, e.g. [{ ">": ["@y", 0] }, "green", "red"]`);
            return each(args);
    }
    return each(args);
};

// the values of the rows of a mapping, e.g. `x:scaled`, see rowValue of
// layout.js
const rowNames = (n, m) => [
    n,
    `${n}:formatted`,
    ...(m.scale ? [`${n}:scaled`, `${n}:scaled:center`, `${n}:scaled:min`, `${n}:scaled:max`, `${n}:bandwidth`, `${n}:step`] : []),
    ...(['band', 'point'].includes(m.scale?.type) ? [`${n}:group:start`, `${n}:group:end`] : []),
    ...(m.interval !== undefined && m.scale ? [`${n}:scaled:start`, `${n}:scaled:end`] : []),
    ...(m.stacked ? [`${n}:start`, `${n}:end`, `${n}:mid`] : []),
    ...(m.stacked && m.scale ? [`${n}:start:scaled`, `${n}:end:scaled`, `${n}:height:scaled`, `${n}:mid:scaled`] : []),
];

// the props of the categories of a mapping, `name` and `visible` are set by
// default, `color` by a scheme or the default colors
const categoryNames = m => hasCategories(m) ? ['name', 'visible', 'color',
    ...Object.keys(m.common ?? {}),
    ...[m.ranks ?? []].flat().flatMap(e => Object.keys(e ?? {})),
    ...Object.values(m.categories ?? {}).flatMap(e => Object.keys(e ?? {}))] : [];

// the names of a plot, also the positions of values of the scaled mappings,
// e.g. `x:scaled:0` or `y:scaled:100`
class PlotNames extends Set {
    has(name) {
        const at = /^(.+):scaled:-?\d+(?:\.\d+)?$/.exec(name);
        return super.has(name) || (at !== null && super.has(`${at[1]}:scaled`));
    }
}

// the name of a registry of d3 in another case than the one of the schema,
// e.g. "Linear", which the registry accepts, see named of utils/registry.js
const otherCase = (name, names) => typeof name == 'string' && !names.includes(name)
    ? names.find(n => n.toLowerCase() == name.toLowerCase()) : undefined;

// --- the schema ---

// the part of the schema of a reference, e.g. "#/definitions/scale"
const resolve = node => {
    while (node?.$ref)
        node = node.$ref.substring(2).split('/').reduce((n, k) => n[k], schema);
    return node;
};

// the values of these parts are the ones of the coordinate system, also of
// registered ones, they are checked by checkMappings
const registered = new Set([schema.definitions.scale.properties.orientation, schema.definitions.axis.properties.position]);

const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const typeFits = (v, type) => type == 'integer' ? Number.isInteger(v) : type == 'object' ? isObject(v) : kind(v) == type;
const matches = (v, pattern) => typeof v != 'string' || new RegExp(pattern, 'u').test(v);

// a value is of a branch of anyOf if it is of its type, e.g. a string of an
// enum of strings, its other warnings are the ones of the branch
const fits = (v, node) => {
    node = resolve(node);
    const branches = node.anyOf ?? node.oneOf;
    if (branches)
        return branches.some(b => fits(v, b));
    if (node.type && !typeFits(v, node.type))
        return false;
    if (node.enum && !node.enum.some(e => kind(e) == kind(v)))
        return false;
    if ('const' in node && node.const !== v)
        return false;
    if (node.pattern && !matches(v, node.pattern))
        return false;
    return !(isObject(v) && node.not?.required?.every(k => k in v));
};

const typeNames = { string: 'a string', number: 'a number', integer: 'an integer', boolean: 'true or false', object: 'an object', array: 'a list', null: 'null' };
// the values of a part of the schema, e.g. "a number or a reference "@name""
const describe = node => {
    node = resolve(node);
    const branches = node.anyOf ?? node.oneOf;
    if (branches)
        return [...new Set(branches.map(describe))].join(' or ');
    if (node === schema.definitions.prop)
        return 'an expression';
    if (node.enum)
        return node.enum.length == 1 ? show(node.enum[0]) : `one of ${list(node.enum)}`;
    if ('const' in node)
        return show(node.const);
    if (node.pattern == '^@')
        return 'a reference "@name"';
    return typeNames[node.type] ?? 'a value';
};

/**
 * The warnings [path, message] of a value of a part of the schema (`node`):
 * unknown keys of objects without additionalProperties, values which are
 * not of an enum, of another type or out of range. Of anyOf and oneOf the
 * branch with the fewest warnings, `key` is the name of the value, e.g.
 * "type" of "unknown type 'x'". Required keys are not checked, a definition
 * can be a part of its parent.
 */
const schemaWarnings = (v, node, path = '', key = 'value', out = []) => {
    node = resolve(node);
    // undefined is no value of JSON, e.g. a part which is left out
    if (!isObject(node) || registered.has(node) || v === undefined)
        return out;
    const at = message => (out.push([path, message]), out);
    if (node.type && !typeFits(v, node.type))
        return at(`expected ${describe(node)}`);
    if (node.enum && !node.enum.includes(v))
        return at(`unknown ${key} ${show(v)}${choices(v, node.enum)}`);
    if (('const' in node && node.const !== v) || (node.pattern && !matches(v, node.pattern)))
        return at(`expected ${describe(node)}`);
    if (typeof v == 'number' && v < node.minimum)
        return at(`expected at least ${node.minimum}`);
    const branches = node.anyOf ?? node.oneOf;
    if (branches) {
        const fitting = branches.filter(b => fits(v, b));
        if (fitting.length == 0)
            return at(`expected ${describe(node)}`);
        out.push(...fitting.map(b => schemaWarnings(v, b, path, key, [])).reduce((a, b) => b.length < a.length ? b : a));
    }
    (node.allOf ?? []).forEach(b => schemaWarnings(v, b, path, key, out));
    if (isObject(v)) {
        const properties = node.properties ?? {};
        Object.entries(v).forEach(([k, e]) => {
            const p = path ? `${path}.${k}` : k;
            if (Object.hasOwn(properties, k))
                schemaWarnings(e, properties[k], p, k, out);
            else if (node.additionalProperties === false)
                out.push([p, `unknown key${choices(k, Object.keys(properties))}`]);
            else
                schemaWarnings(e, node.additionalProperties, p, k, out);
        });
    }
    if (Array.isArray(v)) {
        const { minItems: min = 0, maxItems: max = Infinity } = node;
        if (v.length < min || v.length > max)
            at(min == max ? `expected ${min} values` : v.length < min ? `expected at least ${min} values` : `expected at most ${max} values`);
        v.forEach((e, i) => schemaWarnings(e, node.items, `${path}[${i}]`, key, out));
    }
    return out;
};

// --- the parts of a definition ---

// the mappings: their columns, types, scales, axes, legends and hovers
const checkMappings = ctx => {
    const { def, mapping, names, warn, coord, coordName } = ctx;
    Object.entries(mapping).forEach(([n, m]) => {
        const path = `mapping.${n}`;
        if (typeof m.column != 'string')
            warn(path, `no 'column'`);
        const categorical = hasCategories(m);
        if (categorical && !m.categories && !m.fromData)
            warn(path, `the categories need 'categories' or the ones of the data ('fromData'), 'common' are the props of all of them`);
        if (m.order !== undefined && m.order != 'ascending' && m.order != 'descending' && !Array.isArray(m.order))
            warn(`${path}.order`, `expected 'ascending', 'descending' or a list of keys`);
        if (m.ranks !== undefined && !(Array.isArray(m.ranks) && m.ranks.every(isObject)))
            warn(`${path}.ranks`, `expected a list of props, of the first category, the second one, ...`);
        if (m.scheme !== undefined && !d3.named(d3.schemeNames, m.scheme))
            warn(`${path}.scheme`, `unknown scheme '${m.scheme}', e.g. 'Tableau10'`);
        if (m.scale)
            checkScale(ctx, n, m, path);
        if (m.axis) {
            if (!m.scale)
                warn(`${path}.axis`, `an axis needs a 'scale'`);
            if (coord.positions.length == 0)
                warn(`${path}.axis`, `the coordinate system '${coordName}' has no axes`);
            else if (!coord.positions.includes(m.axis.position))
                warn(`${path}.axis.position`, `unknown position '${m.axis.position}'${choices(m.axis.position, coord.positions)}`);
            checkProp(m.axis.ticks, `${path}.axis.ticks`, warn, names.facet);
            if (m.axis.at !== undefined) {
                const other = m.scale?.orientation == 'horizontal' ? 'vertical' : 'horizontal';
                if (!['top', 'bottom', 'left', 'right'].includes(m.axis.position))
                    warn(`${path}.axis.at`, `only cartesian axes are at a value of the other axis`);
                else if (!Object.values(mapping).some(o => o?.scale?.orientation == other || (o?.scale?.of !== undefined && mapping[o.scale.of]?.scale?.orientation == other)))
                    warn(`${path}.axis.at`, `a value of the mapping of the other axis, there is no mapping with a ${other} scale`);
                checkProp(m.axis.at, `${path}.axis.at`, warn, names.facet);
            }
            if (isObject(m.axis.title) && m.axis.title.position !== undefined && (!['side', 'top'].includes(m.axis.title.position)
                || (m.axis.title.position == 'top' && !['left', 'right'].includes(m.axis.position))))
                warn(`${path}.axis.title.position`, `'top' of the title of a left or right axis, above it, or 'side' (beside it, the default)`);
            if (isObject(m.axis.labels) && m.axis.labels.at !== undefined && !['edge', 'axis'].includes(m.axis.labels.at))
                warn(`${path}.axis.labels.at`, `expected 'edge' (the labels at the edge of the plot area) or 'axis' (with the line at its value)`);
            if (m.axis.values !== undefined && !Array.isArray(m.axis.values))
                checkProp(m.axis.values, `${path}.axis.values`, warn, names.facet);
            const labels = m.axis.labels;
            if (labels !== undefined && !isObject(labels))
                warn(`${path}.axis.labels`, `expected the props of the labels, e.g. { "props": { "font-weight": "bold" } }`);
            else if (labels) {
                if (labels.curved !== undefined && (![true, false, 'between'].includes(labels.curved) || (labels.curved && m.axis.position != 'angular')))
                    warn(`${path}.axis.labels.curved`, `the labels along the circle of an angular axis, true or 'between'`);
                const categories = [labels.by ?? []].flat();
                categories.filter(c => !Object.hasOwn(mapping, c)).forEach(c => warn(`${path}.axis.labels.by`, `unknown mapping '${c}'`));
                checkProp(labels.props, `${path}.axis.labels.props`, warn, new Set([...names.facet, ...Object.keys(mapping),
                    ...categoryNames(m), ...categories.flatMap(c => categoryNames(mapping[c]))]));
            }
            checkProp(m.axis.tickSpacing, `${path}.axis.tickSpacing`, warn, names.facet);
            const marks = m.axis.tickMarks;
            if (marks !== undefined && marks !== false && !isObject(marks))
                warn(`${path}.axis.tickMarks`, `expected false (no tick marks) or their size and props, e.g. { "size": 4, "props": { "stroke-opacity": 0.5 } }`);
            else if (isObject(marks)) {
                if (marks.size !== undefined && !(typeof marks.size == 'number' && marks.size >= 0))
                    warn(`${path}.axis.tickMarks.size`, `expected the length of the tick marks in pixels, e.g. 4`);
                if (marks.inset !== undefined && typeof marks.inset != 'number')
                    warn(`${path}.axis.tickMarks.inset`, `expected the part of the tick marks inside the plot area in pixels, e.g. 0`);
                checkProp(marks.props, `${path}.axis.tickMarks.props`, warn, names.facet);
            }
            if (marks !== undefined && m.axis.position == 'radial')
                warn(`${path}.axis.tickMarks`, `a radial axis has no tick marks, the circles of the grid mark its values`);
            const domain = m.axis.domain;
            if (domain !== undefined && !isObject(domain))
                warn(`${path}.axis.domain`, `expected the props of the line of the axis, e.g. { "props": { "stroke-opacity": 0.4 } }`);
            else if (domain)
                checkProp(domain.props, `${path}.axis.domain.props`, warn, names.facet);
        }
        checkProp(m.legend?.position, `${path}.legend.position`, warn, names.global);
        checkProp(m.legend?.orientation, `${path}.legend.orientation`, warn, names.global);
        if (isObject(m.hover?.row) && !categorical)
            warn(`${path}.hover.row`, `the styles of the rows of the hover are props of the categories, the mapping needs 'categories' or 'fromData'`);
        if (m.legend?.onlyData !== undefined && (typeof m.legend.onlyData != 'boolean' || !categorical))
            warn(`${path}.legend.onlyData`, `only the entries of the categories of the rows, true or false, of a legend of categories`);
        if (m.legend && !categorical && m.scale?.orientation !== undefined)
            warn(`${path}.legend`, `a legend needs the props of the categories or a scale of colors, without an orientation`);
        // the props of the legend and the hover of the categories
        if (categorical) {
            const known = names.category(n);
            checkProp(m.legend?.props, `${path}.legend.props`, warn, known);
            checkProp(m.hover?.props, `${path}.hover.props`, warn, known);
            checkProp(m.hover?.row?.props, `${path}.hover.row.props`, warn, known);
            [].concat(m.legend?.symbol?.elements ?? []).forEach((e, j) =>
                checkProp(e?.props, `${path}.legend.symbol.elements[${j}].props`, warn, known));
            checkProp(m.legend?.symbol?.props, `${path}.legend.symbol.props`, warn, known);
        }
        checkDates(ctx, n, m, path);
    });
    // the rows which are stacked, `true` all, the conditions of mappings, e.g. { "type": { "not": "load" } }
    Object.entries(mapping).filter(([, m]) => m.stacked !== undefined && typeof m.stacked != 'boolean').forEach(([n, m]) => isObject(m.stacked)
        ? checkFilter(ctx, m.stacked, `mapping.${n}.stacked`, names.global)
        : warn(`mapping.${n}.stacked`, `expected true or the conditions of the rows which are stacked, e.g. { "type": { "not": "load" } }`));
    Object.entries(mapping).filter(([, m]) => m.interval !== undefined).forEach(([n, m]) => {
        if (m.type !== undefined && m.type != 'date')
            warn(`mapping.${n}.interval`, `the periods of the values of a date mapping, not of a ${m.type} one`);
        else if (!intervalOf(m.interval))
            warn(`mapping.${n}.interval`, `expected day, week, month, quarter, half, year or a number of them, e.g. "6 months"`);
        else if (m.scale?.type !== undefined && !['time', 'utc'].includes(m.scale.type))
            warn(`mapping.${n}.interval`, `the periods of a time or utc scale, not of a ${m.scale.type} one`);
    });
    Object.entries(mapping).filter(([, m]) => m.stackBy !== undefined).forEach(([n, m]) => {
        if (!m.stacked)
            warn(`mapping.${n}.stackBy`, `the positions of the stacks of a stacked mapping, without 'stacked' none`);
        else if (!Object.hasOwn(mapping, m.stackBy))
            warn(`mapping.${n}.stackBy`, `unknown mapping '${m.stackBy}'`);
    });
    if (!def.mapping)
        warn('mapping', 'missing');
};

// the scale of a mapping, of its own or the one of another mapping (`of`)
const checkScale = (ctx, n, m, path) => {
    const { def, names, warn, coordName, orientations } = ctx;
    // `domain` and `nice` may be written at the mapping, see utils/normalize.js
    const raw = ctx.raw?.mapping?.[n];
    const at = k => isObject(raw) && ['domain', 'nice'].includes(k) && k in raw ? `${path}.${k}` : `${path}.scale.${k}`;
    if (m.scale.of !== undefined) {
        const other = Object.hasOwn(def.mapping ?? {}, m.scale.of) ? def.mapping[m.scale.of] : undefined;
        if (!other?.scale || other.scale.of !== undefined)
            warn(`${path}.scale.of`, `expected a mapping with a scale of its own, e.g. "y"`);
        Object.keys(m.scale).filter(k => k != 'of').forEach(k =>
            warn(at(k), `not used, the scale is the one of '${m.scale.of}'`));
        return;
    }
    // the name of the schema, e.g. "linear" of "Linear"
    const lower = otherCase(m.scale.type, Object.keys(d3.scales));
    const type = lower ?? m.scale.type ?? defaultScaleType(m, n, def.plot);
    const scale = d3.named(d3.scales, type);
    const typeName = `the type '${m.type}'`;
    // the type of a mapping without one follows from the rows, see inferTypes
    const typed = m.type !== undefined;
    if (lower)
        warn(`${path}.scale.type`, `use '${lower}'`);
    else if (!scale)
        warn(`${path}.scale.type`, `unknown scale '${type}'${similar(type, Object.keys(d3.scales)) ? choices(type, Object.keys(d3.scales)) : `, e.g. 'linear', 'time' or 'band'`}`);
    if (scale) {
        // e.g. linear, time, threshold or sequentialQuantile vs. point or
        // band, ordinal scales are of any values, e.g. colors of numbers
        const s = scale();
        const continuous = ['ticks', 'invertExtent', 'interpolator'].some(f => typeof s[f] == 'function');
        if (typed && type != 'ordinal' && continuous != ['numeric', 'date'].includes(m.type))
            warn(`${path}.scale.type`, `a ${type} scale does not fit ${typeName}`);
        if (m.scale.interpolator !== undefined && typeof s.interpolator != 'function')
            warn(`${path}.scale.interpolator`, `a ${type} scale has no interpolator, e.g. a sequential one has`);
    }
    if (m.scale.interpolator !== undefined && !d3.named(d3.interpolatorNames, m.scale.interpolator))
        warn(`${path}.scale.interpolator`, `unknown interpolator '${m.scale.interpolator}', e.g. 'Blues'`);
    if (m.scale.scheme !== undefined && !d3.named(d3.schemeNames, m.scale.scheme))
        warn(`${path}.scale.scheme`, `unknown scheme '${m.scale.scheme}', e.g. 'Blues'`);
    if (type == 'threshold' && !(Array.isArray(m.scale.domain) && m.scale.domain.every(v => v !== null)))
        warn(at('domain'), `a threshold scale needs the values between its classes`);
    if (m.type == 'date' && m.scale.orientation !== undefined && !['time', 'utc'].includes(type))
        warn(`${path}.scale.type`, `the positions of dates need a 'time' or a 'utc' scale`);
    // the ends of the domain of dates and categories are not rounded, see utils/scales.js
    if (typed && m.scale.nice !== undefined && m.scale.nice !== false && m.type != 'numeric')
        warn(at('nice'), `only the domains of numeric mappings are rounded, not the ones of ${typeName}`);
    const domain = Array.isArray(m.scale.domain) ? m.scale.domain : [];
    if (scale && typeof scale().step == 'function' && domain.some(v => v === null) && domain.some(v => v !== null))
        warn(at('domain'), `the categories of a ${type} scale are all the ones of the data (null) or a list of them`);
    if (Array.isArray(m.scale.range))
        m.scale.range.forEach((v, j) => checkProp(v, `${path}.scale.range[${j}]`, warn, names.range));
    [m.scale.inset].flat().forEach(v => checkProp(v, `${path}.scale.inset`, warn, names.range));
    domain.forEach((v, j) => checkProp(v, `${at('domain')}[${j}]`, warn, names.facet));
    [m.scale.include ?? []].flat().forEach(v => checkProp(v, `${path}.scale.include`, warn, names.facet));
    checkProp(m.scale.center, `${path}.scale.center`, warn, names.facet);
    if (typed && (m.scale.include !== undefined || m.scale.center !== undefined) && !['numeric', 'date'].includes(m.type))
        warn(`${path}.scale`, `'include' and 'center' are values of numeric or date mappings`);
    if (m.scale.step !== undefined && (!['band', 'point'].includes(type) || m.scale.orientation != 'vertical'))
        warn(`${path}.scale.step`, `the pixels of a category of a vertical band or point scale`);
    checkProp(m.scale.step, `${path}.scale.step`, warn, names.global);
    const order = m.scale.order;
    if (order !== undefined && !['ascending', 'descending'].includes(order) && !(isObject(order) && typeof order.by == 'string'))
        warn(`${path}.scale.order`, `expected 'ascending', 'descending' or the mapping of the values, e.g. { "by": "x", "descending": true }`);
    else if (isObject(order) && !Object.hasOwn(def.mapping ?? {}, order.by))
        warn(`${path}.scale.order.by`, `unknown mapping '${order.by}'`);
    if (m.scale.groups !== undefined && (!['band', 'point'].includes(type) || !isObject(m.scale.groups)))
        warn(`${path}.scale.groups`, `the groups of the categories of a band or a point scale, e.g. { "by": "group", "padding": 1 }`);
    else if (m.scale.groups !== undefined && !Object.hasOwn(def.mapping ?? {}, m.scale.groups.by))
        warn(`${path}.scale.groups.by`, `unknown mapping '${m.scale.groups.by}'`);
    const ignores = m.scale.domainIgnores;
    if (ignores !== undefined && typeof ignores != 'boolean' && !(Array.isArray(ignores) && ignores.every(c => typeof c == 'string')))
        warn(`${path}.scale.domainIgnores`, `expected the mappings of conditions of 'filter', e.g. ["month"], or true (all)`);
    else if (Array.isArray(ignores))
        ignores.filter(c => !Object.hasOwn(def.mapping ?? {}, c)).forEach(c => warn(`${path}.scale.domainIgnores`, `unknown mapping '${c}'`));
    // a positive start of domainRel or domainAbs moves the start up, the
    // domain shrinks and cuts off data, e.g. of bars below the plot area
    ['domainRel', 'domainAbs'].filter(k => Array.isArray(m.scale[k]) && m.scale[k][0] > 0).forEach(k =>
        warn(`${path}.scale.${k}`, `a positive start shrinks the domain at its start and cuts off data (the value is added), it extends with a negative one, e.g. [-0.1, 0.1]; "pad": 0.1 extends both ends`));
    if (m.scale.pad !== undefined && m.scale.domainRel !== undefined)
        warn(`${path}.scale.pad`, `pad replaces domainRel, one of them`);
    if (m.scale.closed !== undefined && type != 'threshold')
        warn(`${path}.scale.closed`, `the side of the classes of a threshold scale, 'left' (default) or 'right'`);
    if (m.scale.orientation !== undefined && !orientations.includes(m.scale.orientation))
        warn(`${path}.scale.orientation`, orientations.length > 0
            ? `unknown orientation '${m.scale.orientation}'${choices(m.scale.orientation, orientations)}`
            : `the coordinate system '${coordName}' has no orientations, e.g. a scale of colors has none`);
};

// the values of a date mapping which are numbers are milliseconds since
// 1970, small ones are probably years, e.g. 2024, only if the rows are given
const checkDates = ({ rows, warn }, n, m, path) => {
    if (m.type != 'date' || !Array.isArray(rows) || typeof m.column != 'string')
        return;
    const year = rows.map(r => r?.[m.column]).find(v => typeof v == 'number' && Math.abs(v) < 1e5);
    if (year !== undefined)
        warn(`${path}.type`, `the values of '${m.column}' are numbers, e.g. ${year}, which are milliseconds since 1970 as dates, years are numeric or strings, e.g. "${year}"`);
};

// the conditions of the rows of mappings, see rowFilter of utils/data.js:
// values, lists, null, { "not": ... }, { "range": [from, to] } and
// expressions of the names `known`, e.g. { "var": "lo" }, other objects are
// none, e.g. { "prop": ... } of 3.x
const checkCondition = (ctx, c, path, known) => {
    if (isObject(c) && Object.keys(c).length == 1 && 'not' in c)
        return checkCondition(ctx, c.not, `${path}.not`, known);
    if (isObject(c) && Array.isArray(c.range) && c.range.length == 2)
        return c.range.forEach((v, j) => checkProp(v, `${path}.range[${j}]`, ctx.warn, known));
    if (isObject(c) && !isOperator(c))
        return ctx.warn(path, `expected a value, a list of values, null, { "not": ... }, { "range": [from, to] } or an expression`);
    checkProp(c, path, ctx.warn, known);
};
// null removes the conditions, e.g. of a parent
const checkFilter = (ctx, conditions, path, known) => {
    if (conditions === undefined || conditions === null)
        return;
    if (!isObject(conditions))
        return ctx.warn(path, `expected the conditions of mappings, e.g. { "year": "@year" }`);
    Object.entries(conditions).forEach(([n, c]) => {
        if (!Object.hasOwn(ctx.mapping, n))
            ctx.warn(`${path}.${n}`, `unknown mapping '${n}'`);
        checkCondition(ctx, c, `${path}.${n}`, known);
    });
};

// the plots: their types, categories, data and props
const checkPlots = ctx => {
    const { def, mapping, names, warn, coord, coordName } = ctx;
    const types = Object.keys(plotTypes);
    const curvePlots = types.filter(t => plotTypes[t].curve);
    const plotList = [].concat(def.plot ?? []);
    if (plotList.length == 0)
        warn('plot', 'missing');
    // the ids name the plots, e.g. of their classes and of the merge with a parent
    const ids = plotList.map((p, i) => p?.id ?? `plot-${i}`);
    ids.forEach((id, i) => {
        if (ids.indexOf(id) < i)
            warn(`plot[${i}].id`, `the id '${id}' is the one of plot[${ids.indexOf(id)}]`);
    });
    ctx.plots.forEach(([i, p]) => {
        const path = `plot[${i}]`;
        // a type without the prefix of the coordinate system is one which normalize did not find
        const short = typeof p.type == 'string' && !p.type.includes(':')
            ? [...new Set(types.filter(t => !t.startsWith('annotation:') && (!plotTypes[t].coords || plotTypes[t].coords.includes(coordName))).map(t => t.split(':')[1]))] : null;
        if (short)
            warn(`${path}.type`, `unknown type '${p.type}' of the coordinate system '${coordName}'${choices(p.type, short)}`);
        else if (!types.includes(p.type))
            warn(`${path}.type`, `unknown type '${p.type}'${choices(p.type, types)}`);
        else if (plotTypes[p.type].coords && coordName in coords && !plotTypes[p.type].coords.includes(coordName))
            warn(`${path}.type`, `not available in the coordinate system '${coordName}'`);
        if (![p.by ?? []].flat().every(c => typeof c == 'string'))
            warn(`${path}.by`, `expected a mapping or a list of mappings, e.g. ["land"]`);
        const categories = [p.by ?? []].flat().filter(c => typeof c == 'string');
        categories.filter(c => !Object.hasOwn(mapping, c)).forEach(c =>
            warn(`${path}.by`, `unknown mapping '${c}'`));
        if (p.curve !== undefined && curveNames.includes(p.curve) && types.includes(p.type) && !curvePlots.includes(p.type))
            warn(`${path}.curve`, `only used by ${list(curvePlots)}`);
        // the data of the plot: rows of the definition, their names are known
        // to the props, their values are props of the facet, or a url
        const rows = Array.isArray(p.data) ? p.data : [];
        if (p.data !== undefined && typeof p.data != 'string' && !(Array.isArray(p.data) && p.data.every(isObject)))
            warn(`${path}.data`, `expected a list of rows or the url of the data`);
        rows.forEach((r, j) => Object.entries(r ?? {}).forEach(([k, v]) => checkProp(v, `${path}.data[${j}].${k}`, warn, names.facet)));
        if (p.select !== undefined && !['first', 'last'].includes(p.select)) {
            const [which, name] = Object.entries(isObject(p.select) ? p.select : {})[0] ?? [];
            if (!['min', 'max'].includes(which))
                warn(`${path}.select`, `expected 'first', 'last' or the min or max of a mapping, e.g. { "max": "x" }`);
            else if (!Object.hasOwn(mapping, name))
                warn(`${path}.select.${which}`, `unknown mapping '${name}'`);
        }
        if (p.once !== undefined && typeof p.once != 'boolean')
            warn(`${path}.once`, `true: an element per facet, of no row, e.g. a header`);
        else if (p.once && (p.data !== undefined || [p.by ?? []].flat().length > 0 || p.filter !== undefined))
            warn(`${path}.once`, `a plot once per facet has no rows, no 'data', 'by' or 'filter'`);
        if (p.dodge !== undefined && (typeof p.dodge != 'number' || !['svg:text', 'polar:text'].includes(p.type)))
            warn(`${path}.dodge`, `the distance of the texts of a plot of 'svg:text' or 'polar:text', a number`);
        if (p.halo !== undefined && (!['boolean', 'number'].includes(typeof p.halo) || !['svg:text', 'polar:text'].includes(p.type)))
            warn(`${path}.halo`, `a halo behind the texts of a plot of 'svg:text' or 'polar:text', true or its width`);
        if (p.object !== undefined && (typeof p.object != 'string' || p.type != 'geo:mesh'))
            warn(`${path}.object`, `the object of the TopoJSON of a plot of 'geo:mesh', a string`);
        if (p.borders !== undefined && p.type != 'geo:mesh')
            warn(`${path}.borders`, `the borders of a plot of 'geo:mesh', one of 'all', 'inner', 'outer'`);
        // the annotations of the coordinate system, e.g. no bands of maps
        const annotation = typeof p.type == 'string' && p.type.startsWith('annotation:') && p.type.substring(11);
        if (annotation && types.includes(p.type) && !(coord.annotations ?? []).includes(annotation))
            warn(`${path}.type`, `not available in the coordinate system '${coordName}'`);
        // the names of the rows of a url are not known
        const plotNames = typeof p.data == 'string' ? null
            : new PlotNames([...names.plot(categories.filter(c => Object.hasOwn(mapping, c))), ...rows.flatMap(r => Object.keys(r ?? {}))]);
        checkProp(p.props, `${path}.props`, warn, plotNames);
        // the props of the highlight and of the other elements, see preparePlots of utils/def.js
        ['highlight', 'others'].filter(k => isObject(p[k])).forEach(k => Object.entries(p[k])
            .filter(([n]) => k != 'highlight' || n != 'mode').forEach(([n, v]) => checkProp(v, `${path}.${k}.${n}`, warn, plotNames)));
        // the references of the default props of the type, e.g. "@x:scaled" of a line
        const defaults = ctx.defaults?.get(i);
        if (defaults && plotNames)
            [...new Set(refNames(defaults).filter(r => r != 'color' && !plotNames.has(r)))].forEach(r =>
                warn(`${path}.props`, `the default props of '${ctx.written?.get(i) ?? p.type}' need '${r}', e.g. a mapping '${r.split(':')[0]}' with a scale, or the props which use it`));
    });
};

// the geometry of a map
const checkGeo = ({ def, mapping, warn, coordName }) => {
    if (coordName != 'geo')
        return;
    if (typeof def.geo?.data != 'string' && !isObject(def.geo?.data))
        warn('geo.data', `a map needs its geometry, GeoJSON or TopoJSON or their url`);
    if (def.geo?.join !== undefined && !Object.hasOwn(mapping, def.geo.join))
        warn('geo.join', `unknown mapping '${def.geo.join}'`);
    const projection = def.geo?.projection?.type ?? 'mercator';
    const lower = otherCase(projection, projectionNames);
    if (lower)
        warn('geo.projection.type', `use '${lower}'`);
    else if (!projectionNames.includes(projection))
        warn('geo.projection.type', `unknown projection '${projection}'${choices(projection, projectionNames)}`);
};

// the conditions of the rows of the definition, of the plots and of the hover
const checkFilters = ctx => {
    const { def, names } = ctx;
    checkFilter(ctx, def.filter, 'filter', names.global);
    ctx.plots.forEach(([i, p]) => checkFilter(ctx, p.filter, `plot[${i}].filter`, names.facet));
    checkFilter(ctx, def.options?.hover?.filter, 'options.hover.filter', names.facet);
};

// the values of an annotation are of mappings with a scale, of maps `lon` and `lat`
const checkAnnotations = ctx => {
    const { mapping, names, warn, coord, coordName } = ctx;
    const annotationTypes = coord.annotations ?? [];
    ctx.annotations.forEach(([i, a]) => {
        const path = `annotations[${i}]`;
        // e.g. a band of a map, it is one of the cartesian coordinate system
        const elsewhere = Object.values(coords).some(c => (c.annotations ?? []).includes(a.type));
        if (!annotationTypes.includes(a.type))
            warn(`${path}.type`, elsewhere
                ? `a ${a.type} is not available in the coordinate system '${coordName}', expected one of ${list(annotationTypes)}`
                : `unknown type '${a.type}'${choices(a.type, annotationTypes)}`);
        Object.keys(a).filter(k => !annotationKeys.includes(k)).forEach(k => {
            if (!Object.hasOwn(mapping, k))
                warn(`${path}.${k}`, `unknown mapping '${k}'`);
            else if (!mapping[k].scale)
                warn(`${path}.${k}`, `the mapping has no scale`);
            // the values can be references, e.g. to a global
            [a[k]].flat().forEach(v => checkProp(v, `${path}.${k}`, warn, names.facet));
        });
        if (coordName == 'geo' && !(typeof a.lon == 'number' && typeof a.lat == 'number'))
            warn(path, `an annotation of a map needs 'lon' and 'lat'`);
        // the names of the facet and the ones of the row of the annotation, e.g. its value
        const row = Object.keys(a).filter(k => !['type', 'props', 'above', 'layer', 'before', 'legend', 'facet'].includes(k));
        checkProp(a.props, `${path}.props`, warn, new Set([...names.facet, ...row]));
        if (a.layer !== undefined && !['below', 'above'].includes(a.layer))
            warn(`${path}.layer`, `expected 'below' (below the plots, the default) or 'above' (above them), or 'before' a plot`);
        const ids = [ctx.def.plot ?? []].flat().map((p, j) => p?.id ?? `plot-${j}`);
        if (a.before !== undefined && !ids.includes(a.before))
            warn(`${path}.before`, `unknown plot '${a.before}'${ids.length ? `, expected one of ${list(ids)}` : ''}`);
    });
};

// the form elements and their entries, the patches are checked as parts of
// the definitions of the entries, see validateDef
const checkFormElements = ({ formElements, warn }) => {
    formElements.forEach(([i, e]) => {
        const path = `formElements[${i}]`;
        // parts of entries are patches of a parent, the merged ones are complete
        if (typeof e.ref != 'string')
            warn(`${path}.ref`, `no global`);
        // a list of entries or the values of a column of the data
        if (!Array.isArray(e.values) && typeof e.values?.column != 'string')
            warn(`${path}.values`, `expected a list of entries or the column of the values, e.g. { "column": "year" }`);
        (Array.isArray(e.values) ? e.values : []).forEach((v, j) => {
            if (!isObject(v))
                return warn(`${path}.values[${j}]`, `expected an entry, e.g. { "id": "a", "name": "A", "value": "a" }`);
            if (!('value' in v))
                warn(`${path}.values`, `no value of '${v.id}'`);
            // other fields are names of templates, e.g. {group:short}, so they are scalars
            patchable.filter(k => isObject(v[k])).forEach(k =>
                warn(`${path}.values[${j}].${k}`, `unknown key, a part of the definition is part of the patch, e.g. { "patch": { "${k}": ... } }`));
            if (v.patch !== undefined && !isObject(v.patch))
                warn(`${path}.values[${j}].patch`, `expected the parts of the definition, e.g. { "mapping": { "y": { "column": "share" } } }`);
        });
    });
};

// the facets, a plot per category of a mapping
const checkFacets = ({ def, mapping, names, warn }) => {
    if (!def.facets)
        return;
    // a grid of the categories of `rows` and `cols` (a mapping), or the
    // facets of `dim` in `cols` columns (a number)
    const { grid } = facetMappings(def.facets);
    const parts = grid ? ['rows', 'cols'].filter(k => facetMappings(def.facets)[k] !== null) : ['dim'];
    if (grid && def.facets.dim !== undefined)
        warn('facets.dim', `a grid of 'rows' and 'cols' has no 'dim'`);
    if (!grid && typeof def.facets.dim != 'string')
        warn('facets.dim', `expected the name of a mapping`);
    parts.filter(k => typeof def.facets[k] == 'string').forEach(k => {
        if (!Object.hasOwn(mapping, def.facets[k]))
            warn(`facets.${k}`, `unknown mapping '${def.facets[k]}'`);
        else if (!hasCategories(mapping[def.facets[k]]))
            warn(`facets.${k}`, `the mapping '${def.facets[k]}' needs categories, e.g. "fromData": true`);
    });
    if (def.facets.rows !== undefined && typeof def.facets.rows != 'string')
        warn('facets.rows', `expected the mapping of the rows of a grid`);
    if (def.facets.rowHeaders !== undefined && !['left', 'right'].includes(def.facets.rowHeaders))
        warn('facets.rowHeaders', `expected 'left' (horizontal) or 'right' (rotated, the default)`);
    const scales = def.facets.scales;
    if (isObject(scales))
        Object.entries(scales).forEach(([n, v]) => {
            if (!Object.hasOwn(mapping, n))
                warn(`facets.scales.${n}`, `unknown mapping '${n}'`);
            if (!['all', 'row', 'col'].includes(v) || (!grid && v != 'all'))
                warn(`facets.scales.${n}`, grid ? `expected 'all', 'row' or 'col'` : `expected 'all', a scale per row or column is one of a grid of 'rows' and 'cols'`);
        });
    if (!grid)
        checkProp(def.facets.cols, 'facets.cols', warn, names.global);
    if (def.facets.axisTitles !== undefined && !['all', 'outer'].includes(def.facets.axisTitles))
        warn('facets.axisTitles', `expected 'all' (in every facet, the default) or 'outer' (only at the outer facets)`);
    const dim = typeof def.facets.dim == 'string' && Object.hasOwn(mapping, def.facets.dim) ? mapping[def.facets.dim] : null;
    if (isObject(def.facets.title))
        checkProp(def.facets.title.props, 'facets.title.props', warn, new Set([...names.global, 'facet', 'facet:name', ...(dim ? categoryNames(dim) : [])]));
    if (!isObject(scales))
        checkProp(def.facets.scales, 'facets.scales', warn, names.global);
};

// the templates of the columns, the texts and the hover
const checkTexts = ({ def, mapping, globals, warn, annotations }) => {
    // column templates, e.g. "{values}{share}", need the globals, also the
    // ones of form elements, e.g. of the values of a column
    Object.entries(mapping).forEach(([n, m]) => templateRefs(m.column).filter(r => !globals.has(r)).forEach(r =>
        warn(`mapping.${n}.column`, `unknown global '${r}' in the column template`)));
    // and the ones of the texts, e.g. "Durchschnitt {base} = 100" of the subtitle
    const checkText = (text, path) => templateRefs(text).filter(r => !globals.has(r)).forEach(r =>
        warn(path, `unknown global '${r}' in the text`));
    ['title', 'subtitle', 'footer', 'empty', 'class'].forEach(o => checkText(def.options?.[o], `options.${o}`));
    checkText(def.options?.message, 'options.message');
    // the templates of the hover, the names of the title and of a row, e.g. {land.unit}
    const hover = def.options?.hover ?? {};
    const checkHover = (template, path, known) => templateNames(template).filter(r => !known(r)).forEach(r =>
        warn(path, `unknown name '${r}' in the template`));
    // a global or a field of its entry, e.g. `group:name`
    const isGlobal = r => globals.has(r) || (r.includes(':') && globals.has(r.split(':')[0]));
    // the title has the names of the nearest row as well, e.g. {definition}
    checkHover(hover.title, 'options.hover.title', r => r == 'title' || isGlobal(r) || Object.hasOwn(mapping, r.split('.')[0]));
    checkHover(hover.row, 'options.hover.row', r => isGlobal(r) || Object.hasOwn(mapping, r.split('.')[0]));
    Object.entries(mapping).forEach(([n, m]) => {
        checkText(m.name, `mapping.${n}.name`);
        checkText(m.axis?.title?.name, `mapping.${n}.axis.title.name`);
        checkText(m.legend?.missing?.name, `mapping.${n}.legend.missing.name`);
        checkText(m.common?.name, `mapping.${n}.common.name`);
        Object.entries(m.categories ?? {}).forEach(([k, e]) => checkText(e?.name, `mapping.${n}.categories.${k}.name`));
    });
    annotations.forEach(([i, a]) => ['label', 'text'].forEach(k => checkText(a[k], `annotations[${i}].${k}`)));
};

// the options: the locale and the sizes
const checkOptions = ({ def, names, warn }) => {
    const options = isObject(def.options) ? def.options : {};
    checkProp(options.message, 'options.message', warn, names.global);
    // a built-in locale or a language of Intl, e.g. "fr", null is the default
    const locale = isObject(options.locale) ? options.locale.base : (options.locale ?? undefined);
    if (locale !== undefined && typeof locale != 'string')
        warn('options.locale', `expected 'de', 'en', a language of Intl, e.g. 'fr', or an object with a 'base' locale`);
    else if (locale !== undefined) {
        try {
            checkLocale(locale);
        } catch (error) {
            warn('options.locale', error.message.replace(/^Unknown/, 'unknown'));
        }
    }
    checkProp(options.height, 'options.height', warn, names.global);
    Object.entries(isObject(options.margins) ? options.margins : {}).forEach(([k, v]) => checkProp(v, `options.margins.${k}`, warn, names.global));
};

// the transforms, a column of the values, the globals of their templates
const checkTransforms = ({ def, globals, warn }) => {
    [def.transform ?? []].flat().forEach((t, i) => {
        const path = `transform[${i}]`;
        if (!isObject(t))
            return warn(path, `expected a transform, e.g. { "type": "index", "column": "value", "base": { "year": "{base}" } }`);
        // the registered transforms, see utils/transform.js
        if (!transformNames.includes(t.type))
            warn(`${path}.type`, `unknown transform '${t.type}'${choices(t.type, transformNames)}`);
        if (t.type == 'calc' || t.type == 'filter') {
            if (t.expr === undefined)
                warn(`${path}.expr`, t.type == 'calc' ? `the expression of the value of the row is needed, e.g. { "*": [{ "/": ["@value", "@base"] }, 100] }`
                    : `the expression of the rows which are kept is needed, e.g. { ">": ["@value", 0] }`);
            checkProp(t.expr, `${path}.expr`, warn, null);
            if (t.type == 'calc' && typeof t.as != 'string')
                warn(`${path}.as`, `the name of the new column is needed`);
        } else if (t.type == 'random') {
            if (typeof t.as != 'string')
                warn(`${path}.as`, `the name of the new column is needed, e.g. "jitter"`);
        } else if (typeof t.column != 'string')
            warn(`${path}.column`, `the column of the values is needed`);
        if (t.type == 'bin' && t.edges === undefined && t.step === undefined)
            warn(`${path}.edges`, `the edges of the classes are needed, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143], or a 'step'`);
        if (t.replace !== undefined && t.type != 'bin')
            warn(`${path}.replace`, `only of a bin: its rows replace the rows`);
        if (t.type == 'lookup') {
            if (typeof t.data != 'string' || t.data.includes('{'))
                warn(`${path}.data`, `the url of the rows is needed, not a template`);
            ['key', 'value'].filter(k => typeof t[k] != 'string').forEach(k => warn(`${path}.${k}`, `the column of the ${k}s of the rows is needed`));
        }
        if (t.type == 'rolling' && !(Number.isInteger(t.size) && t.size > 0))
            warn(`${path}.size`, `the number of the rows of the window is needed, e.g. 7`);
        if (t.type == 'index' && !isObject(t.base))
            warn(`${path}.base`, `the rows of the base are needed, e.g. { "year": "{base}" }`);
        if (t.type == 'mean' && t.base !== undefined && !isObject(t.base))
            warn(`${path}.base`, `the rows of the mean, e.g. { "year": [1961, 1990] }`);
        if (t.min !== undefined && !(t.type == 'mean' && Number.isInteger(t.min) && t.min > 0))
            warn(`${path}.min`, `the least number of values of a mean, e.g. 22`);
        if (t.align !== undefined && !['end', 'center'].includes(t.align))
            warn(`${path}.align`, `expected 'end' or 'center'`);
        templateRefs(JSON.stringify(t)).filter(r => !globals.has(r)).forEach(r =>
            warn(path, `unknown global '${r}' in the template`));
    });
};

// the context of the checks of the parts of a definition: the mappings, the
// form elements, the plots and the annotations which are objects (the others
// are warnings), the coordinate system and the names of the references
const context = (def, warn, rows) => {
    // the entries which are objects, the others are warnings, e.g. null
    const objects = (entries, path, expected) => entries.filter(([k, e]) => isObject(e) || (warn(path(k), `expected ${expected}`), false));
    // the mappings, their parts which are no objects are left out of the checks
    // null removes a mapping, e.g. of a parent
    const mapping = Object.fromEntries(objects(Object.entries(def.mapping ?? {}).filter(([, m]) => m !== null), n => `mapping.${n}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`)
        .map(([n, m]) => [n, Object.fromEntries(Object.entries(m).filter(([k, v]) => {
            if (!mappingParts.includes(k) || isObject(v))
                return true;
            // null or false removes a part, e.g. the hover of a parent
            if (v !== null && v !== false)
                warn(`mapping.${n}.${k}`, `expected an object, e.g. {}`);
            return false;
        }))]));
    // the form elements with their index
    const formElements = objects([...(def.formElements ?? []).entries()], i => `formElements[${i}]`, 'a form element');

    // the coordinate systems known at the time of the check, also registered ones
    const coordName = def.options?.coord ?? 'cartesian';
    if (!Object.hasOwn(coords, coordName))
        warn('options.coord', `unknown coordinate system '${coordName}'${choices(coordName, Object.keys(coords))}`);
    const coord = coords[coordName] ?? coords.cartesian;

    // the names of the references, see docs/definition.md "Props of the definition": everywhere the globals
    // (also the ones of form elements) and the width of the visualisation, in
    // a facet its sizes, in a plot the props of its categories and the rows,
    // in a range the sizes of the coordinate system, e.g. `radius`
    const globals = new Set([
        ...Object.keys(def.globals ?? {}),
        ...formElements.map(([, e]) => e.ref).filter(r => typeof r == 'string'),
    ]);
    const globalNames = [...globals, 'totalWidth'];
    // the sizes of the bands of the scales of positions, e.g. `y:bandwidth`
    const bandNames = Object.entries(def.mapping ?? {}).filter(([, m]) => m?.scale?.orientation !== undefined && ['band', 'point'].includes(m.scale.type))
        .flatMap(([n]) => [`${n}:bandwidth`, `${n}:step`]);
    const facetNames = [...globalNames, 'width', 'innerWidth', 'height', 'innerHeight', ...(coordName == 'polar' ? ['radius'] : []), ...bandNames,
        'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height', ...(def.facets ? ['facet', 'facet:name'] : [])];
    const names = {
        global: new Set(globalNames),
        facet: new Set(facetNames),
        category: n => new Set([...globalNames, ...categoryNames(mapping[n])]),
        plot: categories => new PlotNames([
            ...facetNames,
            'row:index',
            ...Object.entries(mapping).flatMap(([n, m]) => rowNames(n, m ?? {})),
            ...categories.flatMap(c => categoryNames(mapping[c])),
        ]),
        range: new Set([...facetNames, ...Object.keys(coord.dims?.(1, 1) ?? {})]),
    };
    return {
        def, warn, rows, mapping, formElements, globals, names, coord, coordName,
        orientations: Object.keys(coord.ranges),
        plots: objects([...[].concat(def.plot ?? []).entries()], i => `plot[${i}]`, 'a plot, e.g. { "type": "svg:circle", "props": {} }'),
        annotations: objects([...[].concat(def.annotations ?? []).entries()], i => `annotations[${i}]`, 'an annotation, e.g. { "type": "line", "y": 0 }'),
    };
};

// the types of the mappings without one of the values of their columns, as
// the ones of the load (inferTypes of utils/data.js), of the columns of the
// rows and of the transforms, the transforms are computed if they are
// loaded (e.g. by the store), the types of other columns are not known
const withTypes = (def, rows) => {
    if (!Array.isArray(rows) || rows.length == 0)
        return def;
    let columns = null;
    try {
        columns = applyTransforms(rows, def.transform, def.globals ?? {}, utcColumns(def));
    } catch {
        // not loaded or a transform of a file, e.g. a lookup
    }
    const present = new Set(Object.keys(rows[0] ?? {}));
    inferTypes(def, rows, columns, column => present.has(column) || columns?.has(column));
    // the type of the scale of the type, see prepareMapping
    Object.entries(isObject(def.mapping) ? def.mapping : {}).filter(([, m]) => isObject(m) && m.type !== undefined
        && isObject(m.scale) && m.scale.of === undefined && m.scale.type === undefined)
        .forEach(([n, m]) => m.scale.type = scaleTypeOf(m, n, def.plot));
    return def;
};

// the warnings of the checks of the parts of the normalized definition
// (`normalized`) and of the schema of the definition of 4.0 (`def`, if
// `schemaChecked`), a warning of the schema is left out if a check warns of
// the same path, or of a value of a path above it, e.g. "expected a list" of
// the parts of a list
const checkDef = (def, normalized, rows, schemaChecked = true, plots = {}) => {
    const warnings = [];
    const warn = (path, message) => warnings.push([path, message]);
    const ctx = { ...context(normalized, warn, rows), raw: def, ...plots };
    [checkMappings, checkPlots, checkGeo, checkFilters, checkAnnotations, checkFormElements, checkFacets, checkTexts, checkOptions, checkTransforms]
        .forEach(check => check(ctx));
    const paths = new Set(warnings.map(([p]) => p));
    const values = warnings.filter(([, m]) => /^(expected|unknown)/.test(m)).map(([p]) => p);
    const below = p => values.some(v => p.startsWith(`${v}.`) || p.startsWith(`${v}[`));
    // a plot, an annotation or a transform is the one of a list, e.g. plot[0]
    const listed = { ...def, ...Object.fromEntries(['plot', 'annotations', 'transform'].filter(k => isObject(def[k])).map(k => [k, [def[k]]])) };
    const fromSchema = schemaChecked ? schemaWarnings(listed, schema).filter(([p]) => !paths.has(p) && !below(p)) : [];
    return [...new Set([...warnings, ...fromSchema].map(([p, m]) => `${p}: ${m}`))];
};

// the plot types without their default props, the props a definition writes
const withoutDefaults = () => Object.fromEntries(Object.entries(plotTypes).map(([n, t]) => [n, { ...t, defaults: undefined }]));

// the plots of a registered type: their default props which the plot does
// not write (`defaults`) and the type as it is written (`written`), by the
// index of the plot
const defaultProps = (def, normalized) => {
    const written = new Map();
    const defaults = new Map();
    const raw = [].concat(def.plot ?? []);
    [].concat(normalized.plot ?? []).forEach((p, i) => {
        const type = raw[i]?.type;
        if (typeof type != 'string' || !isObject(p) || !Object.hasOwn(plotTypes, p.type))
            return;
        written.set(i, type);
        const d = plotTypes[p.type].defaults;
        const own = typeof d == 'function' ? d(isObject(raw[i].props) ? raw[i].props : {}) : d;
        // the defaults which the plot does not replace
        if (isObject(own))
            defaults.set(i, Object.fromEntries(Object.entries(own).filter(([k]) => !Object.hasOwn(isObject(raw[i].props) ? raw[i].props : {}, k))));
    });
    return { written, defaults };
};

/**
 * Returns warnings for common mistakes in a (merged) definition, e.g. a
 * `$schema` of another version than gen-vis 4 (the load of a file needs one,
 * see resolveParents of utils/load.js, an object may have none), unknown
 * plot types, keys which are not in the schema or props which are not
 * evaluated. The parts are checked in the normalized definition (see
 * utils/normalize.js), the paths are the ones of the definition. The definitions of the entries of the form elements, the one
 * with the patch of an entry merged as the runtime merges it (see
 * applyPatches of utils/def.js), are checked as well, their warnings which
 * are not the ones of the definition have the entry before the path, e.g.
 * "formElements[0].values[1] > mapping.y.column: …". The `rows` of the data,
 * if given, are checked as well, e.g. years of a date mapping, the types of
 * the mappings without one are the ones of their values.
 */
const validateDef = (def, rows = null) => {
    const normalized = withTypes(normalize(def, { plotTypes: withoutDefaults() }), rows);
    // a $schema of another version, a definition object may have none, see utils/version.js
    const version = versionError(def?.$schema);
    const warnings = [
        ...(version ? [`$schema: no definition of gen-vis 4, ${version}`] : []),
        ...checkDef(def, normalized, rows, true, defaultProps(def, normalized)),
    ];
    const known = new Set(warnings);
    // the patches are checked by the schema as parts of the definition
    const pick = d => Object.fromEntries(patchable.filter(k => d?.[k] !== undefined).map(k => [k, d[k]]));
    (Array.isArray(normalized.formElements) ? normalized.formElements : []).forEach((e, i) => (Array.isArray(e?.values) ? e.values : []).forEach((v, j) => {
        if (!isObject(v?.patch))
            return;
        const variant = { ...normalized, ...mergeAll([pick(normalized), pick(v.patch)]), globals: { ...normalized.globals, ...(isObject(v.globals) ? v.globals : {}) } };
        checkDef(def, variant, rows, false).filter(w => !known.has(w)).forEach(w => {
            known.add(w);
            warnings.push(`formElements[${i}].values[${j}] > ${w}`);
        });
    }));
    return warnings;
};
