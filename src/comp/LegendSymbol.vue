<template>
    <svg :width="info.size" :height="info.size" ref="legendSymbol"/>
</template>

<script>
import { create } from "@/utils/dom";
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
            const svg = this.$refs.legendSymbol;
            svg.replaceChildren();
            this.info.elements.forEach(e => {
                const el = svg.appendChild(create(e.type));
                setProps.call(el, evaluate(e.props, this.scope));
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
