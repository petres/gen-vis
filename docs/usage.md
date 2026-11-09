# Usage

How a page draws charts from definitions: the browser module, the
core's JavaScript API and the Vue component, their props, events and slots,
images and styles. The definitions themselves are in
[definition](definition.md), the static export in [static export](export.md).

```sh
npm install @preschen/gen-vis
```

The package is a core without a framework (`createGenVis`, see
[JavaScript](#javascript)), with the browser module for pages without a
bundler and an adapter of Vue 3 (`@preschen/gen-vis/vue`, see [Vue
component](#vue-component)), `vue` is an optional peer dependency.

## Browser module

The browser module includes d3 and the styles, for pages without a
bundler, e.g. from a CDN (`dist-lib/esm/gen-vis.js`): it loads 94 kB
(gzipped) at first and fetches optional parts, e.g. for maps, from the
files next to it when a chart needs them:

```html
<div class="genVis" data-def-file="/data/bev/def.json"></div>

<script type="module">
import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/dist-lib/esm/gen-vis.js';
mountGenVisByClass('genVis');
</script>
```

The module also sets `mountGenVisElement`, `mountGenVisByClass` and
`unmountGenVisElement` as globals of the window, e.g. for the scripts of a
page which run after it is loaded. (The single file `dist-lib/gen-vis.js`
and the core loader `gen-vis.core.js` of gen-vis 4 are gone, they had no
user; a page loads the module.)

It contains no Vue. A page that loads Vue 3 as a script (the global
`Vue` from `vue.global.prod.js`, or `vue` in its import map) gets a
component for its own Vue from the module: `vuePlugin(Vue)` is the
plugin which registers `<GenVis>` (its `component` is the component),
`createVueComponent(Vue)` the component itself, the same as the [Vue
component](#vue-component):

```js
import * as Vue from 'vue';
import { vuePlugin } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/dist-lib/esm/gen-vis.js';
Vue.createApp(App).use(vuePlugin(Vue)).mount('#app');
```

With a bundler the module is `@preschen/gen-vis/esm`. It has no `types`
entry in `package.json`; the types are the ones of the main entry
(`import type { GenVisInstance } from '@preschen/gen-vis'`).

`npm run lib` builds it in `dist-lib/esm/`, with the [export
page](export.md#export-page). `npm run upload` copies all of `dist-lib/`
to your own server (`GEN_VIS_UPLOAD` in `.env`): the module is
unversioned, a page loads the latest upload. The upload also writes
compressed copies next to the files (`.br`, `.gz`) for servers which send
them as they are, e.g. nginx with `brotli_static` and `gzip_static`; a CDN
compresses them itself.

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
mountGenVisElement(element, { onSelect: e => location.href = `/region/${e.key}` });
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
parts, e.g. `Dim`, `Mark` and `Control`), of the [schema](definition.md#schema), so an
editor checks a definition of the code:

```ts
import type { Definition, Mark } from '@preschen/gen-vis';

const line: Mark = { type: 'line', by: 'land' };
const def: Definition = { data: 'data.csv', dims: { x: 'Jahr', y: 'Einwohner', land: 'Bundesland' }, marks: line };
```

Optional parts load on demand, so your bundler splits them into separate
chunks; the rest is ~68 kB gzipped. The sizes are gzipped: the check of the
definitions (~30 kB, with the texts of the schema) with the first one of `check`, the colors of d3
(`d3-scale-chromatic`, ~8 kB) for definitions which name a scheme or an
interpolator, the parts of maps (`d3-geo`, `topojson-client`, ~13 kB) with
the first map, the parts of polar charts (~5 kB) with the first one, the
transforms (~4 kB), the legend of scales of colors (~2 kB), the languages of
`Intl` (~1 kB) other than `de` and `en`, the parquet reader (~18 kB) for
parquet data, the PNG, the SVG and the CSV (~9 kB) with the first one, and
the migration of definitions of 4.x (~5 kB) with the first one.

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
| `defFile`  | `data-def-file` | url of the definition; with `def` the url of its file, its parents and data are relative to it (e.g. a definition edited on a page) |
| `def`      | `data-def`      | the definition, an object or a JSON string |
| `data`     | `data-data`     | the data as rows, a CSV/JSON string or bytes (an `ArrayBuffer` or `Uint8Array`, parquet or the text of CSV/JSON), if not given it is loaded from the `data` url of the definition |
| `debug`    | `data-debug`    | shows the prepared definition, with the warnings of `check` |
| `check`    | `data-check`    | logs the warnings of the check of the definition in the console, e.g. unknown mark types, while it is written, the check is only loaded then |
| `state`    | `data-state`    | the changes of the user, see [state](#state), the attribute is JSON |
| `highlight` | `data-highlight` | the rows highlighted by the page, values of dims, e.g. `{"country": "AT"}` of the hover of another chart, see [linked charts](#linked-charts), the attribute is JSON |
| `globals`  | `data-globals`  | the globals of the page, e.g. the language or the year of a menu of the page, also of hidden controls, see [globals](definition.md#globals-and-controls), the attribute is JSON |
| `defaults` | `data-defaults` | the defaults of the parts instead of the built-in ones, e.g. `{"axis": {"padding": 2, "tickMarks": {"size": 4, "inset": 0}}, "margins": {"left": 60}}` for all axes and the left margin, the values of the definition take precedence, see [defaults](definition.md#defaults), the attribute is JSON |
| `download` | `data-download` | a button at the right of the footer to save it as a PNG, a string is the name of the file (default the title) |
| `copy`     | `data-copy`     | a button at the right of the footer to copy the PNG to the clipboard (only on https or localhost) |
| `csv`      | `data-csv`      | a button at the right of the footer to save the data shown as CSV, a string is the name of the file (default the title) |
| `svg`      | `data-svg`      | a button at the right of the footer to save it as an SVG, see [static export](export.md#static-export), a string is the name of the file (default the title) |
| `imageWidth` | `data-image-width` | the width of the PNG in pixels (the chart is laid out at it, also a definition with a `width` of its own), the one of the definition otherwise or 800, `screen` for the one on the screen (as it is seen, e.g. on a phone) |
| `lazy`     | `data-lazy`     | draws the visualisation only when it is near the viewport, `true` within one height of the viewport, a string is the `rootMargin` of the `IntersectionObserver`, e.g. `"800px 0px"`; its files are loaded ahead (three heights) when the browser is idle, see [lazy loading](#lazy-loading) |

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
of the dims (the categories as strings, of every format of the data, see
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

A button of the page with the class `vis-button` looks like the ones of
the package: an `svg` of strokes (e.g. a `viewBox` of 24×24, the icons of
the package are 16 pixels wide) in `--gen-vis-button-color`, darker under
the pointer (`--gen-vis-button-hover-color`), lighter if it is `disabled`
(`--gen-vis-button-disabled-color`, `#E3E5E8`), in the color of the text
with `aria-pressed="true"`, e.g. a toggle:

```html
<template #buttons>
    <button class="vis-button" title="Reset" @click="reset">
        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
</template>
```

Without the slot `hover` of the definition has templates of HTML of the
hover (`title` and `row`), its `filter`, `mode`, `box`, `marker`,
`position`, `side`, `offset` and `area`, see [`hover`](definition.md#hover).

## Linked charts

The charts of a page can be linked by their events and props, e.g. a map
and a list of the countries beside it: the hover of one chart highlights the
row of the other one (the prop `highlight`, values of dims, as an entry
of a legend highlights its category, see `highlight` and `others`
of the [marks](definition.md#highlight-and-others)), a hover of the chart itself replaces it while
it is shown, the method `setHighlight(entry)` does the same. With
`v-model:state` and `globals` they share their controls and the
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
has no controls, their selection is a line below the subtitle, e.g.
`Einheit: Anteil · Jahr: 2024`, the legends only have the entries shown and
the legend of the facets is left out, their titles name them. The PNG is
the SVG of the [static export](export.md#exportsvg) drawn on a canvas, with
the fonts of the package, so the PNG, the SVG and the PDF of the CLI are
the same drawing. The titles of the buttons are in the language of
`locale`, see [the options](definition.md#the-options).

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
before on the page (with the same definition), e.g. after a navigation of
the page, has the height it had then; the mount of a chart forces no
layout of the page. A definition which is
changed is drawn when it is loaded, until then the one before is shown.

```css
.vis-outer { --gen-vis-loading-height: 450px; }
```

With the browser module the page is shown before the script mounts the
visualisations, so the space of the empty elements is set by the page:

```css
.genVis { --gen-vis-loading-height: 450px; }
.genVis:empty { min-height: var(--gen-vis-loading-height); }
```

```html
<div class="genVis" data-def-file="/data/map.json" style="--gen-vis-loading-height: 720px"></div>
```

## Lazy loading

With `lazy` a visualisation is drawn only when it comes near the viewport
(within one height of the viewport above or below it by default, or the
margin of `lazy`), e.g. of a page of ten charts of which a phone shows two,
so the requests of the charts at the top do not wait for the ones below.
Its definition, its parents and its data are loaded and prepared before,
when it is within three heights of the viewport and the browser is idle
(`requestIdleCallback`), so it is drawn at once when it comes near; the
charts further down are loaded only when the page is scrolled towards them. Until then it has the space of a
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
the legends are checkboxes of the keyboard, the titles of the controls
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
filter) in the columns of the dims, with the values as they are in the
data. A text which a spreadsheet would read as a formula (starting with
`=`, `+`, `-`, `@`, a tab or a carriage return, e.g. `=HYPERLINK(...)`)
gets a `'` before it; numbers, also negative ones, stay as they are.

## State

The state holds what the user changed compared to the definition: the
globals of the controls and the entries of the legends shown or hidden.

```json
{ "globals": { "values": "share" }, "visible": { "year": { "2019": true, "2022": false } } }
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
the head of the page, also of the browser module), in the cascade layer `gen-vis`, so every style
of the page overrides them, regardless of its specificity and of the order of
the styles, e.g.:

```css
.vis-control { display: block; margin: 6px 4px; }
.vis-subtitle { font-size: 15px; }
/* the row of the category `load` of the dim `type` in the hover */
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
others are the `id` of a mark, e.g. `mark-0`, and the classes of the ticks
and the lines of the axes, `tick` and `domain`, as the ones of d3:

| Part | Classes |
|------|---------|
| the visualisation | `vis-mounted` (an element mounted by `mountGenVisByClass` or `mountGenVisElement`), `vis-outer` (the root, `vis-loading` while it is loaded), `vis` (with the `class` of the definition and the globals as `data-global-` attributes, `data-vis` the number of the chart), `vis-message` (the text instead of the marks), `vis-header` (`vis-title`, `vis-subtitle`, in the [PNG](#png) `vis-selection`), `vis-body`, `vis-error` |
| controls | `vis-controls`, `vis-control` (`vis-control-title`, `vis-radio`, `vis-slider`, `vis-slider-value`), the `id` of a control and of its entries as `data-id`, e.g. `.vis-control[data-id="scale"]` |
| legends | `vis-legends` (above the plots, `vis-legends-bottom`, `vis-legends-left` and `vis-legends-right`, the plots beside them are in `vis-plots`), `vis-legend` (`vis-legend-title`, `vis-legend-entries`, `vis-legend-entry`, the dim as `data-dim`, an entry with `data-key` and `data-visible`, `vis-legend-highlight` of the category of the hovered row, `bold` of an entry with that class in its [props](definition.md#legends)), `vis-legend-annotations` (the entries of [annotations](definition.md#annotations)), `vis-color-legend` (`vis-color-scale`, `vis-legend-missing`, `vis-swatch`) |
| facets | `vis-facet` (a facet), `vis-facet-title` (`vis-facet-title-center` of polar plots, centered, `vis-facet-col-title` of the columns of a grid), `vis-facet-row-title` (the headers of the rows of a grid, `vis-facet-row-title-left` or `-right`, `-horizontal` or `-vertical`), `vis-facet-empty` (a cell of a grid without rows), `vis-svg` |
| marks | `vis-mark` (with the `id` of the mark and its `data-mark`, `vis-below` or `vis-above` of its layer), `vis-group` (the elements of a group of a mark with an element per row), `vis-highlight` (the highlighted elements, their group `vis-highlight-group` of a highlight of a row), `vis-highlighting` (the plots of a facet while a highlight is shown), `vis-features` (the base of a map), `vis-mesh` (the mesh of a map), the keys of the features of maps as `data-geo-key` |
| axes | `vis-axis` and `vis-axis-bottom`, `-top`, `-left`, `-right`, `-angular` or `-radial` (the dim as `data-dim`, `vis-axis-at` of an axis at a value), `vis-axis-title` (`vis-axis-title-top`), `vis-grid` |
| annotations | `vis-annotations` (the plot), `vis-annotation` and `vis-band`, `vis-line`, `vis-text` or `vis-circle`, `vis-annotation-label`, `vis-annotation-labels` |
| hover | `vis-hover` (`vis-hover-title`, `vis-hover-entries`, `vis-hover-entry`, `vis-hover-row` of a template, `vis-nearest`, the key of the category of every categorical dim of a row as `data-` attribute, e.g. `data-type="load"` of the dim `type` (`data-land-name` of `landName`), the cells of the values `vis-value`, the dim of a cell as `data-dim`, the hover prop of a category other than its name as `data-prop`, `vis-hover-total` the row of the total), `vis-hover-marker`, `vis-events` |
| footer | `vis-footer` (`vis-footer-content`, `vis-buttons`, the buttons `vis-button` and `vis-copy`, `vis-csv`, `vis-download-svg` or `vis-download`) |

Styles of the page which are in a cascade layer themselves only override the
package if their layer is declared after it, e.g. `@layer gen-vis, page;`.

The font and the colors of the package are css variables, e.g. for a dark
page (the default in brackets):

```css
.vis {
    --gen-vis-font-family: Arial, sans-serif;  /* Inter, system-ui, …, sans-serif */
    --gen-vis-grid-color: #444;                /* #01132E1C (#E3E5E8 on white, translucent), the grid lines */
    --gen-vis-axis-color: #777;                /* #9AA0A8, the lines and marks of the axes */
    --gen-vis-axis-label-color: #BBB;          /* #5F6670, their labels and titles */
    --gen-vis-muted-color: #AAA;               /* #5F6670, the subtitle and the footer */
    --gen-vis-hover-background: #222D;         /* #FFFFFF */
    --gen-vis-hover-border-color: #444;        /* #E3E5E8, the border and lines of the hover */
    --gen-vis-halo-color: #111;                /* white, behind labels on the plots */
    --gen-vis-text-color: #EEE;                /* #1F2328, the texts of marks without a fill */
    --gen-vis-background: #111;                /* #FFF, of the PNG */
    color: #EEE;                               /* the titles, legends and the hover */
}
```

The others are `--gen-vis-marker-color` (`#9AA0A8`, the line of the hover),
`--gen-vis-cross-color` (the marker color, the crosshair of `hover.cross`),
`--gen-vis-band-color` (`#F1F2F4`), `--gen-vis-line-color` (`#9AA0A8`),
`--gen-vis-annotation-color` (`#444` of texts, `#5F6670` of labels, `#666`
of circles), `--gen-vis-missing-color` (`#EEE`, the missing values of a
legend), `--gen-vis-button-color` (`#B8BDC4`), `--gen-vis-button-hover-color`
(`#5F6670`), `--gen-vis-button-disabled-color` (`#E3E5E8`, of the buttons
of the page with the class `vis-button`), `--gen-vis-focus-color` (`#4269D0`, the first color of
observable10, the entries of legends and the facets) and
`--gen-vis-error-color` (`#B42318`); of sizes `--gen-vis-tick-inset` (the part of the tick marks inside the plot area, see [`tickMarks`](definition.md#axes)) and the margins of a house style, `--gen-vis-margin-top`, `-right`, `-bottom` and `-left` (a length in pixels or `auto`, see [margins](definition.md#margins)) and `--gen-vis-legend-symbol-middle` (`0.36em`, the middle of the legend symbols above the baseline of their names). The default look: Inter, which the
package brings (see [the font](#the-font)), figures of the same width
in the hover (`tabular-nums`), grey axes, light grid lines, a hover card; the colors of
categories without colors are d3's `observable10`. The colors of annotations are only the ones
without a color of their `props`.

### The font

The default font is Inter (SIL Open Font License, `LICENSE-Inter.txt` next to
the files), of the package: its Latin and Latin Extended letters of the
weights 400 and 600 as woff2 files and its symbols which these have not,
superscripts and subscripts (e.g. CO₂, m³), arrows, mathematical operators
(≤, ≥, ≈, ∅), letterlike symbols (℃, №), fractions and Roman numerals and
geometric shapes (●, ▲), subset by `scripts/fonts.sh` (about 140 kB, a
browser loads only the ones of the texts, e.g. 50 kB of German; Inter has
no ⌀, the font of the computer draws it), once in the package, in
`dist-lib/esm/chunks/fonts/`: the module loads them next to its chunk, the
es modules for bundlers (`dist/`) of `new URL("../dist-lib/esm/chunks/fonts/…",
import.meta.url)`, which bundlers of applications copy (e.g. webpack 5 and
vite; a copy of `dist-lib/`, e.g. of `npm run upload`, has them, unpkg and
jsDelivr serve them). The rules are
also a stylesheet next to them, `inter.css`, e.g. of the font for texts of
the page: an application imports it from the package
(`import '@preschen/gen-vis/inter.css'`, its bundler copies the woff2 files), a
page without a bundler links it of a CDN (`<link rel="stylesheet"
href="https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/dist-lib/esm/chunks/fonts/inter.css">`).
A page with a font of its
own (`--gen-vis-font-family` or `fontFamily`) loads none of them. Charts
measure their texts again when a font of the page is loaded after their
first draw, the images load the font of the chart before they draw it.

The attributes of a definition can be css variables, e.g. the ones of the
page or of the package, `"stroke": "var(--gen-vis-grid-color)"` is the
color of the grid lines, also after the page changes it. Svg attributes do
not know variables, so a value with `var(` is a style of the element, not
an attribute, it is set at once, also with a transition, and it works for
the attributes which are css properties of svg, e.g. colors, widths,
opacities and fonts, not for positions, e.g. `x`. Of all attributes: of
marks, annotations, axes (`labels`, `domain`, `tickMarks`), legends and the
highlight (`highlight` and `others` of marks).
