# Extensions

A page can register plot types, coordinate systems, color schemes and
defaults before its visualisations load. The definition checks also run
outside the browser, and the schema and types describe definitions for
editors.

## Plot types

A plot type returns the marks of the groups of
rows of a plot (`marks(groups, plot, ctx)`), one group per combination of
its categories, the package draws them, it does not draw itself. A group has
its `rows`, the keys of its categories (`categories`), their props (`props`)
and the values of the props of the plot: of a row `at(row)`, of one prop
`prop(name)(row)` and the ones which are the same for all rows `attrs`,
e.g. the color of a line, `complete(row)` is false if a mapping of the props
has no value. The values are plain values, e.g. the position of
`"@x:scaled"`. `perRow(groups, element, translate, key)` are the marks of an
element per row (without the rows of missing values) with the values of its
props as attributes, `translate(values, row, group)` changes them,
`perGroup(groups, d)` the ones of a path per group with `attrs` and the path
`d(group)`, both move their elements with the `transition` of the options:

```js
import { registerPlotType, perRow } from '@preschen/gen-vis';

registerPlotType('my:tick', {
    update: true,
    defaults: { cx: '@x:scaled', fill: { or: ['@color', 'currentColor'] } },
    marks: (groups, plot, ctx) => perRow(groups, 'rect', v => ({
        ...v, x: v.cx - 1, width: 2, height: ctx.innerHeight,
    })),
});
```

`defaults` are the type's default props, an object or a function of the
plot's props. They apply under the full name (`"type": "my:tick"`) and the
short name (`"type": "tick"`) alike. A short name resolves to the type
with the coordinate system's prefix (e.g. `cartesian:tick`), then to
`svg:tick`, otherwise to the only registered type of that name (here
`my:tick`). A plot's props are merged
into the defaults (nested ones deeply, `null` removes one); the built-in
defaults are in `src/plots/defaults.js`.

The marks are a layer, `{ element, groups: [{ categories, items }] }` (an
element per item in a `g.vis-group` per group) or `{ element, items }` (the
elements directly in the group of the plot), an item has the attributes of
its element (`text` is its text), `key(item)` of the layer is the key of its
element, by default its row or its index, `class` is a class of the group of
the plot and `fit` cuts or wraps the texts with a `max-width`, null draws
nothing, see `drawLayer` of `src/utils/draw.js`.

`ctx` is the facet: the `store`, `inner` (the svg element `g` of its plots
and axes, a DOM element, its origin is the one of the coordinate system),
the `key` of the facet, its `rows`, the
`scales` by the names of the mappings, `axis` (the names of the mappings of
the positions and of the values), `stackOf(row)` (the start and the end of a
stacked value), `scope` (the names of the references of the facet, see
[props](definition.md#props-of-the-definition)), `innerWidth`, `innerHeight` and `dims`
(the sizes of the coordinate system, e.g. its `radius`), of maps also the
`projection` and the `path`. `curve: true` passes the `curve` of the plot,
`coords` limits a type to coordinate systems, e.g. `cartesian:bar` to
`cartesian`. The types of `PlotType`, `PlotGroup` and `Layer` are in the
package.

A new view, e.g. of a toggle of a legend, a form element or a new width, is
drawn into the elements of the one before, only the attributes which change
are set. With `update: true` the marks of a type are drawn into the
elements of the draw before (the groups are the ones of the same
categories, the elements per row the ones of the same rows or, of
`perRow(groups, element, translate, key)`, of the same `key(values)`, e.g.
`geo:region` the one of the same feature after a filter), the elements of
other types are removed before they are drawn again.

## Coordinate systems

A coordinate system (`registerCoord(name, coord)`) has the default ranges of
the orientations of its scales, the parts of its axes (the ticks, labels and
lines as layers or an axis of a side, also marks, drawn by the package), the
items of its annotations and the geometry of the hover, see
`src/coords/index.js` and e.g. `src/coords/polar.js`. Its functions get DOM
elements, no d3 selections: `hover.area(ctx, parent)` appends the element of
the pointer events to the element `parent` and returns it,
`hover.marker(ctx, key, names, line, nearest)` places the svg element
`line` by its attributes (`x1`, `y1`, `x2`, `y2`, removed without a line),
`raise(ctx)` moves elements of `ctx.inner`. `load()` of a
coordinate system loads its parts with its first chart, e.g. the ones of maps
(`src/coords/geo.js`), again with the next one if it failed.

## Schemes of colors

A scheme of colors (`registerScheme(name, colors)`, `colors` an array of
CSS colors) is one of `scheme` of the categories and of the scales as the
ones of d3, e.g. the colors of a house style, which a stylesheet can not
give a definition; the categories take its colors in their order (again
from the first one if there are more), a scale of `classes` its first ones
(all of them if it has fewer), it needs no colors of d3 and takes precedence
over a scheme of d3 of the same name. A scheme of several sizes, as the
ones of d3, e.g. `Blues`, is an array whose entry n is the array of n
colors, entries without a size are `null` (holes): n categories (or
classes) take the first n colors of the smallest size of at least n
colors, more than the largest size its colors again from the first one,
e.g. `registerScheme('wifoBlues', [null, null, ['#9EC5E8', '#005CA9'],
['#C6DBEF', '#6BAED6', '#005CA9']])`. A registered `observable10` is also
the palette of the categories without colors and without a scheme (the
default colors, d3's Observable10 otherwise), e.g. the colors of a house
style for every definition:

```js
import { registerScheme } from '@preschen/gen-vis';

registerScheme('wifo', ['#005CA9', '#E6A000', '#7AB51D', '#A6A6A6']);
// "land": { "column": "Bundesland", "fromData": true, "scheme": "wifo", "legend": {} }
registerScheme('observable10', ['#005CA9', '#E6A000', '#7AB51D', '#A6A6A6']);
```

`registerScheme` returns a function that restores what was registered
under that name before (or removes the name again), e.g. for a scheme that
applies to one chart only:

```js
const restore = registerScheme('wifo', ['#005CA9', '#E6A000']);
// … draw or export …
restore();
```

## Defaults of the page

`registerDefaults(defaults)` replaces built-in defaults of the parts of all
charts of the page, see [defaults](definition.md#defaults).

## The check and the standalone script

`validateDef` knows registered plot types, coordinate systems and
schemes; `@preschen/gen-vis/check` exports `registerPlotType`,
`registerCoord` and `registerScheme` too. The single file has them as
`GenVis.registerPlotType`, `GenVis.registerCoord`, `GenVis.registerScheme`,
`GenVis.registerDefaults`, `GenVis.perRow` and `GenVis.perGroup`. The core
loader (`gen-vis.core.js`) forwards the `register…` functions (they return
promises), but `perRow` and `perGroup` are only on the loaded module:
`const { perRow } = await GenVis.ready`. The schema only knows the built-in
ones.

## Schema and types

The package contains the JSON Schema of the definitions, `schema.json`, see
[`$schema`](definition.md#schema), and the types of TypeScript of the definitions and of
the API, see [JavaScript](usage.md#javascript). The types of the definitions
(`types/definition.d.ts`) are generated of the schema (`npm run types`), the
schema only knows the built-in plot types, coordinate systems and schemes.

## Checks outside the browser

`@preschen/gen-vis/check` merges and checks definitions in scripts, e.g. all
definitions of a page before a deploy, `load` reads the file of an url:

```js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveParents, validateDef } from '@preschen/gen-vis/check';

const url = pathToFileURL('data/ecad/polar-tg.json').href;
const def = await resolveParents(JSON.parse(readFileSync(new URL(url), 'utf8')), url,
    u => readFileSync(new URL(u), 'utf8'));
console.log(validateDef(def));  // the warnings, e.g. unknown plot types
```

`validateDef(def, rows)` also checks the data rows, e.g. years as numbers
in a `date` mapping. Mappings without a type get the type the load infers
from the values (also for transform columns).

`normalize(def)` writes out the defaults a definition leaves implicit, see
`spec/normalize.md`.

The parts not bound to the browser (expressions, transforms, merging and
normalize) are specified by the fixtures in `spec/` (`spec/README.md`), so
other languages, e.g. Python or R, can implement them; the package tests
run them.
