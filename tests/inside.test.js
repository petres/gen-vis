// the labels inside the bands of area plots (marks/inside.js): the spots of
// a label in a band, the choice of the spots of several labels
import { describe, test, expect } from 'vitest';
import { bestSpots, chooseSpots } from '@/marks/inside.js';

// a band of 200 pixels of x from y `lo(x)` to `hi(x)` (pixels of y, 0 at the top)
const band = (lo, hi) => {
    const n = 201;
    return { start: 0, step: 1, n, cyclic: false, lo: Float64Array.from({ length: n }, (_, i) => lo(i)), hi: Float64Array.from({ length: n }, (_, i) => hi(i)) };
};
const all = n => new Uint8Array(n).fill(1);

describe('the spots of a label in a band', () => {
    test('the whole box inside the band over its width, the most room first, of the same room the nearest to the preferred one', () => {
        // a band 40 pixels high from 60 to 140, 10 pixels high elsewhere
        const b = band(x => x >= 60 && x <= 140 ? 80 : 110, () => 120);
        const spots = bestSpots(b, { w: 40, h: 10, pad: 2, allowed: all(b.n), prefer: 100, fit: true });
        // the box of 40 + 2*2 pixels is inside of 60 to 140: its center from 82 to 118
        expect(Math.min(...spots.map(s => s.x))).toBe(82);
        expect(Math.max(...spots.map(s => s.x))).toBe(118);
        expect(spots.every(s => s.box[0] >= 60 && s.box[2] <= 140 && s.box[1] >= 80 && s.box[3] <= 120)).toBe(true);
        // the clearance: (40 - 10 - 2*2)/2, at the preferred position, in the middle of the band
        expect(spots[0]).toMatchObject({ x: 100, y: 100, clearance: 13 });
        // a narrow peak: the middle of the band is in it, the text does not fit over its width
        const peak = band(x => x >= 95 && x <= 105 ? 50 : 110, () => 120);
        expect(bestSpots(peak, { w: 40, h: 10, pad: 2, allowed: all(peak.n), fit: true })).toEqual([]);
        // without fit the best ones also of no room
        expect(bestSpots(peak, { w: 40, h: 10, pad: 2, allowed: all(peak.n), fit: false })[0].clearance).toBeLessThan(0);
    });

    test('only at the allowed positions, not where the band has no values', () => {
        const b = band(() => 80, () => 120);
        const allowed = all(b.n).map((v, i) => i >= 150 ? 1 : 0);
        expect(Math.min(...bestSpots(b, { w: 20, h: 10, pad: 2, allowed, fit: true }).map(s => s.x))).toBe(150);
        const gap = band(x => x > 40 && x < 60 ? NaN : 80, () => 120);
        expect(bestSpots(gap, { w: 20, h: 10, pad: 2, allowed: all(gap.n), fit: true }).some(s => s.box[0] < 60 && s.box[2] > 40)).toBe(false);
    });

    test('a polar band: the box inside of the ring at the angles of its points', () => {
        // a ring from 80 to 120 pixels in the upper half, 85 to 95 in the lower one
        const n = 360;
        const ring = { start: 0, step: 2*Math.PI/n, n, cyclic: true,
            lo: Float64Array.from({ length: n }, (_, i) => i < 90 || i >= 270 ? 80 : 85),
            hi: Float64Array.from({ length: n }, (_, i) => i < 90 || i >= 270 ? 120 : 95) };
        const spots = bestSpots(ring, { w: 30, h: 10, pad: 2, allowed: all(n), fit: true });
        expect(spots.length).toBeGreaterThan(0);
        // at the top: the center above the center of the circle, inside of the ring
        expect(spots[0].y).toBeLessThan(0);
        expect(Math.hypot(spots[0].x, spots[0].y)).toBeGreaterThan(80);
        expect(Math.hypot(spots[0].x, spots[0].y)).toBeLessThan(120);
    });
});

describe('the spots of the labels', () => {
    const label = spots => ({ spots });
    const spot = (x, clearance) => ({ p: x, x, y: 0, clearance, box: [x - 10, -5, x + 10, 5] });

    test('without overlaps, the label of the least room first, the others at their next spots', () => {
        const a = label([spot(50, 9), spot(80, 8)]);
        const b = label([spot(55, 3), spot(120, 2)]);
        // b has the least room, it takes 55, a its spot which does not overlap it
        expect(chooseSpots([a, b])).toEqual([a.spots[1], b.spots[0]]);
        // overlapping ones of overlap: true
        expect(chooseSpots([a, b], { overlap: true })).toEqual([a.spots[0], b.spots[0]]);
    });

    test('a label without a spot which fits is left out, of fit false at its best spot', () => {
        const fits = label([spot(50, 4)]);
        const none = label([spot(150, -2)]);
        expect(chooseSpots([fits, none])).toEqual([fits.spots[0], null]);
        expect(chooseSpots([fits, none], { fit: false })).toEqual([fits.spots[0], none.spots[0]]);
        // nor where it overlaps all spots of the others
        const crowded = label([spot(52, 6)]);
        expect(chooseSpots([fits, crowded])).toEqual([fits.spots[0], null]);
    });
});

describe('polar labels inside thin bands (review of 4.1)', () => {
    test('fit: false places a label also in a band thinner than the text', () => {
        const n = 360;
        const band = { start: 0, step: 2*Math.PI/n, n, lo: new Float64Array(n).fill(100), hi: new Float64Array(n).fill(108), cyclic: true, offset: 0 };
        const allowed = new Uint8Array(n).fill(1);
        expect(bestSpots(band, { w: 40, h: 11, pad: 2, allowed, fit: true })).toEqual([]);
        const spots = bestSpots(band, { w: 40, h: 11, pad: 2, allowed, fit: false });
        expect(spots.length).toBeGreaterThan(0);
        expect(chooseSpots([{ spots }], { fit: false })[0]).not.toBeNull();
    });
});
