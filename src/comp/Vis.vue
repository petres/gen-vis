<template>
    <div class="vis" ref="vis" :class="rootClass" v-bind="globalAttrs" :style="{'--gen-vis-font-family': options.fontFamily}">
        <div class="vis-header">
            <slot-content v-if="slots.header" :fn="slots.header" :props="header"/>
            <template v-else>
                <div class="vis-title">{{ header.title }}</div>
                <div class="vis-subtitle">{{ header.subtitle }}</div>
            </template>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :key="element.id" :element="element" :globals="globals" @changeSelected="formChanged"/>
        </div>
        <!-- a text instead of the plots and the legends, e.g. of a narrow screen -->
        <div v-if="message" class="vis-message">{{ message }}</div>
        <template v-else>
        <div class="vis-legends">
            <legends :names="legendsAt.top" :view="view" @changeSelected="changeSelected" @highlight="highlight"/>
        </div>
        <!-- the legends beside the plots, the plots have the width of the rest -->
        <div v-if="sides" class="vis-body vis-body-sides">
            <div v-if="legendsAt.left.length" class="vis-legends vis-legends-left">
                <legends :names="legendsAt.left" :view="view" @changeSelected="changeSelected" @highlight="highlight"/>
            </div>
            <div ref="plots" class="vis-plots">
                <facets v-if="view" ref="facets" :view="view"/>
            </div>
            <div v-if="legendsAt.right.length" class="vis-legends vis-legends-right">
                <legends :names="legendsAt.right" :view="view" @changeSelected="changeSelected" @highlight="highlight"/>
            </div>
        </div>
        <div v-else-if="view" class="vis-body">
            <facets ref="facets" :view="view"/>
        </div>
        <div v-if="legendsAt.bottom.length" class="vis-legends vis-legends-bottom">
            <legends :names="legendsAt.bottom" :view="view" @changeSelected="changeSelected" @highlight="highlight"/>
        </div>
        </template>
        <div class="vis-footer">
            <div class="vis-footer-content">
                <slot-content v-if="slots.footer" :fn="slots.footer" :props="{ footer: store.html(options.footer) }"/>
                <!-- html of the definition, e.g. a link of the source, the values of the globals are text -->
                <span v-else v-html="store.html(options.footer)"/>
            </div>
            <!-- the buttons of the page (the slot buttons), copy, check, file-text
                 and download of the feather icons, at the right end of the plots -->
            <div v-if="slots.buttons || (copy && clipboard) || csv || download" class="vis-buttons" :style="{ marginRight: `${view?.facets[0]?.margins.right ?? 0}px` }">
                <slot-content v-if="slots.buttons" :fn="slots.buttons" :props="{ save: files.save, copy: files.copy, csv: files.csv, canCopy: clipboard }"/>
                <button v-if="copy && clipboard" class="vis-copy" :title="copied ? texts.copied : texts.copy" :aria-label="texts.copy" @click="copyPng">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path v-if="copied" d="M20 6L9 17l-5-5"/>
                        <path v-else d="M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
                <button v-if="csv" class="vis-csv" :title="texts.csv" :aria-label="texts.csv" @click="files.csv()">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                    </svg>
                </button>
                <button v-if="download" class="vis-download" :title="texts.download" :aria-label="texts.download" @click="savePng">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import { markRaw } from 'vue';

import { layout } from "@/layout";
import { evaluate } from "@/utils/props";
import { reducedMotion } from "@/utils/draw";
import { canCopy } from "@/utils/clipboard.js";

import Facets from '@/comp/Facets.vue';
import Legends from '@/comp/Legends.vue';
import SlotContent from '@/comp/SlotContent.vue';
import FormElement from '@/comp/FormElement.vue';

// the width of the visualisation inside its padding and border, e.g. of a card
// styled by the page, the svg fills only this part
const innerWidth = el => {
    const style = getComputedStyle(el);
    const sides = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((sum, p) => sum + (parseFloat(style[p]) || 0), 0);
    return el.getBoundingClientRect().width - sides;
};

export default {
    inject: ['store', 'slots', 'files'],
    // the buttons of the footer to save the visualisation as a PNG and to
    // copy it, see App.vue
    props: {
        download: {
            type: [Boolean, String],
            default: false,
        },
        copy: {
            type: Boolean,
            default: false,
        },
        csv: {
            type: [Boolean, String],
            default: false,
        },
    },
    // the user changed the state, see store.state, rendered once it is drawn
    emits: ['stateChanged', 'rendered'],
    // the options of the definition already in the first render, e.g. of the header slot
    data() { return {
        // the rows, facets and scales, see layout.js
        view: null,
        // the check instead of the icon of the copy for a while
        copied: false,
        clipboard: canCopy(),

        // the width of the plots and of the visualisation, see measure
        width: null,
        fullWidth: null,
        globals: {},

        formElements: [],
    } },
    components: {
        Facets, Legends, FormElement, SlotContent,
    },
    watch: {
        // legends beside the plots or not anymore, e.g. of a new width, the
        // plots have another width
        sides() {
            this.$nextTick(() => this.resized());
        },
        // the state was set from outside
        'store.stateSets'() {
            this.update(true);
        },
    },
    computed: {
        texts() { return this.store.locale.texts },
        // the options of the definition, a form element can patch them
        options() { return this.store.def.options },
        // the mappings of the legends by their position, `top` by default, a
        // form element can patch them
        legendsAt() {
            const at = { top: [], bottom: [], left: [], right: [] };
            // a prop of the width of the visualisation, e.g. below the plots of a phone
            const scope = { ...this.store.scope, totalWidth: this.fullWidth };
            // the legends of the width of the visualisation, see ColorLegend.vue
            this.store.mappingNamesWithKey('legend').forEach(n => at[evaluate(this.store.mapping(n).legend.position, scope) ?? 'top']?.push(n));
            return at;
        },
        // the text instead of the plots: `options.message`, a prop of the
        // globals and the width, e.g. steps of `totalWidth` or a patch of a
        // form element, or `options.empty` without rows
        message() {
            const scope = { ...this.store.scope, totalWidth: this.width };
            const message = this.store.text(evaluate(this.options.message ?? null, scope));
            if (message !== null && message !== undefined && message !== '')
                return String(message);
            return this.view && this.view.rows.length == 0 && this.options.empty ? this.store.text(this.options.empty) : null;
        },
        // the class of the definition, a template of the globals, e.g. for the styles of a page
        rootClass() { return this.options.class ? this.store.text(this.options.class) : null },
        // the globals as data-global- attributes, e.g. for the styles of a
        // page of a form element, only the ones of names and values of text
        globalAttrs() {
            return Object.fromEntries(Object.entries(this.store.def.globals)
                .filter(([k, v]) => /^[A-Za-z][\w-]*$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v))
                .map(([k, v]) => [`data-global-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, String(v)]));
        },
        // legends beside the plots
        sides() { return this.legendsAt.left.length > 0 || this.legendsAt.right.length > 0 },
        // the title and the subtitle with the values of the globals, e.g.
        // "Durchschnitt {base} = 100" of a form element
        header() {
            return { title: this.store.text(this.options.title), subtitle: this.store.text(this.options.subtitle) };
        },
    },
    mounted() {
        this.baseInit();
        this.update();
        // the facets are drawn in the render of the view
        this.$nextTick(() => this.$emit('rendered'));

        // without a fixed width the visualisation fills its container
        if (!this.store.def.options.width) {
            this.resizeObserver = new ResizeObserver(() => {
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(this.resized, 100);
            });
            this.resizeObserver.observe(this.$refs.vis);
        }
        // the plots beside legends have the width of the rest, e.g. after the
        // first draw of a legend of colors
        if (this.sides)
            this.$nextTick(() => this.resized());
    },
    unmounted() {
        this.resizeObserver?.disconnect();
        clearTimeout(this.resizeTimeout);
        clearTimeout(this.copiedTimeout);
    },
    methods: {
        baseInit() {
            // hidden form elements have no element, their globals are set by the page
            this.formElements = this.store.def.formElements.filter(e => e.type != 'hidden');
            this.globals = this.store.def.globals;

            this.measure();
        },
        // the width of the plots, of the visualisation or of the definition,
        // beside legends the rest of it
        plotsWidth() {
            const total = this.store.def.options.width || innerWidth(this.$refs.vis);
            this.fullWidth = this.store.visWidth = total;
            if (!this.sides)
                return total;
            const legends = [...this.$refs.vis.querySelectorAll(':scope > .vis-body-sides > .vis-legends')]
                .reduce((sum, e) => sum + e.getBoundingClientRect().width + 10, 0);
            return this.store.def.options.width || !this.$refs.plots
                ? Math.max(0, total - legends) : innerWidth(this.$refs.plots);
        },
        measure() {
            this.width = this.plotsWidth();
            this.store.totalWidth = this.width;
        },
        resized() {
            const width = this.$refs.vis && this.plotsWidth();
            if (!width || width == this.width)
                return;
            this.measure();
            this.update();
        },
        // the rows, facets and scales of the store, `animated` of a change of
        // the user or the state, the elements move with the transition of
        // the definition, not the ones of a new width
        update(animated = false) {
            const view = layout(this.store, this.width);
            const transition = this.store.def.options.transition;
            // no motion if the user prefers it, a setting of the system
            const duration = animated && !reducedMotion() ? (transition === true ? 300 : (Number(transition) || 0)) : 0;
            view.facets.forEach(f => f.transition = duration);
            this.view = markRaw(view);
        },
        changeSelected() {
            this.update(true);
            this.$emit('stateChanged');
        },
        formChanged() {
            this.store.applyFormElements();
            this.changeSelected();
        },
        async savePng() {
            try {
                await this.files.save();
            } catch (error) {
                console.error(error);
            }
        },
        async copyPng() {
            try {
                await this.files.copy();
                this.copied = true;
                clearTimeout(this.copiedTimeout);
                this.copiedTimeout = setTimeout(() => this.copied = false, 1500);
            } catch (error) {
                console.error(error);
            }
        },
        // the elements of the category of an entry of a legend in all facets
        highlight(info) {
            this.$refs.facets?.highlight(info.dim === undefined ? null : {[info.dim]: info.key});
        }
    }
}
</script>


<style lang="scss" scoped>
    // the font can be set with options.fontFamily or the css variable
    .vis {
        :deep(text), :deep(span), :deep(div) {
            font-family: var(--gen-vis-font-family, Century Gothic, sans-serif);
        }
    }

    .vis-header {
        .vis-title {
            font-size: 22px;
            font-weight: bold;
        }

        .vis-subtitle {
            font-size: 13px;
            margin-top: 3px;
        }

        // the line of the selection of the form elements in the images
        .vis-selection {
            font-size: 13px;
            margin-top: 6px;
        }
        margin-bottom: 10px;
    }

    // the button at the right of the footer
    .vis-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 10px;

        span {
            font-size: 13px;
        }
    }

    .vis-buttons {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .vis-copy, .vis-csv, .vis-download {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
        svg {
            display: block;
            fill: none;
            stroke: var(--gen-vis-button-color, #BBB);
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        &:hover svg {
            stroke: var(--gen-vis-button-hover-color, #777);
        }
    }

    // the text instead of the plots
    .vis-message {
        font-size: 14px;
        padding: 40px 10px;
        text-align: center;
    }
    // the legends beside the plots, the plots have the rest of the width
    .vis-body-sides {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        .vis-plots {
            flex: 1 1 0;
            min-width: 0;
        }
        .vis-legends-left, .vis-legends-right {
            flex: none;
            // the entries of the categories one below the other
            :deep(.vis-legend-entries > .vis-legend-entry) {
                display: block;
                margin: 2px 5px;
            }
        }
    }
</style>
