# gen-vis 5.0: the definition language

Goals: definitions which say what is drawn, not how its pixels are
computed; one mechanism of state (globals); margins and the parts of marks
which are arithmetic computed by the library, not by the author; one
source of the description of the language. The engine stays: 5.0 rewrites
the front of the pipeline, the vocabulary of the definition, its
translation into the form the engine reads, the validation and the state.
A definition of gen-vis 4 is not read (an error of the load), the changelog
of 5.0.0 lists what to write instead.

This document is the design as implemented in 5.0; it follows
the review of 4.1 (not in the repository), "Deviations" at the end lists
where it differs from it and why. The reference of the language is
`docs/definition.md`, the per-key texts are the ones of
`src/schema/definition.js`, the portable rules are in `spec/`.

## 1. The language

The bars of the housing stock by legal form, two facets, stacked, with a
legend of the symbols of the bars:

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
   `lon`, `lat`), the translation writes the attributes of the scaled
   positions (`"cx": "@x:scaled"`, `"y0": "@y:start:scaled"`). The escape
   hatch stays: every channel and attribute is an expression, the `svg:`
   types take the attributes of their elements. Why: the attributes an
   author would write most are the defaults and the arithmetic of positions
   (centers of bands, starts and ends of stacks, the slots of grouped
   bars), and they are the part authors get wrong.
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
   value), evaluated before the definition is read. An entry of a control
   has no partial definition which is merged when it is selected: that
   would be a second merge with its own order. The state of a chart is its
   globals and the visibility of its categories.
5. **One expression language with a string syntax.** The objects of the
   expressions (close to JSON Logic) are the canonical form and the
   form of the spec; a text starting with `=` (or `@`) is the same
   expression in a syntax of operators and calls (`"=@innerWidth * 0.5"`),
   parsed to the objects (`src/utils/expr-parse.js`, fixtures
   `spec/expressions/syntax.json`). Filters and stack conditions are
   expressions of the row (an object of conditions of dims is read too). The
   `{name}` templates of texts are a mechanism of their own.
6. **Auto margins.** The margins are measured of the axes by default, a
   side given stays; a page gives the margins of a house style once (css
   variables or `registerDefaults`). Why: margins set by hand are mostly
   set to fit the labels of an axis.
7. **Highlight by classes and a stylesheet.** The hover toggles classes, the
   attributes of `highlight` and `others` are the rules of a stylesheet of
   the chart, so the engine keeps no attributes of the elements to restore
   them after a hover.

## 2. The pipeline

```
definition 5.0 (JSON, schema.json)
   │ resolveParents     merge of the parents and mixins (spec/merge)          portable
   │ resolve            the expressions of the globals evaluated              portable, JSON → JSON
   │ translate          the shorthands written out: the form the engine      portable, JSON → JSON
   │                    reads (dims, marks with props, controls)
   │ normalize          the defaults written out (spec/normalize)             portable, JSON → JSON
   ▼
normalized definition
   │ inferTypes, transforms (spec/transforms), prepare
   │ layout             scales, facets, auto margins (measure, layout again)
   ▼
renderer (JS only): facets, drawLayer joins, hover, highlight stylesheet
```

- `src/utils/load.js` merges the parents (`resolveParents`, which refuses a
  part of gen-vis 4), keeps the merged definition as
  the `source` of the store, and reads `normalize(translate(resolve(source,
  globals)))`. A change of the globals resolves the source again and
  prepares only the parts which change (`applyResolved` of
  `src/utils/def.js`).
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
  of them.
- `translate` (`src/utils/language.js`) is pure: it does not know the rows,
  the types of the dims follow later. The form the engine reads
  has the names of the definition (`dims`, `marks`, `controls`, the options
  at the top level), `translate` writes out its shorthands: it compiles the
  string syntax, writes the shorthands of the dims into their scale and
  axis, the channels into the `props` of the mark type (per kind and
  coordinate system), `stack` into `stacked` of the value dim, `dodge`
  into expressions of `@dim:index` and `@dim:count`, `anchor` into the
  attributes of the text, the hover columns into the `hover` of the dims,
  the values of the controls into entries. `authoredPath` maps the paths
  of the one place where the forms differ back (the `props` of a mark), so
  errors and warnings name `marks[1].fill`.
- `normalize` is the one of 4.0 (`docs/design-4.0.md`) in the names of 5:
  defaults of the positions, the types of scales, the default props of the
  mark types.
- The layout builds the facets with provisional margins where a side is
  `auto`, measures the axes of every facet (`src/utils/margins.js`, texts on
  a canvas in the font of the chart, `src/utils/measure.js`) and builds them
  again. A side is the one of the definition, else the css variable of the
  page (read by the measure of `src/comp/vis.js`), else the defaults
  (`registerDefaults`, the prop `defaults`), else measured.

The engine reading a form of its own, with the shorthands written out, is
deliberate: the renderer does not know the shorthands, and the snapshots
(`tests/snapshots.test.js`) and the PNG baselines (`tests/png.test.js`) are
the test that a translated definition draws the same picture.

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

One source instead of a hand-written `schema.json`, types generated of
it, a copy of it in the check, the defaults and the docs: five descriptions
of one language. The texts of the schema are
the per-key reference; `docs/definition.md` is the prose around them.
Places which take an expression of the globals are written so
(`ofGlobals`): a text starting with `=` or `@` passes the schema and is
checked after it is resolved.

`validateDef` checks the definition as written (the schema, with
the expressions of the globals resolved), then the semantic checks on the
translated form (dims, references, operators, the data), whose paths and
words are the ones of the definition (`authoredPath` maps the `props` of a
mark).

## 4. What was kept

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
  puts the first category at the bottom.
- **The `{name}` templates stay a mechanism of their own** (not specified
  as `cat`): they are texts with holes, which an author reads as text.
- **The `$schema` gate stays an error** of a file without one or of another
  version, also the one of 4; a definition with the keys of gen-vis 4 is an
  error which names them (decided 2026-11-11: no migration, neither while
  a definition is loaded nor by the CLI).
- **Not done in 5.0:** dark CSS variables. (Arrows of rules, lines and
  annotations, `"marker-end": "arrow"`, and `hover.cross` came with the
  release review; `gen-vis check`, `--strict` and the checks of the data
  in `validateDef`, unknown columns and texts in numeric dims, came with
  the review of the alpha.) (The site has a gallery of one chart
  of every kind, `site/gallery.html`; `npm run dev` keeps the gallery of
  all of `data/`.)
