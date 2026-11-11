// the rules of the definitions for scripts outside the browser, see docs/extensions.md
import type { Definition, MarkType } from './index.js';

/** The definition merged with its parents, `load(url)` reads a file, by default with fetch; it rejects of a part which is none of gen-vis 5 (the keys of 4.x, e.g. `mapping`, or a `$schema` of another version). */
export declare function resolveParents(def: Definition, url: string, load?: (url: string) => string | Promise<string>): Promise<Definition>;
/** The warnings of common mistakes of a merged definition: the schema, the semantic checks, also of every value of its controls, and of its `rows` if given, e.g. a dim of dates whose values are no dates; the paths are the ones of the definition, e.g. `dims.y.scale`, `marks[1].fill`. A definition which is none of gen-vis 5 (the keys of 4.x or a `$schema` of another version) has that one message and is not checked. */
export declare function validateDef(def: Definition, rows?: Record<string, unknown>[] | null): string[];
/** The definition with the expressions of its globals evaluated, `names` are the globals and the fields of the selected entries (`year:name`, `globals.year`), the other expressions stay. */
export declare function resolve(def: Definition, names: Record<string, unknown>): Definition;
/** The definition resolved with its globals and, one at a time, with every value of every control. */
export declare function variants(def: Definition): Definition[];
export declare function registerMarkType(name: string, type: MarkType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
/** A scheme of its own, e.g. the colors of a house style, for `scheme` of the categories and the scales as the ones of d3, `colors` are CSS colors; returns a function which restores the scheme registered before under that name. */
export declare function registerScheme(name: string, colors: string[] | (string[] | null | undefined)[]): () => void;
/** The rows of data as the load reads them: CSV, TSV, JSON (a list of rows) or parquet (bytes), by `format` or by the content. */
export declare function parseData(data: string | ArrayBuffer | ArrayBufferView | Record<string, unknown>[], format?: 'csv' | 'tsv' | 'json' | 'parquet', columns?: string[] | null): Promise<Record<string, unknown>[]>;
/** The format of the data of a url: `format` or the one of its extension, undefined of neither. */
export declare function dataFormat(url: string, format?: string): 'csv' | 'tsv' | 'json' | 'parquet' | undefined;
/** Loads the transforms, so validateDef infers the types of their columns. */
export declare function loadTransforms(): Promise<unknown>;
