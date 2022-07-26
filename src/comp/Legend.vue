<template>
    <div ref="legend" class="legend" :data-dim="legend">
        <div class="title">{{ info.name }}</div>
        <div ref="entries" class="entries">
            <div v-for="entry of entries" class="entry" :data-visible="entry.props.visible" :data-key="entry.key" @click="switched(entry)">
                <LegendSymbol :size="info.legend.size" :elements="info.legend.elements" :props="entry.props"/>
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
        info: {},
        entries: [],
    }),
    components: {
        LegendSymbol
    },
    mounted() {
        const store = baseStore();
        this.vis = d3.select(this.$refs.legend.closest('.vis'));
        this.info = store.mapping(this.legend);
        this.entries = Object.keys(this.info.props).map(d => ({
            key: d,
            props: this.info.props[d]
        }))
    },
    methods: {
        switched(entry) {
            entry.props.visible = !entry.props.visible
            const info = { dim: this.legend, key: entry.key, selected: entry.props.visible}

            this.$emit('changeSelectedLegend', info);
            // this.vis.select(`.vis-legends .legend[data-dim="${info.dim}"] .entry[data-key="${info.key}"]`)
            //     .attr('data-visible', info.selected);
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
            .entry {
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
            }
        }
    }
</style>
