// the types of @preschen/gen-vis, a definition is the JSON of schema.json,
// see the readme
import type { ComponentPublicInstance, DefineComponent, Plugin } from 'vue';

/** A definition of a visualisation, see schema.json and the readme. */
export type Definition = Record<string, unknown>;

/** A row of the data, the values of its columns. */
export type Row = Record<string, unknown>;

/** The changes of the user, the globals of the form elements and the entries of the legends shown. */
export interface State {
    globals?: Record<string, unknown>;
    visible?: Record<string, Record<string, boolean>>;
}

export interface GenVisProps {
    /** The url of the definition. */
    defFile?: string | null;
    /** The definition, an object or a JSON string. */
    def?: Definition | string | null;
    /** The data as rows, a CSV/JSON string or parquet, otherwise the `data` url of the definition. */
    data?: Row[] | string | ArrayBuffer | Uint8Array | null;
    /** Shows the prepared definition. */
    debug?: boolean;
    /** The changes of the user, with v-model:state. */
    state?: State | null;
    /** A button to save the PNG, a string is the name of the file. */
    download?: boolean | string;
    /** A button to copy the PNG to the clipboard. */
    copy?: boolean;
    /** A button to save the data shown as CSV, a string is the name of the file. */
    csv?: boolean | string;
    /** The width of the PNG in pixels, `screen` for the one on the screen. */
    imageWidth?: number | 'screen' | null;
}

/** The rows of the hover and of a click or a tap (`select`), the values of the mappings. */
export interface HoverEvent {
    key: unknown;
    title: string;
    rows: Row[];
    nearest: Row | null;
}

/** The methods of the component, e.g. of a ref or of mountGenVisElement. */
export interface GenVisMethods {
    exportPng(name?: string): Promise<void>;
    copyPng(): Promise<void>;
    image(): Promise<Blob>;
    exportCsv(name?: string): Promise<void>;
}

export type GenVisInstance = ComponentPublicInstance<GenVisProps> & GenVisMethods;

/** The component, see the readme. */
export declare const GenVis: DefineComponent<GenVisProps>;

/** A group of the rows of a plot, see the readme "Extensions". */
export interface PlotGroup {
    categories: Record<string, unknown>;
    props: Record<string, unknown>;
    rows: Row[];
    at(row: Row): Record<string, unknown>;
    prop(name: string): (row: Row) => unknown;
    attrs: Record<string, unknown>;
    complete(row: Row): boolean;
}

/** A plot type, see the readme "Extensions" and src/plots/index.js. */
export interface PlotType {
    render(groups: PlotGroup[], parent: any, plot: Record<string, any>, ctx: Record<string, any>): unknown;
    update?: boolean;
    curve?: boolean;
    coords?: string[];
}

/** Mounts an element, the props of its data- attributes and `props`, e.g. the events, returns the component. */
export declare function mountGenVisElement(element: Element, props?: Record<string, unknown>): GenVisInstance;
/** Mounts the elements of the class which are not mounted yet, returns their components. */
export declare function mountGenVisByClass(className: string): GenVisInstance[];
/** Removes the visualisation of a mounted element, false if it is not mounted. */
export declare function unmountGenVisElement(element: Element): boolean;
export declare function registerPlotType(name: string, type: PlotType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
/** An element of `type` per row, the elements of the draw before are updated. */
export declare function pointwise(groups: PlotGroup[], parent: any, type: string,
    translate?: (values: Record<string, unknown>, row: Row, group: PlotGroup) => Record<string, unknown>,
    key?: (values: Record<string, unknown>) => unknown): any;
/** A path per group with the `attrs` of the group and the path `d(group)`. */
export declare function groupwise(groups: PlotGroup[], parent: any, d?: (group: PlotGroup) => string | null): any;

/** The plugin of Vue, registers the component <GenVis>. */
declare const plugin: Plugin;
export default plugin;
