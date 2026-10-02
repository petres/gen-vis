<template>
    <div class="legend" :data-dim="legend">
        <div class="title">{{ info.name }}</div>
        <div class="entries">
            <div v-for="entry of entries" :key="entry.key" :data-visible="entry.props.visible" :data-key="entry.key"
                v-bind='Object.assign({...entry.filled}, {name: null})'
                @click="switched(entry)" @mouseenter="$emit('highlight', {dim: this.legend, key: entry.key})" @mouseleave="$emit('highlight', {})">
                <LegendSymbol v-if="info.legend.symbol" :info="info.legend.symbol" :props="entry.props"/>
                <span v-html='entry.filled.name'/>
            </div>
        </div>
    </div>
</template>

<script>
import * as ju from "@/utils/json";

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
    mounted() {
        this.info = this.store.mapping(this.legend);
        this.entries = Object.keys(this.info.props).map(d => ({
            key: d,
            props: this.info.props[d],
            filled: ju.fillDirect(this.info.legend.props, this.info.props[d]),
        }))
    },
    methods: {
        switched(entry) {
            entry.props.visible = !entry.props.visible;
            this.$emit('changeSelected', {
                dim: this.legend,
                key: entry.key,
                selected: entry.props.visible
            });
        }
    }
}
</script>

<style lang="scss" scoped>
    .legend {
        .title {
            font-weight: bold;
            font-size: 13px;
            margin: 3px;
            position: relative;
        }
        .entries {
            > div {
                cursor: pointer;
                display: inline-block;
                margin: 0px 5px;

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
