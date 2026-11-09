// the recipes of docs/recipes.md are the files of data/recipes/ (drawn by
// the PNG test and the snapshots as the other examples), a block of JSON
// after a comment of its file is that file
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const doc = readFileSync(new URL('docs/recipes.md', root), 'utf8');
const blocks = [...doc.matchAll(/<!-- (data\/recipes\/[\w-]+\.json) -->\n```json\n([\s\S]*?)\n```/g)].map(m => [m[1], m[2]]);

describe('the recipes of the docs', () => {
    test('every file of data/recipes/ is a recipe', () => {
        const files = readdirSync(new URL('data/recipes/', root)).filter(f => f.endsWith('.json')).map(f => `data/recipes/${f}`);
        expect(blocks.map(([file]) => file).sort()).toEqual(files.sort());
    });
    test.each(blocks)('%s is the block of the docs', (file, text) => {
        expect(JSON.parse(text)).toEqual(JSON.parse(readFileSync(new URL(file, root), 'utf8')));
    });
});
