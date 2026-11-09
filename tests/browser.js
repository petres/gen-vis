// the helpers of the tests which draw in a browser of the system (Chromium,
// Chrome or Edge, see bin/cdp.js): `browser` is the one found, null without
// one (the tests are skipped), `buildExportPage()` builds the export page
// of the CLI (dist-lib/export.html, `vite build --mode module`) if it is
// missing or older than the sources, `buildPackage()` the package (dist/,
// of the check of the CLI)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findBrowser } from '../bin/cdp.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const browser = (() => {
    try {
        return findBrowser();
    } catch {
        return null;
    }
})();

// the newest change of the files of a directory
const newest = dir => Math.max(...readdirSync(dir, { recursive: true }).map(f => statSync(path.join(dir, f)).mtimeMs));

// the package build (dist/, `vite build`), e.g. dist/check.js of gen-vis
// check, if it is missing or older than the sources
export const buildPackage = () => {
    const check = path.join(root, 'dist/check.js');
    if (existsSync(check) && statSync(check).mtimeMs >= newest(path.join(root, 'src')))
        return;
    const r = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0)
        throw new Error(`the build of the package failed (${r.status}):\n${r.stderr}`);
};

export const buildExportPage = () => {
    const page = path.join(root, 'dist-lib/esm/export.js');
    if (existsSync(path.join(root, 'dist-lib/export.html')) && existsSync(page) && statSync(page).mtimeMs >= newest(path.join(root, 'src')))
        return;
    const r = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'module'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0)
        throw new Error(`the build of the export page failed (${r.status}):\n${r.stderr}`);
};
