<template>
    <svg :width="info.size" :height="info.size" ref="legendSymbol"/>
</template>

<script>
import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { setProps } from "@/utils/draw";

export default {
    props: ["info", "props"],
    inject: ['store'],
    computed: {
        scope() { return { ...this.store.scope, ...this.props } },
    },
    // drawn again if the globals change, e.g. of a form element
    watch: {
        scope() { this.draw() },
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
                setProps.call(el.node(), evaluate(e.props, this.scope))
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
