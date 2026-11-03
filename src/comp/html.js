export { el, patch, setStyle, setText, setHtml, display, slotNodes, place, emitter };

// the html elements of the visualisation without a framework: an element
// with its attributes (el), the attributes of an element patched (patch),
// the texts and the content of the slots, see README "Events and slots"

// the attributes set by patch, so the ones which are not given anymore are removed
const patched = Symbol('patched');

// the attributes of html which are on or off, an empty value or none
const booleans = new Set(['hidden', 'disabled', 'checked', 'selected']);

// a property of the styles, `null` and `undefined` remove it, the css
// variables by their name, the others also in camel case, e.g. `minHeight`
const setProperty = (style, name, value) => {
    value = value === null || value === undefined ? '' : String(value);
    if (name.includes('-'))
        style.setProperty(name, value);
    else
        style[name] = value;
};

/**
 * The styles of an element: a string is all of them (`cssText`), an object
 * the properties by their names (the ones of the object before which it
 * does not have anymore are removed), null none.
 */
const setStyle = (node, style, before) => {
    if (typeof style == 'string') {
        if (before !== style)
            node.style.cssText = style;
        return;
    }
    if (before && typeof before == 'object')
        Object.keys(before).filter(k => !style || !(k in style)).forEach(k => setProperty(node.style, k, null));
    else if (typeof before == 'string' && !style)
        node.removeAttribute('style');
    Object.entries(style ?? {}).forEach(([k, v]) => setProperty(node.style, k, v));
};

/**
 * The attributes of an element in the order of `attrs`: a new one is added
 * after the others, one of the same value is kept where it is, null and
 * undefined remove it, as the attributes given before which `attrs` does
 * not have. `class` is a string, `style` see setStyle, `hidden`,
 * `checked`, `selected` and `disabled` are on or off, `checked`,
 * `selected` and `value` are also the properties of form elements (`value`
 * last), false is "false" of the others, e.g. of `data-` attributes.
 */
const patch = (node, attrs) => {
    const before = node[patched] ?? null;
    let value = undefined;
    for (const name in attrs) {
        const v = attrs[name];
        if (name == 'value') {
            value = v;
            continue;
        }
        if (name == 'style')
            setStyle(node, v, before?.style);
        else if (name == 'checked' || name == 'selected') {
            node[name] = Boolean(v);
            toggle(node, name, Boolean(v));
        } else if (booleans.has(name))
            toggle(node, name, v !== null && v !== undefined && v !== false);
        else
            set(node, name, v);
    }
    if ('value' in attrs) {
        const text = value === null || value === undefined ? '' : String(value);
        if (node.value !== text)
            node.value = text;
        set(node, 'value', value);
    }
    if (before)
        Object.keys(before).filter(k => !(k in attrs)).forEach(k => k == 'style' ? setStyle(node, null, before.style) : node.removeAttribute(k));
    node[patched] = attrs;
    return node;
};

const set = (node, name, v) => {
    if (v === null || v === undefined)
        node.removeAttribute(name);
    else if (node.getAttribute(name) !== String(v))
        node.setAttribute(name, v);
};

const toggle = (node, name, on) => {
    if (!on)
        node.removeAttribute(name);
    else if (!node.hasAttribute(name))
        node.setAttribute(name, '');
};

// the text of a value as Vue shows it, nothing of null and undefined, an
// object as JSON
const display = v => v === null || v === undefined ? '' : typeof v == 'object' ? JSON.stringify(v, null, 2) : String(v);

// the text of an element, only set if it differs
const setText = (node, v) => {
    const text = display(v);
    if (node.textContent !== text)
        node.textContent = text;
    return node;
};

// html as the content of an element, e.g. of the definition, only set if it differs
const setHtml = (node, html) => {
    html = html === null || html === undefined ? '' : String(html);
    if (node.innerHTML !== html)
        node.innerHTML = html;
    return node;
};

/**
 * A new html element `tag` with the attributes `attrs` (see patch) and the
 * children, nodes or texts.
 */
const el = (tag, attrs = null, ...children) => {
    const node = document.createElement(tag);
    if (children.length)
        node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
    if (attrs)
        patch(node, attrs);
    return node;
};

// the nodes of the result of a slot, a node (e.g. a fragment), a text or
// a list of them, see README "Events and slots"
const slotNodes = result => [result].flat(Infinity)
    .filter(r => r !== null && r !== undefined && r !== false)
    .flatMap(r => r instanceof DocumentFragment ? [...r.childNodes] : [r instanceof Node ? r : document.createTextNode(String(r))]);

// `node` in `parent` before `before` (at the end without one), only moved
// if it is not there yet
const place = (parent, node, before = null) => {
    if (node.parentNode !== parent || node.nextSibling !== before)
        parent.insertBefore(node, before);
    return node;
};

// the listeners of events by their name, see on, off and emit of createGenVis
const emitter = () => {
    const listeners = new Map();
    return {
        on(name, fn) {
            if (!listeners.has(name))
                listeners.set(name, new Set());
            listeners.get(name).add(fn);
        },
        off(name, fn) {
            if (fn)
                listeners.get(name)?.delete(fn);
            else
                listeners.delete(name);
        },
        emit(name, ...args) {
            [...(listeners.get(name) ?? [])].forEach(fn => fn(...args));
        },
        clear() { listeners.clear(); },
    };
};
