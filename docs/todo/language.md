# To do: the definition language

From the outside review of 2026-11-12: a reviewer learned the language from the docs alone, wrote 17
charts (5 first attempts were wrong) and made 56 deliberate mistakes. What was fixed is in the
CHANGELOG; what is left is here. All of these break definitions, so they are decisions for a major
version, or need an alias for a while.

## Decisions

- **The units of a channel.** `"y": 70` is a value of the data for a rule, a point, a text and a bar,
  but pixels for a line and an area; the `y0` of an area is a value while its `y` is pixels; `"=70"`
  is a value, `"=30 + 40"` pixels (`docs/definition.md`, channels). One rule: a channel is always in
  the units of the data, pixels have a form of their own. Breaks definitions which rely on pixels.
  (Medium; see also "channels as strings" of [architecture.md](architecture.md).)
- **A dim or a column.** A column works in channels, filter expressions and transforms, but not in
  `by`, in filter objects or as `@ref` in the attributes of a mark: 3 of 17 first attempts failed of
  it. One rule everywhere; `hover.columns` takes dims and should say so. (Medium.)
- **Listed `categories` are all of them** (documented): one listed category, e.g. to give it a
  color, leaves all other series out. The check warns of the values of no category now. Either
  `fromData` as the default, or keep it. (Small, changes charts which rely on the closed list.)
- **The orientation of bars follows the written parts, not the data.** Years as numbers on `x` are an
  error of the draw ("need a width"), `x` of numbers with `y` of names is one unless `y` has a
  categorical part. Decide after the types are known and give bars of a continuous position a
  default width. (Medium.)

## One way to say it

- `dim.order` and `scale.order` take different values, and `scale.order` of a dim of colors breaks
  its colors.
- `above` and `layer` of annotations.
- Annotations with `props`, `annotation:*` marks and `rule` or `text` marks draw the same things.
- `stack` of a mark and `stacked`, `stackBy` of a dim.
- `"shared"` and `"all"` of `facets.scales`.
- The forms `not` and `range` of a filter.
- Four spellings of an expression plus templates: the string syntax should be the one which is
  documented, with quoted names for columns of spaces (`var('name')` is only in
  `spec/expressions.md`), the object form internal. `"@{global}"` references are accepted and not
  documented.

## Names

- `axis.domain` is the line of the axis, not the domain of the scale.
- `orient` and `orientation`.
- `dodge: 12` of texts is another thing than `dodge: true` of bars.
- `fit`, `overlap` and `place` have opposite defaults for maps and for labels of areas
  (`docs/reference.md`).

## Defaults which surprise

- The locale is `de`; it is said only in `docs/recipes.md`.
- The text of `label` is larger than the labels of the ticks.
- The `marks` of a child without ids replace the marks of its parent without a message.

## The check

- Only the first error of an expression is reported.
- A closed set of attributes per mark type (with a way out) would report every unknown key of a mark;
  today the check warns of keys which are no attribute of the element.
- Without the check most mistakes are silent in the browser (a page without `data-check`). The
  warnings of the draw could name the check once when a chart is empty.

## Other implementations

The expression language has a portable suite (`spec/expressions/`). Implementations outside of this
package (the Python and R packages of WIFO, if they parse the string syntax themselves) need the
chains of mixed comparisons of 5.0: the cases are in `spec/expressions/syntax.json`.

## Docs

- `docs/recipes.md` is the best entry to the language and should be the first link of the README.
- `docs/reference.md`: the Default column is filled for about ten keys.
- `docs/usage.md` "the rest is ~68 kB gzipped" (the build of a bundler) is not measured again.
