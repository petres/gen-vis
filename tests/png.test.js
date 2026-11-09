// the images of all definitions, drawn by the CLI of the static export
// (bin/gen-vis.js) in a browser of the system (see browser.js, skipped
// without one), compared pixel by pixel with the baselines in tests/png/:
// a change of the code which changes a chart is seen. The definitions are
// drawn in one call, one browser; a test fails when the size of its image
// differs or more than 0.2% of the pixels (threshold 0.1 of pixelmatch),
// the diff is written to tests/png-diff/ then. `UPDATE_PNG=1 npx vitest
// run tests/png.test.js` takes the new images, a missing baseline is
// written too. The width of 720 px keeps the images small (the polar
// charts double in size at 800 px).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { root, browser, buildExportPage } from './browser.js';

const baselines = path.join(root, 'tests/png');
const diffs = path.join(root, 'tests/png-diff');
const update = process.env.UPDATE_PNG == '1';
const relative = file => path.relative(root, file);

// the definitions: the ones of data/ without the geo data and the mixins
// (`_*.json`), the examples of the site and the chart of the examples of the
// use (site/public/charts/)
const defs = [
    ...readdirSync(path.join(root, 'data'), { recursive: true }).map(f => f.replaceAll(path.sep, '/'))
        .filter(f => f.endsWith('.json') && !f.startsWith('geo/') && !path.basename(f).startsWith('_')).map(f => `data/${f}`),
    ...readdirSync(path.join(root, 'site/examples')).filter(f => f.endsWith('.json')).map(f => `site/examples/${f}`),
    'site/public/charts/seasons.json',
].sort();

// the name of the image of a definition, e.g. data__bev__def
const nameOf = def => def.replace(/\.json$/, '').replaceAll('/', '__');

describe.skipIf(!browser)('the images of the definitions', () => {
    let dir, result;
    beforeAll(() => {
        buildExportPage();
        dir = mkdtempSync(path.join(tmpdir(), 'gen-vis-png-'));
        // the data of the examples of the site is relative to its page
        // (site/public/data/), not to their files: copies next to a link to it
        const site = path.join(dir, 'site');
        mkdirSync(site);
        symlinkSync(path.join(root, 'site/public/data'), path.join(site, 'data'));
        const args = defs.flatMap(def => {
            let file = path.join(root, def);
            if (def.startsWith('site/examples/')) {
                copyFileSync(file, path.join(site, path.basename(def)));
                file = path.join(site, path.basename(def));
            }
            return [file, path.join(dir, `${nameOf(def)}.png`)];
        });
        // --root: the files of the repository, e.g. the maps of data/geo/ of data/bev/
        result = spawnSync(process.execPath, [path.join(root, 'bin/gen-vis.js'), 'export', ...args, '--width', '720', '--dpi', '96', '--root', root],
            { cwd: root, encoding: 'utf8', timeout: 120000 });
        result.stderr = result.stderr.replace(/^gen-vis: the browser has no sandbox.*\n/m, '');
    }, 150000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test.each(defs)('%s', def => {
        const name = nameOf(def);
        const image = path.join(dir, `${name}.png`);
        const baseline = path.join(baselines, `${name}.png`);
        const diff = path.join(diffs, `${name}.png`);
        expect(existsSync(image), `${def} was not drawn (${result.status}${result.signal ? `, ${result.signal}` : ''}):\n${result.stderr}`).toBe(true);
        if (update || !existsSync(baseline)) {
            const what = existsSync(baseline) ? 'updated' : 'created';
            mkdirSync(baselines, { recursive: true });
            copyFileSync(image, baseline);
            process.stderr.write(`${what} ${relative(baseline)}\n`);
            return;
        }
        const a = PNG.sync.read(readFileSync(image));
        const b = PNG.sync.read(readFileSync(baseline));
        expect(`${a.width}x${a.height}`, `${def}: the size differs from ${relative(baseline)}, UPDATE_PNG=1 takes the new image`).toBe(`${b.width}x${b.height}`);
        const d = new PNG({ width: a.width, height: a.height });
        const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
        const share = n / (a.width * a.height);
        if (share > 0.002) {
            mkdirSync(diffs, { recursive: true });
            writeFileSync(diff, PNG.sync.write(d));
        } else
            rmSync(diff, { force: true });
        expect(share, `${def}: ${n} pixels (${(share * 100).toFixed(2)}%) differ from ${relative(baseline)}, see ${relative(diff)}, UPDATE_PNG=1 takes the new image`).toBeLessThanOrEqual(0.002);
    });
});
