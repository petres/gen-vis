// the rules of the definitions for scripts outside the browser, see docs/extensions.md
import type { Definition, PlotType } from './index.js';

/** The definition merged with its parents, `load(url)` reads a file, by default with fetch. */
export declare function resolveParents(def: Definition, url: string, load?: (url: string) => string | Promise<string>): Promise<Definition>;
/** The warnings of common mistakes of a merged definition of 5.0 (one of 4.x is migrated first): the schema, the semantic checks, also of every value of its controls, and of its `rows` if given, e.g. a dim of dates whose values are no dates; the paths are the ones of the definition, e.g. `dims.y.scale`, `marks[1].fill`. */
export declare function validateDef(def: Definition, rows?: Record<string, unknown>[] | null): string[];
/** A (merged) definition of 5.0 as the engine reads it: resolved with its globals, translated (`translate`) and with the parts it may leave out written out (e.g. the scales of the positions, the default attributes of the mark types). */
export declare function normalize(def: Definition, options?: { plotTypes?: Record<string, PlotType> }): Record<string, unknown>;
/** A definition of 4.x as one of 5.0, `parents` the merged definitions of its parents (of the ids of their controls and their hover), see docs/definition.md "Migration from 4.x". */
export declare function migrate(def: Record<string, unknown>, options?: { parents?: Record<string, unknown>[]; noHover?: boolean }): Definition;
/** The JSON of a definition as the files of gen-vis are written: an indent of four spaces, objects and lists which fit into a line of `width` characters on one line. */
export declare function formatJson(value: unknown, indent?: number, width?: number): string;
/** The major version of a `$schema` url of gen-vis (e.g. 5 of `https://unpkg.com/@preschen/gen-vis@5/schema.json`), undefined of one without a version, null of another url. */
export declare function schemaMajor(schema: unknown): number | null | undefined;
/** A merged definition of 5.0 as the form the engine reads (`options`, `mapping`, `plot`, `formElements`), pure, JSON to JSON. */
export declare function translate(def: Definition): Record<string, unknown>;
/** Whether a definition is one of 5.0 (by its keys: `dims`, `marks`, `controls`, or none of 4.x). */
export declare function isDefinition5(def: unknown): boolean;
/** Whether a definition is one of 4.x (by its keys: `mapping`, `plot`, `options`, `formElements`). */
export declare function isDefinition4(def: unknown): boolean;
/** The definition with the expressions of its globals evaluated, `names` are the globals and the fields of the selected entries (`year:name`, `globals.year`), the other expressions stay. */
export declare function resolve(def: Definition, names: Record<string, unknown>): Definition;
/** The definition resolved with its globals and, one at a time, with every value of every control. */
export declare function variants(def: Definition): Definition[];
export declare function registerPlotType(name: string, type: PlotType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
/** A scheme of its own, e.g. the colors of a house style, for `scheme` of the categories and the scales as the ones of d3, `colors` are CSS colors; returns a function which restores the scheme registered before under that name. */
export declare function registerScheme(name: string, colors: string[] | (string[] | null | undefined)[]): () => void;
