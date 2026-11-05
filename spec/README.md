# The portable parts of gen-vis

The files of this directory describe the parts of gen-vis which are not
bound to the browser, so they can be implemented in other languages, e.g. a
Python or R package which prepares the data of a definition, merges
definitions or checks them. They are fixtures: JSON files of inputs and the
expected outputs, the JS implementation runs all of them in
`tests/spec.test.js`, an implementation in another language runs the same
files.

| Directory | Part | JS |
|-----------|------|----|
| `transforms/<type>.json` | the transforms of a definition, a file per type | `src/utils/transform-types.js` |
| `merge/*.json`, `merge.md` | parents, mixins and the patches of form elements | `src/utils/def.js` (`mergeAll`, `patchedParts`), `src/utils/load.js` (`resolveParents`) |
| `expressions/*.json` | the expressions of props | `src/utils/expr.js` |
| `expressions/syntax.json` | the string syntax of expressions | `src/utils/expr-parse.js` |
| `normalize/*.json` | a 4.0 definition as the renderer reads it | `src/utils/normalize.js` |

Every file is a list of cases, every case has a `name` (what it shows, the
name of the test) and the fields of its part, see below. A case with an
`error` expects an error whose message starts with it (the messages are the
ones of the JS implementation, another one may only check that there is an
error).

## The values of the data

The rows are objects of the names of the columns to their values, as they are
read from CSV, JSON or parquet, so most values are strings. The parts share
the rules of the values:

- A value is **missing** if it is `null`, not there or a string of only
  whitespace (an empty cell of CSV).
- A value is a **number** if it is a finite number or a string of a decimal
  number, also with an exponent and whitespace around it, e.g. `" 12 "`,
  `"-.5"`, `"1e3"`, not `"0x10"`, `"Infinity"`, `"1,5"` or `true`. Other
  values are missing as numbers.
- A value is a **date** if it is a timestamp (milliseconds), a `Date` or a
  string: without a time zone ISO (`2024`, `2024-06`, `2024-06-01`,
  `2024-06-01 13:00`, also with a `T`, seconds and their fraction, `24:00` is
  the end of the day) or the day first (`01.06.2024`, also with a time),
  these are the wall time of the time zone of the scale of the column, local
  or UTC (`utc`), so the same day everywhere; dates which do not exist are
  missing, e.g. `2022-02-30`. A date and a time with a time zone, `Z` or
  an offset (`+02:00`, `+0200` or `+02`), e.g. `2024-06-01T13:00:00Z` or
  `2024-06-01 13:00+02:00`, is the same time of every scale. Other strings
  are no dates, e.g. `Phase 1` or `June 1, 2024`.
- Values are **the same** if their strings are the same (`2024` and
  `"2024"`), not `0` and `""`, missing ones are the same, e.g. `null` and
  `""`.
- Values are **compared** as numbers if all of them (the ones which are not
  missing) are numbers, otherwise as dates if all of them are dates,
  otherwise as strings (by their UTF-16 code units, as JavaScript compares
  strings).

## Transforms

`transforms/<type>.json`, the cases of the transform type `<type>`:

```json
{
    "name": "a centered window",
    "timezone": "Europe/Vienna",
    "utc": ["date"],
    "globals": { "base": "2019" },
    "files": { "countries.csv": [{ "code": "AT", "name": "Austria" }] },
    "rows": [{ "date": "2019-01-01", "type": "gas", "value": "10" }],
    "transform": { "type": "rolling", "column": "value", "as": "mean", "size": 3, "align": "center" },
    "columns": { "mean": [null] }
}
```

- `rows`: the rows of the data.
- `transform`: a transform or a list of them, computed in their order, a
  later one uses the columns of the ones before (also a column it replaces).
- `globals` (optional): the values of the templates of the strings of the
  transforms, e.g. `"{base}"` in `{"year": "{base}"}`, also of keys, unknown
  names are kept as they are.
- `utc` (optional): the columns of the scales in UTC, a transform of a
  `column` or an `as` of them reads and writes its dates in UTC.
- `timezone` (optional): the local time zone of the case (IANA), cases
  without one do not depend on it.
- `files` (optional): the rows of the files of `lookup`, by their url.
- `columns`: the computed columns, by their name (`as`, by default
  `column`), a value per row, in the order of the rows, `null` is no value.
  Numbers are the same up to a relative difference of 1e-12.
- `kept` (optional): the indexes of the rows of the filters, without one
  all rows.
- `result` (optional): the rows after a transform of rows (`bin`, `fold`,
  `aggregate` with `rows`), the columns of the later transforms are the ones
  of these rows.
- `notes` (optional): the warnings of the transforms, e.g. of values outside
  the edges of a bin, none by default.

The rules of all transforms (see `docs/definition.md` of the package, `transform`):

- The groups are the rows of the same values of the columns `by` (a column or
  a list, as strings, `null` and values which are not there as `""`), in the order of the column
  `order` (compared as above, rows without a value of it at the end, rows of
  the same value in their order), by default in the order of the rows.
- `base` are the rows of the conditions of columns, all of them have to be
  fulfilled: a value (the same as the value of the row, as strings) or a range
  `[from, to]` (included, `null` is open), compared as the values of the
  column and the ends together.
- The values of `column` are numbers (above), the others are missing.

`random`: the number of a row is `lo + (hi - lo)*u` of the `range` `[lo, hi]`
(numbers as above, `[0, 1]` by default, `[1, 0]` is `1 - u`) and `u` of the
text `"<seed>:<key>"`, the `seed` (0 by default) as a text and the key the
index of the row in the rows (from 0, also of the rows left out by a filter
before; the rows of a `bin` before follow the rows, so their indexes are
after them) or its value of the column `key` as a text, not trimmed (`""`
if missing, also of a text of only whitespace; `1` and `"1"` are the same
key). Numbers become texts as in JavaScript (`String(v)`: `1` not `1.0`,
`1e-7`, `1e+21`). `u` is the 32 bits of FNV-1a of the UTF-16 code units of
the text, `h = 0x811c9dc5`, then per code unit `c`: `h = ((h ^ c) *
0x01000193) mod 2^32`, mixed by the finalizer of MurmurHash3 (`h ^= h >>>
16; h *= 0x85ebca6b; h ^= h >>> 13; h *= 0xc2b2ae35; h ^= h >>> 16`, 32-bit
unsigned products), divided by 2^32.

`bin` adds a row per class and group after the rows (`by`, the groups of
the rows with a number of `column`, in the order of their first row, values
compared as texts, so `1` and `"1"` are one group; without `by` one group,
also without rows) with the values of the columns `by` of the first row of
the group (as they are, not converted), `start`, `end` and the count (`as`)
or the sum of the numbers of `weight` (missing ones are 0), `normalize`d:
`share` divides it by the sum of the group (0 of a sum of 0), `density`
also by the width of the class in units of `per` (1 by default), without
`normalize` (or `count`) a `per` divides the count by the width in units of
it (`sum/width` with `width = (end - start)/per`, the shares `sum/total`,
the densities `sum/total/width`; `per` has no effect on shares).

The `edges` are numbers (as above, also texts of numbers) and ranges `{
"from", "to", "step" }`: the edges `from + k*step` for `k` from 0 to
`floor((to - from)/step + 1e-9)`, each rounded to 12 significant digits (as
`toPrecision(12)` of JavaScript, halves away from zero, not to the even
digit), so `to` is one if it is a step; the edges are sorted and without
duplicates. Of a `step` alone (if there are no `edges`) the edges are a
range from the largest multiple of the step not above the least value
(`floor(least/step)*step`) to the smallest multiple not below the largest
value (`ceil(largest/step)*step`), at least one class, e.g. of a single 10
and a step of 10 the class 10 to 20; without values there are no classes
and no note. Fewer than two different edges are no classes, with the note
`transform[<i>] (bin): the edges <edges as JSON> are no classes, at least
two different ones are needed`. A class includes its start, the last one
also its end; missing values are left out, values outside the edges too,
with one note of the bin (of all groups) `transform[<i>] (bin): <n> values
of '<column>' outside the edges <first> to <last> are left out`. The columns
of the transforms before have no values of the added rows (except the ones
the rows have, e.g. a `by` of a transform before), the rows of the filters
before include them. With `replace` the rows of the classes (of the
rows of the filters before) replace the rows, the columns of the transforms
before and the filters are left out (all rows are kept).

`fold` (wide to long) replaces the rows (`replace`, true by default; without
it the rows follow the rows as the ones of a `bin`) by a row per row and
column of `columns` in their order: a list of names or a pattern with a
single `*` (`"20*"`, `"*_eu"`, `"*"`), the columns of the rows which match
(the ones of the data in the order of the first row, then the ones of the
transforms before), a string without a `*` is one column. A folded row has
the other columns of the row (the ones of the data and of the transforms
before, the folded ones left out), the name of the column in `key` (`"key"`
by default) and its value in `value` (`"value"`), as it is, not converted,
`null` if the row has no such column. Without `columns` or with more than
one `*` the fold is an error. Rows which follow the rows (also of a `bin`)
have the values of the columns of the transforms before which they have,
e.g. the `d` of a `calc` before a fold or a `by` of a bin, no value
otherwise.

`aggregate` computes an aggregate of the numbers of `column` of the group
(`op`: `sum`, `mean`, `min`, `max`, `count`, `median`, `first`, `last`),
missing values are left out, `count` is the number of the numbers (0 of
none), `median` the middle number or the mean of the two middle ones,
`first` and `last` the first or the last number in the order of `order` or
of the rows; a group without numbers has no value (except `count`). By
default a column, the value of every row of the group. With `rows` a row
per group replaces the rows (of the rows of the filters before, as a `bin`
with `replace`), in the order of the first rows of the groups, with the
values of the columns `by` of the first row of the group (as they are) and
the aggregate in `as` (by default `column`); without `by` one row of all
rows, also without rows. An unknown `op` is an error.

`window` computes of every row of the group in the order of `order`
(`op`): `lag` or `lead` the number `offset` rows (1 by default) before or
after the row in the group (`null` beyond the ends or if that row has no
number), `diff` the number minus the one `offset` rows before, `pct` the
change in percent, `(value/before - 1)*100` (`null` of a missing one or of
a `before` of 0); `sum`, `mean`, `min` and `max` the ones of the window of
`size` rows as the mean of `rolling` (the rows before the row or around it
with `"align": "center"`, only whole windows, missing values left out, a
row without a number has no value, the sums compensated as the ones of
`rolling`). An unknown `op` is an error.

## Merging

See `merge.md`.

## Expressions

`expressions/*.json`:

```json
{ "name": "a ratio plus an offset", "scope": { "innerWidth": 500 }, "expr": { "+": [{ "*": ["@innerWidth", 0.5] }, 3] }, "result": 253 }
```

- `scope`: the values of the names, e.g. the globals or the values of a row.
- `expr`: the expression, see `expressions.md`.
- `result`: its value.

`expressions/syntax.json`, the string syntax of expressions (see
`expressions.md`, String syntax):

```json
{ "name": "* before +", "text": "@x * 2 + 1", "expr": { "+": [{ "*": ["@x", 2] }, 1] }, "scope": { "x": 3 }, "result": 7 }
```

- `text`: the text of an expression.
- `expr`: the expression of the text.
- `scope`, `result` (optional): the value of the expression.
- `error` instead of `expr`: the text is no expression, the start of the
  message.

## Normalize

`normalize/*.json` are `{ "name", "def", "result" }`: the 4.0 definition
`def` (merged with its parents) and its normalized form `result`, the one
which the renderer reads, see `normalize.md`. The plot types are the
built-in ones, their default props are the ones of `src/plots/defaults.js`.
