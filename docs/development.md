# Development

Repository scripts, tests, builds, publishing and the examples site.

```sh
npm install
npm run dev     # dev server with all definitions in data/, ?def=bev/def.json shows one with the prepared definition
npm test        # unit tests, rendering and schema check of all definitions in data/
npm run test:png  # the images of all definitions compared with tests/png/ (part of npm test)
npm run schema  # schema.json and the types of the definitions (types/definition.d.ts) of src/schema/definition.js, a test checks both
npm run types   # only the types of the definitions of schema.json
npm run build   # es modules for bundlers in dist/: gen-vis.js (the core), vue.js (the Vue adapter), check.js
npm run watch   # rebuilds dist/ on changes, e.g. for `npm link`
npm run lib     # the browser module in dist-lib/esm/ and the export page dist-lib/export.html
node bin/gen-vis.js export data/bev/def.json bev.svg   # the CLI of the static export, of dist-lib/
node bin/gen-vis.js migrate old/def.json               # a definition of gen-vis 4 as one of gen-vis 5, of dist/check.js
npm run upload  # compresses dist-lib/ and copies all of it to GEN_VIS_UPLOAD (user@host:/path) in .env
npm run deploy  # npm run lib, then npm run upload
npm run site    # dev server of the examples site (site/), with the package built in dist/ and dist-lib/
npm run site:build  # the examples site in dist-site/
```

The examples site (`site/`) is the GitHub Pages site, built and deployed
by `.github/workflows/pages.yml` on every push to `main`. It
uses the package as it is published, the es module of `dist/`, so its styles
are in the cascade layer as in the applications. Every example is a
definition and the CSS of its look in `site/examples/` (listed in
`site/examples/index.js`), its data is in `site/public/data/`, the urls are
relative to the page. The definitions and the CSS can be edited on the page,
the editor completes the keys and values of the JSON Schema. The examples of
the use are `site/components/VueDemo.vue` and `site/public/standalone.html`
(with the browser module of `dist-lib/esm/`, copied to
`lib/esm/` of the page) of the chart `site/public/charts/seasons.json`, the
comparison with other libraries is `site/components/Comparison.vue`. The
page "How it works" is `site/guide.html` (`site/Guide.vue`, its chart built
step by step in `site/guide/steps.js`), the gallery of one chart of every
kind of `data/` is `site/gallery.html` (`site/Gallery.vue`, the charts in
`site/gallery/index.js`, the files they need are served from `data/` in dev
and copied at the build). The tests check and draw the examples, as the
ones of `data/`.

`tests/cli.test.js` draws a chart with the CLI of the static export in a
Chromium, Chrome or Edge of the system (it builds the export page if it is
older than `src/`), it is skipped without one. `tests/png.test.js` draws
every definition of `data/` and of the site with it, in one browser, 720 px
wide, and compares the images pixel by pixel with the ones of `tests/png/`
(pixelmatch): a test fails when the size differs or more than 0.2% of the
pixels, the diff is written to `tests/png-diff/` then. Intended changes of
the images are taken by `UPDATE_PNG=1 npx vitest run tests/png.test.js`
(a missing baseline is written in any run), commit them with the change.
The images are the ones of the Chromium of the box, the text of another
browser or version may be a few pixels off, which stays below the limit.

`spec/` has the fixtures of the parts of the definitions which other
languages can implement ([spec/README.md](../spec/README.md)),
`tests/spec.test.js` runs them. The design of the definition language of
5.0 (the language, the translation into the form the engine reads, the
schema of one source, the migration) is in [design-5.0.md](design-5.0.md),
the one of 4.0 (the expressions, the normalized form) in
[design-4.0.md](design-4.0.md).

The schema of the definitions is written in JavaScript,
`src/schema/definition.js` (with the vocabulary of `src/schema/dsl.js`),
with the text of every key: `npm run schema` writes `schema.json` and
`types/definition.d.ts` of it, `tests/schema.test.js` checks that both are
current and that the names of the registries (mark types, coordinate
systems, curves, locales, scales, projections, transforms) are the code's;
the structural check of `validateDef` walks the same source. A value of
several forms is a `cases` node of the dsl (if/then/else by the type of the
value, e.g. a mark or a list of marks), so a typo gives one error of ajv
(and an `if` error, which the tools leave out) instead of one per branch of
an `anyOf`; `option` is a name of a fixed list or an expression of the
globals (`"=..."`), the types of TypeScript make the branches a union and
the expression a template literal type (`scripts/types.js`). A change of
the language is a change of the source, `npm run schema`, the translator
(`src/utils/language.js`) and its tests (`tests/language.test.js`).

`tests/fixtures/v4/` has the definitions of `data/` of gen-vis 4, as they
were before `gen-vis migrate`: `tests/migrate.test.js` compares the
migration of every merged 4.x definition with the migrated files, for every
value of its controls, and the translated definition with the normalized
one of 4.x.

`tests/snapshots/` has the html of every definition in `data/`, drawn,
hovered and with the first entry of the legend toggled, so changes of the
code which change the charts are seen in the diff, `npx vitest -u` takes
intended ones. The tests run in the time zone of Vienna (`vite.config.js`),
the positions of the days of time scales differ a little in other zones, by
their changes of the daylight saving time.

The page of the dev server (`index.html`, `src/dev/`) shows the definitions in
`data/`, also of directories linked there locally (none are in the
repository), e.g. of the pages using the package,
without the mixins (`_*.json`). The CSS files in `data/` style the charts of
the page, the charts are in elements with the path of their directory
(`data-dir`) and of their definition (`data-def`), e.g. `data/fti/style.css`
is the look of the charts of `data/fti/` (`[data-dir="fti"]`). All definitions in `data/` are rendered,
hovered and checked by the tests, so they have to stay valid. `data/energy/`
is a selection of the energy dashboard, see its `README.md`.

To try changes in an application, `npm install --no-save ../gen-vis` links the
directory (with `npm run watch`; `npm run lib` once, the fonts of `dist/`
are the ones of `dist-lib/esm/chunks/fonts/`). The `vue` of the Vue adapter of the linked
package would be the one of its own `node_modules`, a second Vue, so the
bundler of the application has to resolve `vue` to its own, e.g. `resolve.alias: { vue:
path.resolve('node_modules/vue') }` of webpack or `resolve.dedupe: ['vue']` of
vite.

## Publishing

Changes by version are in `CHANGELOG.md`. `npm publish` runs the tests and
builds `dist/` and the browser module (`prepublishOnly`).

A prerelease (e.g. `5.0.0-alpha.1`) must be published with a tag, `npm
publish --tag alpha`; without one it becomes `latest`, the version that
`npm install @preschen/gen-vis` installs. The `@5` URLs in the docs and in
every `$schema` (unpkg and jsDelivr, e.g.
`https://unpkg.com/@preschen/gen-vis@5/schema.json`) resolve only to
non-prerelease versions, so they work once a 5.x release, e.g. 5.0.0, is on
npm. Until then editors can not load the schema from that URL, but gen-vis
itself accepts it: it only checks the URL, it does not fetch it.

`npm run upload` is separate from npm: it copies `dist-lib/` to your own
server. The module (`esm/`) is unversioned, always the latest upload, see
[usage](usage.md#browser-module).
