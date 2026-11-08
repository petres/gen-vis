// the files of data/ a definition of the gallery needs: the definition, its
// parents (and theirs), the data of the definition, of its marks and its
// transforms (lookups) and the geometry of a map, as paths relative to
// data/, see the plugin gallery-data of vite.config.js and tests/site.test.js
import { readFileSync } from 'node:fs';
import path from 'node:path';

const isUrl = v => typeof v == 'string' && !/^[a-z]+:/.test(v) && !v.includes('{');

export const galleryFiles = (dataDir, files) => {
    const found = new Set();
    const add = file => {
        const rel = file.split(path.sep).join('/');
        if (found.has(rel))
            return;
        found.add(rel);
        if (!rel.endsWith('.json'))
            return;
        let def;
        try {
            def = JSON.parse(readFileSync(path.join(dataDir, rel), 'utf8'));
        } catch {
            return;
        }
        if (!def || typeof def != 'object' || Array.isArray(def) || def.type)
            return;
        const dir = path.posix.dirname(rel);
        const relative = p => path.posix.normalize(path.posix.join(dir, p));
        [def.parent ?? []].flat().filter(isUrl).forEach(p => add(relative(p)));
        [def.data, def.geo?.data, ...[def.transform ?? []].flat().map(t => t?.data), ...[def.marks ?? []].flat().map(m => m?.data)]
            .filter(isUrl).forEach(p => add(relative(p)));
    };
    files.forEach(add);
    return [...found].sort();
};
