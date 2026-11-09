// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { useDom, mount } from './dom.js';
import { migrate } from '@/utils/migrate.js';
import { createStore } from '@/store';
import { itemOf } from '@/utils/dom';
import { rowOf } from '@/utils/draw';

useDom();
const S4 = 'https://unpkg.com/@preschen/gen-vis@4/schema.json';

// the migrated definitions of 4.x drawn: the values (y) of the rows of their points
const drawnRows = async (def, data) => [...(await mount({ def, data })).querySelectorAll('g.vis-plot circle')].map(c => c[itemOf][rowOf].y);

describe('the conditions of filters of dates of 4.x compare dates', () => {
    const def = (filter, x = { column: 'm', type: 'date' }, own = false) => ({ $schema: S4, mapping: { x, y: 'v' }, ...(own ? {} : { filter }),
        plot: { type: 'svg:circle', ...(own ? { filter } : {}), props: { cx: '@x:scaled', cy: '@y:scaled', r: 3 } } });
    const months = 'm,v\n2019-12,1\n2020-01,2\n2020-02,3';
    const days = 'm,v\n01.12.2019,1\n01.01.2020,2\n01.02.2020,3';
    test.each([
        ['a range from a date', { x: { range: ['2020-01-01', null] } }, [2, 3]],
        ['a range to a date', { x: { range: [null, '2020-01-01'] } }, [1, 2]],
        ['not a date', { x: { not: '2020-01-01' } }, [1, 3]],
        ['not a range', { x: { not: { range: ['2020-01-01', '2020-01-31'] } } }, [1, 3]],
    ])('%s', async (name, filter, values) => {
        // of the definition and of a mark, of months and of days first
        expect((await drawnRows(migrate(def(filter)), months)).sort()).toEqual(values);
        expect((await drawnRows(migrate(def(filter, undefined, true)), months)).sort()).toEqual(values);
        expect((await drawnRows(migrate(def(filter)), days)).sort()).toEqual(values);
        // a dim of dates of its values (no type): the texts of dates of the condition
        expect((await drawnRows(migrate(def(filter, 'm')), months)).sort()).toEqual(values);
    });
    test('the object of the conditions, references to globals', () => {
        expect(migrate(def({ x: { range: ['@from', null] } })).filter).toEqual({ x: { range: ['@globals.from', null] } });
        // numbers and texts as expressions
        expect(migrate({ ...def({ v: { range: [1, null] } }), mapping: { x: 'm', y: 'v' } }).filter).toBe('@v >= 1');
    });
});

// the review of 5.0 (E7): the warnings of a migrated definition name the
// paths of 5.0, the console says once that it was migrated, also of an
// inline one
describe('a definition of 4.x migrated while it is loaded', () => {
    afterEach(() => vi.restoreAllMocks());
    test('a notice, and its warnings say that their paths are the ones of 5.0', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await createStore().init({ def: { $schema: S4, mapping: { x: 'year', y: { column: 'v', bogus: 1 } }, plot: { type: 'line' } }, data: 'year,v\n2020,1\n2021,2', check: true });
        expect(info).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition: a definition of gen-vis 4, migrated while it is loaded/));
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition \(migrated from gen-vis 4, the paths are the ones of 5\): dims\.y\.bogus/));
    });
    test('a definition of 5.0: neither', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await createStore().init({ def: { dims: { x: 'year', y: { column: 'v', bogus: 1 } }, marks: { type: 'line' } }, data: 'year,v\n2020,1\n2021,2', check: true });
        expect(info).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition: dims\.y\.bogus/));
    });
});
