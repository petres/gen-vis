export { translate, compileStrings, isDefinition4, isDefinition5, optionKeys, markKeys, expressionKeys, nameKeys, positionChannels, channelOf, typeOf, authoredPath };

import { isObject } from '@/utils/values';
import { isExpressionText, parseExpression } from '@/utils/expr-parse';
import { isOperator, refNames } from '@/utils/expr';

/**
 * The definition language of gen-vis 5 (see docs/definition.md) translated
 * into the form the engine reads (the one of 4.x normalized, see
 * utils/normalize.js: `options`, `mapping`, `plot` with `props`,
 * `formElements`): the top-level options into `options`, `dims` into
 * `mapping`, `marks` with their channels into `plot` with the props of the
 * scaled positions, `controls` into `formElements`, the hover columns into
 * the `hover` of the mappings, `stack` and `dodge` of marks into the parts of
 * the mappings and the props, the string syntax of expressions into their
 * objects. `translate` is pure, JSON to JSON; the rows are not known, the
 * types of the dims follow later (see inferTypes of utils/data.js).
 */

// the keys of the top level which are the options of the engine, `source`
// is the footer
const optionKeys = ['title', 'subtitle', 'source', 'height', 'width', 'margins', 'coord', 'locale', 'language', 'transition', 'class',
    'message', 'empty', 'hover', 'highlight', 'fontFamily'];

// the keys of a mark which are no attributes of its elements
const markKeys = ['type', 'id', 'by', 'filter', 'curve', 'stack', 'dodge', 'orient', 'select', 'layer', 'facet', 'data', 'dataFormat',
    'once', 'place', 'halo', 'ends', 'fit', 'overlap', 'object', 'borders', 'highlight', 'others', 'anchor', 'before'];

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

const isDefinition5 = def => isObject(def) && (def.dims !== undefined || def.marks !== undefined || def.controls !== undefined
    || (def.mapping === undefined && def.plot === undefined && def.options === undefined && def.formElements === undefined));
const isDefinition4 = def => isObject(def) && !isDefinition5(def);

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

// a part of a definition is one of expressions: of the keys of expressions,
// the marks and the annotations, and everything in it, see expressionKeys
const expressionPart = (key, parent) => expressionKeys.has(key) || parent == 'marks' || parent == 'annotations';
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

// a reference to a value of a row of a dim, e.g. "@x:scaled"
const ref = (dim, kind = 'scaled') => `@${dim}:${kind}`;

// the parts of a dim which make it categorical, see hasCategories of normalize.js
const categoryParts = ['categories', 'scheme', 'common', 'ranks', 'order'];
const categoricalScales = ['band', 'point', 'ordinal'];
const isCategorical = d => isObject(d) && (d.type == 'categorical' || (d.type === undefined && (categoryParts.some(k => d[k] !== undefined)
    || d.fromData || categoricalScales.includes(d.scale?.type))));

// a dim of the definition as a mapping of the engine
const dim = (raw, name) => {
    if (typeof raw == 'string')
        return { column: raw };
    if (!isObject(raw))
        throw new Error(`dims.${name}: expected a dim, e.g. "value" or { "column": "value", "format": ".1f" }`);
    const m = { ...raw };
    const scale = isObject(m.scale) ? { ...m.scale } : m.scale;
    const into = (keys, target, make) => {
        const own = keys.filter(k => m[k] !== undefined);
        if (own.length == 0)
            return target;
        const t = isObject(target) ? { ...target } : {};
        own.forEach(k => make(t, k, m[k]));
        own.forEach(k => delete m[k]);
        return t;
    };
    // the shorthands of the scale: `zero` is a domain from 0
    if (m.zero !== undefined) {
        if (m.zero && m.domain === undefined && scale?.domain === undefined)
            m.domain = [0, null];
        delete m.zero;
    }
    m.scale = into(['pad', 'include', 'reverse', 'range'], scale, (t, k, v) => t[k] = v);
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
// column (`dims` gets it), a number is a value on the scale of the axis of
// the channel if `valued` (the base of a bar, the value of a rule), else
// pixels, an expression of the row as it is (pixels), undefined if the
// mark has none and the dim of the axis does not exist
const channelOf = (mark, channel, dims, axis = positionChannels[channel], valued = false) => {
    const v = mark[channel];
    if (v === undefined)
        return axis && Object.hasOwn(dims, axis) ? { dim: axis, value: ref(axis) } : undefined;
    // a reference or an expression as it is, e.g. "@y:group:start"
    if (typeof v == 'string' && !v.startsWith('@')) {
        if (!Object.hasOwn(dims, v))
            dims[v] = { column: v };
        // another dim of a position (e.g. "hi" of a rule of y1 and y2) is on
        // the scale of the axis of the channel, its values in its domain
        if (axis && v != axis && !['x', 'y'].includes(v) && isObject(dims[v]) && dims[v].scale === undefined && !isCategorical(dims[v]))
            dims[v].scale = { of: axis };
        return { dim: v, value: ref(v) };
    }
    if (typeof v == 'number' && valued && axis && Object.hasOwn(dims, axis))
        return { dim: axis, value: `@${axis}:scaled:${v}`, fixed: v };
    return { dim: undefined, value: v };
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
    if (type == 'label')
        return coord == 'polar' ? 'polar:text' : coord == 'geo' ? 'geo:text' : 'svg:text';
    if (type == 'cell')
        return 'svg:rect';
    if (type == 'text')
        return coord == 'polar' ? 'polar:text' : coord == 'geo' ? 'geo:text' : 'svg:text';
    if (['line', 'area', 'bar', 'rule'].includes(type))
        return coord == 'polar' && type != 'bar' && type != 'rule' ? `polar:${type}` : `cartesian:${type}`;
    if (type == 'arc')
        return 'polar:arc';
    if (['base', 'region', 'mesh'].includes(type))
        return `geo:${type}`;
    if (['circle', 'rect', 'line', 'text'].includes(type))
        return `svg:${type}`;
    return type;
};

// the expressions of a dodged bar: the band of the position dim `pos` split
// among the categories of `group`, its position (the bar plot adds half a
// band, see plots/cartesian.js) and its width; `center` is the middle of
// the slot of the category, e.g. of a label on a dodged bar
const dodged = (pos, group) => ({
    position: { '+': [ref(pos), { '*': [ref(pos, 'bandwidth'), { '-': [{ '/': [{ '+': [ref(group, 'index'), 0.5] }, ref(group, 'count')] }, 0.5] }] }] },
    center: { '+': [ref(pos), { '*': [ref(pos, 'bandwidth'), { '/': [{ '+': [ref(group, 'index'), 0.5] }, ref(group, 'count')] }] }] },
    size: { '/': [ref(pos, 'bandwidth'), ref(group, 'count')] },
});

// the label of a value, `anchor` places the text beside the position:
// `end` after it (horizontal bars), `start` before it, `top` above it,
// `bottom` below it, `center` on it
const anchors = {
    end: { dx: 4, 'text-anchor': 'start', 'dominant-baseline': 'middle' },
    start: { dx: -4, 'text-anchor': 'end', 'dominant-baseline': 'middle' },
    top: { dy: -4, 'text-anchor': 'middle', 'dominant-baseline': 'auto' },
    bottom: { dy: 4, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' },
    center: { 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
};

/**
 * A mark as a plot of the engine: its channels as the props of the scaled
 * positions, `dims` are the mappings (implicit dims of columns are added),
 * `stacks` collects the stacked value dims (`{ dim, by, condition }`),
 * `coord` is the coordinate system.
 */
const mark = (raw, i, dims, coord, stacks) => {
    const { p, props } = markParts(raw, i);
    const type = typeOf(p.type, coord);
    p.type = type;
    const kind = type.split(':')[1];
    const ch = (name, axis) => channelOf({ ...p, ...props }, name, dims, axis);
    // a channel only if the mark has it, e.g. the start of a bar
    const given = (name, axis) => raw[name] !== undefined ? ch(name, axis) : undefined;
    // a channel of a value: a number is one on the scale, e.g. the base of a bar
    const valued = (name, axis = positionChannels[name]) => raw[name] !== undefined ? channelOf({ ...p, ...props }, name, dims, axis, true) : undefined;
    const take = (...names) => names.forEach(n => delete props[n]);
    const stack = p.stack;
    delete p.stack;
    // `dodge` of bars are the groups beside each other, of texts with true or
    // a dim the same (e.g. labels of dodged bars), a number of texts their
    // distance (the engine)
    const dodge = kind == 'bar' || (kind == 'text' && (p.dodge === true || typeof p.dodge == 'string')) ? p.dodge : undefined;
    if (dodge !== undefined)
        delete p.dodge;
    const orient = p.orient;
    delete p.orient;
    const anchor = p.anchor;
    delete p.anchor;
    const centered = d => d && Object.hasOwn(dims, d) && isCategorical(dims[d]);
    // the position of a dim, of a categorical one the center of its band
    const at = (c, kind = 'scaled') => c ? (c.fixed === undefined && kind == 'scaled' && centered(c.dim) ? ref(c.dim, 'scaled:center') : c.value) : undefined;
    const stacked = (dim, by, condition) => stacks.push({ dim, by, condition: condition === undefined ? true : condition });
    // the colors of the categories, of a dim of a scale (e.g. of a color
    // scale) its scaled value, of a categorical dim the color of its category
    ['fill', 'stroke'].forEach(k => {
        const v = props[k];
        if (typeof v == 'string' && Object.hasOwn(dims, v) && isObject(dims[v])) {
            if (isCategorical(dims[v])) {
                if (!p.by.includes(v))
                    p.by.push(v);
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
        const x = base && kind == 'rule' ? (raw.x !== undefined ? valued('x') : ch('x')) : ch('x');
        const y = base && kind == 'rule' ? (raw.y !== undefined ? valued('y') : ch('y')) : (kind == 'bar' && raw.y !== undefined ? valued('y') : ch('y'));
        const x0 = base ? valued('x0') : given('x0'), x1 = given('x1'), y0 = base ? valued('y0') : given('y0'), y1 = given('y1');
        take('x', 'y', 'x0', 'x1', 'y0', 'y1');
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
                } else if (y) {
                    d.y1 ??= y.value;
                    d.y0 ??= y0 ? y0.value : `@${y.dim}:scaled:0`;
                }
            }
            props.d = d;
        } else if (kind == 'bar') {
            const horizontal = orient == 'horizontal' || (orient === undefined && y && centered(y.dim) && !(x && centered(x.dim)));
            if (x0 && x1 && y) {
                // the classes of a bin, from x0 to x1
                props.x0 = x0.value;
                props.x1 = x1.value;
                if (stack) {
                    stacked(y.dim, x0.dim, stack);
                    props.y0 = ref(y.dim, 'start:scaled');
                    props.y1 = ref(y.dim, 'end:scaled');
                } else {
                    props.y1 = y.value;
                    if (y0)
                        props.y0 = y0.value;
                }
            } else if (horizontal) {
                if (y)
                    props.y = y.value;
                if (x) {
                    if (stack) {
                        stacked(x.dim, undefined, stack);
                        props.x0 = ref(x.dim, 'start:scaled');
                        props.x1 = ref(x.dim, 'end:scaled');
                    } else {
                        props.x1 = x.value;
                        if (x0)
                            props.x0 = x0.value;
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
                        stacked(y.dim, undefined, stack);
                        props.y0 = ref(y.dim, 'start:scaled');
                        props.y1 = ref(y.dim, 'end:scaled');
                    } else {
                        props.y1 = y.value;
                        if (y0)
                            props.y0 = y0.value;
                    }
                }
                if (dodge && x) {
                    const group = dodge === true ? p.by[0] : dodge;
                    const { position, size } = dodged(x.dim, group);
                    props.x = position;
                    props.width ??= size;
                }
            }
        } else if (kind == 'rule') {
            const x2 = given('x2', 'x'), y2 = given('y2', 'y');
            take('x2', 'y2');
            // at the center of the band of a categorical position, as bars and points
            if (raw.y !== undefined && raw.x === undefined) {
                props.y = at(y);
                if (x1)
                    props.x1 = x1.value;
                if (x2)
                    props.x2 = x2.value;
            } else {
                if (x)
                    props.x = at(x);
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
        } else if (kind == 'rect' && raw.type == 'cell') {
            // the cells need the bands of their positions
            [x, y].forEach(c => {
                if (c?.dim && isObject(dims[c.dim]) && dims[c.dim].scale?.type === undefined)
                    dims[c.dim].scale = { ...(isObject(dims[c.dim].scale) ? dims[c.dim].scale : {}), type: 'band' };
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
                const group = dodge === true ? p.by[0] : dodge;
                const horizontal = orient == 'horizontal' || (orient === undefined && y && centered(y.dim) && !(x && centered(x.dim)));
                if (horizontal && y)
                    props.y = dodged(y.dim, group).center;
                else if (x)
                    props.x = dodged(x.dim, group).center;
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
                    d.innerRadius ??= `@${y.dim}:scaled:0`;
                }
            }
            props.d = d;
        } else if (kind == 'arc') {
            if (stack && x) {
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
        if (lon && lat) {
            props.lon = `@${lon.dim}`;
            props.lat = `@${lat.dim}`;
        }
        if (anchor)
            Object.entries(anchors[anchor] ?? {}).forEach(([k, v]) => props[k] ??= v);
    }
    p.props = props;
    return p;
};

// the control of 5.0 as a form element of the engine
const control = (c, i) => {
    if (!isObject(c))
        throw new Error(`controls[${i}]: expected a control, e.g. { "type": "select", "global": "year", "values": [...] }`);
    const { global, values, ...rest } = c;
    const e = { ...rest, ref: global ?? c.ref };
    e.id ??= e.ref;
    e.values = Array.isArray(values) ? values.map(v => isObject(v) ? { ...v, id: v.id ?? String(v.value), name: v.name ?? String(v.value) }
        : { id: String(v), name: String(v), value: v }) : values;
    return e;
};

// the facets of 5.0 as the ones of the engine: `by` is the dim or the
// dims of the rows and the columns of a grid, `scales` is "own" (the
// default), "shared" or a list or an object of dims
const facetsOf = (f, dims) => {
    if (!isObject(f))
        return f;
    const out = { ...f };
    if (f.by !== undefined) {
        delete out.by;
        if (isObject(f.by)) {
            if (f.by.rows !== undefined)
                out.rows = f.by.rows;
            if (f.by.cols !== undefined)
                out.cols = f.by.cols;
        } else
            out.dim = f.by;
    }
    if (f.scales == 'own')
        out.scales = [];
    else if (f.scales == 'shared')
        out.scales = Object.keys(dims).filter(n => isObject(dims[n]) ? dims[n].scale?.orientation !== null : true);
    return out;
};

/**
 * The definition of 5.0 (merged with its parents, the expressions of
 * globals resolved, see utils/resolve.js) as the engine reads it. Unknown
 * top-level keys are kept (e.g. for validateDef).
 */
const translate = raw => {
    const def = compileStrings(clone(raw));
    const out = {};
    ['$schema', 'parent', 'data', 'dataFormat', 'transform', 'globals', 'geo', 'annotations'].forEach(k => {
        if (def[k] !== undefined)
            out[k] = def[k];
    });
    const options = {};
    optionKeys.forEach(k => {
        if (def[k] !== undefined)
            options[k == 'source' ? 'footer' : k] = def[k];
    });
    const hover = isObject(options.hover) ? { ...options.hover } : options.hover;
    const columns = isObject(hover) ? hover.columns : undefined;
    if (isObject(hover))
        delete hover.columns;
    if (isObject(hover) && Object.keys(hover).length == 0)
        delete options.hover;
    else if (hover !== undefined)
        options.hover = hover;
    out.options = options;
    const coord = options.coord ?? 'cartesian';

    // a dim of null (or false) is none, e.g. of a global which removes it
    const dims = {};
    Object.entries(isObject(def.dims) ? def.dims : {}).filter(([, d]) => d !== null && d !== false).forEach(([n, d]) => dims[n] = dim(d, n));
    // an object is the shorthand of conditions of equality of dims, e.g.
    // { "year": "@globals.year" } or { "land": ["Wien", "Tirol"] }, the engine's conditions
    if (def.filter !== undefined)
        out.filter = def.filter;
    if (Array.isArray(def.controls))
        out.formElements = def.controls.map(control);
    else if (def.controls !== undefined)
        throw new Error('controls: expected a list of controls');

    // the dims of the facets have the categories of the data (the `by` of a
    // mark groups rows of any type, e.g. of a year, it makes no categories)
    const facets = facetsOf(def.facets, dims);
    const rawMarks = def.marks === undefined ? [] : [def.marks].flat();
    // the dims of the hover by default: the ones of the marks' by (the facets
    // are the titles of their panels)
    const grouped = rawMarks.flatMap(m => isObject(m) ? [m.by ?? []].flat() : [])
        .filter(n => typeof n == 'string' && Object.hasOwn(dims, n) && isObject(dims[n]));
    (facets ? [facets.dim, facets.rows, facets.cols] : []).filter(n => typeof n == 'string' && isObject(dims[n])).forEach(n => {
        if (dims[n].fromData === undefined && !isObject(dims[n].categories))
            dims[n].fromData = 'rows';
    });
    const stacks = [];
    const marks = rawMarks.map((m, i) => mark(m, i, dims, coord, stacks));
    // the stacked value dims, a condition of the rows which are stacked
    stacks.forEach(({ dim: n, by, condition }) => {
        const m = dims[n];
        if (!isObject(m))
            return;
        m.stacked = m.stacked === undefined || m.stacked === true || condition === true ? (m.stacked === true || condition === true ? true : condition)
            : { or: [m.stacked, condition] };
        if (by !== undefined)
            m.stackBy = by;
    });
    // the dims of the hover: the columns given, else the dims of the marks' `by`
    const inHover = columns !== undefined ? [columns].flat() : grouped;
    inHover.forEach(n => {
        if (Object.hasOwn(dims, n) && isObject(dims[n]) && dims[n].hover === undefined)
            dims[n].hover = {};
    });
    out.mapping = dims;
    out.plot = marks;
    if (facets !== undefined)
        out.facets = facets;
    // the other keys, e.g. of extensions, as they are
    Object.keys(def).filter(k => !out[k] && !optionKeys.includes(k) && !['dims', 'marks', 'controls', 'filter', 'facets'].includes(k) && out[k] === undefined)
        .forEach(k => out[k] = def[k]);
    return out;
};

// the path of a part of the engine's form as the one of the definition,
// e.g. "mapping.y.scale" is "dims.y.scale", "plot[0].props.fill" is
// "marks[0].fill", "options.title" is "title"
const authoredPath = path => String(path)
    .replace(/^mapping\./, 'dims.')
    .replace(/^plot\[(\d+)\]\.props\./, 'marks[$1].')
    .replace(/^plot\[/, 'marks[')
    .replace(/^plot\./, 'marks.')
    .replace(/^options\.footer\b/, 'source')
    .replace(/^options\./, '')
    .replace(/^formElements\[(\d+)\]\.ref\b/, 'controls[$1].global')
    .replace(/^formElements/, 'controls')
    .replace(/^facets\.dim\b/, 'facets.by');
