# gen-vis 4.0: the definition language

Goals: shorter and more intuitive definitions, one portable expression language
instead of several mini-languages, transforms and merging specified in a way
other languages can implement (Python, R). A 4.0 definition is *normalized*:
shorthands are written out and defaults filled in, with the same key names,
and the renderer reads that normalized definition.

This document is the design as implemented in 4.0;
"Deviations" at the end lists where it differs from the first draft and why.
The rules themselves are in `spec/` (`README.md`, `expressions.md`,
`merge.md`, `normalize.md`), with fixtures that `tests/spec.test.js` runs.

## 1. Layers

```
definition 4.0 (JSON, schema.json)
   │ resolveParents   (merge, spec/merge)                  portable
   │ normalize        (src/utils/normalize.js)             portable, pure JSON → JSON
   ▼
normalized definition (4.0 key names, every shorthand written out)
   │ inferTypes (types of the values of the rows), prepare / transforms (spec/transforms)
   ▼
renderer (JS only)
```

- The load (`src/utils/load.js`) merges the parents, then normalizes the
  definition with the registered plot types. 4.0 has no compatibility code
  for 3.x: no migration, no detection of 3.x constructs. 3.x keys (`props`
  of a mapping, `categories` of a plot, a text `highlight`, props with the
  prefixes `highlight-`/`others-`) are unknown to the schema and validateDef. The types of mappings
  without one are inferred from the rows in `prepare` (`inferTypes` of
  `src/utils/data.js`), after the first computation of the transforms, so
  columns of transforms are known; the scale type follows in `prepareMapping`
  (`scaleTypeOf`).
- `normalize(def)` is exported from `@preschen/gen-vis/check`. The
  snapshots, rendered from the 4.0 definitions in `data/`, are the ones of
  3.x; they compare the elements with their attributes sorted by name, the
  order of attributes does not change a drawing.

- The version of a definition is its `$schema`, the `$id` of schema.json
  (`https://unpkg.com/@preschen/gen-vis@4/schema.json`; `src/utils/version.js`,
  rule and fixtures in `spec/merge.md`): `resolveParents` of a url (a file)
  requires one of gen-vis 4 in the merge, every part with one has the one of
  gen-vis 4, an inline definition may have none; validateDef warns of
  another one. Accepted: a url or path ending in
  `@preschen/gen-vis@4[.x.y…]/schema.json` (unpkg, jsdelivr, a full or a
  prerelease version) or in `node_modules/@preschen/gen-vis/schema.json` (the
  installed package); an unversioned url of unpkg is not (its major version
  changes). All definition files of `data/` and `site/` have it, also the
  parents, so editors validate every file.

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
  types → numeric, a mapping of `facets.dim` or of `scale.groups.by` →
  categorical; a plot's `by` does not make a mapping categorical, it groups
  rows of any type), then from the values of the column when
  the rows are known (numbers → numeric, dates → date, else categorical;
  without values a time `format` → date, else categorical).
- `scale.type` is inferred from the type: numeric → linear, date → time,
  categorical positions → band for bars (`cartesian:bar`, `polar:arc` using
  `@n:scaled`), point otherwise, other categorical → ordinal.
- Positions: `x` horizontal, `y` vertical (cartesian), `x`/`angle` angular,
  `y`/`radius` radial (polar) get a scale with that orientation and an axis
  (`false` removes either, `orientation: null` is none); an axis without a
  position is at the one of the orientation of its scale (also for other
  mappings, e.g. a second axis `"axis": {}`).
- `format` stays at the mapping: `formatOf` uses it as the default for the
  axis and hover format.
- `domain` and `nice` at the mapping are moved into `scale`; `categories`,
  `scheme`, `common`, `fromData`, `ranks` and `order` stay on the mapping.
- Mappings of patches are parts: only the shorthand is written out, no
  defaults (they would override the base when merged). A patch of
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
  is the mode of the highlight.
- Default props (`defaults` of the plot types, `src/plots/defaults.js`,
  an object or a function of the props, documented for `registerMarkType`)
  apply to the plots of the type, of its short and its full name alike
  (`line` is `cartesian:line`); nested props are merged deeply, `null`
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

The 3.x forms (`{"prop": ...}`) are not understood anymore, they are nested
props.

## 5. Transforms (portable)

- `calc` takes an expression of the row (`expr`), its names are the columns
  of the row and the globals (a column wins).
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

- The renderer reads the normalized 4.0 definition; the 3.x internal form
  it read at first was dropped before the release.
- Facets, form elements and globals keep their 3.x syntax (with the
  expression language inside).

## Deviations from the first draft, and why

- **Defaults of every name of a type.** The first version applied the
  defaults only to short type names, so a 3.x definition kept meaning "only
  the props written"; without the compatibility of 3.x, `line` and
  `cartesian:line` are the same type with the same defaults. A plot which
  must not have a default sets it to `null`, e.g. `"fill": null` of a text in
  the color of the page instead of the one of its category.
- **`mode` inside `highlight`**: the 3.x `highlight: "row"` and highlight
  props needed one place.
- **No compatibility with 3.x** (decided after the first version, which
  migrated 3.x definitions while loading them and kept `highlight-`/`others-`
  props and a text of `highlight`): only the maintainer uses the library, so
  4.0 reads only 4.0 definitions; the changes are listed in `CHANGELOG.md`
  to be done by hand.
- **Type inference is two-staged** (structural in normalize, data in
  prepare), not only from data: years with categories must stay categorical.
  Consequence for a definition rewritten from 3.x: a mapping without type
  (categorical in 3.x) needs `"type": "categorical"` unless the structure
  implies it, a scale without type (linear in 3.x) needs `"type": "linear"`
  unless inference gives linear.
- **Format** stays on the mapping (formatOf falls back
  to it) instead of being copied into axis/hover, so it also works for
  `@x:formatted` without a hover and inside patches.
- **Filter conditions** (`filter`, `stacked`, plot filters) keep `not` and
  `range` as condition keys, they are evaluated structurally
  (`conditionValues`), since `not` is an operator now.
- **Mapping-level `order`** is the order of the categories (`props.order`),
  the order of a band scale stays `scale.order`.
- **Positions of registered coordinate systems** are not inferred (no
  orientation names known), their mappings are written as in 3.x.
