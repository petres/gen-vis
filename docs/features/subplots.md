# Subplots: panels with their own marks

Status: idea, not designed in detail, not scheduled (after 5.0).

## The need

A chart of several panels which share an axis but show different things, e.g. a histogram with a
strip plot of the single values below it (`data/stats/histogram.json`), a line of prices above bars
of volumes, a main plot with a marginal distribution.

## Today

There is no concept for it. Two ways come close:

- **Facets** repeat the same marks over subsets of the rows. A panel cannot have marks or a value dim
  of its own.
- **One plot with split ranges**, the way of `data/stats/histogram.json`: the scale of the histogram
  gets the upper part of the height (`"range": ["@height * 0.62", 0]`), a second vertical band scale
  the lower part (`"range": ["@height * 0.7", "@height"]`, with `"axis": {}`), and the points are
  placed by an expression (`"y": "@group:scaled + @jitter * @group:bandwidth"`). `x` is shared
  because it is one plot.

What the second way costs:

- The split and the gap are computed by hand, as shares of the height.
- The grid, the line and the title of an axis do not know of the split. They fit only because the
  range is restricted.
- One hover for the whole plot, not one per panel.
- It works only when the panels share one direction completely. Panels beside each other with
  different `x` scales need the same by hand in the other direction.

## A possible shape

Panels as rows (or columns) of the grid of the facets, each with its own marks and its own value
dim, the other direction shared by the existing `scales` of facets:

```json
{
    "panels": [
        { "marks": [{ "type": "bar", "x0": "lo", "x1": "hi", "y": "perMonth" }], "height": 0.65 },
        { "marks": [{ "type": "point", "by": "group", "y": "group", "jitter": true }] }
    ],
    "dims": { "x": { "column": "value" } }
}
```

What it would give over the split ranges: the layout of the grid (gaps, margins measured per panel,
axes only at the outer edges), a hover per panel, grids and axis titles that belong to their panel,
annotations of the shared direction through all panels.

## Open questions

- A list of its own (`panels`) or a form of `facets` (`"by": { "rows": "<marks>" }`)? Panels and
  facets by a dim should combine: panels as rows, a dim as columns.
- Where a dim says which panel it belongs to: by the marks that use it, or by a key of the panel.
- The heights of the panels: shares, pixels, or by the number of bands of a band scale.
- Legends: one for all panels, as of facets.
- The export and the hover across panels (a ruler through all panels at the shared value).
- The jitter of a strip plot is its own small feature (a `jitter` of points within a band), useful
  without panels.

## Size

Large: the layout of the facets, the scales per panel, the hover, the check and the docs. It must
not make the first load bigger for charts without panels.
