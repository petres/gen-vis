export { resolve, variants, namesOfGlobals };

import { isObject } from '@/utils/values';
import { evaluate, isOperator, refNames } from '@/utils/expr';
import { isExpressionText, parseExpression } from '@/utils/expr-parse';
import { expressionKeys, nameKeys } from '@/utils/language';

/**
 * A definition with the expressions of its globals evaluated: every
 * expression (an object of an operator or the string syntax, see
 * utils/expr-parse.js) whose references are all names of `names` (the
 * globals and the fields of the selected entries of the controls, e.g.
 * `year:name`) is replaced by its value, e.g. `"=match(@scale, {log:
 * 'log', lin: 'linear'})"` of `scale.type` by `"log"`. Other expressions,
 * e.g. of the rows or the sizes, stay as they are. The parts are then
 * translated (see utils/language.js); a change of the globals resolves the
 * definition again, see applyResolved of utils/def.js.
 */

// `inside` a part of expressions (a mark, an annotation, props, a key of
// expressions), objects of one key which is an operator are expressions,
// elsewhere they are parts, e.g. { "format": ".1f" }, see utils/language.js
const resolve = (value, names, key = undefined, inside = false) => resolveIn(value, names, key, inside);

// the parts whose expressions are the ones of the rows or the categories,
// evaluated when they are drawn (the globals are in their scope): the marks,
// the annotations and the props of the parts, e.g. of a legend or a hover,
// and the filters; a text of such a part is an expression of the whole
// part, e.g. the marks of a global, and is resolved
const drawn = new Set(['marks', 'annotations', 'props', 'highlight', 'others']);
// the expressions of the rows, e.g. a filter, evaluated per row with the
// globals in their scope, a text of them is the expression itself
const rows = new Set(['filter', 'stack', 'stacked', 'expr']);

const resolveIn = (value, names, key, inside) => {
    if (rows.has(key) || (drawn.has(key) && typeof value != 'string'))
        return value;
    if (typeof value == 'string') {
        if (!isExpressionText(value) || (key !== undefined && nameKeys.has(key) && value.startsWith('@')))
            return value;
        let ast;
        try {
            ast = parseExpression(value);
        } catch {
            return value;
        }
        const r = resolved(ast, names);
        return r === unresolved ? value : r;
    }
    const expression = inside || (key !== undefined && expressionKeys.has(key));
    if (Array.isArray(value))
        return value.map(v => resolveIn(v, names, key == 'marks' || key == 'annotations' ? 'marks' : undefined, expression || key == 'marks' || key == 'annotations'));
    if (!isObject(value))
        return value;
    if (isOperator(value) && expression) {
        const r = resolved(value, names);
        return r === unresolved ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveIn(v, names, k, true)])) : r;
    }
    // a text of an expression without a value (null) is no part, e.g. of a
    // match of a global without a case of its value
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveIn(v, names, k, expression && key != 'marks')])
        .filter(([k, v]) => !(v === null && typeof value[k] == 'string' && isExpressionText(value[k]))));
};

// the value of an expression of the names only, unresolved of others (also
// of a reference to a name, so "@lang" of options.language stays)
const unresolved = Symbol('unresolved');
const resolved = (ast, names) => {
    const refs = refNames(ast);
    if (refs.length == 0 || !refs.every(n => Object.hasOwn(names, n)))
        return unresolved;
    const v = evaluate(ast, names);
    return v === undefined ? null : v;
};

// the names of the globals of a definition and the fields of the entries
// of its controls selected by them, e.g. `year:name`
const namesOfGlobals = (globals = {}, controls = []) => {
    // also as `globals.<name>`, e.g. of a global a dim of the same name shadows
    const names = { ...globals, ...Object.fromEntries(Object.entries(globals ?? {}).map(([k, v]) => [`globals.${k}`, v])) };
    [controls ?? []].flat().forEach(c => {
        if (!isObject(c))
            return;
        const g = c.global ?? c.ref;
        // the global of a control is a name, also without a value yet, e.g. a
        // definition without globals: a match of it has no case, its default
        if (typeof g == 'string' && !Object.hasOwn(names, g)) {
            names[g] = undefined;
            names[`globals.${g}`] = undefined;
        }
        if (!Array.isArray(c.values))
            return;
        const entry = c.values.find(v => isObject(v) && String(v.value) === String(globals?.[g]));
        Object.entries(entry ?? {}).filter(([, v]) => v === null || typeof v != 'object')
            .forEach(([k, v]) => names[`${g}:${k}`] ??= v);
    });
    return names;
};

/**
 * The definition resolved with its globals and, one at a time, with every
 * value of every control (also of the data, unknown until the rows are
 * loaded: these have none), e.g. for the parts of the package the
 * definition can need, see requirements of utils/load.js.
 */
const variants = def => {
    const globals = isObject(def.globals) ? def.globals : {};
    const controls = [def.controls ?? []].flat().filter(c => isObject(c) && Array.isArray(c.values));
    const sets = [globals, ...controls.flatMap(c => c.values.filter(isObject).map(v => ({ ...globals, [c.global ?? c.ref]: v.value })))];
    const seen = new Set();
    return sets.filter(s => {
        const key = JSON.stringify(s);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }).map(s => resolve(def, namesOfGlobals(s, controls)));
};
