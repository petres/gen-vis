<template>
    <div class="legend" :data-dim="legend">
        <div class="title">{{ info.name }}</div>
        <div class="entries">
            <div v-for="entry of entries" :data-visible="entry.props.visible" :data-key="entry.key" @click="switched(entry)" v-bind='ju.fillDirect(info.legend.props, entry.props)'>
                <LegendSymbol v-if="info.legend.symbol" :info="info.legend.symbol" :props="entry.props"/>
                <span>{{ entry.props.name }}</span>
            </div>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'

import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";

import LegendSymbol from '@/comp/LegendSymbol.vue';

export default {
    props: ["legend"],
    data: () => ({
        ju: ju,
        info: {},
        entries: [],
    }),
    components: {
        LegendSymbol
    },
    mounted() {
        const store = baseStore();
        this.info = store.mapping(this.legend);
        this.entries = Object.keys(this.info.props).map(d => ({
            key: d,
            props: this.info.props[d]
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
            // display: inline-block;
            // top: -4px;
            position: relative;
            // margin-right: 20px;
        }
        .entries {
            // display: inline-block;
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
