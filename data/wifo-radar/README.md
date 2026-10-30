# The radar of competitiveness of WIFO

The radar of the page
[Radar der Wettbewerbsfähigkeit](https://www.wifo.ac.at/forschung/themenplattformen/wettbewerbsfaehigkeit/radar-der-wettbewerbsfaehigkeit/)
of WIFO (the element `competitionRadarChart`) drawn with gen-vis, the data
of its script (`competition-radar-chart/full.test.de.js` of
data-science.wifo.ac.at, October 2026): the percentile ranks of the indicators
of 31 countries from 1995 to 2024, the share of the countries with the same or
worse values, a higher rank is a higher competitiveness.

- `values.csv`: `year`, `country` (the code), `indicator`, `value` (the
  percentile rank in %), `indicators.csv`: the German names, definitions and
  sources of the main indicators (`H1` to `H12`) and the supplementary ones
  (`E1` to `E12`), their `group` and their `order`, `countries.csv`: the
  German names of the countries, the transforms look them up (`lookup`)
- `radar-countries.json` (`_radar.json`): the comparison of countries, a
  year of the slider, the countries of the legend beside the radar (Austria
  and Germany at first, the colors of the page), a polygon, an area and the
  points per country (`linearClosed`), the first indicator at the top
  (`"padding": 0` of the point scale of the angle), the main or the
  supplementary indicators (a radio of the globals, a filter of the group)
- `radar-years.json`: the comparison of the years of a country of the
  select, the years of the legend below the radar
- the hover of an indicator shows its definition and source in its title
  (the names of the nearest row) and the values of the countries or years

Other than on the page the two comparisons are two definitions (the form
elements are different ones) and the definition is in the hover of the
angle of the indicator, not of its label.
