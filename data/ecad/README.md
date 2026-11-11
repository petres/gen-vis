# Charts of ecad.abteil.org

The charts of a station of [ecad.abteil.org](https://ecad.abteil.org/)
(`~/Projects/ecad`, `front/src/charts/`) drawn with gen-vis, the data of
Wien Hohe Warte (station 16) of its api (`/api/d/station/16/type/{tg,rr}/format/csv`
and `/api/y/...`, October 2026), the values in tenths of °C and mm as there,
the daily data from 1951 on as parquet (`16-tg-d.parquet`, `16-rr-d.parquet`,
the columns of the api: `date`, `value`, `avg7`, `avg15`, `avg31`,
`avg365`), the yearly data as csv. The data are the ones of
[ECA&D](https://www.ecad.eu/), see its data policy.

- `polar-tg.json`, `polar-rr.json` (`_polar.json`, the component `Polar.vue`):
  the days of a year around the circle (`align`, January at the top), a
  line per year in gray, the selected year in black, the mean of the day of
  all years in green (`mean` by the day), the band between the year and the
  mean red above it and cyan below it (`calc` with `max` and `min`, the
  columns on the scale of the values, `"scale": {"of": "y"}`), absolute or
  relative to the mean (the globals of the entries of a control), the
  mean of a year, a month, two weeks, a week or the day (the columns of the
  api), the hover of the day of the selected year in the center
- `year-tg.json`, `year-rr.json` (`_year.json`, `LineYear.vue`): the means
  of the years, the mean of all years in green, the selected year (a line
  of the global)
- `list-tg.json` (`LineYearSimple.vue`, the list of the stations): the years
  since 1959, the means of 1961–1990 and 1991–2020 (`mean` of a `base` of
  at least 22 years) as lines over their bands with their values

Other than on the page the year is chosen by a control (on the page by
the yearly chart, a page links the charts by the events `select` and `hover`
and the props `globals` and `highlight`), the names of the months of the
lower half are not upside down and the values of the radius are only on
the upper half.
