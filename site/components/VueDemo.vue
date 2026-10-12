<template>
    <div class="vue-demo">
        <GenVis def-file="charts/prices.json" v-model:state="state" csv @select="selected = $event"/>
        <dl>
            <dt>v-model:state <button type="button" :disabled="!state" @click="state = null">Reset</button></dt>
            <dd><pre>{{ JSON.stringify(state) }}</pre></dd>
            <dt>@select, a click or enter</dt>
            <dd><pre>{{ selected ? `${selected.title}: ${selected.nearest?.fuel} ${selected.nearest?.y}` : '–' }}</pre></dd>
        </dl>
    </div>
</template>

<script>
import { GenVis } from '@preschen/gen-vis';

export default {
    components: { GenVis },
    data: () => ({ state: null, selected: null }),
};
</script>
