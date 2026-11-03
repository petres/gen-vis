import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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

// the styles (src/styles.css) are injected by the script, once, when it is
// loaded, so a single file is enough to use the library (as it was with the
// style-loader of webpack), they are in the cascade layer `gen-vis`, so
// every style of the page overrides them, regardless of its specificity and
// order; they are part of the chunk of the visualisation (src/comp/app.js),
// e.g. the entry of the package which the one of the Vue adapter imports
const injectCss = () => ({
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
            // not on a server, e.g. of server side rendering, only in the browser
            entry.code = `(() => { if (typeof document == "undefined") return; const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })();\n${entry.code}`;
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

// the standalone script also as gen-vis.js, the one of the package, e.g. of a
// CDN, beside the one of the version for the upload, see the readme
const unversioned = () => ({
    name: 'unversioned',
    apply: 'build',
    // after injectCss, with the styles
    enforce: 'post',
    generateBundle(options, bundle) {
        const entry = Object.values(bundle).find(f => f.type == 'chunk' && f.isEntry);
        this.emitFile({ type: 'asset', fileName: "gen-vis.js", source: entry.code });
    },
});

// the builds of the standalone script (`npm run lib`), see the readme: the
// single file (lib), the module with its parts next to it (module) and the
// classic script which loads the module (core), none of them has Vue, the
// component of the Vue of a page is a function of it (see src/vue-adapter.js);
// the Vue plugin is the one of the pages of the dev server (src/dev/)
export default defineConfig(({ mode }) => {
    const single = mode == 'lib';
    const module = mode == 'module';
    return {
        plugins: [vue(), checkSchema(), injectCss(), ...(single ? [unversioned()] : [])],
        resolve: {
            alias: [
                // the single file has the parts which are loaded when a chart needs
                // them in itself, without the check, see utils/lazy-static.js
                ...(single ? [{ find: /^@\/utils\/lazy$/, replacement: fileURLToPath(new URL('./src/utils/lazy-static.js', import.meta.url)) }] : []),
                { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
            ],
        },
        server: {
            open: '/',
        },
        define: {
            // the standalone script reads parquet without the decompressors of
            // other compressions than snappy, see src/utils/parquet.js
            __GEN_VIS_STANDALONE__: JSON.stringify(single),
            // the environment of the dependencies of the standalone scripts
            ...(single || module ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
        },
        build: module ? {
            // the standalone script as a module of a page, with d3, the parts
            // which are loaded when a chart needs them are files of their own
            // next to it, e.g. the ones of maps, see the readme
            outDir: 'dist-lib/esm',
            lib: {
                entry: { 'gen-vis': 'src/lib.js' },
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
        } : single ? {
            // standalone script for embedding, see the readme, the first build
            // (lib) empties dist-lib, the others are added to it
            outDir: 'dist-lib',
            emptyOutDir: true,
            lib: {
                // named as the entry of the es module, the styles are injected into it
                entry: { 'gen-vis': 'src/lib.js' },
                formats: ['iife'],
                name: 'GenVis',
                fileName: () => `gen-vis-${pkg.version}.js`,
            },
        } : mode == 'core' ? {
            // the classic script which loads the module of esm/ next to it, see src/core.js
            outDir: 'dist-lib',
            emptyOutDir: false,
            lib: {
                entry: { 'gen-vis.core': 'src/core.js' },
                formats: ['iife'],
                name: 'GenVisCore',
                fileName: () => 'gen-vis.core.js',
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
                external: [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)],
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
