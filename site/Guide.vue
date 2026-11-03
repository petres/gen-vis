<template>
    <div class="page guide">
        <header class="hero">
            <div class="brand">
                <a class="wordmark" href="./">gen-vis</a>
                <span class="version">{{ version }}</span>
                <nav class="links">
                    <a href="./">Examples</a>
                    <a :href="readme">Readme</a>
                    <a :href="`${repo}/blob/${branch}/CHANGELOG.md`">Changelog</a>
                    <a :href="repo">GitHub</a>
                </nav>
            </div>
            <h1>How it works</h1>
            <p class="lead">
                The ideas behind a definition, the way from it to the SVG, and a chart built step by step.
                Every option is in the documentation: the <a :href="`${docs}/definition.md`">definition
                language</a>, the <a :href="`${docs}/usage.md`">usage</a> and the
                <a :href="`${docs}/export.md`">static export</a>.
            </p>
            <nav class="toc" aria-label="Contents">
                <a href="#perspective">What it is</a>
                <a href="#pipeline">From the definition to the SVG</a>
                <a href="#parts">The parts of a definition</a>
                <a href="#steps">Step by step</a>
                <a href="#changing">Changing it</a>
            </nav>
        </header>

        <main>
            <section id="perspective" class="usage">
                <h2>What it is, and what not</h2>
                <p>
                    I write gen-vis for the charts of the pages I work on and change it whenever one of them
                    needs something new. So it does what these charts need, in the way I like to write them: a
                    chart is a JSON file next to its data, and most of what is drawn is spelled out in it, down to
                    the attributes of the SVG elements.
                </p>
                <p>
                    That has its price. A definition is longer than the one of a library which decides more for
                    you, there are a few kinds of plots which are combined rather than many chart types, it is
                    SVG only, and a new major version changes definitions when a better way turns up (2.0, 3.0
                    and 4.0 did). There is one author, no company and no promise of support.
                </p>
                <p>
                    If it fits your charts, use it. If it nearly fits, fork it: the code is about 8 000 lines of
                    JavaScript without a framework, the parts and their files are below. The
                    <a href="./#comparison">comparison</a> on the examples page names the libraries which
                    are the better choice for most other cases.
                </p>
            </section>

            <section id="pipeline" class="usage">
                <h2>From the definition to the SVG</h2>
                <p>A chart is drawn in steps, each one has its module, only the last one knows the DOM:</p>
                <ol class="pipeline">
                    <li>
                        <strong>Load</strong> <code>src/utils/load.js</code>: the definition is merged with its
                        parents and written in its internal form (<code>src/utils/normalize.js</code>: the defaults of
                        the mappings and of the plot types), the parts of the package it
                        needs are loaded with the data (e.g. the ones of maps only for a map), the data is read, CSV,
                        TSV, JSON or the columns used of parquet.
                    </li>
                    <li>
                        <strong>Prepare</strong> <code>src/utils/def.js</code>: the selected entries of the form
                        elements set globals and patch the definition, the categories of the mappings get their
                        props, annotations become plots.
                    </li>
                    <li>
                        <strong>Rows</strong> <code>src/utils/data.js</code>: transforms add columns, every row gets
                        one value per mapping, converted by the type of the mapping: numbers, dates as timestamps,
                        categories as strings.
                    </li>
                    <li>
                        <strong>Layout</strong> <code>src/layout.js</code>: the rows shown (filters, hidden
                        categories), the stacks, the facets with their sizes and a d3 scale per mapping, without
                        the DOM.
                    </li>
                    <li>
                        <strong>Marks</strong> <code>src/plots/</code>: a plot type turns the groups of the rows of a
                        plot into a layer, plain objects of SVG elements with their attributes, it draws nothing.
                    </li>
                    <li>
                        <strong>Draw</strong> <code>src/utils/draw.js</code>, <code>src/comp/facet.js</code>: the
                        layers are joined to the elements of the draw before by their keys, only attributes which
                        changed are set, with a transition if the definition has one. The hover and the highlight
                        work on the drawn elements, the other parts of <code>src/comp/</code> are the frame: titles,
                        form elements, legends and facets, the Vue component (<code>src/vue-adapter.js</code>) is a thin
                        adapter of them.
                    </li>
                </ol>
                <p>
                    The images are copies of the chart drawn outside of the screen in their own width
                    (<code>src/utils/export.js</code>): the PNG is a picture of the copy, the SVG
                    (<code>src/utils/export-svg.js</code>) writes its HTML texts as SVG texts and its styles as
                    attributes. The export page (<code>src/export.js</code>) draws a chart at a width of cm or
                    in for programs outside the browser, the CLI (<code>bin/</code>) opens it in a Chromium of
                    the system and saves its SVG, a screenshot as PNG or a print as PDF.
                </p>
            </section>

            <section id="parts" class="usage">
                <h2>The parts of a definition</h2>

                <h3>Mappings</h3>
                <p>
                    A mapping gives a column of the data a name and a type (<code>numeric</code>,
                    <code>date</code> or categorical, by default the one of its parts or of the values), and
                    everything which belongs to it: its <code>scale</code>, whose <code>orientation</code> is its
                    place in the coordinate system (horizontal or vertical, angular or radial), its
                    <code>axis</code>, <code>legend</code> and <code>hover</code>, and its
                    <code>categories</code> with their props: a name, a color and any other value a plot can use.
                    <code>x</code> and <code>y</code> are the places of the coordinate system, they have a scale
                    and an axis of their own, <code>"x": "year"</code> is a mapping of the column. A mapping
                    without a scale is fine, e.g. one which only groups rows or carries props of its categories.
                </p>

                <h3>Plots</h3>
                <p>
                    A plot is a layer of SVG elements. A type is the one of the coordinate system, e.g.
                    <code>line</code> a path per group, <code>bar</code>, <code>point</code>, of polar plots
                    <code>arc</code> slices, of maps <code>region</code> the region of a row, with the props it
                    needs by default, e.g. the points of a line at <code>@x:scaled</code> and
                    <code>@y:scaled</code>, also of the full names, e.g. <code>cartesian:line</code>; a prop
                    <code>null</code> removes a default. The <code>svg:</code> types draw an element per row in any
                    coordinate system. <code>by</code> groups the rows, <code>select</code>
                    picks one row per group, <code>filter</code> leaves rows out and <code>data</code> gives a plot
                    rows of its own, e.g. events. The props of a plot are the attributes of its elements,
                    <code>highlight</code> the ones of the elements under the pointer.
                </p>

                <h3>Props</h3>
                <p>
                    Most values of a definition are props, expressions close to JSON Logic, the same everywhere
                    (and in the transforms <code>calc</code> and <code>filter</code>):
                </p>
                <div class="table-scroll">
                    <table class="names">
                        <tbody>
                            <tr><th><code>3</code>, <code>"none"</code></th><td>a value</td></tr>
                            <tr><th><code>"@y:scaled"</code></th><td>a reference to a name of the place of the prop</td></tr>
                            <tr><th><code>{ "*": ["@innerWidth", 0.5] }</code></th><td>an operator, an object of one key and its arguments: <code>+ - * / min max round</code>, comparisons, <code>if</code>, <code>and</code>, <code>or</code>, <code>not</code>, <code>cat</code> (texts), <code>format</code> (a text of a number or a date), <code>steps</code> (e.g. of the width of the chart, <code>["@totalWidth", { "0": 3, "560": 5 }]</code>), <code>match</code> (the value of a case) and <code>literal</code> (a value as it is)</td></tr>
                            <tr><th><code>{ "x": "@x:scaled", "y": "@y:scaled" }</code></th><td>objects and lists of props, e.g. the points of a line</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>The names a reference can use depend on its place:</p>
                <div class="table-scroll">
                    <table class="names">
                        <tbody>
                            <tr><th>everywhere</th><td>the globals, e.g. <code>@year</code> of a slider, and <code>@totalWidth</code>, the width of the chart</td></tr>
                            <tr><th>in a facet</th><td>its sizes, <code>@width</code>, <code>@innerHeight</code>, …, of polar plots <code>@radius</code>, of band scales e.g. <code>@y:bandwidth</code></td></tr>
                            <tr><th>in a plot</th><td>the props of the categories of the group, e.g. <code>@color</code> and <code>@name</code>, and the values of the row: <code>@y</code>, <code>@y:scaled</code>, <code>@y:formatted</code>, of stacks <code>@y:start:scaled</code> and <code>@y:end:scaled</code>, a fixed value <code>@x:scaled:0</code></td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Props are compiled once, the ones which are the same for all rows are computed once, the
                    others per row.
                </p>

                <h3>Globals and form elements</h3>
                <p>
                    Globals are named values: the ones of the definition, of the form elements (radio buttons,
                    selects, sliders) and of the page. Texts and columns are templates of them, e.g.
                    <code>"column": "{unit}"</code>. An entry of a form element sets globals and
                    <code>patch</code>es any part of the definition, merged in the order of the form elements,
                    <code>null</code> removes a part. What the user chose and hid is the state of the chart.
                </p>

                <h3>Coordinate systems</h3>
                <p>
                    <code>options.coord</code> is <code>cartesian</code> (the default), <code>polar</code> or
                    <code>geo</code>. A coordinate system gives the ranges of the orientations, draws the axes,
                    places the annotations and finds the rows of the hover. Polar plots and maps are loaded with
                    their first chart.
                </p>
            </section>

            <section id="steps" class="usage">
                <h2>Step by step</h2>
                <p>
                    A dumbbell chart of the share of renewables in the electricity of European countries, 2019
                    against 2025: two circles per country and the line between them. Every step adds to the
                    definition of the one before. Its definition is beside the chart, edit it and the chart
                    follows, with the warnings of the check; <em>Added in this step</em> shows what is new.
                </p>
                <Step v-for="(step, i) in steps" :key="step.id" :step="step" :index="i"/>
            </section>

            <section id="changing" class="usage">
                <h2>Changing it</h2>
                <p>
                    A new plot type is a function from the groups of rows to a layer, registered by its name, see
                    <a :href="`${docs}/extensions.md`">extensions</a>; a coordinate system is registered the same
                    way, a scheme of colors of a house style (<code>registerScheme</code>) and the defaults of
                    the axes (<code>registerDefaults</code>) for all charts of a page as well. Anything else is a change of the code: the steps above are the places to start, the tests
                    (<code>npm test</code>) draw every example of <code>data/</code> and of this site, and
                    <code>npm run dev</code> shows them in a gallery.
                </p>
            </section>
        </main>

        <footer class="footer">
            <p>gen-vis {{ version }} · MIT licence · Data: ENTSO-E Transparency Platform</p>
        </footer>
    </div>
</template>

<script>
import Step from './components/Step.vue';
import steps from './guide/steps.js';

const repo = 'https://github.com/petres/gen-vis';

export default {
    components: { Step },
    data: () => ({
        steps,
        repo,
        version: __VERSION__,
        branch: __BRANCH__,
        readme: `${repo}/blob/${__BRANCH__}/README.md`,
        docs: `${repo}/blob/${__BRANCH__}/docs`,
    }),
};
</script>
