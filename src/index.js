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

// the props are taken from the data attributes, e.g. data-def-file="def.json"
const mountGenVisElement = element => {
    const props = Object.fromEntries(element.getAttributeNames()
        .filter(name => name.startsWith('data-'))
        .map(name => [name.substring(5), element.getAttribute(name)]));
    return createApp(GenVis, props).mount(element);
}

const mountGenVisByClass = cl => {
    for (const e of document.getElementsByClassName(cl)) {
        if (!e.classList.contains('gen-vis-attached')) {
            e.classList.add('gen-vis-attached')
            mountGenVisElement(e);
        }
    }
}
