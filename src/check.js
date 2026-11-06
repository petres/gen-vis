// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy, their migration from 4.x (migrate) and
// their normalized form (normalize),
// `load` reads the files of the urls, registered plot types, coordinate
// systems and schemes are known to validateDef
export { resolveParents } from '@/utils/load';
export { validateDef } from '@/utils/validate';
export { registerPlotType } from '@/plots';
export { registerCoord } from '@/coords';
export { registerScheme } from '@/utils/d3';
export { migrate, formatJson } from '@/utils/migrate';
export { translate, isDefinition4, isDefinition5 } from '@/utils/language';
export { resolve, variants } from '@/utils/resolve';

import { normalize as normalizeDef } from '@/utils/normalize';
import { plotTypes } from '@/plots';

import { translate as translateDef } from '@/utils/language';
import { resolve as resolveDef, namesOfGlobals } from '@/utils/resolve';

// the definition of 5.0 as the engine reads it: resolved with its globals,
// translated and normalized, of the registered plot types
export const normalize = (def, options = {}) => normalizeDef(translateDef(resolveDef(def, namesOfGlobals(def.globals, def.controls))), { plotTypes, ...options });
