<template>
    <div class="page">
        <header class="hero">
            <div class="brand">
                <span class="wordmark">gen-vis</span>
                <span class="version">{{ version }}</span>
                <nav class="links">
                    <a :href="readme">Readme</a>
                    <a :href="`${repo}/blob/${branch}/CHANGELOG.md`">Changelog</a>
                    <a href="https://www.npmjs.com/package/@preschen/gen-vis">npm</a>
                    <a :href="repo">GitHub</a>
                </nav>
            </div>
            <h1>Charts from JSON,<br>styled by your page.</h1>
            <p class="lead">
                A declarative d3 visualisation library for Vue: a chart is a JSON definition and a
                data file. Lines, bars, areas, polar plots and maps, with legends, hover, facets
                and form elements.
            </p>
            <p class="lead">
                The five charts below look nothing alike, and none of the looks is built in. The
                marks and colors come from the definition, everything else from the CSS of the
                page. Edit either one and the chart follows as you type.
            </p>
            <pre class="install"><code>npm install @preschen/gen-vis@alpha</code></pre>
            <nav class="toc" aria-label="Examples">
                <a v-for="(e, i) in examples" :key="e.id" :href="`#${e.id}`">
                    <span>{{ String(i + 1).padStart(2, '0') }}</span> {{ e.name }}
                </a>
            </nav>
        </header>

        <main>
            <Example v-for="(e, i) in examples" :key="e.id" :example="e" :index="i"/>
        </main>

        <section class="usage">
            <h2>Use it</h2>
            <div class="usage-grid">
                <div>
                    <h3>Vue component</h3>
<pre><code>import GenVis from '@preschen/gen-vis';
app.use(GenVis);

&lt;GenVis def-file="/charts/prices.json" download csv/&gt;
&lt;GenVis :def="def" :data="rows"/&gt;</code></pre>
                </div>
                <div>
                    <h3>Standalone script</h3>
<pre><code>&lt;div class="genVis" data-def-file="/charts/prices.json"&gt;&lt;/div&gt;

&lt;script src="gen-vis-{{ version }}.js"&gt;&lt;/script&gt;
&lt;script&gt;mountGenVisByClass('genVis')&lt;/script&gt;</code></pre>
                </div>
            </div>
            <p>
                Everything a definition can do is in the <a :href="readme">readme</a>. The styles of
                the package are in the cascade layer <code>gen-vis</code>, so any CSS of the page
                overrides them, and all its classes start with <code>vis-</code>. Editors like VS Code
                complete and check definitions with the JSON Schema of the package, as the editor
                here does (<kbd>Ctrl</kbd>+<kbd>Space</kbd>).
            </p>
        </section>

        <footer class="footer">
            <p>
                gen-vis {{ version }} · MIT licence · Data: spritpreisrechner.at, Eurostat,
                Statistik Austria, ERA5 (Copernicus Climate Change Service), ENTSO-E · Boundaries
                © EuroGeographics
            </p>
        </footer>
    </div>
</template>

<script>
import Example from './components/Example.vue';
import examples from './examples/index.js';

const repo = 'https://github.com/petres/gen-vis';

export default {
    components: { Example },
    data: () => ({
        examples,
        repo,
        version: __VERSION__,
        branch: __BRANCH__,
        readme: `${repo}/blob/${__BRANCH__}/README.md`,
    }),
};
</script>
