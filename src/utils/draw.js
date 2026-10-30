export { curves, setProps, setAttrs, groupAttrs, groupKey, highlighter, rowOf, keyOf, elementOf, directOf, childrenOf, drawLayer, motion, withMotion, fitText };

import * as d3 from "@/utils/d3";

// the interpolations of the paths and areas between their points, `monotoneX`
// is smooth without overshooting the values, e.g. for monthly data
const curves = {
    linear: d3.curveLinear,
    monotoneX: d3.curveMonotoneX,
    natural: d3.curveNatural,
    catmullRom: d3.curveCatmullRom,
    basis: d3.curveBasis,
    step: d3.curveStep,
    stepBefore: d3.curveStepBefore,
    stepAfter: d3.curveStepAfter,
    // closed, e.g. around the circle of polar plots
    linearClosed: d3.curveLinearClosed,
    catmullRomClosed: d3.curveCatmullRomClosed,
    basisClosed: d3.curveBasisClosed,
};

// the values of the attributes an element moves to with a transition, see setProps
const targets = Symbol('targets');

// the props whose values are styles of an element, not attributes, values
// with css variables, e.g. "var(--gen-vis-grid-color)", svg attributes do not
// know them, the names of the highlight and of data are attributes
const styles = Symbol('styles');
const isStyle = (k, v) => typeof v == 'string' && v.includes('var(') && !/^(highlight|others|default|data)-/.test(k);

// the value of a prop of an element, a style or an attribute, null without one
const readValue = (node, k) => node[styles]?.has(k) ? node.style.getPropertyValue(k) : node.getAttribute(k);

// the value of a prop of an element at once, a value with a css variable as
// its style, another one as its attribute (without a style of it), null
// removes it
const writeValue = (node, k, v) => {
    if (node[styles]?.has(k) && !isStyle(k, v)) {
        node.style.removeProperty(k);
        node[styles].delete(k);
    }
    if (v === null || v === undefined)
        node.removeAttribute(k);
    else if (isStyle(k, v)) {
        node.style.setProperty(k, v);
        node.removeAttribute(k);
        (node[styles] ??= new Set()).add(k);
    } else
        node.setAttribute(k, v);
};

// an element moving with a transition is at its end at once, e.g. before
// the values of its highlight replace its values, so it keeps the new ones
const finish = node => {
    if (!node[targets])
        return;
    if (node.__transition)
        d3.select(node).interrupt('vis');
    Object.entries(node[targets]).forEach(([k, v]) => writeValue(node, k, v));
    node[targets] = null;
};

// the transition of the elements of a draw in milliseconds, 0 without, see
// options.transition and Facet.vue
const motion = { duration: 0 };
const withMotion = (duration, draw) => {
    motion.duration = duration;
    try {
        draw();
    } finally {
        motion.duration = 0;
    }
};

// the values of props as the attributes of an element, `text` is its text,
// objects are nested props, e.g. `d` of a line, null removes an attribute,
// only the attributes which change are set, e.g. of an element of the draw
// before, as setting one costs the browser its style. With a transition the
// attributes an element has move to their values, e.g. of the draw before,
// new ones are set at once, a transition of the draw before stops where it
// is. The values of a transition are kept, see finish. Values with css
// variables are styles, set at once, see writeValue.
const setProps = function(values) {
    if (this.__transition)
        d3.select(this).interrupt('vis');
    this[targets] = null;
    let transition = null;
    for (const k in values) {
        const v = values[k];
        if (v !== null && (typeof v == 'object' || typeof v == 'function'))
            continue;
        if (k == "text") {
            const text = v === null || v === undefined ? '' : String(v);
            if (this.textContent !== text)
                this.textContent = text;
        } else if (k.includes(':')) {
            // a namespace, e.g. xlink:href
            d3.select(this).attr(k, v);
        } else if (v === null || v === undefined) {
            writeValue(this, k, null);
        } else {
            const value = String(v);
            const before = readValue(this, k);
            if (before === value)
                continue;
            if (motion.duration > 0 && before !== null && !isStyle(k, value) && !this[styles]?.has(k) && d3.hasTransitions(d3.select(this))) {
                (transition ??= d3.select(this).transition('vis').duration(motion.duration)).attr(k, value);
                (this[targets] ??= {})[k] = value;
            } else {
                writeValue(this, k, value);
            }
        }
    }
};

// the attributes of the keys of the categories of a group, e.g. for the highlight
const groupAttrs = g => Object.fromEntries(Object.entries(g.categories).map(([dim, key]) => [`data-group-${dim}`, key]));

// the keys of the categories of the group of an element, e.g. for the highlight
const setGroupData = function(g) {
    const element = d3.select(this);
    Object.entries(g.categories).forEach(([dim, key]) => element.attr(`data-group-${dim}`, key));
};

// the row of an element per row, a symbol, so it is not an attribute
const rowOf = Symbol('row');

// the key of the element of an item of a layer, its element, e.g. of the
// items of annotations, its attributes which are set at once and the items
// of its children, see drawLayer
const keyOf = Symbol('key');
const elementOf = Symbol('element');
const directOf = Symbol('direct');
const childrenOf = Symbol('children');

// the key of a group of a plot, the keys of its categories, so an element
// of a group is the one of the same group of the draw before
const groupKey = g => JSON.stringify(Object.values(g.categories));

// the key of an element per row, the row, the rows of the data are the same
// objects in every draw, e.g. after a toggle of a legend
const ids = new WeakMap();
let id = 0;
const rowKey = v => {
    const row = v[rowOf];
    if (!ids.has(row))
        ids.set(row, ++id);
    return ids.get(row);
};

// the attributes of an element at once, without a transition and without
// stopping one of the element, in their order, null removes one, objects and
// functions are left out, e.g. nested props, values with css variables are
// styles, see writeValue
const setAttrs = (node, attrs) => {
    for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || (typeof v != 'object' && typeof v != 'function'))
            writeValue(node, k, v);
    }
};

// the attributes of an item: the ones which are set at once (`directOf`), e.g.
// the path of a feature, then its props (see setProps), which move with the
// transition of the draw, the elements of its children (`childrenOf`) are
// appended to a new element, e.g. the line and the label of a tick
function drawItem(item) {
    const direct = item[directOf];
    if (direct)
        setAttrs(this, direct);
    setProps.call(this, item);
    const children = item[childrenOf];
    if (children && !this.hasChildNodes())
        children.forEach(child => drawItem.call(this.appendChild(document.createElementNS('http://www.w3.org/2000/svg', child[elementOf])), child));
}

/**
 * Draws a layer of a plot (see `marks` of the plot types, plots/index.js)
 * into the group of the plot `parent`, a d3 selection, into the elements of
 * the draw before, returns the elements of the items:
 * - `groups`: an element `g.vis-group` per group (its `categories` are its
 *   data-group- attributes), in it an element `element` per item of its
 *   `items`, e.g. a circle per row, the ones of the same group and of the
 *   same `key(item)` (by default the row of the item) are the ones of the
 *   draw before
 * - `items`: an element per item directly in the group of the plot, e.g. a
 *   path per group of a line, `element` or the one of an item (`elementOf`),
 *   the ones of the same `key(item)` or index are the ones of the draw before
 * - `class`: a class of the group of the plot, e.g. `vis-features`
 * - `fit`: the texts with a `max-width` are cut or wrapped, also the ones
 *   in the elements, e.g. the labels of the ticks of an axis, see fitText
 * An item has the props of its element (see setProps, `text` is its text),
 * its row (`rowOf`, e.g. of the highlight of a row), the attributes which
 * are set at once (`directOf`) and the items of the elements in its element
 * (`childrenOf`, only of a new element, e.g. of the layers which are drawn
 * anew). Null draws nothing.
 */
const drawLayer = (parent, layer) => {
    if (!layer)
        return null;
    if (layer.class)
        parent.classed(layer.class, true);
    const elements = layer.groups
        ? parent.selectChildren("g.vis-group")
            .data(layer.groups, groupKey)
            .join(enter => enter.append("g").attr("class", "vis-group"))
            .order()
            .each(setGroupData)
            .selectChildren(layer.element)
            .data(g => g.items, layer.key ?? rowKey)
            .join(layer.element)
        : parent.selectChildren(layer.element)
            .data(layer.items ?? [], layer.key)
            .join(layer.element ?? (enter => enter.append(item => document.createElementNS('http://www.w3.org/2000/svg', item[elementOf]))));
    elements.order().each(drawItem);
    if (layer.fit) {
        elements.filter(function() { return this.hasAttribute('max-width') })
            .each(function(item) { fitText(this, item.text === null || item.text === undefined ? '' : String(item.text)) });
        // the texts in the elements, e.g. the labels in the ticks of an axis
        elements.selectAll('text[max-width]').each(function() { fitText(this) });
    }
    return elements;
};

/**
 * The highlight of the elements of a facet: the highlight- props of the
 * plots replace the props of the elements of the categories of a row, e.g.
 * of the hover or of an entry of a legend, the others- props the ones of
 * the other elements of their plots while a highlight is shown, e.g. a
 * label which is hidden, their values are kept in default- attributes. With
 * `"highlight": "row"` only the element of the row is highlighted, e.g. the
 * segment of a stacked bar, if it has one. The groups of the plots (the
 * elements with the keys of their categories as data-group- attributes) and
 * their elements with highlight- and others- props are found once, at the
 * first highlight, so a highlight does not search the elements of the facet.
 * `nodeOf(plot)` is the element of a plot, the attributes move in `duration`
 * milliseconds to their values, if the transitions are loaded.
 */
// the values of the definition of the attributes of an element which the
// highlight changed, see highlighter
const originals = Symbol('originals');
// the values of the attributes of the transition of the highlight of an element
const pending = Symbol('pending');

const highlighter = (plotDefs, nodeOf, duration = 0) => {
    const plots = plotDefs.filter(p => p.highlightProps.length > 0 && p.categories.length > 0);
    const others = plotDefs.filter(p => p.othersProps?.length > 0);
    let index = null;
    let otherIndex = null;
    // the highlighted groups and the changed elements
    let groups = [];
    let elements = [];

    const build = () => plots.map(plot => {
        const node = nodeOf(plot);
        const attrs = plot.categories.map(c => `data-group-${c}`);
        return {
            plot,
            groups: node ? [...node.querySelectorAll('*')].filter(g => attrs.some(a => g.hasAttribute(a))).map(node => ({
                node,
                keys: Object.fromEntries(plot.categories.map((c, i) => [c, node.getAttribute(attrs[i])])),
                targets: null,
            })) : [],
        };
    });
    // the elements of the plots with others- props
    const buildOthers = () => others.map(plot => {
        const node = nodeOf(plot);
        return { plot, nodes: node ? [node, ...node.querySelectorAll('*')].filter(e => plot.othersProps.some(n => e.hasAttribute(`others-${n}`))) : [] };
    });

    // the path of a group or its elements per row with highlight- props, e.g. circles
    const targetsOf = (plot, group, dataEntry) => {
        group.targets ??= [group.node, ...group.node.querySelectorAll('*')]
            .filter(node => plot.highlightProps.some(n => node.hasAttribute(`highlight-${n}`)));
        if (plot.highlight != 'row')
            return group.targets;
        const rows = group.targets.filter(node => node.__data__?.[rowOf] === dataEntry);
        return rows.length > 0 ? rows : group.targets;
    };

    // without an empty class, so an element is the same as a new one
    const unclass = node => {
        node.classList.remove('vis-highlight');
        if (node.classList.length == 0)
            node.removeAttribute('class');
    };

    // the attributes of the elements of an update of the highlight, at once
    // or in one transition per element (one of an element would interrupt
    // the one before), of the attributes with a value before and after
    const apply = (targets, now) => targets.forEach((changes, node) => {
        const moving = !now && duration > 0 && d3.hasTransitions(d3.select(node));
        // the attributes of a transition of the element which is interrupted
        // move on to their values, e.g. its color back to its own while its
        // opacity is the one of the others
        const values = { ...node[pending], ...changes };
        if (node[pending]) {
            d3.select(node).interrupt('highlight');
            node[pending] = null;
        }
        let transition = null;
        Object.entries(values).forEach(([n, value]) => {
            // values with css variables at once, see writeValue
            if (moving && value !== null && !isStyle(n, value) && !node[styles]?.has(n) && node.getAttribute(n) !== null) {
                (transition ??= d3.select(node).transition('highlight').duration(duration)).attr(n, value);
                (node[pending] ??= {})[n] = value;
            } else
                writeValue(node, n, value);
        });
        transition?.on('end.pending', () => node[pending] = null);
        // the values of the definition are kept until they are back, e.g. if
        // the element is highlighted again while it moves back
        if (!changed.has(node)) {
            if (transition)
                transition.on('end.originals', () => {
                    if (!changed.has(node))
                        node[originals] = null;
                });
            else
                node[originals] = null;
        }
    });

    // the elements whose attributes are the ones of the highlight
    let changed = new Set();

    // the values of the props of `prefix` of an element, the ones of the
    // definition are kept, also as default- attributes
    const replace = (targets, node, props, prefix) => {
        finish(node);
        node[originals] ??= {};
        const values = targets.get(node) ?? {};
        props.forEach(n => {
            if (!Object.hasOwn(node[originals], n))
                node[originals][n] = readValue(node, n);
            if (node[originals][n] !== null)
                node.setAttribute(`default-${n}`, node[originals][n]);
            values[n] = node.getAttribute(`${prefix}-${n}`);
        });
        targets.set(node, values);
        changed.add(node);
        elements.push({ node, props });
    };

    // the groups and the elements of the plots of a highlight, see targetsOf
    const selection = dataEntry => {
        const found = { active: Boolean(dataEntry), groups: [], targets: [] };
        if (!dataEntry)
            return found;
        index ??= build();
        index.forEach(({ plot, groups: all }) => {
            // the values are compared as strings, as the ones of the attributes
            const conditions = plot.categories.filter(c => c in dataEntry).map(c => [c, String(dataEntry[c])]);
            if (conditions.length == 0)
                return;
            all.filter(g => conditions.every(([c, v]) => g.keys[c] === v)).forEach(g => {
                found.groups.push(g.node);
                found.targets.push([plot, targetsOf(plot, g, dataEntry)]);
            });
        });
        return found;
    };
    const same = (a, b) => a === b || (a.length == b.length && a.every((e, i) => e === b[i]));
    // the selection shown, a highlight of the same elements changes nothing,
    // e.g. of another row of the group of a line or of the points of a group
    let shown = { active: false, groups: [], targets: [] };
    const unchanged = next => next.active == shown.active && same(next.groups, shown.groups)
        && next.targets.length == shown.targets.length
        && next.targets.every(([plot, nodes], i) => plot === shown.targets[i][0] && same(nodes, shown.targets[i][1]));

    // `now` ends the highlight without a transition, e.g. before a draw
    return (dataEntry, now = false) => {
        const next = selection(dataEntry);
        if (!now && unchanged(next))
            return;
        shown = next;
        // the values of the definition of the elements changed before
        const targets = new Map();
        groups.forEach(unclass);
        elements.forEach(({ node, props }) => {
            unclass(node);
            const values = targets.get(node) ?? {};
            props.forEach(n => {
                values[n] = node[originals]?.[n] ?? null;
                node.removeAttribute(`default-${n}`);
            });
            targets.set(node, values);
        });
        groups = [];
        elements = [];
        changed = new Set();

        if (dataEntry) {
            const highlighted = new Set();
            next.groups.forEach(node => {
                node.classList.add('vis-highlight');
                node.parentNode.appendChild(node);
                groups.push(node);
            });
            next.targets.forEach(([plot, nodes]) => nodes.forEach(node => {
                node.classList.add('vis-highlight');
                highlighted.add(node);
                replace(targets, node, plot.highlightProps, 'highlight');
            }));
            // the other elements, e.g. a label of the last value which is hidden
            // while the one of another value is highlighted
            otherIndex ??= buildOthers();
            otherIndex.forEach(({ plot, nodes }) => nodes.filter(node => !highlighted.has(node))
                .forEach(node => replace(targets, node, plot.othersProps, 'others')));
        }
        apply(targets, now);
    };
};

// the width of a text in pixels, of the browser or, without layout (e.g.
// jsdom), estimated of its size
const textWidth = node => typeof node.getComputedTextLength == 'function'
    ? node.getComputedTextLength()
    : node.textContent.length*0.55*(parseFloat(node.getAttribute('font-size')) || 12);

/**
 * A text of an svg element in the width of its attribute `max-width`, cut
 * with an ellipsis (`text-overflow`, by default) or wrapped into lines of
 * tspans (`"text-overflow": "wrap"`) of the height `line-height` (in em,
 * 1.2 by default), the lines of a text with a middle or central baseline are
 * around it. A cut text has its full text as title, e.g. the tooltip of the
 * browser. The text is the one of `text`, e.g. of the props.
 */
const fitText = (node, text = node.textContent) => {
    const max = parseFloat(node.getAttribute('max-width'));
    if (!(max > 0))
        return;
    node.textContent = text;
    if (textWidth(node) <= max)
        return;
    if (node.getAttribute('text-overflow') == 'wrap') {
        const words = text.split(/\s+/).filter(Boolean);
        const lines = [];
        let line = [];
        for (const word of words) {
            node.textContent = [...line, word].join(' ');
            if (line.length > 0 && textWidth(node) > max) {
                lines.push(line.join(' '));
                line = [word];
            } else
                line.push(word);
        }
        lines.push(line.join(' '));
        node.textContent = '';
        const height = parseFloat(node.getAttribute('line-height')) || 1.2;
        const centered = ['middle', 'central'].includes(node.getAttribute('dominant-baseline'));
        lines.forEach((l, i) => {
            const tspan = node.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'tspan'));
            tspan.setAttribute('x', node.getAttribute('x') ?? 0);
            tspan.setAttribute('dy', `${+(i == 0 ? (centered ? -(lines.length - 1)*height/2 : 0) : height).toFixed(3)}em`);
            tspan.textContent = l;
        });
        return;
    }
    // the longest start with an ellipsis which fits
    let [lo, hi] = [0, text.length];
    while (lo < hi) {
        const mid = Math.ceil((lo + hi)/2);
        node.textContent = `${text.slice(0, mid).trimEnd()}…`;
        if (textWidth(node) <= max)
            lo = mid;
        else
            hi = mid - 1;
    }
    node.textContent = `${text.slice(0, lo).trimEnd()}…`;
    node.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'title')).textContent = text;
};
