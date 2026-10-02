<template>
    <div class="formElement" :id="`container-${element.id}`">
        <div class="title">{{ element.name }}:</div>
        <select v-if="element.type == 'select'" :id="`${uid}-${element.id}`" @change="switched(element.values[$event.target.selectedIndex])">
            <option v-for="e of element.values" :key="e.id" :value="e.id" :selected="equal(e.value)">{{ e.name }}</option>
        </select>
        <div v-else-if="element.type == 'switch'" class="entries">
            <!-- the change of the radio button, by its label, a click or the keyboard -->
            <div v-for="e of element.values" :key="e.id" :id="`container-${e.id}`">
                <input type="radio" :id="`${uid}-${element.id}-${e.id}`" :name="`${uid}-${element.id}`" :value="e.id" :checked="equal(e.value)" @change="switched(e)">
                <label :for="`${uid}-${element.id}-${e.id}`">{{ e.name }}</label>
            </div>
        </div>
    </div>
</template>

<script>
import * as ju from "@/utils/json";

// the radio buttons of a form element are a group of their own, also if
// several visualisations on a page use the same ids
let count = 0;

export default {
    props: ["element", "globals"],
    created() {
        this.uid = `gen-vis-form-${count++}`;
    },
    computed: {
        vg() { return this.globals[this.element.ref] }
    },
    methods: {
        switched(entry) {
            this.globals[this.element.ref] = entry.value;
            this.$emit('changeSelected');
        },
        equal(v) { return ju.sameValue(v, this.vg) }
    }
}
</script>

<style lang="scss" scoped>
    // several form elements are in one line, wrapped if there is not enough space
    .formElement {
        display: inline-block;
        font-size: 13px;
        margin: 2px 16px 2px 4px;
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
                input, label {
                    cursor: pointer;
                }
            }
        }
    }
</style>
