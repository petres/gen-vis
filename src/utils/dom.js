export { itemOf, namespaces, create, setAttr, getAttr, join, pointer, cubicInOut, animate, interrupt, interruptAll, finish, targetOf, onEnd };

import { interpolate, interpolateTransformSvg } from 'd3-interpolate';

// the elements of the charts without a framework: the keyed join of items to
// the children of an element (see join), the position of a pointer (see
// pointer) and the animations of attributes (see animate), the parts of
// d3-selection and d3-transition the package needs

// the namespaces of the prefixes of names of elements and attributes, as
// the ones of d3, e.g. `xlink:href`, other names are in the one of svg
const namespaces = {
    svg: 'http://www.w3.org/2000/svg',
    xhtml: 'http://www.w3.org/1999/xhtml',
    xlink: 'http://www.w3.org/1999/xlink',
    xml: 'http://www.w3.org/XML/1998/namespace',
    xmlns: 'http://www.w3.org/2000/xmlns/',
};

// the namespace and the local name of a name with a known prefix, e.g.
// `xlink:href`, null of other names, as in d3 `xmlns:` names keep their
// prefix
const qualified = name => {
    const i = name.indexOf(':');
    if (i < 0)
        return null;
    const prefix = name.slice(0, i);
    return Object.hasOwn(namespaces, prefix) ? { space: namespaces[prefix], local: prefix == 'xmlns' ? name : name.slice(i + 1) } : null;
};

// a new element of the name `tag`, of svg, or of the namespace of its
// prefix, e.g. `xhtml:div`
const create = tag => {
    const q = qualified(tag);
    return document.createElementNS(q?.space ?? namespaces.svg, q?.local ?? tag);
};

// the value of an attribute of an element, also of a name with a namespace,
// null without one
const getAttr = (node, name) => {
    const q = qualified(name);
    return q ? node.getAttributeNS(q.space, q.local) : node.getAttribute(name);
};

// an attribute of an element, also of a name with a namespace, e.g.
// `xlink:href`, null and undefined remove it
const setAttr = (node, name, value) => {
    const q = qualified(name);
    if (value === null || value === undefined)
        q ? node.removeAttributeNS(q.space, q.local) : node.removeAttribute(name);
    else
        q ? node.setAttributeNS(q.space, q.local, value) : node.setAttribute(name, value);
};

// the item of an element of a join, a symbol, so it is no property of the
// element which other code knows, e.g. not d3's `__data__`
const itemOf = Symbol('item');

// the elements which leave with an animation, they are not part of a join
// anymore, see exit of join
const leaving = Symbol('leaving');

/**
 * The elements of `items` in `parent`, a keyed join as the one of d3
 * (`selectChildren(select).data(items, key).join(create)`): the children of
 * `parent` of the join are the ones which match `select` (a selector, e.g.
 * `g.vis-group`, or a function of an element, all element children without
 * one), without the ones which leave (see `exit`). The element of an item is
 * the one of the same `key(item, i)` (by default its index), the key of an
 * element is the one of its item (`node[itemOf]`), elements of the same key
 * as one before are new ones. New elements are `create(item, i)` (or new
 * elements of the tag `create`), inserted before the element of the next
 * item which has one. The other elements are removed, or, if `exit(node)`
 * returns true, it removes them itself, e.g. with an animation (see
 * `remove` of animate), they leave the join at once. The elements are in
 * the order of the items (only the ones which are not in their place are
 * moved), each has its item as `node[itemOf]`, they are returned.
 */
const join = (parent, items, { select, key, create: make, exit } = {}) => {
    const matches = typeof select == 'function' ? select
        : select ? node => node.matches(select) : () => true;
    const nodes = [...parent.children].filter(node => !node[leaving] && matches(node));
    const n = items.length;
    const update = new Array(n);
    const exits = [];
    if (key) {
        const byKey = new Map();
        nodes.forEach((node, i) => {
            const k = key(node[itemOf], i);
            if (byKey.has(k))
                exits.push(node);
            else
                byKey.set(k, node);
        });
        items.forEach((item, i) => {
            const k = key(item, i);
            const node = byKey.get(k);
            if (node) {
                update[i] = node;
                byKey.delete(k);
            }
        });
        exits.push(...byKey.values());
    } else {
        nodes.forEach((node, i) => i < n ? update[i] = node : exits.push(node));
    }
    // the new elements before the element of the next item which has one
    const result = new Array(n);
    let next = null;
    for (let i = n - 1; i >= 0; i--) {
        if (update[i]) {
            next = update[i];
            result[i] = next;
        } else {
            const node = typeof make == 'function' ? make(items[i], i) : create(make ?? 'g');
            result[i] = parent.insertBefore(node, next);
        }
    }
    exits.forEach(node => {
        if (exit?.(node))
            node[leaving] = true;
        else
            node.remove();
    });
    // in the order of the items, as d3's order, the last one stays in its place
    for (let i = n - 1, after = result[i]; --i >= 0;) {
        const node = result[i];
        if (node.compareDocumentPosition(after) ^ 4)
            after.parentNode.insertBefore(node, after);
        after = node;
    }
    result.forEach((node, i) => node[itemOf] = items[i]);
    return result;
};

/**
 * The position of a pointer event, e.g. of a mouse or a touch, in the
 * coordinates of `node` (by default the target of its listener), as the one of
 * d3: of an svg element its user coordinates, of another element the pixels
 * from its top left corner, without one the ones of the page. An event of
 * another event (`sourceEvent`) is the one of its source.
 */
const pointer = (event, node) => {
    while (event.sourceEvent)
        event = event.sourceEvent;
    node ??= event.currentTarget;
    if (node) {
        const svg = node.ownerSVGElement || node;
        if (svg.createSVGPoint) {
            let point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            point = point.matrixTransform(node.getScreenCTM().inverse());
            return [point.x, point.y];
        }
        if (node.getBoundingClientRect) {
            const rect = node.getBoundingClientRect();
            return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
        }
    }
    return [event.pageX, event.pageY];
};

// the easing of the animations, slow at the start and at the end, the
// default one of d3-transition
const cubicInOut = t => ((t *= 2) <= 1 ? t*t*t : (t -= 2)*t*t + 2)/2;

// the animations of an element by their channel, see animate
const animations = Symbol('animations');
// the running animations, moved by one loop of frames
const running = new Set();
let frame = null;

const now = () => globalThis.performance?.now() ?? Date.now();

// the next frame of the browser, without one (e.g. jsdom without a visual
// mode) in 16 milliseconds
const nextFrame = fn => typeof globalThis.requestAnimationFrame == 'function'
    ? globalThis.requestAnimationFrame(fn)
    : setTimeout(fn, 16);

const schedule = () => {
    frame ??= nextFrame(tick);
};

// a frame: the attributes of the animations at their positions of now, the
// ones at their end are ended, see end, the functions of their end are
// called after all attributes of the frame are set
const tick = () => {
    frame = null;
    const time = now();
    const ended = [];
    [...running].forEach(a => {
        const t = Math.min(1, (time - a.start)/a.duration);
        if (t >= 1)
            ended.push(a);
        else {
            const e = a.ease(t);
            a.tweens.forEach(([name, i]) => setAttr(a.node, name, i(e)));
        }
    });
    ended.forEach(a => end(a, true));
    if (running.size > 0)
        schedule();
};

// an animation leaves its element and the loop, of `done` at its end
// values, its element removed with a `remove`, the functions of its end are
// called; else where it is, an element of a `remove` removed anyway
const end = (a, done) => {
    if (a.node[animations]?.[a.channel] !== a)
        return;
    delete a.node[animations][a.channel];
    running.delete(a);
    if (done)
        Object.entries(a.target).forEach(([name, value]) => setAttr(a.node, name, value));
    if (a.remove)
        a.node.remove();
    if (done)
        a.ends.forEach(fn => fn(a.node));
};

/**
 * Moves the attributes of `node` from their values to the ones of `attrs`
 * (names, also with a namespace, e.g. `xlink:href`, and values) in
 * `duration` milliseconds (250 by default) with `ease` (by default
 * cubicInOut, as in d3-transition), interpolated as by d3-transition: a
 * `transform` by interpolateTransformSvg, other values by interpolate of
 * d3-interpolate (numbers, colors and the numbers in texts). The values
 * before are the ones of now, null values and the ones of attributes
 * without a value before are set at once. The end values are the ones of
 * `attrs`, as they are, see targetOf. The animations of the channels of an
 * element are independent of each other (`channel`, by default `vis`), a new
 * one of the same channel stops the one before where it is (see interrupt).
 * With `remove` the element is removed at the end, e.g. one which leaves a
 * join (see exit of join), it is removed when the animation is stopped,
 * too. A duration of 0 sets the values at once (and removes the element).
 * All animations move in one loop of frames of the browser, see tick.
 */
const animate = (node, attrs, { channel = 'vis', duration = 250, ease = cubicInOut, remove = false } = {}) => {
    interrupt(node, channel);
    const target = {};
    const tweens = [];
    for (const name in attrs) {
        const value = attrs[name];
        const before = getAttr(node, name);
        if (value === null || value === undefined || before === null || !(duration > 0)) {
            setAttr(node, name, value);
            continue;
        }
        target[name] = value;
        if (before !== String(value))
            tweens.push([name, (name == 'transform' ? interpolateTransformSvg : interpolate)(before, value)]);
    }
    if (!(duration > 0)) {
        if (remove)
            node.remove();
        return;
    }
    const a = { node, channel, target, tweens, start: now(), duration, ease, remove, ends: [] };
    (node[animations] ??= {})[channel] = a;
    running.add(a);
    schedule();
};

// the animations of an element of `channel`, of all channels without one
const animationsOf = (node, channel) => !node[animations] ? []
    : channel === undefined ? Object.values(node[animations])
    : node[animations][channel] ? [node[animations][channel]] : [];

// stops the animation of `channel` of an element (all without a channel)
// where it is, without the functions of its end, an element of a `remove`
// is removed
const interrupt = (node, channel) => animationsOf(node, channel).forEach(a => end(a, false));

// stops the animations of the element `root` and of the elements in it,
// e.g. of a chart which is removed, see interrupt
const interruptAll = root => [...running].filter(a => root.contains(a.node)).forEach(a => end(a, false));

// the animation of `channel` of an element (all without a channel) is at
// its end at once, its values set (and its element removed with a
// `remove`), the functions of its end are called
const finish = (node, channel) => animationsOf(node, channel).forEach(a => end(a, true));

// the end values of the animation of `channel` of an element, e.g. to keep
// them while another one replaces it, null without one
const targetOf = (node, channel = 'vis') => {
    const a = node[animations]?.[channel];
    return a ? { ...a.target } : null;
};

// `fn(node)` at the end of the animation of `channel` of an element (also
// of finish, not of interrupt), false without one
const onEnd = (node, channel, fn) => {
    const a = node[animations]?.[channel];
    if (!a)
        return false;
    a.ends.push(fn);
    return true;
};
