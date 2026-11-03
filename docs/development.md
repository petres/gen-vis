# Development

The scripts of the repository, the tests, the builds and the page of the
examples.

```sh
npm install
npm run dev     # dev server with all definitions in data/, ?def=bev/def.json shows one with the prepared definition
npm test        # unit tests, rendering and schema check of all definitions in data/
npm run types   # the types of the definitions (types/definition.d.ts) of schema.json, a test checks them
npm run build   # es modules for bundlers in dist/: gen-vis.js (the core), vue.js (the Vue adapter), check.js
npm run watch   # rebuilds dist/ on changes, e.g. for `npm link`
npm run lib     # standalone script in dist-lib/, gen-vis.js (of the package) and gen-vis-<version>.js, the export page
node bin/gen-vis.js export data/bev/def.json bev.svg   # the CLI of the static export, of dist-lib/
npm run deploy  # builds and uploads the standalone script to GEN_VIS_UPLOAD (user@host:/path) of .env
npm run site    # dev server of the page of the examples (site/), with the package built in dist/ and dist-lib/
npm run site:build  # the page of the examples in dist-site/
```

The page of the examples (`site/`) is the one of GitHub Pages, built and
deployed by `.github/workflows/pages.yml` on every push to `main`. It
uses the package as it is published, the es module of `dist/`, so its styles
are in the cascade layer as in the applications. Every example is a
definition and the CSS of its look in `site/examples/` (listed in
`site/examples/index.js`), its data is in `site/public/data/`, the urls are
relative to the page. The definitions and the CSS can be edited on the page,
the editor completes the keys and values of the JSON Schema. The examples of
the use are `site/components/VueDemo.vue` and `site/public/standalone.html`
(with the module of the standalone script of `dist-lib/esm/`, copied to
`lib/esm/` of the page) of the chart `site/public/charts/seasons.json`, the
comparison with other libraries is `site/components/Comparison.vue`. The
tests check and draw the examples, as the ones of `data/`.

`tests/cli.test.js` draws a chart with the CLI of the static export in a
Chromium, Chrome or Edge of the system (it builds the export page if it is
older than `src/`), it is skipped without one.

`spec/` has the fixtures of the parts of the definitions which other
languages can implement ([spec/README.md](../spec/README.md)),
`tests/spec.test.js` runs them. The design of the definition language of
4.0 and where the implementation deviates from its first draft are in
[design-4.0.md](design-4.0.md).

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
directory (with `npm run watch`). The `vue` of the Vue adapter of the linked
package would be the one of its own `node_modules`, a second Vue, so the
bundler of the application has to resolve `vue` to its own, e.g. `resolve.alias: { vue:
path.resolve('node_modules/vue') }` of webpack or `resolve.dedupe: ['vue']` of
vite. The changes of the versions are in `CHANGELOG.md`. `npm publish` runs
the tests and builds `dist/` and the standalone script of the package.
