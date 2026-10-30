# FTI Monitor with gen-vis: todo

What is still needed to draw the charts of a page of the
[FTI Monitor](https://fti-monitor.forwit.at), e.g.
[D.2 Efficiency](https://fti-monitor.forwit.at/en/B/D.2), with gen-vis.

Done (`data/fti/`, see its `README.md`): the sub-indicators of C.7 and D.2,
the aggregated indicator of D.2 over time and its map, with the comparison
group (Innovation Leaders, Top 3, EU-27), Europe/World of the map, the hover
of the monitor and its look on the dev page (`data/fti/style.css`).

## Parts of the page

- [ ] **Year (data status)**: the editions 2022 to 2026 (`values_2022.json`
  … `values_2025.json`, `values.json` is the current one), e.g. one CSV with
  a column `edition`, a select and `filter`. The hierarchy and the labels
  are the ones of the current edition, older editions can lack indicators.
- [ ] **Sub-indicators, change**: the views "Change to the previous year" and
  "Change to {years} years ago" of the menu "Current values"
  (`minus.json`, the changes of 1 to 10 years in percentage points per
  group): bars from 0 to both sides, the domain of the values and 0
  extended by 40% of its size on both sides, "not available" for
  indicators without a value, the hover the value with its sign, e.g.
  `+1.2 %-Punkte`. A form element of the column, the domain and the labels.
- [ ] **Comparison groups**: the data also has the USA, China, Japan and
  South Korea (`rel.us`, `rel.cn`, `rel.jp`, `rel.kr`), C.6 is the EU-27
  relative to the USA (`rel.us`). "Top 3" is year-dependent (the label of
  the monitor), the countries of the Top 3 of an indicator are in `top3`,
  e.g. `(1) KR (2) JP (3) CN`.
- [ ] **Map of the Top 3**: the monitor shows a text instead of the map
  (there are other Top 3 per indicator), the map of gen-vis has no Top 3, so
  the comparison group of the page differs per chart.
- [ ] **Map**: the list of the first countries beside it (1. Sweden, 2.
  Denmark, …), its legend as a bar of the colors with the ticks 75, 90, 100
  and 110 at the left, Malta and other small countries (missing in the 1:110
  million geometry, e.g. 1:50 million or circles of them).
- [ ] **Sub-indicators, click**: a click of a row opens the meta information
  of the indicator (a modal of the page, gen-vis emits `select`), the links
  "Meta-information on the sub-indicators" and "Analysis of strengths and
  weaknesses" are the page.
- [ ] **Language**: German and English (`labels.json` and `countries.json`
  have both), e.g. columns `label_de`/`label_en` of a template of a global
  and `options.locale`.
- [ ] **Narrow screens**: the margin of the labels is 320 pixels, the monitor
  shows "The display is too narrow, please rotate your device", e.g. margins
  and labels as `steps` props of `totalWidth`.
- [ ] **The other charts of the monitor** (other pages): the overview of the
  areas (bars with the values of the year before), the achievement of the
  targets (pie chart, the target lines with actual values and the target),
  the lines of the comparison groups.

## Features of gen-vis instead of the workarounds

| Workaround now | Feature |
|----------------|---------|
| Rows without values between the groups (`gap1`, …) | gaps between the groups of a band scale, e.g. a column of the groups and its padding |
| The black line at 0 is a line per row with the height of a band, its `ratio` is 1 / (rows + padding) per chart, wrong after a toggle of the legend | the sizes of a band as references, e.g. `@y:bandwidth` and `@y:step`, or a line per group from its first to its last row |
| The white circle of the headers has a radius of 0 for the other rows, the ring of the lines is visible only of the total by an ordinal scale (`ring`) | a `filter` of a plot, e.g. `{"level": "header"}` |
| The headers of D.2 are outputs with a marker of radius 0, a toggle of "Output" hides them | categories without an entry of the legend, e.g. `"legend": false` of a category |
| The box and the line of the hover of the bars and the lines are hidden by CSS | a hover without a box or a line, e.g. `options.hover.box: false` |
| The ring of the last year is hidden by CSS (`:has()`) while another one is highlighted | props of the other elements while one is highlighted, e.g. `others-visibility` |
| The hover of the map is moved above the country by CSS (`!important`) | the hover at the pointer, e.g. `options.hover.position: "pointer"` and an offset |
| Gaps and countries without a value have an empty hover, hidden by CSS | no hover without values, e.g. an option of the hover |
| The hover of the bars is only on the plot, the one of the monitor also on the labels | the hover over the margins of the rows of horizontal bars |
| The columns of the map are named as the groups, so the hover names them (`{group}`) | the names of the entries of form elements in templates, e.g. `{group:name}`, or entries which set several globals |
| The countries of Europe are rows of both views, `filter` and `"fit": "data"` | `geo.fit` (and other parts than mappings) changed by form elements |
| The domain of the lines is patched per comparison group so it has 100 | a domain which includes a value, e.g. `"include": [100]` |
| The labels are shortened in the data (`short`, 42 characters), the margin is fixed | shortened texts, e.g. a `maxWidth` of `svg:text` with an ellipsis, margins of the labels |
| The labels are an `svg:text` plot, so the headers are bold | props of the labels of a band axis per category |
| The markers of inputs and outputs are moved by `transform` | offsets of circles, e.g. `dx`/`dy` of `svg:circle` |
| The values relative to a group (100 / `value.inno` of `series.csv`) are computed by the script | a transform of ratios of columns |
| The design is CSS of the dev page, scoped by `data-dir` and `data-def` | a class of the root of a definition, e.g. `options.class`, for the CSS of pages |
| A text instead of the map of the Top 3 is not possible | a message instead of a chart, e.g. of an entry of a form element |

Smaller differences:

- The classes of the monitor are `value > 74.5`, the ones of a threshold
  scale `value >= 74.5`, values on a threshold differ.
- The monitor fades a country in 50 ms, the highlight of gen-vis has no
  transition.

## Data

- [ ] The script which builds the CSVs and `data/geo/world.json` of the files
  of the monitor (`hierarchy.json`, `labels.json`, `values.json`,
  `series.csv`, `mapValues.json`, `countries.json` of
  `https://fti-monitor.forwit.at/data/`) and of world-atlas is not in the
  repository yet (`build.py` of a session of Claude Code), e.g. as
  `data/fti/build.py` with the steps of an update of the data.
- [ ] The data of the monitor is the one of October 2026 (data status
  02/2026), the URLs of the files are not documented by the monitor.
