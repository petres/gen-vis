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
the bars (`"symbol": "rect"`), not the rule through them. The bounds are
in the hover by `columns` (the ends of ranges are not by default).

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
        "y": {"column": "value", "name": "share", "zero": true, "grid": true},
        "year": {"column": "year", "legend": {"symbol": "rect"}, "categories": {"2024": "#9EC5E8", "2025": "#1E4F77"}},
        "lo": {"column": "lo", "name": "lower"},
        "hi": {"column": "hi", "name": "upper"}
    },
    "hover": {"columns": ["year", "lo", "hi"]},
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

## A box plot

The quartiles and the median of the earnings of every sector are columns
of its rows (`aggregate` with `q1`, `median` and `q3` by `sector`), the
whiskers end at the least and the largest value within 1.5 times the
interquartile range of the box (a `calc` of the values inside, their `min`
and `max`), the values outside are the outliers. Every mark but the
outliers draws one row per sector (`by` the dim `x`, `select: "first"`):
the whisker a `rule` from `lo` to `hi`, its caps and the median `tick`s
across the band (`size` a share of it), the box a `bar` from `q1` (`y0`) to
`q3`. The sectors are in the order of their medians (`scale.order`); the
hover of the nearest point (`"mode": "point"`) shows its value and the
quartiles of its sector.

<!-- data/recipes/boxplot.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "wages.csv",
    "title": "Gross hourly earnings by sector",
    "subtitle": "in EUR, box: quartiles, whiskers: 1.5 times the interquartile range",
    "source": "Illustrative data",
    "locale": "en",
    "height": 340,
    "transform": [
        {"type": "aggregate", "column": "wage", "by": "sector", "op": "q1", "as": "q1"},
        {"type": "aggregate", "column": "wage", "by": "sector", "op": "median", "as": "median"},
        {"type": "aggregate", "column": "wage", "by": "sector", "op": "q3", "as": "q3"},
        {"type": "calc", "as": "inner", "expr": "=@q1 - 1.5 * (@q3 - @q1) <= @wage <= @q3 + 1.5 * (@q3 - @q1) ? @wage : null"},
        {"type": "aggregate", "column": "inner", "by": "sector", "op": "min", "as": "lo"},
        {"type": "aggregate", "column": "inner", "by": "sector", "op": "max", "as": "hi"}
    ],
    "dims": {
        "x": {"column": "sector", "type": "categorical", "scale": {"order": {"by": "median"}, "padding": 0.4}},
        "y": {"column": "wage", "name": "Hourly earnings", "format": ",.2f", "zero": true, "grid": true, "axis": {"format": ",.0f"}},
        "q1": {"column": "q1", "name": "Lower quartile", "format": ",.2f"},
        "median": {"column": "median", "name": "Median", "format": ",.2f"},
        "q3": {"column": "q3", "name": "Upper quartile", "format": ",.2f"}
    },
    "hover": {"mode": "point", "columns": ["q1", "median", "q3"]},
    "marks": [
        {"type": "rule", "by": "x", "select": "first", "y1": "lo", "y2": "hi", "stroke": "#5F6670"},
        {"type": "tick", "by": "x", "select": "first", "y": "lo", "size": 0.4, "stroke": "#5F6670"},
        {"type": "tick", "by": "x", "select": "first", "y": "hi", "size": 0.4, "stroke": "#5F6670"},
        {"type": "bar", "by": "x", "select": "first", "y": "q3", "y0": "q1", "fill": "#BBD7EE", "stroke": "#1E4F77"},
        {"type": "tick", "by": "x", "select": "first", "y": "median", "stroke": "#1E4F77", "stroke-width": 2.5},
        {"type": "point", "filter": "@inner == null", "r": 2.5, "fill": "none", "stroke": "#1E4F77"}
    ]
}
```

## A scatter plot with trend lines

A `regression` of the change of the unemployment rate on the growth per
country writes the fitted value of every row (`trend`), a `line` of it per
country draws the trend through the range of the growth of the country
(Okun's law: the steeper the line, the more unemployment follows the
cycle). `method` fits other curves (`log`, `exp`, `poly`). The hover of the
nearest point has a crosshair (`cross`) through it, its title is the
country of the point.

<!-- data/recipes/trend.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "okun.csv",
    "title": "Growth and unemployment, 2001–2024",
    "subtitle": "change of the unemployment rate against real GDP growth, with linear trends",
    "source": "Illustrative data",
    "locale": "en",
    "height": 380,
    "transform": {"type": "regression", "column": "unemp_change", "x": "growth", "by": "country", "as": "trend"},
    "dims": {
        "x": {"column": "growth", "name": "GDP growth", "format": ".1f", "grid": true, "axis": {"format": ".1~f", "title": {"name": "Real GDP growth, %"}}},
        "y": {"column": "unemp_change", "name": "Change of unemployment", "format": "+.1f", "grid": true, "axis": {"format": "+.1~f", "title": {"name": "Change of the unemployment rate, pp"}}},
        "country": {"column": "country", "legend": {}, "categories": {"Austria": "#C3423F", "Germany": "#5B5B5B", "Spain": "#E6A000"}},
        "year": {"column": "year", "format": "c"}
    },
    "hover": {"mode": "point", "cross": true, "columns": ["country", "year"]},
    "annotations": [{"type": "line", "x": 0}, {"type": "line", "y": 0}],
    "marks": [
        {"type": "point", "by": "country", "r": 3.5, "fill-opacity": 0.55, "stroke": "white", "stroke-width": 0.5},
        {"type": "line", "by": "country", "y": "trend", "stroke-width": 2}
    ]
}
```

## A forecast with a confidence band

An `area` from `lo` (`y0`) to `hi` (`y`) draws the interval of the forecast,
the rows without bounds (the outcomes) are gaps of it; the outcome and the
forecast are two `line`s of two columns, the last outcome is the first row
of the forecast, so they meet. A `band` annotation marks the period of the
forecast. The bounds are columns of the data here; a `regression` or an
`aggregate` of quantiles (`q1`, `q3`, `quantile`) computes them of the
rows.

<!-- data/recipes/band.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "inflation.csv",
    "title": "Inflation, outcome and forecast",
    "subtitle": "change of consumer prices to the year before in %, the forecast with its 80% interval",
    "source": "Illustrative data",
    "locale": "en",
    "height": 320,
    "dims": {
        "x": {"column": "date", "type": "date", "format": "%b %Y", "axis": {"format": "%Y"}},
        "y": {"column": "value", "name": "Inflation", "format": ".1f", "zero": true, "grid": true, "axis": {"format": ".0f"}},
        "forecast": {"column": "forecast", "name": "Forecast", "format": ".1f"},
        "lo": {"column": "lo", "name": "Lower bound", "format": ".1f"},
        "hi": {"column": "hi", "name": "Upper bound", "format": ".1f"}
    },
    "hover": {"columns": ["forecast", "lo", "hi"]},
    "annotations": {"type": "band", "x": ["2025-09-01", null], "label": "Forecast"},
    "marks": [
        {"type": "area", "y": "hi", "y0": "lo", "fill": "#1E4F77", "fill-opacity": 0.18},
        {"type": "line", "y": "forecast", "stroke": "#1E4F77", "stroke-width": 2, "stroke-dasharray": "5 3"},
        {"type": "line", "stroke": "#1E4F77", "stroke-width": 2.5}
    ]
}
```

## A waterfall

The bars of the contributions start where the one before ends: the
`cumulative` sum of the contributions is the end of each bar, the end of
the bar before (a `window` of `lag`) its start, the total starts at 0. A
`bar` with `y0` draws them from `from` to `to`, its color of a dim of the
sign (`fill`), a `rule` from the end of each bar to the start of the next
one (pixels of the band: `@x:scaled + @x:bandwidth` to `@x:scaled +
@x:step`) connects them, a `label` above each bar writes its contribution
with its sign.

<!-- data/recipes/waterfall.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "contributions.csv",
    "title": "Contributions to real GDP growth, 2025",
    "subtitle": "in percentage points",
    "source": "Illustrative data",
    "locale": "en",
    "height": 320,
    "transform": [
        {"type": "calc", "as": "delta", "expr": "=@total == 'yes' ? null : @value"},
        {"type": "cumulative", "column": "delta", "as": "end"},
        {"type": "window", "column": "end", "op": "lag", "as": "start"},
        {"type": "calc", "as": "from", "expr": "=@total == 'yes' ? 0 : (@start or 0)"},
        {"type": "calc", "as": "to", "expr": "=@total == 'yes' ? @value : @end"},
        {"type": "calc", "as": "top", "expr": "=max(@from, @to)"},
        {"type": "calc", "as": "sign", "expr": "=@total == 'yes' ? 'Total' : (@value < 0 ? 'Decrease' : 'Increase')"}
    ],
    "dims": {
        "x": {"column": "component", "type": "categorical", "order": "rows", "scale": {"padding": 0.25}},
        "y": {"column": "to", "format": ".1f", "grid": true},
        "sign": {"column": "sign", "legend": {"symbol": "rect"}, "categories": {"Increase": "#4B9847", "Decrease": "#C3423F", "Total": "#1E4F77"}},
        "value": {"column": "value", "name": "Contribution", "format": "+.1f"}
    },
    "hover": {"value": false, "columns": ["value"]},
    "annotations": {"type": "line", "y": 0},
    "marks": [
        {"type": "bar", "y0": "from", "fill": "sign"},
        {"type": "rule", "filter": "@total != 'yes'", "y": "end", "x1": "=@x:scaled + @x:bandwidth", "x2": "=@x:scaled + @x:step",
         "stroke": "#5F6670", "stroke-dasharray": "2 2"},
        {"type": "label", "y": "top", "anchor": "top", "text": "=format(@value, '+.1f')", "font-size": 11}
    ]
}
```

## A lollipop chart

A `rule` from 0 (`x1`, a number on the scale of x) to the value (`x2`) at
the band of every country (`"y": "y"`) and a `point` at its end; the fill
of the points is an expression of the row, one country stands out. The
countries are in the order of their values, the labels after the points
(`dx` beyond the radius).

<!-- data/recipes/lollipop.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "rd.csv",
    "title": "Spending on research and development, 2023",
    "subtitle": "in % of GDP",
    "source": "Illustrative data",
    "locale": "en",
    "height": 420,
    "dims": {
        "x": {"column": "rd", "name": "R&D", "format": ".1f", "zero": true, "grid": true},
        "y": {"column": "country", "scale": {"order": {"by": "x", "descending": true}}}
    },
    "marks": [
        {"type": "rule", "y": "y", "x1": 0, "x2": "x", "stroke": "#9AA0A8", "stroke-width": 1.5},
        {"type": "point", "r": 5, "fill": "=@y == 'Austria' ? '#C3423F' : '#1E4F77'"},
        {"type": "label", "text": "@x:formatted", "anchor": "end", "dx": 9, "font-size": 11}
    ]
}
```

## A dumbbell chart

The two values of every country are rows of the data (`sex`), their least
and largest one are columns of every row of the country (`aggregate` with
`min` and `max`), so a `rule` of one row per country (`select: "first"`)
connects them; the points are the rows in the colors of their category, a
label after the larger one writes the gap. The countries are in the order
of the gap (`scale.order` by a dim of it).

<!-- data/recipes/dumbbell.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "employment.csv",
    "title": "Employment rate of women and men, 2024",
    "subtitle": "in % of the population aged 20–64, sorted by the gap",
    "source": "Illustrative data",
    "locale": "en",
    "height": 340,
    "transform": [
        {"type": "aggregate", "column": "rate", "by": "country", "op": "min", "as": "lo"},
        {"type": "aggregate", "column": "rate", "by": "country", "op": "max", "as": "hi"},
        {"type": "calc", "as": "gap", "expr": "=@hi - @lo"}
    ],
    "dims": {
        "x": {"column": "rate", "name": "Employment rate", "format": ".1f", "grid": true, "pad": 0.05, "axis": {"format": ".0f"}},
        "y": {"column": "country", "scale": {"order": {"by": "gap"}}},
        "sex": {"column": "sex", "legend": {"symbol": "circle"}, "categories": {"Women": "#C3423F", "Men": "#1E4F77"}},
        "gap": {"column": "gap", "name": "Gap, pp", "format": ".1f"}
    },
    "hover": {"columns": ["sex", "gap"]},
    "marks": [
        {"type": "rule", "by": "y", "select": "first", "y": "y", "x1": "lo", "x2": "hi", "stroke": "#BFC4CA", "stroke-width": 3},
        {"type": "point", "by": "sex", "r": 5.5, "stroke": "white", "stroke-width": 1},
        {"type": "label", "by": "y", "select": "first", "x": "hi", "anchor": "end", "dx": 10, "text": "=format(@gap, '+.1f')", "font-size": 11, "fill": "#5F6670"}
    ]
}
```

## A slope chart

Two years as the categories of `x` (a point scale without padding: the
lines span the plot), a line per country, colored by a dim of the
direction of its change (a `window` of `diff` to the year before, its
`max` per country is the change of every row of the country, a `calc` of
its sign). The labels at the ends are texts of the first and the last row
of each line (`select`), moved apart (`dodge`); the axis of the values is
left out, the labels are the values.

<!-- data/recipes/slope.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "slope.csv",
    "title": "Unemployment rate, 2015 and 2025",
    "subtitle": "in % of the labour force, rising in red",
    "source": "Illustrative data",
    "locale": "en",
    "height": 420,
    "width": 520,
    "transform": [
        {"type": "window", "column": "rate", "by": "country", "order": "year", "op": "diff", "as": "diff"},
        {"type": "aggregate", "column": "diff", "by": "country", "op": "max", "as": "change"},
        {"type": "calc", "as": "trend", "expr": "=@change > 0 ? 'rising' : 'falling'"}
    ],
    "dims": {
        "x": {"column": "year", "type": "categorical", "scale": {"padding": 0}, "axis": {"position": "top", "tickMarks": false}},
        "y": {"column": "rate", "name": "Unemployment rate", "format": ".1f", "axis": false},
        "country": "country",
        "trend": {"column": "trend", "categories": {"falling": "#7A8794", "rising": "#C3423F"}}
    },
    "hover": {"columns": ["country"]},
    "marks": [
        {"type": "line", "by": ["country", "trend"], "stroke-width": 2, "highlight": {"stroke-width": 3.5}},
        {"type": "point", "by": ["country", "trend"], "r": 3.5},
        {"type": "text", "by": ["country", "trend"], "select": "last", "dodge": 13, "dx": 8, "dominant-baseline": "middle", "text": "=cat(@country, '  ', format(@y, '.1f'))", "font-size": 11},
        {"type": "text", "by": ["country", "trend"], "select": "first", "dodge": 13, "dx": -8, "dominant-baseline": "middle", "text-anchor": "end", "text": "=format(@y, '.1f')", "font-size": 11}
    ]
}
```

## A bullet chart

Horizontal bars of the ranges, the largest one first (the lightest, from
the least value of the EU to the largest one), a thinner bar of the value
(its `height` a share of the band, centered) and a `tick` of the target
across 70% of the band (`size`). The ranges, the target and the value are
columns of a row per indicator, the dims of the bars on the scale of x.

<!-- data/recipes/bullet.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "targets.csv",
    "title": "Austria and its targets for 2030",
    "subtitle": "in %; bands: the least, the average and the largest value of the EU, line: the target",
    "source": "Illustrative data",
    "locale": "en",
    "height": 260,
    "dims": {
        "x": {"column": "value", "name": "Austria", "format": ".1f", "zero": true, "grid": true, "axis": {"format": ".0f"}},
        "y": {"column": "indicator", "scale": {"padding": 0.3}},
        "target": {"column": "target", "name": "Target", "format": ".1f"},
        "low": {"column": "low", "name": "EU least"},
        "mid": {"column": "mid", "name": "EU average"},
        "high": {"column": "high", "name": "EU largest"}
    },
    "hover": {"columns": ["target", "low", "mid", "high"]},
    "marks": [
        {"type": "bar", "x": "high", "fill": "#E8EBEE"},
        {"type": "bar", "x": "mid", "fill": "#D3D8DD"},
        {"type": "bar", "x": "low", "fill": "#BCC3CA"},
        {"type": "bar", "fill": "#1E4F77", "height": "=@y:bandwidth * 0.35"},
        {"type": "tick", "x": "target", "size": 0.7, "stroke": "#C3423F", "stroke-width": 2.5}
    ]
}
```

## A calendar heatmap

A cell per day: the week of the year (`%W`, weeks from Monday) and the
weekday (`%u`, 1 is Monday) of the date are columns of a `format`
transform, the dims of the bands of `x` and `y`. The weekdays are listed
categories with their names (the labels of the axis are the `@name` of the
category), the months are labels of fixed ticks at the weeks of their first
days. The hover of a cell is titled by the date (`title` of the template
of the nearest row, the date without a cell of its own).

<!-- data/recipes/calendar.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "prices.csv",
    "title": "Electricity prices, 2025",
    "subtitle": "day-ahead price per day, EUR/MWh",
    "source": "Illustrative data",
    "locale": "en",
    "height": 220,
    "transform": [
        {"type": "format", "column": "date", "format": "%W", "as": "week"},
        {"type": "format", "column": "date", "format": "%u", "as": "weekday"}
    ],
    "dims": {
        "x": {"column": "week", "type": "categorical", "axis": {"tickMarks": false, "domain": {"props": {"stroke": "none"}}, "values": ["00", "04", "08", "13", "17", "21", "26", "30", "35", "39", "43", "48"],
            "labels": {"props": {"text": "=match(@x, {'00': 'Jan', '04': 'Feb', '08': 'Mar', '13': 'Apr', '17': 'May', '21': 'Jun', '26': 'Jul', '30': 'Aug', '35': 'Sep', '39': 'Oct', '43': 'Nov', '48': 'Dec'})", "text-anchor": "start"}}}},
        "y": {"column": "weekday", "type": "categorical", "axis": {"tickMarks": false, "domain": {"props": {"stroke": "none"}}, "labels": {"props": {"text": "@name"}}}, "categories": {
            "1": {"name": "Mon"}, "2": {"name": "Tue"}, "3": {"name": "Wed"}, "4": {"name": "Thu"}, "5": {"name": "Fri"}, "6": {"name": "Sat"}, "7": {"name": "Sun"}}},
        "price": {"column": "price", "name": "Price", "format": ",.0f", "legend": {}, "scale": {"type": "sequential", "interpolator": "YlOrRd"}},
        "date": {"column": "date", "type": "date", "format": "%a, %-d %b %Y", "hover": {"cell": false}}
    },
    "hover": {"mode": "point", "value": false, "columns": ["date", "price"], "title": "{date}"},
    "marks": {"type": "cell", "fill": "price", "stroke": "white", "stroke-width": 1.5}
}
```

## A diverging stacked bar of a survey

The answers which disagree are negative values, the ones which agree
positive ones, the neutral ones are split in half around the middle: a
`calc` of each side and a `fold` of the two give the neutral answers a row
on each side (the rows without a part are filtered out). A `"diverging"`
stack runs through the answers in their order from the left end to the
right one: the negative values are stacked in the reverse order, so the
neutral answers meet in the middle and the strong ones are outside. The
labels of the axis are the shares without their sign, the hover shows each
answer once (`filter`).

<!-- data/recipes/likert.json -->
```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "likert.csv",
    "title": "Business expectations for the next 12 months",
    "subtitle": "share of the answers of firms, the neutral ones split around the middle",
    "source": "Illustrative data",
    "locale": "en",
    "height": 300,
    "transform": [
        {"type": "calc", "as": "left", "expr": "=match(@answer, {'Strongly disagree': -@share, 'Disagree': -@share, 'Neutral': -@share / 2})"},
        {"type": "calc", "as": "right", "expr": "=match(@answer, {'Strongly agree': @share, 'Agree': @share, 'Neutral': @share / 2})"},
        {"type": "fold", "columns": ["left", "right"], "key": "side", "value": "part"},
        {"type": "filter", "expr": "@part != null"}
    ],
    "dims": {
        "x": {"column": "part", "format": ".0%", "grid": true, "axis": {"labels": {"props": {"text": "=format(max(@x, -@x), '.0%')"}}}},
        "y": {"column": "statement", "type": "categorical", "order": "rows"},
        "answer": {"column": "answer", "legend": {"symbol": "rect"}, "categories": {
            "Strongly disagree": "#C3423F", "Disagree": "#E8A09A", "Neutral": "#D3D8DD", "Agree": "#9EC5E8", "Strongly agree": "#1E4F77"}},
        "share": {"column": "share", "name": "Share", "format": ".0%"}
    },
    "hover": {"value": false, "columns": ["answer", "share"], "filter": "@side == 'right' or @answer != 'Neutral'"},
    "annotations": {"type": "line", "x": 0, "layer": "above", "props": {"stroke": "#5F6670"}},
    "marks": {"type": "bar", "by": "answer", "stack": "diverging", "stroke": "white", "stroke-width": 0.5}
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
