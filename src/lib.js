// the module of the browser (dist-lib/esm/gen-vis.js), see docs/usage.md, the
// component of the Vue of the page is vuePlugin(Vue) or createVueComponent(Vue)
export { createGenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement, registerPlotType, registerCoord, registerScheme, registerDefaults, perRow, perGroup } from '@/index.js';
export { createVueComponent, vuePlugin } from '@/vue-adapter.js';
import { mountGenVisElement, mountGenVisByClass, unmountGenVisElement } from '@/index.js';

Object.assign(window, { mountGenVisElement, mountGenVisByClass, unmountGenVisElement });
