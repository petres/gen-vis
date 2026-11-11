import { describe, test, expect } from 'vitest';
import { dodge, once } from '@/plots/elements';

describe('dodge', () => {
    test('positions far enough apart are kept', () => {
        expect(dodge([10, 30, 50], 12)).toEqual([10, 30, 50]);
    });

    test('positions too close are spread around their mean', () => {
        expect(dodge([20, 22], 12)).toEqual([15, 27]);
        expect(dodge([22, 20, 100], 12)).toEqual([27, 15, 100]);
    });

    test('a spread group is merged with the one before if they are too close', () => {
        const moved = dodge([0, 18, 20, 22], 12);
        expect(moved.map((y, i) => i > 0 ? y - moved[i - 1] : 12).every(d => d >= 12 - 1e-9)).toBe(true);
        expect(moved.reduce((a, b) => a + b)/4).toBeCloseTo(15);
    });

    test('missing positions are kept', () => {
        expect(dodge([NaN, 5, 6], 2)).toEqual([NaN, 4.5, 6.5]);
    });
});

describe('the names of the values of a column', () => {
    test('formatted or of a column of names, the values stay', async () => {
        const { createStore } = await import('@/store');
        const store = createStore();
        const data = 'month,label,value\n2026-09,Sept.,1\n2026-10,Okt.,2';
        const def = f => ({ options: { locale: 'de' }, globals: { month: '2026-10' }, filter: { m: '@month' },
            formElements: [{ id: 'month', ref: 'month', type: 'slider', values: { column: 'month', ...f } }],
            mapping: { m: { column: 'month', type: 'categorical' }, y: { column: 'value', type: 'numeric' } }, plot: { type: 'svg:circle' } });
        await store.init({ def: def({ format: '%B %Y' }), data });
        expect(store.def.formElements[0].values.map(e => [e.value, e.name])).toEqual([['2026-09', 'September 2026'], ['2026-10', 'Oktober 2026']]);
        await store.init({ def: def({ names: 'label' }), data });
        expect(store.def.formElements[0].values.map(e => e.name)).toEqual(['Sept.', 'Okt.']);
    });
});

describe('once', () => {
    test('a value of all rows is computed at its first use, also one of null', () => {
        let calls = 0;
        const none = once(() => {
            calls++;
            return null;
        });
        expect(calls).toBe(0);
        expect([none(), none(), none()]).toEqual([null, null, null]);
        expect(calls).toBe(1);
    });
});
