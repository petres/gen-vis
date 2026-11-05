# Static export

The static export makes images of a chart for documents: `exportSvg` is
the SVG of a chart in the browser, the [export page](#export-page) draws
charts for programs outside the browser and the [CLI](#cli) (`gen-vis
export`) writes SVG, PNG and PDF files of definition files at a physical
size, e.g. 16cm wide with texts of 8pt for Word.

## `exportSvg`

`exportSvg(options)` (a method of the visualisation as `exportPng`, also of
a ref of the component) returns the SVG of the image (a string): the copy
of the [PNG](usage.md#png) (the width of `imageWidth`, the selection below the
subtitle, without the form elements and the buttons) as one SVG of its own,
made for Word, LaTeX (through a PDF) and editors, which draw SVG but no
HTML and no CSS:

- the texts of the HTML (the title, the subtitle, the legends, the footer)
  are `<text>` elements at the positions the browser drew them, one per
  line, the texts stay texts (editable, in the fonts of the computer which
  opens it, e.g. Inter), backgrounds and borders are `<rect>` and
  `<line>` elements;
- the svg elements of the plots are copied with their styles as
  presentation attributes: no `foreignObject`, no `<style>`, no `class`
  and `style` attributes, no css variables (`var()`), no images, no fonts
  of its own;
- colors are hex colors with opacities of their own (`fill-opacity`, no
  `rgba()`, also of `oklch()` and `color()` in sRGB), lengths have no
  units (also no `em` of the texts, e.g. the `dy` of the ticks), an `href`
  is also an `xlink:href` (SVG 1.1, e.g. of the labels along a path of
  the polar charts), the baselines of CSS
  (`dominant-baseline`) are offsets of the texts, halos of labels
  (`paint-order`) two texts, nested svg elements groups (with a clip only
  where their content overflows them, e.g. a map).

The options:

| Option | Description |
|--------|-------------|
| `parts` | the parts of the image, some of `title`, `subtitle`, `selection` (the line of the form elements), `legend`, `plot` and `footer`, by default all; the image is cropped to them: the full width, the height from the first to the last part with the space of the image (15 pixels) above and below, e.g. `["legend", "plot"]` of a document which has the title in its text |
| `unit` | the unit of the attributes `width` and `height`: `px` (default), `cm`, `mm` or `in` (a CSS pixel is 1/96 in), the `viewBox` is in CSS pixels |
| `background` | a CSS color of the background, `null` none, by default the one of the PNG (`--gen-vis-background` or white) |

```js
const svg = await vis.exportSvg({ parts: ['legend', 'plot'], unit: 'cm' });
```

The prop `svg` adds a button which saves it (`exportSvg()` with the
defaults, the name of the file is the one of `svg` or the title). The
composer of the SVG is a part of its own, loaded with the first SVG (~4.5
kB gzipped), not with the chart.

Not drawn: shadows, gradients of CSS (their first color), images, rotated
HTML texts. Word imports the SVG as a picture (with a PNG of it for old
versions), "Convert to shape" of Word 365 makes its parts editable.

## Export page

For programs outside the browser (the CLI below, wrappers of Python or R),
`dist-lib/export.html` (built by `npm run lib`, in the package
`@preschen/gen-vis/export.html`, it loads `esm/export.js` next to it) is a
page which draws a chart at exactly the size asked for and returns its SVG
and the rectangle of its image in the page, so the program takes a
screenshot of it (PNG) or prints the SVG (PDF). A wrapper drives a headless
Chromium (Chrome, Edge) through the DevTools protocol (CDP), e.g. with
Playwright, `chromote` of R or a client of its own:

1. Open `export.html` from a server or from an origin whose requests the
   program answers (`Fetch.enable` of CDP, a route of Playwright), not as
   `file://` (modules need http). After the `load` event
   `window.genVisExport` is a function and `window.genVisExport.version`
   the version of the protocol (`1`).
2. Call `await window.genVisExport(options)` (CDP: `Runtime.evaluate` with
   `awaitPromise: true` and `returnByValue: true`), one chart at a time,
   each call removes the chart before. It resolves with the result below or
   rejects with an `Error` whose `message` is the message of gen-vis, e.g.
   `Unknown plot type 'nope'`; of CDP, evaluate
   `genVisExport(o).then(r => ({ result: r }), e => ({ error: e.message }))`.
   A page in the background draws no frames: the page is the one in front
   (`Page.bringToFront`) while it runs.
   Each call loads its files fresh (the definition, its parents, data,
   geometries; `resolve` too), so a page can stay open for many charts and
   callers: a file changed since the call before is drawn as it is now.
   Within one call each file is loaded once. Only the browser's own HTTP
   cache can still return an old file: a server whose files change answers
   with `Cache-Control: no-store` (the CLI does).
3. PNG: `Page.captureScreenshot` with `clip` = `box` and its `scale` (pixels
   per CSS pixel, e.g. 300 dpi = 300/96 = 3.125) and
   `captureBeyondViewport: true`, of a page with a transparent default
   background (`Emulation.setDefaultBackgroundColorOverride` of a color of
   alpha 0), the image has its own (`background`).
4. PDF: print the SVG in a page with only it (`@page { margin: 0 }`,
   `html, body { margin: 0 }`, `svg { display: block }`) with
   `Page.printToPDF`, margins 0, `printBackground: true`, `paperWidth` and
   `paperHeight` the size of the image in inches (CSS pixels / 96), so the
   PDF is the drawing of the SVG and its texts stay texts. The browser
   rounds the size of the page (e.g. 16.02cm of 16cm).
5. SVG: `svg` of the result as it is (a file of it begins with
   `<?xml version="1.0" encoding="UTF-8"?>`).

The options (one of `def` and `defUrl` is needed, the others are optional,
unknown ones are an error):

| Option | Description |
|--------|-------------|
| `def` | the definition, an object or a JSON string, its urls are relative to `baseUrl` (otherwise to the page) |
| `defUrl` | the url of the definition, it loads its data and parents relative to it |
| `data` | the data instead of the one of the definition: rows, a CSV or JSON text, or bytes (e.g. parquet) as `{ "base64": "..." }` |
| `dataUrl` | the url of the data instead of the one of the definition (parquet by its content) |
| `baseUrl` | the url of the relative urls of `def` (a `<base>` of the page) |
| `width` | the width of the whole image (with its padding): a number of CSS pixels (`800`, the default), `"800px"`, `"16cm"`, `"160mm"`, `"6in"` or `"480pt"`; the chart is laid out at exactly that width, nothing is scaled afterwards, so 8pt in it is 8pt in a document |
| `padding` | the space around the chart in CSS pixels, 0 or more, default 15 (the one of the PNG) |
| `unit` | the unit of the size of the SVG (`px`, `cm`, `mm`, `in`), default the one of `width` (`px` of `pt`); a width of `"16cm"` is the attribute `width="16cm"` |
| `css` | a stylesheet or a list of them: a text with a `{` is CSS, others are urls (loaded before the chart is drawn) |
| `classes` | a class or a list of classes of the element of the chart (`.vis-outer`), e.g. of a theme of `css` |
| `globals` | the globals, see [globals](definition.md#formelements-and-globals) |
| `state` | the state, see [state](usage.md#state) |
| `defaults` | the defaults of the parts instead of the built-in ones, e.g. `{ "axis": { "padding": 2, "tickMarks": { "size": 4, "inset": 0 } } }`, see [defaults](definition.md#defaults); also a function of the merged definition (see `resolve` below) which returns them (or a promise of them, `null` none), since 4.0.0 |
| `parts` | the parts of the image, see above, default all |
| `fontSize` | the size of the texts of gen-vis, e.g. `"8pt"`: 13px of most texts become it, the title (22px), the message (14px) and the small texts (11px) in proportion; sizes of the definition (props) stay as they are |
| `background` | a CSS color, `null` none (a transparent PNG), default the one of gen-vis (`--gen-vis-background` or white) |
| `schemes` | schemes of colors registered before the chart is drawn, for this call only (the next one has the schemes of the page before), e.g. `{ "house": ["#005CA9", "#E6A000"] }`, also of several sizes (`[null, null, ["#9EC5E8", "#005CA9"], ...]`), see `registerScheme` in [extensions](extensions.md#extensions); also a function of the merged definition (see `resolve` below) which returns such an object (or a promise of it), called before the chart is drawn, e.g. of colors by the plot types, since 4.0.0 |
| `timeout` | the time to wait for the chart in milliseconds, default 30000 |

The result (sizes in CSS pixels):

| Key | Description |
|-----|-------------|
| `version` | `1` |
| `svg` | the SVG, see `exportSvg` above |
| `width`, `height` | the size of the image (of `parts`), `width` is the one asked for (to a fraction of a pixel) |
| `box` | `{ x, y, width, height }`, the rectangle of the image in the page (document coordinates), the `clip` of a screenshot |

`await window.genVisExport.resolve(options)` (since 4.0.0, of protocol
version 1) is the definition of `def` or `defUrl` with its parents and
mixins, merged as the load of the chart merges them (`parent`, relative to
`baseUrl` or to `defUrl`, the files of the chart), not yet normalized; it takes the options of `genVisExport` (unknown ones are an
error, the others than `def`, `defUrl` and `baseUrl` are not used), leaves
the chart before as it is and rejects as `genVisExport` does, e.g. with
`Could not load '…/base.json': 404 Not Found`. A wrapper chooses its
colors by it, e.g. by the plot types of `merged.plot`, or gives a function
of it as `schemes` (or `defaults`), the page calls it with the merged
definition (its files are loaded once):

```js
await genVisExport({ defUrl, schemes: merged =>
    ({ house: [merged.plot].flat().some(p => p.type == 'bar') ? barColors : lineColors }) });
```

The CLI has no functions of options (they do not come from the command
line); a program of its own evaluates them in the page.

The page has the fonts of the computer: the font of gen-vis is Inter
(Debian: `fonts-inter`), then the font of the system (`system-ui`, e.g.
DejaVu Sans of Linux) and sans-serif; a stylesheet of the options sets
others (`--gen-vis-font-family`), e.g. the one of a house style. The version changes only
with changes which are not compatible, e.g. a new meaning of an option, new
options and new keys of the result are added without a new version.

## CLI

`gen-vis export` is the package's `bin` (node 22 or newer, no
dependencies). It draws definition files on the export page in a Chromium,
Chrome or Edge of the system and writes SVG, PNG and PDF files, chosen by
their extensions. Each definition is followed by its outputs, and one
browser draws them all:

```sh
npx gen-vis export data/bev/def.json bev.svg bev.png bev.pdf --width 16cm --font-size 8pt --dpi 300
npx gen-vis export a.json a.svg b.json b.svg b.png --parts legend,plot --css house.css --class house \
    --scheme house=#005CA9,#E6A000,#7AB51D --globals '{"lang": "en"}' \
    --defaults '{"axis": {"padding": 2, "tickMarks": {"size": 4, "inset": 0}}}'
```

`npx gen-vis export --help` lists all options. They match the export page's
options above:

- `--width` (default 800), `--unit`, `--padding` (pixels, 0 or more,
  default 15), `--parts` (a comma-separated list), `--background` (`none`
  for a transparent one).
- `--css` (a file or CSS text) and `--class`, both repeatable;
  `--font-size`.
- `--globals` and `--state` (JSON), `--defaults` (JSON or a JSON file, e.g.
  `--defaults house-defaults.json`), `--data` (a CSV, JSON or parquet file
  instead of the definition's data), `--scheme name=color,color,...`
  (repeatable).
- PNG resolution: `--scale` (pixels per CSS pixel, default 2) or `--dpi`.
  The width is rounded to whole pixels, e.g. 1890 for 16cm at 300 dpi.
- `--timeout` (ms per chart, default 30000).
- `--root <dir>`: the directory of site-absolute paths (see below).
- `--browser <path>`; otherwise `GEN_VIS_BROWSER` or `CHROME_PATH`, then
  `chromium`, `chromium-browser`, `google-chrome`, `chrome` or `msedge` on
  the PATH and the usual Chrome and Edge locations on macOS and Windows.
- `--no-sandbox` (or `GEN_VIS_NO_SANDBOX=1`). The browser runs without its
  sandbox anyway as root, or when it cannot start one (e.g. in a
  container); it says so.

How it works and what to expect:

- No server is needed: the program answers the page's requests itself
  (CDP `Fetch`), so a definition loads its data and parents relative to its
  own file. Site-absolute paths such as `"/geo/europe.json"` are files in
  `--root <dir>`, the directory the site serves (without it they fail with a
  404 and a hint), e.g. `--root web/dist` or a directory with `geo/` in it.
- A chart that fails is reported with gen-vis's message, the others are
  still drawn, and the exit code is 1.
- SIGINT, SIGTERM and SIGHUP close the browser and remove its profile; the
  exit code is the shell's (130, 143, 129).
- The PDF is a print of the SVG, so PDF and SVG are the same drawing.
