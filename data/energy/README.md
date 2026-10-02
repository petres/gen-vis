# Examples of the energy dashboard

A selection of the definitions of the energy dashboard of WIFO, copied with
their data (October 2026), the ones of special plot types or uses:

- `weather/temperature.json`: years as lines of a common year, the averages of
  periods dashed, `weather/temperature-polar.json` the same around a circle
- `weather/hdd.json`: daily and cumulated values in two facets
- `fossil/supply.json`, `fossil/supply-stacked.json`: the unit and the share
  switched by column templates of globals, stacked bars
- `electricity/generation-hourly.json`: hourly stacked bars
- `mobility/registrations.json`: six mixins, e.g. a toggle of the facets
- `mobility/traffic.json`: a timeline, the data only of the total
- `oil/fuel-prices-map.json`, `electricity/generation-map.json`: maps of
  Europe, the dashboard draws them with a component of its own

The mixins (`_*.json`) are the ones of the dashboard. The sources of the data
are in the footers of the definitions.
