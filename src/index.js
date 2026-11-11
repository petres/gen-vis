export { createGenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement, registerMarkType, registerCoord, registerScheme, registerDefaults, perRow, perGroup };

import { createGenVis } from '@/comp/app'
import { registerMarkType } from '@/marks'
import { perRow, perGroup } from '@/marks/elements'
import { registerCoord } from '@/coords'
import { registerScheme } from '@/utils/d3'
import { registerDefaults } from '@/utils/defaults'

// the props of the buttons, the debug output and lazy, "false" is false, a
// string other than "true" and "" is the name of the file, e.g. of
// download, or the margin of lazy, e.g. "800px", of the others true
const flags = ['debug', 'check', 'copy', 'table', 'download', 'csv', 'svg', 'lazy'];

// the value of a data attribute as the one of its prop, e.g. "false" of
// data-copy, the state, the globals, the highlight and the defaults are JSON
const attributeValue = (name, value) => {
    if (flags.includes(name)) {
        if (value === 'false')
            return false;
        return value === '' || value === 'true' || ['debug', 'check', 'copy', 'table'].includes(name) ? true : value;
    }
    if (['state', 'globals', 'highlight', 'defaults'].includes(name)) {
        try {
            return JSON.parse(value);
        } catch (error) {
            console.error(`gen-vis: invalid JSON in data-${name}: ${error.message}`);
            return null;
        }
    }
    return value;
};

// the name of a prop of a data attribute, e.g. defFile of def-file
const propName = name => name.replace(/-([a-z])/g, (m, c) => c.toUpperCase());

// the visualisations of the mounted elements, see unmountGenVisElement
const mounted = new WeakMap();

// the props are taken from the data attributes, e.g. data-def-file="def.json",
// and `props`, e.g. { onSelect: e => ... } of the events, returns the
// visualisation, e.g. for its methods, an element mounted before is mounted anew
const mountGenVisElement = (element, props = {}) => {
    unmountGenVisElement(element);
    const attributes = Object.fromEntries(element.getAttributeNames()
        .filter(name => name.startsWith('data-'))
        .map(name => [propName(name.substring(5)), attributeValue(name.substring(5), element.getAttribute(name))]));
    element.replaceChildren();
    const vis = createGenVis(element, { ...attributes, ...props });
    mounted.set(element, vis);
    element.classList.add('vis-mounted');
    return vis;
};

// removes the visualisation of a mounted element, e.g. before a page removes
// the element, false if it is not mounted
const unmountGenVisElement = element => {
    const vis = mounted.get(element);
    if (!vis)
        return false;
    vis.destroy();
    mounted.delete(element);
    element.classList.remove('vis-mounted');
    return true;
};

// the elements of the class which are not mounted yet, returns their
// visualisations, not by the class vis-mounted, e.g. a copy of a mounted
// element (cloneNode) has it but no visualisation
const mountGenVisByClass = cl => [...document.getElementsByClassName(cl)]
    .filter(e => !mounted.has(e))
    .map(e => mountGenVisElement(e));
