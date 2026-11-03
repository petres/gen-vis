// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy, and their internal form (normalize),
// `load` reads the files of the urls, registered plot types, coordinate
// systems and schemes are known to validateDef
export { resolveParents } from '@/utils/load';
export { validateDef } from '@/utils/validate';
export { registerPlotType } from '@/plots';
export { registerCoord } from '@/coords';
export { registerScheme } from '@/utils/d3';

import { normalize as normalizeDef } from '@/utils/normalize';
import { plotTypes } from '@/plots';

// the internal form of a definition of 4.0, of the registered plot types
export const normalize = (def, options = {}) => normalizeDef(def, { plotTypes, ...options });
