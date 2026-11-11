// the types of the Vue adapter, @preschen/gen-vis/vue: the component GenVis
// of the Vue of the application, the plugin which registers it and the
// factories of the Vue of a page, see docs/usage.md "Vue component"
import type { ComponentOptionsMixin, ComponentPublicInstance, DefineComponent, EmitsToProps, Plugin, PublicProps, SlotsType, VNodeChild } from 'vue';
import type { GenVisEmits, GenVisMethods, GenVisProps, HoverSlotProps } from './index.js';

export type * from './index.js';

/** The slots of the component, they replace the parts of the definition. */
export interface GenVisSlots {
    /** The title and the subtitle, with the values of the globals. */
    header?(props: { title?: string; subtitle?: string }): VNodeChild;
    /** The footer, HTML of `source` with the values of the globals. */
    footer?(props: { footer?: string }): VNodeChild;
    /** The content of the hover instead of the table or the templates of `hover`. */
    hover?(props: HoverSlotProps): VNodeChild;
    /** Buttons of the PNG, the CSV, the SVG and the table, `canCopy` if the clipboard takes images, `table(on?)` shows the rows as a table (true) or the chart (false), without an argument the other one, `tableShown` while the table is shown. */
    buttons?(props: { save: () => Promise<void>; copy: () => Promise<void>; csv: () => Promise<void>; svg: () => Promise<void>; canCopy: boolean; table: (on?: boolean) => void; tableShown: boolean }): VNodeChild;
}

/** The component of a ref, its props and the methods of the visualisation. */
export type GenVisComponentInstance = ComponentPublicInstance<GenVisProps> & GenVisMethods;

/** The type of the component, its props, events, slots and methods. */
export type GenVisComponent = DefineComponent<GenVisProps, {}, {}, {}, { [K in keyof GenVisMethods]: GenVisMethods[K] }, ComponentOptionsMixin, ComponentOptionsMixin,
    GenVisEmits, string, PublicProps, Readonly<GenVisProps> & EmitsToProps<GenVisEmits>, {}, SlotsType<GenVisSlots>>;

/** The component of the Vue of the application, see docs/usage.md "Vue component". */
export declare const GenVis: GenVisComponent;

/** The component of another Vue, e.g. the global `Vue` of a page with the browser module, `import * as Vue from 'vue'`. */
export declare function createVueComponent(vue: object): GenVisComponent;

/** The plugin of another Vue, it registers <GenVis>, `component` is the component. */
export declare function vuePlugin(vue: object): Plugin & { component: GenVisComponent };

/** The plugin of Vue, registers the component <GenVis>. */
declare const plugin: Plugin;
export default plugin;
