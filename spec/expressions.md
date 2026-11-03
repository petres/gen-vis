# Expressions

The props of a definition (most of its values, e.g. the attributes of the
elements of a plot, the height, the margins, the ticks of an axis) and the
`expr` of the transforms `calc` and `filter` are expressions, close to
[JSON Logic](https://jsonlogic.com/). The fixtures are
`expressions/*.json`, `{ "name", "scope", "expr", "result" }`.

## Forms

- A number, a text, a boolean or `null` is itself.
- A text starting with `@` is a reference to a name of the scope, e.g.
  `"@innerWidth"`, `"@x:scaled"` (the names of a place of a definition are
  in `docs/definition.md` of the package, `:` is part of the name). An unknown name has
  no value. `{"var": "name"}` is the same, `{"var": ["name", default]}` is
  `default` if the name is unknown (not if it is `null`).
- A list is a list of expressions.
- An object of exactly one key which is an operator (below) is that
  operator, its value the list of its arguments, a single argument which is
  not a list is a list of it, e.g. `{"not": "@a"}`.
- Other objects are objects of expressions (nested props, e.g. `d` of a
  line), also objects of one key which is no operator, e.g. `{"x": "@a"}`.

No value is `null` in JSON (`undefined` in JavaScript).

## Operators

Numbers are the ones of the values of the data (see `docs/definition.md`): numbers
and texts of decimal numbers, others are no number.

| Operator | Value |
|----------|-------|
| `+`, `*` | the sum, the product of the arguments |
| `-` | the first argument minus the others, of one argument its negation |
| `/` | the first argument divided by the others |
| `min`, `max` | the least, the largest argument |
| `round` | `[x]` or `[x, digits]`: x rounded to `digits` decimals (0 by default, negative ones are tens, hundreds, ...), halves up (towards +∞): `Math.round(x·10^digits)/10^digits` |
| `==`, `!=` | the same values or not: as texts, `0` and `""` are different, a missing value is `null`, lists and objects by their JSON |
| `<`, `<=`, `>`, `>=` | of numbers if both are numbers, otherwise of texts (by code units), false if one is missing; more than two arguments are a chain, e.g. `{"<": [0, "@x", 10]}` |
| `and` | the first argument which is false, otherwise the last one |
| `or` | the first argument which is true, otherwise the last one, e.g. a default `{"or": ["@color", "black"]}` |
| `not` | true if its argument is false |
| `if` | `[condition, then, condition, then, ..., else]`: the value of the first condition which is true, otherwise `else` (no value without one) |
| `cat` | the arguments as texts, joined, missing ones are empty |
| `format` | `[value, format]`: the value as a text of a d3 format (numbers, e.g. `",.1f"`, or a time format of a mapping of dates, e.g. `"%b %Y"`) in the locale of the definition, a missing value is the empty text |
| `steps` | `[value, {"cut": expression, ...}]`: the expression of the largest cut below the value (`value > cut`, the cuts as numbers), no value if there is none, e.g. `{"steps": ["@totalWidth", {"0": 220, "550": 250}]}` |
| `match` | `[value, {"case": expression, ...}, default]`: the expression of the case of the value (as a text), otherwise `default` (no value without one) |
| `literal` | its argument, not evaluated, e.g. `{"literal": "@a"}` |

The arithmetic operators (`+`, `-`, `*`, `/`, `min`, `max`, `round`) have no
value if an argument is no number or the result is not finite, e.g. a
division by 0.

False are `false`, `0`, `""`, `null`, no value, `NaN` and empty lists, all
other values are true (also `"0"`).

Of `format` the fixtures use the d3 locale en-US (`.` and `,`), the format
of a reference to a mapping of dates is a time format.
