# FTI Monitor with gen-vis: todo

What is still needed to draw the charts of a page of the
[FTI Monitor](https://fti-monitor.forwit.at), e.g.
[D.2 Efficiency](https://fti-monitor.forwit.at/en/B/D.2), with gen-vis.

Done (`data/fti/`, see its `README.md`): the sub-indicators of C.7 and D.2,
the aggregated indicator of D.2 over time, its map and the list of the first
countries, with the comparison group (Innovation Leaders, Top 3, EU-27),
Europe/World of the map, the hover of the monitor, narrow screens and its
look (`data/fti/style.css`). gen-vis 3.0 has the features of the
workarounds of 2.x, see "Features" below.

## Parts of the page

The features are there, the data of the parts is missing:

- [ ] **Year (data status)**: the editions 2022 to 2026 (`values_2022.json`
  … `values_2025.json`, `values.json` is the current one), e.g. one CSV with
  a column `edition`, a select or a hidden form element of the year of the
  page (`globals` of the page) and `filter`. The hierarchy and the labels
  are the ones of the current edition, older editions can lack indicators.
- [ ] **Sub-indicators, change**: the views "Change to the previous year" and
  "Change to {years} years ago" of the menu "Current values"
  (`minus.json`, the changes of 1 to 10 years in percentage points per
  group): an entry of a form element with a `patch` of the column, the
  domain (`"include": 0, "domainRel": [-0.4, 0.4]`, bars from
  `@x:scaled:0`), the format (`+.1f`) and the texts, "not available" e.g. as
  a text of a plot with `"filter": { "x": null }`.
- [ ] **Comparison groups**: the data also has the USA, China, Japan and
  South Korea (`rel.us`, `rel.cn`, `rel.jp`, `rel.kr`), C.6 is the EU-27
  relative to the USA (`rel.us`), e.g. more entries of `_group.json` and a
  patch of the entries of C.6. "Top 3" is year-dependent (the label of the
  monitor), the countries of the Top 3 of an indicator are in `top3`, e.g.
  `(1) KR (2) JP (3) CN`, e.g. a column of the hover.
- [ ] **Map**: Malta and other small countries (missing in the 1:110 million
  geometry, e.g. 1:50 million or `geo:circle` at their `lon` and `lat`).
- [ ] **Sub-indicators, click**: a click of a row (also of its label)
  emits `select`, the page opens the meta information of the indicator (a
  modal of the page), the links "Meta-information on the sub-indicators" and
  "Analysis of strengths and weaknesses" are the page.
- [ ] **Language**: German and English (`labels.json` and `countries.json`
  have both): a hidden form element of the language (`globals` of the page)
  with the texts as `globals` of its entries, `options.locale` as a `patch`,
  the labels by `"column": "label_{lang}"` or a `lookup` of `countries.json`.
- [ ] **The other charts of the monitor** (other pages): the overview of the
  areas (bars with the values of the year before), the achievement of the
  targets (pie chart, the target lines with actual values and the target),
  the lines of the comparison groups.

## Features of gen-vis instead of the workarounds (3.0)

| Workaround of 2.x | Feature of 3.0 |
|-------------------|----------------|
| Rows without values between the groups (`gap1`, …) | `groups` of a band scale, e.g. `{ "by": "group", "padding": 1 }` |
| The black line at 0 is a line per row, its `ratio` is 1 / (rows + padding) | `@y:group:start` and `@y:group:end`, `@y:bandwidth` and `@y:step` |
| The white circle of the headers has a radius of 0 for the other rows, the ring of the lines is an ordinal scale (`ring`) | `filter` of a plot, e.g. `{ "level": "header" }` |
| The headers of D.2 are outputs with a marker of radius 0 | `"legend": false` of a category |
| The box and the line of the hover are hidden by CSS | `options.hover.box` and `marker` (`false`) |
| The ring of the last year is hidden by CSS (`:has()`) | `others-` props, e.g. `"others-visibility": "hidden"` |
| The hover of the map is moved above the country by CSS (`!important`) | `options.hover.side`, `offset` and `"position": "pointer"` |
| Gaps and countries without a value have an empty hover, hidden by CSS | no hover without rows (`"empty": true` shows it), `options.hover.filter` |
| The hover of the bars is only on the plot | `"area": "facet"`, the margins too |
| The columns of the map are named as the groups | `{group:name}`, `globals` of entries |
| The countries of Europe are rows of both views | `patch` of all parts, e.g. `filter` and `geo` |
| The domain of the lines is patched per comparison group | `"include": 100` |
| The labels are shortened in the data, the margin is fixed | `max-width` of texts and labels, margins as props |
| The labels are an `svg:text` plot | `axis.labels` with props of categories |
| The markers of inputs and outputs are moved by `transform` | `offset` of `relative` props |
| The values relative to a group are computed by the script | the transform `calc` (or `index`) |
| The design is CSS scoped by `data-dir` and `data-def` | `options.class`, `data-global-` attributes |
| A text instead of the map of the Top 3 is not possible | `options.message`, e.g. of a patch |
| The classes are `value >= 74.5` | `"closed": "right"` of threshold scales |
| No fade of the highlight | `options.highlight.transition` |
| The list of the first countries beside the map | the transform `rank`, linked charts (`highlight`) |
| The legend of the map below it | `legend.position`, `orientation`, `labels` |

## Data

- [ ] The script which builds the CSVs and `data/geo/world.json` of the files
  of the monitor (`hierarchy.json`, `labels.json`, `values.json`,
  `series.csv`, `mapValues.json`, `countries.json` of
  `https://fti-monitor.forwit.at/data/`) and of world-atlas is not in the
  repository yet (`build.py` of a session of Claude Code), e.g. as
  `data/fti/build.py` with the steps of an update of the data. The CSVs of
  3.0 have a column `group` instead of the gap rows, no `short` labels, the
  headers of D.2 have `io` `none`, the map has a row per country with a
  column `europe` and the columns `inno` and `eu`.
- [ ] The data of the monitor is the one of October 2026 (data status
  02/2026), the URLs of the files are not documented by the monitor.
