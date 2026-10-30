# Geometries of the example maps

`austria.json` and `europe.json` are TopoJSON built from the GISCO data of
Eurostat, © EuroGeographics for the administrative boundaries, see the
[terms of use](https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units).
`world.json` is the one of [world-atlas](https://github.com/topojson/world-atlas)
(`countries-110m.json`, version 2.0.2) of [Natural Earth](https://www.naturalearthdata.com)
(public domain).

- `austria.json`: the nine Bundesländer (NUTS 2 2021, 1:3 million), object
  `states`, the ids are the NUTS codes, the properties `name` and `code`, the
  abbreviation of the data of `sprit-nuts`, e.g. `W`.
- `europe.json`: the countries (2020, 1:20 million), clipped to Europe
  (25° W to 75° E, 30° N to 75° N, e.g. without overseas departments), object
  `countries`, the ids are ISO codes, but `UK`, the property `name`.
- `austria-districts.json`: the political districts of Austria of Statistik
  Austria ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), 1
  January 2026), objects `districts` (ids of the districts, property `NAME`)
  and `states`, simplified along their shared arcs, the one of the energy
  dashboard of WIFO.
- `world.json`: the countries (1:110 million), object `countries`, the ids
  are ISO codes of two letters (Kosovo, Northern Cyprus and Somaliland
  without one), French Guiana (`GF`) and Svalbard (`SJ`) are features of
  their own, not parts of France and Norway, the property `name`, small
  countries are missing, e.g. Malta.

All are simplified and quantized, they are for maps of the size of a page.
