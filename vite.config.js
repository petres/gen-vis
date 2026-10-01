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
            const entry = Object.values(bundle).find(f => f.type == 'chunk' && f.isEntry);
            entry.code = `(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })();\n${entry.code}`;
        }
    },
});

export default defineConfig(({ mode }) => ({
    plugins: [vue(), injectCss()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        open: '/dev.html',
    },
    // the standalone script includes vue, which checks the environment
    define: mode == 'lib' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
    build: mode == 'lib' ? {
        // standalone script for embedding, see lib.html
        outDir: 'dist-lib',
        lib: {
            entry: 'src/lib.js',
            formats: ['iife'],
            name: 'GenVis',
            fileName: () => `gen-vis-${pkg.version}.js`,
        },
    } : {
        // es module for bundlers, the dependencies are resolved by the host application
        lib: {
            entry: 'src/index.js',
            formats: ['es'],
            fileName: 'gen-vis',
        },
        rolldownOptions: {
            external: [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)],
        },
    },
    test: {
        environment: 'node',
    },
}));
