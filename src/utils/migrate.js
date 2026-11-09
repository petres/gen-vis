export { migrate, conditionExpression, expressionText, formatJson };

import { isObject } from '@/utils/values';
import { isOperator } from '@/utils/expr';
import { formatExpression, parseExpression } from '@/utils/expr-parse';
import { schemaUrl } from '@/utils/version';
import { expressionKeys, optionKeys, translate, colorDims, dimOf as languageDim } from '@/utils/language';
import { resolve, namesOfGlobals } from '@/utils/resolve';
import { mergeAll } from '@/utils/def';
import { isCategorical } from '@/utils/normalize';

/**
 * A definition of gen-vis 4 as one of gen-vis 5 (see docs/definition.md and
 * the changelog of 5.0): the options at the top level, `mapping` as `dims`,
 * `plot` as `marks` with channels instead of props of scaled positions,
 * `formElements` as `controls` of globals (their patches as expressions of
 * the globals), the conditions of filters and the objects of expressions
 * as the string syntax. `migrate` is pure, JSON to JSON; what it can not
 * express as 5.0 shorthands stays as it is (every prop of 4.x is still an
 * attribute of a mark), so the chart is the same.
 */

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

// the string syntax of an expression object, prefixed with `=` unless it
// starts with a reference, other values as they are
const expressionText = v => {
    if (!isOperator(v))
        return v;
    let text;
    try {
        text = formatExpression(v);
        // e.g. a template in a reference ("@{smooth}") has no text
        parseExpression(text);
    } catch {
        // an expression the syntax has no text of, e.g. a sum of one argument, stays an object
        return v;
    }
    return text.startsWith('@') ? text : `=${text}`;
};

// the values of a part with its expressions as texts: the ones of the keys
// of expressions (see expressionKeys of utils/language.js) and everything
// in `props`, other objects of one key are no operators, e.g. { "format": ".1f" }
const texts = (v, key = undefined, inside = false) => {
    const expression = inside || (key !== undefined && expressionKeys.has(key));
    if (Array.isArray(v))
        return v.map(e => texts(e, undefined, expression));
    if (isOperator(v) && expression)
        return expressionText(v);
    if (isObject(v))
        return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, texts(e, k, expression || k == 'props' || k == 'highlight' || k == 'others')]));
    return v;
};

// a reference of a condition is one to a global (a dim of the same name would shadow it)
const globalRef = v => typeof v == 'string' && v.startsWith('@') && !v.startsWith('@globals.') ? `@globals.${v.slice(1)}` : v;

// a value of a condition as the text of an expression, a reference is one
// to a global (a dim of the same name would shadow it)
const literal = v => typeof v == 'string' ? (v.startsWith('@') ? globalRef(v) : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    : v === null ? 'null' : isOperator(v) ? `(${formatExpression(v)})` : String(v);

/**
 * The expression (a text) of the conditions of a filter of 4.x, e.g.
 * `{ "year": "@year", "type": { "not": "load" } }` is
 * `"@year == @year and @type != 'load'"`, see rowFilter of utils/data.js.
 */
const conditionExpression = (conditions, objects = false, dims = undefined) => {
    if (conditions === undefined || conditions === null || typeof conditions == 'boolean' || typeof conditions == 'string' || isOperator(conditions))
        return conditions;
    // conditions of dates stay an object (the conditions of 4.x, which 5.0
    // reads): it compares the dates, an expression the texts of the rows
    if (dims !== undefined && comparedAsDates(conditions, dims))
        return globalRefs(conditions);
    // conditions of values and lists of values stay an object, the shorthand
    // of 5.0 (it merges with the one of a parent), a reference is one to a
    // global; `not`, `range` and null need an expression
    if (objects && Object.values(conditions).every(c => c !== null && (Array.isArray(c) ? c.every(v => v !== null && typeof v != 'object') : typeof c != 'object')))
        return Object.fromEntries(Object.entries(conditions).map(([dim, c]) => [dim, Array.isArray(c) ? c.map(globalRef) : globalRef(c)]));
    const parts = Object.entries(conditions).map(([dim, c]) => conditionOf(dim, c));
    if (parts.length == 0)
        return true;
    const text = parts.length == 1 ? parts[0] : parts.map(p => p.includes(' or ') ? `(${p})` : p).join(' and ');
    // an expression text starts with a reference or `=`
    return text.startsWith('@') ? text : `=${text}`;
};
// the dims of dates and the texts of dates (ISO, e.g. 2020-01 or
// 2020-01-01, or day first, 31.12.2020), a year alone is a number
const dateText = /^\s*(\d{4}-\d{1,2}(-\d{1,2})?([T ]\d.*)?|\d{1,2}\.\d{1,2}\.\d{4}.*)\s*$/;
const isDateDim = m => isObject(m) && (m.type == 'date' || ['time', 'utc'].includes(m.scale?.type));
const valuesOf = c => Array.isArray(c) ? c.flatMap(valuesOf) : isObject(c) && 'not' in c ? valuesOf(c.not) : isObject(c) && Array.isArray(c.range) ? c.range : [c];
const comparedAsDates = (conditions, dims) => Object.entries(conditions)
    .some(([dim, c]) => isDateDim(dims?.[dim]) || valuesOf(c).some(v => typeof v == 'string' && dateText.test(v)));
const globalRefs = c => Array.isArray(c) ? c.map(globalRefs) : isObject(c) && !isOperator(c) ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k, globalRefs(v)])) : globalRef(c);
const conditionOf = (dim, c, negated = false) => {
    const eq = negated ? '!=' : '==';
    if (c === null || c === undefined)
        return `@${dim} ${eq} null`;
    if (Array.isArray(c)) {
        // no values: no rows (all rows of a negation)
        if (c.length == 0)
            return negated ? 'true' : 'false';
        const alternatives = c.map(v => `@${dim} ${eq} ${literal(v)}`);
        return alternatives.join(negated ? ' and ' : ' or ');
    }
    // `not` and `range` are parts of the conditions, not operators
    if (isObject(c) && ('not' in c || Array.isArray(c.range))) {
        if ('not' in c)
            return conditionOf(dim, c.not, !negated);
        if (Array.isArray(c.range)) {
            const [from, to] = c.range;
            const test = from !== null && from !== undefined && to !== null && to !== undefined ? `${literal(from)} <= @${dim} <= ${literal(to)}`
                : from !== null && from !== undefined ? `@${dim} >= ${literal(from)}`
                    : to !== null && to !== undefined ? `@${dim} <= ${literal(to)}` : 'true';
            return negated ? `not (${test})` : test;
        }
    }
    return `@${dim} ${eq} ${literal(c)}`;
};

// the dim of a reference to a scaled value, e.g. "x" of "@x:scaled",
// undefined of other values; `kind` is the rest of the name
const scaledOf = v => {
    const m = typeof v == 'string' ? /^@([^:]+):(.+)$/.exec(v) : null;
    return m ? { dim: m[1], kind: m[2] } : undefined;
};

// the channel of a prop of a scaled value of a dim: the dim, of a fixed
// value (`@x:scaled:100`) the number, undefined of other values
const channel = v => {
    const s = scaledOf(v);
    if (!s)
        return undefined;
    if (s.kind == 'scaled')
        return s.dim;
    const fixed = /^scaled:(-?\d+(?:\.\d+)?)$/.exec(s.kind);
    return fixed ? Number(fixed[1]) : undefined;
};

// a mapping of 4.x as a dim of 5.0, the names of the dims with a hover are
// collected in `hovered`
const dimOf = (m, name, hovered, consumed, coord = 'cartesian', dims = {}) => {
    if (typeof m == 'string')
        return m;
    if (!isObject(m))
        return m;
    const d = { ...m };
    // a categorical vertical scale without a range of 4.x had its first
    // category at the bottom, of 5.0 at the top: `reverse` keeps the picture
    const orientation = isObject(d.scale) && d.scale.orientation !== undefined ? d.scale.orientation : (coord == 'cartesian' && name == 'y' ? 'vertical' : undefined);
    const ofCategories = d.type == 'categorical' || ['band', 'point'].includes(d.scale?.type)
        || ['categories', 'scheme', 'common', 'order', 'fromData', 'ranks'].some(k => d[k] !== undefined);
    // (and reversed of 4.x from the top: of 5.0 not reversed)
    if (orientation == 'vertical' && ofCategories && d.scale !== false && !Array.isArray(d.scale?.range)) {
        const reverse = d.scale?.reverse;
        if (reverse === true || reverse === false) {
            d.scale = { ...d.scale };
            delete d.scale.reverse;
            if (Object.keys(d.scale).length == 0)
                delete d.scale;
        }
        if (reverse !== true && !(typeof reverse == 'string' || isObject(reverse)))
            d.reverse = true;
    }
    // the hover of a dim stays on the dim (also an empty one, the opt-in of
    // 4.x), it merges with the one of a parent
    if (isObject(d.hover))
        hovered.push(name);
    // the stacking of a mark, a dim stacked by no mark keeps it (e.g. of the hover)
    if (consumed.has(name)) {
        delete d.stacked;
        delete d.stackBy;
    } else if (d.stacked !== undefined && isObject(d.stacked))
        d.stacked = conditionExpression(d.stacked, false, dims);
    if (isObject(d.scale)) {
        const scale = { ...d.scale };
        if (Array.isArray(scale.domainRel)) {
            const [a = 0, b = 0] = scale.domainRel;
            scale.pad = [-a, b];
            delete scale.domainRel;
        }
        if (scale.domain !== undefined && d.domain === undefined) {
            d.domain = scale.domain;
            delete scale.domain;
        }
        if (scale.nice !== undefined && d.nice === undefined) {
            d.nice = scale.nice;
            delete scale.nice;
        }
        d.scale = scale;
    }
    if (Array.isArray(d.domain) && d.domain.length == 2 && d.domain[0] === 0 && d.domain[1] === null) {
        d.zero = true;
        delete d.domain;
    }
    if (isObject(d.axis)) {
        const axis = { ...d.axis };
        if (axis.grid === true) {
            d.grid = true;
            delete axis.grid;
        }
        // an axis given empty stays, it is the axis of a dim of no position
        if (Object.keys(axis).length > 0 || Object.keys(d.axis).length == 0)
            d.axis = axis;
        else
            delete d.axis;
    }
    // `fromData` stays: the categories of the data ascending, of 5.0 by
    // default the ones of the dims of the marks' by in the order of the rows
    if (isObject(d.categories))
        d.categories = Object.fromEntries(Object.entries(d.categories).map(([k, c]) => [k, isObject(c) && Object.keys(c).length == 1 && typeof c.color == 'string' ? c.color : c]));
    // a legend without a symbol of its own has the ones of the plots in 5.0
    // ("auto"), of 4.x only the names: none
    if (isObject(d.legend) && d.legend.symbol === undefined)
        d.legend = { ...d.legend, symbol: null };
    return texts(d, 'dim');
};

// the full type names of 4.x as the short ones of 5.0
const shortType = (type, coord) => {
    if (typeof type != 'string')
        return type;
    const [prefix, name] = type.includes(':') ? type.split(':') : [coord, type];
    if (prefix == 'svg' && name == 'circle')
        return 'point';
    // a line of svg is no line of the coordinate system
    if (prefix == 'svg')
        return name == 'line' ? type : name;
    if (prefix == coord)
        return name == 'circle' ? 'point' : name;
    return type;
};

// a plot of 4.x as a mark of 5.0: the props of scaled positions as channels
// (a default of the type is left out), the others as attributes
const markOf = (p, i, coord, stacked, dims, consumed) => {
    if (!isObject(p))
        return p;
    const { props = {}, type, by, filter, highlight, others, ...rest } = p;
    const mark = { type: shortType(type, coord) };
    if (rest.id !== undefined && rest.id !== `plot-${i}`)
        mark.id = rest.id;
    delete rest.id;
    if (by !== undefined)
        mark.by = Array.isArray(by) && by.length == 1 ? by[0] : by;
    Object.entries(rest).forEach(([k, v]) => mark[k] = v);
    if (filter !== undefined)
        mark.filter = conditionExpression(filter, false, dims);
    const attrs = { ...props };
    // the kind of the type of 4.x (`point` is a circle), not of the short
    // name of 5.0, e.g. `point` of svg:circle
    const kind = (k => k == 'point' ? 'circle' : k)(typeof type == 'string' ? type.split(':').at(-1) : '');
    const take = k => { const v = attrs[k]; delete attrs[k]; return v; };
    // the channel `name` of the value of the attribute `attr` (by default the
    // channel), the attribute stays as it is if the value is none of a dim
    const setChannel = (name, v, fallback, attr = name) => {
        const c = channel(v);
        if (c === undefined)
            attrs[attr] = v;
        else if (c !== fallback)
            mark[name] = c;
    };
    // a dim which 5.0 positions at the center of its band (see translate),
    // also one of a type categorical without categories
    const categorical = d => isCategorical(dims[d]);
    // the channel of a position of an element at a value, of a categorical
    // dim the center of its band (`@x:scaled:center`), the start of the band
    // (`@x:scaled`) stays an attribute
    const setPoint = (name, attr) => {
        const v = attrs[attr];
        if (v === undefined)
            return;
        const s = scaledOf(v);
        if (s && s.kind == 'scaled:center' && categorical(s.dim)) {
            delete attrs[attr];
            setChannel(name, `@${s.dim}:scaled`, name, attr);
        } else if (s && s.kind == 'scaled' && !categorical(s.dim)) {
            delete attrs[attr];
            setChannel(name, v, name, attr);
        }
    };
    // a stacked value: the start and the end of the value dim
    const stackOf = (v0, v1) => {
        const a = scaledOf(v0), b = scaledOf(v1);
        const dim = a && b && a.dim == b.dim && a.kind == 'start:scaled' && b.kind == 'end:scaled' ? a.dim : undefined;
        if (dim !== undefined)
            consumed.add(dim);
        return dim;
    };
    // the coordinate system of a short type name as 4.x resolved it: the
    // one of the coordinate system first, then an svg element (text, circle, rect)
    const svgKinds = coord == 'cartesian' || coord === undefined ? ['text', 'circle', 'rect'] : ['rect'];
    const prefix = typeof type == 'string' && type.includes(':') ? type.split(':')[0] : svgKinds.includes(kind) ? 'svg' : (coord ?? 'cartesian');
    // a position of an element of svg at a value of a scale ("@x:scaled:0")
    // stays an attribute, a number of a channel of these marks is pixels
    const setDim = (name, attr = name) => {
        const v = attrs[attr];
        if (v === undefined)
            return;
        if (scaledOf(v)?.kind == 'scaled')
            setChannel(name, take(attr), undefined, attr);
    };
    if (prefix == 'svg') {
        if (kind == 'circle') {
            setPoint('x', 'cx');
            setPoint('y', 'cy');
        } else if (kind == 'text') {
            setPoint('x', 'x');
            setPoint('y', 'y');
        } else
            ['x', 'y', 'x1', 'x2', 'y1', 'y2'].forEach(k => setDim(k));
    } else if (prefix == 'cartesian') {
        if (kind == 'line' || kind == 'area') {
            const d = isObject(attrs.d) ? { ...attrs.d } : {};
            delete attrs.d;
            if (d.x0 !== undefined || d.x1 !== undefined) {
                setChannel('x0', d.x0);
                setChannel('x1', d.x1);
            } else if (d.x !== undefined)
                setChannel('x', d.x, 'x');
            if (kind == 'line') {
                if (d.y !== undefined)
                    setChannel('y', d.y, 'y');
            } else {
                const stackDim = stackOf(d.y0, d.y1);
                if (stackDim) {
                    mark.stack = stacked[stackDim] ?? true;
                    if (stackDim != 'y')
                        mark.y = stackDim;
                } else {
                    if (d.y1 !== undefined)
                        setChannel('y', d.y1, 'y');
                    if (d.y0 !== undefined && !(scaledOf(d.y0)?.kind == 'scaled:0' && scaledOf(d.y0).dim == (mark.y ?? 'y')))
                        setChannel('y0', d.y0, undefined, 'y0');
                }
            }
            ['x', 'y', 'x0', 'x1', 'y1'].forEach(k => delete d[k]);
            if (mark.y0 !== undefined || !d.y0 || (scaledOf(d.y0)?.kind == 'scaled:0'))
                delete d.y0;
            if (Object.keys(d).length)
                attrs.d = d;
        } else if (kind == 'bar') {
            const stackDim = stackOf(attrs.y0, attrs.y1) ?? stackOf(attrs.x0, attrs.x1);
            if (stackDim) {
                mark.stack = stacked[stackDim] ?? true;
                const horizontal = stackOf(attrs.x0, attrs.x1) !== undefined;
                if (horizontal) {
                    take('x0'); take('x1');
                    mark.orient = 'horizontal';
                    if (stackDim != 'x')
                        mark.x = stackDim;
                    if (attrs.y !== undefined)
                        setChannel('y', take('y'), 'y');
                } else {
                    take('y0'); take('y1');
                    if (stackDim != 'y')
                        mark.y = stackDim;
                    if (attrs.x !== undefined)
                        setChannel('x', take('x'), 'x');
                    // the classes of a bin, stacked
                    if (attrs.x0 !== undefined)
                        setChannel('x0', take('x0'));
                    if (attrs.x1 !== undefined)
                        setChannel('x1', take('x1'));
                }
            } else if (attrs.x1 !== undefined && attrs.y1 !== undefined) {
                setChannel('x0', take('x0'));
                setChannel('x1', take('x1'));
                setChannel('y', take('y1'), 'y');
                if (attrs.y0 !== undefined)
                    setChannel('y0', take('y0'));
            } else if (attrs.x1 !== undefined) {
                mark.orient = 'horizontal';
                setChannel('x', take('x1'), 'x');
                if (attrs.y !== undefined)
                    setChannel('y', take('y'), 'y');
                if (attrs.x0 !== undefined)
                    setChannel('x0', take('x0'));
            } else {
                if (attrs.x !== undefined)
                    setChannel('x', take('x'), 'x');
                if (attrs.y1 !== undefined)
                    setChannel('y', take('y1'), 'y');
                if (attrs.y0 !== undefined)
                    setChannel('y0', take('y0'));
            }
        } else if (kind == 'rule') {
            ['x', 'y', 'x1', 'x2', 'y1', 'y2'].forEach(k => {
                const s = scaledOf(attrs[k]);
                // the position at a category: the center of its band, the start stays an attribute
                if ((k == 'x' || k == 'y') && s && categorical(s.dim) && (s.kind == 'scaled' || s.kind == 'scaled:center')) {
                    if (s.kind == 'scaled:center') {
                        delete attrs[k];
                        setChannel(k, `@${s.dim}:scaled`, k == 'x' ? 'x' : undefined);
                    }
                } else if (attrs[k] !== undefined)
                    setChannel(k, take(k), k == 'x' ? 'x' : undefined);
            });
        }
    } else if (prefix == 'polar') {
        if (kind == 'line' || kind == 'area') {
            const d = isObject(attrs.d) ? { ...attrs.d } : {};
            delete attrs.d;
            if (d.angle !== undefined)
                setChannel('x', d.angle, 'x');
            if (kind == 'line') {
                if (d.radius !== undefined)
                    setChannel('y', d.radius, 'y');
            } else {
                const stackDim = stackOf(d.innerRadius, d.outerRadius);
                if (stackDim) {
                    mark.stack = stacked[stackDim] ?? true;
                    if (stackDim != 'y')
                        mark.y = stackDim;
                    delete d.innerRadius;
                } else {
                    if (d.outerRadius !== undefined)
                        setChannel('y', d.outerRadius, 'y');
                    if (scaledOf(d.innerRadius)?.kind == 'scaled:0' && scaledOf(d.innerRadius).dim == (mark.y ?? 'y'))
                        delete d.innerRadius;
                }
            }
            ['angle', 'radius', 'outerRadius'].forEach(k => delete d[k]);
            if (Object.keys(d).length)
                attrs.d = d;
        } else if (kind == 'arc') {
            const stackDim = stackOf(attrs.startAngle, attrs.endAngle);
            if (stackDim) {
                mark.stack = stacked[stackDim] ?? true;
                take('startAngle'); take('endAngle');
                if (stackDim != 'x')
                    mark.x = stackDim;
            } else if (attrs.angle !== undefined)
                setChannel('x', take('angle'), 'x');
        } else {
            setPoint('x', 'angle');
            if (attrs.radius !== undefined)
                setChannel('y', take('radius'), 'y');
        }
    }
    // the colors of the categories are the default of the types which have one
    const colored = { line: 'stroke', area: 'fill', bar: 'fill', arc: 'fill', circle: 'fill', text: 'fill', rule: 'stroke' };
    if (prefix == 'cartesian' || prefix == 'polar' || (prefix == 'svg' && (kind == 'circle' || kind == 'text'))) {
        const k = colored[kind];
        if (k && attrs[k] === '@color')
            delete attrs[k];
    }
    if (prefix == 'cartesian' && kind == 'line' && attrs.fill === 'none')
        delete attrs.fill;
    // a number of 4.x (pixels) at a channel which 5.0 reads as a value on
    // the scale of its axis (the base of bars and areas, the value of bars,
    // the positions and the ends of rules) is a literal, an expression of pixels
    const valued = prefix != 'cartesian' ? [] : kind == 'rule' ? ['x', 'y', 'x1', 'x2', 'y1', 'y2'] : kind == 'bar' ? ['x0', 'y0', 'y'] : kind == 'area' ? ['x0', 'y0'] : [];
    Object.entries(attrs).forEach(([k, v]) => mark[k] = valued.includes(k) && typeof v == 'number' ? `=literal(${v})` : texts(v, k, true));
    if (highlight !== undefined)
        mark.highlight = texts(highlight, 'highlight', true);
    if (others !== undefined)
        mark.others = texts(others, 'others', true);
    return mark;
};

// the leaves of a patch (paths of keys, lists are leaves) with their
// values; the parts of the props of plots and of the rows of their data are
// leaves, they are expressions or rows, not parts
const leaves = (v, path = []) => isObject(v) && Object.keys(v).length > 0 && !['props', 'highlight', 'others', 'data'].includes(path.at(-1))
    ? Object.entries(v).flatMap(([k, e]) => leaves(e, [...path, k]))
    : [[path, v]];

// a value of a case of a match: a part (an object or a list) is a literal,
// so it is no expression, e.g. { "format": ".1%" }
const caseValue = v => v !== null && typeof v == 'object' ? { literal: v } : v;

const at = (o, path) => path.reduce((v, k) => isObject(v) || Array.isArray(v) ? v?.[k] : undefined, o);
const deleteAt = (o, path) => {
    const parent = at(o, path.slice(0, -1));
    if (isObject(parent))
        delete parent[path.at(-1)];
};

// a leaf of 4.x which 5.0 writes differently, converted before it becomes
// an expression (dimOf converts the arrays of the dims, not expressions):
// `scale.domainRel` [a, b] is `scale.pad` [-a, b]
const padOf = value => Array.isArray(value) ? [-(value[0] ?? 0), value[1] ?? 0] : value;
const convertLeaf = (path, value) => path[0] == 'mapping' && path.at(-2) == 'scale' && path.at(-1) == 'domainRel'
    ? [[...path.slice(0, -1), 'pad'], padOf(value)]
    : [path, value];
// a part of 4.x at a path (of a switch of several form elements) as 5.0
// writes it: the `domainRel` of the scales of the mappings as `pad`
const convertPart = (path, value) => {
    if (path[0] != 'mapping')
        return value;
    if (path.at(-2) == 'scale' && path.at(-1) == 'domainRel')
        return padOf(value);
    const walk = (v, p) => {
        if (!isObject(v))
            return v;
        const out = Object.fromEntries(Object.entries(v).map(([k, e]) => [k, walk(e, [...p, k])]));
        if (p.at(-1) == 'scale' && p.length == 3 && Array.isArray(out.domainRel)) {
            out.pad = padOf(out.domainRel);
            delete out.domainRel;
        }
        return out;
    };
    return walk(value, path);
};
// null of a patch removes a part, of the scale, the axis, the legend and
// the hover of a mapping `false` (a switch of null is no value, the default part)
const removable = ['scale', 'axis', 'legend', 'hover'];
const removedPart = (path, value) => value === null && path[0] == 'mapping' && path.length == 3 && removable.includes(path[2]) ? false : value;
const setAt = (o, path, value) => {
    let v = o;
    path.slice(0, -1).forEach(k => {
        if (!isObject(v[k]))
            v[k] = {};
        v = v[k];
    });
    v[path.at(-1)] = value;
};

// the merge of a part of the definition with the one of a patch, as 4.x
// merged them (objects deeply, lists of entries with ids by their ids)
const mergedPart = (key, base, patch) => mergeAll([{ [key]: base === undefined ? null : base }, { [key]: patch }])[key];
// the same of a part at a path, e.g. of the axis of a mapping, a mapping
// written as its column is one of a column (mergeMappings of 4.x)
const mergedAt = (path, base, patch) => {
    if (base === undefined || base === null || patch === null || !isObject(base) || !isObject(patch))
        return clone(patch);
    const wrap = v => path.reduceRight((inner, k) => ({ [k]: inner }), v);
    return at(mergeAll([wrap(base), wrap(patch)]), path);
};

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
// whether a path is the one of another or of a part of it
const within = (a, b) => a.length <= b.length && a.every((k, i) => k === b[i]);

/**
 * The patches of the entries of the form elements as `match` expressions
 * of their globals at the patched places of the definition: the leaves of
 * `options`, `mapping`, `facets`, `geo` and `transform` get the expression
 * of their values by the value of the global, the plots and the annotations
 * (lists merged by their ids) and the filter (conditions merged) as a whole
 * (see migrate, which converts the cases), the patches are removed. Places
 * which several form elements patch (the same leaf, or a part and a leaf in
 * it) are nested switches, a `match` of the last form element whose default
 * and cases are the ones of the earlier form elements, the patches applied
 * in their order as 4.x did; the place is the outermost one, e.g. the axis
 * of a mapping of which one patch removes the axis and another its title.
 */
const whole = ['plot', 'annotations', 'filter'];
const applyPatchesAsExpressions = (def, parents) => {
    // the form elements of a part of a definition (a child, a mixin) merged
    // with the ones of its parents: an element may have no `ref` and its
    // entries no `value` (the parents' ones), and a patch of a parent
    // changes a leaf which the part defines
    const merged = parents === undefined ? def : mergeAll([parents, def]);
    // an entry of the part of one of the merged form elements: the same id,
    // without ids the same value
    const sameEntry = (o, v) => isObject(o) && (o.id !== undefined || v.id !== undefined ? o.id == v.id : o.value !== undefined && String(o.value) === String(v.value));
    const elements = [];
    (merged.formElements ?? []).forEach((e, i) => {
        const patched = Array.isArray(e?.values) ? e.values.filter(v => isObject(v?.patch)) : [];
        if (patched.length == 0)
            return;
        if (typeof e.ref != 'string')
            throw new Error(`formElements[${i}]: no ref, a form element of a parent? migrate it with its parents`);
        // the form element of the part itself: of the same id, without one
        // the one at the same place (the merge replaced the list of the parents)
        const own = e.id !== undefined ? (def.formElements ?? []).find(o => isObject(o) && o.id == e.id) : def.formElements?.[i];
        const ownValues = Array.isArray(own?.values) ? own.values : [];
        // the patches of the part itself (of a part with parents only its
        // own, the parents write theirs): a `match` without a default is a
        // switch over the value of the other parts, see leafMerge of utils/def.js
        const values = [];
        e.values.forEach((v, j) => {
            const patch = parents === undefined ? v.patch : ownValues.find(o => sameEntry(o, v))?.patch;
            if (!isObject(patch))
                return;
            if (v.value === undefined)
                throw new Error(`formElements[${i}].values[${j}]: no value, an entry of a parent? migrate it with its parents`);
            values.push({ value: String(v.value), patch });
        });
        // whether a parent patches a place (its switch applies to the base)
        const parentCase = path => parents !== undefined && (parents.formElements ?? []).some(pe => isObject(pe) && pe.id == e.id
            && Array.isArray(pe.values) && pe.values.some(v => isObject(v?.patch) && at(v.patch, path) !== undefined));
        elements.push({ ref: `@${e.ref}`, values, parentCase, ownValues });
    });
    // a mapping of a column which a patch changes a part of is an object
    // of the column (mergeMappings of 4.x), e.g. "y": "v" and a patch of its axis
    elements.forEach(el => el.values.forEach(({ patch }) => Object.entries(isObject(patch.mapping) ? patch.mapping : {}).forEach(([n, m]) => {
        if (isObject(m) && isObject(def.mapping) && typeof def.mapping[n] == 'string')
            def.mapping[n] = { column: def.mapping[n] };
    })));
    // the patched places: the leaves and the whole parts of every entry
    const units = [];
    elements.forEach((el, index) => el.values.forEach(({ value, patch }) => Object.entries(patch).forEach(([k, part]) => {
        if (whole.includes(k))
            units.push({ index, value, path: [k], orig: [k], case: part, whole: true });
        else
            leaves(part, [k]).forEach(([orig, raw]) => {
                const [path, converted] = convertLeaf(orig, raw);
                units.push({ index, value, path, orig, case: caseValue(removedPart(orig, converted)) });
            });
    })));
    // the places patched by several form elements or of which a patch
    // changes a part, the leaves of another patch in it (groups by the outermost place)
    const groups = [];
    units.forEach(u => {
        const overlapping = groups.filter(g => g.some(o => within(o.orig, u.orig) || within(u.orig, o.orig)));
        const group = [...overlapping.flat(), u].sort((a, b) => units.indexOf(a) - units.indexOf(b));
        overlapping.forEach(g => groups.splice(groups.indexOf(g), 1));
        groups.push(group);
    });
    // in the order of the form elements, as 4.x applied them
    groups.sort((a, b) => Math.min(...a.map(u => units.indexOf(u))) - Math.min(...b.map(u => units.indexOf(u))));
    groups.forEach(group => {
        const indexes = [...new Set(group.map(u => u.index))].sort((a, b) => a - b);
        const single = indexes.length == 1 && group.every(u => same(u.orig, group[0].orig));
        if (single)
            writeSingle(def, parents, elements[indexes[0]], group);
        else
            writeNested(def, parents, indexes.map(i => elements[i]), group.map(u => ({ ...u, index: indexes.indexOf(u.index) })));
    });
    elements.forEach(el => el.ownValues.forEach(v => isObject(v) && delete v.patch));
};

// the switch of one form element at one place: its cases, the base the default
const writeSingle = (def, parents, el, group) => {
    const { path, orig, whole: all } = group[0];
    const cases = Object.fromEntries(group.map(u => [u.value, u.case]));
    const converted = !same(orig, path);
    const baseOf = o => converted ? convertLeaf(orig, at(o, orig))[1] : at(o, path);
    const ownBase = baseOf(def);
    // a whole part (the marks, the annotations, the filter) is the merge
    // of the base and the patch, of the parents' base if the part has none
    const base = all && ownBase === undefined && parents !== undefined ? baseOf(parents) : ownBase;
    if (converted)
        deleteAt(def, orig);
    // cases which are all the base (e.g. a patch which repeats the
    // definition) are the base, unless a parent patches the leaf (its
    // switch would apply to the base)
    if (!all && !el.parentCase(orig) && base !== undefined && Object.values(cases).every(c => same(c, caseValue(base)))) {
        setAt(def, path, base);
        return;
    }
    if (all) {
        // the merged parts of every value, converted by migrate
        const parts = Object.fromEntries(Object.entries(cases).map(([v, part]) => [v, mergedPart(path[0], base, part)]));
        def[path[0]] = { match: [el.ref, parts, base === undefined ? null : base], [patchedKey]: true };
        return;
    }
    // a text, an expression at every place, also of a name, e.g. a
    // column; without a base of its own no default: the value of the
    // other parts, or none
    setAt(def, path, expressionText({ match: base === undefined ? [el.ref, cases] : [el.ref, cases, caseValue(base)] }));
};

// the nested switches of several form elements (or of the entries of one
// which patch a part and a leaf in it) at the outermost place of their
// patches: the part of every combination of their values, the patches in
// the order of the form elements merged into the base; the units of the
// patches (`group`) name the form element by its index in `els`
const writeNested = (def, parents, els, group) => {
    const outer = group.reduce((p, u) => u.orig.length < p.length ? u.orig : p, group[0].orig);
    const all = group[0].whole === true;
    const ownBase = at(def, outer);
    const base = all && ownBase === undefined && parents !== undefined ? at(parents, outer) : ownBase;
    // the part of the values of the form elements (`chosen`, by their index in els)
    const partOf = chosen => els.reduce((v, el, i) => {
        const entry = chosen[i] === undefined ? undefined : el.values.find(e => e.value === chosen[i]);
        const patch = entry === undefined ? undefined : at(entry.patch, outer);
        return patch === undefined ? v : all ? mergedPart(outer[0], v, patch) : mergedAt(outer, v, patch);
    }, base);
    const keep = els.some(el => el.parentCase(outer));
    // the switch of the form elements before `n` with the values `chosen`
    // of the later ones: a value of a leaf (an object or a list a literal),
    // a match of the last of them with the cases of its patched values
    const node = (n, chosen) => {
        if (n == 0) {
            const v = partOf(chosen);
            return all ? v : v === undefined ? undefined : caseValue(removedPart(outer, convertPart(outer, v)));
        }
        const el = els[n - 1];
        const fallback = node(n - 1, chosen);
        const values = [...new Set(group.filter(u => u.index == n - 1).map(u => u.value))];
        const cases = Object.fromEntries(values.map(v => [v, node(n - 1, { ...chosen, [n - 1]: v })]).filter(([, c]) => keep || !same(c, fallback)));
        if (Object.keys(cases).length == 0)
            return fallback;
        if (all)
            return { match: [el.ref, cases, fallback === undefined ? null : fallback], [patchedKey]: true };
        return { match: fallback === undefined ? [el.ref, cases] : [el.ref, cases, fallback] };
    };
    const v = node(els.length, {});
    if (all)
        def[outer[0]] = v === undefined ? null : v;
    else if (v === undefined)
        deleteAt(def, outer);
    else {
        const [path] = convertLeaf(outer, undefined);
        if (!same(path, outer))
            deleteAt(def, outer);
        setAt(def, path, expressionText(v));
    }
};
// a part of a definition which is a match of the patches of its form elements
const patchedKey = Symbol('patched');
const isPatched = v => isObject(v) && v[patchedKey] === true;
// the default of the innermost switch of a patched part, the part without patches
const patchedBase = v => isPatched(v) ? patchedBase(v.match[2]) : v;

// the match of a patched part (of nested switches) with its cases
// converted (`convert(part)`), e.g. the plots as marks, as the text of an
// expression, the parts as literals
const patchedAst = (v, convert) => {
    if (!isPatched(v))
        return v === null || v === undefined ? null : { literal: convert(v) };
    const [ref, cases, base] = v.match;
    return { match: [ref, Object.fromEntries(Object.entries(cases).map(([k, part]) => [k, patchedAst(part, convert)])), patchedAst(base, convert)] };
};
const patchedText = (v, convert) => expressionText(patchedAst(v, convert));

// a form element of 4.x as a control of 5.0: `ref` is `global`, the ids
// stay, a parent and its children merge the controls and their entries by them
const controlOf = e => {
    if (!isObject(e))
        return e;
    const { ref, ...rest } = e;
    const c = ref === undefined ? { ...rest } : { ...rest, global: ref };
    // the order of the keys: the type and the global first
    return Object.fromEntries(['type', 'global', 'name', 'id', 'values', ...Object.keys(c)].filter((k, i, a) => c[k] !== undefined && a.indexOf(k) == i).map(k => [k, c[k]]));
};

// the texts of 4.x which start with "=" (a title "= Summe", an axis title
// "=100") are texts, of 5.0 expressions: the expression of the text,
// "='= Summe'"; not the values of conditions of filters and of
// expressions (compared with the rows, written in the string syntax), of
// globals and of the entries of form elements and the data
const textsOf4 = (v, key = undefined) => {
    if (typeof v == 'string')
        return v.startsWith('=') ? `=${literal(v)}` : v;
    if (['filter', 'stacked', 'expr', 'globals', 'value', 'data'].includes(key) || isOperator(v))
        return v;
    if (Array.isArray(v))
        return v.map(e => textsOf4(e));
    return isObject(v) ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, textsOf4(e, k)])) : v;
};

/**
 * The definition of gen-vis 5 of one of gen-vis 4 (merged with its parents
 * or a part of one, e.g. a parent), see above. A part with parents is
 * migrated with them merged (`parents`, of gen-vis 4): its form elements
 * may give only the ids of the patched entries, and it writes the
 * expressions of the leaves its parents patch and it (or they) define,
 * as 4.x applied the patches after the merge.
 */
const migrate = (raw, { parents: given, noHover = false } = {}) => {
    // parents of 5.0 are no context of the patches and the hover of 4.x
    const parents = isObject(given) && ['dims', 'marks', 'controls'].some(k => given[k] !== undefined) ? undefined : given;
    const def = textsOf4(clone(raw));
    applyPatchesAsExpressions(def, textsOf4(clone(parents)));
    const out = {};
    out.$schema = schemaUrl;
    ['parent', 'data', 'dataFormat'].forEach(k => {
        if (def[k] !== undefined)
            out[k] = def[k];
    });
    if (def.transform !== undefined)
        out.transform = texts(def.transform, 'transform');
    const options = isObject(def.options) ? def.options : {};
    const coord = options.coord ?? 'cartesian';
    optionKeys.forEach(k => {
        const from = k == 'source' ? 'footer' : k;
        if (options[from] !== undefined)
            out[k] = texts(options[from], k);
    });
    Object.keys(options).filter(k => k != 'footer' && !optionKeys.includes(k)).forEach(k => out[k] = texts(options[k], k));
    if (def.globals !== undefined)
        out.globals = def.globals;
    if (def.formElements !== undefined)
        out.controls = def.formElements.map(controlOf);
    if (isPatched(def.filter)) {
        // the conditions of every value as expressions, of nested switches too
        const ast = c => isPatched(c) ? { match: [`@globals.${c.match[0].slice(1)}`, Object.fromEntries(Object.entries(c.match[1]).map(([k, e]) => [k, ast(e)])), ast(c.match[2])] }
            : c === null || c === undefined || c === true ? true : parseExpression(String(conditionExpression(c)).replace(/^=/, ''));
        out.filter = expressionText(ast(def.filter));
    } else if (def.filter !== undefined)
        out.filter = conditionExpression(def.filter, true, isObject(def.mapping) ? def.mapping : {});
    const mapping = isObject(def.mapping) ? def.mapping : {};
    const plotsOf = p => p === undefined || p === null ? [] : [p].flat();
    const plots = plotsOf(patchedBase(def.plot));
    const stacked = Object.fromEntries(Object.entries(mapping).filter(([, m]) => isObject(m) && m.stacked !== undefined && m.stacked !== false)
        .map(([n, m]) => [n, m.stacked === true ? true : conditionExpression(m.stacked, false, mapping)]));
    const hovered = [];
    // the marks first, they consume the stacking of the dims
    const consumed = new Set();
    const marks = plots.map((p, i) => markOf(p, i, coord, stacked, mapping, consumed));
    if (def.mapping !== undefined)
        out.dims = Object.fromEntries(Object.entries(mapping).map(([n, m]) => [n, dimOf(m, n, hovered, consumed, coord, mapping)]));
    if (isObject(out.hover) && out.hover.filter !== undefined)
        out.hover.filter = conditionExpression(out.hover.filter, false, mapping);
    if (isPatched(def.plot))
        out.marks = patchedText(def.plot, part => plotsOf(part).map((p, i) => markOf(p, i, coord, stacked, mapping, consumed)));
    else if (def.plot !== undefined)
        out.marks = marks.length == 1 && !Array.isArray(def.plot) ? marks[0] : marks;
    if (isPatched(def.annotations))
        out.annotations = patchedText(def.annotations, part => texts(part, 'annotations'));
    else if (def.annotations !== undefined)
        out.annotations = texts(def.annotations, 'annotations');
    if (isObject(def.facets)) {
        const { dim, rows, cols, scales, ...rest } = def.facets;
        const f = {};
        if (rows !== undefined || (typeof cols == 'string' && !cols.startsWith('@')))
            f.by = { ...(rows !== undefined ? { rows } : {}), ...(typeof cols == 'string' ? { cols } : {}) };
        else if (dim !== undefined)
            f.by = dim;
        if (!(typeof cols == 'string' && !cols.startsWith('@')) && cols !== undefined)
            f.cols = texts(cols, 'cols');
        if (Array.isArray(scales) && scales.length == 0)
            f.scales = 'own';
        else if (scales !== undefined)
            f.scales = texts(scales, 'scales');
        out.facets = { ...f, ...rest };
    }
    if (def.geo !== undefined)
        out.geo = def.geo;
    Object.keys(def).filter(k => !['$schema', 'parent', 'data', 'dataFormat', 'transform', 'options', 'globals', 'formElements', 'filter', 'mapping', 'plot', 'annotations', 'facets', 'geo'].includes(k))
        .forEach(k => out[k] = def[k]);
    // the hover of 4.x has the dims with a `hover` only, the one of 5.0 by
    // default the dims the marks use (see translate), of the whole
    // definition (with the parents): the empty hovers of these dims are
    // implied and left out; if one of them has no hover (of the part or of
    // the parents), the part lists the columns of the implied dims of the
    // parents (the parents left them out as well), so the chart stays the same
    // a child without dims and marks of its own changes nothing of the
    // hover, its parents decided
    const changes = parents === undefined || out.marks !== undefined || (isObject(out.dims) && Object.keys(out.dims).length > 0);
    if (!noHover && changes) {
        const whole = parents === undefined ? out : migrate(mergeAll([parents, raw]), { noHover: true });
        const implied = hoverDefault(whole);
        const inherited = Object.entries(isObject(parents?.mapping) ? parents.mapping : {}).filter(([, m]) => isObject(m) && isObject(m.hover)).map(([n]) => n);
        const empty = n => isObject(out.dims?.[n]) && isObject(out.dims[n].hover) && Object.keys(out.dims[n].hover).length == 0;
        if (implied.every(n => hovered.includes(n) || inherited.includes(n)))
            implied.filter(empty).forEach(n => delete out.dims[n].hover);
        else
            out.hover = { ...(isObject(out.hover) ? out.hover : {}), columns: implied.filter(n => inherited.includes(n) && !hovered.includes(n)) };
    }
    // the dims of the groups of marks in the colors of their categories have
    // the categories of the data in 5.0 (see colorDims of utils/language.js),
    // of 4.x none: `"fromData": false` keeps the colors of the marks
    if (!noHover && changes) {
        const whole = parents === undefined ? out : migrate(mergeAll([parents, raw]), { noHover: true });
        colorDimsOf(whole).forEach(n => {
            out.dims = isObject(out.dims) ? out.dims : {};
            const d = out.dims[n];
            out.dims[n] = typeof d == 'string' ? { column: d, fromData: false } : { ...(isObject(d) ? d : {}), fromData: false };
        });
    }
    return out;
};

// the names of the dims of a part of 5.0 which have the categories of the
// data as the groups of marks in the colors of their categories, of the
// defaults of its globals
const colorDimsOf = part => {
    try {
        const probe = resolve(clone(part), namesOfGlobals(part.globals, part.controls));
        const dims = Object.fromEntries(Object.entries(isObject(probe.dims) ? probe.dims : {}).filter(([, d]) => d !== null && d !== false)
            .map(([n, d]) => [n, languageDim(d, n)]));
        return colorDims(dims, probe.marks === undefined ? [] : [probe.marks].flat(), probe.coord ?? 'cartesian');
    } catch {
        return [];
    }
};

// the dims of the hover by default of a part of 5.0 (the dims its marks
// use, see translate of utils/language.js), of the defaults of its globals
const hoverDefault = part => {
    const probe = clone(part);
    Object.values(isObject(probe.dims) ? probe.dims : {}).forEach(d => isObject(d) && delete d.hover);
    delete probe.hover;
    try {
        const mapping = translate(resolve(probe, namesOfGlobals(probe.globals, probe.controls))).mapping;
        return Object.keys(mapping).filter(n => isObject(mapping[n]) && mapping[n].hover !== undefined);
    } catch {
        return [];
    }
};

/**
 * The JSON of a definition as the files of gen-vis are written: an indent of
 * four spaces, objects and lists which fit into a line (`width` characters,
 * 100 by default) on one line, e.g. a category or a margin.
 */
const formatJson = (value, indent = 4, width = 100, level = 0) => {
    if (value === undefined)
        return 'null';
    if (value === null || typeof value != 'object')
        return JSON.stringify(value);
    const line = oneLine(value);
    if (line.length + level*indent <= width)
        return line;
    const pad = ' '.repeat((level + 1)*indent);
    const end = ' '.repeat(level*indent);
    if (Array.isArray(value))
        return `[\n${value.map(v => pad + formatJson(v, indent, width, level + 1)).join(',\n')}\n${end}]`;
    return `{\n${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${formatJson(v, indent, width, level + 1)}`).join(',\n')}\n${end}}`;
};

// a value on one line, with a space after the commas and the colons (not
// the ones in texts)
const oneLine = value => {
    if (value === undefined)
        return 'null';
    if (value === null || typeof value != 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(oneLine).join(', ')}]`;
    // entries without a value are left out, as JSON.stringify does
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length == 0 ? '{}' : `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(', ')}}`;
};
