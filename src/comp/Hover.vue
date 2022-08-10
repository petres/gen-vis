<template>
    <div class="hover" ref="hover" :style='{left: left, transform: transform}'>
        <div class="title">{{ title }}</div>
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
    props: ["title", "x", "side", "data"],
    data: () => ({
        space: 10
    }),
    computed: {
        left() { return (this.side == "left") ? `${this.x - this.space}px` : `${this.x + this.space}px` },
        transform() { return (this.side == "left") ? `translate(-100%, -50%)` : `translate(0, -50%)` },
    },
    components: {
    },
    created() {
        this.store = baseStore();
    },
    mounted() {
    },
    watch: {
        data(newQuestion, oldQuestion) {
            let axis = [
                { axis: 'x', name: 'x' },
                { axis: 'y', name: 'y' },
            ];

            let entries = d3.select(this.$refs.entries).selectAll('tr.entry')
                .data(this.data)
                .join('tr')
                .attr('class', "entry")

                entries.selectAll("td").remove();
                entries.selectAll("td")
                    .data(d => Object.entries(d))
                    .join("td")
                    .attr('class', d => d[0])
                    .text(d => typeof d[1] === 'object' ? d[1].name : d[1])
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
        background-color: #FFFFFFAA;
        top: 40%;

        // margin: 20px;

        :deep(table) {
            border-collapse: collapse;

            tr {
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
