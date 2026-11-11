// the rules of the definitions for scripts outside the browser, e.g. a check
// of all definitions before a deploy,
// `load` reads the files of the urls, registered mark types, coordinate
// systems and schemes are known to validateDef; the form the engine reads
// (translate, normalize of utils/) is internal, see spec/normalize.md
export { resolveParents } from '@/utils/load';
export { validateDef } from '@/utils/validate';
export { registerMarkType } from '@/marks';
export { registerCoord } from '@/coords';
export { registerScheme } from '@/utils/d3';
// the rows of data as the load reads them (CSV, TSV, JSON, parquet), the
// transforms (validateDef infers the types of their columns once loaded)
export { parseData, dataFormat } from '@/utils/data';
export { loadTransforms } from '@/utils/transform';
export { resolve, variants } from '@/utils/resolve';
