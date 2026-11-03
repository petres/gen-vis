// the rules of the definitions for scripts outside the browser, see the readme
import type { Definition, PlotType } from './index.js';

/** The definition merged with its parents, `load(url)` reads a file, by default with fetch. */
export declare function resolveParents(def: Definition, url: string, load?: (url: string) => string | Promise<string>): Promise<Definition>;
/** The warnings of common mistakes of a merged definition, also of the definitions of the patches of its entries, and of its `rows` if given, e.g. years of a date mapping. */
export declare function validateDef(def: Definition, rows?: Record<string, unknown>[] | null): string[];
/** The internal form of a (merged) definition of 4.0, the one the renderer reads. */
export declare function normalize(def: Definition, options?: { plotTypes?: Record<string, PlotType> }): Record<string, unknown>;
export declare function registerPlotType(name: string, type: PlotType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
/** A scheme of its own, e.g. the colors of a house style, for `scheme` of the categories and the scales as the ones of d3, `colors` are CSS colors. */
export declare function registerScheme(name: string, colors: string[] | (string[] | null | undefined)[]): void;
