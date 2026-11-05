import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFileSync, copyFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

// the schema of the check of the definitions (`schema.json?check`, see
// src/utils/validate.js) without its texts, the check only needs the rules,
// the descriptions are most of its size, the editor of the site and the
// file of the package keep them; the names of `properties` are kept, e.g. a
// property `default`
const checkSchema = () => ({
    name: 'check-schema',
    enforce: 'pre',
    load(id) {
        const [file, query] = id.split('?');
        if (query != 'check' || !file.endsWith('schema.json'))
            return null;
        const texts = new Set(['description', 'title', 'default', 'examples', '$comment']);
        const strip = (v, names = false) => Array.isArray(v) ? v.map(e => strip(e))
            : v && typeof v == 'object' ? Object.fromEntries(Object.entries(v)
                .filter(([k]) => names || !texts.has(k))
                .map(([k, e]) => [k, strip(e, !names && (k == 'properties' || k == 'definitions' || k == '$defs' || k == 'patternProperties'))]))
            : v;
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(strip(JSON.parse(readFileSync(file, 'utf8')))))});`;
    },
});

// the default font of the package, Inter (OFL, of @fontsource/inter): the
// Latin and Latin Extended subsets of the weights 400 and 600 as woff2 files
// next to the chunk which injects the styles (fonts/), with their license;
// a browser loads a face only for texts which use it, so a page of its own
// font (--gen-vis-font-family) loads none
const fontDir = fileURLToPath(new URL('./node_modules/@fontsource/inter/', import.meta.url));
const fontFaces = [...['latin', 'latin-ext'].flatMap(subset => [400, 600].map(weight => {
    const file = `inter-${subset}-${weight}-normal.woff2`;
    const css = readFileSync(`${fontDir}${weight}.css`, 'utf8');
    const range = new RegExp(`inter-${subset}-${weight}-normal\\.woff2[^}]*unicode-range: ([^;]+);`).exec(css)?.[1];
    if (!range)
        throw new Error(`the unicode range of ${file} is missing in @fontsource/inter`);
    return { file, weight, range, source: `${fontDir}files/${file}` };
})),
// the symbols of Inter which these subsets have not, e.g. CO₂, ≤, →, ½,
// subset of the same version by scripts/fonts.sh into assets/fonts/
...[400, 600].map(weight => ({
    file: `inter-symbols-${weight}-normal.woff2`, weight, range: 'U+2070-209F,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+25A0-25FF',
    source: fileURLToPath(new URL(`./assets/fonts/inter-symbols-${weight}-normal.woff2`, import.meta.url)),
}))];
// the code of the @font-face rules of the fonts, the url of a file of
// `url(file)` (code of an expression), see injectCss
const fontCode = url => `[${fontFaces.map(f => `"@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${f.weight}; font-display: swap; `
    + `src: url(" + ${url(f.file)} + ") format('woff2'); unicode-range: ${f.range}; }"`).join(', ')}].join("\\n")`;

// the styles (src/styles.css) are injected by the script, once, when it is
// loaded, so a single file is enough to use the library (as it was with the
// style-loader of webpack), they are in the cascade layer `gen-vis`, so
// every style of the page overrides them, regardless of its specificity and
// order; they are part of the chunk of the visualisation (src/comp/app.js),
// e.g. the entry of the package which the one of the Vue adapter imports
const injectCss = (mode) => ({
    name: 'inject-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(options, bundle) {
        const assets = Object.values(bundle).filter(f => f.type == 'asset' && f.fileName.endsWith('.css'));
        const css = assets.length ? `@layer gen-vis {\n${assets.map(f => f.source).join('\n')}\n}` : '';
        assets.forEach(f => delete bundle[f.fileName]);
        if (css) {
            const chunks = Object.values(bundle).filter(f => f.type == 'chunk');
            const entry = chunks.find(f => Object.keys(f.modules).some(id => id.endsWith('/src/comp/app.js')))
                ?? chunks.find(f => f.isEntry && f.name == 'gen-vis');
            // the fonts are files of the module (dist-lib/esm/chunks/fonts/,
            // next to the chunk of the styles), once in the package: the module
            // relative to itself, the es modules for bundlers (dist/) relative
            // to their chunk (a literal new URL of import.meta.url, which
            // bundlers of applications copy, e.g. webpack and vite), the
            // single file relative to its own url (dist-lib/)
            if (mode == 'module') {
                const dir = entry.fileName.slice(0, entry.fileName.lastIndexOf('/') + 1);
                if (dir != 'chunks/')
                    throw new Error(`the fonts are in chunks/fonts/ of the module, see dist and lib, not in ${dir}fonts/`);
                fontFaces.forEach(f => this.emitFile({ type: 'asset', fileName: `${dir}fonts/${f.file}`, source: readFileSync(f.source) }));
                this.emitFile({ type: 'asset', fileName: `${dir}fonts/LICENSE-Inter.txt`, source: readFileSync(`${fontDir}LICENSE`) });
                // the rules as a stylesheet next to them, e.g. of the print of
                // the PDF of the CLI (bin/export.js) or of a page of its own
                this.emitFile({ type: 'asset', fileName: `${dir}fonts/inter.css`, source: `${(0, eval)(fontCode(file => JSON.stringify(`./${file}`)))}\n` });
            }
            const url = mode == 'module' ? file => `new URL("./fonts/${file}", import.meta.url).href`
                : file => `new URL("../dist-lib/esm/chunks/fonts/${file}", import.meta.url).href`;
            // not on a server, e.g. of server side rendering, only in the browser
            entry.code = `(() => { if (typeof document == "undefined") return; const s = document.createElement("style"); s.textContent = ${fontCode(url)} + "\\n" + ${JSON.stringify(css)}; document.head.appendChild(s); })();\n${entry.code}`;
        }
    },
});

// the modules of the module build of the standalone script which a page loads
// at once, the static imports of the entry, in one chunk, so a page loads two
// files and not one for every module shared with a part loaded later
const atOnce = entry => {
    let reached = null;
    return (id, ctx) => {
        if (!reached) {
            reached = new Set();
            const visit = m => {
                if (reached.has(m))
                    return;
                reached.add(m);
                (ctx.getModuleInfo(m)?.importedIds ?? []).forEach(visit);
            };
            visit(entry);
        }
        return reached.has(id) ? 'base' : null;
    };
};

// the export page next to the module of the standalone script
// (dist-lib/export.html, it loads esm/export.js), see docs/export.md
const exportPage = () => ({
    name: 'export-page',
    apply: 'build',
    writeBundle(options) {
        copyFileSync(fileURLToPath(new URL('./src/export.html', import.meta.url)), `${options.dir}/../export.html`);
    },
});

// the builds: the es modules of the package (dist/, the default) and the
// module of the browser (`npm run lib`, dist-lib/esm/ with the export page),
// see docs/usage.md, neither has Vue, the component of the Vue of a page is
// a function of it (see src/vue-adapter.js); the Vue plugin is the one of
// the pages of the dev server (src/dev/)
export default defineConfig(({ mode }) => {
    const module = mode == 'module';
    return {
        plugins: [vue(), checkSchema(), injectCss(mode), ...(module ? [exportPage()] : [])],
        resolve: {
            alias: [
                { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
            ],
        },
        server: {
            open: '/',
        },
        // the dependencies of the pages of the dev server (index.html, src/dev/),
        // not the ones of every html file of the checkout: the export page
        // (src/export.html) imports the module of the lib build, the site
        // (site/, its own config) the package itself (dist/)
        optimizeDeps: {
            entries: ['index.html'],
        },
        define: {
            // the environment of the dependencies of the module of the browser
            ...(module ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
        },
        build: module ? {
            // the standalone script as a module of a page, with d3, the parts
            // which are loaded when a chart needs them are files of their own
            // next to it, e.g. the ones of maps, see docs/usage.md, and the
            // module of the export page (src/export.js)
            outDir: 'dist-lib/esm',
            emptyOutDir: true,
            lib: {
                entry: { 'gen-vis': 'src/lib.js', export: 'src/export.js' },
                formats: ['es'],
                fileName: (format, name) => `${name}.js`,
            },
            rolldownOptions: {
                output: {
                    // vite keeps the whitespace of es modules of libraries (for the
                    // bundlers of applications), these are loaded by the browser
                    minify: true,
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    codeSplitting: { groups: [{ name: atOnce(fileURLToPath(new URL('./src/lib.js', import.meta.url))) }] },
                },
            },
        } : {
            // es module for bundlers, the dependencies are resolved by the host
            // application, `vue` is the Vue adapter (src/vue.js, it imports the
            // vue of the application), `check` for scripts outside the browser,
            // see src/check.js
            lib: {
                entry: { 'gen-vis': 'src/index.js', vue: 'src/vue.js', check: 'src/check.js' },
                formats: ['es'],
                fileName: (format, name) => `${name}.js`,
            },
            rolldownOptions: {
                // the packages and their files, e.g. hyparquet-compressors/src/gzip.js
                external: id => [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)].some(d => id == d || id.startsWith(`${d}/`)),
            },
        },
        test: {
            environment: 'node',
            // the snapshots of the time scales are the ones of Vienna, the positions of
            // the days differ by the changes of the daylight saving time of a zone
            env: { TZ: 'Europe/Vienna' },
            // the worktrees of agents, e.g. of Claude Code, have tests of their own
            exclude: ['**/node_modules/**', '.claude/**'],
        },
    };
});
