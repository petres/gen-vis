export { compile, evaluate, bind, constant, refNames, refOf, formatter, operators, isOperator, isMatch };

import { isObject, missing, sameValue, toNumber } from '@/utils/values';

/**
 * The expressions of a definition, the values of its props, close to JSON
 * Logic, see spec/expressions.md:
 * - a value, e.g. 3, "none", null or a list of expressions
 * - a reference "@name" to a name of the place of the prop, e.g. a global, a
 *   value of the row or "@x:scaled", also { "var": "name" } or, with a
 *   default for an unknown name, { "var": ["name", 0] }
 * - an operator, an object of exactly one key, the operator, and its
 *   arguments, e.g. { "*": ["@innerWidth", 0.5] }, see `operators`
 * - other objects are nested props, e.g. `d` of a line
 *
 * An expression is compiled once (objects and lists are kept by their
 * identity), then evaluated with a scope (the values of the names) or bound
 * to the rows of a plot (`bind`), a function of the row whose parts which are
 * the same for all rows are computed once. An unknown name is undefined, no
 * value (null in JSON), validateDef warns of it.
 */

// the name of the formatter of a scope, `(format, name) => function`, e.g. of
// the locale and the type of the mapping of `name`, see layout.js
const formatter = Symbol('formatter');

// the numbers of arithmetic, no value if one is missing or no number, e.g.
// of a text which is no decimal number, results which are not finite are no
// value, e.g. of a division by 0
const numbers = (values, f) => {
    const n = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        n[i] = toNumber(values[i]);
        if (n[i] === null)
            return undefined;
    }
    const v = f(n);
    return Number.isFinite(v) ? v : undefined;
};

// false, 0, "", null, no value, NaN and empty lists are false, as in JSON Logic
const truthy = v => Array.isArray(v) ? v.length > 0 : Boolean(v);

// the order of two values: numbers by their value, others as texts, no
// order of a missing value (NaN), e.g. of ""
const order = (a, b) => {
    if (missing(a) || missing(b))
        return NaN;
    const [x, y] = [toNumber(a), toNumber(b)];
    if (x !== null && y !== null)
        return x - y;
    const [s, t] = [String(a), String(b)];
    return s < t ? -1 : (s > t ? 1 : 0);
};
// the case of a value of match, by its text, none of a missing value, e.g.
// not a case "null"
const caseOf = (cases, v) => missing(v) ? undefined : cases.get(String(v));

// a chain of comparisons, every pair of neighbours, e.g. { "<": [0, "@x",
// 10] } of a value between two or { "==": ["@a", "@b", "@c"] } of three
// same values
const chain = test => values => {
    for (let i = 1; i < values.length; i++)
        if (!test(values[i - 1], values[i]))
            return false;
    return values.length > 1;
};
const ordered = test => chain((a, b) => test(order(a, b)));

const sum = n => n.reduce((a, b) => a + b, 0);

// the operators of their evaluated arguments, a list, the ones which do not
// evaluate all of them (if, and, or, steps, match, format, literal, var)
// are compiled to nodes of their own
const strict = {
    '+': v => numbers(v, sum),
    '-': v => numbers(v, n => n.length == 1 ? -n[0] : n.slice(1).reduce((a, b) => a - b, n[0])),
    '*': v => numbers(v, n => n.reduce((a, b) => a*b, 1)),
    '/': v => numbers(v, n => n.slice(1).reduce((a, b) => a/b, n[0])),
    'min': v => numbers(v, n => n.length ? Math.min(...n) : NaN),
    'max': v => numbers(v, n => n.length ? Math.max(...n) : NaN),
    // halves are rounded up, as Math.round, e.g. of -2.5 -2, with `digits`
    'round': v => numbers(v, ([x, digits = 0]) => Math.round(x*10**digits)/10**digits),
    '==': chain(sameValue),
    '!=': chain((a, b) => !sameValue(a, b)),
    '<': ordered(d => d < 0),
    '<=': ordered(d => d <= 0),
    '>': ordered(d => d > 0),
    '>=': ordered(d => d >= 0),
    'not': ([a]) => !truthy(a),
    // missing values are empty texts
    'cat': v => v.map(e => e === null || e === undefined ? '' : String(e)).join(''),
};
const lazy = ['if', 'and', 'or', 'steps', 'match', 'format', 'literal', 'var'];
const operators = [...Object.keys(strict), ...lazy];
const known = new Set(operators);

// an object of one key which is an operator
const isOperator = raw => {
    if (!isObject(raw))
        return false;
    let name;
    for (const k in raw) {
        if (name !== undefined)
            return false;
        name = k;
    }
    return name !== undefined && known.has(name);
};

// a `match` object, e.g. { "match": ["@values", { "share": ".0%" }] }: of
// the merge a leaf (a switch of a global or a value), see leafMerge of
// utils/def.js, and resolved as the text of one, see utils/resolve.js
const isMatch = raw => isObject(raw) && Object.keys(raw).length == 1 && Array.isArray(raw.match);

// the arguments of an operator, a single one is a list of it
const argsOf = a => Array.isArray(a) ? a : [a];

// the compiled expressions of objects and lists of the definition
const compiled = new WeakMap();

const opNode = (op, raw) => {
    const args = argsOf(raw);
    switch (op) {
        case 'literal':
            return { kind: 'fixed', value: raw };
        case 'var':
            return { kind: 'ref', name: String(args[0]), fallback: args.length > 1 ? compile(args[1]) : undefined };
        case 'if':
            return { kind: 'if', items: args.map(compile) };
        case 'and':
        case 'or':
            return { kind: op, items: args.map(compile) };
        case 'steps': {
            // the values of the steps by their cut, ascending
            const steps = Object.entries(isObject(args[1]) ? args[1] : {}).map(([cut, v]) => [Number(cut), compile(v)]).sort((a, b) => a[0] - b[0]);
            return { kind: 'steps', of: compile(args[0]), cuts: steps.map(s => s[0]), items: steps.map(s => s[1]) };
        }
        case 'match':
            return {
                kind: 'match',
                of: compile(args[0]),
                cases: new Map(Object.entries(isObject(args[1]) ? args[1] : {}).map(([k, v]) => [k, compile(v)])),
                fallback: compile(args[2] ?? null),
            };
        case 'format': {
            const of = compile(args[0]);
            // the name of a reference, e.g. of a mapping of dates
            return { kind: 'format', of, spec: compile(args[1] ?? null), name: of.kind == 'ref' ? of.name : undefined };
        }
    }
    return { kind: 'op', op, f: strict[op], items: args.map(compile) };
};

const node = raw => {
    if (typeof raw == 'string' && raw.startsWith('@'))
        return { kind: 'ref', name: raw.substring(1) };
    if (Array.isArray(raw))
        return { kind: 'list', items: raw.map(compile) };
    if (raw === null || typeof raw != 'object')
        return { kind: 'fixed', value: raw };
    if (isOperator(raw)) {
        const op = Object.keys(raw)[0];
        return opNode(op, raw[op]);
    }
    return { kind: 'object', entries: Object.entries(raw).map(([k, v]) => [k, compile(v)]) };
};

const compile = raw => {
    if (raw === null || typeof raw != 'object')
        return node(raw);
    let n = compiled.get(raw);
    if (!n)
        compiled.set(raw, n = node(raw));
    return n;
};

// the index of the step of a value, the last one whose cut is below it, -1
// if there is none or the value is missing
const stepOf = (cuts, v) => {
    let index = -1;
    if (v === null || v === undefined)
        return index;
    for (let i = 0; i < cuts.length; i++)
        if (v > cuts[i])
            index = i;
    return index;
};

// a value as a text of a d3 format of the formatter of the scope (the locale
// of the definition), as a text without one, missing values are empty texts
const formatted = (v, spec, format, name) =>
    v === undefined || v === null ? '' : (format && spec !== null && spec !== undefined ? format(spec, name)(v) : String(v));

const valueOf = (n, get) => {
    switch (n.kind) {
        case 'fixed': return n.value;
        case 'ref': {
            const v = get(n.name);
            return v === undefined && n.fallback ? valueOf(n.fallback, get) : v;
        }
        case 'list': return n.items.map(i => valueOf(i, get));
        case 'object': return Object.fromEntries(n.entries.map(([k, e]) => [k, valueOf(e, get)]));
        case 'op': return n.f(n.items.map(i => valueOf(i, get)));
        case 'if': {
            const items = n.items;
            for (let i = 0; i + 1 < items.length; i += 2)
                if (truthy(valueOf(items[i], get)))
                    return valueOf(items[i + 1], get);
            return items.length % 2 ? valueOf(items.at(-1), get) : null;
        }
        case 'and':
        case 'or': {
            let v;
            for (const i of n.items) {
                v = valueOf(i, get);
                if (truthy(v) == (n.kind == 'or'))
                    return v;
            }
            return v;
        }
        case 'steps': {
            const i = stepOf(n.cuts, toNumber(valueOf(n.of, get)));
            return i < 0 ? undefined : valueOf(n.items[i], get);
        }
        case 'match': return valueOf(caseOf(n.cases, valueOf(n.of, get)) ?? n.fallback, get);
        case 'format': return formatted(valueOf(n.of, get), valueOf(n.spec, get), get(formatter), n.name);
    }
};

// the value of an expression with the values of the names of the scope, e.g.
// the globals and the sizes of a facet
const evaluate = (raw, scope = {}) => valueOf(compile(raw), name => Object.hasOwn(scope, name) ? scope[name] : undefined);

// a function of the row which is the same for all rows
const constant = value => Object.assign(() => value, { constant: true });

// the function of the values of functions of the row, computed once if all
// of them are constants, the list of the values is reused for every row
const combined = (fs, f) => {
    if (fs.every(e => e.constant))
        return constant(f(fs.map(e => e())));
    const values = new Array(fs.length);
    return row => {
        for (let i = 0; i < fs.length; i++)
            values[i] = fs[i](row);
        return f(values);
    };
};

const bindNode = (n, resolve) => {
    switch (n.kind) {
        case 'fixed':
            return constant(n.value);
        case 'ref': {
            const value = resolve(n.name) ?? constant(undefined);
            if (!n.fallback)
                return value;
            const fallback = bindNode(n.fallback, resolve);
            if (value.constant)
                return value() === undefined ? fallback : value;
            return row => {
                const v = value(row);
                return v === undefined ? fallback(row) : v;
            };
        }
        case 'list':
        case 'object': {
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
        case 'op':
            return combined(n.items.map(i => bindNode(i, resolve)), n.f);
        case 'if': {
            const items = n.items.map(i => bindNode(i, resolve));
            const fallback = items.length % 2 ? items.at(-1) : constant(null);
            // the branches of constant conditions are decided once
            const branches = [];
            for (let i = 0; i + 1 < items.length; i += 2) {
                if (items[i].constant) {
                    if (truthy(items[i]()))
                        return branches.length ? pick(branches, items[i + 1]) : items[i + 1];
                    continue;
                }
                branches.push([items[i], items[i + 1]]);
            }
            return branches.length ? pick(branches, fallback) : fallback;
        }
        case 'and':
        case 'or': {
            const items = n.items.map(i => bindNode(i, resolve));
            const stop = n.kind == 'or';
            const f = row => {
                let v;
                for (const i of items) {
                    v = i(row);
                    if (truthy(v) == stop)
                        return v;
                }
                return v;
            };
            return items.every(i => i.constant) ? constant(f()) : f;
        }
        case 'steps': {
            const value = bindNode(n.of, resolve);
            const items = n.items.map(i => bindNode(i, resolve));
            const at = v => {
                const i = stepOf(n.cuts, toNumber(v));
                return i < 0 ? constant(undefined) : items[i];
            };
            return value.constant ? at(value()) : row => at(value(row))(row);
        }
        case 'match': {
            const value = bindNode(n.of, resolve);
            const cases = new Map([...n.cases].map(([k, c]) => [k, bindNode(c, resolve)]));
            const fallback = bindNode(n.fallback, resolve);
            const at = v => caseOf(cases, v) ?? fallback;
            return value.constant ? at(value()) : row => at(value(row))(row);
        }
        case 'format': {
            const value = bindNode(n.of, resolve);
            const spec = bindNode(n.spec, resolve);
            const format = resolve(formatter)?.();
            // the function of a format which is the same for all rows is made once
            const fixed = spec.constant && format && spec() !== null && spec() !== undefined ? format(spec(), n.name) : null;
            const f = fixed
                ? row => { const v = value(row); return v === undefined || v === null ? '' : fixed(v); }
                : row => formatted(value(row), spec(row), format, n.name);
            return value.constant && spec.constant ? constant(f()) : f;
        }
    }
};

// the first branch of `[condition, value]` whose condition is true, otherwise `fallback`
const pick = (branches, fallback) => row => {
    for (const [c, v] of branches)
        if (truthy(c(row)))
            return v(row);
    return fallback(row);
};

/**
 * The expression as a function of a row, e.g. the props of a plot.
 * `resolve(name)` is a function of the row for a name, e.g. of a value of the
 * row, or a `constant`, e.g. of a global, undefined for unknown names. The
 * function of an object or a list has the functions of its entries as
 * `entries`, e.g. the ones which are the same for all rows. Values which are
 * the same for all rows are computed once.
 */
const bind = (raw, resolve) => bindNode(compile(raw), resolve);

// the names referenced by the (nested) expressions, e.g. "y:scaled" of "@y:scaled"
const namesOf = n => {
    switch (n.kind) {
        case 'fixed': return [];
        case 'ref': return [n.name, ...(n.fallback ? namesOf(n.fallback) : [])];
        case 'object': return n.entries.flatMap(([, e]) => namesOf(e));
        case 'steps': return [...namesOf(n.of), ...n.items.flatMap(namesOf)];
        case 'match': return [...namesOf(n.of), ...[...n.cases.values(), n.fallback].flatMap(namesOf)];
        case 'format': return [...namesOf(n.of), ...namesOf(n.spec)];
    }
    return n.items.flatMap(namesOf);
};
const refNames = raw => namesOf(compile(raw));

// the name referenced by an expression, e.g. "x:scaled" of "@x:scaled",
// undefined if it is no reference
const refOf = raw => {
    const n = compile(raw);
    return n.kind == 'ref' ? n.name : undefined;
};
