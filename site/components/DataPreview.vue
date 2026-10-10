<template>
    <div class="data">
        <p v-if="error" class="data-error">{{ error }}</p>
        <template v-else-if="table">
            <p class="data-info">
                <a :href="url" download>{{ file }}</a> · {{ table.rows.toLocaleString('en') }} rows, the first {{ table.head.length }}
            </p>
            <table>
                <thead><tr><th v-for="c in table.columns" :key="c">{{ c }}</th></tr></thead>
                <tbody>
                    <tr v-for="(r, i) in table.head" :key="i"><td v-for="c in table.columns" :key="c">{{ r[c] }}</td></tr>
                </tbody>
            </table>
        </template>
        <p v-else class="data-info">Loading…</p>
    </div>
</template>

<script>
import { csvParse } from 'd3-dsv';

// the first rows of the data of the definition
export default {
    props: { url: String },
    data: () => ({ table: null, error: null }),
    computed: {
        file() { return this.url?.split('/').pop() },
    },
    watch: {
        url: { handler: 'load', immediate: true },
    },
    methods: {
        async load() {
            this.table = null;
            this.error = null;
            if (!this.url)
                return this.error = 'The definition has no url of the data.';
            try {
                const response = await fetch(this.url);
                if (!response.ok)
                    throw new Error(`${response.status} ${response.statusText}`);
                const rows = csvParse(await response.text());
                this.table = { columns: rows.columns, rows: rows.length, head: rows.slice(0, 40) };
            } catch (error) {
                this.error = `Could not load ${this.url}: ${error.message}`;
            }
        },
    },
};
</script>
