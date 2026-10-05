<template>
    <svg :width="info.size" :height="info.size" ref="legendSymbol"/>
</template>

<script>
import * as d3 from "d3";
import * as ju from "@/utils/json";
import * as pu from "@/utils/plot";

export default {
    props: ["info", "props"],
    inject: ['store'],
    computed: {
        bases() { return { ...this.store.bases, ...this.props } },
    },
    // drawn again if the globals change, e.g. of a form element
    watch: {
        bases() { this.draw() },
    },
    mounted() {
        this.draw();
    },
    methods: {
        draw() {
            const svg = d3.select(this.$refs.legendSymbol);
            svg.selectAll("*").remove();
            this.info.elements.forEach(e => {
                const el = svg.append(e.type);
                pu.setProps.call(el.node(), ju.fillDirect(e.props, this.bases))
            });
        },
    }
}
</script>

<style lang="scss" scoped>
    svg {
        display: inline-block;
        margin-right: 5px;
    }
</style>
