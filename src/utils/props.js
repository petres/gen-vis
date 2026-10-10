export { compile, evaluate, bind, constant, refNames, refOf, formatter };

/**
 * The props of a definition, the values of most of its parts:
 * - a value, e.g. 3 or "none"
 * - a reference "@name" to a name of the place of the prop, e.g. a global
 * - { "prop": "relative", "ref": "innerWidth", "ratio": 0.5 }, a ratio of a reference
 * - { "prop": "steps", "ref": "totalWidth", "steps": [{ "cut": 0, "value": 1 }] },
 *   the value of the last step with a cut below the reference
 * - { "prop": "format", "ref": "y", "format": ",.1f" }, the reference as a text
 *   of a d3 format in the locale, e.g. a label of a value
 * - objects without `prop` (nested props, e.g. `d` of a line) and lists
 *   (lists of props, e.g. a range)
 *
 * A prop is compiled once, then evaluated with a scope (the values of the
 * names) or bound to the rows of a plot, see `bind`. An unknown name is
 * undefined, validateDef warns of it.
 */

// the compiled props of objects and lists of the definition
const compiled = new WeakMap();

// the name of the formatter of a scope, `(format, name) => function`, e.g. of
// the locale and the type of the mapping of `name`, see layout.js
const formatter = Symbol('formatter');

const node = raw => {
    if (typeof raw == 'string' && raw.startsWith('@'))
        return { kind: 'ref', name: raw.substring(1) };
    if (Array.isArray(raw))
        return { kind: 'list', items: raw.map(compile) };
    if (raw === null || typeof raw != 'object')
        return { kind: 'fixed', value: raw };
    if (!('prop' in raw))
        return { kind: 'object', entries: Object.entries(raw).map(([k, v]) => [k, compile(v)]) };
    if (raw.prop == 'ref' || raw.prop == 'relative' || raw.prop == 'steps' || raw.prop == 'format')
        return { kind: raw.prop, name: raw.ref, ratio: raw.ratio, steps: raw.steps ?? [], format: raw.format };
    return { kind: 'fixed', value: raw.value };
};

const compile = raw => {
    if (raw === null || typeof raw != 'object')
        return node(raw);
    let n = compiled.get(raw);
    if (!n)
        compiled.set(raw, n = node(raw));
    return n;
};

// the value of a relative, a steps or a format prop of the value of its
// reference, `format` is the formatter of the scope
const derive = (n, v, format) => {
    if (n.kind == 'format')
        return v === undefined || v === null ? '' : (format ? format(n.format, n.name)(v) : String(v));
    if (v === undefined)
        return undefined;
    if (n.kind == 'relative')
        return n.ratio*v;
    if (n.kind == 'steps') {
        let value;
        for (const s of n.steps)
            if (v > s.cut)
                value = s.value;
        return value;
    }
    return v;
};

const valueOf = (n, get) => {
    switch (n.kind) {
        case 'fixed': return n.value;
        case 'list': return n.items.map(i => valueOf(i, get));
        case 'object': return Object.fromEntries(n.entries.map(([k, e]) => [k, valueOf(e, get)]));
        default: return derive(n, get(n.name), get(formatter));
    }
};

// the value of a prop with the values of the names of the scope, e.g. the
// globals and the sizes of a facet
const evaluate = (raw, scope = {}) => valueOf(compile(raw), name => Object.hasOwn(scope, name) ? scope[name] : undefined);

// a function of the row which is the same for all rows
const constant = value => Object.assign(() => value, { constant: true });

const bindNode = (n, resolve) => {
    if (n.kind == 'fixed')
        return constant(n.value);
    if (n.kind == 'list' || n.kind == 'object') {
        const entries = n.kind == 'list' ? n.items.map((e, i) => [i, bindNode(e, resolve)]) : n.entries.map(([k, e]) => [k, bindNode(e, resolve)]);
        const make = n.kind == 'list' ? row => entries.map(([, f]) => f(row)) : row => {
            const o = {};
            for (const [k, f] of entries)
                o[k] = f(row);
            return o;
        };
        const f = entries.every(([, e]) => e.constant) ? constant(make()) : make;
        f.entries = new Map(entries);
        return f;
    }
    const value = resolve(n.name) ?? constant(undefined);
    if (n.kind == 'ref')
        return value;
    const format = n.kind == 'format' ? resolve(formatter)?.() : undefined;
    return value.constant ? constant(derive(n, value(), format)) : row => derive(n, value(row), format);
};

/**
 * The prop as a function of a row, e.g. the props of a plot. `resolve(name)`
 * is a function of the row for a name, e.g. of a value of the row, or a
 * `constant`, e.g. of a global, undefined for unknown names. The function of
 * an object or a list has the functions of its entries as `entries`, e.g.
 * the ones which are the same for all rows. Values which are the same for
 * all rows are computed once.
 */
const bind = (raw, resolve) => bindNode(compile(raw), resolve);

// the names referenced by the (nested) props, e.g. "y:scaled" of "@y:scaled"
const refNames = raw => {
    const names = n => n.kind == 'list' ? n.items.flatMap(names)
        : n.kind == 'object' ? n.entries.flatMap(([, e]) => names(e))
        : n.kind == 'fixed' ? [] : [n.name];
    return names(compile(raw));
};

// the name referenced by a prop, e.g. "x:scaled" of "@x:scaled", undefined if
// it is no reference
const refOf = raw => {
    const n = compile(raw);
    return n.kind == 'ref' ? n.name : undefined;
};
