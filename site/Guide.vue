<template>
    <div class="page guide">
        <header class="hero">
            <div class="brand">
                <a class="wordmark" href="./">gen-vis</a>
                <span class="version">{{ version }}</span>
                <nav class="links">
                    <a href="./">Examples</a>
                    <a href="gallery.html">Gallery</a>
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
                    chart is a JSON file next to its data, which names the columns it uses (dims) and the marks
                    drawn of them. The library computes what follows from them, the positions, the stacks, the
                    colors of the categories, the axes and their margins; every attribute of the SVG elements
                    stays open to an expression where a chart needs more.
                </p>
                <p>
                    That has its price. A definition is longer than the one of a library which decides more for
                    you, there are a few kinds of marks which are combined rather than many chart types, it is
                    SVG only, and a new major version changes definitions when a better way turns up (2.0 to
                    5.0 did, and a definition of the version before is not read: the changelog says what to
                    write instead). There is one author, no company and no promise of support.
                </p>
                <p>
                    If it fits your charts, use it. If it nearly fits, fork it: the code is about 13 000 lines of
                    JavaScript without a framework (and without comments), the parts and their files are below.
                    The <a href="./#comparison">comparison</a> on the examples page names the libraries which
                    are the better choice for most other cases.
                </p>
            </section>

            <section id="pipeline" class="usage">
                <h2>From the definition to the SVG</h2>
                <p>A chart is drawn in steps, each one has its module, only the last one knows the DOM:</p>
                <ol class="pipeline">
                    <li>
                        <strong>Load</strong> <code>src/utils/load.js</code>: the definition is merged with its
                        parents and mixins, the parts of the package it needs are loaded with the data (e.g. the ones
                        of maps only for a map), the data is read, CSV, TSV, JSON or the columns used of parquet.
                    </li>
                    <li>
                        <strong>Resolve</strong> <code>src/utils/resolve.js</code>: the expressions of the globals
                        are evaluated with the values of the controls and the page, e.g. a <code>match</code> of
                        the unit of a radio button; the expressions of rows and sizes stay for the draw.
                    </li>
                    <li>
                        <strong>Translate</strong> <code>src/utils/language.js</code>,
                        <code>src/utils/normalize.js</code>: the definition becomes the form the engine reads, the
                        shorthands of the dims are written into their scales and axes, the channels of the marks
                        into the attributes of their scaled positions (the starts and ends of stacks, the slots of
                        dodged bars, the centers of bands), the controls into their elements, the defaults are
                        filled in. It is pure, JSON in and JSON out, and names the places of the definition as
                        written in the messages of the check.
                    </li>
                    <li>
                        <strong>Prepare</strong> <code>src/utils/def.js</code>: the categories of the dims get
                        their props, annotations become layers. A change of a global resolves the definition again
                        and prepares only the parts which changed.
                    </li>
                    <li>
                        <strong>Rows</strong> <code>src/utils/data.js</code>: transforms add columns (and rows, e.g.
                        the classes of a histogram of <code>bin</code> or the long form of <code>fold</code>), every
                        row gets one value per dim, converted by the type of the dim: numbers, dates as timestamps,
                        categories as strings.
                    </li>
                    <li>
                        <strong>Layout</strong> <code>src/layout.js</code>, <code>src/utils/margins.js</code>: the
                        rows shown (filters, hidden categories), the stacks, the facets with their sizes and a d3
                        scale per dim, without the DOM; the margins neither the definition nor the page gives are measured, the labels
                        and titles of the axes of every facet in the font of the chart, and the facets are laid out
                        again.
                    </li>
                    <li>
                        <strong>Marks</strong> <code>src/marks/</code>: a mark type turns the groups of the rows of a
                        mark into a layer, plain objects of SVG elements with their attributes, it draws nothing.
                    </li>
                    <li>
                        <strong>Draw</strong> <code>src/utils/draw.js</code>, <code>src/comp/facet.js</code>,
                        <code>src/comp/facet-hover.js</code>: the layers are joined to the elements of the draw
                        before by their keys, only attributes which changed are set, with a transition if the
                        definition has one. The hover and the legend set classes of the elements, the highlight is a
                        stylesheet of the chart (<code>src/utils/highlight.js</code>). The other parts of
                        <code>src/comp/</code> are the frame: titles, controls, legends and facets, the Vue
                        component (<code>src/vue-adapter.js</code>) is a thin adapter of them.
                    </li>
                </ol>
                <p>
                    The images are copies of the chart drawn outside of the screen in their own width
                    (<code>src/utils/export.js</code>): the SVG (<code>src/utils/export-svg.js</code>) writes its
                    HTML texts as SVG texts and its styles as attributes, the PNG is this SVG drawn by the
                    browser on a canvas (<code>src/utils/raster.js</code>). The export page
                    (<code>src/export.js</code>) draws a chart at a width of cm or in for programs outside the
                    browser, the CLI (<code>bin/</code>) opens it in a Chromium of the system and saves its SVG,
                    a screenshot as PNG or a print as PDF.
                </p>
            </section>

            <section id="parts" class="usage">
                <h2>The parts of a definition</h2>

                <h3>Dims</h3>
                <p>
                    A dim gives a column of the data a name and a type (<code>numeric</code>,
                    <code>date</code> or categorical, by default the one of its parts or of the values), and
                    everything which belongs to it: its <code>scale</code>, its <code>axis</code>, its
                    <code>legend</code>, its part of the <code>hover</code> and its <code>categories</code> with
                    their props: a name, a color, whether it is <code>visible</code> at first and any other value
                    a mark can use; a category can be just its color, <code>"oil": "#D97706"</code>.
                    <code>x</code> and <code>y</code> are the places of the coordinate system, they have a scale
                    and an axis of their own, <code>"x": "year"</code> is a dim of the column. The common parts of
                    the scale and the axis are keys of the dim: <code>zero</code>, <code>grid</code>,
                    <code>pad</code>, <code>include</code>, <code>reverse</code>, <code>ticks</code>,
                    <code>format</code>. A dim without a scale is fine, e.g. one which only groups rows or carries
                    props of its categories. Dates can be periods (<code>"interval": "month"</code>: a value is the
                    month starting at it, a bar is as wide as it), an axis can cross the plot at a value of the
                    other one (<code>"axis": {"at": 0}</code>).
                </p>

                <h3>Marks</h3>
                <p>
                    A mark is a layer of SVG elements of a type: <code>line</code>, <code>area</code>,
                    <code>bar</code>, <code>rule</code>, <code>point</code>, <code>text</code> and
                    <code>label</code>, <code>cell</code> (e.g. of a heatmap), of polar charts also
                    <code>arc</code>, of maps <code>base</code>, <code>region</code> and <code>mesh</code>. Its
                    channels name the dims of its positions, <code>x</code> and <code>y</code> by default, the
                    ends of bars and bands (<code>x0</code>, <code>x1</code>, <code>y0</code>,
                    <code>y1</code>), the other end of a rule (<code>x2</code>, <code>y2</code>), e.g. of error
                    bars, and <code>lon</code> and <code>lat</code> of maps. <code>by</code> groups the rows,
                    e.g. a line per country in the color of its category, <code>stack</code> stacks bars, areas
                    and arcs, <code>dodge</code> puts bars and their labels side by side, <code>select</code>
                    picks a row per group, e.g. the last one for a label at the end of a line,
                    <code>filter</code> leaves rows out and <code>data</code> gives a mark rows of its own, e.g.
                    events. Its other keys are the attributes of its elements, the ones of its type by default,
                    <code>null</code> removes one; <code>highlight</code> and <code>others</code> are the
                    attributes of the elements under the pointer and of the other ones. The <code>svg:</code>
                    types draw an element per row with the attributes as they are, in any coordinate system.
                </p>

                <h3>Expressions</h3>
                <p>
                    Almost every value of a definition can be an expression, the same everywhere (and in the
                    transforms <code>calc</code> and <code>filter</code>):
                </p>
                <div class="table-scroll">
                    <table class="names">
                        <tbody>
                            <tr><th><code>3</code>, <code>"none"</code></th><td>a value</td></tr>
                            <tr><th><code>"@y"</code></th><td>a reference to a name of the place of the expression</td></tr>
                            <tr><th><code>"=@innerWidth * 0.5"</code></th><td>a text starting with <code>=</code>: operators and calls, <code>+ - * / min max round</code>, comparisons, <code>a ? b : c</code>, <code>and</code>, <code>or</code>, <code>not</code>, <code>cat</code> (texts), <code>format</code> (a text of a number or a date), <code>steps</code> (e.g. of the width of the chart, <code>steps(@totalWidth, {0: 3, 560: 5})</code>), <code>match</code> (the value of a case) and <code>literal</code> (a value as it is)</td></tr>
                            <tr><th><code>{ "*": ["@innerWidth", 0.5] }</code></th><td>the same as an object of one operator and its arguments, close to JSON Logic, the form of the spec</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>The names a reference can use depend on its place:</p>
                <div class="table-scroll">
                    <table class="names">
                        <tbody>
                            <tr><th>everywhere</th><td>the globals, e.g. <code>@year</code> of a slider (<code>@globals.year</code> where a dim of the name hides it), the fields of the entry chosen, e.g. <code>@unit:name</code>, and <code>@totalWidth</code>, the width of the chart</td></tr>
                            <tr><th>in a facet</th><td>its sizes, <code>@width</code>, <code>@innerHeight</code>, …, the edges of the plot area, <code>@plot:right</code>, of polar plots <code>@radius</code>, of band scales e.g. <code>@y:bandwidth</code></td></tr>
                            <tr><th>in a mark</th><td>the props of the categories of the group, e.g. <code>@color</code> and <code>@name</code>, and the values of the row: <code>@y</code>, <code>@y:formatted</code>, its position <code>@y:scaled</code>, of stacks <code>@y:start</code> and <code>@y:end</code>, the place of its category <code>@y:index</code> of <code>@y:count</code></td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    The expressions of the globals are evaluated before the definition is read, the others are
                    compiled once, the ones which are the same for all rows are computed once, the others per
                    row.
                </p>

                <h3>Globals and controls</h3>
                <p>
                    Globals are named values: the ones of the definition, of the controls (radio buttons,
                    selects, sliders) and of the page. Any part of the definition can be an expression of them, a
                    column, a filter, the type of a scale, the marks: <code>match</code> chooses a value per
                    entry, e.g. <code>"format": "=match(@unit, {pj: ',.0f'}, ',.1f')"</code>, texts and columns
                    are templates, e.g. <code>"column": "{unit}"</code>. A <code>match</code> without a default
                    in a mixin switches the value of its parent or child, so a mixin of a control and its
                    switches serves many charts. The globals the user chose and the categories hidden are the
                    state of the chart. A text can be one per language,
                    <code>{"de": "Bevölkerung", "en": "Population"}</code>, the one of <code>language</code>,
                    e.g. a global of a control.
                </p>

                <h3>Transforms</h3>
                <p>
                    <code>transform</code> is a list of steps of the rows in the browser, most add a column, e.g.
                    <code>lookup</code> of another file, <code>index</code> of a base year, <code>share</code>,
                    <code>rolling</code> means or <code>calc</code> of an expression, <code>filter</code> leaves
                    rows out. <code>fold</code> turns wide columns into long rows, <code>aggregate</code> computes
                    sums and means of groups, <code>window</code> lags and the values of windows. <code>bin</code>
                    adds the classes of a histogram (counts, shares or densities) as rows of their own,
                    <code>random</code> a number per row which stays the same on every draw, e.g. the jitter of a
                    strip plot.
                </p>

                <h3>Facets</h3>
                <p>
                    <code>facets</code> draws a small chart per category: of one dim
                    (<code>"by": "region"</code>) in <code>cols</code> columns, or a grid of two,
                    <code>"by": {"rows": "region", "cols": "source"}</code>, with the names of the rows and
                    columns at its edges, scales of their own or shared by all facets, per row or per column.
                </p>

                <h3>Coordinate systems</h3>
                <p>
                    <code>coord</code> is <code>cartesian</code> (the default), <code>polar</code> or
                    <code>geo</code>. A coordinate system gives the ranges of the orientations, draws the axes,
                    places the annotations and finds the rows of the hover. Polar plots and maps are loaded with
                    their first chart; labels of maps are placed inside their areas and can leave out the ones
                    which do not fit (<code>"fit": true</code>).
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
                    A new mark type is a function from the groups of rows to a layer, registered by its name, the
                    channels of its marks are the scaled positions of their dims, see <a :href="`${docs}/extensions.md`">extensions</a>; a
                    coordinate system is registered the same way, a scheme of colors of a house style
                    (<code>registerScheme</code>) and the defaults of the axes and the margins
                    (<code>registerDefaults</code>) for all charts of a page as well. The look is CSS:
                    the package has a default one (the font Inter, which it brings, grey axes, light grid lines,
                    a hover card), its font and colors are css variables, e.g.
                    <code>--gen-vis-font-family</code> or <code>--gen-vis-axis-color</code> of a house style, see
                    the <a :href="`${docs}/usage.md#styles`">styles</a>. Anything else is a change of the code:
                    the steps above are the places to start, the tests (<code>npm test</code>) draw every example
                    of <code>data/</code> and of this site, also as PNG images in a Chromium, and
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
