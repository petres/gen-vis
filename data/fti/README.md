# Charts of the FTI Monitor

Charts of the [FTI Monitor](https://fti-monitor.forwit.at) of FORWIT drawn
with gen-vis, the data of its files (`/data/hierarchy.json`, `labels.json`,
`values.json`, `series.csv`, `mapValues.json` and `countries.json`, October
2026):

- `c7-bars.json`, `d2-bars.json`: the sub-indicators of C.7 (Artificial
  Intelligence) and D.2 (Efficiency), the rows are in the groups of the
  column `group` (`groups` of the band scale), the black line at 0 is a line
  per group (`@y:group:start` to `@y:group:end`), the headers are bold
  (`axis.labels`), long labels are cut (`max-width`), the headers of D.2 have
  no input or output (`none`, without an entry in the legend)
- `d2-series.json`: the aggregated indicator over time, the circle of the
  last year, hidden while another year is highlighted (`others-visibility`),
  the domain includes 100 (`include`)
- `d2-map.json`: the international comparison, the view of Europe is a patch
  of the filter (`europe`), the Top 3 is a message (there are other Top 3
  per indicator), the legend is a vertical scale left of the map
- `d2-ranking.json`: the first ten countries of the map (the transform
  `rank`), e.g. beside the map, linked by the `highlight` of the page

The values are relative to a comparison group, the Innovation Leaders, the
Top 3 or the EU-27 (columns `inno`, `top3` and `eu`, the texts name the
entry, `{group:name}`), the colors are the classes of the monitor (`value >
74.5`, `"closed": "right"`). The mixins are `_group.json` (the comparison
group) and `_bars.json`.

The hover is the one of the monitor, by `highlight-` props of the elements
of the row of the hover: of the bars the darker bar, a larger circle and the
value (also over the labels, `"area": "facet"`), of the lines the ring of
the year, of the map the faded country with the text above it (`side`,
`offset`), the bars and the lines have no box (`"box": false`). Narrow
screens have a smaller margin of the labels and below 480 pixels a message
(props of `totalWidth`). `style.css` is the look of the monitor, of the
charts with the class `fti` (`options.class`).
