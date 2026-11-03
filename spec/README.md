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
| `normalize/*.json` | a 4.0 definition as the internal form | `src/utils/normalize.js` |

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
  missing, e.g. `2022-02-30`. Other strings are read as JavaScript's
  `Date.parse` does, e.g. `2024-06-01T13:00:00Z`.
- Values are **the same** if their strings are the same (`2024` and
  `"2024"`), not `0` and `""`, missing ones are `null`.
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

## Normalize

`normalize/*.json` are `{ "name", "def", "result" }`: the 4.0 definition
`def` (merged with its parents) and its internal form `result`, the form
which the renderer reads, see `normalize.md`. The plot types are the
built-in ones, their default props are the ones of `src/plots/defaults.js`.
