# Extensions

A page can register mark types, coordinate systems, color
schemes and defaults before its visualisations load. The definition checks also run
outside the browser, and the schema and types describe definitions for
editors.

## Mark types

A mark of a definition is drawn by its type, a mark type of the engine
(`registerMarkType`). The type gets the mark with its attributes as
`props`, its channels as the props of the scaled positions (e.g.
`"x": "lo"` is `"x": "@lo:scaled"`), see [design-5.0.md](design-5.0.md). A
mark type returns the shapes of the groups of rows of a mark
(`marks(groups, mark, ctx)`), one group per combination of its categories,
the package draws them, it does not draw itself. A group has
its `rows`, the keys of its categories (`categories`), their props (`props`)
and the values of the props of the mark: of a row `at(row)`, of one prop
`prop(name)(row)` and the ones which are the same for all rows `attrs`,
e.g. the color of a line, `complete(row)` is false if a dim of the props
has no value. The values are plain values, e.g. the position of
`"@x:scaled"`. `perRow(groups, element, translate, key)` are the marks of an
element per row (without the rows of missing values and the ones without
a position: an `x`, `y`, `cx`, `cy`, `x1`, `x2`, `y1`, `y2`, `width` or
`height` which is no finite number, e.g. of 0 of a log scale) with the
values of its props as attributes, `translate(values, row, group)` changes
them (null leaves the row out),
`perGroup(groups, d)` the ones of a path per group with `attrs` and the path
`d(group)`, both move their elements with the `transition` of the options:

```js
import { registerMarkType, perRow } from '@preschen/gen-vis';

registerMarkType('my:spike', {
    update: true,
    defaults: { x: '@x:scaled', fill: { or: ['@color', 'currentColor'] } },
    marks: (groups, mark, ctx) => perRow(groups, 'rect', v => ({
        ...v, x: v.x - 1, width: 2, height: ctx.innerHeight,
    })),
});
```

`defaults` are the type's default props, an object or a function of the
mark's props. They apply under the full name (`"type": "my:spike"` of a
mark) and the short name (`"type": "spike"`) alike. A short name resolves to the type
with the coordinate system's prefix (e.g. `cartesian:spike`), then to
`svg:spike`, otherwise to the only registered type of that name (here
`my:spike`). The attributes of a mark are merged
into the defaults (nested ones deeply, `null` removes one); the built-in
defaults are in `src/marks/defaults.js`. A registered type gets the
channels of a mark as attributes of its elements, as written: `x: "lo"` of
a mark is `x: "@lo:scaled"` of the item (a dim is its scaled position), a
number stays a number; the type reads them as any other attribute, e.g.
`x` of the defaults above, which `"x": "lo"` of a mark replaces.

The shapes are a layer, `{ element, groups: [{ categories, items }] }` (an
element per item in a `g.vis-group` per group) or `{ element, items }` (the
elements directly in the group of the mark), an item has the attributes of
its element (`text` is its text), `key(item)` of the layer is the key of its
element, by default its row or its index, `class` is a class of the group of
the mark and `fit` cuts or wraps the texts with a `max-width`, null draws
nothing, see `drawLayer` of `src/utils/draw.js`.

`ctx` is the facet: the `store`, `inner` (the svg element `g` of its marks
and axes, a DOM element, its origin is the one of the coordinate system),
the `key` of the facet, its `rows`, the
`scales` by the names of the dims, `axis` (the names of the dims of
the positions and of the values), `stackOf(row)` (the start and the end of a
stacked value), `scope` (the names of the references of the facet, see
[names](definition.md#names)), `innerWidth`, `innerHeight` and `dims`
(the sizes of the coordinate system, e.g. its `radius`), of maps also the
`projection` and the `path`. `curve: true` passes the `curve` of the mark,
`coords` limits a type to coordinate systems, e.g. `cartesian:bar` to
`cartesian`. The types of `MarkType`, `MarkGroup` and `Layer` are in the
package.

A new view, e.g. of a toggle of a legend, a control or a new width, is
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
e.g. `registerScheme('houseBlues', [null, null, ['#9EC5E8', '#005CA9'],
['#C6DBEF', '#6BAED6', '#005CA9']])`. A registered `observable10` is also
the palette of the categories without colors and without a scheme (the
default colors, d3's Observable10 otherwise), e.g. the colors of a house
style for every definition:

```js
import { registerScheme } from '@preschen/gen-vis';

registerScheme('house', ['#005CA9', '#E6A000', '#7AB51D', '#A6A6A6']);
// "land": { "column": "Bundesland", "scheme": "house", "legend": {} }
registerScheme('observable10', ['#005CA9', '#E6A000', '#7AB51D', '#A6A6A6']);
```

`registerScheme` returns a function that restores what was registered
under that name before (or removes the name again), e.g. for a scheme that
applies to one chart only:

```js
const restore = registerScheme('house', ['#005CA9', '#E6A000']);
// … draw or export …
restore();
```

## Defaults of the page

`registerDefaults(defaults)` replaces built-in defaults of the parts of all
charts of the page, see [defaults](definition.md#defaults): of the axes,
of the symbols of the legends and the margins of the charts, e.g. of a
house style:

```js
import { registerDefaults } from '@preschen/gen-vis';

registerDefaults({ axis: { padding: 2, tickMarks: { size: 4, inset: 0 } }, margins: { left: 64, right: 16 } });
```

A side of the margins which a definition does not give is the one of the
css variable of the page (`--gen-vis-margin-left: 64px`), else the one of
the defaults, else measured, see [margins](definition.md#margins); a
stylesheet of a house style can give the margins instead of a script.

## The check and the browser module

`validateDef` knows registered mark types, coordinate systems and
schemes; `@preschen/gen-vis/check` exports `registerMarkType`,
`registerCoord` and `registerScheme` too. The browser module exports
`registerMarkType`, `registerCoord`, `registerScheme`, `registerDefaults`,
`perRow` and `perGroup` as the package does. The schema only knows the
built-in ones.

## Schema and types

The package contains the JSON Schema of the definitions, `schema.json`, see
[`$schema`](definition.md#schema), and the types of TypeScript of the definitions and of
the API, see [JavaScript](usage.md#javascript). Both are written of one
source, `src/schema/definition.js` (`npm run schema`), which also has the
text of every key the editors show, see
[development](development.md); the schema only knows the built-in mark
types, coordinate systems and schemes.

## Checks outside the browser

`@preschen/gen-vis/check` merges and checks definitions in
scripts, e.g. all definitions of a page before a deploy, `load` reads the
file of an url:

```js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveParents, validateDef } from '@preschen/gen-vis/check';

const url = pathToFileURL('data/ecad/polar-tg.json').href;
const def = await resolveParents(JSON.parse(readFileSync(new URL(url), 'utf8')), url,
    u => readFileSync(new URL(u), 'utf8'));
console.log(validateDef(def));  // the warnings, e.g. unknown mark types
```

`validateDef(def, rows)` checks a definition: the keys and values of the schema, then
the meaning, e.g. unknown dims and references, with the paths of the
definition (`marks[0].fill: ...`), also the definition of every other
value of the controls (`controls[0].values[1] > marks[0].type: ...`).
It also warns of keys of a mark which are probably typos of a key of a mark
or of an attribute of svg (`marks[0].stak: unknown key, did you mean
'stack'?`, `marks[0].strok-width: no attribute of svg, ...`; other keys are
attributes of the elements), of keys of a transform its type does not read
and of a fold whose key or value replaces a column. With the `rows` of the
data it checks the data too: a dim's column which is not one of the data
or the transforms (`dims.x.column: 'yaer' is not a column of the data, did
you mean 'year'?`), a channel naming neither a dim nor a column, a `by` of
a column without a dim, texts in a `numeric` dim and years as numbers in a
`date` dim; the names of filters are the dims, the columns and the
globals (without rows any plain name may be a column). Dims without a type
get the type the load infers from the values (also for transform
columns). `gen-vis check` runs it on files, see [export](export.md#check).

A definition of gen-vis 4 is not read: `resolveParents` rejects of a part
(the definition or a parent) with the keys of 4.x (`mapping`, `plot`,
`formElements`, `options`) or with a `$schema` of another version than 5,
as the load of a chart does, see [`$schema`](definition.md#schema);
`validateDef` of such a definition returns that one message and checks
nothing else.

The steps of the load are exported as well, each JSON to JSON:

- `resolve(def, names)`: the expressions of the globals evaluated, `names`
  are the globals (and the fields of the entries of the controls), e.g.
  `{ "scale": "log" }`; `variants(def)` the definition resolved with its
  globals and with every value of every control.

The form the engine reads (a definition translated and normalized, see
`spec/normalize.md`) is internal: it may change in any release, so it is
not exported.

The parts not bound to the browser (expressions, transforms, merging and
normalize) are specified by the fixtures in `spec/` (`spec/README.md`), so
other languages, e.g. Python or R, can implement them; the package tests
run them.
