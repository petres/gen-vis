export { curves, setProps, setAttrs, groupAttrs, groupKey, rowOf, keyOf, elementOf, directOf, childrenOf, shapeOf, replaceRow, drawLayer, motion, withMotion, reducedMotion, dataAttribute, fitText };

import * as d3 from "@/utils/d3";
import { animate, create, finish as finishAnimation, interrupt, itemOf, join, scriptAttr, setAttr, targetOf } from "@/utils/dom";

// (the other curves are loaded for the definitions which name one, see loadMore of utils/d3.js)
// the interpolations of the paths and areas between their points, `monotoneX`
// is smooth without overshooting the values, e.g. for monthly data
const curves = {
    linear: d3.curveLinear,
    monotoneX: d3.curveMonotoneX,
    step: d3.curveStep,
    stepBefore: d3.curveStepBefore,
    stepAfter: d3.curveStepAfter,
    // closed, e.g. around the circle of polar plots
    linearClosed: d3.curveLinearClosed,
};

// the props whose values are styles of an element, not attributes, values
// with css variables, e.g. "var(--gen-vis-grid-color)", svg attributes do not
// know them, the names of data are attributes; custom properties, e.g. the
// ones of the highlight of a group (`--vis-hl-stroke-width`), are styles
const styles = Symbol('styles');
const isStyle = (k, v) => (k.startsWith('--') && v !== null && v !== undefined) || (typeof v == 'string' && v.includes('var(') && !/^data-/.test(k));

// the value of a prop of an element, a style or an attribute, null without one
const readValue = (node, k) => node[styles]?.has(k) ? node.style.getPropertyValue(k) : node.getAttribute(k);

// the value of a prop of an element at once, a value with a css variable as
// its style, another one as its attribute (without a style of it), null
// removes it, an attribute which runs script (see scriptAttr) is not set
const writeValue = (node, k, v) => {
    if (node[styles]?.has(k) && !isStyle(k, v)) {
        node.style.removeProperty(k);
        node[styles].delete(k);
    }
    if (v === null || v === undefined || scriptAttr(k, v, node.localName))
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
const finish = node => finishAnimation(node, 'vis');

// the transition of the elements of a draw in milliseconds, 0 without, see
// `transition` of the definition and comp/facet.js
const motion = { duration: 0 };

// the user prefers no motion, a setting of the system, the elements are at
// their values at once
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// the data attribute of a name of the definition, e.g. `data-global-land-name`
// of the global `landName` with the prefix `global-`, null for names which
// are no names of attributes, e.g. with a space
const dataAttribute = (name, prefix = '') => /^[A-Za-z][\w-]*$/.test(name)
    ? `data-${prefix}${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}` : null;
const withMotion = (duration, draw) => {
    motion.duration = duration;
    try {
        draw();
    } finally {
        motion.duration = 0;
    }
};

// the commands of a path without their numbers, e.g. "MLL" of a line of
// three points
const commands = d => d.replace(/[^a-df-zA-DF-Z]/g, '');

// the paths of a transition whose numbers can move from one to the other:
// of the same commands, e.g. not a line of another number of points, and
// without arcs, whose flags are no numbers between 0 and 1 (see shapeOf)
const samePath = (a, b) => !/[Aa]/.test(a + b) && commands(a) === commands(b);

// the shapes of an element by their attribute, the values of now (`now`,
// e.g. on the way of a transition) and of their end (`end`), see shapeOf
const shapes = Symbol('shapes');

// the values of props as the attributes of an element, `text` is its text,
// objects are nested props, e.g. `d` of a line, null removes an attribute,
// only the attributes which change are set, e.g. of an element of the draw
// before, as setting one costs the browser its style. With a transition the
// attributes an element has move to their values, e.g. of the draw before,
// new ones are set at once, a transition of the draw before stops where it
// is. The end values of a transition are the ones of its animation (see
// targetOf of utils/dom.js), see finish. Values with css variables are
// styles, set at once, see writeValue. A path (`d`) moves only to one of
// the same commands (see samePath), another one is set at once; an
// attribute with a shape (`shapeOf` of the values) moves by the values of
// its shape, e.g. the angles of an arc, and is built of the ones between.
const setProps = function(values) {
    const running = targetOf(this, 'vis') !== null;
    interrupt(this, 'vis');
    let moving = null;
    let tweens = null;
    const shaped = values[shapeOf];
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
            setAttr(this, k, v);
        } else if (v === null || v === undefined) {
            writeValue(this, k, null);
        } else {
            const value = String(v);
            const before = readValue(this, k);
            // the values of the shape of the draw before, of a transition
            // which was stopped the ones where it was
            const shape = shaped?.[k];
            const kept = shape && this[shapes]?.[k];
            const from = kept && (running ? kept.now : kept.end);
            if (shape)
                (this[shapes] ??= {})[k] = { now: shape.values, end: shape.values };
            if (before === value)
                continue;
            if (!(motion.duration > 0 && before !== null && !isStyle(k, value) && !this[styles]?.has(k)))
                writeValue(this, k, value);
            else if (shape && from) {
                const between = d3.interpolate(from, shape.values);
                const state = this[shapes][k];
                state.now = from;
                (tweens ??= {})[k] = t => shape.build(state.now = between(t));
                (moving ??= {})[k] = value;
            } else if (shape || (k == 'd' && !samePath(before, value)))
                writeValue(this, k, value);
            else
                (moving ??= {})[k] = value;
        }
    }
    if (moving)
        animate(this, moving, { channel: 'vis', duration: motion.duration, tweens });
};

// the attributes of the keys of the categories of a group, e.g. for the highlight
const groupAttrs = g => Object.fromEntries(Object.entries(g.categories).map(([dim, key]) => [`data-group-${dim}`, key]));

// the keys of the categories of the group of an element, e.g. for the
// highlight, and the custom properties of its highlight (`vars`, see
// highlightVars of utils/highlight.js)
const setGroupData = function(g) {
    Object.entries(g.categories).forEach(([dim, key]) => setAttr(this, `data-group-${dim}`, key));
    if (g.vars)
        Object.entries(g.vars).forEach(([k, v]) => {
            if (v === null)
                this.style.removeProperty(k);
            else if (this.style.getPropertyValue(k) !== v)
                this.style.setProperty(k, v);
        });
};

// the row of an element per row, a symbol, so it is not an attribute
const rowOf = Symbol('row');

// the key of the element of an item of a layer, its element, e.g. of the
// items of annotations, its attributes which are set at once and the items
// of its children, see drawLayer
const keyOf = Symbol('key');
const elementOf = Symbol('element');
const directOf = Symbol('direct');
// the shapes of attributes of an item which are built of numbers, by the
// name of the attribute: `{ values, build(values) }`, e.g. the angles and
// the radii of the path of an arc, a transition moves the numbers and
// builds the attribute of the ones between, see setProps
const shapeOf = Symbol('shape');
const childrenOf = Symbol('children');

// the key of a group of a mark, the keys of its categories, so an element
// of a group is the one of the same group of the draw before
const groupKey = g => JSON.stringify(Object.values(g.categories));

// the key of an element per row, the row, the rows of the data are the same
// objects in every draw, e.g. after a toggle of a legend
const ids = new WeakMap();
let id = 0;
const idOf = row => {
    if (!ids.has(row))
        ids.set(row, ++id);
    return ids.get(row);
};
const rowKey = v => idOf(v[rowOf]);

// a row which replaces the row `before` has its key, so its element is the
// one of the row before, e.g. a row of the data of a mark of another value
// of a global, see markRows of layout.js
const replaceRow = (before, row) => {
    ids.set(row, idOf(before));
    return row;
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
        children.forEach(child => drawItem.call(this.appendChild(create(child[elementOf])), child));
}

/**
 * Draws a layer of a mark (see `marks` of the mark types, marks/index.js)
 * into the group of the mark `parent`, an element, into the elements of the draw before (see join of utils/dom.js),
 * returns the elements of the items, an array:
 * - `groups`: an element `g.vis-group` per group (its `categories` are its
 *   data-group- attributes), in it an element `element` per item of its
 *   `items`, e.g. a circle per row, the ones of the same group and of the
 *   same `key(item)` (by default the row of the item) are the ones of the
 *   draw before
 * - `items`: an element per item directly in the group of the mark, e.g. a
 *   path per group of a line, `element` or the one of an item (`elementOf`),
 *   the ones of the same `key(item)` or index are the ones of the draw before
 * - `class`: a class of the group of the mark, e.g. `vis-features`
 * - `fit`: the texts with a `max-width` are cut or wrapped, also the ones
 *   in the elements, e.g. the labels of the ticks of an axis, see fitText
 * An item has the props of its element (see setProps, `text` is its text),
 * its row (`rowOf`, e.g. of the highlight of a row), the attributes which
 * are set at once (`directOf`) and the items of the elements in its element
 * (`childrenOf`, only of a new element, e.g. of the layers which are drawn
 * anew), an element has its item as `node[itemOf]` (see utils/dom.js), a
 * group its group. Null draws nothing.
 */
const drawLayer = (parent, layer) => {
    if (!layer)
        return null;
    if (layer.class)
        parent.classList.add(...layer.class.trim().split(/\s+/));
    // the elements of the layer, the ones of `element`, all without one
    const select = layer.element ?? undefined;
    const elements = layer.groups
        ? join(parent, layer.groups, { select: 'g.vis-group', key: groupKey, create: () => {
            const g = create('g');
            g.setAttribute('class', 'vis-group');
            return g;
        } }).flatMap(group => {
            setGroupData.call(group, group[itemOf]);
            return join(group, group[itemOf].items, { select, key: layer.key ?? rowKey, create: layer.element });
        })
        : join(parent, layer.items ?? [], { select, key: layer.key, create: layer.element ?? (item => create(item[elementOf])) });
    elements.forEach(node => drawItem.call(node, node[itemOf]));
    if (layer.fit) {
        elements.filter(node => node.hasAttribute('max-width'))
            .forEach(node => {
                const text = node[itemOf].text;
                fitText(node, text === null || text === undefined ? '' : String(text));
            });
        // the texts in the elements, e.g. the labels in the ticks of an axis
        elements.forEach(node => node.querySelectorAll('text[max-width]').forEach(t => fitText(t)));
    }
    return elements;
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
 * browser. The text is the one of `text`, e.g. of the props. The text of a
 * text along a path is the one of its textPath, which is kept, e.g. of a
 * curved label of a polar axis, it is cut, also with `wrap`, as lines of
 * tspans would leave the path.
 */
const fitText = (node, text) => {
    const max = parseFloat(node.getAttribute('max-width'));
    if (!(max > 0))
        return;
    const path = node.querySelector(':scope > textPath');
    // the element of the text, setting the text of the text element itself
    // would remove the textPath
    const inner = path ?? node;
    text ??= inner.textContent;
    if (path)
        node.querySelectorAll(':scope > title').forEach(t => t.remove());
    inner.textContent = text;
    if (textWidth(node) <= max)
        return;
    if (!path && node.getAttribute('text-overflow') == 'wrap') {
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
        inner.textContent = `${text.slice(0, mid).trimEnd()}…`;
        if (textWidth(node) <= max)
            lo = mid;
        else
            hi = mid - 1;
    }
    inner.textContent = `${text.slice(0, lo).trimEnd()}…`;
    node.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'title')).textContent = text;
};
