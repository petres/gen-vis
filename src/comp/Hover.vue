<template>
    <div v-if="axis && axis.h" class="hover" ref="hover" :style='{left: left, transform: transform}'>
        <div class="title">{{ axis.h.name }}</div>
        <table class="entries" ref="entries">
            <!-- <tr class="entry">
                <td></td>
            </tr> -->
        </table>
    </div>
</template>

<script>
import { baseStore } from '@/store.js'
import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import * as eu from "@/utils/else";

export default {
    props: ["title", "axis", "side", "data"],
    data: () => ({
        space: 20
    }),
    computed: {
        left() { return (this.side == "left") ? `${this.axis.h.value - this.space}px` : `${this.axis.h.value + this.space}px` },
        transform() { return (this.side == "left") ? `translate(-100%, -50%)` : `translate(0, -50%)` },
    },
    components: {
    },
    created() {
        this.store = baseStore();
    },
    mounted() {
        // console.log(this.axis)
    },
    watch: {
        data() {
            const data = [...this.data].sort((a, b) => b.entries[this.axis.v.col].value - a.entries[this.axis.v.col].value)
            // console.log(data)
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
        top: 0px;
        font-size: 13px;

        .title {
            font-weight: bold;
            padding: 1px 3px;
            border-bottom: 2px solid #000;
            text-align: center;
        }
        background-color: #FFFFFFCC;
        top: 40%;

        // margin: 20px;

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
                    // border-left: 1px solid #777;
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
