# Geometries of the example maps

TopoJSON built from the GISCO data of Eurostat, © EuroGeographics for the
administrative boundaries, see the
[terms of use](https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units).

- `austria.json`: the nine Bundesländer (NUTS 2 2021, 1:3 million), object
  `states`, the ids are the NUTS codes, the properties `name` and `code`, the
  abbreviation of the data of `sprit-nuts`, e.g. `W`.
- `europe.json`: the countries (2020, 1:20 million), clipped to Europe
  (25° W to 75° E, 30° N to 75° N, e.g. without overseas departments), object
  `countries`, the ids are ISO codes, but `UK`, the property `name`.

Both are simplified and quantized, they are for maps of the size of a page.
