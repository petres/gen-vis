# To do: speed and size

The numbers and how they were measured are in [../improvements-5.0.md](../improvements-5.0.md) and in
the CHANGELOG ("Fixes and features of the outside review"). The first load is about 106 kB gzip in
two requests; a small chart mounts in 26–45 ms cold and 5–9 ms warm in headless Chromium. A chart is
slow because of its data, not because of its drawing.

The bar: a change must not make the first load bigger or the mount slower, unless it pays for it.

## Size

- **The hover loaded with the first pointer or key event** (`comp/facet-hover.js`, `comp/hover.js`,
  `coords/hover.js`). Measured with a stub: −4.9 kB gzip, −3.1 % of the cold mount. A real version
  keeps a small proxy which takes the first event. (Medium.)
- **The entry is only a re-export of the hashed base chunk** (`gen-vis.js`): the entry as the base,
  or a stable name of the base for `modulepreload`, saves one more round trip of every first load.
  Not tried. (Small to medium, changes the file names of the build.)
- **The Vue adapter as an entry of its own** (`src/lib.js`): −0.8 kB gzip. Breaks pages which import
  `vuePlugin` from `gen-vis.js`.
- About a quarter of the base is d3. The size of 4.1 (79.8 kB) is not in reach without dropping
  features.

## Speed

- **The first measure of the charts of a page in one pass**: all charts which become ready together
  measure first and draw afterwards (one scheduler of the module). Today every chart reads its width
  after the one before wrote its SVG, one forced layout each: up to −13 % if a page mounts many
  charts at once. (Medium.)
- **Large data: filter before converting** (`prepareData` of `utils/data.js` is about 80 of 112 ms
  warm of 252 000 rows). Tuning the loop gave nothing; the gain needs the data in columns, see
  [architecture.md](architecture.md).
- **`layout` builds all facets twice with automatic margins** and runs the marks of texts once more
  per layout (`textBoxes`).
