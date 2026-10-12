import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

// the standalone script as a module (`npm run lib` first) in lib/esm/ of the
// page, of its example without a bundler (public/standalone.html)
const esm = fileURLToPath(new URL('../dist-lib/esm', import.meta.url));
const files = dir => readdirSync(dir).flatMap(f => statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]);
const standalone = () => ({
    name: 'standalone',
    configureServer(server) {
        server.middlewares.use('/lib/esm', (req, res, next) => {
            const file = path.join(esm, decodeURIComponent(req.url.split('?')[0]));
            if (!file.startsWith(esm) || !existsSync(file) || !statSync(file).isFile())
                return next();
            res.setHeader('Content-Type', 'text/javascript');
            res.end(readFileSync(file));
        });
    },
    generateBundle() {
        if (!existsSync(esm))
            this.error('dist-lib/esm is missing, `npm run lib` builds it');
        files(esm).forEach(f => this.emitFile({ type: 'asset', fileName: `lib/esm/${path.relative(esm, f)}`, source: readFileSync(f) }));
    },
});

// the page of the examples (GitHub Pages), see the readme (Development), it uses the
// package as it is published, the es module of dist/ (`npm run build` first),
// so its styles are in the cascade layer `gen-vis` as in the applications
export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    // relative urls, the page is at /gen-vis/ of github.io
    base: './',
    plugins: [vue(), standalone()],
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
