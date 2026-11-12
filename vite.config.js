import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFileSync, copyFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

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
            // not on a server, e.g. of server side rendering, only in the
            // browser; marked, so a chart of the prop `nonce` gives it the
            // nonce of a content security policy (see comp/app.js), at once
            // the one of a script of the page, which has the policy's
            entry.code = `(() => { if (typeof document == "undefined") return; const s = document.createElement("style"); s.setAttribute("data-gen-vis", ""); s.nonce = document.querySelector("script[nonce]")?.nonce ?? ""; s.textContent = ${fontCode(url)} + "\\n" + ${JSON.stringify(css)}; document.head.appendChild(s); })();\n${entry.code}`;
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
                // not through the index of a package: its files are the ones used
                if (/node_modules\/[^/]+\/src\/index\.js$/.test(m))
                    return;
                (ctx.getModuleInfo(m)?.importedIds ?? []).forEach(visit);
            };
            visit(entry);
        }
        // files of packages shared by parts loaded later are no files of their
        // own, which those would wait for: the small ones are in the base, e.g.
        // the radial line of polar plots and of the labels inside bands and
        // the functions of d3-array (inlineRuntime checks that there is none)
        if (/node_modules\/d3-array\//.test(id) || /node_modules\/d3-shape\/src\/(lineRadial|curve\/radial|math|constant|array|path|point)\.js$/.test(id))
            return 'base';
        // the parts of maps are one file: they are loaded together
        if (/node_modules\/(d3-geo|topojson-client)\//.test(id) || /\/src\/(coords\/geo-map|utils\/geo)\.js$/.test(id))
            return 'geo-map';
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
// the helper of the bundler (the object of the exports of a module, of
// `import * as` and of modules loaded later which share a chunk) is a chunk
// of its own or a part of one of the chunks using it, which the others
// import, e.g. the base or the table the colors: one more request they wait
// for. Its code is written into the chunks using it instead; the build
// fails if the output of the bundler is another one than the one read here,
// and if a part loaded later imports a file other than the base.
const inlineRuntime = () => ({
    name: 'inline-runtime',
    apply: 'build',
    enforce: 'post',
    generateBundle(options, bundle) {
        const chunks = Object.values(bundle).filter(f => f.type == 'chunk');
        const host = chunks.find(f => Object.keys(f.modules).some(id => /rolldown[/:]runtime/.test(id)));
        if (host) {
            const file = host.fileName.split('/').pop();
            // the name of the helper in its chunk and the one of its export
            const local = /([\w$]+)=\(([\w$]+),([\w$]+)\)=>\{let ([\w$]+)=\{\};for\(var ([\w$]+) in \2\)[\w$]+\(\4,\5,\{get:\2\[\5\],enumerable:!0\}\)/.exec(host.code)?.[1];
            const exported = local && /export\{([^}]*)\};?\s*$/.exec(host.code.replace(/\/\/#.*$/gm, '').trim())?.[1].split(',')
                .map(e => e.trim().split(/\s+as\s+/)).find(([name]) => name == local);
            if (!exported)
                throw new Error(`the helper of the bundler was not found in ${host.fileName}, see inlineRuntime`);
            const name = exported[1] ?? exported[0];
            const helper = as => `const ${as}=(d=>(a,n)=>{let r={};for(var i in a)d(r,i,{get:a[i],enumerable:!0});return n||d(r,Symbol.toStringTag,{value:"Module"}),r})(Object.defineProperty);`;
            const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const statement = new RegExp(`import\\{${name.replace(/\$/g, '\\$')}(?: as ([\\w$]+))?\\}from"[^"]*${escaped}";?`);
            chunks.filter(f => f !== host && f.imports.includes(host.fileName) && statement.test(f.code)).forEach(f => {
                f.code = f.code.replace(statement, (m, as = name) => helper(as));
                if (!f.code.includes(file))
                    f.imports = f.imports.filter(i => i != host.fileName);
            });
            // a chunk of only the helper is not needed anymore
            if (Object.keys(host.modules).length == 1) {
                chunks.filter(f => f.code.includes(file)).forEach(f => {
                    throw new Error(`the import of the helper of the bundler in ${f.fileName} was not replaced, see inlineRuntime`);
                });
                delete bundle[host.fileName];
            }
        }
        // a part loaded later waits for no other file than the base (but the
        // parts which are loaded for one another), see atOnce
        const known = /^chunks\/(base|gzip|table|more)-/;
        Object.values(bundle).filter(f => f.type == 'chunk' && !f.isEntry).forEach(f => f.imports.filter(i => bundle[i] && !known.test(i)).forEach(i => {
            throw new Error(`${f.fileName} imports ${i}: a file shared by parts loaded later, name its modules in atOnce`);
        }));
    },
});

export default defineConfig(({ mode }) => {
    const module = mode == 'module';
    return {
        plugins: [vue(), injectCss(mode), ...(module ? [inlineRuntime(), exportPage()] : [])],
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
