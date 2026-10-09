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
        <!-- the positions of the entries, e.g. years, the visualisation changes while it is moved -->
        <div v-else-if="element.type == 'slider'" class="slider">
            <input type="range" :id="`${uid}-${element.id}`" min="0" :max="element.values.length - 1" step="1" :value="index"
                :aria-valuetext="element.values[index]?.name" @input="moved(+$event.target.value)" @change="moved(+$event.target.value, true)">
            <span class="value">{{ element.values[index]?.name }}</span>
        </div>
    </div>
</template>

<script>
import { sameValue } from "@/utils/def";

// the radio buttons of a form element are a group of their own, also if
// several visualisations on a page use the same ids
let count = 0;

export default {
    props: ["element", "globals"],
    created() {
        this.uid = `gen-vis-form-${count++}`;
    },
    unmounted() {
        cancelAnimationFrame(this.frame);
    },
    computed: {
        vg() { return this.globals[this.element.ref] },
        // the entry of the global, of a slider
        index() { return Math.max(this.element.values.findIndex(e => this.equal(e.value)), 0) },
    },
    methods: {
        switched(entry) {
            if (!entry || this.equal(entry.value))
                return;
            this.globals[this.element.ref] = entry.value;
            this.$emit('changeSelected');
        },
        // the entry of a slider, at most once a frame, the events of a fast
        // move are drawn together, at its end (`change`) at once
        moved(index, end = false) {
            this.position = index;
            if (end) {
                cancelAnimationFrame(this.frame);
                this.frame = null;
                return this.switched(this.element.values[index]);
            }
            this.frame ??= requestAnimationFrame(() => {
                this.frame = null;
                this.switched(this.element.values[this.position]);
            });
        },
        equal(v) { return sameValue(v, this.vg) }
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
        .slider {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            vertical-align: middle;
            input {
                cursor: pointer;
            }
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
