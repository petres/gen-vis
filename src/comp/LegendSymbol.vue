<template>
    <svg :width="info.size" :height="info.size" ref="legendSymbol"/>
</template>

<script>
import * as d3 from "d3";
import * as ju from "@/utils/json";
import * as pu from "@/utils/plot";

export default {
    props: ["info", "props"],
    mounted() {
        const svg = d3.select(this.$refs.legendSymbol)
        this.info.elements.forEach(e => {
            const el = svg.append(e.type);
            pu.setProps.call(el.node(), ju.fill(e.props, this.props))
        });
    }
}
</script>

<style lang="scss" scoped>
    svg {
        display: inline-block;
        margin-right: 5px;
    }
</style>
