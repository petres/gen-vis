# gen-vis

**[Examples](https://petres.github.io/gen-vis/)**: six charts with
different looks. You can edit their definitions and CSS on the page, and
the charts update as you type.

A declarative d3 visualisation library: a JSON definition (the *def*) and a
data file (CSV, TSV, JSON or parquet) describe a chart. It draws line,
point, bar, stacked bar and area charts, polar plots (e.g. radar and rose
charts) and maps, with legends, hover, facets and form elements. A page
draws a chart from a definition file or object and styles it with CSS; the
same definition exports to SVG, PNG or PDF for documents.

## Example

A definition `def.json` next to its data
[`data.csv`](data/bev/data.csv) (the population of the Austrian states; a
longer version is `data/bev/def.json`):

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json",
    "data": "data.csv",
    "transform": [{ "type": "filter", "expr": { "!=": ["@Bundesland", "ÖSTERREICH"] } }],
    "options": {
        "title": "Bevölkerung nach Bundesland",
        "height": 300,
        "margins": { "top": 10, "right": 10, "bottom": 30, "left": 80 }
    },
    "mapping": {
        "x": { "column": "Jahr", "format": "c" },
        "y": { "column": "Einwohner", "format": ",.0f", "domain": [0, null], "axis": { "grid": true } },
        "land": { "column": "Bundesland", "fromData": true, "scheme": "Tableau10", "legend": { "symbol": "line", "onlyData": true } }
    },
    "plot": { "type": "line", "by": "land", "props": { "stroke-width": 2 }, "highlight": { "stroke-width": 4 } }
}
```

The margins leave room for the axis labels (they are 0 by default). The
years are numbers, so `"format": "c"` shows them as 2002, not 2.002. The
filter drops the Austria total (`ÖSTERREICH`), and `onlyData` keeps it out
of the legend.

A page which draws it:

```html
<div class="genVis" data-def-file="def.json" data-download></div>

<script type="module">
import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/esm/gen-vis.js';
mountGenVisByClass('genVis');
</script>
```

The `$schema` declares the definition language version (gen-vis 4).
Editors like VS Code use it to complete and check the definition. The
definition language is described in [docs/definition.md](docs/definition.md).

## Usage

```sh
npm install @preschen/gen-vis
```

The package is a framework-free core, a standalone script for pages
without a bundler and a Vue 3 adapter (`vue` is an optional peer
dependency). All three take the same props, events and methods (see
[docs/usage.md](docs/usage.md)):

- **ES module** for an application with a bundler: `createGenVis(element,
  props)` draws a visualisation in an element and returns it,
  `update(props)` changes it:

  ```js
  import { createGenVis } from '@preschen/gen-vis';

  const chart = createGenVis(document.getElementById('chart'), { defFile: '/data/bev/def.json', download: true });
  chart.on('select', e => console.log(e.key));
  chart.update({ globals: { lang: 'en' } });
  ```

- **Vue component** from `@preschen/gen-vis/vue`, with `v-model:state`, the
  events and the slots. The default export is the plugin, `{ GenVis }` the
  component:

  ```js
  import GenVis from '@preschen/gen-vis/vue';

  app.use(GenVis);
  ```

  ```html
  <GenVis def-file="/data/bev/def.json" @select="open"/>
  ```

- **Standalone script** for a page without a bundler, e.g. from a CDN: the
  module `dist-lib/esm/gen-vis.js` (above; 70 kB gzipped at first, optional
  parts load when a chart needs them), the core loader
  `dist-lib/gen-vis.core.js` (less than 1 kB) for pages without modules, or
  the single file `dist-lib/gen-vis.js` with everything in it.
  `mountGenVisByClass(className)` mounts the elements with that class, the
  `data-` attributes are their props:

  ```html
  <script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.core.js"></script>
  <script>mountGenVisByClass('genVis').then(charts => ...)</script>
  ```

## Features

- **Plots**: lines, bars (also stacked and horizontal), areas and SVG
  elements (circles, lines, rects, texts), in cartesian and polar
  coordinates (radar and rose charts) and on maps (GeoJSON or TopoJSON,
  choropleths, circles), facets by a column.
- **Short definitions**: a mapping can be just its column name, types
  follow from the values, and each plot type has the props it needs by
  default. Parents and mixins for shared parts, data transforms (e.g. an
  index to a base year), expressions as props, annotations, form elements
  (radio buttons, selects, sliders), page globals and text templates in
  several languages.
- **Interaction**: hover (also by keyboard), legends which show and hide
  categories, highlight, hover and selection events, linked charts on a
  page, a state of the user's changes, transitions.
- **Styles** from the page: classes start with `vis-`, the package styles
  are in a cascade layer, colors and font are CSS variables. House color
  schemes (`registerScheme`) and axis defaults (`registerDefaults`) apply
  to all charts on a page.
- **Images and data**: buttons and methods for PNG, SVG and a CSV of the
  data shown.
- **Static export**: `exportSvg` writes an SVG for Word, LaTeX and editors
  (texts stay texts, no HTML, no CSS). The CLI `gen-vis export` writes SVG,
  PNG and PDF files from definition files at a physical size (e.g. `--width
  16cm --font-size 8pt --dpi 300`) with the system's Chromium, Chrome or
  Edge. Other programs, e.g. Python or R wrappers, drive the same export
  page.
- **Checks**: `check` warns about mistakes while you write a definition,
  `@preschen/gen-vis/check` checks definitions in scripts, and the JSON
  Schema and TypeScript types describe the definitions.
- **Extensions**: register your own plot types, coordinate systems and
  color schemes.

```sh
npx gen-vis export data/bev/def.json bev.svg bev.png bev.pdf --width 16cm --font-size 8pt --dpi 300
```

## Documentation

- [Definition](docs/definition.md): the definition language, `$schema`,
  parents and mixins, [data](docs/definition.md#data),
  [`transform`](docs/definition.md#transform),
  [`options`](docs/definition.md#options),
  [`mapping`](docs/definition.md#mapping) (scales, axes, legends, axis
  [defaults](docs/definition.md#defaults)),
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
- [Development](docs/development.md): the dev server, tests and
  snapshots, builds, publishing, the examples site, `spec/`.

Changes by version are in the [changelog](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). The example data in `data/` has its own
sources, see the definition footers and the READMEs in `data/geo/` and
`data/energy/`.
