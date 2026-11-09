# Recipes

Definitions of common charts, each a file of [`data/recipes/`](../data/recipes)
with its data (the data are illustrative), drawn by the tests as the other
examples. The keys are in the [reference](reference.md), the language in
[definition.md](definition.md).

## Sorted horizontal bars with their values

The countries are the categories of `y`, from the top down (the default of a
vertical axis of categories), in the order of their value (`scale.order` by
`x`, descending). A `label` beside the end of each bar (`anchor: "end"`) writes
its formatted value; the margins are measured, also of the labels beyond the
plot area, so the definition gives none.

<!-- data/recipes/bars.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "unemp.csv",
    "title": "Unemployment rate 2025",
    "subtitle": "in % of the labour force",
    "source": "Illustrative data",
    "locale": "en",
    "height": 320,
    "dims": {
        "x": {"column": "rate", "format": ".1f", "zero": true, "grid": true},
        "y": {"column": "country", "scale": {"order": {"by": "x", "descending": true}}}
    },
    "marks": [
        {"type": "bar", "fill": "#1E4F77"},
        {"type": "label", "text": "@x:formatted", "anchor": "end", "font-size": 11}
    ]
}
```

## A population pyramid

The men are negative values of a column of a transform (`calc`), so their bars
go to the left; the labels of the axis are the values without their sign (an
expression of the labels, `labels.props.text`). The youngest group is at the
bottom (`"reverse": true`, the categories run from the top by default). The
hover shows the unsigned population (`columns`) instead of the signed value
of the position (`"value": false`).

<!-- data/recipes/pyramid.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "pyramid.csv",
    "title": "Population by age and sex, 2025",
    "subtitle": "in thousands",
    "source": "Illustrative data",
    "locale": "en",
    "height": 320,
    "transform": {"type": "calc", "as": "signed", "expr": "@sex == 'Men' ? -@pop : @pop"},
    "dims": {
        "x": {"column": "signed", "grid": true, "axis": {"labels": {"props": {"text": "=format(max(@x, -@x), ',.0f')"}}}},
        "y": {"column": "age", "type": "categorical", "reverse": true},
        "sex": {"column": "sex", "legend": {}, "categories": {"Men": "#4E79A7", "Women": "#E15759"}},
        "pop": {"column": "pop", "format": ",.0f"}
    },
    "hover": {"value": false, "columns": ["sex", "pop"]},
    "marks": {"type": "bar", "by": "sex"}
}
```

## Dodged bars with error bars

`dodge` puts the bars of the years side by side in the band of their region,
a `rule` with the same `dodge` is at the middle of the bar of its year, from
`lo` to `hi` (`y1`, `y2`), on the scale of `y`. The legend draws the rects of
the bars (`"symbol": "rect"`), not the rule through them.

<!-- data/recipes/errorbars.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "survey.csv",
    "title": "Trust in public institutions",
    "subtitle": "share of respondents in %, with 95% confidence intervals",
    "source": "Illustrative data",
    "locale": "en",
    "height": 300,
    "dims": {
        "x": {"column": "region", "type": "categorical"},
        "y": {"column": "value", "zero": true, "grid": true},
        "year": {"column": "year", "legend": {"symbol": "rect"}, "categories": {"2024": "#9EC5E8", "2025": "#1E4F77"}},
        "lo": "lo",
        "hi": "hi"
    },
    "marks": [
        {"type": "bar", "by": "year", "dodge": true},
        {"type": "rule", "by": "year", "dodge": true, "y1": "lo", "y2": "hi", "stroke": "#333", "stroke-width": 1.5}
    ]
}
```

## A scatter plot of bubbles with labels

The size of a point is a dim on a `sqrt` scale (circle areas proportional to
the population, `zero: true` so the smallest one is not a dot), its hover is
the one of the nearest point (`"mode": "point"`, the country as its title and
the values below it). A few points have labels above them: a `label` with
`anchor: "top"`, moved up by the radius of its point (`dy`), filtered by an
expression of the row.

<!-- data/recipes/bubbles.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "scatter.csv",
    "title": "Income level and growth, 2025",
    "subtitle": "circle area: population",
    "source": "Illustrative data",
    "locale": "en",
    "height": 360,
    "dims": {
        "x": {"column": "gdp_pc", "name": "GDP per capita", "format": ",.0f", "grid": true, "axis": {"title": {"name": "GDP per capita, thousand EUR"}}},
        "y": {"column": "growth", "name": "Growth", "format": ".1f", "grid": true, "pad": 0.06, "axis": {"title": {"name": "Real GDP growth, %"}}},
        "pop": {"column": "pop", "name": "Population, m", "format": ",.1f", "zero": true, "hover": {}, "scale": {"type": "sqrt", "range": [0, 24]}},
        "country": {"column": "country", "fromData": "rows", "hover": {}}
    },
    "hover": {"mode": "point"},
    "annotations": {"type": "line", "y": 0},
    "marks": [
        {"type": "point", "by": "country", "r": "pop", "fill": "#4269D0", "fill-opacity": 0.6, "stroke": "white"},
        {"type": "label", "filter": "@country == 'Germany' or @country == 'Ireland' or @country == 'Poland'",
         "text": "@country", "anchor": "top", "dy": "=-@pop:scaled - 2", "font-size": 11}
    ]
}
```

## A donut with a control

A polar chart (`coord`) of an `arc` per source, stacked into a ring, with a
hole of an expression of the radius (`innerRadius`). The filter keeps the year
and the country of the select: `@country` is the column of the row,
`@globals.country` the global of the control.

<!-- data/recipes/donut.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "energy.csv",
    "title": "Electricity mix of {country}, 2025",
    "source": "Illustrative data",
    "locale": "en",
    "coord": "polar",
    "height": 320,
    "globals": {"country": "Austria"},
    "controls": [{"type": "select", "global": "country", "name": "Country", "values": {"column": "country"}}],
    "filter": "@country == @globals.country and @year == 2025",
    "dims": {
        "x": {"column": "twh_share", "format": ".0%", "axis": false},
        "source": {"column": "source", "legend": {}, "categories": {
            "Coal": "#5B5B5B", "Gas": "#B07AA1", "Nuclear": "#F28E2B", "Hydro": "#4E79A7", "Wind": "#76B7B2", "Solar": "#EDC948"}}
    },
    "marks": {"type": "arc", "by": "source", "stack": true, "stroke": "white", "innerRadius": "@radius * 0.55"}
}
```

## A choropleth with labels

The regions of the TopoJSON are joined to the rows by `nuts` (`geo.join`) and
filled by the scale of colors of the rate (`"fill": "rate"`). A `text` per
region at its center writes the value, centered by default, with a halo. The
legend of a dim of a continuous scale of colors is its color bar.

<!-- data/recipes/map.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "states.csv",
    "title": "Unemployment rate by state, 2025",
    "subtitle": "in %",
    "source": "Illustrative data",
    "locale": "en",
    "coord": "geo",
    "height": 320,
    "geo": {"data": "../geo/austria.json", "join": "state", "projection": {"type": "conicConformal", "parallels": [46, 49]}},
    "dims": {
        "state": "nuts",
        "rate": {"column": "rate", "name": "Unemployment rate, %", "format": ".1f", "zero": true, "legend": {}, "hover": {},
                 "scale": {"type": "sequential", "interpolator": "Blues"}}
    },
    "marks": [
        {"type": "region", "by": "state", "fill": "rate", "stroke": "white", "highlight": {"stroke": "#333"}},
        {"type": "text", "by": "state", "text": "@rate:formatted", "font-size": 11, "halo": true, "fill": "#222"}
    ]
}
```

## Lines with labels at their ends and a switch

A radio button switches the column of `y` between the values and an index of
the first year (a `transform` of `index`): the column is a `match` of the
global. A line per country has the color of its category (the categories of
the data, `country` is only its column); a text after the last point of each
line (`select: "last"`) writes the name, the texts are moved apart vertically
to at least 12 pixels (`dodge`). The right margin is measured of them.

<!-- data/recipes/lines.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "gdp.csv",
    "title": "Real GDP, 2015–2025",
    "subtitle": "{values:name}",
    "source": "Illustrative data",
    "locale": "en",
    "height": 320,
    "globals": {"values": "abs"},
    "controls": [{"type": "radio", "global": "values", "name": "Values", "inImage": false,
        "values": [{"value": "abs", "name": "bn EUR"}, {"value": "index", "name": "Index 2015 = 100"}]}],
    "transform": {"type": "index", "column": "gdp", "as": "index", "by": "country", "base": {"year": 2015}},
    "dims": {
        "x": {"column": "year", "format": "c"},
        "y": {"column": "=match(@values, {index: 'index'}, 'gdp')", "format": ",.0f", "grid": true},
        "country": "country"
    },
    "marks": [
        {"type": "line", "by": "country", "stroke-width": 2},
        {"type": "text", "by": "country", "select": "last", "dodge": 12, "dx": 6, "dominant-baseline": "middle", "text": "@name", "font-size": 11}
    ]
}
```

## Things to know

- The default locale is `de` (decimal commas, `1.234,5`): `"locale": "en"`
  for English numbers and dates.
- The categories of a vertical axis run from the top down, `reverse` puts the
  first one at the bottom; a horizontal axis runs from the left.
- The keys of an object of a `filter` are dims, not columns:
  `{"year": "@globals.year"}` needs a dim `year`; an expression names columns
  as well, `"@year == @globals.year"`.
- In expressions of rows (filters, the attributes of marks) a dim or a column
  comes before a global of the same name, `@globals.<name>` is the global.
- A dim which only names a column and groups the rows of a mark which draws
  in the colors of its categories (`by` of a line, an area, a bar, a point
  or a text without a color of its own) has the categories of the data and
  the colors of the default scheme; `"fromData": false` draws them in one
  color. The props of the categories, e.g. `@name`, come before the columns
  of the row in the attributes of a mark.
- Inside a mark only its attributes are expressions of the rows; its options
  (`type`, `by`, `curve`, ...) can be expressions of the globals, e.g.
  `"curve": "=match(@smooth, {yes: 'monotoneX'}, 'linear')"`.
- The margins are measured of the axes and of the texts of marks and
  annotations beyond the plot area (of cartesian charts); give a side only
  where the page needs a fixed one, e.g. charts aligned with each other, or
  give the sides of a house style once as css variables
  (`--gen-vis-margin-left`).
- The DOM names of 5.0: the group of a mark is `g.vis-mark` with
  `data-mark` (its id, `mark-<index>` by default), the cells of the hover
  and the axes have `data-dim`.
- `gen-vis check def.json` checks a definition with its data (the schema
  and `validateDef`), `gen-vis export` prints the same warnings before it
  draws.
