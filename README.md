# gen-vis

**[Examples](https://petres.github.io/gen-vis/)**: six charts of different
looks, their definitions and CSS can be edited on the page, the charts follow
as you type.

A declarative d3 visualisation library: a chart is described by a JSON
definition (the *def*) and a data file (CSV, TSV, JSON or parquet). Line,
point, bar, stacked bar and area charts, polar plots (e.g. radar and rose
charts) and maps with legends, hover, facets and form elements are supported.
The page draws a chart of a definition file or object, the look is the one
of its CSS, the same definition is exported as an SVG, PNG or PDF for
documents.

## Example

A definition, `data/bev/def.json`, next to its data `data.csv`:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json",
    "data": "data.csv",
    "options": { "title": "Population by state" },
    "mapping": {
        "x": "Jahr",
        "y": { "column": "Einwohner", "format": ",.0f", "domain": [0, null], "axis": { "grid": true } },
        "land": { "column": "Bundesland", "fromData": true, "scheme": "Tableau10", "legend": {} }
    },
    "plot": { "type": "line", "by": "land", "highlight": { "stroke-width": 3 } }
}
```

A page which draws it:

```html
<div class="genVis" data-def-file="/data/bev/def.json" data-download></div>

<script type="module">
import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/esm/gen-vis.js';
mountGenVisByClass('genVis');
</script>
```

The `$schema` declares the version of the definition language, gen-vis 4,
editors like VS Code complete and check the definition with it. The
definition language is described in [docs/definition.md](docs/definition.md).

## Usage

```sh
npm install @preschen/gen-vis
```

The package is a core without a framework, with the standalone script for
pages without a bundler and an adapter of Vue 3, `vue` is an optional peer
dependency. The three ways to use it, all with the same props, events and
methods (see [docs/usage.md](docs/usage.md)):

- **ES module** of an application with a bundler, `createGenVis(element,
  props)` draws a visualisation in an element and returns it, `update(props)`
  changes it:

  ```js
  import { createGenVis } from '@preschen/gen-vis';

  const chart = createGenVis(document.getElementById('chart'), { defFile: '/data/bev/def.json', download: true });
  chart.on('select', e => console.log(e.key));
  chart.update({ globals: { lang: 'en' } });
  ```

- **Vue component** of `@preschen/gen-vis/vue`, with `v-model:state`, the
  events and the slots:

  ```js
  import GenVis from '@preschen/gen-vis/vue';

  app.use(GenVis);
  ```

  ```html
  <GenVis def-file="/data/bev/def.json" @select="open"/>
  ```

- **Standalone script** of a page without a bundler, e.g. of a CDN: the
  module `dist-lib/esm/gen-vis.js` (above, 68 kB gzipped at first, the parts
  which not every chart needs when a chart needs them), the core loader
  `dist-lib/gen-vis.core.js` (less than 1 kB) of pages which load their
  scripts without modules, or the single file `dist-lib/gen-vis.js` with all
  parts in itself. `mountGenVisByClass(className)` mounts the elements of the
  class, their props are the `data-` attributes:

  ```html
  <script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.core.js"></script>
  <script>mountGenVisByClass('genVis').then(charts => ...)</script>
  ```

## Features

- **Plots**: lines, bars (also stacked and horizontal), areas and svg
  elements (circles, lines, rects, texts), in cartesian and polar
  coordinates (radar and rose charts) and on maps (GeoJSON or TopoJSON,
  choropleths, circles), facets of a column.
- **Definitions** which are short: a mapping can be the name of its column,
  the types follow from the values, a plot type has the props it needs by
  default. Parents and mixins of shared parts, transforms of the data (e.g.
  an index of a base year), expressions of props, annotations, form elements
  (radio buttons, selects, sliders) and globals of the page, templates of
  texts in several languages.
- **Interaction**: hover (also by the keyboard), legends which show and hide
  categories, highlight, events of the hover and the selection, linked charts
  of a page, a state of the changes of the user, transitions.
- **Styles** of the page: the classes start with `vis-`, the styles of the
  package are in a cascade layer, the colors and the font are css variables;
  schemes of colors of a house style (`registerScheme`) and defaults of the
  axes (`registerDefaults`) for all charts of a page.
- **Images and data**: buttons and methods of the PNG, the SVG and the CSV
  of the data shown.
- **Static export**: `exportSvg` is an SVG made for Word, LaTeX and editors
  (the texts stay texts, no HTML, no CSS), the CLI `gen-vis export` writes
  SVG, PNG and PDF files of definition files at a physical size (e.g.
  `--width 16cm --font-size 8pt --dpi 300`) with a Chromium, Chrome or Edge
  of the system, the export page drives the same of other programs, e.g.
  wrappers in Python or R.
- **Checks**: `check` warns of mistakes of a definition while it is
  written, `@preschen/gen-vis/check` checks definitions in scripts, the JSON
  Schema and the types of TypeScript describe the definitions.
- **Extensions**: plot types, coordinate systems and schemes of colors can be
  registered.

```sh
npx gen-vis export data/bev/def.json bev.svg bev.png bev.pdf --width 16cm --font-size 8pt --dpi 300
```

## Documentation

- [Definition](docs/definition.md): the definition language, `$schema`,
  parents and mixins, [data](docs/definition.md#data),
  [`transform`](docs/definition.md#transform),
  [`options`](docs/definition.md#options),
  [`mapping`](docs/definition.md#mapping) (scales, axes, legends, the
  [defaults](docs/definition.md#defaults) of the axes),
  [`plot`](docs/definition.md#plot), [polar
  plots](docs/definition.md#polar-plots), [maps](docs/definition.md#maps),
  [annotations](docs/definition.md#annotations),
  [props](docs/definition.md#props-of-the-definition) (expressions),
  [`facets`](docs/definition.md#facets), [`formElements` and
  `globals`](docs/definition.md#formelements-and-globals).
- [Usage](docs/usage.md): the [standalone
  script](docs/usage.md#standalone-script), the
  [JavaScript](docs/usage.md#javascript) API, the [Vue
  component](docs/usage.md#vue-component), [props](docs/usage.md#props),
  [events and slots](docs/usage.md#events-and-slots), [linked
  charts](docs/usage.md#linked-charts), [PNG](docs/usage.md#png), [layout
  shifts](docs/usage.md#layout-shifts), [lazy
  loading](docs/usage.md#lazy-loading),
  [accessibility](docs/usage.md#accessibility-and-the-data),
  [state](docs/usage.md#state), [styles](docs/usage.md#styles) (classes and
  css variables).
- [Static export](docs/export.md): [`exportSvg`](docs/export.md#exportsvg),
  the [export page](docs/export.md#export-page) (`window.genVisExport`) and
  the [CLI](docs/export.md#cli) `gen-vis export`.
- [Extensions](docs/extensions.md): `registerPlotType`, `registerCoord`,
  `registerScheme`, `registerDefaults`, the schema and the types, [checks
  outside the browser](docs/extensions.md#checks-outside-the-browser)
  (`validateDef`, `@preschen/gen-vis/check`).
- [Development](docs/development.md): the dev server, the tests and
  snapshots, the builds, the page of the examples, `spec/`.

The changes of the versions are in the [changelog](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). The example data in `data/` has its own sources,
see the footers of the definitions and the readmes of `data/geo/` and
`data/energy/`.
