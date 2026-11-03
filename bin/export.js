// the static export of the CLI (gen-vis export, see bin/gen-vis.js and
// README "Static export"): a headless browser (bin/cdp.js) loads the export
// page of dist-lib (export.html) and calls its genVisExport, the PNG is a
// screenshot of the box of the image, the PDF the print of the SVG, so PDF
// and SVG are the same drawing. The files reach the page without a server:
// the requests of the origin of the page are answered by the program
// (Fetch of CDP), `/fs/<path>` is the file of the file system, so a
// definition loads its data and its parents relative to its own file.
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
const printPage = '<!doctype html><html><head><meta charset="utf-8"><style>@page { margin: 0; } html, body { margin: 0; } svg { display: block; }</style></head><body></body></html>';

// the file of an url of the page, null if it is not one
const fileOf = url => {
    const { pathname } = new URL(url);
    if (pathname.startsWith('/__gen-vis/')) {
        const file = path.resolve(lib, decodeURIComponent(pathname.slice('/__gen-vis/'.length)));
        return file.startsWith(lib) ? file : null;
    }
    if (pathname.startsWith('/fs/'))
        return fileURLToPath(`file://${pathname.slice('/fs'.length)}`);
    return null;
};

// the answer of a request of the page
const answer = url => {
    if (new URL(url).pathname == '/__print.html')
        return { responseCode: 200, type: 'text/html', body: Buffer.from(printPage) };
    const file = fileOf(url);
    if (!file || !existsSync(file) || !statSync(file).isFile())
        return { responseCode: 404, type: 'text/plain', body: Buffer.from(`not found: ${file ?? url}`) };
    return { responseCode: 200, type: types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', body: readFileSync(file) };
};

/**
 * The exporter of one browser for several charts: `exportChart(def,
 * outputs, options)` draws the definition file `def` and writes the
 * outputs (paths of .svg, .png and .pdf), `evaluate(expression)` is the
 * value of an expression of the export page, `close()` ends the browser.
 * `browser` is its path (see findBrowser), `sandbox: false` runs it
 * without its sandbox, `note(text)` gets the notes, e.g. the warnings of
 * the page.
 */
export const createExporter = async ({ browser, sandbox = true, note = () => {} } = {}) => {
    if (!existsSync(path.join(lib, 'export.html')))
        throw new Error(`the export page ${path.join(lib, 'export.html')} is missing, it is built by npm run lib`);
    const cdp = await launch(findBrowser(browser), { sandbox, note });
    const sessions = new Set();
    let messages = [];
    try {
        cdp.on('Fetch.requestPaused', ({ requestId, request }, sessionId) => {
            const { responseCode, type, body } = answer(request.url);
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
            await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*` }] });
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
         * options are the ones of genVisExport (README "Static export")
         * with files instead of urls (`data`, `css` files or texts) and
         * `scale` (pixels of the PNG per CSS pixel, default 2) or `dpi`.
         * Returns the result of genVisExport without the SVG and the notes
         * of the page.
         */
        const exportChart = async (def, outputs, { data, css = [], scale, dpi, ...options } = {}) => {
            const kinds = outputs.map(o => path.extname(o).slice(1).toLowerCase());
            const unknown = outputs.filter((o, i) => !formats.includes(kinds[i]));
            if (unknown.length)
                throw new Error(`unknown formats of ${unknown.join(', ')}, expected .${formats.join(', .')}`);
            if (!existsSync(def))
                throw new Error(`the definition ${def} does not exist`);
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
            if (r.error)
                throw Object.assign(new Error(r.error), { messages: messages.filter(m => !m.includes(r.error)) });
            const { svg, box } = r.result;
            // the pixels of the PNG: of the scale of the dpi, its width a whole number of them
            const perPx = dpi ? dpi / 96 : (scale ?? 2);
            const pngScale = Math.max(1, Math.round(box.width * perPx)) / box.width;
            let pdf = null;
            for (const [i, out] of outputs.entries()) {
                mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
                if (kinds[i] == 'svg')
                    writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
                else if (kinds[i] == 'png') {
                    const { data: png } = await exporter.send('Page.captureScreenshot', {
                        format: 'png', clip: { ...box, scale: pngScale }, captureBeyondViewport: true,
                    });
                    writeFileSync(out, Buffer.from(png, 'base64'));
                } else
                    writeFileSync(out, pdf ??= await pdfOf(svg, box));
            }
            const { svg: _, ...rest } = r.result;
            return { ...rest, messages: [...messages] };
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
