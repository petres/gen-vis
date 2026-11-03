// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy, the migration of definitions of 3.x
// and their internal form (normalize), `load` reads the files of the urls,
// registered plot types and coordinate systems are known to validateDef
export { resolveParents } from '@/store';
export { validateDef } from '@/utils/validate';
export { migrate } from '@/utils/migrate';
export { normalize } from '@/utils/normalize';
export { registerPlotType } from '@/plots';
export { registerCoord } from '@/coords';
