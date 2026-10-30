# Examples of the energy dashboard

A selection of the definitions of the energy dashboard of WIFO, copied with
their data (October 2026), the ones of special plot types or uses:

- `weather/temperature.json`: years as lines of a common year, the averages of
  periods dashed, `weather/temperature-polar.json` the same around a circle
- `weather/hdd.json`: daily and cumulated values in two facets
- `fossil/supply.json`, `fossil/supply-stacked.json`: the unit and the share
  switched by column templates of globals, stacked bars
- `electricity/generation-hourly.json`: the hours of a day as stacked areas
  (stacked bars in the dashboard), the names in the areas at their thickest
  hour (`select` of the max, `@y:mid:scaled`), a line at noon, fewer hours of
  the axis on a phone (`axis.values` of `totalWidth`)
- `mobility/registrations.json`: six mixins, e.g. a toggle of the facets
- `mobility/traffic.json`: a timeline, the data only of the total
- `oil/fuel-prices-map.json`, `electricity/generation-map.json`: maps of
  Europe, the dashboard draws them with a component of its own
- `climate/map-temperature.json`: the districts of Austria with the borders of
  the states (`geo:mesh`), a diverging scale of the anomaly or the mean,
  patched by a form element, a slider over the years (the data of the two
  indicators of the map)
- `mobility/cars-map.json`: a map of Europe with three form elements, the
  data, the fuel and the year, a scale of colors of square roots
- `economy/price-index.json`: a log scale, a slider of the base year (a
  column per base year in the data)
- `emissions/estimate.json`: the estimate as lines, the inventory as points,
  in facets which the legend shows and hides, separate or shared scales
- `electricity/load-countries.json`: years as lines of a common year in a
  facet per country, the legend shows and hides the facets (15 of the 38
  countries of the dashboard, `year` and `date20` are transforms of `date`
  here, they are columns of the data of the dashboard)

The mixins (`_*.json`) are the ones of the dashboard, the geometries of the
maps are the ones of `data/geo/` (`_europe-map.json` with the countries of
the one of the dashboard), the entries of form elements patch the mappings
with `patch` (3.0). The sources of the data
are in the footers of the definitions.
