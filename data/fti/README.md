# Charts of the FTI Monitor

Charts of the [FTI Monitor](https://fti-monitor.forwit.at) of FORWIT drawn
with gen-vis, the data of its files (`/data/hierarchy.json`, `labels.json`,
`values.json`, `series.csv`, `mapValues.json` and `countries.json`, October
2026):

- `c7-bars.json`, `d2-bars.json`: the sub-indicators of C.7 (Artificial
  Intelligence) and D.2 (Efficiency), the groups are separated by rows
  without values (`gap1`, ...), which are not drawn, the black line at 0 is
  a line per row of the height of a band (`ratio` is 1 / (rows + padding))
- `d2-series.json`: the aggregated indicator over time, the circle of the
  last year
- `d2-map.json`: the international comparison, the countries of Europe are
  rows of both views, `fit` is the one of the rows of the view

The values are relative to a comparison group, the Innovation Leaders, the
Top 3 or the EU-27 (columns `inno`, `top3` and `eu`, of the map without the
Top 3, its columns are named as the groups, so the hover names them), the
colors are the classes of the monitor. The mixins are `_group.json` (the
comparison group) and `_bars.json`.

The hover is the one of the monitor, by `highlight-` props of the elements
of the row of the hover: of the bars the darker bar, a larger circle and the
value, of the lines the ring of the year (of the total, `ring` is visible
only of it), of the map the faded country. `style.css` is the look of the
monitor on the dev page, it hides the box of the hover of the bars and the
lines, the ring of the last year while another one is shown and the hover of
the countries without a value, and shows the one of the map as text above
the country.
