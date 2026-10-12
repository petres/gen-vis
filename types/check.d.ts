// the rules of the definitions for scripts outside the browser, see the readme
import type { Definition, PlotType } from './index.js';

/** The definition merged with its parents, `load(url)` reads a file, by default with fetch. */
export declare function resolveParents(def: Definition, url: string, load?: (url: string) => string | Promise<string>): Promise<Definition>;
/** The warnings of common mistakes of a merged definition. */
export declare function validateDef(def: Definition): string[];
export declare function registerPlotType(name: string, type: PlotType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
