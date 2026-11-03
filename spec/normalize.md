# Normalize

A definition of 4.0 is written shorter than the form the renderer reads (the
internal form). `normalize` writes a definition of 4.0 (merged with its
parents, see `merge.md`) in the internal form, it is JSON to JSON.

The order of the load: the parents are merged, the definition is
normalized, then the types of the mappings without one follow from their
values (the rows are loaded then), see below.

The parts of the internal form are not the ones of a definition, normalize
does not read them: `props` of a mapping (its categories are parts of the
mapping), `categories` of a plot (`by`), a text of `highlight` (`mode`) and
the props of the prefixes `highlight-` and `others-` (the objects
`highlight` and `others`).

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
  mapping of the facets (`facets.dim`) or of the groups of a scale
  (`scale.groups.by`), not of the categories of a plot (`by`), they group the
  rows of any type. Otherwise it is the type
  of the values of the column (when the rows are known): numeric if all
  values which are not missing are numbers, date if all of them are dates,
  otherwise categorical (see `docs/definition.md` of the values).
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
  `others-<name>` of the internal form, `mode` of `highlight` is its
  `highlight` (`group` or `row`).
- A type without the prefix of a coordinate system (`line`) is the one of
  the coordinate system of the definition (`options.coord`, `cartesian` by
  default), `<coord>:<name>`, otherwise `svg:<name>`, otherwise the only
  registered type `<prefix>:<name>` of the coordinate system; `point` is
  `circle`.
- The props of a plot of a registered type, of its short or its full name
  (`line` and `cartesian:line` alike), are merged into the default props of
  the type: nested props (objects which are no operators, e.g. `d`) deeply,
  `null` removes a default. The order of the props is the one of the defaults, then the other
  ones (the order of the attributes of the elements).
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
