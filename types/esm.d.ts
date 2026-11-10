// the types of the browser module, @preschen/gen-vis/esm
// (dist-lib/esm/gen-vis.js, src/lib.js): the functions of the package and
// the factories of the Vue component of the Vue of a page, see
// docs/usage.md. The factories are typed without the types of vue (the
// optional peer), so the types of the module need no vue; the ones of
// @preschen/gen-vis/vue are typed with them.
export * from './index.js';

/** The component <GenVis> of the Vue of a page (`vue`, e.g. the global Vue of a CDN), see @preschen/gen-vis/vue. */
export declare function createVueComponent(vue: object): any;

/** The plugin of the Vue of a page, it registers <GenVis>, `component` is the component, see @preschen/gen-vis/vue. */
export declare function vuePlugin(vue: object): any;
