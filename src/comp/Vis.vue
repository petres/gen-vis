<template>
    <div class="vis" ref="vis" :style="{'--gen-vis-font-family': options.fontFamily}">
        <div class="vis-header">
            <slot-content v-if="slots.header" :fn="slots.header" :props="header"/>
            <template v-else>
                <div class="title">{{ header.title }}</div>
                <div class="subtitle">{{ header.subtitle }}</div>
            </template>
        </div>
        <div ref="form" class="vis-form-elements">
            <form-element v-for="element in formElements" :key="element.id" :element="element" :globals="globals" @changeSelected="formChanged"/>
        </div>
        <div ref="legends" class="vis-legends">
            <!-- toggles of categories, the colors of a scale otherwise -->
            <template v-for="legend in legends" :key="legend">
                <legend-entry v-if="store.mapping(legend).props" :legend="legend" @changeSelected="changeSelected" @highlight="highlight"/>
                <color-legend v-else-if="store.mapping(legend).scale && view" :legend="legend" :scale="view.colors[legend]"/>
            </template>
        </div>
        <div v-if="view" class="vis-body">
            <!-- the facets are rendered again if their rows change -->
            <template v-if="view.faceted">
                <div v-for="f in view.facets" :key="f.key" :style="`width: ${f.width}px; display: inline-block;`">
                    <div class="facet-title" :style="`margin-left: ${f.margins.left}px`">{{ store.text(f.name) }}</div>
                    <facet :key="f.rows" :facet="f"/>
                </div>
            </template>
            <facet v-else :key="view.facets[0].rows" :facet="view.facets[0]"/>
        </div>
        <div class="vis-footer">
            <div class="vis-footer-content">
                <slot-content v-if="slots.footer" :fn="slots.footer" :props="{ footer: store.text(options.footer) }"/>
                <span v-else v-html="store.text(options.footer)"/>
            </div>
            <!-- the buttons of the page (the slot buttons), copy, check and
                 download of the feather icons, at the right end of the plots -->
            <div v-if="slots.buttons || (copy && clipboard) || download" class="vis-buttons" :style="{ marginRight: `${options.margins?.right ?? 0}px` }">
                <slot-content v-if="slots.buttons" :fn="slots.buttons" :props="{ save: image.save, copy: image.copy, canCopy: clipboard }"/>
                <button v-if="copy && clipboard" class="vis-copy" :title="copied ? texts.copied : texts.copy" :aria-label="texts.copy" @click="copyPng">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path v-if="copied" d="M20 6L9 17l-5-5"/>
                        <path v-else d="M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
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
import * as d3 from "@/utils/d3";

import { highlightElements } from "@/utils/draw";
import { layout } from "@/layout";
import { canCopy } from "@/utils/export.js";

import Facet from '@/comp/Facet.vue';
import LegendEntry from '@/comp/Legend.vue';
import ColorLegend from '@/comp/ColorLegend.vue';
import SlotContent from '@/comp/SlotContent.vue';
import FormElement from '@/comp/FormElement.vue';


export default {
    inject: ['store', 'slots', 'image'],
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

        options: { ...this.store.def.options },
        globals: {},

        legends: [],
        formElements: [],
    } },
    components: {
        Facet, LegendEntry, ColorLegend, FormElement, SlotContent,
    },
    watch: {
        // the state was set from outside
        'store.stateSets'() {
            this.update();
        },
    },
    computed: {
        texts() { return this.store.locale.texts },
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
    },
    unmounted() {
        this.resizeObserver?.disconnect();
        clearTimeout(this.resizeTimeout);
        clearTimeout(this.copiedTimeout);
    },
    methods: {
        baseInit() {
            this.legends = this.store.mappingNamesWithKey('legend')
            this.formElements = this.store.def.formElements;
            this.globals = this.store.def.globals;

            this.options = Object.assign({}, this.store.def.options);
            this.measure();
        },
        measure() {
            this.options.width = this.store.def.options.width || this.$refs.vis.getBoundingClientRect().width;
            this.store.totalWidth = this.options.width;
        },
        resized() {
            const width = this.$refs.vis?.getBoundingClientRect().width;
            if (!width || width == this.options.width)
                return;
            this.measure();
            this.update();
        },
        // the rows, facets and scales of the store
        update() {
            this.view = markRaw(layout(this.store, this.options.width));
        },
        changeSelected() {
            this.update();
            this.$emit('stateChanged');
        },
        formChanged() {
            this.store.applyFormElements();
            this.changeSelected();
        },
        async savePng() {
            try {
                await this.image.save();
            } catch (error) {
                console.error(error);
            }
        },
        async copyPng() {
            try {
                await this.image.copy();
                this.copied = true;
                clearTimeout(this.copiedTimeout);
                this.copiedTimeout = setTimeout(() => this.copied = false, 1500);
            } catch (error) {
                console.error(error);
            }
        },
        highlight(info) {
            highlightElements(d3.select(this.$refs.vis), this.store.def.plot, {[info.dim]: info.key})
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
        .title {
            font-size: 22px;
            font-weight: bold;
        }

        .subtitle {
            font-size: 13px;
            margin-top: 3px;
        }

        // the line of the selection of the form elements in the images
        .selection {
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

    .vis-copy, .vis-download {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
        svg {
            display: block;
            fill: none;
            stroke: #BBB;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        &:hover svg {
            stroke: #777;
        }
    }

    .facet-title {
        font-size: 13px;
        font-weight: bold;
        margin-top: 8px;
    }
</style>
