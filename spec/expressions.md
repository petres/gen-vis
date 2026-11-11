# Expressions

The props of a definition (most of its values, e.g. the attributes of the
elements of a plot, the height, the margins, the ticks of an axis) and the
`expr` of the transforms `calc` and `filter` are expressions, close to
[JSON Logic](https://jsonlogic.com/). The fixtures are
`expressions/*.json`, `{ "name", "scope", "expr", "result" }`, and the
texts of the string syntax (below) `expressions/syntax.json`, `{ "name",
"text", "expr" }`.

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
| `==`, `!=` | the same values or not: numbers and texts of numbers by their value, as `<` (`"1.0"`, `" 5"` and `"01"` are 1, 5 and 1), others as texts, `0` and `""` are different, missing values (`null`, no value, `""` and whitespace) are the same, lists and objects by their JSON; more than two arguments are a chain of every pair of neighbours, e.g. `{"==": ["@a", "@b", "@c"]}` (all the same), `{"!=": ["@a", "@b", "@c"]}` (`a` not `b` and `b` not `c`) |
| `<`, `<=`, `>`, `>=` | of numbers if both are numbers, otherwise of texts (by code units), false if one is missing (also `""`); more than two arguments are a chain, e.g. `{"<": [0, "@x", 10]}` |
| `and` | the first argument which is false, otherwise the last one |
| `or` | the first argument which is true, otherwise the last one, e.g. a default `{"or": ["@color", "black"]}` |
| `not` | true if its argument is false |
| `if` | `[condition, then, condition, then, ..., else]`: the value of the first condition which is true, otherwise `else` (no value without one) |
| `cat` | the arguments as texts, joined, missing ones are empty |
| `format` | `[value, format]`: the value as a text of a d3 format (numbers, e.g. `",.1f"`, or a time format of a mapping of dates, e.g. `"%b %Y"`) in the locale of the definition, a missing value is the empty text |
| `steps` | `[value, {"cut": expression, ...}]`: the expression of the largest cut below the value (`value > cut`, the cuts as numbers), no value if there is none, e.g. `{"steps": ["@totalWidth", {"0": 220, "550": 250}]}` |
| `match` | `[value, {"case": expression, ...}, default]`: the expression of the case of the value (as a text, then of a number the first case of the same number, e.g. `"2024"` of `"2024.0"`), otherwise `default` (no value without one), a missing value has no case, e.g. not `"null"` |
| `literal` | its argument, not evaluated, e.g. `{"literal": "@a"}` |

The arithmetic operators (`+`, `-`, `*`, `/`, `min`, `max`, `round`) have no
value if an argument is no number or the result is not finite, e.g. a
division by 0.

False are `false`, `0`, `""`, `null`, no value, `NaN` and empty lists, all
other values are true (also `"0"`).

Of `format` the fixtures use the d3 locale en-US (`.` and `,`), the format
of a reference to a mapping of dates is a time format.

## String syntax

An expression is also written as a text, e.g. `"@innerWidth * 0.5"` of
`{"*": ["@innerWidth", 0.5]}` (`src/utils/expr-parse.js`,
`parseExpression`). A text of a definition which starts with `=` or `@` is
an expression (`isExpressionText`), other texts are texts; a leading `=` is
left out, so `"=@a + 1"` and `"@a + 1"` are the same expression and `"=3"`
is the number 3. A text which is a reference is itself, e.g. `"@a"`. The
text of an expression (`formatExpression`) uses the operators between their
operands, `?:` and calls of the others, with as few parentheses as needed;
the expression of it is the expression again, with the arguments of an
operator as a list (`{"not": ["@a"]}` of `{"not": "@a"}`).

The grammar, from the loosest to the tightest level; the operators of a
level nest from the left:

| Level | Syntax | Expression |
|-------|--------|------------|
| ternary | `c ? a : b` | `{"if": [c, a, b]}`, the else may be another one: `c ? a : d ? b : e` |
| or | `a or b` | `{"or": [a, b]}` |
| and | `a and b` | `{"and": [a, b]}` |
| not | `not a` | `{"not": [a]}` |
| comparison | `a == b`, `a != b`, `a < b`, `a <= b`, `a > b`, `a >= b` | `{"==": [a, b]}`, ... |
| additive | `a + b`, `a - b` | `{"+": [a, b]}`, `{"-": [a, b]}` |
| multiplicative | `a * b`, `a / b` | `{"*": [a, b]}`, `{"/": [a, b]}` |
| unary | `-a` | `{"-": [a]}`; of a number a negative number, e.g. `-14` |
| value | see below | |

A run of the same operator is one operator of all of its operands: `1 + 2 +
3` is `{"+": [1, 2, 3]}`, `10 - 4 - 1` is `{"-": [10, 4, 1]}`, `0 < @x <
10` is `{"<": [0, "@x", 10]}` (a value between two; every comparison of
more operands compares all neighbours, also `@a == @b == @c`) and `@a or @b or
'black'` is `{"or": ["@a", "@b", "black"]}`. Mixed operators of a level
nest from the left: `10 - 4 + 1` is `{"+": [{"-": [10, 4]}, 1]}`, and `0 <
@x <= 10` is `{"<=": [{"<": [0, "@x"]}, 10]}`, no chain. Parentheses keep
their nesting: `(1 + 2) + 3` is `{"+": [{"+": [1, 2]}, 3]}`.

The values:

- Numbers as in JSON, e.g. `3`, `0.5`, `1e3`; `true`, `false` and `null`.
- Texts in single or double quotes, with the escapes of JSON (`\n`, `\t`,
  `\\`, `\"`, `\uXXXX`, ...) and `\'`. A quoted text starting with `@` is
  `{"literal": "@..."}`, so it is no reference.
- References `@name`. The name is letters (of any script), digits, `_`,
  `:` and `.`, and a `-` if a letter follows it: `@x:scaled` and
  `@stroke-width` are one name, `@a-1` is `@a` minus 1, `@a-@b` and `@a -
  @b` are `@a` minus `@b`. A name of other characters is `var('name')`.
- `(a)`, lists `[a, b]` and objects `{key: a, ...}`; the keys are words,
  numbers (as their text, e.g. `{0: 220, 550: 250}` of steps, `-1` and
  `0.5` too) or quoted texts. An object is an object of the expression,
  e.g. the table of `steps` or `match` or a nested prop, so an object of one
  key which is an operator is that operator, as in JSON.
- Calls `name(a, b, ...)` of the operators which are words: `min`, `max`,
  `round`, `cat`, `format`, `if`, `steps`, `match`, `var`, `literal`,
  `and`, `or` and `not`, e.g. `max(@a, 0)`, `if(@v > 10, 'a', @v > 4, 'b',
  'c')` (an `if` of other than three arguments), `steps(@totalWidth, {0:
  220, 550: 250})`, `match(@lang, {de: 'Quelle', en: 'Source'})`,
  `var('a', 0)`; `+`, `-`, `*`, `/` and the comparisons are no calls.
  `not(a)` without a space before the parenthesis is the call, `not (a)` is
  `not` of `(a)`. The argument of `literal` is data: in it quoted texts are
  texts, also starting with `@`, e.g. `literal(['@a', 'b'])` is `{"literal":
  ["@a", "b"]}`; the first argument of `var` is the name, e.g. `var('@a')`
  is `{"var": ["@a"]}`.

Whitespace between the tokens does not matter, also newlines. An error
names the text and the position (from 0) of the problem, e.g. `expression
"@a +": unexpected end at 4`. An expression nests at most 100 levels
(parentheses, lists, objects, calls, runs of `not` and of `-`), a deeper
one is the error `nested deeper than 100 levels`.

The fixtures `expressions/syntax.json` are `{ "name", "text", "expr" }`:
the text and its expression, the ones with a `scope` and a `result` also
the value of the expression, and `{ "name", "text", "error" }` of a text
which is no expression, `error` the start of the message.
