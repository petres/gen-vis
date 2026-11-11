// the static export of the CLI (gen-vis export, see bin/gen-vis.js and
// docs/export.md): a headless browser (bin/cdp.js) loads the export
// page of dist-lib (export.html) and calls its genVisExport, the PNG is a
// screenshot of the box of the image, the PDF the print of the SVG, so PDF
// and SVG are the same drawing. The files reach the page without a server:
// the requests of the origin of the page are answered by the program
// (Fetch of CDP), `/fs/<path>` is the file of the file system, so a
// definition loads its data and its parents relative to its own file. Only
// the files of the directories of the definition, --root, --data and --css
// are answered (a parent elsewhere needs --root), requests of other
// origins fail unless
// `allowNet` (--allow-net) lets http(s) through, see docs/export.md.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { findBrowser, launch } from './cdp.js';

const origin = 'http://gen-vis.local';
const lib = fileURLToPath(new URL('../dist-lib/', import.meta.url));

// the formats of the outputs by their extensions
export const formats = ['svg', 'png', 'pdf'];

const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.txt': 'text/plain',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.parquet': 'application/vnd.apache.parquet',
};

// the url of a file in the page
export const fileUrl = file => `${origin}/fs${pathToFileURL(path.resolve(file)).pathname}`;

// the page of the print of an SVG
// (with the default font of gen-vis, Inter, of the module of the export page)
const printPage = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/__gen-vis/esm/chunks/fonts/inter.css"><style>@page { margin: 0; } html, body { margin: 0; } svg { display: block; }</style></head><body></body></html>';

// the file of an url of the page, null if it is not one (also of a path
// which is no file, e.g. of an encoded "/" or a malformed escape, and of an
// url of another origin, e.g. https://example.org/data.csv); a
// site-absolute path, e.g. "/geo/europe.json", is a file in `root` (if given)
const within = (dir, file) => file == dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
export const isLocal = url => new URL(url).origin == origin;
export const fileOf = (url, root) => {
    try {
        const { pathname } = new URL(url);
        if (!isLocal(url))
            return null;
        if (pathname.startsWith('/__gen-vis/')) {
            const file = path.resolve(lib, decodeURIComponent(pathname.slice('/__gen-vis/'.length)));
            return file.startsWith(lib) ? file : null;
        }
        if (pathname.startsWith('/fs/'))
            return fileURLToPath(`file://${pathname.slice('/fs'.length)}`);
        if (root) {
            const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
            return within(root, file) ? file : null;
        }
    } catch {
        // (ERR_INVALID_FILE_URL_PATH, URIError)
    }
    return null;
};

/**
 * The directories whose files (and the ones of their subdirectories) a
 * chart may read: `base` (the root and the allowed directories of the
 * exporter) and the ones of the definition file `def`, of its data file
 * (`data`) and of its stylesheet files (`css`, texts of css are none).
 * Not the ones of its parents: a definition is code from somewhere else,
 * a parent of its choice, e.g. "../.config/x.json", must not open a
 * directory, so a parent outside of them needs --root (see docs/export.md).
 */
export const chartDirs = (def, { base = [], data = null, css = [] } = {}) => [...new Set([
    ...base.filter(d => d != null).map(d => path.resolve(d)),
    ...[def, ...(data != null ? [data] : []), ...css.filter(c => !c.includes('{'))].map(f => path.dirname(path.resolve(f))),
])];

// the reason a file is not answered, null of an allowed one; by its path
// (`..` resolved), links in the directories are followed: they are the
// choice of the owner of the directory, not of the definition
export const refusal = (file, dirs) => dirs.some(d => within(d, path.resolve(file))) ? null
    : `${file} is outside the directories gen-vis reads (of the definition, --root, --data and --css; --root <dir> of a directory above them allows it)`;

// the answer of a request of the origin of the page, of the files in
// `dirs` (and the files of the package)
const answer = (url, root, dirs) => {
    if (new URL(url).pathname == '/__print.html')
        return { responseCode: 200, type: 'text/html', body: Buffer.from(printPage) };
    const file = fileOf(url, root);
    const refused = file && refusal(file, [lib, ...dirs]);
    if (refused)
        return { responseCode: 403, type: 'text/plain', body: Buffer.from(`refused: ${refused}`), refused };
    if (!file || !existsSync(file) || !statSync(file).isFile())
        return { responseCode: 404, type: 'text/plain', body: Buffer.from(`not found: ${file ?? `${url}${root ? '' : ' (a site-absolute path needs --root)'}`}`) };
    return { responseCode: 200, type: types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', body: readFileSync(file) };
};

/**
 * The exporter of one browser for several charts: `exportChart(def,
 * outputs, options)` draws the definition file `def` and writes the
 * outputs (paths of .svg, .png and .pdf), `evaluate(expression)` is the
 * value of an expression of the export page, `close()` ends the browser.
 * `browser` is its path (see findBrowser), `sandbox: false` runs it
 * without its sandbox, `root` is the directory of site-absolute paths
 * (e.g. "/geo/europe.json"), `allow` more directories whose files the
 * page may read (besides the ones of each chart, see exportChart),
 * `allowNet: true` lets the requests of http(s) urls of other origins
 * through (by default they fail), `note(text)` gets the notes, e.g. the
 * warnings of the page.
 */
export const createExporter = async ({ browser, sandbox = true, root, allow = [], allowNet = false, note = () => {} } = {}) => {
    root = root == null ? null : path.resolve(root);
    if (root && !(existsSync(root) && statSync(root).isDirectory()))
        throw new Error(`the root ${root} is no directory`);
    // the directories of the files the page may read: of the exporter and
    // of the chart being drawn
    const base = [root, ...allow].filter(d => d != null).map(d => path.resolve(d));
    let dirs = base;
    if (!existsSync(path.join(lib, 'export.html')))
        throw new Error(`the export page ${path.join(lib, 'export.html')} is missing, it is built by npm run lib`);
    const cdp = await launch(findBrowser(browser), { sandbox, note });
    const sessions = new Set();
    let messages = [];
    // the answer of a request of another origin, fetched by the program
    const proxy = async ({ url, method, headers, postData }, requestId, sessionId) => {
        try {
            const response = await fetch(url, { method, headers, body: postData });
            const body = Buffer.from(await response.arrayBuffer());
            // (of any server, also one without the headers of CORS)
            const responseHeaders = [...response.headers].filter(([name]) => !/^(content-encoding|content-length|transfer-encoding|access-control-.*)$/i.test(name))
                .map(([name, value]) => ({ name, value })).concat({ name: 'Access-Control-Allow-Origin', value: '*' });
            await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: response.status, responseHeaders, body: body.toString('base64') }, sessionId);
        } catch (error) {
            messages.push(`error: ${url}: ${error.cause?.message ?? error.message}`);
            await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }, sessionId).catch(() => {});
        }
    };
    try {
        cdp.on('Fetch.requestPaused', ({ requestId, request }, sessionId) => {
            const { protocol, origin: of } = new URL(request.url);
            if (of != origin) {
                // other origins: http(s) with allowNet, nothing else (e.g. ws:),
                // fetched by the program, so the rules of the browser for the
                // requests of a page of another origin (CORS, the ones of
                // the local network) do not apply, as for the files
                if (allowNet && (protocol == 'http:' || protocol == 'https:'))
                    return proxy(request, requestId, sessionId);
                messages.push(`error: refused ${request.url}: requests to other origins need --allow-net (allowNet)`);
                return cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {});
            }
            let answered;
            try {
                answered = answer(request.url, root, dirs);
            } catch (error) {
                // (e.g. a file which cannot be read)
                answered = { responseCode: 500, type: 'text/plain', body: Buffer.from(`error: ${error.message}`) };
            }
            const { responseCode, type, body, refused } = answered;
            if (refused)
                messages.push(`error: refused ${refused}`);
            cdp.send('Fetch.fulfillRequest', {
                requestId, responseCode, body: body.toString('base64'),
                responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }],
            }, sessionId).catch(() => {});
        });
        cdp.on('Runtime.consoleAPICalled', ({ type, args }, sessionId) => {
            if (sessions.has(sessionId) && (type == 'warning' || type == 'error'))
                messages.push(`${type}: ${args.map(a => a.value ?? a.description ?? '').join(' ')}`);
        });
        cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }, sessionId) => {
            if (sessions.has(sessionId))
                messages.push(`error: ${d.exception?.description ?? d.text}`);
        });

        // a page of the origin, its files are answered by `answer`
        const page = async url => {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            sessions.add(sessionId);
            const send = (method, params) => cdp.send(method, params, sessionId);
            // every request, the ones of other origins too (see above)
            await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
            await send('Page.enable');
            await send('Runtime.enable');
            // the background of the images is the one of the chart, none of none
            await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
            const loaded = cdp.once('Page.loadEventFired', sessionId);
            const { errorText } = await send('Page.navigate', { url });
            if (errorText)
                throw new Error(`the page ${url} could not be loaded: ${errorText}`);
            await loaded;
            return { send, sessionId };
        };
        const evaluate = async (p, expression) => {
            const { result, exceptionDetails } = await p.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (exceptionDetails)
                throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
            return result.value;
        };

        const exporter = await page(`${origin}/__gen-vis/export.html`);
        if (await evaluate(exporter, 'typeof window.genVisExport') != 'function')
            throw new Error(`the export page has no genVisExport: ${messages.join(' ')}`);
        let printer = null;

        // the PDF of an SVG of the size of the box, printed by the browser
        const pdfOf = async (svg, box) => {
            printer ??= await page(`${origin}/__print.html`);
            await evaluate(printer, `document.body.innerHTML = ${JSON.stringify(svg)}; document.fonts.ready.then(() => true)`);
            // the size of the page is rounded by the browser, e.g. 16.02cm of 16cm
            const { data } = await printer.send('Page.printToPDF', {
                paperWidth: box.width / 96, paperHeight: box.height / 96, printBackground: true, pageRanges: '1',
                marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
            });
            return Buffer.from(data, 'base64');
        };

        /**
         * Draws the definition file `def` and writes the `outputs`, the
         * options are the ones of genVisExport (docs/export.md)
         * with files instead of urls (`data`, `css` files or texts) and
         * `scale` (pixels of the PNG per CSS pixel, default 2) or `dpi`.
         * Returns the result of genVisExport without the SVG, the notes of
         * the page (`messages`, the warnings and errors of its console) and
         * the size of the PNG in pixels (`png`, of a PNG output). `strict`:
         * a warning of the page is an error, no output is written.
         */
        const exportChart = async (def, outputs, { data, css = [], scale, dpi, strict = false, ...options } = {}) => {
            const kinds = outputs.map(o => path.extname(o).slice(1).toLowerCase());
            const unknown = outputs.filter((o, i) => !formats.includes(kinds[i]));
            if (unknown.length)
                throw new Error(`unknown formats of ${unknown.join(', ')}, expected .${formats.join(', .')}`);
            if (!existsSync(def))
                throw new Error(`the definition ${def} does not exist`);
            // the files of this chart: of the directories of its definition,
            // its data and its stylesheets
            dirs = chartDirs(def, { base, data, css });
            const given = {
                ...options, defUrl: fileUrl(def),
                ...(data != null ? { dataUrl: fileUrl(data) } : {}),
                css: css.map(c => c.includes('{') ? c : fileUrl(c)),
            };
            messages = [];
            // the page of the chart in the front, a page in the background draws no frames
            await exporter.send('Page.bringToFront');
            const r = await evaluate(exporter,
                `window.genVisExport(${JSON.stringify(given)}).then(r => ({ result: r }), e => ({ error: String(e && e.message || e) }))`);
            // the notes of the page without the url of the definition, e.g.
            // "warning: marks[0]: none of its rows is drawn, ..."
            const own = `gen-vis ${given.defUrl}: `;
            messages = messages.map(m => m.replace(own, ''));
            if (r.error)
                throw Object.assign(new Error(r.error), { messages: messages.filter(m => !m.includes(r.error)) });
            if (strict && messages.length)
                throw Object.assign(new Error(`${messages.length} warning${messages.length > 1 ? 's' : ''} of the draw (--strict), no output is written`), { messages: [...messages] });
            const { svg, box } = r.result;
            // the pixels of the PNG: of the scale of the dpi, its width a whole number of them
            const perPx = dpi ? dpi / 96 : (scale ?? 2);
            const pngScale = Math.max(1, Math.round(box.width * perPx)) / box.width;
            let pdf = null;
            let pngSize = null;
            for (const [i, out] of outputs.entries()) {
                mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
                if (kinds[i] == 'svg')
                    writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
                else if (kinds[i] == 'png') {
                    const { data: png } = await exporter.send('Page.captureScreenshot', {
                        format: 'png', clip: { ...box, scale: pngScale }, captureBeyondViewport: true,
                    });
                    const bytes = Buffer.from(png, 'base64');
                    // the size of the image of its header, in pixels
                    pngSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
                    writeFileSync(out, bytes);
                } else
                    writeFileSync(out, pdf ??= await pdfOf(svg, box));
            }
            const { svg: _, ...rest } = r.result;
            return { ...rest, messages: [...messages], ...(pngSize ? { png: pngSize } : {}) };
        };

        // the value of an expression of the export page (awaited), e.g. of
        // genVisExport.resolve or of options with functions, which the
        // command line has not
        const evaluatePage = expression => evaluate(exporter, expression);

        return { exportChart, evaluate: evaluatePage, close: () => cdp.close() };
    } catch (error) {
        await cdp.close();
        throw error;
    }
};
