<template>
    <!-- toggles of categories, the colors of a scale otherwise -->
    <template v-for="legend in names" :key="legend">
        <legend-entry v-if="store.mapping(legend).props" :legend="legend" :inData="view?.inData[legend]" @changeSelected="e => $emit('changeSelected', e)" @highlight="e => $emit('highlight', e)"/>
        <component :is="store.colorLegend" v-else-if="store.colorLegend && view?.colors[legend]" :legend="legend" :scale="view.colors[legend]"/>
    </template>
</template>

<script>
import LegendEntry from '@/comp/Legend.vue';

export default {
    // the legends of the mappings `names`, the scales of colors of the view
    props: ["names", "view"],
    emits: ['changeSelected', 'highlight'],
    inject: ['store'],
    components: { LegendEntry },
};
</script>
