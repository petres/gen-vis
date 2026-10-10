export { GenVis, mountGenVisElement, mountGenVisByClass, registerPlotType, registerCoord, groupwise, pointwise };

import { createApp } from 'vue'
import GenVis from '@/comp/App.vue'
import { registerPlotType } from '@/plots'
import { groupwise, pointwise } from '@/plots/elements'
import { registerCoord } from '@/coords'

// vue plugin, registers the <GenVis> component
export default {
    install(app) {
        app.component('GenVis', GenVis);
    },
};

// the props of the buttons and the debug output, "false" is false, a
// string other than "true" and "" is the name of the file, e.g. of download
const flags = ['debug', 'copy', 'download', 'csv'];

// the value of a data attribute as the one of its prop, e.g. "false" of
// data-copy, the state is JSON
const attributeValue = (name, value) => {
    if (flags.includes(name)) {
        if (value === 'false')
            return false;
        return value === '' || value === 'true' || name == 'debug' || name == 'copy' ? true : value;
    }
    if (name == 'state') {
        try {
            return JSON.parse(value);
        } catch (error) {
            console.error(`gen-vis: invalid JSON in data-state: ${error.message}`);
            return null;
        }
    }
    return value;
};

// the props are taken from the data attributes, e.g. data-def-file="def.json",
// and `props`, e.g. { onSelect: e => ... } of the events
const mountGenVisElement = (element, props = {}) => {
    const attributes = Object.fromEntries(element.getAttributeNames()
        .filter(name => name.startsWith('data-'))
        .map(name => [name.substring(5), attributeValue(name.substring(5), element.getAttribute(name))]));
    return createApp(GenVis, { ...attributes, ...props }).mount(element);
}

const mountGenVisByClass = cl => {
    for (const e of document.getElementsByClassName(cl)) {
        if (!e.classList.contains('vis-mounted')) {
            e.classList.add('vis-mounted')
            mountGenVisElement(e);
        }
    }
}
