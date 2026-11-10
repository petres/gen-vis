// the CLI of the static export (bin/gen-vis.js) in a browser of the system,
// only if there is one (see browser.js), skipped otherwise; the export page
// is built if it is missing or older than the sources
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, browser, buildExportPage, buildPackage } from './browser.js';
import { createExporter, fileUrl } from '../bin/export.js';

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

// a definition of the data of bev (data/bev/data.csv, copied to `dir`, the
// export reads only the files of the directory of a definition) in `dir`,
// its dims and marks changed by `change`
const bevData = dir => {
    writeFileSync(path.join(dir, 'bev.csv'), readFileSync(path.join(root, 'data/bev/data.csv')));
    return 'bev.csv';
};
const bevDef = (dir, change = d => d) => {
    const def = JSON.parse(readFileSync(path.join(root, 'data/bev/def.json'), 'utf8'));
    def.data = bevData(dir);
    return change(def);
};

describe('gen-vis check', () => {
    let dir;
    beforeAll(() => {
        buildPackage();
        dir = mkdtempSync(path.join(tmpdir(), 'gen-vis-check-'));
    }, 120000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    // a definition file in `dir`
    const file = (name, def) => {
        writeFileSync(path.join(dir, name), typeof def == 'string' ? def : JSON.stringify(def));
        return path.join(dir, name);
    };

    test('a definition without warnings, with the rows of its data (CSV and parquet)', async () => {
        const r = await run(['check', 'data/bev/def.json', 'data/bev/def-parquet.json']);
        expect(r.stdout).toBe('');
        expect(r.stderr).toBe('gen-vis: 2 definitions, 0 warnings\n');
        expect(r.code).toBe(0);
    });

    test('the warnings of the schema, of validateDef and of the data, a line per warning; --strict', async () => {
        const typos = file('typos.json', bevDef(dir, d => {
            const [x] = Object.keys(d.dims);
            d.dims[x] = { ...(typeof d.dims[x] == 'string' ? { column: d.dims[x] } : d.dims[x]), column: 'Jahrr' };
            d.marks = [{ type: 'lines', by: 'land', stak: true, 'strok-width': 2 }];
            d.titel = 'x';
            return d;
        }));
        const r = await run(['check', typos, 'data/bev/def.json']);
        const lines = r.stdout.split('\n').filter(Boolean);
        expect(lines.every(l => l.startsWith(`${typos}: `))).toBe(true);
        expect(lines.map(l => l.slice(typos.length + 2))).toEqual(expect.arrayContaining([
            "titel: unknown key, did you mean 'title'?",
            expect.stringMatching(/^dims\.\w+\.column: 'Jahrr' is not a column of the data, did you mean 'Jahr'\?$/),
            "marks[0].type: unknown type 'lines' of the coordinate system 'cartesian', did you mean 'line'?",
            "marks[0].stak: unknown key, did you mean 'stack'? (other keys are attributes of the elements)",
            "marks[0].strok-width: no attribute of svg, did you mean 'stroke-width'?",
        ]));
        expect(r.stderr).toBe(`gen-vis: 2 definitions, ${lines.length} warnings in 1\n`);
        expect(r.code).toBe(0);
        expect((await run(['check', '--strict', typos])).code).toBe(1);
        expect((await run(['check', '--strict', 'data/bev/def.json'])).code).toBe(0);
        // the data of --data instead of the one of the definition
        writeFileSync(path.join(dir, 'other.csv'), 'year,value\n2020,1\n');
        const other = await run(['check', 'data/bev/def.json', '--data', path.join(dir, 'other.csv')]);
        expect(other.stdout).toMatch(/is not a column of the data/);
        // the warnings of the data, e.g. CSV of semicolons
        writeFileSync(path.join(dir, 'semi.csv'), 'year;value\n2020;1,5\n');
        const semi = await run(['check', 'data/bev/def.json', '--data', path.join(dir, 'semi.csv')]);
        expect(semi.stdout).toContain(`data/bev/def.json: data ${path.join(dir, 'semi.csv')}: the CSV has one column 'year;value', its values are separated by semicolons`);
    }, 60000);

    test('errors: a missing file or parent, invalid JSON, no $schema; a definition of 4.x is checked as migrated', async () => {
        const broken = file('broken.json', '{ "dims": ');
        const orphan = file('orphan.json', { $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', parent: 'nothing.json' });
        const none = file('none.json', { dims: {} });
        const old = file('old.json', { $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json', data: bevData(dir),
            mapping: { x: { column: 'Jahr', type: 'numeric' }, y: { column: 'Wert', type: 'numeric' } }, plot: { type: 'line' } });
        const r = await run(['check', broken, orphan, none, path.join(dir, 'missing.json'), old]);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain(`gen-vis: ${broken}: invalid JSON:`);
        expect(r.stderr).toContain(`gen-vis: ${orphan}: the file ${path.join(dir, 'nothing.json')} does not exist`);
        expect(r.stderr).toMatch(new RegExp(`gen-vis: ${none}: '${none}' is no definition of gen-vis 5: its \\$schema is missing`));
        expect(r.stderr).toContain(`gen-vis: ${path.join(dir, 'missing.json')}: the definition ${path.join(dir, 'missing.json')} does not exist`);
        expect(r.stdout).toContain(`${old}: note: a definition of gen-vis 4, checked as migrated`);
        expect(r.stderr).toMatch(/gen-vis: 5 definitions, \d+ warnings?( in 1)?, 4 not read\n$/);
    }, 60000);

    test('only the files the export reads: of the directories of the definition, --root and --data, not of its parents', async () => {
        const sub = mkdtempSync(path.join(dir, 'files-'));
        const inner = path.join(sub, 'charts');
        spawnSync('mkdir', ['-p', inner]);
        writeFileSync(path.join(sub, 'secret.csv'), 'SECRET-abc,def\n1,2\n');
        writeFileSync(path.join(sub, 'cfg.json'), '{}');
        const def = { $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', dims: { y: 'nope' }, marks: { type: 'point' } };
        for (const changed of [{ data: '../secret.csv' }, { parent: '../cfg.json', data: '../secret.csv' }, { parent: '../secret.csv', data: 'x.csv' }]) {
            writeFileSync(path.join(inner, 'leak.json'), JSON.stringify({ ...def, ...changed }));
            const r = await run(['check', path.join(inner, 'leak.json')]);
            expect(r.code).toBe(1);
            expect(r.stderr).toMatch(/refused: .* is outside the directories gen-vis reads/);
            expect(r.stdout + r.stderr).not.toContain('SECRET');
        }
        writeFileSync(path.join(inner, 'leak.json'), JSON.stringify({ ...def, parent: '../cfg.json', data: '../secret.csv' }));
        const rooted = await run(['check', path.join(inner, 'leak.json'), '--root', sub]);
        expect(rooted.stdout).toContain("'nope' is not a column of the data");
    }, 60000);

    test('the usage and the version', async () => {
        expect((await run(['check'])).code).toBe(2);
        expect((await run(['check', '--help'])).stdout).toContain('gen-vis check <def.json>...');
        const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
        expect((await run(['--version'])).stdout).toBe(`gen-vis ${version}\n`);
    });
});

describe.skipIf(!browser)('gen-vis export', () => {
    let dir;
    beforeAll(() => {
        buildExportPage();
        buildPackage();
        dir = mkdtempSync(path.join(tmpdir(), 'gen-vis-cli-'));
    }, 120000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test('an SVG, a PNG and a PDF of 16cm at 300 dpi', async () => {
        const out = ['bev.svg', 'bev.png', 'bev.pdf'].map(f => path.join(dir, f));
        const r = await run(['export', 'data/bev/def.json', ...out, '--width', '16cm', '--dpi', '300']);
        expect(r.stderr.replace(/^gen-vis: the browser has no sandbox.*\n/m, '')).toBe('');
        expect(r.code).toBe(0);
        // the size of the chart in CSS pixels and the one of the PNG in its pixels
        expect(r.stdout).toMatch(new RegExp(`^data/bev/def\\.json -> .*bev\\.svg, .*bev\\.png, .*bev\\.pdf \\(605x\\d+ CSS px, PNG ${Math.round(16 / 2.54 * 300)}x\\d+ px, [\\d.]+ s\\)`));

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
        expect(r.stdout).toContain(`PNG ${pw}x${ph} px`);
        expect(Math.abs(ph - h * 300 / 96)).toBeLessThan(2);

        // the default font of gen-vis, Inter of the package, also where the
        // computer has none, in the PDF too
        expect(svg).toMatch(/font-family="Inter,/);
        expect(readFileSync(out[2], 'latin1')).toMatch(/\/BaseFont\s*\/[A-Z]+\+Inter-Regular/);

        // the page of the PDF is rounded by the browser, e.g. 16.02cm
        const [mw, mh] = pdfSize(out[2]);
        expect(Math.abs(mw - 16 / 2.54 * 72)).toBeLessThan(1);
        expect(Math.abs(mh - h * 72 / 96)).toBeLessThan(1);
    }, 60000);

    test('the parts, a scheme, the font size and several charts of one browser', async () => {
        const def = JSON.parse(readFileSync(path.join(root, 'data/bev/def.json'), 'utf8'));
        def.data = bevData(dir);
        const land = Object.entries(def.dims).find(([, m]) => m.legend)?.[0];
        def.dims[land] = { ...def.dims[land], scheme: 'house', fromData: true };
        delete def.dims[land].categories;
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
        writeFileSync(path.join(dir, 'kind.json'), JSON.stringify({ parent: 'house.json', title: 'Kind' }));
        const exporter = await createExporter({ browser, allow: [dir] });
        try {
            const url = JSON.stringify(fileUrl(path.join(dir, 'kind.json')));
            const merged = await exporter.evaluate(`genVisExport.resolve({ defUrl: ${url} })`);
            expect(merged.title).toBe('Kind');
            expect(merged.marks).toEqual(JSON.parse(readFileSync(path.join(dir, 'house.json'), 'utf8')).marks);
            const r = await exporter.evaluate(`genVisExport({ defUrl: ${url}, schemes: async merged => ({
                house: [merged.marks.length ? '#ABCDEF' : '#000000', '#FEDCBA'] }) }).then(r => r.svg)`);
            expect(r).toMatch(/stroke="#ABCDEF"/);
            expect(r).toMatch(/stroke="#FEDCBA"/);
            await expect(exporter.evaluate(`genVisExport.resolve({ def: { parent: 'missing.json' }, baseUrl: ${url} })`))
                .rejects.toThrow(/Could not load '.*missing\.json': 404/);
        } finally {
            await exporter.close();
        }
    }, 60000);

    test('the width of the export wins over the one of the definition, which is the default', async () => {
        writeFileSync(path.join(dir, 'narrow.json'), JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', width: 300, height: 200, dims: { x: { column: 'year', type: 'numeric' }, y: 'value' },
            marks: { type: 'line' }, data: 'narrow.csv' }));
        writeFileSync(path.join(dir, 'narrow.csv'), 'year,value\n2020,1\n2021,2\n');
        const exporter = await createExporter({ browser, allow: [dir] });
        try {
            const url = JSON.stringify(fileUrl(path.join(dir, 'narrow.json')));
            // the width of the svg of the plots in the image
            const of = options => exporter.evaluate(`genVisExport({ defUrl: ${url}${options} }).then(r =>
                [r.width, Number(document.querySelector('.gen-vis-export svg.vis-svg, svg.vis-svg').getAttribute('width'))])`);
            const [wide, wideChart] = await of(', width: 800');
            expect(wide).toBeCloseTo(800, 0);
            expect(wideChart).toBeCloseTo(770, 0);
            const [own, ownChart] = await of('');
            expect(own).toBeCloseTo(330, 0);
            expect(ownChart).toBeCloseTo(300, 0);
        } finally {
            await exporter.close();
        }
    }, 60000);

    test('the symbols of units in Inter of the package, e.g. CO₂, m³, ≤, →', async () => {
        writeFileSync(path.join(dir, 'units.csv'), 'year,value\n2020,1\n2021,2\n');
        writeFileSync(path.join(dir, 'units.json'), JSON.stringify({
            $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json', data: 'units.csv',
            options: { title: 'CO₂ in m³ ≤ 2 → ½ ℃ ●', subtitle: 'Mt CO₂-Äquivalente ≥ 0', height: 200 },
            mapping: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric' } },
            plot: { type: 'line' },
        }));
        const pdf = path.join(dir, 'units.pdf');
        const r = await run(['export', path.join(dir, 'units.json'), pdf]);
        expect(r.code).toBe(0);
        // no font of the computer for a glyph Inter has
        const fonts = [...readFileSync(pdf, 'latin1').matchAll(/\/BaseFont\s*\/[A-Z]+\+([\w-]+)/g)].map(m => m[1]);
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.filter(f => !f.startsWith('Inter-'))).toEqual([]);
    }, 60000);

    test('the message of an error of gen-vis', async () => {
        writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json',
            data: bevData(dir), mapping: { x: 'Jahr' }, plot: { type: 'nope' } }));
        const r = await run(['export', path.join(dir, 'broken.json'), path.join(dir, 'broken.svg'), 'data/bev/missing.json', path.join(dir, 'missing.svg')]);
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/broken\.json: .*marks\[0\]\.type: unknown mark type 'nope'/);
        expect(r.stderr).toMatch(/missing\.json: the definition data\/bev\/missing\.json does not exist/);
        expect(existsSync(path.join(dir, 'broken.svg'))).toBe(false);
    }, 60000);

    test('the warnings of the check and of the draw, --no-check, --strict', async () => {
        const typo = path.join(dir, 'typo.json');
        writeFileSync(typo, JSON.stringify(bevDef(dir, d => {
            const [x] = Object.keys(d.dims);
            d.dims[x] = { ...(typeof d.dims[x] == 'string' ? { column: d.dims[x] } : d.dims[x]), column: 'Jahrr' };
            return d;
        })));
        const out = path.join(dir, 'typo.svg');
        const r = await run(['export', typo, out]);
        expect(r.code).toBe(0);
        // the check, then the draw, without the url of the definition
        expect(r.stderr).toMatch(new RegExp(`gen-vis: ${typo}: check: dims\\.\\w+\\.column: 'Jahrr' is not a column of the data, did you mean 'Jahr'\\?`));
        expect(r.stderr).toMatch(new RegExp(`gen-vis: ${typo}: warning: marks\\[0\\]: none of its \\d+ rows is drawn, \\d+ without a value of dim '\\w+' \\(column 'Jahrr' is not in the data\\)`));
        expect(r.stderr).not.toContain('gen-vis.local');
        expect(existsSync(out)).toBe(true);
        const quiet = await run(['export', typo, out, '--no-check']);
        expect(quiet.stderr).not.toContain('check:');
        expect(quiet.stderr).toContain('none of its');
        rmSync(out);
        const strict = await run(['export', typo, out, 'data/bev/def.json', path.join(dir, 'fine.svg'), '--strict']);
        expect(strict.code).toBe(1);
        expect(strict.stderr).toMatch(/warning of the check \(--strict\), no output is written/);
        expect(existsSync(out)).toBe(false);
        expect(existsSync(path.join(dir, 'fine.svg'))).toBe(true);
        // a warning of the draw only
        const drawn = await run(['export', typo, out, '--strict', '--no-check']);
        expect(drawn.code).toBe(1);
        expect(drawn.stderr).toMatch(/\d+ warnings? of the draw \(--strict\), no output is written/);
        expect(existsSync(out)).toBe(false);
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
            // the arrowheads in the color of their marker, not context-stroke
            writeFileSync(path.join(dir, 'arrow.csv'), 'x,y\n1,1\n2,3\n3,2\n');
            writeFileSync(path.join(dir, 'arrow.json'), JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', data: 'arrow.csv',
                width: 300, height: 200, dims: { x: 'x', y: 'y' }, marks: { type: 'line', stroke: '#C3423F', 'marker-end': 'arrow', highlight: { stroke: '#000000' } } }));
            const arrow = await svgOf(path.join(dir, 'arrow.json'));
            expect(arrow).toMatch(/<marker [^>]*>\s*<path [^>]*fill="#C3423F"/);
            expect(arrow).not.toMatch(/context-stroke/);
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
        expect((await run(['--help'])).stdout).toContain('--no-check');
    });
    test('only the files of the directories of the definition, --root and --data (not of its parents); other origins with --allow-net', async () => {
        const base = mkdtempSync(path.join(dir, 'files-'));
        const sub = path.join(base, 'charts');
        const shared = path.join(base, 'shared');
        spawnSync('mkdir', ['-p', sub, shared]);
        const def = bevDef(sub);
        const write = (file, value) => {
            writeFileSync(file, JSON.stringify(value));
            return file;
        };
        // a file of the file system, a relative path out of the directory
        const svg = path.join(dir, 'files.svg');
        writeFileSync(path.join(shared, 'bev.csv'), readFileSync(path.join(root, 'data/bev/data.csv')));
        for (const data of ['/fs/etc/os-release', '../shared/bev.csv', '/fs' + path.join(shared, 'bev.csv')]) {
            const r = await run(['export', write(path.join(sub, 'out.json'), { ...def, data }), svg, '--no-check']);
            expect(r.code).toBe(1);
            expect(r.stderr).toMatch(/refused .* is outside the directories gen-vis reads/);
            expect(r.stderr).toMatch(/403 Forbidden/);
        }
        // a parent opens no directory: a definition chooses its parents, e.g.
        // "../.cfg.json" of a home directory, and then its data beside it;
        // with --root of a directory above both it is drawn (the data of a
        // parent is relative to the definition which is drawn)
        write(path.join(shared, 'base.json'), { ...def, data: '../shared/bev.csv' });
        const child = write(path.join(sub, 'child.json'), { $schema: def.$schema, parent: '../shared/base.json', title: 'Child' });
        const refused = await run(['export', child, svg]);
        expect(refused.code).toBe(1);
        expect(refused.stderr).toMatch(/refused .*shared\/base\.json is outside the directories gen-vis reads/);
        expect(refused.stderr).not.toMatch(/check:/);
        expect((await run(['export', child, svg, '--root', base])).code).toBe(0);
        // the check of the export reads no file outside either, e.g. the
        // header of a file in a message of an unknown column
        writeFileSync(path.join(shared, 'secret.csv'), 'SECRET-abc,def\n1,2\n');
        const leak = await run(['export', write(path.join(sub, 'leak.json'), { ...def, data: '../shared/secret.csv' }), svg]);
        expect(leak.code).toBe(1);
        expect(leak.stderr).not.toContain('SECRET');
        // a path of an encoded "/" or a malformed escape is no file, the
        // other charts of the run are drawn
        const encoded = await run(['export', write(path.join(sub, 'enc.json'), { ...def, data: '/fs/tmp/x%2F.ssh/id' }), svg,
            write(path.join(sub, 'bad.json'), { ...def, data: '/%E0%A4%A.csv' }), svg, write(path.join(sub, 'ok.json'), def), svg, '--no-check', '--root', base]);
        expect(encoded.stderr).not.toMatch(/TypeError|URIError|    at /);
        expect(encoded.stderr).toMatch(/enc\.json: .*404/);
        expect(encoded.stderr).toMatch(/bad\.json: .*404/);
        expect(encoded.stdout).toMatch(/ok\.json -> /);
        expect(encoded.code).toBe(1);
        // allowed: --root and --data
        const up = write(path.join(sub, 'up.json'), { ...def, data: '../shared/bev.csv' });
        expect((await run(['export', up, svg, '--no-check', '--root', base])).code).toBe(0);
        expect((await run(['export', write(path.join(sub, 'os.json'), { ...def, data: '/fs/etc/os-release' }), svg, '--no-check',
            '--data', path.join(shared, 'bev.csv')])).code).toBe(0);

        // another origin: refused, with --allow-net loaded
        const http = await import('node:http');
        let requests = 0;
        const server = http.createServer((req, res) => {
            requests++;
            // (without the headers of CORS, the program fetches it)
            res.writeHead(200, { 'Content-Type': 'text/csv' });
            res.end(readFileSync(path.join(root, 'data/bev/data.csv')));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const remote = write(path.join(sub, 'remote.json'), { ...def, data: `http://127.0.0.1:${server.address().port}/bev.csv` });
            const refused = await run(['export', remote, svg, '--no-check']);
            expect(refused.code).toBe(1);
            expect(refused.stderr).toMatch(/refused http:\/\/127\.0\.0\.1:\d+\/bev\.csv: requests to other origins need --allow-net/);
            expect(requests).toBe(0);
            const allowed = await run(['export', remote, svg, '--no-check', '--allow-net']);
            expect(allowed.stderr).not.toMatch(/refused/);
            expect(allowed.code).toBe(0);
            expect(requests).toBe(1);
        } finally {
            server.close();
        }
    }, 120000);
    test('site-absolute paths are files of --root', async () => {
        // a site: the data at /bev/data.csv, the definition elsewhere
        const site = mkdtempSync(path.join(dir, 'site-'));
        const bev = path.join(site, 'bev');
        spawnSync('mkdir', ['-p', bev]);
        writeFileSync(path.join(bev, 'data.csv'), readFileSync(path.join(root, 'data/bev/data.csv')));
        const def = JSON.parse(readFileSync(path.join(root, 'data/bev/def.json'), 'utf8'));
        const file = path.join(dir, 'absolute.json');
        writeFileSync(file, JSON.stringify({ ...def, data: '/bev/data.csv' }));
        const out = path.join(dir, 'absolute.svg');
        const without = await run(['export', file, out]);
        expect(without.code).toBe(1);
        expect(without.stderr).toContain('/bev/data.csv');
        expect(without.stderr).toContain('set --root');
        const r = await run(['export', file, out, '--root', site]);
        expect(r.stderr).not.toContain('Could not load');
        expect(r.code).toBe(0);
        expect(readFileSync(out, 'utf8')).toContain('<svg');
        // no path out of the root, and the root must exist
        const outside = path.join(dir, 'outside.json');
        writeFileSync(path.join(dir, 'secret.csv'), readFileSync(path.join(root, 'data/bev/data.csv')));
        writeFileSync(outside, JSON.stringify({ ...def, data: '/..%2Fsecret.csv' }));
        expect((await run(['export', outside, path.join(dir, 'outside.svg'), '--root', site])).code).toBe(1);
        const missing = await run(['export', file, out, '--root', path.join(dir, 'nothing')]);
        expect(missing.code).toBe(1);
        expect(missing.stderr).toContain('is no directory');
    }, 120000);
});
