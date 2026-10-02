<template>
    <div class="gallery">
        <header>
            <h1><a href="/">gen-vis</a></h1>
            <template v-if="single">
                <span class="path">{{ single }}</span>
            </template>
            <template v-else>
                <input v-model="query" type="search" placeholder="Filter, e.g. polar or energy/gas" autofocus>
                <span class="count">{{ shown.length }} of {{ defs.length }} definitions</span>
                <nav>
                    <a v-for="g in groups" :key="g.dir" :href="`#${g.dir}`">{{ g.dir }} ({{ g.defs.length }})</a>
                </nav>
            </template>
        </header>

        <!-- a single definition with the prepared and the original one -->
        <GenVis v-if="single" :def-file="`/data/${single}`" debug/>

        <section v-else v-for="g in groups" :key="g.dir" :id="g.dir">
            <h2>{{ g.dir }}</h2>
            <article v-for="d in g.defs" :key="d.path">
                <a class="path" :href="`?def=${d.path}`" title="with the prepared definition">{{ d.path }}</a>
                <LazyVis :def-file="`/data/${d.path}`"/>
            </article>
        </section>
    </div>
</template>

<script>
import GenVis from '@/comp/App.vue';
import LazyVis from '@/dev/LazyVis.vue';
import { definitions } from '@/dev/definitions.js';

// the json files in data/, also of linked directories
const defs = definitions(import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }));

export default {
    components: { GenVis, LazyVis },
    data: () => ({
        defs,
        query: '',
        // ?def=bev/def.json shows one definition
        single: new URLSearchParams(location.search).get('def'),
    }),
    computed: {
        // the words of the filter are in the path, the title or the plot types
        shown() {
            const words = this.query.toLowerCase().split(/\s+/).filter(w => w);
            return this.defs.filter(d => {
                const text = `${d.path} ${d.def.options?.title ?? ''} ${d.def.options?.coord ?? ''} ${JSON.stringify(d.def.plot ?? '')}`.toLowerCase();
                return words.every(w => text.includes(w));
            });
        },
        groups() {
            const groups = new Map();
            this.shown.forEach(d => {
                const dir = d.path.split('/').slice(0, -1).join('/');
                groups.set(dir, [...(groups.get(dir) ?? []), d]);
            });
            return [...groups].map(([dir, defs]) => ({ dir, defs }));
        },
    },
};
</script>

<style lang="scss">
    // the visualisations are not wider on the pages using them
    body {
        margin: 0;
        font-family: Century Gothic, sans-serif;
        background: #F4F4F4;
    }

    .gallery {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 16px 40px;

        header {
            position: sticky;
            top: 0;
            z-index: 10;
            background: #F4F4F4;
            padding: 12px 0 8px;
            border-bottom: 1px solid #DDD;

            h1 {
                display: inline-block;
                font-size: 22px;
                margin: 0 16px 0 0;
                a { color: inherit; text-decoration: none; }
            }
            input {
                font: inherit;
                font-size: 14px;
                padding: 4px 8px;
                width: 280px;
            }
            .count, .path {
                font-size: 13px;
                color: #666;
                margin-left: 12px;
            }
            nav {
                margin-top: 8px;
                font-size: 13px;
                a {
                    margin-right: 12px;
                    color: #1E4F77;
                    white-space: nowrap;
                }
            }
        }

        // below the header, e.g. after a link of the navigation
        section {
            scroll-margin-top: 110px;
        }

        h2 {
            font-size: 16px;
            color: #444;
            margin: 28px 0 8px;
        }

        article {
            background: white;
            border: 1px solid #E2E2E2;
            border-radius: 4px;
            padding: 12px 16px;
            margin-bottom: 16px;

            > .path {
                display: block;
                font-size: 12px;
                color: #888;
                margin-bottom: 8px;
                text-decoration: none;
                &:hover { text-decoration: underline; }
            }
        }

        pre {
            background-color: #EEE;
        }
    }
</style>
