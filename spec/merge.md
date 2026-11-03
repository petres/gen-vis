# Merging definitions

A definition is merged with its parents (`parent`, a url or a list of them,
the mixins), and the patches of the selected entries of its form elements are
merged into its patchable parts. Both follow the rule of `merge`. The
fixtures are `merge/merge.json` (`merge`), `merge/parents.json` (the parents)
and `merge/patches.json` (the patches).

## `merge(parts)`

The parts are merged in their order, a later part overrides an earlier one
(`merge/merge.json`, `{ "name", "parts", "result" }`):

- Two objects are merged key by key, recursively, the keys of the earlier
  one first, then the new keys of the later one.
- Two arrays whose entries are all objects with an `id` (not empty), e.g. the
  plots or the form elements and their values, are merged by the ids:
  the entries of the earlier array in their order, each merged with the entry
  of the later array of the same id (ids are compared as strings, `1` and
  `"1"` are the same), then the entries of the later one with new ids.
- All other values replace the earlier one, also arrays (of numbers, strings
  or of entries of which one has no id), `null` (it stays in the merged
  definition) and an object of an array or of a value and the other way round.
- The parts themselves are not changed (the result is a copy).

`null` is kept by the merge, the parts of a definition which it removes treat
it as missing: a mapping (`"mapping": {"y": null}`), the parts `scale`,
`axis`, `legend`, `hover`, `props` of a mapping (also `false`), `geo`,
`filter`, `facets`, `plot`, `annotations` and `transform`.

(The JS implementation, deepmerge, leaves out keys of a later part which are
names of the prototype of objects, e.g. `constructor` or `toString`; another
implementation need not.)

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

## Patches

`merge/patches.json`, `{ "name", "def", "result": { "globals", "parts" } }`:
the patchable parts of the definition (`options`, `mapping`, `plot`,
`annotations`, `filter`, `facets`, `geo`, `transform`) with the patches of
the entries selected by the globals.

- The entry of a form element is the one whose `value` is the same (as
  strings) as the global of the form element (`ref`), no entry if there is
  none.
- The `globals` of the selected entries are set (in the order of the form
  elements), then the entries are selected again with them, until no
  entry changes the globals anymore, at most once more than there are form
  elements, e.g. of entries which set each other's globals.
- `parts` = `merge([parts of def, patchable parts of the patch of every
  selected entry in the order of the form elements])`, the other parts of a
  patch are left out.
