<template>
    <div>
        halloop {{ store.data }}
        <pre>{{ JSON.stringify(store.def, null, 2) }}</pre>

    </div>
</template>

<script>
import { baseStore } from '@/store.js'

export default {
    setup: () => {
        const store = baseStore();
        store.load();
        return {
            store
        }
    },
    components: {
    },
    created: function() {
    }
}
</script>
