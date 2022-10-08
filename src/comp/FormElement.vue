<template>
    <div class="formElement" :id="`container-${element.id}`">
        <div class="title">{{ element.name }}:</div>
        <div v-if="element.type == 'switch'" class="entries">
            <div v-for="e of element.values" :id="`container-${e.id}`" @click="switched(e)">
                <input type="radio" :name="element.id" :value="e.id" :checked="equal(e.value)">
                <label :for="e.id">{{ e.name }}</label>
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
    props: ["element", "globals"],
    data: () => ({
    }),
    computed: {
        vg() { return this.globals[this.element.ref] }
    },
    components: {
        LegendSymbol
    },
    mounted() {
    },
    methods: {
        switched(entry) {
            this.globals[this.element.ref] = entry.value;
            this.$emit('changeSelected', {
            });
        },
        equal(v) { 
            if (v == this.vg)
                return true;
            
            return JSON.stringify(v) == JSON.stringify(this.vg);
        }
    }
}
</script>

<style lang="scss" scoped>
    .formElement {
        font-size: 13px;
        margin: 6px 4px;
        .title {
            font-weight: bold;
            margin-right: 5px;
            display: inline-block;
        }
        .entries {
            display: inline-block;
            > div {
                display: inline-block;
                margin-right: 5px;
                input {
                    position: relative;
                    display: inline-block;
                    top: 1px;
                }
            }
        }
    }
</style>
