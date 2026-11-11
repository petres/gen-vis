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
subtitle, without the controls and the buttons) as one SVG of its own,
made for Word, LaTeX (through a PDF) and editors, which draw SVG but no
HTML and no CSS:

- the texts of the HTML (the title, the subtitle, the legends, the footer)
  are `<text>` elements at the positions the browser drew them, one per
  line, the texts stay texts (editable, in the fonts of the computer which
  opens it, e.g. Inter, which gen-vis brings for the PNG and the PDF but
  an SVG does not contain), backgrounds and borders are `<rect>` and
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
  where their content overflows them, e.g. a map);
- the ids (e.g. of the clips and the gradients of color legends) have a
  prefix of the content of the file (e.g. `gv1k3x9z-`), so several SVGs
  inlined in one HTML page keep their own, and an export of the same
  chart is the same file; no scripts and no handlers of events.

The options:

| Option | Description |
|--------|-------------|
| `parts` | the parts of the image, some of `title`, `subtitle`, `selection` (the line of the controls), `legend`, `plot` and `footer`, by default all; the image is cropped to them: the full width, the height from the first to the last part with the space of the image (15 pixels) above and below, e.g. `["legend", "plot"]` of a document which has the title in its text |
| `unit` | the unit of the attributes `width` and `height`: `px` (default), `cm`, `mm` or `in` (a CSS pixel is 1/96 in), the `viewBox` is in CSS pixels |
| `background` | a CSS color of the background, `null` none, by default the one of the PNG (`--gen-vis-background` or white) |

```js
const svg = await vis.exportSvg({ parts: ['legend', 'plot'], unit: 'cm' });
```

The prop `svg` adds a button which saves it (`exportSvg()` with the
defaults, the name of the file is the one of `svg` or the title). The
composer of the SVG is a part of its own, loaded with the first SVG (~5
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
   `marks[0].type: unknown mark type 'nope', e.g. 'line', 'bar' or 'point'`; of CDP, evaluate
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
| `width` | the width of the whole image (with its padding): a number of CSS pixels (`800`, the default), `"800px"`, `"16cm"`, `"160mm"`, `"6in"` or `"480pt"`; the chart is laid out at exactly that width, also a definition with a `width` of its own, nothing is scaled afterwards, so 8pt in it is 8pt in a document; without it a definition with a `width` is an image of that width and the padding |
| `padding` | the space around the chart in CSS pixels, 0 or more, default 15 (the one of the PNG) |
| `unit` | the unit of the size of the SVG (`px`, `cm`, `mm`, `in`), default the one of `width` (`px` of `pt`); a width of `"16cm"` is the attribute `width="16cm"` |
| `css` | a stylesheet or a list of them: a text with a `{` is CSS, others are urls (loaded before the chart is drawn) |
| `classes` | a class or a list of classes of the element of the chart (`.vis-outer`), e.g. of a theme of `css` |
| `globals` | the globals, see [globals](definition.md#globals-and-controls) |
| `state` | the state, see [state](usage.md#state) |
| `defaults` | the defaults of the parts instead of the built-in ones, e.g. `{ "axis": { "padding": 2, "tickMarks": { "size": 4, "inset": 0 } }, "margins": { "left": 60 } }`, see [defaults](definition.md#defaults); also a function of the merged definition (see `resolve` below) which returns them (or a promise of them, `null` none), since 4.0.0 |
| `parts` | the parts of the image, see above, default all |
| `fontSize` | the size of the texts of gen-vis, e.g. `"8pt"`: 13px of most texts become it, the title (20px), the message (14px), the labels and titles of the axes and the footer (12px) and the small texts (11px) in proportion; sizes of the definition (props) stay as they are |
| `background` | a CSS color, `null` none (a transparent PNG), default the one of gen-vis (`--gen-vis-background` or white) |
| `schemes` | schemes of colors registered before the chart is drawn, for this call only (the next one has the schemes of the page before), e.g. `{ "house": ["#005CA9", "#E6A000"] }`, also of several sizes (`[null, null, ["#9EC5E8", "#005CA9"], ...]`), see `registerScheme` in [extensions](extensions.md#schemes-of-colors); also a function of the merged definition (see `resolve` below) which returns such an object (or a promise of it), called before the chart is drawn, e.g. of colors by the mark types, since 4.0.0 |
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
`baseUrl` or to `defUrl`, the files of the chart), as it is written, not yet resolved with its
globals; it takes the options of `genVisExport` (unknown ones are an
error, the others than `def`, `defUrl` and `baseUrl` are not used), leaves
the chart before as it is and rejects as `genVisExport` does, e.g. with
`Could not load '…/base.json': 404 Not Found`. A wrapper chooses its
colors by it, e.g. by the mark types of `merged.marks`, or gives a function
of it as `schemes` (or `defaults`), the page calls it with the merged
definition (its files are loaded once):

```js
await genVisExport({ defUrl, schemes: merged =>
    ({ house: [merged.marks].flat().some(m => m?.type == 'bar') ? barColors : lineColors }) });
```

The CLI has no functions of options (they do not come from the command
line); a program of its own evaluates them in the page.

The font of gen-vis is Inter, the one of the package (`dist-lib`, also of
the PDF of the CLI), so the images are the same on every computer; a
stylesheet of the options sets others (`--gen-vis-font-family`), e.g. the
one of a house style, of the computer or of a web font of the stylesheet
(the PDF of the CLI has the fonts of the computer and Inter). The version changes only
with changes which are not compatible, e.g. a new meaning of an option, new
options and new keys of the result are added without a new version.

## CLI

`gen-vis export` is the package's `bin` (node 22 or newer, no
dependencies beside the package's); [`gen-vis check`](#check) of the same
`bin` checks definition files without a browser, `gen-vis --version` prints the
version of the package. `export` draws definition files on the export page in a Chromium,
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

- `--width` (default the `width` of the definition and the padding,
  else 800; it wins over the one of the definition), `--unit`, `--padding` (pixels, 0 or more,
  default 15), `--parts` (a comma-separated list), `--background` (`none`
  for a transparent one).
- `--css` (a file or CSS text) and `--class`, both repeatable;
  `--font-size`. The files a stylesheet loads (the `url()` of an
  `@font-face`) are in the directory of the stylesheet or under `--root`,
  others are refused (an error line, the chart falls back to another
  font).
- `--globals` and `--state` (JSON objects), `--defaults` (JSON or a JSON file, e.g.
  `--defaults house-defaults.json`, also the `margins` of a house style), `--data` (a CSV, JSON or parquet file
  instead of the definition's data), `--scheme name=color,color,...`
  (repeatable).
- PNG resolution: `--scale` (pixels per CSS pixel, default 2) or `--dpi`.
  The width is rounded to whole pixels, e.g. 1890 for 16cm at 300 dpi.
- `--timeout` (ms per chart, default 30000).
- `--root <dir>`: the directory of site-absolute paths (see below).
- `--allow-net`: the page may load `http://` and `https://` urls, e.g.
  remote data or a stylesheet of web fonts (see below).
- `--browser <path>`; otherwise `GEN_VIS_BROWSER` or `CHROME_PATH`, then
  `chromium`, `chromium-browser`, `google-chrome`, `chrome` or `msedge` on
  the PATH and the usual Chrome and Edge locations on macOS and Windows.
- `--no-sandbox` (or `GEN_VIS_NO_SANDBOX=1`). The browser runs without its
  sandbox anyway as root, or when it cannot start one (e.g. in a
  container); it says so.
- `--no-check`: no [check](#check) of the definitions before they are
  drawn, only the warnings of the draw are printed.
- `--strict`: a warning of the check or of the draw fails the chart: its
  outputs are not written, the exit code is 1.

How it works and what to expect:

- No server is needed: the program answers the page's requests itself
  (CDP `Fetch`), so a definition loads its data and parents relative to its
  own file. Site-absolute paths such as `"/geo/europe.json"` are files in
  `--root <dir>`, the directory the site serves (without it they fail with a
  404 and a hint), e.g. `--root web/dist` or a directory with `geo/` in it.
- The page reads only the files of the directories (and their
  subdirectories) of the definition, of `--root`, of `--data` and of the
  `--css` files. A definition is code from somewhere else (e.g. a
  definition of a user of a server which exports charts), so it cannot put
  another file into its image, e.g. `"data": "../../.ssh/config"`: such a
  request fails with `refused: <file> is outside the directories gen-vis
  reads ...` and a 403. Its parents open no directory either (else a
  `"parent": "../.config/x.json"` would open its directory): a parent or
  data of a sibling directory (e.g. `"parent": "../_timeline.json"`) needs
  `--root` of a directory above both, e.g. `--root .` of a project. The
  check is of the paths (links in these directories are followed: they are
  the choice of their owner, not of the definition), the check before the
  draw reads the same files.
- Requests to other origins (`http://`, `https://`, e.g. remote data, or a
  `url()` of an expression of a style) fail, with `refused <url>: requests
  to other origins need --allow-net`, so an export does not reach the
  network or the local network. With `--allow-net` the program fetches
  `http(s)` urls itself (also of servers without CORS headers); other
  schemes stay refused.
- Every chart is checked first, as by `gen-vis check`, its warnings are
  printed to the standard error with `check:` before them
  (`gen-vis: a.json: check: dims.x.column: 'yaer' is not a column of the
  data, did you mean 'year'?`), then the warnings of the draw (`gen-vis:
  a.json: warning: marks[0]: none of its 66 rows is drawn, ...`).
- A line per chart on the standard output names its outputs, the size of
  the chart in CSS pixels and, of a PNG, the pixels of the PNG, e.g.
  `bev.json -> bev.svg, bev.png (605x412 CSS px, PNG 1890x1287 px, 0.31 s)`.
- A chart that fails is reported with gen-vis's message, the others are
  still drawn, and the exit code is 1.
- SIGINT, SIGTERM and SIGHUP close the browser and remove its profile; the
  exit code is the shell's (130, 143, 129). The browser is driven over a
  pipe (`--remote-debugging-pipe`), so it also ends when the program is
  killed (SIGKILL), its profile (`gen-vis-*` in the temporary directory)
  stays then.
- Wrong arguments (e.g. an output of another format than `.svg`, `.png`
  and `.pdf`, `--globals` or `--state` which are no JSON object, no
  command) are a message to the standard error and the exit code 2.
- The PDF is a print of the SVG, so PDF and SVG are the same drawing.

## Check

`gen-vis check <def.json>...` checks definition files in node, without a
browser, e.g. all definitions of a site before a deploy or in CI:

```sh
npx gen-vis check data/*/def*.json --strict
```

A definition is merged with its parents (and mixins), then checked by the
JSON Schema of the package (with ajv where it is installed, e.g. in a
project which validates its definitions; `validateDef` walks the same
schema without it) and by `validateDef` (see
[checks outside the browser](extensions.md#checks-outside-the-browser))
with the rows of its data, read as the load reads them (CSV, TSV, JSON or
parquet, a template of the url of the data with the defaults of the
globals). It prints a line per warning to the standard output,
`<def.json>: <path>: <message>`, in the paths and words of the definition:

```
p1.json: dims.x.column: 'yaer' is not a column of the data, did you mean 'year'?
p3.json: marks[0].type: unknown type 'lines' of the coordinate system 'cartesian', did you mean 'line'?
p6.json: marks[0].strok-width: no attribute of svg, did you mean 'stroke-width'?
```

and a summary to the standard error (`gen-vis: 11 definitions, 6
warnings in 6, 2 not read`). A definition of gen-vis 4 (of its keys
`mapping`, `plot`, `formElements` or `options`, also of a parent, or of
its `$schema`) is not read: one line of the standard error names the file
and the keys, the exit code is 1; `gen-vis export` fails of it in the same
way. The check reads only local files: data
of an url of another origin (e.g. `https://example.org/data.csv`) is not
checked (a `note:` line says so, `--data <file>` checks a local copy), a
parent of one is not read. The exit code is 1 if a definition could
not be read (a missing file, a missing or remote parent, invalid JSON, no `$schema`), with
`--strict` also of a warning, 2 of wrong arguments. Options: `--data
<file>` (the data instead of the one of the definitions), `--root <dir>`
(the directory of site-absolute paths, as of `export`), `--scheme
<name>` or `--scheme <name>=<colors>` (repeatable, a scheme the page
registers, e.g. a house scheme of a wrapper of `genVisExport`: the check
knows it; the check of `export` knows the schemes of its `--scheme`),
`--strict`.
