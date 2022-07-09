<template>
    <div>
        {{ f }}
        <div>
            <svg ref="svg" :width="width" :height="height">
                <g ref="inner" :transform="`translate(${this.margin.l} ${this.margin.t})`">
                    <g ref="x"/>
                    <g ref="y"/>
                </g>
            </svg>
        </div>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";


export default {
    props: {
        f: {
            default: null,
        }
    },
    data: () => ({
        margin: {l: 50, r: 50, t: 50, b: 50},
        width: 600,
        height: 300,
    }),
    computed: {
        innerWidth() { return this.width - (this.margin.l + this.margin.r) },
        innerHeight() { return this.height - (this.margin.t + this.margin.b) },
    },
    components: {
    },
    mounted() {
        const store = baseStore();
        // const svg = d3.select(this.$refs.svg);
        const inner = d3.select(this.$refs.inner);
        const def = store.def;

        const mapping = def.mapping;

        let data = store.data;

        if (this.f) {
            data = data.filter(d => d[mapping.f] == this.f)
        }

    }
}
</script>
