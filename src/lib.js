// the standalone script for embedding, see docs/usage.md, the exports are the
// global GenVis, e.g. GenVis.registerPlotType, the component of the Vue of
// the page is GenVis.vuePlugin(Vue) or GenVis.createVueComponent(Vue)
export { createGenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement, registerPlotType, registerCoord, registerScheme, registerDefaults, perRow, perGroup } from '@/index.js';
export { createVueComponent, vuePlugin } from '@/vue-adapter.js';
import { mountGenVisElement, mountGenVisByClass, unmountGenVisElement } from '@/index.js';

Object.assign(window, { mountGenVisElement, mountGenVisByClass, unmountGenVisElement });
