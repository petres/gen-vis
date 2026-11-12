export { highlighter, highlightStyle, highlightVars, symbolVars };

import { itemOf } from '@/utils/dom';
import { rowOf } from '@/utils/draw';
import { evaluate, refNames } from '@/utils/expr';

/**
 * The highlight of the elements of a facet by classes and a stylesheet,
 * see docs/definition.md "Highlight and others" (`highlight`, `others` of marks): the elements of
 * the categories of a row (of the hover, of an entry of a legend or of the
 * page) get the class `vis-highlight` (their group, with `"mode": "row"`
 * only the element of the row, its group `vis-highlight-group`), the marks
 * of the facet `vis-highlighting` while a highlight is shown, and the
 * stylesheet of the chart (see highlightStyle) has the props of the
 * `highlight` of every mark as the styles of `.vis-highlight` and the ones
 * of `others` as the styles of the other elements of the mark. Props of the
 * categories, e.g. `"@color"`, are custom properties of the groups
 * (`--vis-hl-<prop>`, see highlightVars), set when the group is drawn, so a
 * category has its own values. Styles win over the attributes of the
 * elements, so the props of the definition come back when the class goes.
 */

// the name of the custom property of a prop of the highlight (`hl`) or the
// others (`ot`) of a mark
const varName = (kind, prop) => `--vis-${kind}-${prop}`;

// the props of texts whose numbers need a unit in a stylesheet (the ones
// of the geometry, e.g. r or stroke-width, take numbers as pixels)
const lengths = new Set(['font-size', 'letter-spacing', 'word-spacing']);

// a name of a prop of the stylesheet, e.g. stroke-width (no selector or
// declaration of its own, see highlightStyle)
const cssName = n => /^-{0,2}[a-z][a-z0-9-]*$/i.test(n);

// a value of the stylesheet which would end the declaration or the rule,
// open a comment or a string, or load something (a url other than the one
// of an element of the svg, e.g. url(#gradient))
const unsafeValue = v => /[;{}<>"'\\@]|\/\*|\*\/|[\u0000-\u001f]/.test(v)
    || /(?:image|image-set|element|cross-fade|expression|src)\s*\(/i.test(v)
    || /url\s*\((?!\s*#[\w-]+\s*\))/i.test(v);

// the value of a prop `n` in the stylesheet, none of an unsafe value (see
// unsafeValue), numbers of lengths of texts in pixels
const cssValue = (v, n) => v === null || v === undefined ? null
    : typeof v == 'number' ? (lengths.has(n) ? `${v}px` : String(v)) : typeof v == 'string' && !unsafeValue(v) ? v : null;

// the value of a prop which is the same for all groups of the mark, e.g.
// 3 or "black", undefined of one of the categories or the rows, e.g. "@color"
const fixed = v => refNames(v).length == 0 ? evaluate(v, {}) : undefined;

// the names of the props of the highlight and the others of a mark whose
// values are the ones of the groups, see highlightVars
const varNames = mark => [
    ...mark.highlightProps.filter(n => fixed(mark.highlight[n]) === undefined).map(n => ['hl', n, mark.highlight[n]]),
    ...mark.othersProps.filter(n => fixed(mark.others[n]) === undefined).map(n => ['ot', n, mark.others[n]]),
];

/**
 * The custom properties of a group of a mark (see markGroups of layout.js):
 * the values of the props of the highlight and the others which are the
 * ones of the categories of the group, e.g. `"@color"` or `"@weight"`, of
 * its first row, `bound(value)` is the function of the row of a value.
 */
const highlightVars = (mark, bound, row) => {
    const names = varNames(mark);
    if (names.length == 0)
        return null;
    return Object.fromEntries(names.map(([kind, n, value]) => [varName(kind, n), cssValue(bound(value)(row), n)]));
};

/**
 * The custom properties of an element of a symbol of a legend (see
 * drawSymbol of comp/legend.js): the values of its props of the highlight
 * (`highlight`, see symbolHighlight of utils/def.js) which are the ones of
 * the category, e.g. "@color", of `scope`, the props of the category (and
 * the globals). A value of the rows, e.g. "=@y > 1 ? 4 : 2", has none (the
 * symbol keeps its prop), a symbol is of no row.
 */
const symbolVars = (highlight, scope) => Object.fromEntries(Object.entries(highlight ?? {})
    .filter(([, v]) => fixed(v) === undefined)
    .map(([n, v]) => [varName('hl', n), refNames(v).every(r => r.startsWith('globals.') || scope?.[r.split(':')[0]] !== undefined) ? cssValue(evaluate(v, scope), n) : null]));

// the selector of the attribute of the mark, its id quoted
const markSelector = id => `[data-mark="${String(id).replace(/["\\]/g, '\\$&')}"]`;
// the props of the highlight of the symbols, see symbolHighlight of utils/def.js
const symbolProps = new Set(['fill', 'fill-opacity', 'opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity']);
const quoted = id => `"${String(id).replace(/["\\]/g, '\\$&')}"`;

// the declarations of the props of a mark: the values which are the same
// for all groups as they are, the others as their custom properties
const declarations = (kind, names, values) => names.map(n => {
    const v = fixed(values[n]);
    const css = v === undefined ? `var(${varName(kind, n)})` : cssValue(v, n);
    return css === null ? null : `${n}: ${css}`;
}).filter(Boolean).join('; ');

// the props of the highlight or the others (`part`) of a mark which the
// stylesheet has: names of css (see cssName) and safe values (see
// unsafeValue), the others with a `warn(mark, message)`
const usable = (mark, part, warn) => mark[`${part}Props`].filter(n => {
    const v = fixed(mark[part][n]);
    const message = !cssName(n) ? `${part}: "${n}" is no name of a property of css, it is left out`
        : typeof v == 'string' && unsafeValue(v) ? `${part}.${n}: ${JSON.stringify(v)} is no value gen-vis writes into its stylesheet (it has no ;{}<>, quotes, backslashes, @, comments or urls other than url(#id)), it is left out`
        : null;
    if (message)
        warn?.(mark, message);
    return !message;
});

/**
 * The stylesheet of the highlights of the marks of a definition (a text),
 * in `scope` (the selector of the root of the chart, e.g. `.vis[data-vis="3"]`):
 * the elements of a highlight (`.vis-highlight` and the elements in it, not
 * the groups, so the values are not applied twice, e.g. an opacity) have
 * the props of `highlight`, the other elements of the marks the ones of
 * `others` while one is shown (`.vis-highlighting`), the props move in
 * `transition` milliseconds (`highlight.transition`). Props which
 * are no css (see usable) are left out, with `warn(mark, message)`.
 */
const highlightStyle = (marks, { scope = '', transition = 0, warn = null } = {}) => {
    const rules = [];
    const leaves = '*:not(g)';
    marks = marks.map(p => ({ ...p, highlightProps: usable(p, 'highlight', warn), othersProps: usable(p, 'others', warn) }));
    marks.forEach(p => {
        const selector = `${scope} ${markSelector(p.id)}`;
        if (p.highlightProps.length > 0) {
            const css = declarations('hl', p.highlightProps, p.highlight);
            if (css)
                rules.push(`${selector} .vis-highlight${leaves.slice(1)}, ${selector} .vis-highlight ${leaves} { ${css}; }`);
            // the symbols of the mark of the highlighted entry of a legend and
            // of the nearest row of the hover (their elements have only the
            // props of the highlight they have, see symbolHighlight)
            const symbol = `[data-symbol-of=${quoted(p.id)}]`;
            const own = declarations('hl', p.highlightProps.filter(n => symbolProps.has(n)), p.highlight);
            if (own)
                rules.push(`${scope} .vis-legend-highlight ${symbol}, ${scope} .vis-hover .vis-nearest ${symbol} { ${own}; }`);
        }
        if (p.othersProps.length > 0) {
            const css = declarations('ot', p.othersProps, p.others);
            if (css)
                rules.push(`${scope} .vis-highlighting ${markSelector(p.id)} ${leaves}:not(.vis-highlight):not(.vis-highlight *) { ${css}; }`);
        }
    });
    if (rules.length > 0 && transition > 0) {
        const props = [...new Set(marks.flatMap(p => [...p.highlightProps, ...p.othersProps]))];
        rules.push(`${scope} [data-mark] ${leaves} { transition-property: ${props.join(', ')}; transition-duration: ${transition}ms; }`);
        rules.push(`@media (prefers-reduced-motion: reduce) { ${scope} [data-mark] ${leaves} { transition-duration: 0s; } }`);
    }
    return rules.join('\n');
};

// without an empty class, so an element is the same as a new one
const unclass = (node, name) => {
    node.classList.remove(name);
    if (node.classList.length == 0)
        node.removeAttribute('class');
};

// the elements in `node` per row, in their order (the index is built once
// per draw, at the first highlight, not per change of the hover)
const rowIndex = node => {
    const index = new Map();
    node.querySelectorAll('*').forEach(n => {
        const row = n[itemOf]?.[rowOf];
        if (row !== undefined)
            index.get(row)?.push(n) ?? index.set(row, [n]);
    });
    return index;
};

/**
 * The highlight of the elements of a facet, see above: `markDefs` are the
 * marks of the definition, `nodeOf(mark)` the element of a mark, `inner`
 * the element of the marks of the facet (it gets `vis-highlighting`).
 * Returns `highlight(dataEntry, now)`: the elements of the categories of
 * the row `dataEntry` (values of the dims of the marks' `by`) are
 * highlighted, null ends it; the groups of the marks are found once, at the
 * first highlight. A highlight of the same elements changes nothing.
 */
const highlighter = (markDefs, nodeOf, inner) => {
    // (a mark without `by` highlights the elements of the row, e.g. a bar)
    const marks = markDefs.filter(p => p.highlightProps.length > 0);
    let index = null;

    const build = () => marks.map(mark => {
        const node = nodeOf(mark);
        const attrs = mark.by.map(c => `data-group-${c}`);
        return {
            mark,
            node,
            // the groups of the mark and the elements per group, e.g. the path of a line
            groups: node && attrs.length > 0 ? [...node.querySelectorAll('*')].filter(g => attrs.some(a => g.hasAttribute(a))).map(node => ({
                node,
                keys: Object.fromEntries(mark.by.map((c, i) => [c, node.getAttribute(attrs[i])])),
            })) : [],
            // of a mark without groups its elements per row, e.g. the bars
            rows: node && mark.by.length == 0 ? rowIndex(node) : null,
        };
    });

    // the elements of a highlight of a group: the group, with `"mode": "row"`
    // the elements of the row, the group if it has none of the row
    const targetsOf = (mark, group, dataEntry) => {
        if (mark.highlight?.mode != 'row')
            return [group.node];
        const rows = [...group.node.querySelectorAll('*')].filter(node => node[itemOf]?.[rowOf] === dataEntry);
        return rows.length > 0 ? rows : [group.node];
    };

    // the groups and the elements of the marks of a highlight
    const selection = dataEntry => {
        const found = { active: Boolean(dataEntry), groups: [], targets: [] };
        if (!dataEntry)
            return found;
        index ??= build();
        index.forEach(({ mark, groups: all, rows }) => {
            // a mark without groups: the elements of the row, e.g. the bar under the pointer
            if (mark.by.length == 0) {
                // not the ones removed since, e.g. at the end of their exit
                (rows?.get(dataEntry) ?? []).filter(n => n.isConnected).forEach(n => {
                    found.targets.push(n);
                    found.groups.push(n.closest('g.vis-group') ?? n);
                });
                return;
            }
            // the values are compared as strings, as the ones of the attributes
            const conditions = mark.by.filter(c => c in dataEntry).map(c => [c, String(dataEntry[c])]);
            if (conditions.length == 0)
                return;
            all.filter(g => conditions.every(([c, v]) => g.keys[c] === v)).forEach(g => {
                found.groups.push(g.node);
                found.targets.push(...targetsOf(mark, g, dataEntry));
            });
        });
        return found;
    };

    // the groups of a highlight after the other ones of their parent, in
    // their order, unless they are there already, e.g. of the highlight
    // before, so a move of the pointer does not move the elements
    const raise = list => {
        const byParent = new Map();
        list.forEach(node => byParent.set(node.parentNode, [...(byParent.get(node.parentNode) ?? []), node]));
        byParent.forEach((nodes, parent) => {
            if (!nodes.every((node, i) => node.nextSibling === (nodes[i + 1] ?? null)))
                nodes.forEach(node => parent.appendChild(node));
        });
    };

    // the elements and the groups marked
    let marked = new Set();
    let groups = new Set();
    let active = false;

    return (dataEntry, now = false) => {
        const next = selection(dataEntry);
        const targets = new Set(next.targets);
        const nextGroups = new Set(next.groups.filter(g => !targets.has(g)));
        marked.forEach(node => {
            if (!targets.has(node))
                unclass(node, 'vis-highlight');
        });
        groups.forEach(node => {
            if (!nextGroups.has(node))
                unclass(node, 'vis-highlight-group');
        });
        // only the elements which are not marked yet, a class set again is a change of the element
        targets.forEach(node => {
            if (!node.classList.contains('vis-highlight'))
                node.classList.add('vis-highlight');
        });
        nextGroups.forEach(node => {
            if (!node.classList.contains('vis-highlight-group'))
                node.classList.add('vis-highlight-group');
        });
        if (next.active !== active) {
            active = next.active;
            if (active)
                inner.classList.add('vis-highlighting');
            else
                unclass(inner, 'vis-highlighting');
        }
        marked = targets;
        groups = nextGroups;
        if (now)
            next.groups.forEach(node => node.parentNode.appendChild(node));
        else
            raise(next.groups);
    };
};
