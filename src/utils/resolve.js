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
const resolve = (value, names, key = undefined, inside = false) => {
    if (typeof value == 'string') {
        if (!isExpressionText(value) || (key !== undefined && nameKeys.has(key) && value.startsWith('@')))
            return value;
        let ast;
        try {
            ast = parseExpression(value);
        } catch {
            return value;
        }
        return resolved(ast, names) ?? value;
    }
    const expression = inside || (key !== undefined && expressionKeys.has(key));
    if (Array.isArray(value))
        return value.map(v => resolve(v, names, key == 'marks' || key == 'annotations' ? 'marks' : undefined, expression || key == 'marks' || key == 'annotations'));
    if (!isObject(value))
        return value;
    if (isOperator(value) && expression)
        return resolved(value, names) ?? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, names, k, true)]));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, names, k, expression && key != 'marks')]));
};

// the value of an expression of the names only, undefined of others (also
// of a reference to a name, so "@lang" of options.language stays)
const resolved = (ast, names) => {
    const refs = refNames(ast);
    if (refs.length == 0 || !refs.every(n => Object.hasOwn(names, n)))
        return undefined;
    const v = evaluate(ast, names);
    return v === undefined ? null : v;
};

// the names of the globals of a definition and the fields of the entries
// of its controls selected by them, e.g. `year:name`
const namesOfGlobals = (globals = {}, controls = []) => {
    // also as `globals.<name>`, e.g. of a global a dim of the same name shadows
    const names = { ...globals, ...Object.fromEntries(Object.entries(globals ?? {}).map(([k, v]) => [`globals.${k}`, v])) };
    [controls ?? []].flat().forEach(c => {
        if (!isObject(c) || !Array.isArray(c.values))
            return;
        const g = c.global ?? c.ref;
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
