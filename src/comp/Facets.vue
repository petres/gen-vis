<template>
    <!-- a new view is drawn into the facets of the one before, see Facet.vue -->
    <template v-if="view.faceted">
        <div v-for="f in view.facets" :key="String(f.key)" :style="`width: ${f.width}px; display: inline-block;`">
            <div class="vis-facet-title" :style="`margin-left: ${f.margins.left}px`">{{ store.text(f.name) }}</div>
            <facet ref="facets" :facet="f"/>
        </div>
    </template>
    <facet v-else ref="facets" :facet="view.facets[0]"/>
</template>

<script>
import Facet from '@/comp/Facet.vue';

export default {
    // the facets of the view, see layout.js
    props: ["view"],
    inject: ['store'],
    components: { Facet },
    methods: {
        // the elements of a row in all facets, null ends the highlight
        highlight(entry) {
            [this.$refs.facets ?? []].flat().forEach(f => f.highlight(entry));
        },
    },
};
</script>

<style lang="scss" scoped>
    .vis-facet-title {
        font-size: 13px;
        font-weight: bold;
        margin-top: 8px;
    }
</style>
