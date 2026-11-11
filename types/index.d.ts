// the types of @preschen/gen-vis, the core without Vue, a definition is the
// JSON of schema.json, see docs/definition.md; the ones of the Vue adapter
// (@preschen/gen-vis/vue) are in vue.d.ts
import type { GenVisDefinition } from './definition.js';

// the types of the parts of a definition, e.g. Dim, Mark or Control
export type * from './definition.js';

/** A definition of a visualisation, see schema.json and docs/definition.md. */
export type Definition = GenVisDefinition;

/** A row of the data, the values of its columns. */
export type Row = Record<string, unknown>;

/** The changes of the user, the globals of the controls and the entries of the legends shown. */
export interface State {
    globals?: Record<string, unknown>;
    visible?: Record<string, Record<string, boolean>>;
}

/** The defaults of an axis, the values used where the definition has none, see docs/definition.md "Defaults". */
export interface AxisDefaults {
    /** The space between the tick marks and the labels in pixels. */
    padding?: number;
    tickMarks?: {
        /** The length of the tick marks in pixels, also the space of the labels without them. */
        size?: number;
        /** The part of the length inside the plot area in pixels, null of the one of the styles (4 pixels of bottom and right axes, 5 of top and left ones). */
        inset?: number | null;
    };
    title?: {
        /** The distance of the title from the axis in pixels, null of cartesian axes 8 pixels inside the edge of the margin. */
        offset?: number | null;
    };
}

/** The defaults of the parts of a chart instead of the built-in ones (`builtInDefaults`, see docs/definition.md "Defaults"): of all axes, the ones of the axes of a position before them, e.g. `angularAxis`. */
export interface GenVisDefaults {
    axis?: AxisDefaults;
    angularAxis?: AxisDefaults;
    radialAxis?: AxisDefaults;
    topAxis?: AxisDefaults;
    rightAxis?: AxisDefaults;
    bottomAxis?: AxisDefaults;
    leftAxis?: AxisDefaults;
    /** The margins of the definitions without them, a number of pixels or "auto" (measured) per side, see docs/definition.md "Margins". */
    margins?: { top?: number | 'auto'; right?: number | 'auto'; bottom?: number | 'auto'; left?: number | 'auto' };
    /** The box of the symbols of the legends, of all and per shortcut (`line`, `rect`, `circle`), e.g. `{ symbol: { size: 16, rect: { width: 12 } } }`. */
    legend?: { symbol?: Record<string, unknown> };
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
    /** The globals of the page, e.g. the language, also of hidden controls. */
    globals?: Record<string, unknown> | null;
    /** The rows highlighted by the page, values of dims, e.g. `{ country: 'AT' }` of another chart. */
    highlight?: Record<string, unknown> | null;
    /** The defaults of the parts instead of the built-in ones, e.g. `{ axis: { padding: 2, tickMarks: { size: 4, inset: 0 } } }`, values of the definition take precedence. */
    defaults?: GenVisDefaults | null;
    /** A button to save the PNG, a string is the name of the file. */
    download?: boolean | string;
    /** A button to copy the PNG to the clipboard. */
    copy?: boolean;
    /** A button to save the data shown as CSV, a string is the name of the file. */
    csv?: boolean | string;
    /** A button to save the SVG, a string is the name of the file. */
    svg?: boolean | string;
    /** The width of the PNG in pixels, `screen` for the one on the screen. */
    imageWidth?: number | 'screen' | null;
    /** Loads the definition and the data when it is near the viewport, `true` within one height of the viewport, a string is the `rootMargin`, e.g. `'800px 0px'`, a number (also one of the string without a unit) pixels. */
    lazy?: boolean | string | number;
}

/** The rows of the hover and of a click or a tap (`select`), the values of the dims. */
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
    /** The SVG of the image (a string), made for Word and editors, see docs/export.md. */
    exportSvg(options?: ExportSvgOptions): Promise<string>;
    exportCsv(name?: string): Promise<void>;
    /** Highlights the rows of the values of dims, e.g. `{ country: 'AT' }`, null ends it. */
    setHighlight(entry: Record<string, unknown> | null): void;
}

/** The parts of the images, see docs/export.md. */
export type ImagePart = 'title' | 'subtitle' | 'selection' | 'legend' | 'plot' | 'footer';

/** The options of exportSvg. */
export interface ExportSvgOptions {
    /** The parts of the image, cropped to them, by default all. */
    parts?: ImagePart[] | null;
    /** The unit of the width and the height, the viewBox is in CSS pixels. */
    unit?: 'px' | 'cm' | 'mm' | 'in';
    /** The background, a CSS color, null none, by default the one of the PNG. */
    background?: string | null;
}

/** The options of `window.genVisExport` of the export page (dist-lib/export.html), version 1, see docs/export.md. */
export interface GenVisExportOptions {
    def?: Definition | string;
    defUrl?: string;
    data?: Row[] | string | { base64: string };
    dataUrl?: string;
    baseUrl?: string;
    width?: number | string;
    padding?: number;
    unit?: 'px' | 'cm' | 'mm' | 'in';
    css?: string | string[];
    classes?: string | string[];
    globals?: Record<string, unknown>;
    state?: State;
    /** Also a function of the merged definition (see `genVisExport.resolve`), its result also of a promise. */
    defaults?: GenVisDefaults | ((merged: Definition) => GenVisDefaults | null | Promise<GenVisDefaults | null>);
    parts?: ImagePart[] | null;
    fontSize?: number | string;
    background?: string | null;
    /** Also a function of the merged definition (see `genVisExport.resolve`), its result also of a promise. */
    schemes?: GenVisSchemes | ((merged: Definition) => GenVisSchemes | null | Promise<GenVisSchemes | null>);
    timeout?: number;
}

/** The schemes of colors of `genVisExport`, of one size or of several, see `registerScheme`. */
export type GenVisSchemes = Record<string, string[] | (string[] | null)[]>;

/** `window.genVisExport` of the export page: draws a chart, `resolve` is the merged definition of the options (parents and mixins resolved, not normalized). */
export interface GenVisExport {
    (options: GenVisExportOptions): Promise<GenVisExportResult>;
    version: 1;
    resolve(options: GenVisExportOptions): Promise<Definition>;
}

/** The result of `window.genVisExport`, the sizes in CSS pixels, `box` the rectangle of the image in the page. */
export interface GenVisExportResult {
    version: 1;
    svg: string;
    width: number;
    height: number;
    box: { x: number; y: number; width: number; height: number };
}

/** The events of the visualisation, e.g. `on('hover', e => …)`, the props `on…` (e.g. `onHover`) and the events of the Vue component. */
export type GenVisEmits = {
    /** The changes of the user, the globals of the controls and the legends, see v-model:state. */
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
    /** The rows of the hover, their values and the props of their categories by the names of the dims, e.g. `entries[0].land.name`. */
    entries: (Record<string, Record<string, unknown>> & { nearest: boolean })[];
}

/** The content of a slot of the core: a node (e.g. an element or a fragment), a text, a list of them or nothing. */
export type SlotContent = Node | string | null | undefined | false | SlotContent[];

/** The slots of the core (the prop `slots`), functions of their props, they replace the parts of the definition. */
export interface GenVisSlotFunctions {
    /** The title and the subtitle, with the values of the globals. */
    header?(props: { title?: string; subtitle?: string }): SlotContent;
    /** The footer, HTML of `source` with the values of the globals. */
    footer?(props: { footer?: string }): SlotContent;
    /** The content of the hover instead of the table or the templates of `hover`. */
    hover?(props: HoverSlotProps): SlotContent;
    /** Buttons of the PNG, the CSV and the SVG, `canCopy` if the clipboard takes images. */
    buttons?(props: { save: () => Promise<void>; copy: () => Promise<void>; csv: () => Promise<void>; svg: () => Promise<void>; canCopy: boolean }): SlotContent;
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

/** A visualisation of createGenVis and mountGenVisElement, see docs/usage.md. */
export interface GenVisInstance extends GenVisMethods {
    /** The element of the visualisation, `.vis-outer`. */
    readonly el: HTMLElement;
    /** The changes of the user, see docs/usage.md "State", null while it is loaded. */
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

/** A visualisation at the end of `element` (in a new element `.vis-outer`), `root` makes `element` the one of the visualisation (`destroy()` leaves it without its content, its classes and the space it held). */
export declare function createGenVis(element: Element, props?: GenVisOptions, options?: { root?: boolean }): GenVisInstance;

/** A group of the rows of a mark, see docs/extensions.md. */
export interface MarkGroup {
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

/** The shapes of a mark, drawn by the package, see docs/extensions.md and drawLayer of src/utils/draw.js. */
export interface Layer {
    /** The svg element of the items, e.g. "rect". */
    element?: string;
    /** An element per item in a `g.vis-group` per group, its categories are its `data-group-` attributes. */
    groups?: { categories: Record<string, unknown>; items: LayerItem[] }[];
    /** The elements directly in the group of the mark, e.g. a path per group. */
    items?: LayerItem[];
    /** The key of the element of an item, of the draw before, by default its row or its index. */
    key?: (item: LayerItem) => unknown;
    /** A class of the group of the mark. */
    class?: string;
    /** The texts with a `max-width` are cut or wrapped. */
    fit?: boolean;
}

/** A mark type, see docs/extensions.md and src/plots/index.js. */
export interface MarkType {
    /** The shapes of the groups of rows of a mark (`mark` with its attributes and channels as `props`), null draws nothing. */
    marks(groups: MarkGroup[], mark: Record<string, any>, ctx: Record<string, any>): Layer | null;
    update?: boolean;
    curve?: boolean;
    coords?: string[];
    /** The default props of the marks of the type, of its full name and without its prefix alike ("spike" of "my:spike"), or a function of the props of the mark; null of a mark removes one. */
    defaults?: Record<string, unknown> | ((props: Record<string, unknown>) => Record<string, unknown>);
}

/** Mounts an element, the props of its data- attributes and `props`, e.g. the events, returns the visualisation. */
export declare function mountGenVisElement(element: Element, props?: GenVisOptions): GenVisInstance;
/** Mounts the elements of the class which are not mounted yet, returns their visualisations. */
export declare function mountGenVisByClass(className: string): GenVisInstance[];
/** Removes the visualisation of a mounted element, false if it is not mounted. */
export declare function unmountGenVisElement(element: Element): boolean;
export declare function registerMarkType(name: string, type: MarkType): void;
export declare function registerCoord(name: string, coord: Record<string, unknown>): void;
/** A scheme of its own, e.g. the colors of a house style, for `scheme` of the categories and the scales as the ones of d3, `colors` are CSS colors, of a scheme of several sizes entry n the n colors (others null), `observable10` also the default colors; returns a function which restores the scheme registered before under that name. */
export declare function registerScheme(name: string, colors: string[] | (string[] | null | undefined)[]): () => void;
/** The defaults of the parts of all charts of the page instead of the built-in ones, the prop `defaults` of a chart takes precedence, null removes them. */
export declare function registerDefaults(defaults: GenVisDefaults | null): void;
/** The marks of an element of `element` per row, the elements of the draw before are updated. */
export declare function perRow(groups: MarkGroup[], element: string,
    translate?: (values: Record<string, unknown>, row: Row, group: MarkGroup) => Record<string, unknown>,
    key?: (item: LayerItem) => unknown): Layer;
/** The marks of a path per group with the `attrs` of the group and the path `d(group)`. */
export declare function perGroup(groups: MarkGroup[], d?: (group: MarkGroup) => string | null): Layer;
