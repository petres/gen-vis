# gen-vis 4.0: the definition language

Goals: shorter and more intuitive definitions, one portable expression language
instead of several mini-languages, transforms and merging specified in a way
other languages can implement (Python, R), and the internals kept as they are:
a 4.0 definition is *normalized* into the internal form the renderer already
uses, so the renderer, the tests and the snapshots stay valid.

## 1. Layers

```
definition 4.0 (JSON, schema.json)
   │ resolveParents   (merge, spec/merge)          portable
   │ normalize        (src/utils/normalize.js)      portable, pure JSON → JSON
   ▼
internal definition (the form of 3.x, not documented for users anymore)
   │ prepare / transforms (spec/transforms)         transforms portable
   ▼
renderer (JS only)
```

`migrate(def3)` (in `@preschen/gen-vis/check`) rewrites a 3.x definition as a
4.0 one, the loader migrates 3.x definitions automatically with a warning of
`check`, so existing definitions (e.g. energy-monitor) keep working.
`normalize(migrate(d))` equals the internal form of `d`, a test checks it for
all definitions of `data/`.

## 2. Mappings: shorthand and inference

```json
"mapping": {
    "x": "Jahr",
    "y": { "column": "Einwohner", "format": ",.0f", "domain": [0, null], "axis": { "ticks": 5, "grid": true } },
    "land": { "column": "Bundesland", "scheme": "Tableau10", "categories": { "ÖSTERREICH": { "color": "#1E4F77" } } }
}
```

- A string is the column.
- `type` is inferred from the data when missing (numbers → numeric, dates as
  in 3.x → date, else categorical); an explicit type stays possible.
- `scale.type` is inferred: numeric → linear, date → time, categorical
  positions → band for bars, point otherwise, other categorical → ordinal.
- `scale.orientation` and `axis.position` follow from the channel name and the
  coordinate system: `x` horizontal/bottom, `y` vertical/left, polar `angle`
  and `radius`.
- `format` of the mapping is the default of `axis.format` and `hover.format`.
- Scale fields used often may stand at the mapping (`domain`, `nice`) and
  are moved into `scale` by normalize.
- `props.categories`, `props.scheme`, `props.common` → `categories`,
  `scheme`, `common` at the mapping (no extra `props` level).

## 3. Plots

```json
"plot": [
    { "type": "line", "by": "land", "props": { "stroke-width": "@stroke-width" },
      "highlight": { "stroke-width": 3 }, "others": { "opacity": 0.35 } },
    { "type": "point", "by": "land" }
]
```

- `type` without a coordinate prefix: the coordinate system of
  `options.coord` decides (`line` → `cartesian:line` or `polar:line`),
  `svg:*` stay as they are for raw elements.
- `by` instead of `categories` (the same word as in transforms).
- `highlight` and `others` are objects of props instead of the prefixes
  `highlight-` and `others-`.
- Every plot type has default props (`defaults` of the type, also for
  registered ones): a line draws `d: {x: "@x:scaled", y: "@y:scaled"}`, the
  stroke `@color`, no fill; a definition only writes what differs.

## 4. Expressions (portable)

One expression language for all props, close to JSON Logic so other languages
have a known model:

- literals: numbers, strings, booleans, null, arrays
- references: `"@name"` and `"@name:modifier"` (as 3.x), also `{"var": "name"}`
- an operator object has exactly one key, the operator:
  `{"*": ["@innerWidth", 0.013]}`, `{"+": ["@x:scaled", -14]}`, `-`, `/`,
  `min`, `max`, `round`, `if` (`[cond, then, else]`), `==`, `!=`, `<`, `<=`,
  `>`, `>=`, `and`, `or`, `not`, `cat` (texts), `format` (`["@y", ",.1f"]`),
  `steps` (`["@totalWidth", {"0": 220, "550": 250}]`), `match`
  (`["@level", {"header": 4.5, "item": "@r"}, 0]`), `literal` (a value which
  is not evaluated, the 3.x `fixed`)
- other objects are nested props (e.g. `d`)
- 3.x forms (`{"prop": "relative", ...}`) are migrated.

`spec/expressions/*.json` are fixtures: `{ "scope", "expr", "result" }`.

## 5. Transforms (portable)

The column-wise model of 3.x stays (`column`, `as`, `by`, `order`, `base`):

- `calc` takes an expression of the row: `{"type": "calc", "as": "rel",
  "expr": {"*": [{"/": ["@value", "@inno"]}, 100]}}` (the 3.x `op`/`columns`
  form is migrated).
- new `filter` (`{"type": "filter", "expr": {">": ["@value", 0]}}`) — the
  rows of the data afterwards.
- every transform has a fixture file in `spec/transforms/<type>.json`:
  `[{ "name", "rows", "globals", "transform", "columns" }]`, the JS test runs
  them, an implementation in another language runs the same files.

## 6. Merging (portable)

`parent`, mixins and the patches of form elements follow one rule set,
written down in `spec/merge.md` with fixtures `spec/merge/*.json`: objects are
merged deeply, arrays replaced, lists of entries with `id` (plots,
annotations, form elements) merged by `id`, `null` removes.

## 7. Not in this step

- The renderer keeps its internal form; dropping it is a later cleanup.
- Facets, form elements and globals keep their 3.x syntax (with the
  expression language inside).
