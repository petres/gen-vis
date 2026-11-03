export { createVueComponent, vuePlugin };

// of the entry of the package, so the one of the adapter imports it
import { createGenVis } from '@/index.js';
import { propNames } from '@/comp/app';

// the props of the component, the ones of createGenVis without the slots,
// see README "Props"
const props = {
    debug: { type: Boolean, default: false },
    check: { type: Boolean, default: false },
    defFile: { type: String, default: null },
    def: { type: [Object, String], default: null },
    data: { type: [Array, String, ArrayBuffer, Uint8Array], default: null },
    state: { type: Object, default: null },
    globals: { type: Object, default: null },
    highlight: { type: Object, default: null },
    download: { type: [Boolean, String], default: false },
    copy: { type: Boolean, default: false },
    csv: { type: [Boolean, String], default: false },
    svg: { type: [Boolean, String], default: false },
    imageWidth: { type: [Number, String], default: null },
    lazy: { type: [Boolean, String], default: false },
};

// the events of the visualisation, see README "Events and slots"
const events = ['update:state', 'hover', 'select', 'rendered', 'error'];

// the slots of the component, see README "Events and slots"
const slotNames = ['header', 'footer', 'buttons', 'hover'];

/**
 * The component GenVis of the Vue of the page (the module `vue`, e.g.
 * `import * as Vue from 'vue'`, or the global `Vue` of
 * vue.global.prod.js): the props, `v-model:state`, the events, the slots and
 * the methods of the visualisation of createGenVis, see README "Vue
 * component". The slots are drawn by Vue into the elements of the
 * visualisation, with the components and plugins of the application.
 */
const createVueComponent = Vue => {
    const { h, render } = Vue;

    // the content of a slot of the component, a component of its own, so
    // Vue draws it again when the data of the page it uses changes
    const SlotContent = {
        props: ['owner', 'name', 'props'],
        render() {
            return this.owner.$slots[this.name]?.(this.props);
        },
    };

    return {
        name: 'GenVis',
        props,
        emits: events,
        // the element of the visualisation, its content is the one of createGenVis
        render() {
            return h('div', { class: 'vis-outer' });
        },
        created() {
            // the slots drawn, see slotsOf
            this.drawnSlots = new Set();
        },
        mounted() {
            this.slotNames = this.presentSlots();
            this.vis = createGenVis(this.$el, { ...this.ownProps(), slots: this.slotsOf(), ...this.listeners() }, { root: true });
            // the props are applied together, see update of createGenVis
            propNames.filter(k => k in props).forEach(k => this.$watch(k, value => this.vis.update({ [k]: value }),
                { deep: ['state', 'globals', 'highlight'].includes(k) }));
        },
        updated() {
            // the classes and styles of the page, e.g. of a class of a parent
            this.vis.update({});
            // other slots, e.g. one of v-if
            const names = this.presentSlots();
            if (names.join() != this.slotNames.join()) {
                this.slotNames = names;
                this.vis.update({ slots: this.slotsOf() });
            }
            // the slots of the page, which might be new functions
            this.drawnSlots.forEach(d => d.component?.$forceUpdate());
            this.sweep();
        },
        beforeUnmount() {
            this.vis.destroy();
            this.drawnSlots.forEach(d => render(null, d.holder));
            this.drawnSlots.clear();
        },
        methods: {
            ownProps() {
                return Object.fromEntries(Object.keys(props).map(k => [k, this[k]]));
            },
            listeners() {
                return Object.fromEntries(events.map(name => [`on${name[0].toUpperCase()}${name.slice(1)}`, (...args) => this.$emit(name, ...args)]));
            },
            presentSlots() {
                return slotNames.filter(n => this.$slots[n]);
            },
            // the slots as functions of the visualisation, see README "Events
            // and slots": a slot is drawn by Vue into an element of its own,
            // its nodes are the ones of the visualisation, the ones which are
            // not shown anymore are removed by Vue, see sweep
            slotsOf() {
                return Object.fromEntries(this.slotNames.map(name => [name, slotProps => {
                    const holder = document.createElement('div');
                    const vnode = h(SlotContent, { owner: this, name, props: slotProps });
                    // the components and plugins of the application, e.g. of the slots
                    vnode.appContext = this.$.appContext;
                    render(vnode, holder);
                    const nodes = [...holder.childNodes];
                    this.drawnSlots.add({ holder, first: nodes[0], seen: false, component: vnode.component?.proxy });
                    queueMicrotask(() => this.sweep());
                    const fragment = document.createDocumentFragment();
                    fragment.append(...nodes);
                    return fragment;
                }]));
            },
            // the slots drawn which the visualisation does not show anymore, e.g.
            // the hover of a row before, the ones not shown yet are kept
            sweep() {
                this.drawnSlots.forEach(d => {
                    if (!d.first || d.first.isConnected)
                        d.seen = true;
                    else if (d.seen) {
                        render(null, d.holder);
                        this.drawnSlots.delete(d);
                    }
                });
            },
            // the methods of the visualisation, see README "PNG"
            image() { return this.vis.image() },
            exportSvg(options) { return this.vis.exportSvg(options) },
            exportPng(name) { return this.vis.exportPng(name) },
            exportCsv(name) { return this.vis.exportCsv(name) },
            copyPng() { return this.vis.copyPng() },
            setHighlight(entry) { return this.vis.setHighlight(entry) },
        },
    };
};

// the plugin of Vue which registers the component <GenVis>, of the Vue of
// the page, e.g. `app.use(GenVis.vuePlugin(Vue))` of the standalone script
const vuePlugin = Vue => {
    const component = createVueComponent(Vue);
    return {
        component,
        install(app) {
            app.component('GenVis', component);
        },
    };
};
