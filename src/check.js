// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy and their migration from 4.x (migrate),
// `load` reads the files of the urls, registered mark types, coordinate
// systems and schemes are known to validateDef; the form the engine reads
// (translate, normalize of utils/) is internal, see spec/normalize.md
export { resolveParents } from '@/utils/load';
export { validateDef } from '@/utils/validate';
export { registerMarkType } from '@/plots';
export { registerCoord } from '@/coords';
export { registerScheme } from '@/utils/d3';
export { migrate, formatJson } from '@/utils/migrate';
export { schemaMajor } from '@/utils/version';
// the rows of data as the load reads them (CSV, TSV, JSON, parquet), the
// transforms (validateDef infers the types of their columns once loaded)
export { parseData, dataFormat } from '@/utils/data';
export { loadTransforms } from '@/utils/transform';
export { isDefinition4, isDefinition5 } from '@/utils/language';
export { resolve, variants } from '@/utils/resolve';
