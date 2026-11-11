export { el, patch, setText, setHtml, cleanHtml, slotNodes, takeRange, place, emitter };

import { scriptAttr } from "@/utils/dom";

// the html elements of the visualisation without a framework: an element
// with its attributes (el), the attributes of an element patched (patch),
// the texts and the content of the slots, see docs/usage.md "Events and slots"

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
 * `selected` and `value` are also the properties of controls (`value`
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

// (an attribute which runs script, e.g. onclick of the props of a legend, is not set)
const set = (node, name, v) => {
    if (v === null || v === undefined || scriptAttr(name, v))
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

// the tags of the html of a definition (the footer, the templates of the
// hover: texts, links, tables and lists), the attributes of all of them and
// the ones of some tags, e.g. links; the elements of `dropped` are removed
// with their content, the ones of other tags without, their texts stay
const tags = new Set(['a', 'b', 'i', 'em', 'strong', 'u', 's', 'br', 'span', 'sub', 'sup', 'small', 'code', 'p', 'div',
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'ul', 'ol', 'li']);
const attributes = new Set(['title', 'class', 'style']);
const cellAttributes = new Set(['colspan', 'rowspan']);
const tagAttributes = {
    a: new Set(['href', 'target', 'rel']),
    td: cellAttributes,
    th: new Set([...cellAttributes, 'scope']),
    col: new Set(['span']),
    colgroup: new Set(['span']),
    ol: new Set(['start', 'reversed']),
};
const dropped = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript', 'textarea', 'title', 'select', 'svg', 'math']);

// the properties of the styles of the html of a definition (of the text,
// the box of an element and the grid or flex of its children, not its
// position, nothing loaded), as the browser reads them, e.g. the longhands
// of `margin`
const styleProperty = new RegExp(`^(${['color', 'background-color', 'opacity', 'display', 'vertical-align', 'line-height', 'letter-spacing', 'word-spacing',
    'white-space(-collapse)?', 'font(-[a-z-]+)?', 'text-[a-z-]+', '(margin|padding)(-[a-z-]+)?', 'border(?!-image)(-[a-z-]+)?', '(max-|min-)?(width|height)',
    '(column-|row-)?gap', 'grid(-[a-z-]+)?', 'flex(-[a-z-]+)?', 'order', '(justify|align)-(content|items|self)', 'overflow-wrap', 'word-break', 'hyphens'].join('|')})$`);
const loads = /url\(|image\(|image-set\(|element\(|expression|@import|\\/i;

// a link of http(s), mailto or a relative one, not of javascript: or data:
const safeUrl = url => {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(String(url).replace(/[\u0000-\u0020]/g, ''));
    return !scheme || ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase());
};

// the attributes of an element of the html of a definition: the ones of
// `attributes` and of its tag (tagAttributes), styles of styleProperty, a
// link with a target opens without access to the page (rel="noopener")
const cleanAttributes = e => {
    const link = e.localName == 'a';
    const own = tagAttributes[e.localName];
    [...e.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        if (!(attributes.has(name) || own?.has(name)) || (name == 'href' && !safeUrl(a.value)))
            e.removeAttribute(a.name);
    });
    if (e.hasAttribute('style')) {
        const style = e.style;
        Array.from({ length: style.length }, (_, i) => style.item(i)).filter(p => !styleProperty.test(p) || loads.test(style.getPropertyValue(p))).forEach(p => style.removeProperty(p));
        if (style.length == 0)
            e.removeAttribute('style');
    }
    if (link && e.hasAttribute('target')) {
        const rel = new Set((e.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        e.setAttribute('rel', [...rel].join(' '));
    }
};

// the children of a node of the html of a definition cleaned, see tags
const cleanNodes = parent => [...parent.childNodes].forEach(n => {
    if (n.nodeType == Node.TEXT_NODE)
        return;
    if (n.nodeType != Node.ELEMENT_NODE || dropped.has(n.localName) || n.namespaceURI != 'http://www.w3.org/1999/xhtml') {
        n.remove();
        return;
    }
    cleanNodes(n);
    if (tags.has(n.localName))
        cleanAttributes(n);
    else
        n.replaceWith(...n.childNodes);
});

/**
 * The html of a definition (e.g. the footer or the templates of the hover)
 * in a template, parsed without running or loading anything (the content of
 * a template is inert, e.g. an image of `<img onerror>` is not loaded), only
 * the elements of `tags` and their safe attributes, see cleanNodes.
 */
const parsed = html => {
    const template = document.createElement('template');
    template.innerHTML = html;
    cleanNodes(template.content);
    return template;
};

// the html of a definition, cleaned (see parsed), a text, e.g. the footer
// of a slot of the page
const cleanHtml = html => html === null || html === undefined || html === '' ? '' : parsed(String(html)).innerHTML;

// html of the definition as the content of an element, cleaned (see
// parsed), only set if it differs
const setHtml = (node, html) => {
    const template = parsed(html === null || html === undefined ? '' : String(html));
    if (node.innerHTML !== template.innerHTML)
        node.replaceChildren(document.importNode(template.content, true));
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
// a list of them, see docs/usage.md "Events and slots"
const slotNodes = result => [result].flat(Infinity)
    .filter(r => r !== null && r !== undefined && r !== false)
    .flatMap(r => r instanceof DocumentFragment ? [...r.childNodes] : [r instanceof Node ? r : document.createTextNode(String(r))]);

// the nodes from `first` to `last` (its next siblings) in a fragment of
// their own, e.g. the ones of a slot removed from the page, they stay
// together, so Vue can remove the ones it drew, see vue-adapter.js
const takeRange = (first, last) => {
    const fragment = document.createDocumentFragment();
    let node = first;
    while (node) {
        const next = node === last ? null : node.nextSibling;
        fragment.appendChild(node);
        node = next;
    }
    return fragment;
};

// `node` in `parent` before `before` (at the end without one), only moved
// if it is not there yet
const place = (parent, node, before = null) => {
    if (node.parentNode !== parent || node.nextSibling !== before)
        parent.insertBefore(node, before);
    return node;
};

// an error of a listener of the page is reported as an uncaught one (the
// console, window.onerror), not thrown into the visualisation
const report = error => typeof reportError == 'function' ? reportError(error) : console.error(error);

// the listeners of events by their name, see on, off and emit of createGenVis,
// an error of one does not stop the others nor the visualisation
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
            [...(listeners.get(name) ?? [])].forEach(fn => {
                try {
                    fn(...args);
                } catch (error) {
                    report(error);
                }
            });
        },
        clear() { listeners.clear(); },
    };
};
