// the standalone script for embedding, see the readme, the exports are the
// global GenVis, e.g. GenVis.registerPlotType
export { mountGenVisElement, mountGenVisByClass, registerPlotType, registerCoord, pointwise, groupwise } from '@/index.js';
import { mountGenVisElement, mountGenVisByClass } from '@/index.js';

Object.assign(window, { mountGenVisElement, mountGenVisByClass });
