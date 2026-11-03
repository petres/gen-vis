// the types of @preschen/gen-vis, the core without Vue, a definition is the
// JSON of schema.json, see the readme; the ones of the Vue adapter
// (@preschen/gen-vis/vue) are in vue.d.ts
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

/** The methods of the visualisation, of createGenVis, mountGenVisElement and of a ref of the Vue component. */
export interface GenVisMethods {
    exportPng(name?: string): Promise<void>;
    copyPng(): Promise<void>;
    image(): Promise<Blob>;
    exportCsv(name?: string): Promise<void>;
    /** Highlights the rows of the values of mappings, e.g. `{ country: 'AT' }`, null ends it. */
    setHighlight(entry: Record<string, unknown> | null): void;
}

/** The events of the visualisation, e.g. `on('hover', e => …)`, the props `on…` (e.g. `onHover`) and the events of the Vue component. */
export type GenVisEmits = {
    /** The changes of the user, the globals of the form elements and the legends, see v-model:state. */
    'update:state': (state: State) => void;
    /** The rows of the position of the pointer, null if the hover ends. */
    hover: (event: HoverEvent | null) => void;
    /** The rows of the position of a click or a tap, or of Enter of the keyboard. */
    select: (event: HoverEvent) => void;
    /** The visualisation is drawn, once a definition is drawn the first time. */
    rendered: () => void;
    /** The message of an error of the definition or the data, the visualisation shows it. */
    error: (message: string) => void;
};

/** The names of the events. */
export type GenVisEvent = keyof GenVisEmits;

/** The props of the hover slot, the ones of the event and the entries of the rows. */
export interface HoverSlotProps extends HoverEvent {
    /** The rows of the hover, their values and the props of their categories by the names of the mappings, e.g. `entries[0].land.name`. */
    entries: (Record<string, Record<string, unknown>> & { nearest: boolean })[];
}

/** The content of a slot of the core: a node (e.g. an element or a fragment), a text, a list of them or nothing. */
export type SlotContent = Node | string | null | undefined | false | SlotContent[];

/** The slots of the core (the prop `slots`), functions of their props, they replace the parts of the definition. */
export interface GenVisSlotFunctions {
    /** The title and the subtitle, with the values of the globals. */
    header?(props: { title?: string; subtitle?: string }): SlotContent;
    /** The footer, HTML of options.footer with the values of the globals. */
    footer?(props: { footer?: string }): SlotContent;
    /** The content of the hover instead of the table or the templates of options.hover. */
    hover?(props: HoverSlotProps): SlotContent;
    /** Buttons of the PNG and the CSV, `canCopy` if the clipboard takes images. */
    buttons?(props: { save: () => Promise<void>; copy: () => Promise<void>; csv: () => Promise<void>; canCopy: boolean }): SlotContent;
}

/** The listeners of the events as props, e.g. `{ onSelect: e => … }` of mountGenVisElement. */
export interface GenVisListeners {
    onRendered?: GenVisEmits['rendered'];
    onError?: GenVisEmits['error'];
    onHover?: GenVisEmits['hover'];
    onSelect?: GenVisEmits['select'];
    'onUpdate:state'?: GenVisEmits['update:state'];
}

/** The props of createGenVis, the ones of the component, the slots and the listeners. */
export interface GenVisOptions extends GenVisProps, GenVisListeners {
    slots?: GenVisSlotFunctions | null;
}

/** A visualisation of createGenVis and mountGenVisElement, see the readme "Usage". */
export interface GenVisInstance extends GenVisMethods {
    /** The element of the visualisation, `.vis-outer`. */
    readonly el: HTMLElement;
    /** The changes of the user, see the readme "State", null while it is loaded. */
    readonly state: State | null;
    /** The props it has now. */
    readonly props: Readonly<GenVisOptions>;
    /** New props, applied together in a microtask: a new definition or new data is loaded again, a new state, new globals and a highlight are applied. */
    update(props: Partial<GenVisOptions>): GenVisInstance;
    on<E extends GenVisEvent>(event: E, listener: GenVisEmits[E]): GenVisInstance;
    off<E extends GenVisEvent>(event: E, listener?: GenVisEmits[E]): GenVisInstance;
    /** Removes the visualisation, its listeners and its observers. */
    destroy(): void;
}

/** A visualisation at the end of `element` (in a new element `.vis-outer`), `root` makes `element` the one of the visualisation. */
export declare function createGenVis(element: Element, props?: GenVisOptions, options?: { root?: boolean }): GenVisInstance;

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
    /** The default props of the plots of the type, of its full name and without its prefix alike ("tick" of "my:tick"), or a function of the props of the plot; null of a plot removes one. */
    defaults?: Record<string, unknown> | ((props: Record<string, unknown>) => Record<string, unknown>);
}

/** Mounts an element, the props of its data- attributes and `props`, e.g. the events, returns the visualisation. */
export declare function mountGenVisElement(element: Element, props?: GenVisOptions): GenVisInstance;
/** Mounts the elements of the class which are not mounted yet, returns their visualisations. */
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
