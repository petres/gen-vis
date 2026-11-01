// the types of @preschen/gen-vis, a definition is the JSON of schema.json,
// see the readme
import type { ComponentOptionsMixin, ComponentPublicInstance, DefineComponent, EmitsToProps, Plugin, PublicProps, SlotsType, VNodeChild } from 'vue';
import type { GenVisDefinition } from './definition';

// the types of the parts of a definition, e.g. MappingEntry or Plot
export type * from './definition';

/** A definition of a visualisation, see schema.json and the readme. */
export type Definition = GenVisDefinition;

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
    /** Logs the warnings of the check of the definition in the console. */
    check?: boolean;
    /** The changes of the user, with v-model:state. */
    state?: State | null;
    /** The globals of the page, e.g. the language, also of hidden form elements. */
    globals?: Record<string, unknown> | null;
    /** The rows highlighted by the page, values of mappings, e.g. `{ country: 'AT' }` of another chart. */
    highlight?: Record<string, unknown> | null;
    /** A button to save the PNG, a string is the name of the file. */
    download?: boolean | string;
    /** A button to copy the PNG to the clipboard. */
    copy?: boolean;
    /** A button to save the data shown as CSV, a string is the name of the file. */
    csv?: boolean | string;
    /** The width of the PNG in pixels, `screen` for the one on the screen. */
    imageWidth?: number | 'screen' | null;
    /** Loads the definition and the data when it is near the viewport, `true` within 400px, a string is the `rootMargin`, e.g. `'800px 0px'`. */
    lazy?: boolean | string;
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
    /** Highlights the rows of the values of mappings, e.g. `{ country: 'AT' }`, null ends it. */
    setHighlight(entry: Record<string, unknown> | null): void;
}

/** The events of the component, e.g. `@hover="e => …"`, a type, not an interface, so Vue reads its listeners, e.g. `onHover`. */
export type GenVisEmits = {
    /** The changes of the user, the globals of the form elements and the legends, see v-model:state. */
    'update:state': (state: State) => void;
    /** The rows of the position of the pointer, null if the hover ends. */
    hover: (event: HoverEvent | null) => void;
    /** The rows of the position of a click or a tap, or of Enter of the keyboard. */
    select: (event: HoverEvent) => void;
    /** The visualisation is drawn, after every change. */
    rendered: () => void;
    /** The message of an error of the definition or the data, the visualisation shows it. */
    error: (message: string) => void;
};

/** The props of the hover slot, the ones of the event and the entries of the rows. */
export interface HoverSlotProps extends HoverEvent {
    /** The rows of the hover, their values and the props of their categories by the names of the mappings, e.g. `entries[0].land.name`. */
    entries: (Record<string, Record<string, unknown>> & { nearest: boolean })[];
}

/** The slots of the component, they replace the parts of the definition. */
export interface GenVisSlots {
    /** The title and the subtitle, with the values of the globals. */
    header?(props: { title?: string; subtitle?: string }): VNodeChild;
    /** The footer, HTML of options.footer with the values of the globals. */
    footer?(props: { footer?: string }): VNodeChild;
    /** The content of the hover instead of the table or the templates of options.hover. */
    hover?(props: HoverSlotProps): VNodeChild;
    /** Buttons of the PNG and the CSV, `canCopy` if the clipboard takes images. */
    buttons?(props: { save: () => void; copy: () => void; csv: () => void; canCopy: boolean }): VNodeChild;
}

export type GenVisInstance = ComponentPublicInstance<GenVisProps> & GenVisMethods;

/** The component, see the readme. */
export declare const GenVis: DefineComponent<GenVisProps, {}, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin,
    GenVisEmits, string, PublicProps, Readonly<GenVisProps> & EmitsToProps<GenVisEmits>, {}, SlotsType<GenVisSlots>>;

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

/** An element of a layer, the values of its attributes (`text` is its text). */
export type LayerItem = Record<string, unknown>;

/** The marks of a plot, drawn by the package, see the readme "Extensions" and drawLayer of src/utils/draw.js. */
export interface Layer {
    /** The svg element of the items, e.g. "rect". */
    element?: string;
    /** An element per item in a `g.vis-group` per group, its categories are its `data-group-` attributes. */
    groups?: { categories: Record<string, unknown>; items: LayerItem[] }[];
    /** The elements directly in the group of the plot, e.g. a path per group. */
    items?: LayerItem[];
    /** The key of the element of an item, of the draw before, by default its row or its index. */
    key?: (item: LayerItem) => unknown;
    /** A class of the group of the plot. */
    class?: string;
    /** The texts with a `max-width` are cut or wrapped. */
    fit?: boolean;
}

/** A plot type, see the readme "Extensions" and src/plots/index.js. */
export interface PlotType {
    /** The marks of the groups of rows of a plot, null draws nothing. */
    marks(groups: PlotGroup[], plot: Record<string, any>, ctx: Record<string, any>): Layer | null;
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
/** The marks of an element of `element` per row, the elements of the draw before are updated. */
export declare function perRow(groups: PlotGroup[], element: string,
    translate?: (values: Record<string, unknown>, row: Row, group: PlotGroup) => Record<string, unknown>,
    key?: (item: LayerItem) => unknown): Layer;
/** The marks of a path per group with the `attrs` of the group and the path `d(group)`. */
export declare function perGroup(groups: PlotGroup[], d?: (group: PlotGroup) => string | null): Layer;

/** The plugin of Vue, registers the component <GenVis>. */
declare const plugin: Plugin;
export default plugin;
