<template>
    <div class="page gallery">
        <header class="hero">
            <div class="brand">
                <a class="wordmark" href="./">gen-vis</a>
                <span class="version">{{ version }}</span>
                <nav class="links">
                    <a href="./">Examples</a>
                    <a href="guide.html">How it works</a>
                    <a :href="readme">Readme</a>
                    <a :href="`${repo}/blob/${branch}/docs/definition.md`">Definition language</a>
                    <a :href="repo">GitHub</a>
                </nav>
            </div>
            <h1>Gallery</h1>
            <p class="lead">
                One chart of every kind the library draws, the definitions of the repository as they are
                (<code>data/</code>, the charts the tests draw) with the look of the package. The definition of
                every chart is beside it, edit it and the chart follows; a chart with parents shows the merged
                definition as well, and its data.
            </p>
            <nav class="toc" aria-label="Contents">
                <a v-for="(e, i) in gallery" :key="e.id" :href="`#${e.id}`">
                    <span>{{ String(i + 1).padStart(2, '0') }}</span> {{ e.name }}
                </a>
            </nav>
        </header>

        <main>
            <p v-if="error" class="intro">{{ error }}</p>
            <template v-if="texts">
                <GalleryItem v-for="(e, i) in gallery" :key="e.id" :entry="e" :index="i" :text="texts[e.file]"/>
            </template>
            <p v-else-if="!error" class="intro">Loading the definitions ...</p>
        </main>

        <footer class="foot">
            <p>
                The definitions are the ones of <a :href="`${repo}/tree/${branch}/data`">data/</a> of the
                repository, drawn by the tests of every version; the <a href="./">examples</a> show the library
                in the looks of pages.
            </p>
        </footer>
    </div>
</template>

<script>
import GalleryItem from './components/GalleryItem.vue';
import gallery from './gallery/index.js';

const repo = 'https://github.com/petres/gen-vis';

export default {
    components: { GalleryItem },
    data: () => ({
        gallery,
        repo,
        version: __VERSION__,
        branch: __BRANCH__,
        readme: `${repo}/blob/${__BRANCH__}/README.md`,
        texts: null,
        error: null,
    }),
    // the texts of the definitions as they are in their files, for the editors
    async mounted() {
        try {
            const entries = await Promise.all(gallery.map(async e => {
                const response = await fetch(`gallery-data/${e.file}`);
                if (!response.ok)
                    throw new Error(`${e.file}: ${response.status} ${response.statusText}`);
                return [e.file, await response.text()];
            }));
            this.texts = Object.fromEntries(entries);
        } catch (e) {
            this.error = `The definitions could not be loaded: ${e.message}`;
        }
    },
};
</script>
