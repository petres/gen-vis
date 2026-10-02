<template>
    <div class="hover" ref="hover" :style='{left: left, transform: transform}'>
        <div class="title">{{ title }}</div>
        <table class="entries" ref="entries"/>
    </div>
</template>

<script>
import * as d3 from "d3";

export default {
    // beside the marker, on the `side` with more space
    props: ["title", "side", "data"],
    data: () => ({
        space: 20
    }),
    computed: {
        left() { return (this.side == "left") ? `${-this.space}px` : `${this.space}px` },
        transform() { return (this.side == "left") ? `translate(-100%, -50%)` : `translate(0, -50%)` },
    },
    // the rows are also rendered when the hover is shown, e.g. by a touch
    mounted() {
        this.render();
    },
    watch: {
        data: 'render',
    },
    methods: {
        render() {
            if (!this.$refs.entries || !this.data)
                return;
            const data = [...this.data].sort((a, b) => b.order - a.order)
            let entries = d3.select(this.$refs.entries).selectAll('tr.entry')
                .data(data)
                .join('tr')
                .attr('class', "entry")
                .classed('nearest', d => d.nearest)

            entries.selectAll("td").remove();
            entries.selectAll("td")
                .data(d => Object.entries(d.entries))
                .join("td")
                .attr('class', d => d[0])
                .html(d => typeof d[1] === 'object' ? d[1].name : d[1])
        }
    }
}
</script>


<style lang="scss" scoped>
    .hover {
        position: absolute;
        font-size: 13px;

        .title {
            font-weight: bold;
            padding: 1px 3px;
            border-bottom: 2px solid #000;
            text-align: center;
        }
        background-color: #FFFFFFCC;
        top: 40%;

        :deep(table) {
            border-collapse: collapse;

            tr {
                &.nearest {
                    font-weight: bold;
                }
                td {
                    text-align: left;
                    padding: 1px 5px;
                    &.value {
                        text-align: right;
                    }
                    &.y {
                        text-align: right;
                    }
                }
                td:first-child {
                    border-left: 0;
                }
            }
            margin-left: auto;
            margin-right: auto;
        }
        pointer-events:none;
    }
</style>
