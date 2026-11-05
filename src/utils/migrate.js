export { migrate, conditionExpression, expressionText };

import { isObject } from '@/utils/values';
import { isOperator } from '@/utils/expr';
import { formatExpression } from '@/utils/expr-parse';
import { schemaUrl } from '@/utils/version';
import { expressionKeys, optionKeys } from '@/utils/language';

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

// a value of a condition as the text of an expression, a reference is one
// to a global (a dim of the same name would shadow it)
const literal = v => typeof v == 'string' ? (v.startsWith('@') ? `@globals.${v.slice(1)}` : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    : v === null ? 'null' : isOperator(v) ? `(${formatExpression(v)})` : String(v);

/**
 * The expression (a text) of the conditions of a filter of 4.x, e.g.
 * `{ "year": "@year", "type": { "not": "load" } }` is
 * `"@year == @year and @type != 'load'"`, see rowFilter of utils/data.js.
 */
const conditionExpression = conditions => {
    if (conditions === undefined || conditions === null || typeof conditions == 'boolean' || typeof conditions == 'string' || isOperator(conditions))
        return conditions;
    const parts = Object.entries(conditions).map(([dim, c]) => conditionOf(dim, c));
    if (parts.length == 0)
        return true;
    const text = parts.length == 1 ? parts[0] : parts.map(p => p.includes(' or ') ? `(${p})` : p).join(' and ');
    // an expression text starts with a reference or `=`
    return text.startsWith('@') ? text : `=${text}`;
};
const conditionOf = (dim, c, negated = false) => {
    const eq = negated ? '!=' : '==';
    if (c === null || c === undefined)
        return `@${dim} ${eq} null`;
    if (Array.isArray(c)) {
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
const dimOf = (m, name, hovered, grouped, consumed) => {
    if (typeof m == 'string')
        return m;
    if (!isObject(m))
        return m;
    const d = { ...m };
    if (isObject(d.hover) && Object.keys(d.hover).length == 0) {
        hovered.push(name);
        delete d.hover;
    } else if (isObject(d.hover))
        hovered.push(name);
    // the stacking of a mark, a dim stacked by no mark keeps it (e.g. of the hover)
    if (consumed.has(name)) {
        delete d.stacked;
        delete d.stackBy;
    } else if (d.stacked !== undefined && isObject(d.stacked))
        d.stacked = conditionExpression(d.stacked);
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
    // the categories of the data are the default of a categorical dim
    if (d.fromData === true) {
        if (!['categories', 'scheme', 'common', 'ranks', 'order'].some(k => d[k] !== undefined) && !grouped.has(name) && d.type === undefined)
            d.type = 'categorical';
        delete d.fromData;
    }
    if (isObject(d.categories))
        d.categories = Object.fromEntries(Object.entries(d.categories).map(([k, c]) => [k, isObject(c) && Object.keys(c).length == 1 && typeof c.color == 'string' ? c.color : c]));
    // the hand-drawn symbol of a legend in the color of the category is the one of the plots
    if (isObject(d.legend?.symbol) && Array.isArray(d.legend.symbol.elements)) {
        const refs = JSON.stringify(d.legend.symbol.elements).match(/"@[\w-]+"/g) ?? [];
        if (refs.every(r => ['"@color"', '"@stroke-width"', '"@opacity"', '"@r"', '"@stroke-dasharray"', '"@fill"'].includes(r))) {
            const legend = { ...d.legend };
            delete legend.symbol;
            d.legend = legend;
        }
    }
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
        mark.filter = conditionExpression(filter);
    const attrs = { ...props };
    const kind = typeof mark.type == 'string' ? mark.type.split(':').at(-1) : '';
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
    const categorical = d => isObject(dims[d]) && ['categories', 'scheme', 'common', 'order', 'fromData', 'ranks'].some(q => dims[d][q] !== undefined);
    // the channel of a position of an element at a value, of a categorical
    // dim the center of its band (`@x:scaled:center`), the start of the band
    // (`@x:scaled`) stays an attribute
    const setPoint = (name, attr) => {
        const v = attrs[attr];
        if (v === undefined)
            return;
        const s = scaledOf(v);
        delete attrs[attr];
        if (s && s.kind == 'scaled:center' && categorical(s.dim))
            setChannel(name, `@${s.dim}:scaled`, name, attr);
        else if (s && s.kind == 'scaled' && categorical(s.dim))
            attrs[attr] = v;
        else
            setChannel(name, v, name, attr);
    };
    // a stacked value: the start and the end of the value dim
    const stackOf = (v0, v1) => {
        const a = scaledOf(v0), b = scaledOf(v1);
        const dim = a && b && a.dim == b.dim && a.kind == 'start:scaled' && b.kind == 'end:scaled' ? a.dim : undefined;
        if (dim !== undefined)
            consumed.add(dim);
        return dim;
    };
    const prefix = typeof mark.type == 'string' && type?.includes(':') ? type.split(':')[0] : (coord ?? 'cartesian');
    if (prefix == 'svg') {
        if (kind == 'circle') {
            setPoint('x', 'cx');
            setPoint('y', 'cy');
        } else if (kind == 'text') {
            setPoint('x', 'x');
            setPoint('y', 'y');
        } else
            ['x', 'y', 'x1', 'x2', 'y1', 'y2'].forEach(k => {
                if (attrs[k] !== undefined)
                    setChannel(k, take(k), undefined);
            });
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
                if (attrs[k] !== undefined)
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
    const colored = { line: 'stroke', area: 'fill', bar: 'fill', arc: 'fill', circle: 'fill', text: 'fill', region: null, rule: 'stroke' };
    if (prefix != 'svg' || kind == 'circle' || kind == 'text') {
        const k = colored[kind];
        if (k && attrs[k] === '@color')
            delete attrs[k];
    }
    if (prefix == 'cartesian' && kind == 'line' && attrs.fill === 'none')
        delete attrs.fill;
    Object.entries(attrs).forEach(([k, v]) => mark[k] = texts(v, k, true));
    if (highlight !== undefined)
        mark.highlight = texts(highlight, 'highlight', true);
    if (others !== undefined)
        mark.others = texts(others, 'others', true);
    return mark;
};

// the leaves of a patch (paths of keys, lists are leaves) with their values
const leaves = (v, path = []) => isObject(v) && !isOperator(v) && Object.keys(v).length > 0
    ? Object.entries(v).flatMap(([k, e]) => leaves(e, [...path, k]))
    : [[path, v]];
const at = (o, path) => path.reduce((v, k) => isObject(v) || Array.isArray(v) ? v?.[k] : undefined, o);
const setAt = (o, path, value) => {
    let v = o;
    path.slice(0, -1).forEach(k => {
        if (!isObject(v[k]))
            v[k] = {};
        v = v[k];
    });
    v[path.at(-1)] = value;
};

// the patches of the entries of the form elements as `match` expressions of
// their globals at the patched places of the definition
const applyPatchesAsExpressions = def => {
    (def.formElements ?? []).forEach(e => {
        if (!Array.isArray(e?.values) || !e.values.some(v => isObject(v?.patch)))
            return;
        const paths = new Map();
        e.values.filter(v => isObject(v?.patch)).forEach(v => leaves(v.patch).forEach(([path, value]) => {
            if (path.length == 0)
                return;
            const key = JSON.stringify(path);
            if (!paths.has(key))
                paths.set(key, { path, cases: {} });
            paths.get(key).cases[String(v.value)] = value;
        }));
        paths.forEach(({ path, cases }) => {
            const base = at(def, path);
            // a text, an expression at every place, also of a name, e.g. a column
            setAt(def, path, expressionText({ match: [`@${e.ref}`, cases, base === undefined ? null : base] }));
        });
        e.values.forEach(v => delete v.patch);
    });
};

// a form element of 4.x as a control of 5.0
const controlOf = e => {
    if (!isObject(e))
        return e;
    const { ref, id, values, ...rest } = e;
    const c = { ...rest, global: ref };
    if (id !== undefined && id !== ref)
        c.id = id;
    c.values = Array.isArray(values) ? values.map(v => {
        if (!isObject(v))
            return v;
        const { id: vid, name, value, ...more } = v;
        const entry = { value };
        if (name !== undefined && name !== String(value))
            entry.name = name;
        if (vid !== undefined && vid !== String(value))
            entry.id = vid;
        return { ...entry, ...more };
    }) : values;
    // the order of the keys: the type and the global first
    return Object.fromEntries(['type', 'global', 'name', 'id', 'values', ...Object.keys(c)].filter((k, i, a) => c[k] !== undefined && a.indexOf(k) == i).map(k => [k, c[k]]));
};

/**
 * The definition of gen-vis 5 of one of gen-vis 4 (merged with its parents
 * or a part of one, e.g. a parent), see above.
 */
const migrate = raw => {
    const def = clone(raw);
    applyPatchesAsExpressions(def);
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
    if (def.filter !== undefined)
        out.filter = conditionExpression(def.filter);
    const mapping = isObject(def.mapping) ? def.mapping : {};
    const plots = def.plot === undefined ? [] : [def.plot].flat();
    const grouped = new Set([...plots.flatMap(p => isObject(p) ? [p.by ?? []].flat() : []), def.facets?.dim, def.facets?.rows, def.facets?.cols].filter(Boolean));
    const stacked = Object.fromEntries(Object.entries(mapping).filter(([, m]) => isObject(m) && m.stacked !== undefined && m.stacked !== false)
        .map(([n, m]) => [n, m.stacked === true ? true : conditionExpression(m.stacked)]));
    const hovered = [];
    // the marks first, they consume the stacking of the dims
    const consumed = new Set();
    const marks = plots.map((p, i) => markOf(p, i, coord, stacked, mapping, consumed));
    if (def.mapping !== undefined)
        out.dims = Object.fromEntries(Object.entries(mapping).map(([n, m]) => [n, dimOf(m, n, hovered, grouped, consumed)]));
    // the hover columns which are not the dims of the marks' `by` are listed
    const byDefault = [...grouped].filter(n => Object.hasOwn(mapping, n));
    const columns = hovered.filter(n => !byDefault.includes(n));
    const missing = byDefault.filter(n => !hovered.includes(n) && isObject(mapping[n]));
    if (columns.length > 0 || missing.length > 0) {
        out.hover = { ...(isObject(out.hover) ? out.hover : {}), columns: hovered };
    }
    if (isObject(out.hover) && out.hover.filter !== undefined)
        out.hover.filter = conditionExpression(out.hover.filter);
    if (def.plot !== undefined)
        out.marks = marks.length == 1 && !Array.isArray(def.plot) ? marks[0] : marks;
    if (def.annotations !== undefined)
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
    return out;
};
