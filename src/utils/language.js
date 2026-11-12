export { translate, checkDims, compileStrings, optionKeys, markKeys, expressionKeys, nameKeys, typeOf, positionChannels, authoredPath, entryOf, entriesOf, implicitDims };

import { isObject } from '@/utils/values';
import { isExpressionText, parseExpression } from '@/utils/expr-parse';
import { refNames } from '@/utils/expr';
import { categoryKeys, isCategorical } from '@/utils/normalize';

/**
 * The definition language of gen-vis 5 (see docs/definition.md) translated
 * into the form the engine reads, see utils/normalize.js. The engine's
 * form has the names of the language (`dims`, `marks`, `controls`, the
 * options at the top level), `translate` writes out its shorthands: the
 * shorthands of the dims (e.g. `zero` of their scale), the marks with their
 * channels as marks with the `props` of the scaled positions and the full
 * name of their type, the values of the controls as entries, the hover
 * columns as the `hover` of the dims, `stack` and `dodge` of marks as the
 * parts of the dims and the props, the string syntax of expressions as their objects. `translate` is pure,
 * JSON to JSON; the rows are not known, the types of the dims follow later
 * (see inferTypes of utils/data.js).
 */

// the keys of the top level which are the options of the chart, `source`
// is the text of its footer
const optionKeys = ['title', 'subtitle', 'source', 'height', 'width', 'margins', 'coord', 'locale', 'language', 'transition', 'class',
    'message', 'empty', 'hover', 'highlight', 'fontFamily'];

// the keys of a mark which are no attributes of its elements
const markKeys = ['type', 'id', 'by', 'filter', 'curve', 'stack', 'dodge', 'orient', 'select', 'layer', 'facet', 'data', 'dataFormat',
    'once', 'place', 'halo', 'ends', 'fit', 'overlap', 'object', 'borders', 'highlight', 'others', 'anchor', 'before', 'order', 'clip'];

// the channels of the positions and the axis of each: a value of a channel
// is a dim (the one of its axis by default, `x` or `y`), a number is a
// value on the scale of the axis
const positionChannels = { x: 'x', y: 'y', x0: 'x', x1: 'x', x2: 'x', y0: 'y', y1: 'y', y2: 'y', lon: null, lat: null };

// the keys of the parts of a definition whose strings are names or urls,
// not expressions, e.g. a column named "@x"
const nameKeys = new Set(['$schema', 'parent', 'data', 'dataFormat', 'column', 'columns', 'key', 'as']);

// the keys whose values are expressions, also objects of one key which is
// an operator, e.g. { "steps": [...] } of `cols`; elsewhere such an object
// is a part, e.g. { "format": ".1f" } of a hover. The attributes of marks
// and annotations and everything in `props`, `highlight` and `others` are
// expressions too, see compileStrings
const expressionKeys = new Set(['expr', 'height', 'width', 'margins', 'top', 'right', 'bottom', 'left', 'message', 'cols', 'scales',
    'ticks', 'values', 'tickSpacing', 'at', 'domain', 'include', 'center', 'range', 'inset', 'step', 'pad', 'position', 'orientation',
    'filter', 'stack', 'stacked', 'text', 'label', 'x', 'y', 'x0', 'x1', 'x2', 'y0', 'y1', 'y2', 'lon', 'lat', 'r', 'props', 'highlight', 'others', 'empty']);

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

/**
 * The strings of the string syntax of expressions (see utils/expr-parse.js)
 * of a part of a definition as the objects of the expressions, e.g.
 * `"@a + 1"` as `{"+": ["@a", 1]}`, a reference `"@a"` stays a text. The
 * strings of names and urls (see nameKeys) and the keys of objects are no
 * expressions. Errors name the place.
 */
const compileStrings = (value, path = '') => {
    if (typeof value == 'string')
        return isExpressionText(value) ? parsed(value, path) : value;
    if (Array.isArray(value))
        return value.map((v, i) => compileStrings(v, `${path}[${i}]`));
    if (!isObject(value))
        return value;
    const out = {};
    // a name may start with @, e.g. a column, an expression of one with =
    for (const [k, v] of Object.entries(value))
        out[k] = nameKeys.has(k) && typeof v == 'string' && v.startsWith('@') ? v : compileStrings(v, path ? `${path}.${k}` : k);
    return out;
};

const parsed = (text, path) => {
    try {
        return parseExpression(text);
    } catch (error) {
        // a reference with a template, e.g. "@{smooth}", is one of the engine
        if (text.startsWith('@') && !/\s/.test(text))
            return text;
        throw new Error(`${path}: ${error.message}`);
    }
};

// a dim of a log scale (of its own or of the dim of its scale, `of`), which
// has no 0, not a symlog one
const isLogDim = (dims, name) => {
    const d = dims[name];
    const of = isObject(d?.scale) && typeof d.scale.of == 'string' && Object.hasOwn(dims, d.scale.of) ? dims[d.scale.of] : d;
    const type = isObject(of?.scale) ? of.scale.type : undefined;
    return typeof type == 'string' && /log$/i.test(type) && !/symlog$/i.test(type);
};

// a reference to a value of a row of a dim, e.g. "@x:scaled"
const ref = (dim, kind = 'scaled') => `@${dim}:${kind}`;

// the parts of the categories of a dim besides `fromData`, see
// hasCategories and isCategorical of utils/normalize.js
const categoryParts = categoryKeys.filter(k => k != 'fromData');
const categoricalScales = ['band', 'point', 'ordinal'];
// a dim of numbers or dates by its parts (of the definition, the rows are
// not known): its type, a continuous scale, a domain from the data
// (an open end) or the parts of a continuous scale (e.g. `"zero": true`)
const continuousParts = ['nice', 'include', 'center', 'pad', 'zero'];
const isContinuous = d => isObject(d) && (d.type == 'numeric' || d.type == 'date' || (d.type === undefined && !isCategorical(d)
    && ((isObject(d.scale) && typeof d.scale.type == 'string' && !categoricalScales.includes(d.scale.type))
        || [d.domain, d.scale?.domain].some(v => Array.isArray(v) && v.includes(null))
        || d.interval !== undefined || continuousParts.some(k => d[k] !== undefined || (isObject(d.scale) && d.scale[k] !== undefined)))));

// a dim of the definition as the engine reads it, its shorthands written out
const dim = (raw, name) => {
    if (typeof raw == 'string')
        return { column: raw };
    if (!isObject(raw))
        throw new Error(`dims.${name}: expected a dim, e.g. "value" or { "column": "value", "format": ".1f" }`);
    const m = { ...raw };
    const scale = isObject(m.scale) ? { ...m.scale } : m.scale;
    const into = (keys, target, make) => {
        const own = keys.filter(k => m[k] !== undefined);
        // a part removed (`"axis": false`) stays removed, its shorthands are none
        if (target === false || target === null) {
            own.forEach(k => delete m[k]);
            return target;
        }
        if (own.length == 0)
            return target;
        const t = isObject(target) ? { ...target } : {};
        own.forEach(k => make(t, k, m[k]));
        own.forEach(k => delete m[k]);
        return t;
    };
    // the shorthands of the scale: `zero` includes 0 in the domain, see
    // makeScale of utils/scales.js (false: not the 0 of the base of bars)
    m.scale = into(['zero', 'pad', 'include', 'reverse', 'range'], scale, (t, k, v) => t[k] = v);
    if (m.scale === undefined)
        delete m.scale;
    // the shorthands of the axis
    m.axis = into(['grid', 'ticks', 'tickSpacing'], m.axis, (t, k, v) => t[k] = v);
    if (m.axis === undefined)
        delete m.axis;
    // a category of a text is its color
    if (isObject(m.categories))
        m.categories = Object.fromEntries(Object.entries(m.categories).map(([k, c]) => [k, typeof c == 'string' ? { color: c } : c]));
    // the categories of a dim with a legend or the parts of categories
    // without listed ones are the ones of the data, in the order of the
    // rows; listed categories are all of them (`fromData` adds the others)
    // (a legend of a dim with a scale is the legend of its colors)
    if (m.fromData === undefined && !isObject(m.categories) && (categoryParts.some(k => m[k] !== undefined)
        || (m.legend !== undefined && m.legend !== false && !isObject(m.scale) && m.type !== 'numeric' && m.type !== 'date')))
        m.fromData = 'rows';
    return m;
};

// the dim of a channel of a mark: a dim by its name, an implicit one of a
// column (`dims` gets it, `implicit(channel, column)` is told of it),
// of the channel of an axis without the dim of the axis the dim of the axis
// (e.g. "x": "year" without dims is the dim x of the column year), a
// number is a value on the scale of the axis of the channel if `valued`
// (the base of a bar, the value of a rule), else pixels, an expression of
// the row as it is (pixels), undefined if the mark has none and the dim of
// the axis does not exist
// the dims of the axes of the columns of channels, see channelOf
const axisDims = new WeakSet();
const channelOf = (mark, channel, dims, axis = positionChannels[channel], valued = false, implicit = null, cartesian = true) => {
    const v = mark[channel];
    if (v === undefined)
        return axis && Object.hasOwn(dims, axis) ? { dim: axis, value: ref(axis) } : undefined;
    // a reference or an expression as it is, e.g. "@y:group:start"
    if (typeof v == 'string' && !v.startsWith('@')) {
        // the column of the dim of the axis is that dim, e.g. "x": "year" of a dim x of the column year
        if (!Object.hasOwn(dims, v) && axis && channel == axis && isObject(dims[axis]) && dims[axis].column === v)
            return { dim: axis, value: ref(axis) };
        if (!Object.hasOwn(dims, v)) {
            const name = axis && channel == axis && (!Object.hasOwn(dims, axis) || (axisDims.has(dims[axis]) && dims[axis].column === v)) ? axis : v;
            if (!Object.hasOwn(dims, name)) {
                dims[name] = { column: v };
                if (name == axis)
                    axisDims.add(dims[name]);
            }
            implicit?.(channel, v);
            if (name != v)
                return { dim: name, value: ref(name) };
        }
        // another dim of a position (e.g. "hi" of a rule of y1 and y2) is on
        // the scale of the axis of the channel, its values in its domain; one
        // with an axis of its own is a second axis with a scale of its own (of
        // the orientation of the position of its axis, see normalizeDim), by
        // default at the other side, e.g. a line of "y": "temp" of a dim temp
        // with "axis": {} at the right
        const d = dims[v];
        if (axis && v != axis && Object.hasOwn(dims, axis) && !['x', 'y'].includes(v) && isObject(d) && !isCategorical(d)) {
            if (!isObject(d.axis)) {
                if (d.scale === undefined)
                    d.scale = { of: axis };
            } else if (cartesian && d.axis.position === undefined && (d.scale === undefined || (isObject(d.scale) && d.scale.of === undefined && d.scale.orientation === undefined)))
                d.axis = { ...d.axis, position: axis == 'x' ? 'top' : 'right' };
        }
        return { dim: v, value: ref(v) };
    }
    if (typeof v == 'number' && valued && axis && Object.hasOwn(dims, axis))
        return { dim: axis, value: `@${axis}:scaled:${v}`, fixed: v };
    // a literal number (`"=literal(10)"`) is pixels
    return { dim: undefined, value: isObject(v) && Object.keys(v).length == 1 && typeof v.literal == 'number' ? v.literal : v };
};

// a mark whose `by` is a list, the attributes of its elements are `props`
const markParts = (raw, i) => {
    if (!isObject(raw))
        throw new Error(`marks[${i}]: expected a mark, e.g. { "type": "line", "by": "land" }`);
    const mark = { ...raw };
    const p = {};
    const props = {};
    Object.entries(mark).forEach(([k, v]) => {
        if (markKeys.includes(k))
            p[k] = v;
        else
            props[k] = v;
    });
    p.by = [p.by ?? []].flat().filter(b => b !== undefined && b !== null);
    return { p, props };
};

// the full name of a mark type of a coordinate system, e.g. "cartesian:bar"
// of "bar", the ones of svg elements and the aliases of 5.0
const typeOf = (type, coord) => {
    if (typeof type != 'string')
        return type;
    if (type.includes(':'))
        return type;
    if (type == 'point')
        return coord == 'polar' ? 'polar:circle' : coord == 'geo' ? 'geo:circle' : 'svg:circle';
    if (type == 'label' || type == 'text')
        return coord == 'polar' ? 'polar:text' : coord == 'geo' ? 'geo:text' : 'svg:text';
    if (type == 'cell')
        return 'svg:rect';
    // a short rule across the band of a categorical position, see tickOf
    if (type == 'tick')
        return 'cartesian:rule';
    if (['line', 'area', 'bar', 'rule'].includes(type))
        return coord == 'polar' && type != 'bar' && type != 'rule' ? `polar:${type}` : `cartesian:${type}`;
    if (type == 'arc')
        return 'polar:arc';
    if (['base', 'region', 'mesh'].includes(type))
        return `geo:${type}`;
    if (type == 'circle' || type == 'rect')
        return `svg:${type}`;
    return type;
};

// the expressions of a dodged bar: the band of the position dim `pos` split
// among the categories of `group`, its position (the bar mark adds half a
// band, see marks/cartesian.js) and its width; `center` is the middle of
// the slot of the category, e.g. of a label on a dodged bar. The band of a
// scale without one (a date of an `interval`, a point scale) is 80% of the
// period or the step, as the width of a bar, around the middle of the period
const dodged = (pos, group) => {
    const band = { if: [ref(pos, 'bandwidth'), ref(pos, 'bandwidth'), { '*': [0.8, ref(pos, 'step')] }] };
    const start = { if: [ref(pos, 'bandwidth'), ref(pos), { '-': [ref(pos), { '/': [band, 2] }] }] };
    const slot = { '/': [{ '+': [ref(group, 'index'), 0.5] }, ref(group, 'count')] };
    return {
        position: { '+': [ref(pos), { '*': [band, { '-': [slot, 0.5] }] }] },
        center: { '+': [start, { '*': [band, slot] }] },
        size: { '/': [band, ref(group, 'count')] },
    };
};

// the ends of a tick across the band of the categorical position `pos`
// (`size` of it, 1 by default), of a dodged mark across the slot of the
// category of `group`: a scale without bands (a point scale, a date of an
// `interval`) has the band of a bar, 80% of the step, see dodged
const tickOf = (pos, size = 1, group) => {
    const band = { if: [ref(pos, 'bandwidth'), ref(pos, 'bandwidth'), { '*': [0.8, ref(pos, 'step')] }] };
    const center = group !== undefined ? dodged(pos, group).center
        : { if: [ref(pos, 'bandwidth'), { '+': [ref(pos), { '/': [band, 2] }] }, ref(pos)] };
    const half = { '*': [size / 2, group !== undefined ? dodged(pos, group).size : band] };
    return [{ '-': [center, half] }, { '+': [center, half] }];
};

// the label of a value, `anchor` places the text beside the position:
// `end` after it (horizontal bars), `start` before it, `top` above it,
// `bottom` below it, `center` on it
const anchors = {
    end: { dx: 4, 'text-anchor': 'start', 'dominant-baseline': 'middle' },
    start: { dx: -4, 'text-anchor': 'end', 'dominant-baseline': 'middle' },
    top: { dy: -4, 'text-anchor': 'middle', 'dominant-baseline': 'auto' },
    bottom: { dy: 4, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' },
    center: { 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
    // the corners: above or below the position and after it (end) or before it (start)
    'top-end': { dx: 4, dy: -4, 'text-anchor': 'start', 'dominant-baseline': 'auto' },
    'top-start': { dx: -4, dy: -4, 'text-anchor': 'end', 'dominant-baseline': 'auto' },
    'bottom-end': { dx: 4, dy: 4, 'text-anchor': 'start', 'dominant-baseline': 'hanging' },
    'bottom-start': { dx: -4, dy: 4, 'text-anchor': 'end', 'dominant-baseline': 'hanging' },
};

/**
 * A mark as the engine reads it: its channels as the `props` of the scaled
 * positions, `dims` are the dims of the definition (implicit dims of columns are added),
 * `stacks` collects the stacked value dims (`{ dim, by, condition }`),
 * `bases` the value dims of bars and areas from their base (0 of the scale,
 * see translate), `coord` is the coordinate system.
 */
const mark = (raw, i, dims, coord, stacks, used = new Set(), implicitDims = [], bases = new Set()) => {
    const { p, props } = markParts(raw, i);
    const implicit = (channel, column) => {
        if (!implicitDims.some(d => d.path == `marks[${i}].${channel}`))
            implicitDims.push({ path: `marks[${i}].${channel}`, column });
    };
    if (typeof p.type != 'string')
        throw new Error(`marks[${i}].type: expected a mark type, e.g. "line" or "bar"${p.type === undefined ? '' : `, not ${JSON.stringify(p.type)}`}`);
    const type = typeOf(p.type, coord);
    p.type = type;

    const kind = type.split(':')[1];
    const cartesian = coord == 'cartesian';
    const ch = (name, axis) => channelOf({ ...p, ...props }, name, dims, axis, false, implicit, cartesian);
    // the dims of the positions the mark uses, e.g. of the hover by default
    ['x', 'y', 'x0', 'x1', 'x2', 'y0', 'y1', 'y2'].forEach(n => {
        const c = raw[n] !== undefined || n == 'x' || n == 'y' ? ch(n, n == 'x2' ? 'x' : n == 'y2' ? 'y' : undefined) : undefined;
        // the dims of the hover by default: of the positions x and y, not of
        // the ends of ranges (e.g. the classes of a bin, the bounds of an
        // error bar, which hover.columns lists where they are wanted)
        if (c?.dim !== undefined && (n == 'x' || n == 'y'))
            used.add(c.dim);
    });
    // a channel only if the mark has it, e.g. the start of a bar
    const given = (name, axis) => raw[name] !== undefined ? ch(name, axis) : undefined;
    // a channel of a value: a number is one on the scale, e.g. the base of a bar
    const valued = (name, axis = positionChannels[name]) => raw[name] !== undefined ? channelOf({ ...p, ...props }, name, dims, axis, true, implicit, cartesian) : undefined;
    const take = (...names) => names.forEach(n => delete props[n]);
    const stack = p.stack;
    delete p.stack;
    // `dodge` of bars are the groups beside each other, of texts, points and
    // rules with true or a dim the same (e.g. labels or error bars of dodged
    // bars), a number of texts their distance (the engine)
    const dodge = kind == 'bar' || (['text', 'circle', 'rule'].includes(kind) && (p.dodge === true || typeof p.dodge == 'string')) ? p.dodge : undefined;
    if (dodge !== undefined)
        delete p.dodge;
    if (dodge === true && p.by.length == 0)
        throw new Error(`marks[${i}].dodge: true puts the groups of the first dim of "by" side by side, the mark has no "by", e.g. "by": "year" or "dodge": "year"`);
    const orient = p.orient;
    delete p.orient;
    const anchor = p.anchor;
    delete p.anchor;
    const centered = d => d && Object.hasOwn(dims, d) && isCategorical(dims[d]);
    // a dim of a position which is not continuous (e.g. a column of names,
    // its type follows from the rows) beside a continuous one is the one of
    // the bands, its texts and points at their centers, see at
    // (only a vertical one, e.g. names beside the values of horizontal bars;
    // a horizontal dim of no type is usually one of numbers, e.g. years)
    const banded = (x, y) => [[y, x]].forEach(([c, other]) => {
        if (c?.dim && other?.dim && !centered(c.dim) && !centered(other.dim) && !isContinuous(ofDim(c.dim)) && isContinuous(ofDim(other.dim)))
            bands.add(c.dim);
    });
    // the bars of the positions are horizontal ones, see `orient`: of a
    // categorical y and an x which is not, or of a y which is not continuous
    // (e.g. a column of names, its type follows from the rows) and an x
    // which is, e.g. of `"zero": true`; not of an x of an `interval` (its
    // periods are the bands of vertical bars, e.g. months, y a column of
    // numbers of no type)
    // (a dim of the scale of another one, e.g. the column of the target of a
    // tick beside bars, `"scale": { "of": "x" }`, is of that one)
    const ofDim = (d, depth = 0) => {
        const m = d && Object.hasOwn(dims, d) ? dims[d] : undefined;
        return depth < 8 && typeof m?.scale?.of == 'string' && m.scale.of != d ? ofDim(m.scale.of, depth + 1) ?? m : m;
    };
    const horizontalOf = (x, y) => orient == 'horizontal' || (orient === undefined && y && ((centered(y.dim) && !(x && centered(x.dim)))
        || (x && isContinuous(ofDim(x.dim)) && ofDim(x.dim)?.interval === undefined && !isContinuous(ofDim(y.dim)) && !centered(x.dim))));
    // the dims of positions which are bands by the other one, see banded
    const bands = new Set();
    // a dim whose type follows from the rows, e.g. a column of names: the
    // center of its band if it has bands (of bars beside it), the position
    // itself on a continuous scale, which has no bands
    const untyped = d => d && Object.hasOwn(dims, d) && !isContinuous(ofDim(d));
    // the position of a dim, of a categorical one the center of its band
    const at = (c, kind = 'scaled') => c ? (c.fixed === undefined && kind == 'scaled' && (centered(c.dim) || bands.has(c.dim) || untyped(c.dim)) ? ref(c.dim, 'scaled:center') : c.value) : undefined;
    // `group` of dodged stacked bars: a stack per slot, e.g. per year and type,
    // the stacks start at 0, the base
    // `"diverging"` stacks all rows, the negative values in the reverse
    // order, see stack of utils/data.js
    const stacked = (dim, by, condition, group) => {
        bases.add(dim);
        const diverging = condition === 'diverging';
        stacks.push({ dim, by, condition: condition === undefined || diverging ? true : condition, group, diverging });
    };
    // the base of a bar or an area of the value of a dim without a start of
    // its own: 0 (the domain includes it, see translate), of an area on a
    // log scale, which has no 0, the start of the domain (bars: the end of
    // the domain nearest to 0, see baseOf of marks/cartesian.js)
    const based = c => {
        if (c?.dim === undefined)
            return undefined;
        bases.add(c.dim);
        return isLogDim(dims, c.dim) ? ref(c.dim, 'scaled:min') : undefined;
    };
    const dodgeGroup = dodge === undefined || dodge === false ? undefined : (dodge === true ? p.by[0] : dodge);
    // the colors of the categories, of a dim of a scale (e.g. of a color
    // scale, also an ordinal one of categories with a `range` or a
    // `scheme` of colors) its scaled value, of a categorical dim the color
    // of its category
    const colorScale = m => isObject(m.scale) && (m.scale.range !== undefined || m.scale.scheme !== undefined);
    ['fill', 'stroke'].forEach(k => {
        const v = props[k];
        if (typeof v == 'string' && Object.hasOwn(dims, v) && isObject(dims[v])) {
            if (isCategorical(dims[v]) && !colorScale(dims[v])) {
                if (!p.by.includes(v))
                    p.by.push(v);
                // a group of the mark, as one of its `by`, e.g. in the hover
                used.add(v);
                props[k] = '@color';
            } else
                props[k] = ref(v);
        }
    });
    ['r', 'opacity', 'stroke-width', 'font-size'].forEach(k => {
        const v = props[k];
        if (typeof v == 'string' && Object.hasOwn(dims, v) && isObject(dims[v]) && !isCategorical(dims[v]))
            props[k] = ref(v);
    });
    const prefix = type.split(':')[0];
    if (prefix == 'svg' && kind != 'circle' && kind != 'text' && raw.type != 'cell') {
        // an element of svg: its positions are the ones of the dims of the channels
        const x = given('x'), y = given('y'), x1 = given('x1'), y1 = given('y1'), x2 = given('x2', 'x'), y2 = given('y2', 'y');
        take('x', 'y', 'x1', 'y1', 'x2', 'y2');
        [['x', x], ['y', y], ['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2]].forEach(([k, c]) => {
            if (c)
                props[k] = c.value;
        });
    } else if (coord == 'cartesian' || prefix == 'svg') {
        const base = kind == 'bar' || kind == 'area' || kind == 'rule';
        // a number is a value on the scale of the axis of a rule, of y of a
        // bar and of the positions of texts and points of cartesian charts,
        // e.g. a label at 250 of x; pixels are an expression ("=literal(10)")
        const placed = (kind == 'text' || kind == 'circle') && coord == 'cartesian';
        const x = (base && kind == 'rule') || (placed && typeof raw.x == 'number') ? (raw.x !== undefined ? valued('x') : ch('x')) : ch('x');
        const y = (base && kind == 'rule') || (placed && typeof raw.y == 'number') ? (raw.y !== undefined ? valued('y') : ch('y')) : (kind == 'bar' && raw.y !== undefined ? valued('y') : ch('y'));
        // the ends of a rule: a number is a value on the scale of its axis, as x0 and y0 of bars
        const end = (name, axis) => kind == 'rule' ? valued(name, axis) : given(name, axis);
        const x0 = base ? valued('x0') : given('x0'), x1 = end('x1', 'x'), y0 = base ? valued('y0') : given('y0'), y1 = end('y1', 'y');
        take('x', 'y', 'x0', 'x1', 'y0', 'y1');
        banded(x, y);
        if (kind == 'line' || kind == 'area') {
            const d = isObject(props.d) ? { ...props.d } : {};
            if (x0 || x1) {
                d.x0 ??= x0?.value;
                d.x1 ??= x1?.value;
            } else if (x)
                d.x ??= x.value;
            if (kind == 'line') {
                if (y)
                    d.y ??= y.value;
            } else {
                if (stack && y) {
                    stacked(y.dim, x0 ? x0.dim : undefined, stack);
                    d.y0 ??= ref(y.dim, 'start:scaled');
                    d.y1 ??= ref(y.dim, 'end:scaled');
                } else if (y1 || y) {
                    // the upper edge is `y1`, without one the value of `y`;
                    // the base is the one of the dim of the edge (of `y` if
                    // the edge is an expression of pixels)
                    const top = y1 ?? y, value = top.dim !== undefined ? top : y ?? top;
                    d.y1 ??= top.value;
                    if (d.y0 === undefined)
                        d.y0 = y0 ? y0.value : based(value) ?? (value.dim !== undefined ? `@${value.dim}:scaled:0` : undefined);
                }
            }
            props.d = d;
        } else if (kind == 'bar') {
            const horizontal = horizontalOf(x, y);
            if (x0 && x1 && y) {
                // the classes of a bin, from x0 to x1
                props.x0 = x0.value;
                props.x1 = x1.value;
                if (stack) {
                    stacked(y.dim, x0.dim, stack);
                    props.y0 = ref(y.dim, 'start:scaled');
                    props.y1 = ref(y.dim, 'end:scaled');
                } else {
                    // the end is `y1`, without one the value of `y`
                    props.y1 = (y1 ?? y).value;
                    if (y0)
                        props.y0 = y0.value;
                    else
                        based(y1?.dim !== undefined ? y1 : y);
                }
            } else if (horizontal) {
                if (y)
                    props.y = y.value;
                if (x) {
                    if (stack) {
                        stacked(x.dim, undefined, stack, dodgeGroup);
                        props.x0 = ref(x.dim, 'start:scaled');
                        props.x1 = ref(x.dim, 'end:scaled');
                    } else {
                        props.x1 = x.value;
                        if (x0)
                            props.x0 = x0.value;
                        else
                            based(x);
                    }
                }
                if (dodge && y) {
                    const group = dodge === true ? p.by[0] : dodge;
                    const { position, size } = dodged(y.dim, group);
                    props.y = position;
                    props.height ??= size;
                }
            } else {
                if (x)
                    props.x = x.value;
                if (y) {
                    if (stack) {
                        stacked(y.dim, undefined, stack, dodgeGroup);
                        props.y0 = ref(y.dim, 'start:scaled');
                        props.y1 = ref(y.dim, 'end:scaled');
                    } else {
                        // the end is `y1`, without one the value of `y`
                        props.y1 = (y1 ?? y).value;
                        if (y0)
                            props.y0 = y0.value;
                        else
                            based(y1?.dim !== undefined ? y1 : y);
                    }
                }
                if (dodge && x) {
                    const group = dodge === true ? p.by[0] : dodge;
                    const { position, size } = dodged(x.dim, group);
                    props.x = position;
                    props.width ??= size;
                }
            }
        } else if (kind == 'rule' && raw.type == 'tick') {
            // a short rule at the value across the band of the category, e.g.
            // the median of a box plot, a target of a bullet chart; of
            // horizontal bars (a categorical y) a vertical one across the
            // band of y
            const size = typeof props.size == 'number' ? props.size : 1;
            take('size', 'x2', 'y2');
            if (horizontalOf(x, y)) {
                if (x)
                    props.x = x.value;
                if (y)
                    [props.y1, props.y2] = tickOf(y.dim, size, dodgeGroup);
            } else {
                if (y)
                    props.y = y.value;
                if (x)
                    [props.x1, props.x2] = tickOf(x.dim, size, dodgeGroup);
            }
        } else if (kind == 'rule') {
            const x2 = end('x2', 'x'), y2 = end('y2', 'y');
            take('x2', 'y2');
            // at the center of the band of a categorical position, as bars and
            // points, of dodged bars the middle of the slot of the category
            // (horizontal also of only the ends of x, e.g. of the rows of the
            // mark, which have their y, and of rows of the mark of only a y,
            // e.g. { "y": 2 } of a target)
            const own = Array.isArray(p.data) && p.data.length > 0 && p.data.every(isObject) ? p.data : null;
            const onlyY = raw.y === undefined && own !== null && x?.dim !== undefined && y?.dim !== undefined
                && own.every(r => Object.hasOwn(r, y.dim) && !Object.hasOwn(r, x.dim));
            if (raw.x === undefined && (raw.y !== undefined || raw.x1 !== undefined || raw.x2 !== undefined || onlyY)) {
                props.y = dodgeGroup !== undefined && y ? dodged(y.dim, dodgeGroup).center : at(y);
                if (x1)
                    props.x1 = x1.value;
                if (x2)
                    props.x2 = x2.value;
            } else {
                if (x)
                    props.x = dodgeGroup !== undefined ? dodged(x.dim, dodgeGroup).center : at(x);
                if (y1)
                    props.y1 = y1.value;
                if (y2)
                    props.y2 = y2.value;
            }
        } else if (kind == 'circle') {
            if (x)
                props.cx ??= at(x);
            if (y)
                props.cy ??= at(y);
            // on dodged bars: at the middle of the slot of the category
            if (dodge) {
                if (horizontalOf(x, y) && y)
                    props.cy = dodged(y.dim, dodgeGroup).center;
                else if (x)
                    props.cx = dodged(x.dim, dodgeGroup).center;
            }
        } else if (kind == 'rect' && raw.type == 'cell') {
            // the cells need the bands of their positions, next to each other
            // (a `padding` of 0, a `stroke` draws lines between them)
            [x, y].forEach(c => {
                if (c?.dim && isObject(dims[c.dim]) && dims[c.dim].scale?.type === undefined) {
                    const own = isObject(dims[c.dim].scale) ? dims[c.dim].scale : {};
                    dims[c.dim].scale = { ...own, type: 'band', padding: own.padding ?? 0 };
                }
            });
            if (x) {
                props.x = x.value;
                props.width ??= ref(x.dim, 'bandwidth');
            }
            if (y) {
                props.y = y.value;
                props.height ??= ref(y.dim, 'bandwidth');
            }
        } else if (kind == 'text') {
            if (x)
                props.x = at(x);
            if (y)
                props.y = at(y);
            // on dodged bars: at the middle of the slot of the category
            if (dodge) {
                if (horizontalOf(x, y) && y)
                    props.y = dodged(y.dim, dodgeGroup).center;
                else if (x)
                    props.x = dodged(x.dim, dodgeGroup).center;
            }
            if (anchor)
                Object.entries(anchors[anchor] ?? {}).forEach(([k, v]) => props[k] ??= v);
            if (raw.type == 'label' && props.fill === undefined)
                props.fill = null;
        } else {
            // a registered type: the channels given are attributes of its elements, e.g. "x": "@x:scaled"
            [['x', x], ['y', y], ['x0', x0], ['x1', x1], ['y0', y0], ['y1', y1]].forEach(([k, c]) => {
                if (c && raw[k] !== undefined)
                    props[k] = c.value;
            });
        }
    } else if (coord == 'polar') {
        const x = ch('x'), y = ch('y');
        take('x', 'y', 'x0', 'x1', 'y0', 'y1');
        if (kind == 'line' || kind == 'area') {
            const d = isObject(props.d) ? { ...props.d } : {};
            if (x)
                d.angle ??= x.value;
            if (kind == 'line') {
                if (y)
                    d.radius ??= y.value;
            } else if (y) {
                if (stack) {
                    stacked(y.dim, undefined, stack);
                    d.innerRadius ??= ref(y.dim, 'start:scaled');
                    d.outerRadius ??= ref(y.dim, 'end:scaled');
                } else {
                    d.outerRadius ??= y.value;
                    if (d.innerRadius === undefined)
                        d.innerRadius = based(y) ?? `@${y.dim}:scaled:0`;
                }
            }
            props.d = d;
        } else if (kind == 'arc') {
            // of categories around the circle (a rose) the values stacked
            // outwards, the radius from the start to the end of the stack
            if (stack && x && centered(x.dim) && y) {
                stacked(y.dim, undefined, stack);
                props.angle = x.value;
                props.innerRadius ??= ref(y.dim, 'start:scaled');
                props.outerRadius ??= ref(y.dim, 'end:scaled');
            } else if (stack && x) {
                stacked(x.dim, undefined, stack);
                props.startAngle = ref(x.dim, 'start:scaled');
                props.endAngle = ref(x.dim, 'end:scaled');
            } else if (x)
                props.angle = x.value;
            if (y && raw.y !== undefined)
                props.outerRadius = y.value;
        } else {
            if (x)
                props.angle ??= at(x);
            if (y)
                props.radius ??= y.value;
            if (anchor)
                Object.entries(anchors[anchor] ?? {}).forEach(([k, v]) => props[k] ??= v);
        }
    } else if (coord == 'geo') {
        const lon = raw.lon !== undefined ? ch('lon', null) : undefined;
        const lat = raw.lat !== undefined ? ch('lat', null) : undefined;
        take('lon', 'lat');
        // the values of the dims, not scaled (the projection), an expression as it is
        if (lon && lat) {
            props.lon = lon.dim === undefined ? lon.value : `@${lon.dim}`;
            props.lat = lat.dim === undefined ? lat.value : `@${lat.dim}`;
        }
        if (anchor)
            Object.entries(anchors[anchor] ?? {}).forEach(([k, v]) => props[k] ??= v);
    }
    p.props = props;
    return p;
};

/**
 * An entry of a control: a value (e.g. "2024") is the entry of the value,
 * an object is the entry itself (the merge of the entries of a parent and
 * a child, see arrayMerge of utils/def.js). `entriesOf` are the entries of
 * a list of `values` with their `id` and `name`, the text of the value by
 * default, as the engine reads them (e.g. the fields
 * `@year:name` of the selected entry, see namesOfGlobals of
 * utils/resolve.js), other values (e.g. the column of the values of the
 * data) as they are.
 */
const entryOf = v => isObject(v) ? v : { value: v };
const entriesOf = values => Array.isArray(values)
    ? values.map(entryOf).map(e => ({ ...e, id: e.id ?? String(e.value), name: e.name ?? String(e.value) })) : values;

// a control as the engine reads it: its id is its global by default, its
// values are entries, see entriesOf
const control = (c, i) => {
    if (!isObject(c))
        throw new Error(`controls[${i}]: expected a control, e.g. { "type": "select", "global": "year", "values": [...] }`);
    const { global, values, ...rest } = c;
    const e = { ...rest, global };
    e.id ??= e.global;
    e.values = entriesOf(values);
    return e;
};

// the facets as the engine reads them: `scales` is "own" (the default, no
// dim), "shared" (see sharedScales) or a list or an object of dims
const facetsOf = f => isObject(f) && f.scales == 'own' ? { ...f, scales: [] } : f;
// the dims of shared scales of the facets ("shared"), of the dims after the
// marks, which add the dims of the columns of their channels
const sharedScales = dims => Object.keys(dims).filter(n => isObject(dims[n]) ? dims[n].scale?.orientation !== null : true);

// the attribute of the color of the category of the group of a mark type
// by default, see marks/defaults.js
const colorAttribute = { line: 'stroke', rule: 'stroke', area: 'fill', bar: 'fill', arc: 'fill', circle: 'fill', text: 'fill' };
// a mark of the definition draws in the colors of the categories of its
// groups: by the default of its type (not of a label) or by "@color" in
// its attributes
const usesColor = (m, coord) => {
    const [prefix, kind] = String(typeOf(m.type, coord)).split(':');
    const attribute = prefix == 'geo' || m.type == 'label' ? undefined : colorAttribute[kind];
    const attributes = Object.fromEntries(Object.entries(m).filter(([k]) => !markKeys.includes(k) || k == 'highlight' || k == 'others'));
    return (attribute !== undefined && m[attribute] === undefined) || refNames(compileStrings(attributes)).includes('color');
};

/**
 * The names of the dims (of `dim`) which have the categories of the data
 * because marks draw their groups in the colors of their categories, see
 * translate: a `by` of a mark in the colors of its categories or a fill or
 * a stroke naming the dim, of a dim of only a column (no scale, categories,
 * fromData or type of its own, no position).
 */
const colorDims = (dims, rawMarks, coord = 'cartesian') => {
    const positionNames = coord == 'polar' ? ['x', 'y', 'angle', 'radius'] : coord == 'geo' ? [] : ['x', 'y'];
    const plain = n => typeof n == 'string' && Object.hasOwn(dims, n) && isObject(dims[n]) && !positionNames.includes(n)
        && dims[n].scale === undefined && (dims[n].type === undefined || dims[n].type == 'categorical') && dims[n].fromData === undefined
        && !isObject(dims[n].categories) && !categoryParts.some(k => dims[n][k] !== undefined);
    const names = rawMarks.filter(isObject).flatMap(m => {
        const named = ['fill', 'stroke'].map(k => m[k]).filter(plain);
        return (usesColor(m, coord) ? [...[m.by ?? []].flat(), ...named] : named).filter(plain);
    });
    return [...new Set(names)];
};

/**
 * The definition of 5.0 (merged with its parents, the expressions of
 * globals resolved, see utils/resolve.js) as the engine reads it. Keys of
 * the top level which the schema does not know are left out.
 */
const translate = raw => translated(raw).def;

/**
 * The implicit dims of the channels of the marks of a definition (as
 * translate reads it, merged and resolved): the channels which name no dim,
 * a dim of their column, `{ path, column }`, e.g. `{ "path": "marks[0].x",
 * "column": "yaer" }`, see missingColumns of utils/load.js.
 */
const implicitDims = raw => translated(raw).implicit;

const translated = raw => {
    const def = compileStrings(clone(raw));
    const implicit = [];
    const out = {};
    ['$schema', 'parent', 'data', 'dataFormat', 'transform', 'globals', 'geo', 'annotations'].forEach(k => {
        if (def[k] !== undefined)
            out[k] = def[k];
    });
    optionKeys.forEach(k => {
        if (def[k] !== undefined)
            out[k] = def[k];
    });
    // the columns of the hover are the `hover` of their dims, see below
    const hover = isObject(out.hover) ? { ...out.hover } : out.hover;
    const columns = isObject(hover) ? hover.columns : undefined;
    if (isObject(hover))
        delete hover.columns;
    if (isObject(hover) && Object.keys(hover).length == 0)
        delete out.hover;
    else if (hover !== undefined)
        out.hover = hover;
    const coord = out.coord ?? 'cartesian';

    // a dim of null (or false) is none, e.g. of a global which removes it
    const dims = {};
    Object.entries(isObject(def.dims) ? def.dims : {}).filter(([, d]) => d !== null && d !== false).forEach(([n, d]) => dims[n] = dim(d, n));
    // an object is the shorthand of conditions of equality of dims, e.g.
    // { "year": "@globals.year" } or { "land": ["Wien", "Tirol"] }, the engine's conditions
    if (def.filter !== undefined)
        out.filter = def.filter;
    if (Array.isArray(def.controls))
        out.controls = def.controls.map(control);
    else if (def.controls !== undefined)
        throw new Error('controls: expected a list of controls');

    // the dims of the facets have the categories of the data (the `by` of a
    // mark groups rows of any type, e.g. of a year, it makes no categories)
    const facets = facetsOf(def.facets);
    const rawMarks = def.marks === undefined ? [] : [def.marks].flat();
    // the dims of the hover by default: the ones the marks use, their `by`
    // and the dims of their positions (the facets are the titles of their panels)
    const used = new Set();
    const facetDims = (isObject(facets?.by) ? [facets.by.rows, facets.by.cols] : [facets?.by]).filter(n => typeof n == 'string');
    const grouped = rawMarks.flatMap(m => isObject(m) ? [m.by ?? []].flat() : [])
        .filter(n => typeof n == 'string' && Object.hasOwn(dims, n) && isObject(dims[n]) && !facetDims.includes(n));
    facetDims.filter(n => isObject(dims[n])).forEach(n => {
        if (dims[n].fromData === undefined && !isObject(dims[n].categories))
            dims[n].fromData = 'rows';
    });
    // the dims of the groups of the marks which draw in the colors of their
    // categories (`by`, or a fill or stroke naming a dim), which are only a
    // column (no scale, categories or type of their own, no position), have
    // the categories of the data, in the order of the rows, so the groups
    // have their colors, e.g. a line per country; `"fromData": false` keeps
    // a dim without, e.g. a line per id in one color
    colorDims(dims, rawMarks, coord).forEach(n => dims[n].fromData = 'rows');
    Object.values(dims).forEach(d => {
        if (isObject(d) && d.fromData === false)
            delete d.fromData;
    });
    const stacks = [];
    const bases = new Set();
    const marks = rawMarks.map((m, i) => mark(m, i, dims, coord, stacks, used, implicit, bases));
    if (isObject(facets) && def.facets.scales == 'shared')
        facets.scales = sharedScales(dims);
    used.forEach(n => {
        if (!grouped.includes(n) && Object.hasOwn(dims, n) && isObject(dims[n]) && !facetDims.includes(n))
            grouped.push(n);
    });
    // the stacked value dims, a condition of the rows which are stacked
    stacks.forEach(({ dim: n, by, condition, group, diverging }) => {
        const m = dims[n];
        if (!isObject(m))
            return;
        if (diverging)
            m.stackDiverging = true;
        m.stacked = m.stacked === undefined || m.stacked === true || condition === true ? (m.stacked === true || condition === true ? true : condition)
            : { or: [m.stacked, condition] };
        if (by !== undefined)
            m.stackBy = by;
        // the stacks of dodged bars are the ones of each slot, see stackGroups of layout.js
        if (typeof group == 'string')
            m.stackGroups = [...new Set([...(m.stackGroups ?? []), group])];
    });
    // the value dims of bars and areas from 0 (their default base, also of
    // stacks) include 0, so the bars start at the axis, not below the plot
    // (`zero` of the scale, an end at 0 is not extended), not of a log scale
    // (the bars start at the start of its domain), not with `"zero": false`
    // of the dim; the ends of a fixed domain stay
    bases.forEach(n => {
        const own = dims[n];
        const name = isObject(own?.scale) && typeof own.scale.of == 'string' && Object.hasOwn(dims, own.scale.of) ? own.scale.of : n;
        const m = dims[name];
        if (!isObject(m) || m.scale === false || m.scale === null || isLogDim(dims, name) || isCategorical(m))
            return;
        if (!isObject(m.scale) || m.scale.zero === undefined)
            m.scale = { ...(isObject(m.scale) ? m.scale : {}), zero: true };
    });
    // the dims of the hover: the columns given, else the dims of the marks' `by`
    const inHover = columns !== undefined ? [columns].flat() : grouped;
    inHover.forEach(n => {
        if (Object.hasOwn(dims, n) && isObject(dims[n]) && dims[n].hover === undefined)
            dims[n].hover = {};
    });
    out.dims = dims;
    out.marks = marks;
    if (facets !== undefined)
        out.facets = facets;
    return { def: out, implicit };
};

/**
 * The engine's form of a definition (of translate) checked for names of
 * dims which no mark can draw without, a named error instead of a failure
 * of the draw: the dims of `by` of the marks. validateDef reports them as
 * warnings, with the others.
 */
const checkDims = def => {
    [def.marks ?? []].flat().forEach((p, i) => {
        const other = (p?.by ?? []).find(b => typeof b != 'string');
        if (other !== undefined)
            throw new Error(`marks[${i}].by: expected a dim or a list of dims, e.g. "land", not ${JSON.stringify(other)}`);
        const unknown = (p?.by ?? []).find(b => typeof b == 'string' && !Object.hasOwn(def.dims ?? {}, b));
        if (unknown !== undefined)
            throw new Error(`marks[${i}].by: unknown dim '${unknown}', the dims are ${Object.keys(def.dims ?? {}).map(n => `'${n}'`).join(', ') || 'none'}`);
    });
    return def;
};

// the path of a part of the engine's form as the one of the definition,
// where the forms differ: the attributes of a mark are its `props`,
// "marks[0].props.fill" is "marks[0].fill"
const authoredPath = path => String(path).replace(/^marks\[(\d+)\]\.props\./, 'marks[$1].');
