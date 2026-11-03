// the CLI of the static export (bin/gen-vis.js) in a browser of the system,
// only if there is one (Chromium, Chrome or Edge, see bin/cdp.js), skipped
// otherwise; the export page is built (vite build --mode module) if it is
// missing or older than the sources
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from './dom.js';
import { findBrowser } from '../bin/cdp.js';
import { createExporter, fileUrl } from '../bin/export.js';

const browser = (() => {
    try {
        return findBrowser();
    } catch {
        return null;
    }
})();

// the newest change of the files of a directory
const newest = dir => Math.max(...readdirSync(dir, { recursive: true }).map(f => statSync(path.join(dir, f)).mtimeMs));

// the CLI of `args`, `env` added to the environment, `started(child)` gets
// its process at once, e.g. of a signal
const run = (args, { env = {}, started = () => {} } = {}) => new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'bin/gen-vis.js'), ...args], { cwd: root, env: { ...process.env, ...env } });
    started(child);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
});

// the processes whose command lines contain a text, e.g. the directory of
// the profile of a browser
const processesOf = text => spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).stdout.split('\n').filter(l => l.includes(text));

// the size of a PNG, of its header
const pngSize = file => {
    const b = readFileSync(file);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

// the size of the first page of a PDF in points
const pdfSize = file => readFileSync(file, 'latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/).slice(1).map(Number);

describe.skipIf(!browser)('gen-vis export', () => {
    let dir;
    beforeAll(() => {
        const page = path.join(root, 'dist-lib/esm/export.js');
        if (!existsSync(path.join(root, 'dist-lib/export.html')) || !existsSync(page) || statSync(page).mtimeMs < newest(path.join(root, 'src')))
            expect(spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'module'], { cwd: root }).status).toBe(0);
        dir = mkdtempSync(path.join(tmpdir(), 'gen-vis-cli-'));
    }, 120000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test('an SVG, a PNG and a PDF of 16cm at 300 dpi', async () => {
        const out = ['bev.svg', 'bev.png', 'bev.pdf'].map(f => path.join(dir, f));
        const r = await run(['export', 'data/bev/def.json', ...out, '--width', '16cm', '--dpi', '300']);
        expect(r.stderr.replace(/^gen-vis: the browser has no sandbox.*\n/m, '')).toBe('');
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^data\/bev\/def\.json -> .*bev\.svg, .*bev\.png, .*bev\.pdf \(605x\d+ px, [\d.]+ s\)/);

        const svg = readFileSync(out[0], 'utf8');
        const [, width, height, w, h] = svg.match(/<svg [^>]*width="([^"]+)" height="([^"]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/);
        expect(width).toBe('16cm');
        expect(Number(w)).toBeCloseTo(16 / 2.54 * 96, 1);
        expect(height).toBe(`${Math.round(h * 2.54 / 96 * 1000) / 1000}cm`);
        // made for Word: no HTML, no styles of CSS, no baselines of CSS, texts as text
        expect(svg).not.toMatch(/foreignObject|<div|<style|style="|class="|var\(|rgba?\(|dominant-baseline|alignment-baseline|paint-order|<image|<use\b|\d+px"/);
        expect(svg).toContain('>Bevölkerung</text>');
        expect(svg).toContain('>Q: Statistik Austria</text>');

        const [pw, ph] = pngSize(out[1]);
        expect(pw).toBe(Math.round(16 / 2.54 * 300));
        expect(Math.abs(ph - h * 300 / 96)).toBeLessThan(2);

        // the page of the PDF is rounded by the browser, e.g. 16.02cm
        const [mw, mh] = pdfSize(out[2]);
        expect(Math.abs(mw - 16 / 2.54 * 72)).toBeLessThan(1);
        expect(Math.abs(mh - h * 72 / 96)).toBeLessThan(1);
    }, 60000);

    test('the parts, a scheme, the font size and several charts of one browser', async () => {
        const def = JSON.parse(readFileSync(path.join(root, 'data/bev/def.json'), 'utf8'));
        def.data = path.relative(dir, path.join(root, 'data/bev/data.csv')).replaceAll(path.sep, '/');
        const land = Object.entries(def.mapping).find(([, m]) => m.legend)?.[0];
        def.mapping[land] = { ...def.mapping[land], scheme: 'house', fromData: true };
        delete def.mapping[land].categories;
        writeFileSync(path.join(dir, 'house.json'), JSON.stringify(def));
        const r = await run(['export',
            'data/bev/def.json', path.join(dir, 'all.svg'),
            path.join(dir, 'house.json'), path.join(dir, 'parts.svg'), path.join(dir, 'parts.png'),
            '--parts', 'legend,plot', '--scheme', 'house=#123456,#654321', '--font-size', '8pt', '--background', 'none']);
        expect(r.code).toBe(0);
        expect(r.stdout.split('\n').filter(Boolean)).toHaveLength(2);
        const all = readFileSync(path.join(dir, 'all.svg'), 'utf8');
        const parts = readFileSync(path.join(dir, 'parts.svg'), 'utf8');
        // the legend and the plot, without the title and the footer, cropped
        expect(all).not.toContain('>Bevölkerung</text>');
        expect(parts).not.toContain('>Q: Statistik Austria</text>');
        expect(parts).toMatch(/stroke="#123456"/);
        expect(parts).toMatch(/stroke="#654321"/);
        // 13px of the legend of 8pt
        expect(parts).toMatch(/font-size="10\.667"/);
        // no background
        expect(parts).not.toMatch(/^<\?xml[^>]*>\n<svg[^>]*><rect x="0" y="0"/);
    }, 60000);

    test('the defaults of the parts, of JSON and of a file', async () => {
        // the lengths and the shifts of the tick marks of the horizontal axis, lines without x1
        const marks = file => new Set([...readFileSync(file, 'utf8').matchAll(/<line stroke="[^"]*" y2="([\d.]+)" transform="matrix\(1 0 0 1 0 (-?[\d.]+)\)"/g)].map(m => `${m[1]} ${m[2]}`));
        writeFileSync(path.join(dir, 'defaults.json'), JSON.stringify({ axis: { padding: 1, tickMarks: { size: 3 } } }));
        const r = await run(['export',
            'data/bev/def.json', path.join(dir, 'json.svg'),
            '--defaults', '{"axis": {"tickMarks": {"size": 4, "inset": 0}}}']);
        expect(r.code).toBe(0);
        const f = await run(['export', 'data/bev/def.json', path.join(dir, 'file.svg'), '--defaults', path.join(dir, 'defaults.json')]);
        expect(f.code).toBe(0);
        const b = await run(['export', 'data/bev/def.json', path.join(dir, 'none.svg')]);
        expect(b.code).toBe(0);
        // outside of the plot area, of the styles 4 pixels inside
        expect(marks(path.join(dir, 'json.svg'))).toEqual(new Set(['4 0']));
        expect(marks(path.join(dir, 'file.svg'))).toEqual(new Set(['3 -4']));
        expect(marks(path.join(dir, 'none.svg'))).toEqual(new Set(['9 -4']));

        const missing = await run(['export', 'data/bev/def.json', path.join(dir, 'x.svg'), '--defaults', path.join(dir, 'missing.json')]);
        expect(missing.code).toBe(2);
        expect(missing.stderr).toMatch(/--defaults is a JSON object or a file of one, .*missing\.json does not exist/);
        expect((await run(['export', 'data/bev/def.json', path.join(dir, 'x.svg'), '--defaults', '{"axis": '])).stderr).toMatch(/--defaults is not JSON/);
    }, 60000);

    test('the merged definition of the page (genVisExport.resolve) and schemes of a function of it', async () => {
        // a definition of the one of house.json (the test before) as parent
        writeFileSync(path.join(dir, 'kind.json'), JSON.stringify({ parent: 'house.json', options: { title: 'Kind' } }));
        const exporter = await createExporter({ browser });
        try {
            const url = JSON.stringify(fileUrl(path.join(dir, 'kind.json')));
            const merged = await exporter.evaluate(`genVisExport.resolve({ defUrl: ${url} })`);
            expect(merged.options.title).toBe('Kind');
            expect(merged.plot).toEqual(JSON.parse(readFileSync(path.join(dir, 'house.json'), 'utf8')).plot);
            const r = await exporter.evaluate(`genVisExport({ defUrl: ${url}, schemes: async merged => ({
                house: [merged.plot.length ? '#ABCDEF' : '#000000', '#FEDCBA'] }) }).then(r => r.svg)`);
            expect(r).toMatch(/stroke="#ABCDEF"/);
            expect(r).toMatch(/stroke="#FEDCBA"/);
            await expect(exporter.evaluate(`genVisExport.resolve({ def: { parent: 'missing.json' }, baseUrl: ${url} })`))
                .rejects.toThrow(/Could not load '.*missing\.json': 404/);
        } finally {
            await exporter.close();
        }
    }, 60000);

    test('the message of an error of gen-vis', async () => {
        writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json',
            data: path.relative(dir, path.join(root, 'data/bev/data.csv')).replaceAll(path.sep, '/'), mapping: { x: 'Jahr' }, plot: { type: 'nope' } }));
        const r = await run(['export', path.join(dir, 'broken.json'), path.join(dir, 'broken.svg'), 'data/bev/missing.json', path.join(dir, 'missing.svg')]);
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/broken\.json: .*Unknown plot type 'nope'/);
        expect(r.stderr).toMatch(/missing\.json: the definition data\/bev\/missing\.json does not exist/);
        expect(existsSync(path.join(dir, 'broken.svg'))).toBe(false);
    }, 60000);

    test('a signal ends the browser and removes its profile', async () => {
        const tmp = mkdtempSync(path.join(tmpdir(), 'gen-vis-cli-tmp-'));
        try {
            // charts enough to be stopped after the first one, the browser runs
            const charts = Array.from({ length: 30 }, (_, i) => ['data/bev/def.json', path.join(dir, `signal-${i}.svg`)]).flat();
            let child;
            const r = run(['export', ...charts], { env: { TMPDIR: tmp }, started: c => {
                child = c;
                c.stdout.once('data', () => c.kill('SIGTERM'));
            } });
            const { code, stderr } = await r;
            expect(child.pid).toBeGreaterThan(0);
            expect(code).toBe(143);
            expect(stderr).not.toMatch(/closed the connection/);
            expect(readdirSync(tmp)).toEqual([]);
            expect(processesOf(tmp)).toEqual([]);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }, 60000);

    test('a browser which does not start leaves no profile', async () => {
        const tmp = mkdtempSync(path.join(tmpdir(), 'gen-vis-cli-tmp-'));
        try {
            const r = await run(['export', 'data/bev/def.json', path.join(dir, 'false.svg'), '--browser', '/bin/false'], { env: { TMPDIR: tmp } });
            expect(r.code).toBe(1);
            expect(r.stderr).toMatch(/the browser ended \(1\)/);
            expect(readdirSync(tmp)).toEqual([]);
            // one without a sandbox, the second start without one fails too
            const fake = path.join(dir, 'fake-browser.sh');
            writeFileSync(fake, '#!/bin/sh\necho "No usable sandbox!" >&2\nexit 1\n', { mode: 0o755 });
            const s = await run(['export', 'data/bev/def.json', path.join(dir, 'false.svg'), '--browser', fake], { env: { TMPDIR: tmp } });
            expect(s.code).toBe(1);
            expect(s.stderr).toMatch(/runs without one[^]*the browser ended \(1\)/);
            expect(readdirSync(tmp)).toEqual([]);
            expect(existsSync(path.join(dir, 'false.svg'))).toBe(false);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }, 60000);

    test('the SVG of other programs: opacities, colors, lengths of texts and textPath', async () => {
        const exporter = await createExporter({ browser });
        try {
            const out = path.join(dir, 'svg11.svg');
            const svgOf = async (def, options = {}) => {
                await exporter.exportChart(def, [out], options);
                return readFileSync(out, 'utf8');
            };
            // the opacity of the svg of the plot once, not twice
            const half = await svgOf('data/bev/def.json', { css: ['.vis-facet svg.vis-svg { opacity: 0.5 }'] });
            expect(half).toMatch(/<g [^>]*\bopacity="0\.5"/);
            expect(half).not.toMatch(/opacity="0\.25"/);
            // colors of oklch() and color() as hex colors
            const colors = await svgOf('data/bev/def.json', { css: ['.vis-header .vis-title { color: oklch(0.5 0.2 250) !important; }',
                '.vis-facet svg path { stroke: color(srgb 1 0 0) !important; }'] });
            expect(colors).not.toMatch(/oklch|color\(/);
            expect(colors).toMatch(/stroke="#FF0000"/);
            expect(colors).toMatch(/<text [^>]*fill="#[0-9A-F]{6}"[^>]*>Bevölkerung<\/text>/);
            // the ticks of d3 (dy="0.71em") in pixels
            expect(colors).toMatch(/dy="[\d.]+"/);
            expect(colors).not.toMatch(/\s(dx|dy|x|y)="[^"]*em"/);
            // the labels along a path of the polar charts of SVG 1.1 too
            const polar = await svgOf('data/ecad/polar-tg.json');
            expect(polar).toMatch(/^<\?xml[^>]*>\n<svg [^>]*xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
            const paths = [...polar.matchAll(/<textPath [^>]*>/g)].map(m => m[0]);
            expect(paths.length).toBeGreaterThan(0);
            paths.forEach(t => expect(t).toMatch(/ href="(#[^"]+)".* xlink:href="\1"/));
        } finally {
            await exporter.close();
        }
    }, 60000);

    test('the schemes of a call are the ones of that call only, the padding is checked', async () => {
        const exporter = await createExporter({ browser });
        try {
            const out = path.join(dir, 'scheme.svg');
            const red = Array.from({ length: 10 }, (_, i) => `#FF00${String(i).padStart(2, '0')}`);
            await exporter.exportChart('data/bev/def.json', [out], { schemes: { tableau10: red, observable10: red } });
            expect(readFileSync(out, 'utf8')).toMatch(/stroke="#FF00\d\d"/);
            await exporter.exportChart('data/bev/def.json', [out]);
            expect(readFileSync(out, 'utf8')).not.toMatch(/stroke="#FF00\d\d"/);
            await expect(exporter.exportChart('data/bev/def.json', [out], { padding: -50 })).rejects.toThrow(/padding is a number of pixels, 0 or more, not -50/);
        } finally {
            await exporter.close();
        }
        for (const padding of ['abc', '-50', ''])
            expect((await run(['export', 'data/bev/def.json', path.join(dir, 'x.svg'), `--padding=${padding}`])).stderr)
                .toMatch(/--padding is a number of 0 or more, not/);
        expect((await run(['export', 'data/bev/def.json', path.join(dir, 'zero.svg'), '--padding', '0'])).code).toBe(0);
    }, 60000);

    test('the usage', async () => {
        const r = await run(['export', 'data/bev/def.json']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('has no output');
        expect((await run(['--help'])).stdout).toContain('Usage: gen-vis export');
    });
});
