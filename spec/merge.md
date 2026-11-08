# Merging definitions

A definition is merged with its parents (`parent`, a url or a list of them,
the mixins) by the rule of `merge`. The fixtures are `merge/merge.json`
(`merge`) and `merge/parents.json` (the parents). The merge comes first,
then the expressions of the globals are evaluated (see `expressions.md`
and `resolve` of the package), then the definition is translated and
normalized (see `normalize.md`): an expression of a parent is merged as
any other value, a later part replaces it, except a `match` of a global,
which is a switch (see below). (The patches of the form
elements of 4.x, merged into the patchable parts after the parents, are
gone; a definition of 4.x is migrated after the merge, its patches become
expressions of the globals.)

## `merge(parts)`

The parts are merged in their order, a later part overrides an earlier one
(`merge/merge.json`, `{ "name", "parts", "result" }`):

- Two objects are merged key by key, recursively, the keys of the earlier
  one first, then the new keys of the later one.
- Two arrays (not empty) whose entries are all objects with the same key
  are merged by it: the key is the first one of `id`, `global` and `value`
  which all entries of the earlier array have, and all entries of the later
  array have the same first key of these, e.g. the marks by their `id`, the
  controls by their `id` (otherwise by their `global`) and the entries of a
  control by their `id` (otherwise by their `value`). The entries of the
  earlier array stay in their order, each merged with the entry of the
  later array of the same key (compared as strings, `1` and `"1"` are the
  same), then the entries of the later one with new keys are appended.
- A text of a dim (the column, e.g. `"facet": "group"`) and an object of
  the same dim (of the keys `dims` and `mapping`, the latter of 4.x and of
  the form the engine reads) are merged as the object `{"column": "group"}`
  and the other one, in both orders: a child adds the categories of the
  column of its parent, or a text changes only the column of an object. Two
  texts replace each other.
- A `match` of a global without a default (`"=match(@values, {share:
  'value.share'})"` in the string syntax, or the operator object `{"match":
  ["@values", {...}]}`) is a switch of cases over the value of the other
  parts: merged onto a value, the value becomes its default (`{"match":
  ["@values", {"share": "value.share"}, "value"]}`, the result is the
  operator object); a value merged onto a match of a global (with or without
  a default) becomes its default, so the switch of a mixin applies to the
  value of a child merged after it (as the patches of 4.x applied after the
  merge; an object or a list is the default as a `literal`, so it is not
  evaluated as an expression, a match of the string syntax as its object;
  of nested switches (mixins of different globals) the default of
  the innermost one, so both stay; a child replaces a switch with a match
  of its own or with `null`;
  two matches of the
  same global merge their cases (the later ones win) and keep the default
  of the later one, else of the earlier one; a match of another global
  without a default falls through to the switch below it (it is its
  default). A match with a default and `null` replace the value, as other
  values. This does
  not apply inside `marks` and `annotations`, whose expressions are the ones
  of the rows: their matches are values.
- All other values replace the earlier one, also arrays (of numbers, strings
  or of entries of which one has none of the keys, or of different keys),
  `null` (it stays in the merged definition) and an object of an array or of
  a value and the other way round.
- The parts themselves are not changed (the result is a copy).

`null` is kept by the merge, the parts of a definition which it removes treat
it as missing: a dim (`"dims": {"y": null}`), the parts `scale`, `axis`,
`legend` and `hover` of a dim (also `false`), `geo`, `filter`, `facets`,
`marks`, `annotations` and `transform` (of 4.x a mapping, `mapping`, the
`props` of a mapping and `plot`).

(The JS implementation is `src/utils/merge.js`, `mergeAll` of
`src/utils/def.js` with the keys of the arrays and the merge of the
mappings.)

## Parents

`merge/parents.json`, `{ "name", "url", "files", "def", "result" }`: the
definition `def` of the url `url`, `files` are the definitions of the urls,
`result` the merged definition.

- `parent` is a url or a list of urls (mixins), relative to the url of the
  definition referencing them.
- The parts are collected depth first: the parents of a parent before it,
  the mixins in their order, then the definition. A parent which is already
  collected (e.g. shared by two mixins) is collected once, at its first use,
  so it does not override the mixins in between.
- The parts are merged with `merge` in this order, so the definition
  overrides its parents and a later mixin an earlier one.
- The `parent` of the result is the one of the definition (it has no
  meaning anymore).
- A parent which is its own ancestor is an error (`Cyclic parent definition '<url>'`).
- The version of the definition language is the `$schema` of a part: every
  part with one is a definition of gen-vis 5 or 4, the merged definition of
  a url (a file) has one (of itself or of a parent), a definition without a
  url (inline) may have none. Otherwise it is an error (`'<url>' is no
  definition of gen-vis 5: its $schema is missing`, `... is the one of
  gen-vis 3`, `... names no major version of gen-vis`, `... is none of
  gen-vis`; `the inline definition` instead of the url). A `$schema` of
  gen-vis 5 is a url or a path ending in
  `@preschen/gen-vis@<version>/schema.json` of the major version 5 (`@5`,
  `@5.1`, `@5.0.2`, `@5.0.0-alpha.1`), e.g.
  `https://unpkg.com/@preschen/gen-vis@5/schema.json` (the `$id` of
  `schema.json`) or the one of jsdelivr, or the schema of the installed
  package, a path ending in `node_modules/@preschen/gen-vis/schema.json`; the
  same of the major version 4 is accepted. Whether the merged definition is
  one of 4.x follows from its keys, not from its `$schema` (`options`,
  `mapping`, `plot` or `formElements` without `dims`, `marks` or
  `controls`): it is migrated after the merge.

## Texts in several languages

After the merge and the evaluation of the expressions of the globals, the
texts in several languages of the parts are the ones of the language: a text in several languages is an object of
at least one key, all keys language tags (`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`,
not the name of an operator of the expressions, e.g. `or`, `var`) and all
values strings. The language is `language` of the merged parts, a
tag, or of a text starting with `@` the global of its name (as a string,
none if the global is missing); without one the tag of `locale` (a
string or its `base`); none otherwise. The text is the one of the language,
else the one of its language without the region (the part before the first
`-`), else the first one (in the order of the keys). Only these places are
texts in several languages, objects elsewhere stay as they are (e.g. `{"of":
"x"}` of a scale): `title`, `subtitle`, `source`, `empty`,
`hover.title`, `row`, `total`; of every dim `name`, `format`,
`axis.format`, `axis.title` (a text) and `axis.title.name`, `hover.format`,
`legend.format`, `legend.missing.name`, `common.name`, the `name` of every
category and of every entry of `ranks`; of every annotation `label` and
`text`; the `name` of every control and of every entry of its
`values` (the package chooses them of the form the engine reads, of
`options`, `mapping` and `formElements`, see `normalize.md`). Without
`locale` the language is also the locale, if it is one (see `locale` of
`docs/definition.md`).
