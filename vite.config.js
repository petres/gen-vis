import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// the styles are injected by the script, so a single file is enough to use
// the library (as it was with the style-loader of webpack), they are in the
// cascade layer `gen-vis`, so every style of the page overrides them,
// regardless of its specificity and order
const injectCss = () => ({
    name: 'inject-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(options, bundle) {
        const assets = Object.values(bundle).filter(f => f.type == 'asset' && f.fileName.endsWith('.css'));
        const css = assets.length ? `@layer gen-vis {\n${assets.map(f => f.source).join('\n')}\n}` : '';
        assets.forEach(f => delete bundle[f.fileName]);
        if (css) {
            const entry = Object.values(bundle).find(f => f.type == 'chunk' && f.isEntry && f.name == 'gen-vis');
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
        this.emitFile({ type: 'asset', fileName: 'gen-vis.js', source: entry.code });
    },
});

export default defineConfig(({ mode }) => ({
    plugins: [vue(), injectCss(), ...(mode == 'lib' ? [unversioned()] : [])],
    resolve: {
        alias: [
            // the standalone script is one file, the parts which are loaded
            // when a chart needs them are imported directly, see utils/lazy.js
            ...(mode == 'lib' ? [{ find: /^@\/utils\/lazy$/, replacement: fileURLToPath(new URL('./src/utils/lazy-static.js', import.meta.url)) }] : []),
            { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        ],
    },
    server: {
        open: '/',
    },
    define: {
        // the standalone script reads parquet without the decompressors of
        // other compressions than snappy, see src/utils/parquet.js
        __GEN_VIS_STANDALONE__: JSON.stringify(mode == 'lib'),
        // the standalone scripts include vue, which checks the environment
        ...(mode == 'lib' || mode == 'module' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
    },
    build: mode == 'module' ? {
        // the standalone script as a module of a page, with vue and d3, the
        // parts which are loaded when a chart needs them are files of their own
        // next to it, e.g. the ones of maps, see the readme
        outDir: 'dist-lib/esm',
        lib: {
            entry: { 'gen-vis': 'src/lib.js' },
            formats: ['es'],
            fileName: (format, name) => `${name}.js`,
        },
        rolldownOptions: {
            output: {
                chunkFileNames: 'chunks/[name]-[hash].js',
                codeSplitting: { groups: [{ name: atOnce(fileURLToPath(new URL('./src/lib.js', import.meta.url))) }] },
            },
        },
    } : mode == 'lib' ? {
        // standalone script for embedding, see the readme
        outDir: 'dist-lib',
        lib: {
            // named as the entry of the es module, the styles are injected into it
            entry: { 'gen-vis': 'src/lib.js' },
            formats: ['iife'],
            name: 'GenVis',
            fileName: () => `gen-vis-${pkg.version}.js`,
        },
    } : {
        // es module for bundlers, the dependencies are resolved by the host
        // application, `check` for scripts outside the browser, see src/check.js
        lib: {
            entry: { 'gen-vis': 'src/index.js', check: 'src/check.js' },
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
    },
}));
