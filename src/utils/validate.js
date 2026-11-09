export { validateDef, curveNames };

import { intervalOf } from "@/utils/scales";
import * as d3 from "@/utils/d3";
import { checkLocale } from "@/utils/locale";
import { fillTemplate, templateRefs } from "@/utils/def";
import { curves } from "@/utils/draw";
import { plotTypes } from "@/plots";
import { coords } from "@/coords";
import { annotationKeys } from "@/coords/annotations.js";
import { projectionNames } from "@/coords/geo.js";
import { applyTransforms, transformNames, utcColumns } from "@/utils/transform";
import { isObject, missing, toNumber } from "@/utils/values";
import { isOperator, operators, refNames } from "@/utils/expr";
import { defaultScaleType, facetMappings, hasCategories, normalize, scaleTypeOf } from "@/utils/normalize";
import { inferTypes } from "@/utils/data";
import { versionError } from "@/utils/version";
import { translate, isDefinition4, authoredPath, markKeys, positionChannels } from "@/utils/language";
import { migrate } from "@/utils/migrate";
import { resolve, namesOfGlobals } from "@/utils/resolve";
import { schema, markNames } from "@/schema/definition.js";
import { similar } from "@/utils/warn";

// the interpolations of the plot types with a curve, e.g. cartesian:line
const curveNames = Object.keys(curves);

const show = v => typeof v == 'string' ? `'${v}'` : String(v);
const list = a => a.map(show).join(', ');

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
    // the globals are listed once, not also as `globals.<name>`
    const listed = [...names].filter(n => !n.startsWith('globals.'));
    const known = close !== undefined ? `, did you mean ${show(close)}?` : listed.length <= 12 ? `, expected one of ${list(listed)}` : '';
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
    // the place of the category of the row among the categories of the mapping and their number, e.g. of dodged bars
    `${n}:index`,
    `${n}:count`,
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

// the names of an expression of the rows of the data, e.g. of a filter: the
// ones of the mark and the columns (`columns`, of the data and the
// transforms); without the rows any plain name may be a column, e.g.
// "@type", not one of a part of a dim, e.g. "@x:index"
class RowNames extends PlotNames {
    constructor(names, columns) {
        super(names);
        this.columns = columns;
    }
    has(name) {
        return super.has(name) || (this.columns ? this.columns.has(name) : typeof name == 'string' && !name.includes(':') && !name.startsWith('globals.'));
    }
}

// the name of a registry of d3 in another case than the one of the schema,
// e.g. "Linear", which the registry accepts, see named of utils/registry.js
const otherCase = (name, names) => typeof name == 'string' && !names.includes(name)
    ? names.find(n => n.toLowerCase() == name.toLowerCase()) : undefined;

// --- the schema ---

// the part of the schema of a reference, e.g. "#/definitions/scale"
const resolveNode = node => {
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

// the condition of an if/then/else of the schema holds (see cases of
// src/schema/dsl.js): its type, pattern, number of keys and their names
const holds = (v, c) => (c.type === undefined || typeFits(v, c.type)) && (c.pattern === undefined || typeof v != 'string' || matches(v, c.pattern))
    && (c.maxProperties === undefined || !isObject(v) || Object.keys(v).length <= c.maxProperties)
    && (c.propertyNames?.enum === undefined || !isObject(v) || Object.keys(v).every(k => c.propertyNames.enum.includes(k)));
// the branch of an if/then/else of a value, undefined of none
const branchOf = (v, node) => holds(v, node.if) ? node.then : node.else;

// a value is of a branch of anyOf if it is of its type, e.g. a string of an
// enum of strings, its other warnings are the ones of the branch
const fits = (v, node) => {
    node = resolveNode(node);
    if (node?.if)
        return branchOf(v, node) === undefined || fits(v, branchOf(v, node));
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
    node = resolveNode(node);
    // the values of all branches of an if/then/else, not of an expression of the globals
    if (node.if)
        return [...new Set([node.then, node.else].filter(b => b && b.pattern != '^=').map(describe))].join(' or ');
    const branches = node.anyOf ?? node.oneOf;
    if (branches)
        return [...new Set(branches.map(describe))].join(' or ');
    if (node === schema.definitions.expression)
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
    node = resolveNode(node);
    // undefined is no value of JSON, e.g. a part which is left out; an
    // expression of the rows or the sizes ("=..." or a reference "@...")
    // stands for a value of any kind, the checks of the parts know them
    // a string of a transform is a template of the globals, e.g. "{op}"
    if (!isObject(node) || registered.has(node) || v === undefined || (typeof v == 'string' && /^[=@]/.test(v))
        || (path.startsWith('transform') && isTemplate(v)))
        return out;
    const at = message => (out.push([path, message]), out);
    // the branch of the value, e.g. of its type, see cases of src/schema/dsl.js
    if (node.if) {
        const branch = branchOf(v, node);
        return branch === undefined ? out : schemaWarnings(v, branch, path, key, out);
    }
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
        if (m.order !== undefined && !['ascending', 'descending', 'rows'].includes(m.order) && !Array.isArray(m.order))
            warn(`${path}.order`, `expected 'ascending', 'descending', 'rows' or a list of keys`);
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
        checkFormats(n, m, path, warn);
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
    if (Array.isArray(m.scale.domainAbs) && m.scale.domainAbs[0] > 0)
        warn(`${path}.scale.domainAbs`, `a positive start shrinks the domain at its start and cuts off data (the value is added), it extends with a negative one, e.g. [-1, 1]; "pad": 0.1 extends both ends`);
    if (m.scale.closed !== undefined && type != 'threshold')
        warn(`${path}.scale.closed`, `the side of the classes of a threshold scale, 'left' (default) or 'right'`);
    if (m.scale.orientation !== undefined && !orientations.includes(m.scale.orientation))
        warn(`${path}.scale.orientation`, orientations.length > 0
            ? `unknown orientation '${m.scale.orientation}'${choices(m.scale.orientation, orientations)}`
            : `the coordinate system '${coordName}' has no orientations, e.g. a scale of colors has none`);
};

// the formats of the values of a mapping which is no date one (of a time
// scale): a d3 format of numbers, e.g. not "%,.0f", see Store.format; a
// format with a template or an expression is known when it is drawn
const numberFormat = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
const checkFormats = (n, m, path, warn) => {
    if (m.type == 'date' || ['time', 'utc'].includes(m.scale?.type))
        return;
    [['format', m.format], ['axis.format', m.axis?.format], ['hover.format', m.hover?.format], ['legend.format', m.legend?.format]]
        // without a type a time format makes a date dim, see inferTypes
        .filter(([, f]) => typeof f == 'string' && !/[{@=]/.test(f) && !(m.type === undefined && f.includes('%'))).forEach(([k, f]) => {
            try {
                numberFormat.format(f);
            } catch (error) {
                warn(`${path}.${k}`, `'${f}' is no d3 format of numbers (${error.message})${f.includes('%') ? ', a time format is one of a date dim, "type": "date"' : ''}, e.g. ",.0f"`);
            }
        });
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
// null removes the conditions, e.g. of a parent, an expression of the
// values of the rows (`@dim`) and the globals is the condition of every row
const checkFilter = (ctx, conditions, path, known) => {
    if (conditions === undefined || conditions === null)
        return;
    if (isOperator(conditions))
        return checkProp(conditions, path, ctx.warn, ctx.names.rows);
    if (!isObject(conditions))
        return ctx.warn(path, `expected the conditions of mappings, e.g. { "year": "@year" }, or an expression`);
    Object.entries(conditions).forEach(([n, c]) => {
        if (!Object.hasOwn(ctx.mapping, n))
            ctx.warn(`${path}.${n}`, `unknown mapping '${n}'`);
        checkCondition(ctx, c, `${path}.${n}`, known);
    });
};

// the names of marks of 5.0 which are no kind of a plot type, see typeOf of utils/language.js
const aliases = ['point', 'label', 'cell', 'tick'];

// the plots: their types, categories, data and props
const checkPlots = ctx => {
    const { def, mapping, names, warn, coord, coordName } = ctx;
    const types = Object.keys(plotTypes);
    const curvePlots = types.filter(t => plotTypes[t].curve);
    const plotList = [].concat(def.plot ?? []);
    if (plotList.length == 0)
        warn('plot', 'missing');
    // the ids name the plots, e.g. of their classes and of the merge with a parent
    const ids = plotList.map((p, i) => p?.id ?? `mark-${i}`);
    ids.forEach((id, i) => {
        if (ids.indexOf(id) < i)
            warn(`plot[${i}].id`, `the id '${id}' is the one of plot[${ids.indexOf(id)}]`);
    });
    ctx.plots.forEach(([i, p]) => {
        const path = `plot[${i}]`;
        // a type without the prefix of the coordinate system is one which normalize did not find
        const short = typeof p.type == 'string' && !p.type.includes(':')
            ? [...new Set([...types.filter(t => !t.startsWith('annotation:') && (!plotTypes[t].coords || plotTypes[t].coords.includes(coordName))).map(t => t.split(':')[1]),
                ...aliases.filter(n => markNames.includes(n))])] : null;
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
            warn(`${path}.by`, ctx.columns?.has(c) ? `unknown mapping '${c}', a column of the data: a dim of it is needed, e.g. "dims": { "${c}": "${c}" }`
                : `unknown mapping '${c}'${choices(c, Object.keys(mapping))}`));
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
        if (p.ends !== undefined && (!['base', 'open'].includes(p.ends) || !['line', 'cartesian:line'].includes(p.type)))
            warn(`${path}.ends`, `the ends of the stairs of a line of x0 and x1, 'base' (down to the base, the default) or 'open'`);
        if (p.once !== undefined && typeof p.once != 'boolean')
            warn(`${path}.once`, `true: an element per facet, of no row, e.g. a header`);
        else if (p.once && (p.data !== undefined || [p.by ?? []].flat().length > 0 || p.filter !== undefined))
            warn(`${path}.once`, `a plot once per facet has no rows, no 'data', 'by' or 'filter'`);
        if (p.dodge !== undefined && (typeof p.dodge != 'number' || !['svg:text', 'polar:text'].includes(p.type)))
            warn(`${path}.dodge`, `the distance of the texts of a plot of 'svg:text' or 'polar:text', a number`);
        if (p.halo !== undefined && (!['boolean', 'number'].includes(typeof p.halo) || !['svg:text', 'polar:text', 'geo:text'].includes(p.type)))
            warn(`${path}.halo`, `a halo behind the texts of a text or label mark (also of polar charts and maps), true or its width`);
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
        // labels inside the bands of an area plot, see plots/inside.js
        if (isObject(p.place)) {
            const area = plotList.find(q => q?.id === p.place.in);
            if (!['svg:text', 'polar:text', 'text'].includes(p.type))
                warn(`${path}.place`, `the labels inside the bands of an area plot are of svg:text or polar:text`);
            else if (!area)
                warn(`${path}.place.in`, `unknown plot '${p.place.in}', expected the id of an area plot`);
            else if (!['area', 'cartesian:area', 'polar:area'].includes(area.type))
                warn(`${path}.place.in`, `expected an area plot, not one of '${area.type}'`);
            if (p.select !== undefined)
                warn(`${path}.select`, `the labels inside of bands are placed at the positions of all their rows, without a select`);
        }
        // the props of the highlight and of the other elements, see preparePlots of utils/def.js
        ['highlight', 'others'].filter(k => isObject(p[k])).forEach(k => Object.entries(p[k])
            .filter(([n]) => k != 'highlight' || n != 'mode').forEach(([n, v]) => checkProp(v, `${path}.${k}.${n}`, warn, plotNames)));
        // the references of the default props of the type, e.g. "@x:scaled" of a line
        const defaults = ctx.defaults?.get(i);
        if (defaults && plotNames)
            [...new Set(refNames(defaults).filter(r => r != 'color' && !plotNames.has(r)))].forEach(r => {
                const dim = r.split(':')[0];
                warn(path, `a mark of the type '${ctx.written?.get(i) ?? p.type}' reads '@${r}': it needs a dim '${dim}' with a scale (the channel ${dim}), e.g. "dims": { "${dim}": "value" }, or the attributes which replace its defaults`);
            });
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
    const { def, names, warn } = ctx;
    checkFilter(ctx, def.filter, 'filter', names.global);
    ctx.plots.forEach(([i, p]) => checkFilter(ctx, p.filter, `plot[${i}].filter`, names.facet));
    checkFilter(ctx, def.options?.hover?.filter, 'options.hover.filter', names.facet);
    if (def.options?.hover?.total && !Object.values(ctx.mapping).some(m => m.stacked))
        warn('options.hover.total', `the sum of the stacked values, there is no stacked mapping`);
    // the facets of plots and annotations: keys of facets or, of a grid, an
    // object of the values of the mappings of its rows and columns
    const facets = facetMappings(def.facets);
    [...ctx.plots.map(([i, p]) => [`plot[${i}]`, p]), ...ctx.annotations.map(([i, a]) => [`annotations[${i}]`, a])]
        .filter(([, p]) => isObject(p.facet)).forEach(([path, p]) => {
            if (!facets.grid)
                warn(`${path}.facet`, `an object of the rows and columns of a grid of facets ("rows", "cols"), of other facets their keys, e.g. "Wien"`);
            else
                Object.keys(p.facet).filter(k => !facets.all.includes(k)).forEach(k =>
                    warn(`${path}.facet.${k}`, `expected the mapping of the rows or the columns of the grid, ${list(facets.all)}`));
        });
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
        const ids = [ctx.def.plot ?? []].flat().map((p, j) => p?.id ?? `mark-${j}`);
        if (a.before !== undefined && !ids.includes(a.before))
            warn(`${path}.before`, `unknown plot '${a.before}'${ids.length ? `, expected one of ${list(ids)}` : ''}`);
    });
};

// the controls (the form elements of the engine) and their entries
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
    if (!grid && typeof def.facets.dim != 'string' && def.facets.rows === undefined)
        warn('facets.dim', `expected the name of a mapping`);
    // the dims of a grid are the ones of facets.by.rows and facets.by.cols
    const at = k => k == 'cols' ? 'facets.by.cols' : `facets.${k}`;
    parts.filter(k => typeof def.facets[k] == 'string').forEach(k => {
        if (!Object.hasOwn(mapping, def.facets[k]))
            warn(at(k), `unknown mapping '${def.facets[k]}'${choices(def.facets[k], Object.keys(mapping))}`);
        else if (!hasCategories(mapping[def.facets[k]]))
            warn(at(k), `the mapping '${def.facets[k]}' needs categories, e.g. "type": "categorical"`);
    });
    if (def.facets.rows !== undefined && typeof def.facets.rows != 'string')
        warn('facets.rows', `expected the mapping of the rows of a grid`);
    const headers = def.facets.rowHeaders;
    if (headers !== undefined && !['left', 'right'].includes(headers) && !(isObject(headers)
        && (headers.side === undefined || ['left', 'right'].includes(headers.side)) && (headers.vertical === undefined || typeof headers.vertical == 'boolean')))
        warn('facets.rowHeaders', `expected 'left' (horizontal), 'right' (vertical, the default) or { "side": "left", "vertical": true }`);
    const scales = def.facets.scales;
    if (Array.isArray(scales))
        scales.filter(n => !Object.hasOwn(mapping, n)).forEach(n =>
            warn('facets.scales', `unknown mapping '${n}'${choices(n, Object.keys(mapping))}`));
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
    // the props of the titles: of the category of the facet, of a grid the
    // one of the column or of the row
    const own = facetMappings(def.facets).all.filter(d => Object.hasOwn(mapping, d)).flatMap(d => categoryNames(mapping[d]));
    if (isObject(def.facets.title))
        checkProp(def.facets.title.props, 'facets.title.props', warn, new Set([...names.global, 'facet', 'facet:name', ...own]));
    if (!isObject(scales) && !Array.isArray(scales))
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
    checkHover(hover.title, 'options.hover.title', r => r == 'title' || r == 'total' || isGlobal(r) || Object.hasOwn(mapping, r.split('.')[0]));
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

// the keys each type of transform reads, see utils/transform-types.js
const transformKeys = {
    year: ['column', 'as'],
    align: ['column', 'as', 'year'],
    index: ['column', 'as', 'by', 'base', 'scale'],
    mean: ['column', 'as', 'by', 'base', 'min'],
    share: ['column', 'as', 'by'],
    rolling: ['column', 'as', 'by', 'order', 'size', 'align'],
    cumulative: ['column', 'as', 'by', 'order'],
    calc: ['expr', 'as'],
    filter: ['expr'],
    rank: ['column', 'as', 'by', 'descending'],
    random: ['as', 'range', 'seed', 'key'],
    lookup: ['column', 'as', 'data', 'dataFormat', 'key', 'value'],
    bin: ['column', 'as', 'by', 'edges', 'step', 'weight', 'normalize', 'per', 'start', 'end', 'replace'],
    fold: ['columns', 'key', 'value', 'replace'],
    aggregate: ['column', 'as', 'by', 'op', 'p', 'rows', 'order'],
    window: ['column', 'as', 'by', 'order', 'op', 'p', 'size', 'offset', 'align'],
    regression: ['column', 'as', 'by', 'x', 'method', 'degree'],
    format: ['column', 'as', 'format'],
};
// 'a', 'b' or 'c'
const or = names => names.length < 2 ? list(names) : `${list(names.slice(0, -1))} or ${show(names.at(-1))}`;
// a template of the globals, e.g. "{op}", its value is known when it is computed
const isTemplate = v => typeof v == 'string' && templateNames(v).length > 0;
// the ops of a window of `size` rows, see windowOf of utils/transform-types.js
const windowOps = ['sum', 'mean', 'min', 'max', 'median', 'q1', 'q3', 'quantile'];

// the columns of the rows after the transforms: the ones of the data
// (`present`) and the ones the transforms add, by their names (the
// templates filled with the globals `values`), a fold removes the folded ones
const transformedColumns = (transforms, present, values = {}) => {
    const columns = new Set(present);
    [transforms ?? []].flat().filter(isObject).forEach(raw => {
        const t = JSON.parse(fillTemplate(JSON.stringify(raw), values));
        const by = [t.by ?? []].flat();
        if (t.type == 'filter')
            return;
        if (t.type == 'fold') {
            foldedColumns(t, columns).forEach(c => columns.delete(c));
            [t.key ?? 'key', t.value ?? 'value'].forEach(c => columns.add(c));
        } else if (t.type == 'bin')
            [t.start ?? 'start', t.end ?? 'end', t.as ?? 'count', ...by].forEach(c => columns.add(c));
        else if (t.type == 'aggregate' && t.rows) {
            columns.clear();
            [t.as ?? t.column, ...by].forEach(c => columns.add(c));
        } else
            columns.add(t.as ?? t.column);
    });
    columns.delete(undefined);
    return columns;
};
// the columns a fold folds of the columns `columns`: a list or a pattern
const foldedColumns = (t, columns) => {
    if (Array.isArray(t.columns))
        return t.columns;
    if (typeof t.columns != 'string' || t.columns.split('*').length > 2)
        return [];
    const [start, end] = t.columns.split('*');
    return t.columns.includes('*') ? [...columns].filter(c => typeof c == 'string' && c.startsWith(start) && c.endsWith(end) && c.length >= start.length + end.length)
        : [t.columns];
};

// the transforms, a column of the values, the globals of their templates
const checkTransforms = ({ def, globals, warn, rows }) => {
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
        } else if (t.type == 'fold') {
            if (!(typeof t.columns == 'string' || (Array.isArray(t.columns) && t.columns.every(c => typeof c == 'string'))))
                warn(`${path}.columns`, `the columns to fold are needed, a list or a pattern with a '*', e.g. ["2019", "2020"] or "20*"`);
            else if (typeof t.columns == 'string' && t.columns.split('*').length > 2)
                warn(`${path}.columns`, `a pattern of columns has a single '*', e.g. "20*"`);
            ['key', 'value'].filter(k => t[k] !== undefined && typeof t[k] != 'string')
                .forEach(k => warn(`${path}.${k}`, `the name of the column of the ${k}s, e.g. "${k == 'key' ? 'year' : 'value'}"`));
            // the names of the key and the value replace the columns of the
            // rows of the same name which are not folded (of the rows given)
            const key = t.key ?? 'key', value = t.value ?? 'value';
            if (key === value)
                warn(`${path}.value`, `the column of the values is the one of the keys, '${key}', e.g. "key": "year", "value": "value"`);
            const before = Array.isArray(rows) && rows.length ? transformedColumns([def.transform].flat().slice(0, i), Object.keys(rows[0] ?? {}), def.globals) : null;
            if (before) {
                const folded = new Set(foldedColumns(t, before));
                [['key', key], ['value', value]].filter(([, c]) => typeof c == 'string' && before.has(c) && !folded.has(c) && !isTemplate(c))
                    .forEach(([k, c]) => warn(`${path}.${k}`, `the column '${c}' of the rows is replaced by the ${k}s of the folded columns, e.g. "${k}": "${k == 'key' ? 'name' : 'amount'}"`));
            }
        } else if (typeof t.column != 'string')
            warn(`${path}.column`, `the column of the values is needed`);
        if (t.type == 'bin' && t.edges === undefined && t.step === undefined)
            warn(`${path}.edges`, `the edges of the classes are needed, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143], or a 'step'`);
        if (t.replace !== undefined && !['bin', 'fold'].includes(t.type))
            warn(`${path}.replace`, `only of a bin or a fold: its rows replace the rows`);
        // the keys of the other types of transforms, which this one does not
        // read, e.g. a `by` of a calc (`replace` above)
        if (Object.hasOwn(transformKeys, t.type))
            Object.keys(t).filter(k => !['type', 'replace', 'min'].includes(k) && !transformKeys[t.type].includes(k) && Object.values(transformKeys).some(keys => keys.includes(k)))
                .forEach(k => warn(`${path}.${k}`, `only of a transform of the type ${or(Object.keys(transformKeys).filter(n => transformKeys[n].includes(k)))}`));
        if (t.type == 'bin') {
            [t.edges ?? []].flat().filter(e => isObject(e) && !(Number(e.step) > 0 && Number.isFinite(Number(e.from)) && Number.isFinite(Number(e.to))))
                .forEach(() => warn(`${path}.edges`, `a range of edges is { "from": 50, "to": 250, "step": 5 }, a positive step`));
            if (t.edges === undefined && t.step !== undefined && !(Number(t.step) > 0) && !String(t.step).includes('{'))
                warn(`${path}.step`, `the width of the classes, a positive number, e.g. 5`);
            if (t.per !== undefined && !(Number(t.per) > 0) && !isTemplate(t.per))
                warn(`${path}.per`, `a positive number of units, e.g. 5`);
            else if (t.per !== undefined && t.normalize == 'share')
                warn(`${path}.per`, `a share is one of the group, without a unit, 'per' is of counts and densities`);
        }
        // the operation of an aggregate or a window, also a template
        const ops = { aggregate: ['sum', 'mean', 'min', 'max', 'count', 'median', 'q1', 'q3', 'quantile', 'first', 'last'],
            window: ['lag', 'lead', 'diff', 'pct', ...windowOps] };
        if (Object.hasOwn(ops, t.type)) {
            if (t.op === undefined)
                warn(`${path}.op`, `the operation is needed, one of ${list(ops[t.type])}`);
            else if (!ops[t.type].includes(t.op) && !String(t.op).includes('{'))
                warn(`${path}.op`, `unknown op '${t.op}'${choices(t.op, ops[t.type])}`);
            // the probability of a quantile
            if (t.op == 'quantile' && !(Number(t.p) >= 0 && Number(t.p) <= 1 && t.p !== null && t.p !== '') && !isTemplate(t.p))
                warn(`${path}.p`, `the probability of the quantile is needed, a number from 0 to 1, e.g. 0.9`);
            else if (t.p !== undefined && t.op != 'quantile' && !isTemplate(t.op))
                warn(`${path}.p`, `only of the op 'quantile', e.g. "op": "quantile", "p": 0.9`);
        }
        // the time format of a format
        if (t.type == 'format' && typeof t.format != 'string')
            warn(`${path}.format`, `the time format is needed, e.g. "%W" (the week of the year) or "%u" (the weekday)`);
        // the x of a regression, its method and the degree of a polynomial
        if (t.type == 'regression') {
            if (typeof t.x != 'string')
                warn(`${path}.x`, `the column of the x values is needed, e.g. "x": "gdp"`);
            if (typeof t.as != 'string')
                warn(`${path}.as`, `the name of the column of the fitted values is needed, e.g. "trend"`);
            if (t.method !== undefined && !['linear', 'log', 'exp', 'poly'].includes(t.method) && !isTemplate(t.method))
                warn(`${path}.method`, `unknown method '${t.method}'${choices(t.method, ['linear', 'log', 'exp', 'poly'])}`);
            if (t.degree !== undefined && t.method != 'poly' && !isTemplate(t.method))
                warn(`${path}.degree`, `only of the method 'poly', e.g. "method": "poly", "degree": 2`);
            else if (t.degree !== undefined && ![2, 3].includes(t.degree) && !isTemplate(t.degree))
                warn(`${path}.degree`, `the degree of the polynomial, 2 or 3`);
        }
        if (t.type == 'lookup') {
            if (typeof t.data != 'string' || t.data.includes('{'))
                warn(`${path}.data`, `the url of the rows is needed, not a template`);
            ['key', 'value'].filter(k => typeof t[k] != 'string').forEach(k => warn(`${path}.${k}`, `the column of the ${k}s of the rows is needed`));
        }
        // the rows of the window of rolling and of the sums, means, least and
        // largest values of window, the offset of its other operations
        if ((t.type == 'rolling' || (t.type == 'window' && windowOps.includes(t.op))) && !(Number.isInteger(t.size) && t.size > 0) && !isTemplate(t.size))
            warn(`${path}.size`, `the number of the rows of the window is needed, e.g. 7`);
        if (t.type == 'window' && t.offset !== undefined && !(Number.isInteger(t.offset) && t.offset > 0) && !isTemplate(t.offset))
            warn(`${path}.offset`, `the number of the rows before or after the row, a positive integer, e.g. 1`);
        if (t.type == 'index' && !isObject(t.base))
            warn(`${path}.base`, `the rows of the base are needed, e.g. { "year": "{base}" }`);
        if (t.type == 'mean' && t.base !== undefined && !isObject(t.base))
            warn(`${path}.base`, `the rows of the mean, e.g. { "year": [1961, 1990] }`);
        if (t.min !== undefined && !(t.type == 'mean' && ((Number.isInteger(t.min) && t.min > 0) || isTemplate(t.min))))
            warn(`${path}.min`, `the least number of values of a mean, e.g. 22`);
        if (t.align !== undefined && !['end', 'center'].includes(t.align))
            warn(`${path}.align`, `expected 'end' or 'center'`);
        templateRefs(JSON.stringify(t)).filter(r => !globals.has(r)).forEach(r =>
            warn(path, `unknown global '${r}' in the template`));
    });
};

// the data, of the rows given: the columns of the dims (of a channel naming
// no dim, an implicit dim of its column) and the texts of numeric dims
const checkData = ({ raw, mapping, rows, columns, warn, source }) => {
    if (!columns)
        return;
    const named = isObject(source?.dims) ? source.dims : {};
    const names = [...columns].filter(c => typeof c == 'string');
    const unknownColumn = c => `'${c}' is not a column of the data${choices(c, names)}`;
    // the channels of the marks of the definition which name no dim of it
    const implicit = new Map();
    [source?.marks ?? []].flat().forEach((m, i) => isObject(m) && Object.keys(positionChannels).forEach(k => {
        const v = m[k];
        if (typeof v == 'string' && !/^[@=]/.test(v) && !Object.hasOwn(named, v) && !implicit.has(v))
            implicit.set(v, `marks[${i}].${k}`);
    }));
    Object.entries(mapping).forEach(([n, m]) => {
        const column = typeof m.column == 'string' ? fillTemplate(m.column, raw.globals ?? {}) : undefined;
        if (column === undefined || templateNames(column).length > 0)
            return;
        if (!columns.has(column)) {
            if (implicit.has(n))
                warn(implicit.get(n), `'${n}' is neither a dim nor a column of the data${choices(n, [...Object.keys(named), ...names])}`);
            else
                warn(`mapping.${n}.column`, unknownColumn(column));
            return;
        }
        // the texts of a numeric dim, of the rows of the data
        if (raw.mapping?.[n]?.type == 'numeric' && Array.isArray(rows)) {
            const texts = rows.map(r => r?.[column]).filter(v => typeof v == 'string' && !missing(v) && toNumber(v) === null);
            if (texts.length > 0)
                warn(`mapping.${n}.type`, `numeric, but ${texts.length} of the values of '${column}' are texts, e.g. ${JSON.stringify(texts[0])}, they are no values (left out); "type": "categorical" keeps them`);
        }
    });
};

// the context of the checks of the parts of a definition: the mappings, the
// form elements, the plots and the annotations which are objects (the others
// are warnings), the coordinate system and the names of the references
const context = (def, warn, rows, columns = null) => {
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

    // the names of the references, see docs/definition.md "Expressions" > "Names": everywhere the globals
    // (also the ones of form elements) and the width of the visualisation, in
    // a facet its sizes, in a plot the props of its categories and the rows,
    // in a range the sizes of the coordinate system, e.g. `radius`
    const globals = new Set([
        ...Object.keys(def.globals ?? {}),
        ...formElements.map(([, e]) => e.ref).filter(r => typeof r == 'string'),
    ]);
    // a global also as `globals.<name>`, e.g. of a global a dim of the same name shadows
    const globalNames = [...globals, ...[...globals].map(g => `globals.${g}`), 'totalWidth'];
    // the sizes of the bands of the scales of positions, e.g. `y:bandwidth`
    const bandNames = Object.entries(def.mapping ?? {}).filter(([, m]) => m?.scale?.orientation !== undefined && ['band', 'point'].includes(m.scale.type))
        .flatMap(([n]) => [`${n}:bandwidth`, `${n}:step`]);
    const facetNames = [...globalNames, 'width', 'innerWidth', 'height', 'innerHeight', ...(coordName == 'polar' ? ['radius'] : []), ...bandNames,
        'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height', ...(def.facets ? ['facet', 'facet:name'] : []),
        ...(facetMappings(def.facets).grid ? ['facet:row', 'facet:col', 'facet:row:name', 'facet:col:name'] : [])];
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
        // the expressions of the rows, e.g. of a filter, also of the columns
        rows: new RowNames([...facetNames, 'row:index', ...Object.entries(mapping).flatMap(([n, m]) => rowNames(n, m ?? {}))], columns),
    };
    return {
        def, warn, rows, columns, mapping, formElements, globals, names, coord, coordName,
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

// the warnings [path, message] of the checks of the parts of the normalized
// definition (`normalized`), `def` is the engine's form as translated
const checkDef = (def, normalized, rows, extra = {}) => {
    const warnings = [];
    const warn = (path, message) => warnings.push([path, message]);
    const ctx = { ...context(normalized, warn, rows, extra.columns), raw: def, ...extra };
    [checkMappings, checkPlots, checkGeo, checkFilters, checkAnnotations, checkFormElements, checkFacets, checkTexts, checkOptions, checkTransforms, checkData]
        .forEach(check => check(ctx));
    return warnings;
};

// the plot types without their default props, the props a definition writes
const withoutDefaults = () => Object.fromEntries(Object.entries(plotTypes).map(([n, t]) => [n, { ...t, defaults: undefined }]));

// the plots of a registered type: their default props which the plot does
// not write (`defaults`) and the type as it is written (`written`, of the
// `marks` of the definition), by the index of the plot
const defaultProps = (def, normalized, marks = []) => {
    const written = new Map();
    const defaults = new Map();
    const raw = [].concat(def.plot ?? []);
    [].concat(normalized.plot ?? []).forEach((p, i) => {
        const type = isObject(marks[i]) && typeof marks[i].type == 'string' ? marks[i].type : raw[i]?.type;
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

// a warning of the engine's form in the words of the definition: the paths
// (see authoredPath) and the names of its parts, dims, marks and controls
const authoredText = m => m
    .replace(/\bmappings\b/g, 'dims').replace(/\bmapping\b/g, 'dim')
    .replace(/\bplot\[(\d+)\]\.props\./g, 'marks[$1].').replace(/\bplot\[(\d+)\]/g, 'marks[$1]')
    .replace(/\bplots\b(?! area)/g, 'marks').replace(/(?<![:'])\bplot\b(?!:|-| area| type)/g, 'mark')
    .replace(/\bform elements\b/g, 'controls').replace(/\bform element\b/g, 'control')
    .replace(/\boptions\.hover\b/g, 'hover').replace(/\boptions\.height\b/g, 'height');
const authored = ([p, m]) => [authoredPath(p), authoredText(m)];

// the warnings of the engine's form of a definition of 5.0 resolved with
// the globals `names`, in the words of the definition
const checkResolved = (source, names, rows) => {
    const resolved = resolve(source, names);
    const engine = translate(resolved);
    const normalized = withTypes(normalize(engine, { plotTypes: withoutDefaults() }), rows);
    // the columns of the rows given, of the data and of the transforms
    const columns = Array.isArray(rows) && rows.length > 0
        ? transformedColumns(engine.transform, new Set(rows.slice(0, 1000).flatMap(r => isObject(r) ? Object.keys(r) : [])), engine.globals) : null;
    const warnings = [...checkDef(engine, normalized, rows, { ...defaultProps(engine, normalized, [resolved.marks ?? []].flat()), columns, source: resolved }).map(authored),
        ...markKeyWarnings(resolved)];
    return { resolved, warnings };
};

// the attributes of svg (and of gen-vis, e.g. text, max-width and the
// angles of polar marks) a mark may have, its other keys are attributes too,
// e.g. data-*; a name near one of them or of a key of a mark is a typo
const svgAttributes = ['alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'cursor', 'd',
    'direction', 'display', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font-family',
    'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'image-rendering', 'letter-spacing', 'marker-end',
    'marker-mid', 'marker-start', 'mask', 'opacity', 'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity',
    'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
    'text-anchor', 'text-decoration', 'text-rendering', 'transform', 'transform-origin', 'vector-effect', 'visibility', 'word-spacing', 'writing-mode',
    'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'points', 'pathLength', 'href', 'class',
    'id', 'style', 'title', 'text', 'max-width', 'angle', 'radius', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle',
    'cornerRadius', 'mix-blend-mode', 'isolation'];
const markOptionKeys = [...markKeys, ...Object.keys(positionChannels)];

// the keys of the marks which are probably typos of a key of a mark (they
// become attributes, e.g. "bye", "stak") or of an attribute of svg (e.g.
// "strok-width"), of the definition as written
const markKeyWarnings = resolved => {
    const marks = resolved.marks;
    const list = Array.isArray(marks) ? marks : isObject(marks) ? [marks] : [];
    return list.flatMap((m, i) => !isObject(m) ? [] : Object.keys(m).filter(k => !markOptionKeys.includes(k) && !svgAttributes.includes(k) && !k.startsWith('data-') && !k.startsWith('aria-'))
        .flatMap(k => {
            const option = similar(k, markOptionKeys);
            if (option !== undefined)
                return [[`marks[${i}].${k}`, `unknown key, did you mean '${option}'? (other keys are attributes of the elements)`]];
            const attribute = similar(k, svgAttributes);
            return attribute !== undefined ? [[`marks[${i}].${k}`, `no attribute of svg, did you mean '${attribute}'?`]] : [];
        }));
};

/**
 * Returns warnings for common mistakes in a (merged) definition of gen-vis 5
 * (one of gen-vis 4 is migrated first, as by the load): a `$schema` of
 * another version (the load of a file needs one, see resolveParents of
 * utils/load.js, an object may have none), unknown mark types, keys which
 * are not in the schema (checked in the definition as written, see
 * src/schema/definition.js) or expressions which are not evaluated. The
 * parts are checked in the form the engine reads (resolved with the
 * defaults of the globals, translated and normalized, see utils/language.js
 * and utils/normalize.js), the paths and the words are the ones of the
 * definition. The definitions of the other values of the controls are
 * checked as well, their warnings which are not the ones of the definition
 * have the entry before the path, e.g. "controls[0].values[1] >
 * dims.y.column: …". The `rows` of the data, if given, are checked as well,
 * e.g. years of a date dim, the types of the dims without one are the ones
 * of their values.
 */
const validateDef = (raw, rows = null) => {
    // a $schema of another version, a definition object may have none, see utils/version.js
    const version = versionError(raw?.$schema);
    const head = version ? [`$schema: no definition of gen-vis 5, ${version}`] : [];
    const source = isObject(raw) ? (isDefinition4(raw) ? migrate(raw) : raw) : {};
    const controls = Array.isArray(source.controls) ? source.controls : [];
    const globals = isObject(source.globals) ? source.globals : {};
    let own, resolved;
    try {
        ({ warnings: own, resolved } = checkResolved(source, namesOfGlobals(globals, controls), rows));
    } catch (error) {
        // the shape of a part is none the engine reads, e.g. a dim of a number
        return [...head, error.message];
    }
    // the schema of the definition as written, with the expressions of the
    // globals resolved (their values are checked), a warning of the schema
    // is left out if a check warns of the same path, or of a value of a path
    // above it, e.g. "expected a list" of the parts of a list; a mark, an
    // annotation or a transform is the one of a list, e.g. marks[0]
    const paths = new Set(own.map(([p]) => p));
    const values = own.filter(([, m]) => /^(expected|unknown)/.test(m)).map(([p]) => p);
    const below = p => values.some(v => p.startsWith(`${v}.`) || p.startsWith(`${v}[`));
    const listed = { ...resolved, ...Object.fromEntries(['marks', 'annotations', 'transform'].filter(k => isObject(resolved[k])).map(k => [k, [resolved[k]]])) };
    const fromSchema = schemaWarnings(listed, schema).filter(([p]) => !paths.has(p) && !below(p));
    const warnings = [...head, ...new Set([...own, ...fromSchema].map(([p, m]) => `${p}: ${m}`))];
    const known = new Set(warnings);
    // the definitions of the other values of the controls
    controls.forEach((c, i) => {
        const g = isObject(c) ? c.global : undefined;
        if (typeof g != 'string' || !Array.isArray(c.values))
            return;
        c.values.forEach((v, j) => {
            const value = isObject(v) ? v.value : v;
            if (value === undefined || value === globals[g])
                return;
            let variant;
            try {
                variant = checkResolved(source, namesOfGlobals({ ...globals, [g]: value }, controls), rows).warnings.map(([p, m]) => `${p}: ${m}`);
            } catch (error) {
                variant = [error.message];
            }
            variant.filter(w => !known.has(w)).forEach(w => {
                known.add(w);
                warnings.push(`controls[${i}].values[${j}] > ${w}`);
            });
        });
    });
    return warnings;
};
