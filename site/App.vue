<template>
    <div class="page">
        <header class="hero">
            <div class="brand">
                <span class="wordmark">gen-vis</span>
                <span class="version">{{ version }}</span>
                <nav class="links">
                    <a href="gallery.html">Gallery</a>
                    <a href="guide.html">How it works</a>
                    <a :href="readme">Readme</a>
                    <a :href="`${repo}/blob/${branch}/CHANGELOG.md`">Changelog</a>
                    <a href="https://www.npmjs.com/package/@preschen/gen-vis">npm</a>
                    <a :href="repo">GitHub</a>
                </nav>
            </div>
            <h1>Charts from JSON definitions</h1>
            <p class="lead">
                A small d3 library for any page and for Vue which I write for the charts of my own pages: a chart is a
                JSON definition and a data file. Lines, bars, areas, histograms, polar plots and maps, with
                legends, hover, grids of facets and form elements. It does what these charts need, use it if it fits
                yours, fork it if it nearly does, see <a href="guide.html">how it works</a>.
            </p>
            <pre class="install"><code>npm install @preschen/gen-vis</code></pre>
            <ul class="points">
                <li><strong>A chart is a file.</strong> The definition lies next to its data, a JSON
                    Schema checks it in the editor, <code>validateDef</code> in a build, shared parts are
                    parents and mixins.</li>
                <li><strong>The data stays data.</strong> CSV, TSV, JSON or parquet (only the columns
                    used), transforms compute e.g. an index of a base year, rolling means, the classes of a
                    histogram or the jitter of a strip plot.</li>
                <li><strong>Controls without code.</strong> Radio buttons, selects and sliders of the
                    definition patch any part of it, e.g. columns, filters, scales, texts or the language,
                    the state is a <code>v-model</code>, the page can set globals and link charts.</li>
                <li><strong>For any page and for Vue.</strong> A core without a framework, a standalone
                    script which loads the parts a chart needs when it needs them, and a component of Vue 3;
                    with <code>lazy</code> a chart is drawn when it comes near the viewport.</li>
                <li><strong>Images for documents.</strong> <code>exportSvg</code> is an SVG for Word and
                    editors whose texts stay texts, <code>gen-vis export</code> writes SVG, PNG and PDF files
                    of a definition at a physical size, e.g. 16 cm wide with texts of 8 pt.</li>
                <li><strong>Built in:</strong> the hover by the keyboard and screen readers, PNG, SVG and
                    CSV of the data shown, a look of its own with the font Inter in the package, the font and every color
                    a CSS variable.</li>
            </ul>
            <nav class="toc" aria-label="Contents">
                <a v-for="(e, i) in examples" :key="e.id" :href="`#${e.id}`">
                    <span>{{ String(i + 1).padStart(2, '0') }}</span> {{ e.name }}
                </a>
                <a href="#vue">Vue</a>
                <a href="#standalone">Without a bundler</a>
                <a href="#export">Static export</a>
                <a href="#comparison">Comparison</a>
                <a href="gallery.html">Gallery</a>
                <a href="guide.html">How it works</a>
            </nav>
        </header>

        <main>
            <div class="intro">
                <p>
                    The definition, the CSS and the data of every example are shown next to it, edit them
                    and the chart follows. The looks are the ones of the CSS of the examples.
                </p>
            </div>
            <Example v-for="(e, i) in examples" :key="e.id" :example="e" :index="i"/>

            <section id="vue" class="usage">
                <h2>In a Vue application</h2>
                <p>
                    The component loads the definition and its data, <code>v-model:state</code> keeps the
                    changes of the user (the form elements and the legend), the events have the rows
                    of the hover and of a click.
                </p>
                <div class="demo">
                    <div class="demo-live"><VueDemo/></div>
<pre class="demo-code"><code>// main.js
import { createApp } from 'vue';
import GenVis from '@preschen/gen-vis/vue';
import App from './App.vue';

createApp(App).use(GenVis).mount('#app');

&lt;!-- the component --&gt;
{{ vueSource }}</code></pre>
                </div>
            </section>

            <section id="standalone" class="usage">
                <h2>Without a bundler</h2>
                <p>
                    The standalone script includes d3 and no framework. As a module of the page it loads
                    80 kB (gzipped) at first and the parts which not every chart needs, e.g. the ones of
                    maps, when a chart needs them. The page below is this file, it loads the script of
                    this build instead of the CDN.
                </p>
                <div class="demo">
                    <iframe class="demo-live" src="standalone.html" title="A page with the standalone script" loading="lazy"/>
<pre class="demo-code"><code>{{ standaloneSource }}</code></pre>
                </div>
                <p>
                    A page which loads its scripts without modules loads the same module with a classic
                    script of less than 1 kB, its globals return promises:
                    <code>&lt;script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.core.js"&gt;&lt;/script&gt;</code>
                    and <code>mountGenVisByClass('chart')</code>. All parts in one file are
                    <code>dist-lib/gen-vis.js</code> (145 kB gzipped), pages with Vue as a script have
                    the component of their Vue, <code>GenVis.vuePlugin(Vue)</code>, see the
                    <a :href="`${docs}/usage.md#standalone-script`">usage</a>.
                </p>
            </section>

            <section id="export" class="usage">
                <h2>Images for documents</h2>
                <p>
                    The button SVG of the examples (the prop <code>svg</code>) saves the chart as one SVG
                    without HTML and CSS: the texts are texts in the fonts of the computer, so Word, LaTeX
                    (through a PDF) and editors draw it and its texts stay editable.
                    <code>exportSvg(options)</code> is the same of the page, e.g. only the legend and the
                    plot, in cm. Outside the browser the CLI draws definition files with a Chromium, Chrome or
                    Edge of the system, laid out at exactly the width asked for, so 8 pt in the chart are
                    8 pt in the document:
                </p>
<pre class="demo-code"><code>npx gen-vis export def.json chart.svg chart.png chart.pdf --width 16cm --font-size 8pt --dpi 300</code></pre>
                <p>
                    The export page of the CLI is a page of its own, so wrappers in other languages, e.g.
                    Python or R, drive the same, see the <a :href="`${docs}/export.md`">static export</a>.
                </p>
            </section>

            <section id="comparison" class="usage">
                <h2>Compared with other libraries</h2>
                <p>
                    gen-vis is small: a few kinds of plots which are combined, in SVG. For many kinds of
                    charts (e.g. sankey, treemaps, 3D), very large data (canvas, WebGL), a grammar of
                    statistical graphics or a large community, the libraries beside it are the better
                    choice. Where it fits: charts of a page or a dashboard which are files, with their
                    controls, the data as it is and a Vue application or none.
                </p>
                <Comparison/>
            </section>

            <section class="usage">
                <h2>More</h2>
                <p>
                    How a definition becomes a chart, its parts and a chart built step by step are on the page
                    <a href="guide.html">how it works</a>, everything a definition can do is in the
                    <a :href="`${docs}/definition.md`">definition language</a>. The styles of
                    the package are in the cascade layer <code>gen-vis</code>, so any CSS of the page
                    overrides them, and all its classes start with <code>vis-</code>; the colors of a house
                    style are a scheme of the page (<code>registerScheme</code>), the sizes of its axes its
                    defaults (<code>registerDefaults</code>). Editors like VS Code
                    complete and check definitions with the JSON Schema of the package, as the editor
                    here does (<kbd>Ctrl</kbd>+<kbd>Space</kbd>).
                </p>
            </section>
        </main>

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
import Comparison from './components/Comparison.vue';
import VueDemo from './components/VueDemo.vue';
import vueSource from './components/VueDemo.vue?raw';
import examples from './examples/index.js';

const repo = 'https://github.com/petres/gen-vis';
const cdn = 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/esm/gen-vis.js';

export default {
    components: { Example, Comparison, VueDemo },
    data: () => ({
        examples,
        repo,
        version: __VERSION__,
        branch: __BRANCH__,
        readme: `${repo}/blob/${__BRANCH__}/README.md`,
        docs: `${repo}/blob/${__BRANCH__}/docs`,
        vueSource: vueSource.trim(),
        standaloneSource: '',
    }),
    // the source of the page of the standalone script, with the url of the CDN
    async mounted() {
        const response = await fetch('standalone.html');
        if (response.ok)
            this.standaloneSource = (await response.text()).replace('./lib/esm/gen-vis.js', cdn).trim();
    },
};
</script>
