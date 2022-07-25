<template>
    <svg :width="size" :height="size" ref="legendSymbol" class="legendSymbol"/>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";


export default {
    props: ["size", "elements", "props"],
    mounted() {
        const svg = d3.select(this.$refs.legendSymbol)
        // console.log(this.elements)
        this.elements.forEach(e => {
            const el = svg.append(e.type);
            pu.setProps.call(el.node(), ju.fill(e.props, this.props))
        });
    }
}
</script>
<!--

<style lang="scss" scoped>
    :deep(svg) {
        display: inline-block;
        margin-right: 5px;
        // border: 1px solid #BBB;
        // border-radius: 3px;
    }
</style> -->
