export { compile, implicitOf };

import { translated, checkDims } from '@/utils/language';
import { normalize } from '@/utils/normalize';
import { resolve } from '@/utils/resolve';

/**
 * The one way from a definition as written (`authored`, merged with its
 * parents) to the form the engine reads: resolved with the names of its
 * globals (see utils/resolve.js), translated (utils/language.js), checked
 * and normalized with the mark types `markTypes` (utils/normalize.js).
 * A load reads it several times with the same names (the definition of the
 * load, the prepared one, the warnings of the columns), a change of a
 * control which changes no name again (e.g. a legend toggled), so the
 * result of the last names of a definition is kept, as text: every call
 * gets an own copy, which it may change (e.g. the types of the dims of the
 * rows, the values of the controls of the data, see prepare of
 * utils/load.js), the kept one cannot be changed by it. The implicit dims
 * of the channels of the marks are kept with it (`implicitOf`, read only),
 * see missingColumns of utils/load.js.
 */
const implicitOf = Symbol('implicit');

// the names by their values, also the ones which JSON does not keep, e.g. a
// name without a value (still a name, see namesOfGlobals of utils/resolve.js)
const keyOf = names => JSON.stringify(names, function (k, v) {
    const own = this[k];
    return own === undefined ? '\0undefined' : typeof own == 'number' && !Number.isFinite(own) ? `\0${own}` : v;
});

const kept = new WeakMap();

const compile = (authored, names, markTypes) => {
    const key = keyOf(names);
    let last = kept.get(authored);
    if (last?.key !== key || last.markTypes !== markTypes) {
        const { def, implicit } = translated(resolve(authored, names));
        const text = JSON.stringify(normalize(checkDims(def), { markTypes }));
        last = { key, markTypes, text, implicit: Object.freeze(implicit.map(d => Object.freeze(d))) };
        kept.set(authored, last);
    }
    const def = JSON.parse(last.text);
    def[implicitOf] = last.implicit;
    return def;
};
