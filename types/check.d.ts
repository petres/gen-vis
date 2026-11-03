// the rules of the definitions for scripts outside the browser, see the readme
import type { Definition, PlotType } from './index.js';

/** The definition merged with its parents, `load(url)` reads a file, by default with fetch. */
export declare function resolveParents(def: Definition, url: string, load?: (url: string) => string | Promise<string>): Promise<Definition>;
/** The warnings of common mistakes of a merged definition, also of the definitions of the patches of its entries, and of its `rows` if given, e.g. years of a date mapping. */
export declare function validateDef(def: Definition, rows?: Record<string, unknown>[] | null): string[];
/** The definition of 4.0 of a (merged) definition of 3.x in its shorter forms, a definition of 4.0 is only written shorter; `legacy`: whether it is one of 3.x, by default if it has constructs of 3.x (as the load reads it). */
export declare function migrate(def: Record<string, unknown>, options?: { plotTypes?: Record<string, PlotType>, legacy?: boolean }): Definition;
/** The parts of a definition of 3.x (the parents first, in the order of their merge) migrated to 4.0 in their shorter forms, their merge is the migrated merge of the parts. */
export declare function migrateParts(parts: Record<string, unknown>[], options?: { plotTypes?: Record<string, PlotType>, legacy?: boolean }): Definition[];
/** The internal form of a (merged) definition of 4.0, the one the renderer reads (the form of 3.x). */
export declare function normalize(def: Definition, options?: { plotTypes?: Record<string, PlotType> }): Record<string, unknown>;
export declare function registerPlotType(name: string, type: PlotType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
