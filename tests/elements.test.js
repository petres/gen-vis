import { describe, test, expect } from 'vitest';
import { dodge } from '@/plots/elements';

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
