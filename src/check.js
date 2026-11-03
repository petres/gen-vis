// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy, the migration of definitions of 3.x
// and their internal form (normalize), `load` reads the files of the urls,
// registered plot types and coordinate systems are known to validateDef
export { resolveParents } from '@/store';
export { validateDef } from '@/utils/validate';
export { migrate, migrateParts } from '@/utils/migrate';
export { registerPlotType } from '@/plots';
export { registerCoord } from '@/coords';

import { normalize as normalizeDef } from '@/utils/normalize';
import { plotTypes } from '@/plots';

// the internal form of a definition of 4.0, of the registered plot types
export const normalize = (def, options = {}) => normalizeDef(def, { plotTypes, ...options });
