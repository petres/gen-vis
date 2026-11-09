export { escapeHtml, mergeAll, sameValue, prepareDef, applyResolved, resolvedParts, patchable, variants, variantsOf, selectedEntry, selectedEntries, templateNames, templateRefs, fillTemplate, fillText, fillHtml, formatOf, symbolShortcuts, symbolOf, symbolShape, isInLanguages, inLanguage, languageOf, textsIn };

import { deepMerge, mergeAll as mergeParts } from '@/utils/merge';
import { ownColors, schemeColors } from '@/utils/d3';
import { comparison, isObject, sameValue } from '@/utils/values';
import { defaultScaleType, hasCategories } from '@/utils/normalize';
import { isMatch, operators, refNames } from '@/utils/expr';
import { isExpressionText, parseExpression } from '@/utils/expr-parse';
import { hasLocale } from '@/utils/locale';
import { translate, checkDims, entryOf } from '@/utils/language';
import { resolve, namesOfGlobals } from '@/utils/resolve';
import { normalize } from '@/utils/normalize';

// arrays whose entries all have a key, an `id`, the `global` of controls or
// the `value` of their entries, are merged by it, the first of these which
// all entries of both arrays have, e.g. the controls of a parent with an
// `id` and a `global` and of a child with only the `global` by it; entries
// with a new key are appended, all other arrays are replaced. The entries
// of a control (`values`) are entries first (see entryOf of
// utils/language.js), so a value of a parent, e.g. "2024", is the entry
// of an object of a child of the value, the values of both are values
// (replaced).
const keys = ['id', 'global', 'value'];
const keyOf = (a, b) => keys.find(k => [...a, ...b].every(e => isObject(e) && k in e));
const arrayMerge = (target, source, options) => {
    const key = target.length > 0 && source.length > 0 ? keyOf(target, source) : undefined;
    if (!key)
        return structuredClone(source);
    const merged = target.map(t => {
        const s = source.find(e => e[key] == t[key]);
        return s ? deepMerge(t, s, options) : structuredClone(t);
    });
    return [...merged, ...source.filter(s => !target.some(t => t[key] == s[key])).map(s => structuredClone(s))];
};
const entriesMerge = (target, source, options) => Array.isArray(target) && Array.isArray(source) && [...target, ...source].some(isObject)
    ? arrayMerge(target.map(entryOf), source.map(entryOf), options) : deepMerge(target, source, options);

// the mappings of two parts, a text of one which the other one writes as
// an object is the mapping of its column, e.g. "facet": "group" of a parent
// and "facet": { "categories": {} } of its child is the column with the
// categories
const columnOf = (m, other) => typeof m == 'string' && isObject(other) ? { column: m } : m;
const mergeMappings = (target, source, options) => {
    const t = { ...target };
    const s = { ...source };
    Object.keys(s).filter(k => Object.hasOwn(t, k)).forEach(k => {
        t[k] = columnOf(t[k], s[k]);
        s[k] = columnOf(s[k], t[k]);
        t[k] = withoutOtherTicks(t[k], s[k]);
    });
    return deepMerge(t, s, options);
};
// the number of the ticks of an axis and their distance (`ticks`,
// `tickSpacing`, of the dim or of its axis) are one choice: the one of a
// later part replaces the other one of an earlier part, e.g. a child of
// tickSpacing of a parent of ticks (of which ticks would win)
const tickKeys = ['ticks', 'tickSpacing'];
const withoutOtherTicks = (target, source) => {
    if (!isObject(target) || !isObject(source))
        return target;
    const given = tickKeys.filter(k => source[k] !== undefined || (isObject(source.axis) && source.axis[k] !== undefined));
    if (given.length != 1)
        return target;
    const other = tickKeys.find(k => k != given[0]);
    const t = { ...target };
    delete t[other];
    if (isObject(t.axis)) {
        t.axis = { ...t.axis };
        delete t.axis[other];
    }
    return t;
};
// the attributes of marks and annotations are expressions of the rows, a
// `match` of them is no switch of a global: no leaf merge in them
const withoutLeaves = (t, s, options) => (Array.isArray(t) && Array.isArray(s) ? arrayMerge : deepMerge)(t, s, { ...options, leafMerge: undefined });
const customMerge = key => key == 'mapping' || key == 'dims' ? mergeMappings : key == 'marks' || key == 'annotations' ? withoutLeaves
    : key == 'controls' || key == 'formElements' ? controlsMerge : undefined;
// the controls (of 4.x the form elements) merged by their keys, their
// entries (`values`) as entries, see entriesMerge
const controlsMerge = (target, source, options) => {
    const own = { ...options, customMerge: key => key == 'values' ? entriesMerge : customMerge(key) };
    return (Array.isArray(target) && Array.isArray(source) ? arrayMerge : deepMerge)(target, source, own);
};

// the name of the global of a reference, e.g. `year` of "@year",
// "@globals.year" and "@year:name" (a field of its selected entry)
const globalOfRef = ref => ref.slice(1).replace(/^globals\./, '').split(':')[0];

// a `match` of a global at a leaf: its reference, cases and default, of
// the string syntax ("=match(@values, {share: '.1%'})") or of an operator
// object, null of other values; only a match of a global (`globals`, the
// names of the globals of the parts merged, see globalNames) is a switch,
// e.g. not a match of the categories in `legend.props` or of the rows in
// `stacked`, it is a value
const matchOf = (v, globals) => {
    let ast = v;
    if (typeof v == 'string' && v.startsWith('=match(')) {
        try {
            ast = parseExpression(v);
        } catch {
            return null;
        }
    }
    if (!isMatch(ast) || typeof ast.match[0] != 'string' || !ast.match[0].startsWith('@') || !isObject(ast.match[1]))
        return null;
    const [ref, cases, ...rest] = ast.match;
    if (!globals?.has(globalOfRef(ref)))
        return null;
    return { ref, cases, hasDefault: rest.length > 0, default: rest[0] };
};
const matchExpression = (ref, cases, hasDefault, value) => ({ match: hasDefault ? [ref, cases, value] : [ref, cases] });
const isLiteral = v => isObject(v) && Object.keys(v).length == 1 && Object.hasOwn(v, 'literal');
// a value of a part as the default of a match: a match of a global as its
// object (with its default as one), another expression (a text of the
// string syntax or a match object, e.g. of the categories in the props of a
// legend) as its object, which is evaluated with the match, an object or a
// list as a literal, so it is not evaluated as an expression, e.g. {
// "format": ".0%" } of an axis
const asDefault = (v, globals) => {
    const m = matchOf(v, globals);
    if (m)
        return matchExpression(m.ref, m.cases, m.hasDefault, m.hasDefault ? asDefault(m.default, globals) : undefined);
    if (typeof v == 'string' && isExpressionText(v)) {
        try {
            return parseExpression(v);
        } catch {
            return v;
        }
    }
    return v !== null && typeof v == 'object' && !isLiteral(v) && !isMatch(v) ? { literal: structuredClone(v) } : structuredClone(v);
};
// a value as the default of a match, of the innermost one of nested
// switches, e.g. of two mixins of different globals, so both stay; an
// object merged onto a default which is an object is merged into it (the
// cases stay as they are), e.g. { "nice": true } of a child onto a scale
// of a switch of its type
const withDefault = (m, value, options) => {
    const inner = m.hasDefault ? matchOf(m.default, options.globals) : null;
    if (inner)
        return matchExpression(m.ref, m.cases, true, withDefault(inner, value, options));
    const merged = m.hasDefault && isLiteral(m.default) && isObject(m.default.literal) && isObject(value) && !isMatch(value)
        ? { literal: deepMerge(m.default.literal, value, options) } : asDefault(value, options.globals);
    return matchExpression(m.ref, m.cases, true, merged);
};

/**
 * A switch of a global over the value of the parts before it: a `match`
 * of a global (`options.globals`, see globalNames) without a default merged
 * onto a value (`target`) has it as its default, e.g. `"column":
 * "=match(@values, {share: 'value.share'})"` of a mixin over `"column":
 * "value"` of an earlier parent; two matches of the same global merge
 * their cases (the later ones win) and keep the default of the later one,
 * or of the earlier one if the later has none; a value merged onto a match
 * (with or without a default) becomes its default, so the switch of a
 * mixin also applies to the value of a child merged after it, as the
 * patches of 4.x applied after the merge, an object onto a default which
 * is an object is merged into it; of nested switches (mixins of different
 * globals) the innermost default. Null replaces (removes), as a match with
 * a default replaces a value. Matches of other names are values.
 */
const leafMerge = (target, source, options = {}) => {
    const { globals } = options;
    const s = matchOf(source, globals);
    const t = target === undefined || target === null ? null : matchOf(target, globals);
    if (s) {
        if (t && t.ref == s.ref)
            return matchExpression(s.ref, { ...t.cases, ...s.cases }, s.hasDefault || t.hasDefault, s.hasDefault ? s.default : t.default);
        if (!s.hasDefault && target !== undefined && target !== null)
            return matchExpression(s.ref, s.cases, true, asDefault(target, globals));
        return undefined;
    }
    if (t && source !== undefined && source !== null)
        return withDefault(t, source, options);
    return undefined;
};

/**
 * The names of the globals of the parts of a definition (its parents and
 * mixins), whose matches are switches in the merge: the keys of `globals`
 * and the globals of the controls (of 4.x the `ref` of the form elements,
 * before their migration).
 */
const globalNames = parts => new Set(parts.filter(isObject).flatMap(p => [
    ...(isObject(p.globals) ? Object.keys(p.globals) : []),
    ...[p.controls ?? []].flat().filter(isObject).map(c => c.global),
    ...[p.formElements ?? []].flat().filter(isObject).map(e => e.ref),
]).filter(n => typeof n == 'string'));

// only a `match` object is a leaf of the merge: an object of one other
// operator may be a part, e.g. { "format": ".1f" } of a hover
const mergeAll = parts => mergeParts(parts, { arrayMerge, customMerge, leafMerge, isOperator: isMatch, globals: globalNames(parts) });

// keys of categories ascending or descending, numbers by their value
const sortKeys = (keys, descending) => {
    const compare = comparison(keys);
    return [...keys].sort(descending ? (a, b) => compare(b, a) : compare);
};

/**
 * The keys of the categories in their order: the one of `categories` (keys
 * which are integers, e.g. years, are first and ascending, as JavaScript
 * orders them), `"ascending"` or `"descending"` (numbers by their value) or
 * a list of keys, which are first, the others after them.
 */
const orderKeys = (keys, order) => {
    if (order == 'ascending' || order == 'descending')
        return sortKeys(keys, order == 'descending');
    if (Array.isArray(order)) {
        const listed = order.map(String).filter(k => keys.includes(k));
        return [...new Set(listed), ...keys.filter(k => !listed.includes(k))];
    }
    return keys;
};

/**
 * The svg elements of the symbol of a legend of a shortcut, `"line"`,
 * `"rect"` or `"circle"` in the color of the categories (`@color`), with
 * their `stroke-width`, `stroke-dasharray` and `opacity` if the categories
 * have them, `names` are the props of the categories. The object form has
 * the `size`, or `width` and `height`, of the box of the symbol and the
 * `props` of the element, e.g. a dash, the line is in the middle of the
 * box, the circle in its center. Without them the ones of the `defaults`
 * (see symbolDefaults of utils/defaults.js): of the shortcut, then of all
 * symbols, 16 pixels; the props of the defaults of the shortcut come before
 * the ones of the symbol.
 */
const symbolShortcuts = ['line', 'rect', 'circle'];
const symbolOf = (symbol, names, defaults = {}) => {
    const { type, ...given } = typeof symbol == 'string' ? { type: symbol } : symbol;
    const shortcut = defaults?.[type] ?? {};
    const size = given.size ?? shortcut.size ?? defaults?.size ?? 16;
    const width = given.width ?? (given.size === undefined ? shortcut.width ?? defaults?.width : undefined) ?? size;
    const height = given.height ?? (given.size === undefined ? shortcut.height ?? defaults?.height : undefined) ?? size;
    const props = { ...shortcut.props, ...given.props };
    const own = keys => Object.fromEntries(keys.filter(k => names.has(k)).map(k => [k, `@${k}`]));
    const extra = { line: own(['stroke-width', 'stroke-dasharray', 'opacity']), rect: { rx: 2, ...own(['opacity']) }, circle: own(['opacity']) }[type];
    return { width, height, elements: [{ type, props: { ...symbolShape(type, width, height), ...extra, ...props } }] };
};

/**
 * The element of a symbol of a legend (`line`, `rect` or `circle`) in its
 * box of `width` and `height`, in the color of the category: a line
 * through its middle, a box of its height without the half pixels at its
 * edges, a dot in its center, also of "auto" and of the annotations.
 */
const symbolShape = (kind, width, height) => kind == 'line'
    ? { x1: 0, x2: width, y1: height/2, y2: height/2, stroke: '@color', 'stroke-width': 2 }
    : kind == 'rect' ? { x: 0, y: 0.5, width, height: height - 1, fill: '@color' }
    : { cx: width/2, cy: height/2, r: Math.min(width, height)/2 - 2, fill: '@color' };

// the plot types drawn as a filled box, a line or a dot in a symbol of "auto"
const symbolKinds = [
    ['rect', ['cartesian:area', 'cartesian:bar', 'polar:area', 'polar:arc', 'svg:rect', 'geo:region'], ['fill', 'fill-opacity', 'opacity']],
    ['line', ['cartesian:line', 'cartesian:rule', 'polar:line', 'svg:line'], ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity']],
    ['circle', ['svg:circle', 'polar:circle', 'geo:circle'], ['fill', 'fill-opacity', 'stroke', 'opacity']],
];

/**
 * The symbol of a legend of the plots of its categories (`"symbol": "auto"`):
 * a box of the ones which fill an area (e.g. bars, areas), a line of the
 * lines and a circle of the dots, in this order, e.g. a light area under a
 * line, with the props of their style which are the same for all rows of a
 * category: values or references to the props of the categories, e.g.
 * `@color` or `@dash`, not to values of the rows. The box is the one of the
 * shortcut of the line (or of the box or the dot) of the `defaults`, a
 * rect without plots of the categories.
 */
const autoSymbol = (symbol, name, plots, names, defaults, key) => {
    const given = typeof symbol == 'string' ? {} : symbol;
    const own = v => !refNames(v).some(n => typeof n != 'string' || (n != 'color' && !names.has(n)));
    const parts = symbolKinds.flatMap(([kind, types, keys]) => {
        // the first plot of the first type of the kind, e.g. a line before a
        // rule, of the ones which draw the category `key` (all without one)
        const of = [plots ?? []].flat().filter(p => [p?.by ?? []].flat().includes(name) && (key === undefined || draws(p.filter, name, key)));
        const plot = types.map(t => of.find(p => p?.type == t)).find(Boolean);
        if (!plot)
            return [];
        const props = Object.fromEntries(keys.filter(k => plot.props?.[k] !== undefined && own(plot.props[k])).map(k => [k, plot.props[k]]));
        return [{ kind, props, plot }];
    });
    // a dot joins a line (a line with points), beside a box without a line
    // the box is the symbol, e.g. of a strip of points below a histogram
    if (parts.some(p => p.kind == 'rect') && !parts.some(p => p.kind == 'line'))
        parts.splice(0, parts.length, ...parts.filter(p => p.kind != 'circle'));
    if (parts.length == 0)
        return symbolOf({ ...given, type: 'rect' }, names, defaults);
    // the box of the line, of the area or of the dot
    const base = symbolOf({ ...given, type: parts.find(p => p.kind == 'line')?.kind ?? parts[0].kind, props: {} }, names, defaults);
    const { width, height } = base;
    // the dot of points in the size of their radius (a number), within its box
    const radius = p => p.kind == 'circle' && typeof p.plot?.props?.r == 'number' ? { r: Math.min(p.plot.props.r, Math.min(width, height)/2 - 1) } : {};
    return { width, height, elements: parts.map(p => ({ type: p.kind, props: { ...symbolShape(p.kind, width, height), ...p.props, ...radius(p), ...given.props } })) };
};

// whether a plot draws a category of a mapping by its `filter` on the
// mapping, e.g. { "land": "Wien" } or { "land": { "not": ["Wien"] } }; the
// conditions of globals and ranges are of all categories (undecided here)
const draws = (filter, name, key) => {
    if (!isObject(filter) || !Object.hasOwn(filter, name))
        return true;
    const ref = v => typeof v == 'string' && v.startsWith('@');
    const test = c => Array.isArray(c) ? (c.some(ref) ? undefined : c.map(String).includes(key))
        : isObject(c) ? ('not' in c ? (r => r === undefined ? undefined : !r)(test(c.not)) : undefined)
        : ref(c) ? undefined : c !== null && String(c) === key;
    return test(filter[name]) ?? true;
};

// the colors of the categories without colors, the scheme observable10
// registered by the page (registerScheme, e.g. the colors of a house style)
// or d3's scheme Observable10, distinct colors which are also distinct for
// most color vision deficiencies
const defaultColors = ['#4269D0', '#EFB118', '#FF725C', '#6CC5B0', '#3CA951', '#FF8AB7', '#A463F2', '#97BBF5', '#9C6B4E', '#9498A0'];

// an entry of a definition which is an object, e.g. a mapping or a plot, an
// error otherwise, e.g. of null, `path` names it
const object = (v, path, expected) => {
    if (!isObject(v))
        throw new Error(`${path}: expected ${expected}`);
    return v;
};

// `dataKeys(column)` are the distinct values of a column of the data as
// strings, see distinctValues of utils/data.js, the categories of `fromData`
const prepareMapping = (m, name, dataKeys = () => [], globals = {}, plots = [], symbols = {}) => {
    object(m, `mapping.${name}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`);
    // null or false removes a part, e.g. the hover of a parent
    ['scale', 'axis', 'legend', 'hover'].forEach(k => {
        if (m[k] === null || m[k] === false)
            delete m[k];
        else if (m[k] !== undefined)
            object(m[k], `mapping.${name}.${k}`, 'an object, e.g. {}');
    });
    if (hasCategories(m)) {
        // the props of a category (`categoryProps`, by its key): the color of
        // a scheme in the order of the categories, e.g. Tableau10, the common
        // ones, the ones of its rank, e.g. the newest year, and its own ones,
        // `keys` is the order of the categories, the one of the legend, the
        // facets and the stacks. The categories of the data which are not
        // listed are after the listed ones.
        const categories = { ...m.categories };
        // `fromData` of "rows": the categories in the order of the rows, not ascending
        if (m.fromData && typeof m.column == 'string')
            dataKeys(fillTemplate(m.column, globals), m.fromData == 'rows').filter(k => !Object.hasOwn(categories, k)).forEach(k => categories[k] = {});
        // `"order": "rows"`: all categories in the order of the rows of the
        // data, also the listed ones (their props stay theirs), e.g. one with
        // a name or a class of its own among the ones of the data
        const rowsOrder = m.order == 'rows' && typeof m.column == 'string' ? dataKeys(fillTemplate(m.column, globals), true) : null;
        const keys = rowsOrder ? orderKeys(Object.keys(categories), [...rowsOrder, ...Object.keys(categories)]) : orderKeys(Object.keys(categories), m.order);
        // the colors of a scheme, without one and without colors of the
        // categories the default colors, `defaultColor`, the color of a plot
        // or a legend if no category of it has a color, see plotGroups
        const given = [m.common, ...[m.ranks ?? []].flat(), ...Object.values(categories)].some(c => c?.color !== undefined);
        const colors = m.scheme ? schemeColors(m.scheme, keys.length) : undefined;
        if (m.scheme && !colors)
            throw new Error(`Unknown scheme '${m.scheme}', e.g. 'Tableau10' or 'Blues'`);
        const ranks = m.ranks ?? [];
        const palette = colors || given ? null : ownColors('observable10', keys.length) ?? defaultColors;
        m.keys = keys;
        m.categoryProps = Object.fromEntries(keys.map((k, i) => {
            const rank = ranks.length > 0 ? ranks[Math.min(i, ranks.length - 1)] : {};
            const t = Object.assign({}, colors ? { color: colors[i % colors.length] } : {}, m.common, rank, categories[k]);
            t.name ??= k;
            t.visible ??= true;
            if (palette)
                t.defaultColor = palette[i % palette.length];
            return [k, t];
        }))
    }

    // the scale of another mapping (`of`) has no parts of its own, the type
    // of the scale follows from the one of the mapping, see defaultScaleType
    if (m.scale && m.scale.of === undefined) {
        m.scale.type ??= defaultScaleType(m, name, plots);
        m.scale.domain ??= [null, null];
    }

    if (m.legend) {
        if (m.legend.props === undefined)
            m.legend.props = {};
        // the symbols of the plots of the categories by default, `null` is none
        if (m.legend.symbol === undefined && m.categoryProps)
            m.legend.symbol = 'auto';

        // the symbols of the legend and of its categories, e.g. a rect of
        // one category and lines of the others
        const names = new Set(Object.values(m.categoryProps ?? {}).flatMap(p => Object.keys(p)));
        const prepared = symbol => symbol === 'auto' || symbol?.type == 'auto' ? autoSymbol(symbol, name, plots, names, symbols)
            : (typeof symbol == 'string' || symbolShortcuts.includes(symbol?.type) ? symbolOf(symbol, names, symbols) : symbol);
        const auto = m.legend.symbol === 'auto' || m.legend.symbol?.type == 'auto' ? m.legend.symbol : null;
        m.legend.symbol = prepared(m.legend.symbol);
        Object.values(m.categoryProps ?? {}).filter(p => p.symbol !== undefined).forEach(p => p.symbol = prepared(p.symbol));
        // "auto" of plots of some categories (a filter of the mapping): the
        // symbol of each category of the plots which draw it, e.g. a line of
        // one and bars of the others
        if (auto && [plots ?? []].flat().some(p => [p?.by ?? []].flat().includes(name) && isObject(p.filter) && Object.hasOwn(p.filter, name)))
            Object.entries(m.categoryProps ?? {}).filter(([, p]) => p.symbol === undefined)
                .forEach(([k, p]) => p.symbol = autoSymbol(auto, name, plots, names, symbols, k));

        if (!('name' in m.legend.props)) {
             m.legend.props.name = "@name"
        }
    }

    // the name of the category is the first column of the hover, `null` leaves it out
    if (m.hover)
        m.hover.props = { name: '@name', ...m.hover.props };

    return m;
}

// the annotations are plots of a row of their values, of the types of
// plots/annotations.js, below the axes and the plots (`layer`, `"above"` or
// `above` above the plots), or right before the plot `before` in its layer,
// see preparePlots
const annotationPlots = (annotations = []) => [annotations].flat().map((a, i) => {
    const { type, props = {}, above, layer, before, legend, facet, ...row } = object(a, `annotations[${i}]`, 'an annotation, e.g. { "type": "line", "y": 0 }');
    return {
        type: `annotation:${type}`,
        id: `annotation-${i}`,
        data: [row],
        props,
        layer: layer ?? (above ? 'above' : 'below'),
        ...(before === undefined ? {} : { before }),
        ...(legend === undefined ? {} : { legend }),
        ...(facet === undefined ? {} : { facet }),
    };
});

// the annotations with `before` right before their plot, in its layer, e.g.
// lines above the bars but below the labels whose halo cuts them
const placed = plots => {
    const moved = plots.filter(p => p?.before !== undefined && plots.some(q => q?.id === p.before && q !== p));
    const rest = plots.filter(p => !moved.includes(p));
    moved.forEach(p => {
        const target = rest.findIndex(q => q?.id === p.before);
        const { layer, ...own } = p;
        rest.splice(target, 0, rest[target].layer === undefined ? own : { ...own, layer: rest[target].layer });
    });
    return rest;
};

// the options of the definition, the height of a facet and the space around
// its plots, e.g. of the axes
// an option of null is none, e.g. of an expression of a global without a value
// the margins are the sides the definition gives, the others are the ones
// of the styles or the defaults of the page, or measured of the axes
// ("auto"), see layout
const prepareOptions = options => {
    const given = Object.fromEntries(Object.entries(options ?? {}).filter(([, v]) => v !== null));
    // "auto" is the same as no margins: the styles or the defaults of the
    // page, else measured; a side of "auto" is measured
    const margins = isObject(given.margins) ? given.margins : {};
    return { height: 400, ...given, margins };
};

// the props of a highlight or of the others of a plot, without the mode of
// the highlight, e.g. "highlight": { "mode": "row", "r": 5 }
const partProps = part => isObject(part) ? Object.keys(part).filter(n => n != 'mode') : [];

// the plots and the annotations, which are plots of their own, the rows of
// files of plots are the ones loaded, see `files` of applyResolved. The names
// of the props of the highlight and of the others (`highlightProps`,
// `othersProps`) are the ones of the stylesheet of the highlight, see
// utils/highlight.js.
const preparePlots = (plot, annotations, files) => {
    const plots = placed([...[plot ?? []].flat(), ...annotationPlots(annotations ?? [])]);
    return plots.map((raw, i) => {
        const p = { ...object(raw, `plot[${i}]`, 'a plot, e.g. { "type": "svg:circle", "props": {} }') };
        p.props ??= {};
        // a mapping or a list of them
        p.by = [p.by ?? []].flat();
        p.id ??= `mark-${i}`;
        p.highlightProps = partProps(p.highlight);
        p.othersProps = partProps(p.others);
        if (typeof p.data == 'string' && files?.has(p.data)) {
            p.data = files.get(p.data);
            p.loaded = true;
        }
        return p;
    });
};

/**
 * The prepared definition: the globals, the form elements and the parts
 * which the globals can change, see applyResolved, the definition is
 * changed, `options` are the ones of applyResolved.
 */
const prepareDef = (def, options = {}) => {
    const org = JSON.parse(JSON.stringify(def));
    if (def[variantsOf])
        org[variantsOf] = def[variantsOf];
    // the values of the form elements, also without globals of the definition
    def.globals ??= {};
    // a form element without entries has none
    def.formElements = (def.formElements ?? []).map((e, i) => object(e, `formElements[${i}]`, 'a form element'));
    def.formElements.forEach(e => {
        if (!Array.isArray(e.values))
            e.values = [];
    });
    def.mapping ??= {};
    applyResolved(def, org, options);
    return def;
};

// the language tags of texts in several languages, e.g. de or de-AT, not
// the names of operators, e.g. { "or": "x" } or { "var": "x" }
const languageTag = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const operatorNames = new Set(operators);

/**
 * A text in several languages: an object of language tags and texts, e.g.
 * { "de": "Bevölkerung", "en": "Population" }, see inLanguage.
 */
const isInLanguages = v => isObject(v) && Object.keys(v).length > 0
    && Object.entries(v).every(([k, t]) => languageTag.test(k) && !operatorNames.has(k) && typeof t == 'string');

/**
 * The text of a text in several languages in the language `language`, of
 * its language without the region (de of de-AT) or the first one; other
 * values as they are.
 */
const inLanguage = (v, language) => {
    if (!isInLanguages(v))
        return v;
    const base = language?.split('-')[0];
    return (language !== undefined && Object.hasOwn(v, language) ? v[language] : undefined)
        ?? (base !== undefined && Object.hasOwn(v, base) ? v[base] : undefined) ?? Object.values(v)[0];
};

/**
 * The language of the texts (`options.language`): a tag or a global
 * ("@lang"), by default the one of `options.locale`, undefined without both.
 */
const languageOf = (options, globals = {}) => {
    const given = options?.language;
    if (typeof given == 'string' && !given.startsWith('@'))
        return given;
    // a global without a value: the language of the locale
    const global = typeof given == 'string' ? globals?.[given.slice(1)] : undefined;
    if (global != null && global !== '')
        return String(global);
    const locale = options?.locale;
    return typeof locale == 'string' ? locale : (isObject(locale) && typeof locale.base == 'string' ? locale.base : undefined);
};

// the places of texts which can be in several languages, by part, a path
// of keys ('*' every entry of an object or a list), only these, other
// objects of short keys are not texts, e.g. { "of": "x" } of a scale
const textPaths = {
    options: [['title'], ['subtitle'], ['footer'], ['empty'], ['hover', 'title'], ['hover', 'row'], ['hover', 'total']],
    mapping: [['*', 'name'], ['*', 'format'], ['*', 'axis', 'format'], ['*', 'axis', 'title'], ['*', 'axis', 'title', 'name'], ['*', 'hover', 'format'],
        ['*', 'legend', 'format'], ['*', 'legend', 'missing', 'name'], ['*', 'common', 'name'], ['*', 'categories', '*', 'name'], ['*', 'ranks', '*', 'name']],
    annotations: [['*', 'label'], ['*', 'text']],
};

/**
 * A part of a definition (`options`, `mapping` or `annotations`) with its
 * texts in several languages in the one of `language` (see inLanguage), at
 * their places (textPaths), a copy of the objects on the way to them.
 */
const textsIn = (name, part, language) => {
    const resolve = (v, path) => {
        if (path.length == 0)
            return inLanguage(v, language);
        const [k, ...rest] = path;
        if (Array.isArray(v) && k == '*')
            return v.map(e => resolve(e, rest));
        if (!isObject(v))
            return v;
        const keys = k == '*' ? Object.keys(v) : (Object.hasOwn(v, k) ? [k] : []);
        return keys.length ? { ...v, ...Object.fromEntries(keys.map(key => [key, resolve(v[key], rest)])) } : v;
    };
    return (textPaths[name] ?? []).reduce((v, path) => resolve(v, path), part);
};

// the parts of a definition which the globals can change, see resolvedParts
const patchable = ['options', 'mapping', 'plot', 'annotations', 'filter', 'facets', 'geo', 'transform'];

// the definitions of the engine of all values of the controls of a
// definition, kept on the one of its load (see load of utils/load.js), e.g.
// to load the parts any of them needs, see requirements of utils/load.js,
// the definition itself without them
const variantsOf = Symbol('variants');
const variants = def => def[variantsOf] ?? [def];

// the entry of a form element of the value of its global, undefined if
// there is none
const selectedEntry = (def, e) => e.values.find(v => sameValue(v.value, def.globals?.[e.ref]));

// the entries of the form elements of the values of their globals
const selectedEntries = def => (def.formElements ?? []).map(e => selectedEntry(def, e)).filter(Boolean);

// the sources of the prepared parts of a definition, a part whose source is
// the same is kept, e.g. a mapping with its categories of the data
const sources = Symbol('sources');

/**
 * The patchable parts of the definition `source` (the one of gen-vis 5 with
 * its expressions of the globals, see utils/resolve.js) of the globals of
 * `def`: resolved with them and the fields of the selected entries of the
 * controls, translated and normalized (`plotTypes` are the plot types,
 * see utils/normalize.js); without a source the parts of `defOrg`. The
 * globals of an entry can select the entry of a later form element, e.g. a
 * language selects its names, they are set in `def.globals` until no entry
 * changes them anymore, at most once per form element, e.g. of entries
 * which set each other's globals.
 */
const resolvedParts = (def, defOrg, source = null, plotTypes = {}) => {
    for (let i = 0; i <= (def.formElements ?? []).length; i++) {
        const selected = selectedEntries(def);
        const globals = JSON.stringify(def.globals);
        selected.filter(v => isObject(v.globals)).forEach(v => Object.assign(def.globals, v.globals));
        if (JSON.stringify(def.globals) == globals)
            break;
    }
    const pick = d => Object.fromEntries(patchable.filter(k => d?.[k] !== undefined).map(k => [k, d[k]]));
    if (!source)
        return pick(JSON.parse(JSON.stringify(pick(defOrg))));
    const names = namesOfGlobals(def.globals, source.controls);
    return pick(normalize(checkDims(translate(resolve(source, names))), { plotTypes }));
};

/**
 * The parts of a definition of its globals (see resolvedParts: the
 * `source` of gen-vis 5 resolved with them, e.g. a column or a scale of a
 * control, `plotTypes` of its normalization), prepared into `def`, `defOrg`
 * is the definition of the load. Column templates are filled with the
 * globals, e.g. "{values}{share}". Only the parts which differ from the
 * ones prepared before are prepared again, e.g. a mapping with the categories
 * of the data of another column (`dataKeys`, see prepareMapping), the
 * entries of the legends of the same categories keep their state shown or
 * hidden (`keepVisible`). `transform()` is called once the transforms are
 * the new ones, before the mappings, their categories can be the ones of a
 * transform, `types(part)` sets the types of the mappings of a part
 * without one from the values (see inferTypes of utils/data.js), `files`
 * are the rows of the files of plots, by their url, `symbols` the defaults
 * of the symbols of legends, see symbolDefaults. Returns the names of the
 * mappings whose values change, the ones of another column or type.
 */
const applyResolved = (def, defOrg, { dataKeys = () => [], keepVisible = true, transform = () => {}, files = null, symbols = {}, source = null, plotTypes = {}, types = null } = {}) => {
    const merged = resolvedParts(def, defOrg, source, plotTypes);
    if (merged.mapping && types)
        types({ mapping: merged.mapping, globals: def.globals });
    // the texts in the language of the definition, e.g. of a global of a
    // form element; the locale of the numbers and dates is the language
    // without one of its own
    const language = languageOf(merged.options, def.globals);
    const patched = { ...merged };
    ['options', 'mapping', 'annotations'].filter(k => merged[k] !== undefined).forEach(k => patched[k] = textsIn(k, merged[k], language));
    if (hasLocale(language) && patched.options?.locale === undefined)
        patched.options = { ...patched.options, locale: language };
    // the names of the form elements and of their entries
    (def.formElements ?? []).forEach((e, i) => {
        const org = defOrg.formElements?.[i];
        if (!isObject(org) || !isObject(e))
            return;
        if (org.name !== undefined)
            e.name = inLanguage(org.name, language);
        if (Array.isArray(org.values) && Array.isArray(e.values))
            e.values.forEach((v, j) => {
                if (isObject(v) && isObject(org.values[j]) && org.values[j].name !== undefined)
                    v.name = inLanguage(org.values[j].name, language);
            });
    });
    const before = def[sources] ?? {};
    const after = { mapping: {} };
    // a part prepared again if its source differs from the one before
    const part = (name, raw, prepare) => {
        const source = JSON.stringify(raw ?? null);
        after[name] = source;
        if (before[name] !== source || !(name in def))
            def[name] = prepare(raw);
    };

    part('options', patched.options, prepareOptions);
    part('facets', patched.facets ?? null, f => f && isObject(f) ? { cols: 1, ...f } : undefined);
    if (!def.facets)
        delete def.facets;
    part('filter', patched.filter ?? null, f => f ?? undefined);
    if (!def.filter)
        delete def.filter;
    part('geo', patched.geo ?? null, g => g ?? undefined);
    if (!def.geo)
        delete def.geo;
    part('plot', [patched.plot ?? null, patched.annotations ?? null], ([p, a]) => preparePlots(p, a, files));
    delete def.annotations;
    part('transform', patched.transform ?? null, t => t ?? undefined);
    if (!def.transform)
        delete def.transform;
    def[sources] = after;
    transform();

    const changed = [];
    const mapping = {};
    const names = templateNames(def);
    Object.entries(patched.mapping ?? {}).forEach(([n, raw]) => {
        if (raw === null || raw === undefined)
            return;
        object(raw, `mapping.${n}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`);
        const merged = JSON.parse(JSON.stringify(raw));
        if (typeof merged.column == 'string')
            merged.column = fillTemplate(merged.column, names);
        // the categories of the data are part of the source, e.g. of a column
        // of a transform of the globals, such as the names of a language
        const keys = merged.fromData && typeof merged.column == 'string' ? dataKeys(merged.column, merged.fromData == 'rows') : null;
        // a symbol "auto" of the legend or of a category is the one of the
        // plots, e.g. bars of a patch instead of lines
        const auto = [merged.legend?.symbol, ...Object.values(isObject(merged.categories) ? merged.categories : {}).map(c => c?.symbol)]
            .some(s => s === 'auto' || s?.type == 'auto');
        const source = JSON.stringify([merged, keys, auto ? after.plot : null]);
        after.mapping[n] = source;
        const old = def.mapping?.[n];
        // without `keepVisible` the entries of the legend are the ones of the definition
        if (old && keepVisible && before.mapping?.[n] === source) {
            mapping[n] = old;
            return;
        }
        const m = prepareMapping(merged, n, dataKeys, {}, def.plot, symbols);
        if (keepVisible && old?.categoryProps && m.categoryProps)
            m.keys.filter(k => Object.hasOwn(old.categoryProps, k)).forEach(k => m.categoryProps[k].visible = old.categoryProps[k].visible);
        if (old?.column !== m.column || old?.type !== m.type)
            changed.push(n);
        mapping[n] = m;
    });
    def.mapping = mapping;
    return changed;
};

// the d3 format of the values of a mapping in a part of the visualisation:
// of the axis its own or the one of the mapping (`format`), of the hover its
// own, the one of the mapping or the one of the axis, of the
// legend of colors its own or the one of the hover, undefined for the
// default of the part, see coords/ticks.js, ColorLegend.vue and
// valueFormat of utils/locale.js
const formatOf = (m, part) => {
    const axis = m.axis?.format ?? m.format;
    const hover = m.hover?.format ?? m.format ?? axis;
    if (part == 'axis')
        return axis;
    if (part == 'legend')
        return m.legend?.format ?? hover;
    return hover;
};

// a name of a template, a global or a field of the entry of a form element
// selected by it, e.g. `group` or `group:name`, of letters of any language,
// digits and _, e.g. {größe}
const templateName = /\{([\p{L}\p{N}_]+(?::[\p{L}\p{N}_]+)?)\}/gu;

// the names of the globals in a column template, e.g. `values` and `share` of
// "{values}{share}", `group` of "{group:name}"
const templateRefs = column => typeof column == 'string' ?
    [...column.matchAll(templateName)].map(m => m[1].split(':')[0]) : [];

// unknown names are kept as they are
const fillTemplate = (column, names = {}) =>
    column.replace(templateName, (t, n) => Object.hasOwn(names, n) ? String(names[n]) : t);

// the names of the templates of a prepared definition: the globals and the
// fields of the selected entries of the form elements, e.g. `group:name` of
// the name of the entry of the global `group`
const templateNames = def => {
    // also as `globals.<name>`, e.g. of a global which a dim of the same name shadows
    const names = { ...def.globals, ...Object.fromEntries(Object.entries(def.globals ?? {}).map(([k, v]) => [`globals.${k}`, v])) };
    (def.formElements ?? []).forEach(e => {
        Object.entries(selectedEntry(def, e) ?? {}).filter(([, v]) => v === null || typeof v != 'object')
            .forEach(([k, v]) => names[`${e.ref}:${k}`] ??= v);
    });
    return names;
};

// a text of the definition with the values of the globals, e.g. a title or
// a name, other values are kept, e.g. undefined
const fillText = (text, globals) => typeof text == 'string' ? fillTemplate(text, globals) : text;

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => escapes[c]);

// a template of html, e.g. of the hover, with the values of `names` as text,
// e.g. {land.unit}, unknown names are kept
const fillHtml = (template, names) => template.replace(/\{([\p{L}\p{N}_.:-]+)\}/gu, (t, name) =>
    Object.hasOwn(names, name) && names[name] !== null && names[name] !== undefined ? escapeHtml(names[name]) : t);
