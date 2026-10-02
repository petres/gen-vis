<template>
    <div ref="el" class="lazy-vis" :style="{ minHeight: visible ? null : '320px' }">
        <GenVis v-if="visible" :def-file="defFile" :debug="debug"/>
    </div>
</template>

<script>
import GenVis from '@/comp/App.vue';

// the visualisation is loaded when it is near the visible part of the page
export default {
    props: { defFile: String, debug: Boolean },
    components: { GenVis },
    data: () => ({ visible: false }),
    mounted() {
        this.observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                this.visible = true;
                this.observer.disconnect();
            }
        }, { rootMargin: '400px' });
        this.observer.observe(this.$refs.el);
    },
    unmounted() {
        this.observer.disconnect();
    },
};
</script>
