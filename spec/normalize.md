# Normalize

A definition of 5.0 may leave out parts which the renderer reads, e.g. the
scale of `x`, and it has shorthands, e.g. the channels of a mark. The
engine reads a form of the same names (`dims`, `marks`, `controls`, the
options at the top level) with the shorthands written out, e.g. marks with
the `props` of the scaled positions. This form is internal and unstable (it
is not exported by the package and may change in any release); the fixtures
describe what the renderer of the JS implementation reads. The load goes
through four steps, each JSON to JSON:

1. the parents are merged (see `merge.md`), a definition of 4.x is
   migrated (`migrate`, `src/utils/migrate.js`);
2. `resolve`: the expressions of the globals are evaluated (see
   `expressions.md` and `src/utils/resolve.js`);
3. `translate`: the shorthands of the definition written out, the form the
   engine reads (below, `src/utils/language.js`);
4. `normalize`: the parts the form leaves out written out (below,
   `src/utils/normalize.js`); then the types of the dims without one
   follow from their values (the rows are loaded then).

The fixtures `normalize/*.json` are of step 4, definitions in the form the
engine reads; `tests/language.test.js` has cases of step 3.

## translate

- Strings starting with `=` or `@` are expressions (the string syntax of
  `expressions.md`), except of the names (`$schema`, `parent`, `data`,
  `dataFormat`, `column`, `columns`, `key`, `as`) starting with `@`.
- The options of the top level (`title`, `subtitle`, `source`, `height`,
  `width`, `margins`, `coord`, `locale`, `language`, `transition`, `class`,
  `message`, `empty`, `hover`, `highlight`, `fontFamily`) stay as they
  are; `hover.columns` is no option, see below.
- A dim of `dims` of `null` or `false` is left out. Of a dim:
  `zero: true` is `"domain": [0, null]` (unless it has a domain); `pad`,
  `include`, `reverse` and `range` are parts of `scale`; `grid`, `ticks`
  and `tickSpacing` parts of `axis`; a category which is a text is
  `{"color": text}`. A dim without listed categories (an object) and
  without `fromData` gets `"fromData": "rows"` if it has parts of
  categories (`scheme`, `common`, `ranks`, `order`), a legend (not
  `false`, without a scale, not of a numeric or date type) or is a dim of
  the facets.
- Of a control of `controls`: `id` is the global by default; a value of the
  list of `values` which is no object is the entry
  `{"id": text, "name": text, "value": value}`, an entry without `id` or
  `name` has the text of its value.
- `facets.by` of a text is `facets.dim`, of an object its `rows` and
  `cols`; `scales` `"own"` is `[]`, `"shared"` the list of the dims whose
  scale has an orientation (not `null`).
- `marks` (a mark or a list) are a list, `by` of a mark a list. The type of the
  coordinate system (`coord`, `cartesian` by default): `point` is
  `svg:circle` (`polar:circle`, `geo:circle`), `label` and `text` are
  `svg:text` (`polar:text`, `geo:text`), `cell` is `svg:rect`, `tick` is
  `cartesian:rule`, `line` and `area` of polar charts `polar:<kind>`,
  otherwise `line`, `area`, `bar` and `rule` are `cartesian:<kind>`, `arc`
  is `polar:arc`, `base`, `region` and `mesh` are `geo:<kind>`, `circle`
  and `rect` are `svg:<kind>`; a name with a `:` stays.
- The keys of a mark which are no options (`type`, `id`, `by`, `filter`,
  `curve`, `stack`, `dodge`, `orient`, `select`, `layer`, `facet`, `data`,
  `dataFormat`, `once`, `place`, `halo`, `ends`, `fit`, `overlap`,
  `object`, `borders`, `highlight`, `others`, `anchor`, `before`) are its
  `props`, the channels become props of positions:
  - a channel naming a dim is `@<dim>:scaled` (of points, texts and polar
    angles of a categorical dim `@<dim>:scaled:center`), a column of no dim
    adds the dim `{"column": name}`; a dim of a channel beside the dim of
    its axis (`x0`, `x1`, `x2` of `x`, `y0`, `y1`, `y2` of `y`) which has no
    scale and is not categorical gets `"scale": {"of": axis}`; a channel
    which is left out is the dim of its axis (`x`, `y`) if it exists;
  - a number of `x0`, `y0` of bars, areas and rules, of `y` of bars and of
    `x`, `y` of rules is `@<axis>:scaled:<number>`; other values (numbers,
    references, expressions) stay;
  - `line`: `d.x` (or `d.x0`, `d.x1`) and `d.y`; `area`: `d.x` (or `d.x0`,
    `d.x1`), `d.y1` and `d.y0` (`y0` or `@y:scaled:0`), of a stacked area
    `@y:start:scaled` and `@y:end:scaled`; polar `d.angle` and `d.radius`
    (`d.innerRadius`, `d.outerRadius` of areas);
  - `bar`: with `x0` and `x1` the props `x0`, `x1`, `y1` (and `y0`);
    horizontal (`orient`, or a categorical `y` and a not categorical `x`)
    `y` and `x1` (`x0`); otherwise `x` and `y1` (`y0`); of a stacked bar the
    start and the end of the stacked dim (`@y:start:scaled`,
    `@y:end:scaled`); `dodge` (`true` the first dim of `by`, or a dim `g`)
    is the position `@x:scaled + @x:bandwidth * ((@g:index + 0.5) /
    @g:count - 0.5)` and the width `@x:bandwidth / @g:count` (of horizontal
    bars of `y` and the height);
  - `rule`: of a `y` without an `x` the props `y`, `x1`, `x2`, otherwise
    `x`, `y1`, `y2`;
  - `point`: `cx`, `cy`; `cell`: `x`, `y`, `width` and `height` of the
    bandwidths, the dims of its positions get a `band` scale;
  - `text`, `label`: `x`, `y`; `dodge` (`true` or a dim) the middle of the
    slot of the category of a dodged bar; `anchor` the `dx`, `dy`,
    `text-anchor` and `dominant-baseline` of its side (`end`: `dx` 4,
    `start`, `middle`; `start`: `dx` -4, `end`, `middle`; `top`: `dy` -4,
    `middle`, `auto`; `bottom`: `dy` 4, `middle`, `hanging`; `center`:
    `middle`, `middle`), props given win; a `label` without a `fill` has
    `"fill": null`;
  - `arc`: of a stacked arc `startAngle` and `endAngle` of the stacked
    dim, otherwise `angle`, `outerRadius` of a given `y`;
  - maps: `lon` and `lat` of the dims of the channels `lon` and `lat`;
  - `rect` and `svg:line`: the channels `x`, `y`, `x1`, `y1`, `x2`, `y2`
    given are the props of the same names;
  - `fill` or `stroke` naming a categorical dim is `@color`, the dim is
    added to `by`; naming another dim `@<dim>:scaled`; `r`, `opacity`,
    `stroke-width` and `font-size` naming a dim which is not categorical
    `@<dim>:scaled`.
- `stack` of a mark is `stacked` of its value dim (`true`, or the condition
  of the rows, of several marks `{"or": [...]}`), of bars and areas with
  `x0` its dim is `stackBy`.
- The dims of the hover get `"hover": {}` unless they have one: the ones of
  `hover.columns`, without it the dims of the `by` of the marks.
- The other keys (`$schema`, `parent`, `data`, `dataFormat`, `transform`,
  `filter`, `globals`, `geo`, `annotations`) stay as they are, keys which
  the schema does not know are left out.

## normalize

The fixtures are `normalize/*.json`. The input is the form `translate`
writes: the dims are objects, `marks` is a list of objects.

### Dims

- `categories`, `scheme`, `common`, `fromData`, `ranks` and `order` stay at
  the dim, they are the parts of its categories.
- `domain` and `nice` of a dim are the ones of its scale.
- `format` stays at the dim, it is the format of the axis and of the
  hover which have none of their own (the hover: its own, the one of the
  dim, the one of the axis).
- The dims of the positions of the coordinate system have a scale of the
  orientation of their name and an axis, unless they have the scale or the
  axis `false` (none), an orientation `null` is none (e.g. a dim `y` of
  the sizes of points): cartesian `x` horizontal, `y` vertical, polar `x`
  and `angle` angular, `y` and `radius` radial. A dim of the scale of
  another one (`"scale": {"of": "y"}`) has none of these.
- An axis without a `position` is at the one of the orientation of its
  scale: horizontal `bottom`, vertical `left`, angular `angular`, radial
  `radial`.
- The type of a dim without one follows from its parts: categorical with
  categories (any of their parts) or a `band`, `point` or `ordinal` scale, date with a
  `time` or `utc` scale, numeric with another scale, categorical if it is a
  dim of the facets (`facets.dim`) or of the groups of a scale
  (`scale.groups.by`), not of the categories of a mark (`by`), they group the
  rows of any type. Otherwise it is the type
  of the values of the column (when the rows are known): numeric if all
  values which are not missing are numbers, date if all of them are dates,
  otherwise categorical (see `docs/definition.md` of the values).
- The type of a scale without one follows from the type of the dim:
  numeric `linear`, date `time`, categorical `band` of a position of the
  bars of a mark (`cartesian:bar`, `polar:arc`, a prop of `@name:scaled`),
  `point` of other positions, `ordinal` without an orientation.

### Marks

- `by`, `highlight` and `others` stay as they are.
- A type without the prefix of a coordinate system (`line`) is the one of
  the coordinate system of the definition (`coord`, `cartesian` by
  default), `<coord>:<name>`, otherwise `svg:<name>`, otherwise the only
  registered type `<prefix>:<name>` of the coordinate system (`translate`
  writes the full names of the built-in types).
- The props of a mark of a registered type, of its short or its full name
  (`line` and `cartesian:line` alike), are merged into the default props of
  the type: nested props (objects which are no operators, e.g. `d`) deeply,
  `null` removes a default. The order of the props is the one of the defaults, then the other
  ones (the order of the attributes of the elements).

The default props (`src/marks/defaults.js`), `color` is
`{"or": ["@color", "currentColor"]}` (the color of the text without
categories), `fill` is `{"or": ["@color", "#4269D0"]}` (the first of the
default colors of categories). The positions are no defaults, `translate`
writes them of the channels of the marks:

| Type | Defaults |
|------|----------|
| `cartesian:line` | `stroke`: color, `fill`: `none` |
| `cartesian:area` | `fill`: fill |
| `cartesian:bar` | `fill`: fill; with `x1` and `y1` (the classes of a bin) also `shape-rendering`: `crispEdges` |
| `cartesian:rule` | `stroke`: color |
| `svg:circle` | `r`: 3, `fill`: color |
| `svg:text` | `fill`: `@color` |
| `polar:line` | `stroke`: color, `fill`: `none` |
| `polar:area` | `fill`: fill |
| `polar:arc` | `fill`: fill |
| `polar:circle` | `r`: 3, `fill`: color |
| `polar:text` | `fill`: `@color` |
| `geo:text` | `text-anchor`: `middle`, without a `dy` also `dominant-baseline`: `middle` |
