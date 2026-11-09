# gen-vis 5.0: the definition language

Goals: definitions which say what is drawn, not how its pixels are
computed; one mechanism of state (globals) instead of patches; margins and
the parts of marks which were arithmetic of the author computed by the
library; one source of the description of the language. The engine of 4.x
stays: 5.0 rewrites the front of the pipeline, the vocabulary of the
definition, its translation into the form the engine reads, the validation
and the state.

This document is the design as implemented in the 5.0 alpha; it follows
the review of 4.1 (not in the repository), "Deviations" at the end lists
where it differs from it and why. The reference of the language is
`docs/definition.md`, the per-key texts are the ones of
`src/schema/definition.js`, the portable rules are in `spec/`.

## 1. The language

The bars of the housing stock by legal form, two facets, in 4.x 96 lines
with `xx`/`yy` dims, a `domainAbs` to make room for bars on a linear scale,
`y0`/`y1` of `@yy:start:scaled`, `stacked` on the dim, a hand-drawn legend
symbol and `facets.scales: []`; in 5.0:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "data.csv",
    "title": "Wohnungsbestände nach Rechtsform",
    "height": 400,
    "dims": {
        "x": { "column": "Jahr", "type": "categorical" },
        "y": { "column": "Anzahl", "format": ",.0f", "zero": true, "grid": true },
        "type": { "column": "Type", "legend": {}, "categories": {
            "Hauseigentum": "#BBD7EE", "Wohnungseigentum": "#5BC5F2", "GBV Miete": "#559BD5",
            "Gemeinde Miete": "#C7DF71", "Private Miete": "#4B9847", "Sonstige": "#9CE1F8" } },
        "geo": "Geo"
    },
    "facets": { "by": "geo", "cols": 2 },
    "marks": { "type": "bar", "by": "type", "stack": true, "highlight": { "mode": "row", "stroke": "#333" } }
}
```

The decisions:

1. **Marks with channels, not svg attributes of scaled references.** A mark
   names dims per channel (`x`, `y`, `x0`, `x1`, `y0`, `y1`, `x2`, `y2`,
   `lon`, `lat`), the translation writes the props of the scaled positions
   which an author of 4.x wrote (`"cx": "@x:scaled"`, `"y0":
   "@y:start:scaled"`). The escape hatch stays: every channel and attribute
   is an expression, the `svg:` types take attributes as in 4.x. Why: the
   most common props of 4.x were the defaults and the arithmetic of
   positions (centers of bands, starts and ends of stacks, the slots of
   grouped bars, which 4.x could not do), and they are the part authors got
   wrong.
2. **Flat marks and a flat top level.** The style of a mark is beside its
   channels, without `props`; a list of the keys which are options of a mark
   (`type`, `by`, `filter`, `stack`, `dodge`, ...) separates them from the
   attributes. The options of the chart are keys of the top level. Why: two
   levels of nesting less in every definition, and the keys read as what
   they are.
3. **Dims keep their name and their category tables.** A dim is a column
   with its type, scale, axis, legend, categories and hover; the shorthands
   (`zero`, `grid`, `pad`, `include`, `reverse`, `range`, `ticks`,
   `tickSpacing`) cover the common parts of the scale and the axis. Named
   dims with tables of categories (`name`, `color`, `visible`, any prop) are
   the right shape of house-style charts with fixed colors and names: the
   legend, the hover and the attributes read the same table. The categories
   of the data are the default of a dim with a legend or of the facets;
   listed categories are all of them.
4. **Globals are the only state.** A control sets a global, any part of the
   definition is an expression of the globals (`match` of a global per
   value), evaluated before the definition is read. The patches of 4.x (a
   partial definition merged per selected entry, after the parents) are
   gone; their semantics was a second merge with its own order. The state
   of a chart is its globals and the visibility of its categories.
5. **One expression language with a string syntax.** The objects of the
   expressions of 4.x (close to JSON Logic) stay the canonical form and the
   form of the spec; a text starting with `=` (or `@`) is the same
   expression in a syntax of operators and calls (`"=@innerWidth * 0.5"`),
   parsed to the objects (`src/utils/expr-parse.js`, fixtures
   `spec/expressions/syntax.json`). Filters and stack conditions are
   expressions of the row (the condition objects of 4.x stay readable). The
   `{name}` templates of texts stay as they are.
6. **Auto margins.** The margins are measured of the axes by default, a
   side given stays; a page gives the margins of a house style once (css
   variables or `registerDefaults`). Why: 57 of 63 definitions of 4.x set
   margins by hand, mostly to fit the labels of an axis.
7. **Highlight by classes and a stylesheet.** The hover toggles classes, the
   attributes of `highlight` and `others` are the rules of a stylesheet of
   the chart. The definitions are the same; the 200 lines of attribute
   bookkeeping of 4.x (`default-*` attributes, two animation channels) are
   gone.

## 2. The pipeline

```
definition 5.0 (JSON, schema.json)
   │ resolveParents     merge of the parents and mixins (spec/merge)          portable
   │ migrate            a definition of 4.x (by its keys) as one of 5.0       portable
   │ resolve            the expressions of the globals evaluated              portable, JSON → JSON
   │ translate          5.0 → the form the engine reads (options, mapping,   portable, JSON → JSON
   │                    plot with props, formElements)
   │ normalize          the defaults written out (spec/normalize)             portable, JSON → JSON
   ▼
normalized definition (the one of 4.x)
   │ inferTypes, transforms (spec/transforms), prepare
   │ layout             scales, facets, auto margins (measure, layout again)
   ▼
renderer (JS only): facets, drawLayer joins, hover, highlight stylesheet
```

- `src/utils/load.js` merges the parents (`resolveParents`), migrates a
  definition of 4.x with a notice, keeps the merged definition of 5.0 as
  the `source` of the store, and reads `normalize(translate(resolve(source,
  globals)))`. A change of the globals resolves the source again and
  prepares only the parts which change (`applyResolved` of
  `src/utils/def.js`, which replaced `applyPatches`).
- `resolve` (`src/utils/resolve.js`) replaces every expression whose names
  are all globals (or fields of the selected entries, `year:name`, or
  `globals.<name>`) by its value. Other expressions (of rows, categories,
  sizes) stay, the engine evaluates them when it draws, with the globals in
  its scope. An expression of the globals without a value leaves its key
  out. `marks` and `annotations` may be an expression of a global as a
  whole.
- `variants(def)` is the definition resolved with every value of every
  control: the load prepares them (e.g. the coordinate systems and maps of
  all values are loaded with the definition) and `validateDef` checks each
  of them, as it checked the patches.
- `translate` (`src/utils/language.js`) is pure: it does not know the rows,
  the types of the dims follow later as before. It compiles the string
  syntax, moves the options, writes the shorthands of the dims into their
  scale and axis, the channels into the props of the plot type (per kind
  and coordinate system), `stack` into `stacked` of the value dim, `dodge`
  into expressions of `@dim:index` and `@dim:count`, `anchor` into the
  attributes of the text, the hover columns into the `hover` of the dims,
  the controls into form elements, and `facets.by` into `dim` or `rows` and
  `cols`. `authoredPath` maps the paths of the engine's form back, so
  errors and warnings name `dims.y`, `marks[1].fill`, `controls[0]`.
- `normalize` is the one of 4.0 (`docs/design-4.0.md`): defaults of the
  positions, the types of scales, the default props of the plot types.
- The layout builds the facets with provisional margins where a side is
  `auto`, measures the axes of every facet (`src/utils/margins.js`, texts on
  a canvas in the font of the chart, `src/utils/measure.js`) and builds them
  again. A side is the one of the definition, else the css variable of the
  page (read by the measure of `src/comp/vis.js`), else the defaults
  (`registerDefaults`, the prop `defaults`), else measured.

The engine reading the form of 4.x is deliberate: the renderer, the
snapshots and the PNG baselines of 4.x are the test that a translated
definition draws the same picture (`tests/migrate.test.js` compares the
normalized definitions of the migrated files with the ones of the 4.x
fixtures, `tests/png.test.js` the images).

## 3. The schema of one source

`src/schema/definition.js` describes the language in JavaScript, with a
small vocabulary of JSON Schema nodes (`src/schema/dsl.js`: `object`,
`map`, `choice`, `anyOf`, `ref`, `text`, ...) and the text of every key.
Of it:

- `schema.json` (`npm run schema`), the `$id` of the definitions, which
  editors complete and check with;
- `types/definition.d.ts` (`Definition`, `Dim`, `Mark`, `Control`, ...);
- the structural check of `validateDef`, which walks the source itself
  (unknown keys with the name they probably are, values of the wrong type);
- the lists of the registries (mark types, coordinate systems, curves,
  locales, scales, projections, transforms), which `tests/schema.test.js`
  compares with the code.

4.x had a hand-written `schema.json`, the types generated of it, a copy of
it in the check (a plugin of the build), the defaults in three files and
the docs: five descriptions of one language. The texts of the schema are
the per-key reference; `docs/definition.md` is the prose around them.
Places which take an expression of the globals are written so
(`ofGlobals`): a text starting with `=` or `@` passes the schema and is
checked after it is resolved.

`validateDef` checks the definition of 5.0 as written (the schema, with
the expressions of the globals resolved), then the semantic checks of 4.x
on the translated form (dims, references, operators, the data), and maps
their paths and words back (`authoredPath`, `authoredText`: mapping → dim,
plot → mark, form element → control).

## 4. The migration

4.0 dropped the compatibility with 3.x and left the migration to the
maintainer; 5.0 has a migration, since the definitions of 4.x are in use on
several pages (FTI, energy monitor) and the patches of form elements can
not be ported by hand reliably. `src/utils/migrate.js` is pure, `gen-vis
migrate` writes files with it, the load migrates a definition of 4.x
while it is loaded.

- The mechanical parts: `options` up, `footer` → `source`, `mapping` →
  `dims` with shorthands (`"domain": [0, null]` → `zero`, `axis.grid` →
  `grid`, `domainRel` → `pad`), plots → marks (the props of scaled positions
  which are the defaults of a channel are left out, others become channels,
  the rest stays as attributes), `stacked` of a dim → `stack` of the marks
  which draw it, form elements → controls, condition objects → expressions,
  expression objects → the string syntax.
- The patches: every leaf a patch changes becomes a `match` of the global of
  the control at that leaf, with the base as the default; a patch of the
  plots, the annotations or the filter (lists merged by id, conditions
  merged) is a `match` of the whole part. 4.x applied the patches after the
  merge with the parents; in 5.0 the merge does the same for a `match` of
  a global: without a default it is a switch over the value of the other
  parts (the value below or above it becomes its default, two matches of
  the same global merge their cases), so a mixin's switch applies to the
  value of a parent or a child, and a child writes only its own cases. A
  child is migrated with its parents merged (`migrate(def, { parents })`)
  for the ids of its controls and the hover; the CLI reads all files
  before it writes one.
- The same chart: the hovers of 4.x which the default of 5.0 implies (the
  dims the marks use) are left out, a definition with such a dim without a
  hover lists `hover.columns` (the implied ones of its parents, `[]` of a
  definition of its own), a legend without a symbol gets `"symbol": null`,
  the margins stay. The test of the migration compares, for every value of
  every control, the normalized 4.x definition with the normalized
  translation of the migrated files.

## 5. What was kept

- The engine: `layout()` computes a view, the facets draw into the
  elements of the draw before by key, props are diffed, transitions move
  only what existed; the symbol-keyed items; the coordinate systems as a
  registry (cartesian, polar, geo, lazy chunks); the hover with the
  keyboard and the live region; the export SVG and the CLI with its own CDP
  client.
- The normalized form of 4.0 as the form the engine reads, and its
  fixtures (`spec/normalize`).
- The expression AST and its fixtures; the string syntax compiles to it.
- The merge of parents and mixins (`spec/merge`), now with an own deep
  merge, and lists merged by `id`, `global` or `value`.
- Named dims with category tables, `common`, `ranks`, `order`, `scheme`.
- Templates `{name}` of texts, texts in several languages (`language`).
- The transforms and their fixtures (`fold`, `aggregate` and `window` are
  new).
- The props of the chart (`defaults`, `globals`, `state`, `highlight`),
  `registerDefaults`, CSS variables and the cascade layer.
- Rare keys which cost one code path: `dataFormat`, `width`, `hover.mode`
  and `hover.radius`, `domainIgnores`, `domainAbs`, `scale.of`, `once`,
  `place`, `stacked` and `stackBy` of a dim, the transforms `rolling`,
  `cumulative` and `filter`.

## Deviations from the review, and why

- **`scale.of`, `once`, `place`, `domainIgnores`, `domainAbs` stay.** The
  review dropped them for channels, `data: [{}]`, `anchor: "inside"` and a
  `domain: {"of": "all"}`. They are one code path each and used by
  examples; `scale.of` is written by the translation of channels, so
  authors rarely see it.
- **`stacked` and `stackBy` of a dim stay** for values which no mark
  stacks, e.g. the hover of a stacked histogram above a strip plot; `stack`
  of a mark is the common case.
- **`fromData` stays, with a new default.** The categories of the data are
  the default of dims with a legend, parts of categories or facets (in the
  order of the rows), and (decided 2026-11-08) of a dim of only a column
  which marks draw in the colors of its categories, e.g. a line `by` it
  without a stroke of its own: lines of one color were the most common
  surprise of a new author. A `by` of marks of their own color stays of any
  type (a line per id), `"fromData": false` opts out.
- **The default dims of the hover are the ones the marks use**, their
  `by` and the dims of their positions, not the dims of the facets (their
  panels are titled).
- **A categorical `y` is top-down by default** (decided 2026-11-08): a
  vertical band or point scale without a range of its own runs from the
  top, as the rows of a table and as in Vega-Lite and Plot; `reverse: true`
  puts the first category at the bottom. The migration writes `reverse`
  for such dims of 4.x, so their pictures stay.
- **The `{name}` templates stay a mechanism of their own** (not specified
  as `cat`): they are texts with holes, which an author reads as text.
- **The `$schema` gate stays an error** of a file without one or of another
  version; the one of 4 is accepted, the migration decides by the keys.
- **Not done in the alpha:** arrows on annotations (`marker`),
  `hover.cross`, dark CSS variables. (`gen-vis check`, `--strict` and the
  checks of the data in `validateDef`, unknown columns and texts in
  numeric dims, came with the review of the alpha.) (The site has a gallery of one chart
  of every kind, `site/gallery.html`; `npm run dev` keeps the gallery of
  all of `data/`.)
