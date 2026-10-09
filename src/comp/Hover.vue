<template>
    <div class="vis-hover" ref="hover" :style='{left: left, transform: transform}'>
        <!-- the content of the hover slot of the GenVis component, e.g. a table of its own -->
        <slot-content v-if="slots.hover" :fn="slots.hover" :props="slotProps"/>
        <template v-else>
            <div class="vis-hover-title">{{ title }}</div>
            <table class="vis-hover-entries" ref="entries"/>
        </template>
    </div>
</template>

<script>
import * as d3 from "@/utils/d3";
import SlotContent from '@/comp/SlotContent.vue';

export default {
    // beside the marker, on the `side` with more space, `payload` are the rows
    // of the slot and the events, see Facet.vue, `value` is the mapping of the
    // values, e.g. of the vertical axis, its cells have the class `vis-value`,
    // the cells have the name of their mapping as `data-mapping`
    props: ["title", "side", "data", "payload", "value"],
    inject: ['slots'],
    components: { SlotContent },
    data: () => ({
        space: 20
    }),
    computed: {
        left() { return (this.side == "left") ? `${-this.space}px` : `${this.space}px` },
        transform() { return (this.side == "left") ? `translate(-100%, -50%)` : `translate(0, -50%)` },
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
                .data(d => Object.entries(d.entries))
                .join("td")
                .attr('data-mapping', ([name]) => name)
                .attr('class', ([name]) => name == this.value ? 'vis-value' : null)
                .html(d => typeof d[1] === 'object' ? d[1].name : d[1])
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
