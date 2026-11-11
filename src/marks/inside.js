// the labels inside the bands of an area mark (`"place": { "in": "<id>" }`
// of svg:text and polar:text), loaded for definitions with them, see
// utils/lazy.js and the marks of marks/elements.js and marks/polar.js
export { placeInside, bandProfile, bestSpots, chooseSpots };

import { line, lineRadial } from 'd3-shape';
import { areaPoints, curve, finite, propScale, bandOffset } from '@/marks/elements';
import { bandCenter } from '@/utils/scales';

const tau = 2*Math.PI;

// the polylines of a path of d3 (a context of canvas), its curves as
// segments of `steps` lines, e.g. of a line of monotoneX
const recorder = (steps = 12) => {
    const lines = [];
    let cur = null;
    const last = () => cur.at(-1);
    return {
        lines,
        moveTo(x, y) { cur = [[x, y]]; lines.push(cur); },
        lineTo(x, y) { cur.push([x, y]); },
        bezierCurveTo(ax, ay, bx, by, x, y) {
            const [px, py] = last();
            for (let i = 1; i <= steps; i++) {
                const t = i/steps;
                const u = 1 - t;
                cur.push([u*u*u*px + 3*u*u*t*ax + 3*u*t*t*bx + t*t*t*x, u*u*u*py + 3*u*u*t*ay + 3*u*t*t*by + t*t*t*y]);
            }
        },
        quadraticCurveTo(ax, ay, x, y) {
            const [px, py] = last();
            for (let i = 1; i <= steps; i++) {
                const t = i/steps;
                const u = 1 - t;
                cur.push([u*u*px + 2*u*t*ax + t*t*x, u*u*py + 2*u*t*ay + t*t*y]);
            }
        },
        closePath() { if (cur) cur.push(cur[0]); },
        arc() {},
        rect() {},
    };
};

// the values of polylines of [position, value] on a grid of `n` positions
// from `start` in steps of `step`, NaN where there is none; of a cyclic grid
// (angles) the positions are taken modulo `period`
const resample = (lines, start, step, n, period = null) => {
    const out = new Float64Array(n).fill(NaN);
    lines.forEach(l => {
        for (let k = 1; k < l.length; k++) {
            const [a, va] = l[k - 1];
            const [b, vb] = l[k];
            if (!finite(a, b, va, vb) || a == b)
                continue;
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = Math.ceil((lo - start)/step); i*step + start <= hi; i++) {
                const p = i*step + start;
                const v = va + (vb - va)*(p - a)/(b - a);
                const j = period ? ((i % n) + n) % n : i;
                if (j >= 0 && j < n)
                    out[j] = v;
            }
        }
    });
    return out;
};

// the angle (clockwise from the top, 0 to 2π) and the radius of a point of
// polar plots, relative to the center
const polarOf = ([x, y]) => [((Math.atan2(x, -y) % tau) + tau) % tau, Math.hypot(x, y)];

// the polylines of a closed or open path in [angle, radius], the angles
// continuous along a line (no jump from 2π to 0)
const unwrapped = lines => lines.map(l => {
    let before = null;
    return l.map(p => {
        let [a, r] = polarOf(p);
        if (before !== null) {
            while (a - before > Math.PI)
                a -= tau;
            while (before - a > Math.PI)
                a += tau;
        }
        before = a;
        return [a, r];
    });
});

/**
 * The band of a group of an area mark on a grid of positions: of cartesian
 * marks the pixels of x (`start`, `step`, `n`) and the edges `lo`, `hi` in
 * pixels of y, of polar plots the angles (0 to 2π, `cyclic`) and the edges
 * in radii; of the curve of the mark, as the area is drawn, e.g. with the
 * points of the stack of the `groups` of the mark, see areaPoints.
 */
const bandProfile = (group, mark, ctx, polar, groups = [group]) => {
    const c = curve(mark);
    if (!polar) {
        // at the centers of the bands of a band scale, as the area is drawn
        const dx = bandOffset(mark, ctx, 'd.x');
        const pts = areaPoints(groups, mark, ctx, ['x', 'y0', 'y1']).get(group).filter(p => finite(p.x)).map(p => dx ? { ...p, x: p.x + dx } : p);
        if (pts.length < 2)
            return null;
        const edge = key => {
            const rec = recorder();
            line().curve(c).defined(p => finite(p.x, p[key])).x(p => p.x).y(p => p[key]).context(rec)(pts);
            return rec.lines;
        };
        const xs = pts.map(p => p.x);
        const start = Math.min(...xs);
        const n = Math.floor(Math.max(...xs) - start) + 1;
        const [a, b] = [resample(edge('y0'), start, 1, n), resample(edge('y1'), start, 1, n)];
        return { start, step: 1, n, lo: a.map((v, i) => Math.min(v, b[i])), hi: a.map((v, i) => Math.max(v, b[i])), cyclic: false };
    }
    const scale = propScale(mark, ctx, 'd.angle');
    const offset = scale ? bandCenter(scale) : 0;
    const r0 = ctx.dims?.innerRadius ?? 0;
    const pts = areaPoints(groups, mark, ctx, ['angle', 'innerRadius', 'outerRadius']).get(group).filter(p => finite(p.angle));
    if (pts.length < 2)
        return null;
    const edge = key => {
        const rec = recorder();
        lineRadial().curve(c).defined(p => finite(p.angle, p[key])).angle(p => p.angle + offset)
            .radius(p => Math.max(r0, p[key])).context(rec)(pts);
        return unwrapped(rec.lines);
    };
    // a degree of the circle
    const n = 360;
    const step = tau/n;
    const [a, b] = [resample(edge('innerRadius'), 0, step, n, tau), resample(edge('outerRadius'), 0, step, n, tau)];
    return { start: 0, step, n, lo: a.map((v, i) => Math.min(v, b[i])), hi: a.map((v, i) => Math.max(v, b[i])), cyclic: true, offset };
};

// the index of the grid of a position, of a cyclic grid modulo its length
const indexOf = (band, p) => {
    const i = Math.round((p - band.start)/band.step);
    return band.cyclic ? ((i % band.n) + band.n) % band.n : i;
};

/**
 * The spots of a label of `w` × `h` pixels (and `pad` around it) inside a
 * band (see bandProfile) at the allowed positions (`allowed[i]` of the
 * grid), each { p, x, y, clearance, box }: of cartesian marks the center of
 * the text in pixels, the largest clearance of the vertical interval free
 * over the width of the text; of polar plots the center (relative to the
 * center of the circle) and the clearance of points of the box to the band
 * at their angles. `clearance` < 0 does not fit. Best first, of the same
 * clearance (to a half pixel) the nearest to `prefer`.
 */
const bestSpots = (band, { w, h, pad, allowed, prefer, fit = false }) => {
    const spots = [];
    const hw = w/2 + pad;
    const hh = h/2 + pad;
    if (!band.cyclic) {
        // the lowest edge above and the highest below over the width of the
        // text around every position (sliding windows, a gap is NaN)
        const half = Math.ceil(hw/band.step);
        const tops = slide(band.lo, half, (a, b) => a >= b);
        const bottoms = slide(band.hi, half, (a, b) => a <= b);
        for (let c = half; c < band.n - half; c++) {
            const xc = band.start + c*band.step;
            if (!allowed[c])
                continue;
            const [top, bottom] = [tops[c], bottoms[c]];
            if (!finite(top, bottom))
                continue;
            const yc = (top + bottom)/2;
            if (fit && (bottom - top)/2 - hh < 0)
                continue;
            spots.push({ p: xc, x: xc, y: yc, clearance: (bottom - top)/2 - hh, box: [xc - hw, yc - hh, xc + hw, yc + hh] });
        }
    } else {
        // the points of the box of the text, relative to its center
        const offsets = [-1, -0.5, 0, 0.5, 1].flatMap(fx => [-1, 0, 1].map(fy => [fx*w/2, fy*h/2]));
        const at = (x, y) => {
            const [a, r] = polarOf([x, y]);
            const i = indexOf(band, a);
            return [band.lo[i], band.hi[i], r];
        };
        // the centers every other degree, the edges of the box on the grid of degrees
        for (let c = 0; c < band.n; c += 2) {
            const angle = c*band.step;
            if (!allowed[c])
                continue;
            const [lo, hi] = [band.lo[c], band.hi[c]];
            // a radius of the center at most as far from the edges as the
            // half of the smaller side of the box: of `fit` only the ones
            // which can fit (the box reaches at least that far)
            const m = fit ? Math.min(w, h)/2 : 0;
            if (!finite(lo, hi) || (fit && hi - lo - 2*pad < 2*m))
                continue;
            // of a band thinner than the padding (not `fit`): its middle
            const [r0, r1] = lo + pad + m <= hi - pad - m ? [lo + pad + m, hi - pad - m] : [(lo + hi)/2, (lo + hi)/2];
            let best = null;
            for (let r = r0; r <= r1; r += 2) {
                const [x, y] = [r*Math.sin(angle), -r*Math.cos(angle)];
                let clearance = Infinity;
                for (const [dx, dy] of offsets) {
                    const [l, u, rr] = at(x + dx, y + dy);
                    clearance = Math.min(clearance, finite(l, u) ? Math.min(rr - l, u - rr) - pad : -Infinity);
                    if (best && clearance <= best.clearance)
                        break;
                }
                if (!best || clearance > best.clearance)
                    best = { p: angle, x, y, clearance, box: [x - hw, y - hh, x + hw, y + hh] };
            }
            if (best && (!fit || best.clearance >= 0))
                spots.push(best);
        }
    }
    const away = s => prefer === undefined ? 0 : (band.cyclic ? Math.min(Math.abs(s.p - prefer), tau - Math.abs(s.p - prefer)) : Math.abs(s.p - prefer));
    return spots.sort((a, b) => Math.round(2*b.clearance) - Math.round(2*a.clearance) || away(a) - away(b));
};

// the extreme of the values of the windows of `half` values before and after
// every index (of `better(a, b)`, e.g. the largest), NaN of a window with a
// NaN, of a deque of the indexes of the candidates
const slide = (values, half, better) => {
    const n = values.length;
    const out = new Float64Array(n).fill(NaN);
    const deque = new Int32Array(n);
    let [head, tail] = [0, 0];
    let lastNaN = -Infinity;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        if (Number.isNaN(v))
            lastNaN = i;
        else {
            while (tail > head && better(v, values[deque[tail - 1]]))
                tail--;
            deque[tail++] = i;
        }
        // the window of the center i - half ends at i
        const c = i - half;
        if (c < 0)
            continue;
        while (tail > head && deque[head] < c - half)
            head++;
        out[c] = lastNaN >= c - half || tail == head ? NaN : values[deque[head]];
    }
    return out;
};

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * The spots of the labels (`labels`, each with its `spots`, see bestSpots):
 * the labels of the least room first, each the best spot which does not
 * overlap the ones placed before (with `overlap` any best one); without one
 * which fits (`fit`, clearance ≥ 0) a label is left out (null), with `fit`
 * false the best one which does not overlap.
 */
const chooseSpots = (labels, { fit = true, overlap = false } = {}) => {
    const placed = [];
    const chosen = new Map();
    const room = l => l.spots[0]?.clearance ?? -Infinity;
    [...labels].sort((a, b) => room(a) - room(b)).forEach(l => {
        const free = s => overlap || !placed.some(b => overlaps(s.box, b));
        const spot = l.spots.find(s => s.clearance >= 0 && free(s)) ?? (fit ? null : l.spots.find(free) ?? null);
        if (spot)
            placed.push(spot.box);
        chosen.set(l, spot);
    });
    return labels.map(l => chosen.get(l));
};

// the width of a text in pixels: of a canvas in the browser, estimated of
// its characters otherwise (e.g. jsdom)
let canvas = null;
const textWidth = (text, size, weight, family) => {
    if (typeof document != 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')) {
        canvas ??= document.createElement('canvas').getContext('2d');
        if (canvas) {
            canvas.font = `${weight} ${size}px ${family}`;
            return canvas.measureText(text).width;
        }
    }
    return text.length*size*(Number(weight) >= 600 || weight == 'bold' ? 0.62 : 0.56);
};

// the categories of a group of the label are the ones of a group of the
// area, of the dims of both
const sameBand = (label, band) => Object.keys(label.categories ?? {}).filter(k => Object.hasOwn(band.categories ?? {}, k))
    .every(k => String(label.categories[k]) === String(band.categories[k]));

/**
 * The places of the labels of a text mark inside the bands of the area mark
 * of `mark.place.in`: a label per group of the mark, the text and the font
 * of its first row, at the allowed positions of its rows (each row the
 * space to its neighbours), see bestSpots and chooseSpots; [group, row,
 * spot] of the labels placed, of polar plots `polar` the angle offset of
 * its mark.
 */
const placeInside = (groups, mark, ctx, polar) => {
    const area = ctx.store.def.marks.find(p => p.id === mark.place.in);
    const bands = area ? ctx.groupsOf(area.id) : [];
    // the font of the texts, read once per chart (a style of the page)
    ctx.store.labelFont ??= (typeof getComputedStyle == 'function' && ctx.inner ? getComputedStyle(ctx.inner).getPropertyValue('--gen-vis-font-family').trim() : '')
        || 'Inter, system-ui, sans-serif';
    const family = ctx.store.labelFont;
    const halo = mark.halo ? (mark.halo === true ? 3 : Number(mark.halo))/2 : 0;
    const pad = Number(mark.place.padding ?? 2) + halo;
    const profiles = new Map();
    const labels = groups.flatMap(g => {
        const rows = g.rows.filter(g.complete);
        const band = bands.find(b => sameBand(g, b));
        if (!band || rows.length == 0)
            return [];
        if (!profiles.has(band))
            profiles.set(band, bandProfile(band, area, ctx, polar, bands));
        const profile = profiles.get(band);
        if (!profile)
            return [];
        // KNOWN INCONSISTENCY: the box is measured of the text and font of
        // the first row, but the label is drawn with the props of the row
        // nearest to its place (see the end of placeInside), a text or font
        // which differs per row may not fit; the fix: measure the text of
        // each row (or draw the first row), see docs/definition.md
        const first = g.at(rows[0]);
        const text = String(first.text ?? '');
        if (!text)
            return [];
        const size = parseFloat(first['font-size']) || 11;
        const w = textWidth(text, size, first['font-weight'] ?? 'normal', family);
        // the positions of the rows, each the space to its neighbours
        const positions = rows.map(r => polar ? g.at(r).angle + profile.offset : g.at(r).x).filter(Number.isFinite).sort((a, b) => a - b);
        const gap = positions.length > 1 ? Math.min(...positions.slice(1).map((p, i) => p - positions[i]).filter(d => d > 0)) : (polar ? tau : Infinity);
        const half = Number.isFinite(gap) ? gap/2 : Infinity;
        // the positions of the grid of the band near a row
        const allowed = new Uint8Array(profile.n);
        positions.forEach(q => {
            const span = Number.isFinite(half) ? half : profile.n*profile.step;
            for (let i = Math.ceil((q - span - profile.start)/profile.step); i*profile.step + profile.start <= q + span + 1e-9; i++) {
                const j = profile.cyclic ? ((i % profile.n) + profile.n) % profile.n : i;
                if (j >= 0 && j < profile.n)
                    allowed[j] = 1;
                if (i - Math.ceil((q - span - profile.start)/profile.step) >= profile.n)
                    break;
            }
        });
        const prefer = mark.place.near !== undefined
            ? (polar ? ctx.scales[dimOf(mark.props.angle)]?.(mark.place.near) + profile.offset : ctx.scales[dimOf(mark.props.x)]?.(mark.place.near))
            : (positions[0] + positions.at(-1))/2;
        const spots = bestSpots(profile, { w, h: size, pad, allowed, prefer: Number.isFinite(prefer) ? prefer : undefined, fit: mark.fit !== false });
        return [{ g, rows, spots, offset: profile.offset ?? 0 }];
    });
    const chosen = chooseSpots(labels, { fit: mark.fit !== false, overlap: mark.overlap === true });
    return labels.map((l, i) => [l, chosen[i]]).filter(([, s]) => s).map(([l, s]) => {
        // the row nearest to the place, e.g. of a prop of its values, of
        // the positions of the profile (angles with the offset of a band
        // scale, around the circle)
        const distance = r => {
            const d = Math.abs((polar ? l.g.at(r).angle + l.offset : l.g.at(r).x) - s.p);
            return polar ? Math.min(d % tau, tau - d % tau) : d;
        };
        const row = l.rows.reduce((a, b) => distance(b) < distance(a) ? b : a);
        return [l.g, row, s];
    });
};

// the dim of a reference, e.g. x of "@x:scaled"
const dimOf = prop => typeof prop == 'string' && prop.startsWith('@') ? prop.slice(1).split(':')[0] : undefined;
