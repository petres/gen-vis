<template>
    <GenVis class="lazy-vis" :def-file="defFile" :debug="debug" check lazy/>
</template>

<script>
import GenVis from '@/comp/App.vue';

// the visualisation is loaded when it is near the visible part of the page,
// with the space of a typical one until then
export default {
    props: { defFile: String, debug: Boolean },
    components: { GenVis },
};
</script>

<style scoped>
    .lazy-vis { --gen-vis-loading-height: 320px; }
</style>
