# To do: architecture

From the outside review of 2026-11-12 (an architecture reviewer who had not seen the code) and the
review of the release of 2026-11-10. Ranked by value for effort.

## The variants of the controls (medium to large)

The load resolves the definition once per value of a control, one control at a time
(`variants` of `utils/resolve.js`, `utils/load.js`), to know the parts to load (coordinate systems,
geometries, colors). A part which only a combination of two controls needs is never loaded:

```json
"coord": "=if(@a == 'on' and @b == 'on', 'polar', 'cartesian')"
```

ends in `the mark type 'polar:line' is one of polar charts`; `store.js` keeps the coordinate system of
before without a message. Controls of the values of a column have no variants at all.

- Either: the requirements are collected from all branches of the expressions, without evaluating
  them (medium).
- Or: a part is loaded when a control changes to a value which needs it (large: `applyControls`
  becomes asynchronous).

## Channels as strings; one stack per chart (large)

The translation writes what it knows of a channel into reference strings (`"@y:start:scaled"`,
`translate` of `utils/language.js`, one function of about 380 lines), and at least nine places read it
back by patterns (`layout.js`, `utils/normalize.js`, `marks/elements.js`, `marks/cartesian.js`,
`utils/validate.js`). A typed model of the channels of a mark (dim, part, scaled or not) instead.

A consequence which is a bug today: stacks are written per mark but there is one stacked dim per chart
(`layout.js`). A second stacked bar mark of another value dim draws nothing, without an error or a
warning.

## The state in the prepared definition (medium)

The state of the user (the values of the controls, the visible categories) is written into the
prepared definition and read back by comparing snapshots (`store.js`, `utils/state.js`, `keepVisible`
of `utils/def.js`). Nine fields of the store are written by the view (`comp/vis.js`), so
`layout(store, width)` is no function of its arguments. A state of its own beside an immutable
prepared definition makes the layout a function which can be tested and cached, and makes the caches
below simple.

## The coordinate systems of a page have the store of the package (medium)

The mark types of a page have a small read-only store (`marks/public.js`). A coordinate system
(`registerCoord`) still gets the store of the package and writes to the context (`prepare`), so its
interface is not stable (`docs/extensions.md` says so). The same small store for them needs a place
for what `prepare` adds (the projection of a map) which is not the context of the package.

## Smaller ones

- **Two systems of messages**: the warnings of the draw (in the first load) and the check (a lazy
  chunk) say partly the same in different words.
- **"Is this dim categorical"** is answered in seven places.
- **About eleven caches keyed by identity** (WeakMaps) around a layout which is computed as a whole.
- **A lazy part is wired by hand in five places** (`utils/lazy.js`, `requirements` and `loadParts` of
  `utils/load.js`, its registry, `vite.config.js`).
- **The schema is checked twice**: by ajv in the CLI and by a walker of its own in
  `utils/validate.js`.
- **The names of the globals** are collected by `namesOfGlobals` (`utils/resolve.js`) and by
  `templateNames` (`utils/def.js`); the table of the props of a dim is kept in three files.
- **The check resolves a definition by itself** (`checkResolved` of `utils/validate.js`): it needs the
  forms between the steps, so it does not use `utils/compile.js`.

## Later

- **Data in columns.** CSV becomes an object of strings per row, then a second object per row with
  the values of the dims, and a value is converted up to three times. A table of columns (typed
  arrays, a dictionary of the categories) removes most of the 40 % of the mount time which is the
  load, and most of the memory of large files; parquet arrives in columns already. Contained to
  `utils/data.js`, `utils/load.js`, the transforms and the prepared rows. Before it: a benchmark of
  the three large examples as a test. (Large.)
- **Definitions compiled ahead.** `gen-vis compile` writes the prepared definition, a second entry
  of the package reads only those: no language, no parents, no check at run time. A second code path
  to keep; only if the size of the first load matters more than today.
