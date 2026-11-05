# Usage

How a page draws charts from definitions: the standalone script, the
core's JavaScript API and the Vue component, their props, events and slots,
images and styles. The definitions themselves are in
[definition](definition.md), the static export in [static export](export.md).

```sh
npm install @preschen/gen-vis
```

The package is a core without a framework (`createGenVis`, see
[JavaScript](#javascript)), with the standalone script for pages without a
bundler and an adapter of Vue 3 (`@preschen/gen-vis/vue`, see [Vue
component](#vue-component)), `vue` is an optional peer dependency.

## Standalone script

The standalone script includes d3 and the styles, for pages without a
bundler, e.g. from a CDN. Use the module (`dist-lib/esm/gen-vis.js`): it
loads 70 kB (gzipped) at first and fetches optional parts, e.g. for maps,
from the files next to it when a chart needs them:

```html
<div class="genVis" data-def-file="/data/bev/def.json"></div>

<script type="module">
import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/esm/gen-vis.js';
mountGenVisByClass('genVis');
</script>
```

A page without modules loads the same module through
`dist-lib/gen-vis.core.js` (less than 1 kB), from the files next to it. Its
globals exist at once and return promises (e.g. of the visualisations), so
a page can call them before the module has loaded. `GenVis.ready` resolves
to the module, e.g. for `perRow` in a `registerPlotType`:

```html
<script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.core.js"></script>
<script>mountGenVisByClass('genVis').then(charts => ...)</script>
```

The single file (`dist-lib/gen-vis.js`, 376 kB, 130 kB gzipped, 112 kB with
brotli) has all parts in itself, without the check of the definitions
(`check` and `debug` warn that it is missing), e.g. of a page which has to
work with one file, its globals return the visualisations at once:

```html
<script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.js"></script>
<script>mountGenVisByClass('genVis')</script>
```

None of them contains Vue. A page that loads Vue 3 as a script (the global
`Vue` from `vue.global.prod.js`, or `vue` in its import map) gets a
component for its own Vue from the same files: `vuePlugin(Vue)` is the
plugin which registers `<GenVis>` (its `component` is the component),
`createVueComponent(Vue)` the component itself, the same as the [Vue
component](#vue-component). The single file has them as `GenVis.vuePlugin`
and `GenVis.createVueComponent`, the module as named exports. The core
loader only forwards the functions that may return a promise
(`createGenVis`, the mount functions and the `register…` functions); use
`vuePlugin`, `createVueComponent`, `perRow` and `perGroup` from the loaded
module, e.g. `(await GenVis.ready).vuePlugin(Vue)`. The single file and the
module:

```html
<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/gen-vis.js"></script>
<script>Vue.createApp({ ... }).use(GenVis.vuePlugin(Vue)).mount('#app')</script>
```

```js
import * as Vue from 'vue';
import { vuePlugin } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/dist-lib/esm/gen-vis.js';
Vue.createApp(App).use(vuePlugin(Vue)).mount('#app');
```

With a bundler the module is `@preschen/gen-vis/esm` and the single file
`@preschen/gen-vis/standalone`, which only sets the globals. Neither has a
`types` entry in `package.json`; the types are the ones of the main entry
(`import type { GenVisInstance } from '@preschen/gen-vis'`).

`npm run lib` builds them in `dist-lib/`, the single file also as
`gen-vis-<version>.js`. `npm run upload` copies all of `dist-lib/` to your
own server (`GEN_VIS_UPLOAD` in `.env`), so a page can pin the single file
to a version by loading `gen-vis-<version>.js`. Only the single file has a
versioned copy: the module and the core loader load the unversioned
`esm/` files of the latest upload. The upload also writes compressed copies
next to the files (`.br`, `.gz`) for servers which send them as they are,
e.g. nginx with `brotli_static` and `gzip_static`; a CDN compresses them
itself.

`mountGenVisByClass(className)` mounts all elements with the class which are
not mounted yet and returns their visualisations, `mountGenVisElement(element,
props)` mounts a single element (again, if it is mounted) and returns its
visualisation, e.g. for its [methods](#png), both set the class `vis-mounted` of
the element (the class is not what makes it mounted, e.g. a copy of a mounted
element with the class is mounted too). `unmountGenVisElement(element)` removes the visualisation, e.g.
before a page of a single page application removes the element.
The props are taken from the `data-` attributes, see below, and from `props`,
e.g. the events:

```js
GenVis.mountGenVisElement(element, { onSelect: e => location.href = `/region/${e.key}` });
```

## JavaScript

`createGenVis(element, props)` draws a visualisation at the end of an element
(in a new element `.vis-outer`) and returns it, `props` are the
[props](#props), the listeners of the [events](#events-and-slots) (`onHover`,
`onSelect`, `onRendered`, `onError`, `'onUpdate:state'`) and the functions of
the slots (`slots`). Of the visualisation `update(props)` changes props, the
ones given together are applied together (in a microtask): a new `def`,
`defFile` or `data` is loaded again, a new `state`, new `globals` and a new
`highlight` are applied without it, the buttons follow theirs, a prop which
is not given keeps its value, `undefined` is its default. `on(event, fn)` and
`off(event, fn)` are the listeners of the events, `state` the changes of the
user (see [state](#state)), `props` the props it has, `el` its element,
`destroy()` removes it (its observers and the listeners of the document),
the [methods](#png) of the files are its methods, too:

```js
import { createGenVis } from '@preschen/gen-vis';

const chart = createGenVis(document.getElementById('chart'), {
    defFile: '/data/bev/def.json',
    download: true,
    'onUpdate:state': state => localStorage.chart = JSON.stringify(state),
});
chart.on('select', e => console.log(e.key));
chart.update({ globals: { lang: 'en' } });
```

A change only draws what it needs: a new state, new globals and a toggle of
a legend draw a new view of the rows already loaded (without loading or
transforming them again), a new width (it fills its element unless the
definition has a `width`) draws the plots again, the hover draws only
itself. A state or globals object which the page changes in place is a new
one only with `update`.

The package has the types of TypeScript, e.g. of the props, the events, the
visualisation and the methods, and of the definitions (`Definition` and its
parts, e.g. `MappingEntry` and `Plot`), of the [schema](definition.md#schema), so an
editor checks a definition of the code:

```ts
import type { Definition } from '@preschen/gen-vis';

const def: Definition = { data: 'data.csv', mapping: { ... }, plot: { ... } };
```

Optional parts load on demand, so your bundler splits them into separate
chunks; the rest is ~62 kB gzipped. The sizes are gzipped: the check of the
definitions (~12 kB) with the first one, the colors of d3
(`d3-scale-chromatic`, ~8 kB) for definitions which name a scheme or an
interpolator, the parts of maps (`d3-geo`, `topojson-client`, ~13 kB) with
the first map, the parts of polar plots (~5 kB) with the first one, the
transforms (~2 kB), the legend of scales of colors (~2 kB), the languages of
`Intl` (~1 kB) other than `de` and `en`, the parquet reader (~18 kB) for
parquet data and the PNG and the CSV (~11 kB) with the first one.

## Vue component

```js
import GenVis from '@preschen/gen-vis/vue';

app.use(GenVis);
```

```html
<GenVis def-file="/data/bev/def.json"/>
<GenVis :def="def" :data="rows"/>
```

`import { GenVis } from '@preschen/gen-vis/vue'` registers the component
locally instead. The adapter uses the Vue of the application (`vue`, a peer
dependency), the component draws the visualisation of `createGenVis` in its
element, with the same props, `v-model:state`, the events, the slots (Vue
draws them, with the components and plugins of the application, they follow
the data of the page they use) and the [methods](#png) of a ref. Its props
are watched (`state`, `globals`, `highlight` and `defaults` deeply). `createVueComponent(Vue)`
and `vuePlugin(Vue)` of `@preschen/gen-vis/vue` are the component and the
plugin of another Vue, the types are the ones of `@preschen/gen-vis/vue`.

## Props

| Prop       | Attribute       | Description |
|------------|-----------------|-------------|
| `defFile`  | `data-def-file` | url of the definition |
| `def`      | `data-def`      | the definition, an object or a JSON string |
| `data`     | `data-data`     | the data as rows, a CSV/JSON string or bytes (an `ArrayBuffer` or `Uint8Array`, parquet or the text of CSV/JSON), if not given it is loaded from the `data` url of the definition |
| `debug`    | `data-debug`    | shows the prepared definition, with the warnings of `check` |
| `check`    | `data-check`    | logs the warnings of the check of the definition in the console, e.g. unknown plot types, while it is written, the check is only loaded then (not part of the single file of the standalone script) |
| `state`    | `data-state`    | the changes of the user, see [state](#state), the attribute is JSON |
| `highlight` | `data-highlight` | the rows highlighted by the page, values of mappings, e.g. `{"country": "AT"}` of the hover of another chart, see [linked charts](#linked-charts), the attribute is JSON |
| `globals`  | `data-globals`  | the globals of the page, e.g. the language or the year of a menu of the page, also of hidden form elements, see [globals](definition.md#formelements-and-globals), the attribute is JSON |
| `defaults` | `data-defaults` | the defaults of the parts instead of the built-in ones, e.g. `{"axis": {"padding": 2, "tickMarks": {"size": 4, "inset": 0}}}` for all axes, the values of the definition take precedence, see [defaults](definition.md#defaults), the attribute is JSON |
| `download` | `data-download` | a button at the right of the footer to save it as a PNG, a string is the name of the file (default the title) |
| `copy`     | `data-copy`     | a button at the right of the footer to copy the PNG to the clipboard (only on https or localhost) |
| `csv`      | `data-csv`      | a button at the right of the footer to save the data shown as CSV, a string is the name of the file (default the title) |
| `svg`      | `data-svg`      | a button at the right of the footer to save it as an SVG, see [static export](export.md#static-export), a string is the name of the file (default the title) |
| `imageWidth` | `data-image-width` | the width of the PNG in pixels, the one of the definition otherwise or 800, `screen` for the one on the screen (as it is seen, e.g. on a phone) |
| `lazy`     | `data-lazy`     | loads the definition and the data only when the visualisation is near the viewport, `true` within 400 pixels, a string is the `rootMargin` of the `IntersectionObserver`, e.g. `"800px 0px"`, see [lazy loading](#lazy-loading) |

The attributes are strings: `data-download`, `data-csv`, `data-svg`,
`data-copy`, `data-check`, `data-debug` and `data-lazy` without a value or
`"true"` are on, `"false"` is off, another value of `data-download`,
`data-csv` or `data-svg` is the name of the file, of `data-lazy` the margin.

Every visualisation has its own state, several of them can be used on a page.
If `def`, `defFile` or `data` change (`update` of [createGenVis](#javascript),
a new prop of the component), the visualisation is loaded again, also of
other `defaults`, a new `state` or new `globals` are applied without
loading it again. Errors are shown in place of
the visualisation, e.g. of a definition which can not be drawn.

## Events and slots

Besides `update:state` (see [state](#state)) the visualisation emits `rendered`
once it is drawn the first time, `error` with the message of an error and
`hover` and `select` (a click, a tap or enter and space of the hover by the
keyboard) with the rows under the mouse, `hover` with `null` at its end, the
events of the component, the listeners of `on(event, fn)` of
[createGenVis](#javascript) and of its props `onHover`, `onSelect`,
`onRendered`, `onError` and `'onUpdate:state'` (also of `mountGenVisElement`):

The events and the slots have types, e.g. of `@hover` and of the props of
the slot `hover`.

```js
{ key: "2023", title: "2023", rows: [{ x: "2023", y: 4, land: "Wien" }, ...], nearest: { x: "2023", y: 4, land: "Wien" } }
```

`key` is the value of the position, e.g. of the horizontal axis or the key of
the region of a map, `title` the title of the hover, the rows are the values
of the mappings (the categories as strings, of every format of the data, see
[data](definition.md#data)), `nearest` the row of the element under the mouse.

The slots replace parts of the visualisation, `hover` the content of the
hover (it also has `entries`, the formatted values of the default table),
`header` the title and the subtitle and `footer` the footer. `buttons` adds
buttons of the page at the right of the footer, before the ones of `copy`,
`csv`, `svg` and `download`, e.g. own icons, with `save()`, `copy()` and
`canCopy` of the [PNG](#png), `svg()` of the [SVG](export.md#static-export) and
`csv()` of the [data](#accessibility-and-the-data):

```html
<GenVis def-file="/data/bev/def.json" @select="open">
    <template #hover="{ title, nearest }">
        <strong>{{ title }}</strong> {{ nearest?.land }}: {{ nearest?.y }}
    </template>
    <template #footer="{ footer }"><small v-html="footer"/></template>
    <template #buttons="{ save }"><button @click="save">PNG</button></template>
</GenVis>
```

Without Vue the slots are functions of their props (the prop `slots` of
[createGenVis](#javascript)) which return a node (e.g. an element or a
fragment), a text, a list of them or null. A slot is called again when its
props change, e.g. the header of new globals and the hover of another
position, its nodes are the ones from its first to its last:

```js
createGenVis(element, { defFile: '/data/bev/def.json', slots: {
    hover: ({ title, nearest }) => `${title}: ${nearest?.y}`,
    buttons: ({ save }) => Object.assign(document.createElement('button'), { textContent: 'PNG', onclick: save }),
} });
```

Without the slot, e.g. with the standalone script, `hover` of the
[options](definition.md#options) are templates of HTML of the hover: `title`, with
`{title}`, the default one, e.g. the date, above the table or the rows, and
`row`, a line per row instead of the table, with `{land}` (the name of the
category of the mapping `land`), `{land.unit}` (another hover prop), `{y}`
(the formatted value) and `{y.value}` (the value). Both have the globals,
the title also the names of the nearest row (or the first one), e.g. the
definition of a category of the position, `{definition}` of a mapping
`definition` with a hover and props, the values are text, e.g. `<` of the
data is shown as it is:

```json
"options": { "hover": { "title": "<b>{title}</b>", "row": "{land}: {y} <small>{land.unit}</small>" } }
```

`filter` of the `hover` of the options are the rows with a hover, the
conditions of mappings as the ones of [filter](definition.md#formelements-and-globals),
e.g. `{"level": "item"}`. A position without rows has no hover, e.g. a
region of a map without a value, the hover is at the nearest position with
rows, `"empty": true` shows it, e.g. the name
of every region. The other options of the hover:

- `box`: `false` leaves out the box of the hover, the highlight of its
  elements (see `highlight` of the [plot](definition.md#plot)) and the events stay,
  e.g. a larger circle with its value as the hover of a row of bars.
- `marker`: `false` leaves out the line of the position.
- `position`: the hover is beside the marker of the position, of a map the
  center of the region (`marker`, the default), or at the pointer
  (`pointer`, it moves with it, by the keyboard it is at the marker).
- `side`: `left`, `right`, `above` or `below` of the position, by default
  the side with more space, or on it (`center`), e.g. in the center of a
  polar plot, and `offset`, `[x, y]` in pixels, e.g. `"side": "above",
  "offset": [0, -10]` of a text above a region of a map, `null` is 0.
- `area`: the hover of the plot area (`plot`, the default) or of the facet
  with its margins (`facet`), e.g. the labels of the rows of horizontal bars
  are part of the row, a click on them is a `select` of the row.

`"mode": "point"` of the `hover` of the options shows the row of the point
nearest to the mouse (within `radius` pixels, 30 by default) instead of the
rows of the nearest position of the axis, e.g. of a scatter plot, in
cartesian and polar plots.

## Linked charts

The charts of a page can be linked by their events and props, e.g. a map
and a list of the countries beside it: the hover of one chart highlights the
row of the other one (the prop `highlight`, values of mappings, as an entry
of a legend highlights its category, see `highlight` and `others`
props of the [plots](definition.md#plot)), a hover of the chart itself replaces it while
it is shown, the method `setHighlight(entry)` does the same. With
`v-model:state` and `globals` they share their form elements and the
globals of the page:

```html
<GenVis def-file="/data/map.json" :highlight="country" @hover="e => country = e && { country: e.key }"/>
<GenVis def-file="/data/ranking.json" :highlight="country" @hover="e => country = e?.nearest && { country: e.nearest.country }"/>
```

```js
const ranking = createGenVis(list, { defFile: '/data/ranking.json' });
createGenVis(map, { defFile: '/data/map.json', onHover: e => ranking.setHighlight(e && { country: e.key }) });
```

## PNG

The image is a copy of the visualisation with the same state, drawn outside
of the screen in the width of `imageWidth`, so it is the same on every
screen, e.g. the facets have the columns of this width, or with `screen` in
the width it has on the screen, e.g. the layout of a phone. It is twice the
size, narrow ones more (at least 800 pixels wide, e.g. three times of 360),
has no form elements, their selection is a line below the subtitle, e.g.
`Einheit: Anteil · Jahr: 2024`, the legends only have the entries shown and
the legend of the facets is left out, their titles name them.
The titles of the buttons are in the language of `options.locale`, see
[options](definition.md#options).

Besides the buttons of `download` and `copy`, the methods of the
visualisation (of `createGenVis`, `mountGenVisElement` and a ref of the
component) are `exportPng(name)` (saves the file), `copyPng()` (copies it, in the click
of the user) and `image()` (the PNG as a `Blob`), e.g. for a button of the
page, `exportSvg(options)` is the SVG, see [static export](export.md#static-export).
They and `exportCsv` are an error while the visualisation is loaded, also
while a new definition or new data is loaded, e.g. after `rendered` again:

```html
<GenVis ref="chart" def-file="/data/bev/def.json"/>
<button @click="$refs.chart.exportPng('bev')">PNG</button>
```

## Layout shifts

The height of a visualisation is known when it is drawn, so while it is loaded
it has the space of the css variable `--gen-vis-loading-height` (0 by default,
the root has the class `vis-loading`), e.g. of a typical one or per chart, so
the page does not move when it is drawn. A visualisation which was drawn
before on the page (with the same definition and width), e.g. after a
navigation of the page, has the height it had then. A definition which is
changed is drawn when it is loaded, until then the one before is shown.

```css
.vis-outer { --gen-vis-loading-height: 450px; }
```

With the standalone script the page is shown before the script mounts the
visualisations, so the space of the empty elements is set by the page:

```css
.genVis { --gen-vis-loading-height: 450px; }
.genVis:empty { min-height: var(--gen-vis-loading-height); }
```

```html
<div class="genVis" data-def-file="/data/map.json" style="--gen-vis-loading-height: 720px"></div>
```

## Lazy loading

With `lazy` a visualisation loads its definition, its parents and its data
only when it comes near the viewport (400 pixels by default), e.g. of a page
of ten charts of which a phone shows two, so the requests of the charts at
the top do not wait for the ones below. Until then it has the space of a
visualisation which is loaded (see [layout shifts](#layout-shifts)), so
`--gen-vis-loading-height` keeps the charts below out of view; without it
the empty charts have no height and the ones close below are loaded at once.
Once it is loaded it stays loaded, new props before are the ones it is
loaded with. Without an `IntersectionObserver`, e.g. of old browsers, it is
loaded at once. The buttons and the methods of the files (`exportPng`,
`image`, ...) need it loaded. Visualisations which are not loaded yet are
empty when the page is printed, the browser prints at once, so a page which
is printed leaves out `lazy`.

```html
<GenVis def-file="/data/bev/def.json" lazy/>
<div class="genVis" data-def-file="/data/map.json" data-lazy="800px"></div>
```

## Accessibility and the data

Every facet is named by the title and the name of the facet, the entries of
the legends are checkboxes of the keyboard, the titles of the form elements
are their labels. A facet with a hover is in the order of the tab key: the
arrows to the left and the right move the hover to the position before and
after (of a map the regions by their names, of the `point` mode the points
from the left), the ones up and down to the row above and below, home and
end to the first and the last position, enter and space select it (the
event `select`, as a click), escape hides it. Without a title it is named by the subtitle or the `chart` of the locale, with
both the subtitle is its description. For screen readers it is an
application (`role="application"`, `aria-roledescription` of the `chart`
of the locale), so they pass the keys to it, its description names the
keys (`keys` of the locale), and they read the hover when the keys move it
(`aria-live`), not when the mouse does. A facet without a hover is an image
(`role="img"`), as the legend of a scale of colors (named by its title).

The data shown can be saved as CSV: the button of `csv` or the method
`exportCsv(name)` save the rows shown (of the visible categories and the
filter) in the columns of the mappings, with the values as they are in the
data.

## State

The state holds what the user changed compared to the definition: the
globals of the form elements and the entries of the legends shown or hidden.

```json
{ "globals": { "column": "share" }, "visible": { "year": { "2019": true, "2022": false } } }
```

The visualisation emits `update:state` on every change of the user, so with
`v-model:state` (or `'onUpdate:state'` and `update({ state })`) the page can
keep it, e.g. in the local storage, `state` of the visualisation is the one
it has. A given state
is applied when the visualisation is loaded, a new one (`null` for the
definition) is applied without loading it again. Globals, values and entries
the definition does not have (anymore) are ignored, new entries of the
definition keep their defaults.

```html
<GenVis def-file="/data/bev/def.json" v-model:state="state"/>
```

## Styles

The styles of the package are injected once by its script (a `<style>` in
the head of the page, also of the standalone script), in the cascade layer `gen-vis`, so every style
of the page overrides them, regardless of its specificity and of the order of
the styles, e.g.:

```css
.vis-form-element { display: block; margin: 6px 4px; }
.vis-subtitle { font-size: 15px; }
/* the row of the category `load` of the mapping `type` in the hover */
.vis-hover-entry[data-type="load"] { font-style: italic; }
```

The charts fill the width of `.vis` inside its padding and border, so the
page can style it as a card (`vis-outer` is the root of the visualisation,
the element of the component):

```css
.vis { padding: 20px; border-radius: 12px; background: white; }
```

All classes of the package start with `vis-`, so styles of the page for
other elements do not apply to them, e.g. `.title` of a CSS framework, the
others are the `id` of a plot, e.g. `plot-0`, and the classes of the ticks
and the lines of the axes, `tick` and `domain`, as the ones of d3:

| Part | Classes |
|------|---------|
| the visualisation | `vis-mounted` (an element mounted by `mountGenVisByClass` or `mountGenVisElement`), `vis-outer` (the root, `vis-loading` while it is loaded), `vis` (with `options.class` and the globals as `data-global-` attributes), `vis-message` (the text instead of the plots), `vis-header` (`vis-title`, `vis-subtitle`, in the [PNG](#png) `vis-selection`), `vis-body`, `vis-error` |
| form elements | `vis-form-elements`, `vis-form-element` (`vis-form-element-title`, `vis-radio`, `vis-slider`, `vis-slider-value`), the `id` of a form element and of its entries as `data-id`, e.g. `.vis-form-element[data-id="scale"]` |
| legends | `vis-legends` (above the plots, `vis-legends-bottom`, `vis-legends-left` and `vis-legends-right`, the plots beside them are in `vis-plots`), `vis-legend` (`vis-legend-title`, `vis-legend-entries`, `vis-legend-entry`, the mapping as `data-dim`, an entry with `data-key` and `data-visible`), `vis-color-legend` (`vis-color-scale`, `vis-legend-missing`, `vis-swatch`) |
| facets | `vis-facet` (a facet), `vis-facet-title` (`vis-facet-title-center` of polar plots, centered), `vis-svg` |
| plots | `vis-plot` (with the `id` of the plot and its `data-plot`, `vis-below` or `vis-above` of its layer), `vis-group` (the elements of a group of a plot with an element per row), `vis-highlight` (the highlighted elements), `vis-features` (geo:base), `vis-mesh` (geo:mesh), the keys of the features of maps as `data-geo-key` |
| axes | `vis-axis` and `vis-axis-bottom`, `-top`, `-left`, `-right`, `-angular` or `-radial` (the mapping as `data-mapping`), `vis-axis-title`, `vis-grid` |
| annotations | `vis-annotations` (the plot), `vis-annotation` and `vis-band`, `vis-line`, `vis-text` or `vis-circle`, `vis-annotation-label`, `vis-annotation-labels` |
| hover | `vis-hover` (`vis-hover-title`, `vis-hover-entries`, `vis-hover-entry`, `vis-hover-row` of a template, `vis-nearest`, the key of the category of every categorical mapping of a row as `data-` attribute, e.g. `data-type="load"` of the mapping `type` (`data-land-name` of `landName`), the cells of the values `vis-value`, the mapping of a cell as `data-mapping`, the hover prop of a category other than its name as `data-prop`), `vis-hover-marker`, `vis-events` |
| footer | `vis-footer` (`vis-footer-content`, `vis-buttons`, the buttons `vis-copy`, `vis-csv`, `vis-download-svg` and `vis-download`) |

Styles of the page which are in a cascade layer themselves only override the
package if their layer is declared after it, e.g. `@layer gen-vis, page;`.

The font and the colors of the package are css variables, e.g. for a dark
page (the default in brackets):

```css
.vis {
    --gen-vis-font-family: Arial, sans-serif;  /* Inter, system-ui, …, sans-serif */
    --gen-vis-grid-color: #444;                /* #E3E5E8, the grid lines */
    --gen-vis-axis-color: #777;                /* #9AA0A8, the lines and marks of the axes */
    --gen-vis-axis-label-color: #BBB;          /* #5F6670, their labels and titles */
    --gen-vis-muted-color: #AAA;               /* #5F6670, the subtitle and the footer */
    --gen-vis-hover-background: #222D;         /* #FFFFFFF2 */
    --gen-vis-hover-border-color: #444;        /* #E3E5E8, the border and lines of the hover */
    --gen-vis-halo-color: #111;                /* white, behind labels on the plots */
    --gen-vis-text-color: #EEE;                /* #1F2328, the texts of plots without a fill */
    --gen-vis-background: #111;                /* #FFF, of the PNG */
    color: #EEE;                               /* the titles, legends and the hover */
}
```

The others are `--gen-vis-marker-color` (`#9AA0A8`, the line of the hover),
`--gen-vis-band-color` (`#F1F2F4`), `--gen-vis-line-color` (`#9AA0A8`),
`--gen-vis-annotation-color` (`#444` of texts, `#5F6670` of labels, `#666`
of circles), `--gen-vis-missing-color` (`#EEE`, the missing values of a
legend), `--gen-vis-button-color` (`#B8BDC4`), `--gen-vis-button-hover-color`
(`#5F6670`), `--gen-vis-focus-color` (`#4269D0`, the first color of
observable10, the entries of legends and the facets) and
`--gen-vis-error-color` (`#B42318`). The default look: Inter, which the
package brings (see [the font](#the-font)), figures of the same width
in the hover (`tabular-nums`), grey axes, light grid lines, a hover card; the colors of
categories without colors are d3's `observable10`. The colors of annotations are only the ones
without a color of their `props`.

### The font

The default font is Inter (SIL Open Font License, `LICENSE-Inter.txt` next to
the files), of the package: its Latin and Latin Extended letters of the
weights 400 and 600 as woff2 files (about 120 kB, a browser loads only the
ones of the texts, e.g. 50 kB of German), once in the package, in
`dist-lib/esm/chunks/fonts/`: the module loads them next to its chunk, the
es modules for bundlers (`dist/`) of `new URL("../dist-lib/esm/chunks/fonts/…",
import.meta.url)`, which bundlers of applications copy (e.g. webpack 5 and
vite), the single file of `esm/chunks/fonts/` next to its url (a copy of
`dist-lib/`, e.g. of `npm run upload`, has them, unpkg and jsDelivr serve
them; the single file alone draws in the font of the system). The rules are
also a stylesheet next to them, `inter.css`. A page with a font of its
own (`--gen-vis-font-family` or `fontFamily`) loads none of them. Charts
measure their texts again when a font of the page is loaded after their
first draw, the images load the font of the chart before they draw it.

The props of a definition can be css variables, e.g. the ones of the page or
of the package, `"stroke": "var(--gen-vis-grid-color)"` is the color of the
grid lines, also after the page changes it. Svg attributes do not know
variables, so a value with `var(` is a style of the element, not an
attribute, it is set at once, also with a transition, and it works for the
props which are css properties of svg, e.g. colors, widths, opacities and
fonts, not for positions, e.g. `x`. Of all props: of plots, annotations,
axes (`labels`, `domain`, `tickMarks`), legends and the highlight
(`highlight` and `others` of plots).
