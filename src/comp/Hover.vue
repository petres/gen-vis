<template>
    <div class="vis-hover" ref="hover" :style='{left: left, transform: transform}'>
        <!-- the content of the hover slot of the GenVis component, e.g. a table of its own -->
        <slot-content v-if="slots.hover" :fn="slots.hover" :props="slotProps"/>
        <!-- the templates of the definition, options.hover, html -->
        <template v-else-if="template.row">
            <div class="vis-hover-title" v-html="filledTitle"/>
            <div v-for="(row, i) in rows" :key="i" class="vis-hover-row" :class="{ 'vis-nearest': row.nearest }" v-html="row.html"/>
        </template>
        <template v-else>
            <div class="vis-hover-title">{{ title }}</div>
            <table class="vis-hover-entries" ref="entries"/>
        </template>
    </div>
</template>

<script>
import * as d3 from "@/utils/d3";
import { fillHtml } from "@/utils/def";
import SlotContent from '@/comp/SlotContent.vue';

export default {
    // beside the marker, on the `side` with more space, `payload` are the rows
    // of the slot and the events, see Facet.vue, the `cells` of a row are the
    // hover props of its categories (`data-mapping`, other props than the
    // name as `data-prop`) and the value (`vis-value`)
    props: ["title", "side", "data", "payload"],
    inject: ['slots', 'store'],
    components: { SlotContent },
    data: () => ({
        space: 20
    }),
    computed: {
        left() { return { left: `${-this.space}px`, right: `${this.space}px` }[this.side] ?? '0px' },
        // beside the marker or above or below it, e.g. of horizontal bars
        transform() {
            return {
                left: 'translate(-100%, -50%)',
                right: 'translate(0, -50%)',
                above: `translate(-50%, calc(-100% - ${this.space}px))`,
                below: `translate(-50%, ${this.space}px)`,
            }[this.side];
        },
        // the templates of the title and of a row, see README "hover"
        template() { return this.store.def.options.hover ?? {} },
        filledTitle() {
            const template = this.template.title ?? '{title}';
            return fillHtml(template, { ...this.store.def.globals, title: this.title });
        },
        // the rows of the template, its names are the ones of the entries of
        // the slot: {land} is the name of the category, {land.unit} another
        // hover prop, {y} the formatted value and {y.value} the value, and the globals
        rows() {
            return [...(this.data ?? [])].sort((a, b) => b.order - a.order).map(d => {
                const names = { ...this.store.def.globals };
                Object.entries(d.entries).forEach(([n, e]) => {
                    names[n] = e.name;
                    Object.entries(e).forEach(([k, v]) => names[`${n}.${k}`] = v);
                });
                return { nearest: d.nearest, html: fillHtml(this.template.row, names) };
            });
        },
        // the rows and their formatted values, as the ones of the default table
        slotProps() {
            return {
                ...this.payload,
                entries: [...(this.data ?? [])].sort((a, b) => b.order - a.order).map(d => ({ ...d.entries, nearest: d.nearest })),
            };
        },
    },
    // the rows are also rendered when the hover is shown, e.g. by a touch
    mounted() {
        this.render();
    },
    watch: {
        data: 'render',
    },
    methods: {
        render() {
            if (!this.$refs.entries || !this.data)
                return;
            const data = [...this.data].sort((a, b) => b.order - a.order)
            let entries = d3.select(this.$refs.entries).selectAll('tr.vis-hover-entry')
                .data(data)
                .join('tr')
                .attr('class', "vis-hover-entry")
                .classed('vis-nearest', d => d.nearest)

            entries.selectAll("td").remove();
            entries.selectAll("td")
                .data(d => d.cells)
                .join("td")
                .attr('data-mapping', c => c.mapping)
                .attr('data-prop', c => c.prop)
                .attr('class', c => c.value ? 'vis-value' : null)
                .text(c => c.text)
        }
    }
}
</script>


<style lang="scss" scoped>
    .vis-hover {
        position: absolute;
        font-size: 13px;

        .vis-hover-title {
            font-weight: bold;
            padding: 1px 3px;
            border-bottom: 2px solid currentColor;
            text-align: center;
        }
        background-color: var(--gen-vis-hover-background, #FFFFFFCC);
        top: 40%;

        // the rows of the template of the definition
        .vis-hover-row {
            white-space: nowrap;
            padding: 1px 5px;
            &.vis-nearest {
                font-weight: bold;
            }
        }

        :deep(table) {
            border-collapse: collapse;

            tr {
                &.vis-nearest {
                    font-weight: bold;
                }
                // the hover is not wider than needed, its entries are not wrapped
                td {
                    white-space: nowrap;
                    text-align: left;
                    padding: 1px 5px;
                    &.vis-value {
                        text-align: right;
                    }
                }
                td:first-child {
                    border-left: 0;
                }
            }
            margin-left: auto;
            margin-right: auto;
        }
        pointer-events:none;
    }
</style>
