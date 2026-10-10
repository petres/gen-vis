<template>
    <div class="vis-legend" :data-dim="legend">
        <div class="vis-legend-title">{{ store.text(info.name) }}</div>
        <!-- an entry is a checkbox, also of the keyboard (enter, space), a double
             click shows only it, the next one all entries -->
        <div class="vis-legend-entries" role="group" :aria-label="store.text(info.name)">
            <div v-for="entry of entries" :key="entry.key" class="vis-legend-entry" :data-visible="entry.props.visible" :data-key="entry.key"
                v-bind='Object.assign({...filled[entry.key]}, {name: null})'
                role="checkbox" tabindex="0" :aria-checked="String(entry.props.visible)"
                @click="clicked(entry, $event)" @dblclick="only(entry)"
                @keydown.enter.prevent="switched(entry)" @keydown.space.prevent="switched(entry)"
                @pointerenter="hovered(entry, $event)" @pointerleave="hovered(null, $event)"
                @focus="highlight(entry)" @blur="highlight(null)">
                <LegendSymbol v-if="info.legend.symbol" :info="info.legend.symbol" :props="entry.props"/>
                <span>{{ store.text(filled[entry.key].name) }}</span>
            </div>
        </div>
    </div>
</template>

<script>
import { evaluate } from "@/utils/props";

import LegendSymbol from '@/comp/LegendSymbol.vue';

export default {
    props: ["legend"],
    inject: ['store'],
    data: () => ({
        info: {},
        entries: [],
    }),
    components: {
        LegendSymbol
    },
    computed: {
        // the legend props of the entries, also with the globals of the store
        filled() {
            const scope = this.store.scope;
            return Object.fromEntries(this.entries.map(e =>
                [e.key, evaluate(this.info.legend.props, { ...scope, ...e.props })]));
        },
    },
    mounted() {
        this.info = this.store.mapping(this.legend);
        this.entries = this.info.keys.map(d => ({
            key: d,
            props: this.info.props[d],
        }))
    },
    methods: {
        // the second click of a double click is the one of `only`, the
        // visibility before the first one is kept for it
        clicked(entry, event) {
            if (event.detail > 1)
                return;
            this.before = { entry, visible: this.entries.map(e => e.props.visible) };
            this.switched(entry);
        },
        switched(entry) {
            entry.props.visible = !entry.props.visible;
            this.changed();
        },
        // only the entry, if it is the only one already all entries
        only(entry) {
            const visible = this.before?.entry === entry ? this.before.visible : this.entries.map(e => e.props.visible);
            const alone = this.entries.every((e, i) => visible[i] == (e === entry));
            this.entries.forEach(e => e.props.visible = alone || e === entry);
            this.changed();
        },
        changed() {
            this.$emit('changeSelected', { dim: this.legend });
        },
        // the highlight of the mouse, not of a touch, it has no end
        hovered(entry, event) {
            if (event.pointerType != 'touch')
                this.highlight(entry);
        },
        highlight(entry) {
            this.$emit('highlight', entry ? { dim: this.legend, key: entry.key } : {});
        }
    }
}
</script>

<style lang="scss" scoped>
    .vis-legend {
        .vis-legend-title {
            font-weight: bold;
            font-size: 13px;
            margin: 3px;
            position: relative;
        }
        .vis-legend-entries {
            > div {
                cursor: pointer;
                display: inline-block;
                margin: 0px 5px;
                // no selection of the text of a double click
                user-select: none;
                border-radius: 2px;

                &:focus-visible {
                    outline: 2px solid var(--gen-vis-focus-color, #1E4F77);
                    outline-offset: 1px;
                }

                &[data-visible="false"] {
                    opacity: 0.3;
                }

                span {
                    top: -4px;
                    display: inline-block;
                    position: relative;
                    font-size: 13px;
                }

                &.bold {
                    font-weight: bold;
                }
            }
        }
    }
</style>
