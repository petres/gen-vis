# gen-vis 4.0: the definition language

Goals: shorter and more intuitive definitions, one portable expression language
instead of several mini-languages, transforms and merging specified in a way
other languages can implement (Python, R), and the internals kept as they are:
a 4.0 definition is *normalized* into the internal form the renderer already
uses, so the renderer, the tests and the snapshots stay valid.

This document is the design as it was implemented on the branch `def-4`;
"Deviations" at the end lists where it differs from the first draft and why.
The rules themselves are in `spec/` (`README.md`, `expressions.md`,
`merge.md`, `normalize.md`), with fixtures that `tests/spec.test.js` runs.

## 1. Layers

```
definition 4.0 (JSON, schema.json)
   │ resolveParents   (merge, spec/merge)                  portable
   │ migrate          (only if isLegacy: constructs of 3.x) portable, check chunk
   │ normalize        (src/utils/normalize.js)             portable, pure JSON → JSON
   ▼
internal definition (the form of 3.x, not documented for users anymore)
   │ inferTypes (types of the values of the rows), prepare / transforms (spec/transforms)
   ▼
renderer (JS only)
```

- The load (`src/utils/load.js`, `toInternal`) merges the parents, migrates a
  definition with constructs of 3.x (`isLegacy`: props of `prop`, `op` of
  calc, `categories` of plots, `props` of mappings; the migration is loaded
  as a chunk of its own then, `lazy.migrate`, with `check` the console warns),
  then normalizes it with the registered plot types. The types of mappings
  without one are inferred from the rows in `prepare` (`inferTypes` of
  `src/utils/data.js`), after the first computation of the transforms, so
  columns of transforms are known; the scale type follows in `prepareMapping`
  (`scaleTypeOf`).
- `migrate(def3)`, `migrateParts(parts)` and `normalize(def)` are exported
  from `@preschen/gen-vis/check`. `normalize(migrate(d))` equals the internal
  form of `d` for all definitions of `data/` and `site/`, the order of the
  props of plots and of the parts of mappings and plots aside
  (tests/migrate.test.js, against the 3.1 definitions kept in
  `tests/legacy/`), and the snapshots, rendered from the 4.0 definitions in
  `data/`, are unchanged; they compare the elements with their attributes
  sorted by name, the order of attributes does not change a drawing.

## 2. Mappings: shorthand and inference

```json
"mapping": {
    "x": "Jahr",
    "y": { "column": "Einwohner", "format": ",.0f", "domain": [0, null], "axis": { "ticks": 5, "grid": true } },
    "land": { "column": "Bundesland", "scheme": "Tableau10", "categories": { "ÖSTERREICH": { "color": "#1E4F77" } } }
}
```

- A string is the column.
- `type` is inferred when missing: first structurally (normalize: categories,
  a band/point/ordinal scale → categorical, time/utc → date, other scale
  types → numeric, a mapping of `by` of a plot, of `facets.dim` or of
  `scale.groups.by` → categorical), then from the values of the column when
  the rows are known (numbers → numeric, dates → date, else categorical).
- `scale.type` is inferred from the type: numeric → linear, date → time,
  categorical positions → band for bars (`cartesian:bar`, `polar:arc` using
  `@n:scaled`), point otherwise, other categorical → ordinal.
- Positions: `x` horizontal, `y` vertical (cartesian), `x`/`angle` angular,
  `y`/`radius` radial (polar) get a scale with that orientation and an axis
  (`false` removes either, `orientation: null` is none); an axis without a
  position is at the one of the orientation of its scale (also for other
  mappings, e.g. a second axis `"axis": {}`).
- `format` stays at the mapping (internal form too): `formatOf` uses it as the
  default of the axis and the hover format.
- `domain` and `nice` at the mapping are moved into `scale`; `categories`,
  `scheme`, `common`, `fromData`, `ranks`, `order` into `props`.
- Mappings of patches are parts: only the shorthand is written in internal
  form, no defaults (they would override the base when merged). A patch of
  another coordinate system gets the orientations/positions of the base
  mappings whose orientation was inferred.

## 3. Plots

```json
"plot": [
    { "type": "line", "by": "land", "props": { "stroke-width": "@stroke-width" },
      "highlight": { "stroke-width": 3 }, "others": { "opacity": 0.35 } },
    { "type": "point", "by": "land" }
]
```

- `type` without a prefix: `<coord>:<name>`, else `svg:<name>`, else the only
  registered type `*:<name>` of the coordinate system; `point` is `circle`.
- `by` instead of `categories`.
- `highlight` / `others` objects of props; `highlight: {"mode": "row", ...}`
  carries the 3.x mode, the string `"highlight": "row"` stays valid.
- Default props (`defaults` of the plot types, `src/plots/defaults.js`,
  an object or a function of the props, documented for `registerPlotType`)
  apply to short type names only; nested props are merged deeply, `null`
  removes a default. The color default is `{"or": ["@color", "currentColor"]}`
  so a plot without categories is visible.

## 4. Expressions (portable)

`src/utils/expr.js` (pure; props.js re-exports it): literals, references
`"@name"` and `{"var": name | [name, default]}`, operator objects of exactly
one key: `+ - * / min max round == != < <= > >= and or not if cat format
steps match literal var`. Other objects are nested props. Expressions are
compiled once (WeakMap by object identity) and bound to closures per plot
(`bind`), constant parts are folded, the argument buffer of an operator is
reused per row; `evaluate` interprets the compiled tree without closures.
Semantics (numbers as in the data, comparisons, truthiness of JSON Logic,
halves rounded up) are in `spec/expressions.md`, fixtures
`spec/expressions/*.json` run through both `evaluate` and `bind`.

The 3.x forms are not understood by the renderer anymore; migrate rewrites
them (`migrateExpr`).

## 5. Transforms (portable)

- `calc` takes an expression of the row (`expr`), its names are the columns
  of the row and the globals (a column wins). `op`/`columns`/`scale` are
  migrated, the implementation has only `expr`.
- `filter` (`{"type": "filter", "expr": ...}`) is a transform inside
  `applyTransforms`: the later transforms compute only the kept rows (their
  values of the other rows are null), the kept row indexes are
  `columns.kept`; `layout.js` takes only these rows (`keptRows`). Form element
  values and `fromData` categories still see all rows (a filter of a global,
  e.g. of the year of a slider, would otherwise remove the slider's values).
- Every transform has `spec/transforms/<type>.json` (`kept` of filters).

## 6. Merging (portable)

As implemented (verified in code, `spec/merge.md`): objects merged deeply,
arrays replaced, arrays whose entries *all* have an `id` merged by id (as
strings), `null` replaces and stays in the merged definition — the parts that
treat it as "removed" are listed in merge.md; `patchedParts` (def.js) is the
merge of the selected patches, exported for the fixtures.

## 7. Not in this step

- The renderer keeps its internal form; dropping it is a later cleanup.
- Facets, form elements and globals keep their 3.x syntax (with the
  expression language inside).

## Deviations from the first draft, and why

- **Defaults only for short type names.** `cartesian:line` keeps meaning
  "only the props written". Otherwise every 3.x definition (and every inline
  test definition) would get extra attributes or need `null`s to cancel them.
  Migrate converts a prefixed type to the short one when the props contain
  all defaults, the props are the ones which differ then; the merged props
  are the same, their order (the one of the attributes) may differ.
- **`highlight-`/`others-` prefixes stay valid** (not a 3.x marker). Migrate
  turns them into objects, normalize appends them to the props.
- **Migrate writes the shortest forms it can check** (`shorten`), not only
  the 4.0 constructs: short types, `highlight`/`others` objects, a mapping
  without the type of its scale, the type, the orientation and the position
  of the axis which normalize infers, `domain`, `nice` and `format` at the
  mapping (formats of the axis, hover and legend which are the same), a
  text of a column. Each form is taken if normalize of the merged definition
  is the same (props and the parts of mappings and plots in any order, the
  formats as `formatOf` reads them), for `migrateParts` and the examples
  checked against every merge the part is one of. Types the values infer
  stay, migrate has no rows; the examples of `data/` and `site/` were
  written without them where the load infers the same type and every chart
  of the file draws the same, also with every entry of its form elements
  (the migrate test takes the types of mappings without one of the 3.x
  form, the snapshots draw them).
- **A definition of 3.x is one with constructs of 3.x** (`isLegacy`, as the
  load reads it) or one given as such (`legacy: true`), only its mappings
  are read as the ones of 3.x (a position without a scale has none, a
  mapping without a type is categorical); a definition of 4.0 is only
  written shorter, so migrate is idempotent although a shortened mapping has
  no part of 4.0, e.g. `{"column": "Jahr", "type": "numeric"}`.
- **`mode` inside `highlight`**: the 3.x `highlight: "row"` and highlight
  props needed one place; a string still means the mode.
- **Type inference is two-staged** (structural in normalize, data in
  prepare), not only from data: years with categories must stay categorical.
  Consequence for migration: a 3.x mapping without type (categorical) gets an
  explicit `"type": "categorical"` unless the structure implies it, a 3.x
  scale without type gets `"type": "linear"` unless inference gives linear.
- **Mixed definitions** (a 4.0 child of a 3.x parent) are migrated as a whole;
  a 4.0 mapping is recognized by its 4.0 parts (`categories`, `domain`,
  `format`, ...) and left alone, but a 4.0 mapping without type and without
  such parts would become categorical. Migrate the parents with
  `migrateParts` instead.
- **`migrateParts`** (not in the draft): files with parents can't be migrated
  one by one (a mixin's mapping has no type, a child's partial `steps` object
  overrides a parent's prop), so the parts are migrated in the context of
  their merge and the parts the merged mappings need go into the first part
  that defines them. `data/` and `site/` were migrated this way, then
  written shorter (see above).
- **Format** stays on the mapping in the internal form (formatOf falls back
  to it) instead of being copied into axis/hover, so it also works for
  `@x:formatted` without a hover and inside patches.
- **Filter conditions** (`filter`, `stacked`, plot filters) keep `not` and
  `range` as condition keys, they are evaluated structurally
  (`conditionValues`), since `not` is an operator now.
- **Mapping-level `order`** is the order of the categories (`props.order`),
  the order of a band scale stays `scale.order`.
- **Positions of registered coordinate systems** are not inferred (no
  orientation names known), their mappings are written as in 3.x.
