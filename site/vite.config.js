import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

// the page of the examples (GitHub Pages), see the readme (Development), it uses the
// package as it is published, the es module of dist/ (`npm run build` first),
// so its styles are in the cascade layer `gen-vis` as in the applications
export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    // relative urls, the page is at /gen-vis/ of github.io
    base: './',
    plugins: [vue()],
    resolve: {
        alias: {
            '@preschen/gen-vis/schema.json': fileURLToPath(new URL('../schema.json', import.meta.url)),
            '@preschen/gen-vis/check': fileURLToPath(new URL('../dist/check.js', import.meta.url)),
            '@preschen/gen-vis': fileURLToPath(new URL('../dist/gen-vis.js', import.meta.url)),
        },
    },
    define: {
        __VERSION__: JSON.stringify(pkg.version),
        // the links to the readme are the ones of the branch built
        __BRANCH__: JSON.stringify(process.env.GITHUB_REF_NAME || 'main'),
    },
    build: {
        outDir: fileURLToPath(new URL('../dist-site', import.meta.url)),
        emptyOutDir: true,
        // the editor (codemirror) and the check of the schema (ajv) are part of the page
        chunkSizeWarningLimit: 1200,
    },
});
