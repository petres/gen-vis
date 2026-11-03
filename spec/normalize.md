# Normalize and migrate

A definition of 4.0 is written shorter than the form the renderer reads, the
one of 3.x (the internal form). `normalize` writes a definition of 4.0
(merged with its parents, see `merge.md`) in the internal form, it is JSON
to JSON. `migrate` writes a definition of 3.x as one of 4.0, so
`normalize(migrate(d))` is the internal form of `d`, the order of the props
of the plots (attributes) aside, see below.

The order of the load: the parents are merged, a definition with constructs
of 3.x is migrated, normalized, then the types of the mappings without one
follow from their values (the rows are loaded then), see below.

## normalize

The fixtures are `normalize/*.json`.

### Mappings

- A text is the column: `"x": "year"` is `"x": {"column": "year"}`.
- `categories`, `scheme`, `common`, `fromData`, `ranks` and `order` of a
  mapping are the ones of its categories, `props` of the internal form.
- `domain` and `nice` of a mapping are the ones of its scale.
- `format` stays at the mapping, it is the format of the axis and of the
  hover which have none of their own (the hover: its own, the one of the
  mapping, the one of the axis).
- The mappings of the positions of the coordinate system have a scale of the
  orientation of their name and an axis, unless they have the scale or the
  axis `false` (none), an orientation `null` is none (e.g. a mapping `y` of
  the sizes of points): cartesian `x` horizontal, `y` vertical, polar `x`
  and `angle` angular, `y` and `radius` radial. A mapping of the scale of
  another one (`"scale": {"of": "y"}`) has none of these.
- An axis without a `position` is at the one of the orientation of its
  scale: horizontal `bottom`, vertical `left`, angular `angular`, radial
  `radial`.
- The type of a mapping without one follows from its parts: categorical with
  categories (`props`) or a `band`, `point` or `ordinal` scale, date with a
  `time` or `utc` scale, numeric with another scale, categorical if it is a
  mapping of the categories of a plot (`by`), of the facets (`facets.dim`)
  or of the groups of a scale (`scale.groups.by`). Otherwise it is the type
  of the values of the column (when the rows are known): numeric if all
  values which are not missing are numbers, date if all of them are dates,
  otherwise categorical (see `README.md` of the values).
- The type of a scale without one follows from the type of the mapping:
  numeric `linear`, date `time`, categorical `band` of a position of the
  bars of a plot (`cartesian:bar`, `polar:arc`, a prop of `@name:scaled`),
  `point` of other positions, `ordinal` without an orientation.
- The mappings of patches are parts: they are only written in the internal
  form (text, categories, domain), they have no default parts, their types
  are the ones of the merged mapping.

### Plots

- `by` are the `categories` of a plot.
- `highlight` and `others` objects are the props `highlight-<name>` and
  `others-<name>`, `mode` of `highlight` is the highlight of 3.x (`group`
  or `row`), the text `"highlight": "row"` stays as it is. The props with
  these prefixes stay as well.
- A type without the prefix of a coordinate system (`line`) is the one of
  the coordinate system of the definition (`options.coord`, `cartesian` by
  default), `<coord>:<name>`, otherwise `svg:<name>`, otherwise the only
  registered type `<prefix>:<name>` of the coordinate system; `point` is
  `circle`. Its props are merged into the default props of the type: nested
  props (objects which are no operators, e.g. `d`) deeply, `null` removes a
  default. The order of the props is the one of the defaults, then the other
  ones (the order of the attributes of the elements).
- A type of its full name (`cartesian:line`) has no defaults.
- The plots of a patch are normalized in the coordinate system of the patch
  (its `options.coord`, otherwise the one of the definition). A patch of
  another coordinate system has the orientations and the axis positions of
  the mappings of the positions of the definition whose orientation is not
  written.

The default props (`src/plots/defaults.js`), `color` is
`{"or": ["@color", "currentColor"]}`:

| Type | Defaults |
|------|----------|
| `cartesian:line` | `stroke`: color, `fill`: `none`, `d`: `{x: "@x:scaled", y: "@y:scaled"}` |
| `cartesian:area` | `fill`: color, `d`: `{x: "@x:scaled", y0: "@y:scaled:0", y1: "@y:scaled"}` |
| `cartesian:bar` | `fill`: color, `x`: `@x:scaled`, `y1`: `@y:scaled`; with `x1` (horizontal): `fill`, `x1`: `@x:scaled`, `y`: `@y:scaled` |
| `svg:circle` | `cx`: `@x:scaled`, `cy`: `@y:scaled`, `r`: 3, `fill`: color |
| `svg:text` | `x`: `@x:scaled`, `y`: `@y:scaled`, `fill`: `@color` |
| `polar:line` | `stroke`: color, `fill`: `none`, `d`: `{angle: "@x:scaled", radius: "@y:scaled"}` |
| `polar:area` | `fill`: color, `d`: `{angle: "@x:scaled", innerRadius: "@y:scaled:0", outerRadius: "@y:scaled"}` |
| `polar:arc` | `fill`: color |
| `polar:circle` | `angle`: `@x:scaled`, `radius`: `@y:scaled`, `r`: 3, `fill`: color |
| `polar:text` | `angle`: `@x:scaled`, `radius`: `@y:scaled`, `fill`: `@color` |

## migrate

The fixtures are `migrate/*.json`. A definition of 3.x is one with
constructs of 3.x (the ones the load migrates: props of `prop`, `op` of
calc, `categories` of plots, `props` of mappings) or one given as such
(`"legacy": true`); its constructs of 3.x are migrated:

- The props of 3.x are expressions, see `expressions.md`.
- `calc` of `op` and `columns` (and `scale`) is one of `expr`, e.g.
  `{"op": "divide", "columns": ["v", "base"], "scale": 100}` is
  `{"expr": {"*": [{"/": ["@v", "@base"]}, 100]}}`.
- The `props` of a mapping are its parts (`categories`, `scheme`, ...).
- A mapping of the definition (not of a patch) without a type is
  categorical, normalize finds it of categories, of a categorical scale or
  as a mapping of the categories of plots or facets, otherwise migrate
  writes `"type": "categorical"`.
- A scale without a type is linear in 3.x, migrate writes `"type":
  "linear"` unless normalize finds it.
- The mappings of the positions: without a scale `"scale": false`, a scale
  without an orientation `"orientation": null`, without an axis `"axis":
  false`.
- `categories` of a plot are `by` (a text of one).
- A mapping of the parts of 4.0 (`categories`, ..., `domain`, `nice`,
  `format`) is not migrated.

Then the definition, also one of 4.0, is written in its shorter forms, each
one taken if the definition draws the same: normalize gives the same
internal form, in which the order of the props of a plot (the attributes of
its elements) and of the parts of mappings and plots is no difference and
the formats of a mapping are the ones of its axis, hover and legend (see
`formatOf`, of a patch merged into the mapping of the definition):

- A mapping without the type of its scale (inferred of its type), without
  its type (inferred of its scale, its categories or as a mapping of the
  categories of a plot), without the orientation of a position and the
  position of its axis, an empty scale and axis of a position left out,
  `domain` and `nice` at the mapping, the format at the mapping if the ones
  of the axis, the hover and the legend are the same, a text of the column.
- The props `highlight-` and `others-` are the objects `highlight` and
  `others`, `"highlight": "row"` (also the one of the merged plot of a part)
  is `mode` then.
- A type `<coord>:<name>` or `svg:<name>` is `<name>` (`circle` is `point`)
  if `<name>` is the type in the coordinate system and the props have all of
  its defaults, the props are the ones which differ from the defaults then.

A definition of 4.0 has no constructs of 3.x and its shorter forms are
the shortest ones, so migrate is idempotent. `migrateParts` writes the
parts of a merge (a definition and its parents) shorter the same way, a
shorter form of a part is taken if the merge draws the same.
