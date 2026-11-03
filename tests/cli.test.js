// the CLI of the static export (bin/gen-vis.js) in a browser of the system,
// only if there is one (Chromium, Chrome or Edge, see bin/cdp.js), skipped
// otherwise; the export page is built (vite build --mode module) if it is
// missing or older than the sources
import { describe, test, expect, beforeAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from './dom.js';
import { findBrowser } from '../bin/cdp.js';

const browser = (() => {
    try {
        return findBrowser();
    } catch {
        return null;
    }
})();

// the newest change of the files of a directory
const newest = dir => Math.max(...readdirSync(dir, { recursive: true }).map(f => statSync(path.join(dir, f)).mtimeMs));

const run = args => new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'bin/gen-vis.js'), ...args], { cwd: root });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('exit', code => resolve({ code, stdout, stderr }));
});

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
        return () => rmSync(dir, { recursive: true, force: true });
    }, 120000);

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

    test('the message of an error of gen-vis', async () => {
        writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json',
            data: path.relative(dir, path.join(root, 'data/bev/data.csv')).replaceAll(path.sep, '/'), mapping: { x: 'Jahr' }, plot: { type: 'nope' } }));
        const r = await run(['export', path.join(dir, 'broken.json'), path.join(dir, 'broken.svg'), 'data/bev/missing.json', path.join(dir, 'missing.svg')]);
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/broken\.json: .*Unknown plot type 'nope'/);
        expect(r.stderr).toMatch(/missing\.json: the definition data\/bev\/missing\.json does not exist/);
        expect(existsSync(path.join(dir, 'broken.svg'))).toBe(false);
    }, 60000);

    test('the usage', async () => {
        const r = await run(['export', 'data/bev/def.json']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('has no output');
        expect((await run(['--help'])).stdout).toContain('Usage: gen-vis export');
    });
});
