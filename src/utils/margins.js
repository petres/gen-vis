export { autoMargins };

import { tickCount, tickValues, tickFormat, labelProps } from '@/coords/ticks';
import { textWidth } from '@/utils/measure';
import { bandCenter } from '@/utils/scales';

// the font sizes of the labels of the ticks and of the titles of the axes,
// the ones of the styles (see styles.css)
const labelFontSize = 12;
const titleFontSize = 12;
// the parts of the tick marks inside the plot area of the styles, see utils/axis.js
const tickInset = { bottom: 4, top: 5, right: 4, left: 5 };

/**
 * The margins of the facets of the sides which are "auto" (`given`, the
 * others as they are): the space of the axes measured, of every facet
 * (`facets`, the ones of the layout of provisional margins, with their
 * scales): the tick marks, the padding of the labels, the widest label
 * (left and right axes), the height of a label (top and bottom ones), of
 * rotated labels their projection, the title of the axis, the labels of
 * the ends of a horizontal axis which reach beyond the plot area (the left
 * and the right margin), the labels of an angular axis around the circle;
 * at least 8 pixels beside axes (e.g. a point at the end of a line), none
 * of a map.
 */
const autoMargins = (store, facets, given, texts = () => []) => {
    const def = store.def;
    const sides = ['top', 'right', 'bottom', 'left'];
    const need = Object.fromEntries(sides.map(k => [k, 0]));
    const more = (side, v) => need[side] = Math.max(need[side], v);
    const family = store.fontFamily || 'sans-serif';
    const font = `${labelFontSize}px ${family}`;
    const hasAxes = (store.coord?.positions ?? []).length > 0;
    // the texts along the width of the plot area, see below
    const spans = [];
    facets.forEach(f => store.mappingNamesWithKey('axis').forEach(n => {
        const m = store.mapping(n);
        const i = m.axis;
        const s = f.scales[n];
        if (!s || !i)
            return;
        const pos = i.position;
        const range = s.range();
        const length = Math.abs(range[range.length - 1] - range[0]);
        const ticks = tickCount(i, f.scope, length);
        const format = tickFormat(store, n, s, ticks) || (s.tickFormat ? s.tickFormat(ticks) : (d => d));
        const values = tickValues(i, s, ticks, m, f.scope, def.mapping);
        // the labels of a shared scale only at the outer facets of a grid, see axes of coords/cartesian.js
        const across = ['left', 'right'].includes(pos) ? 'row' : 'col';
        const hidden = f.cell && ['all', across].includes(f.sharing?.[n]) && f.outer?.[pos] === false;
        // the props of the labels, e.g. their texts (`"text": "@name"`) and
        // their `max-width`, see labelProps of coords/ticks.js
        const labelsOf = labelProps({ store, rows: f.rows ?? [], scope: f.scope }, n, i.labels);
        const props = labelsOf ? values.map(v => labelsOf(v) ?? {}) : [];
        const texts = hidden ? [] : values.map((v, j) => {
            const t = labelsOf && 'text' in i.labels.props ? props[j].text : format(v);
            return t === null || t === undefined ? '' : String(t);
        });
        // of the font size and weight of the props of a label, e.g. a bold header
        const fontOf = j => {
            const size = parseFloat(props[j]?.['font-size']);
            const weight = props[j]?.['font-weight'];
            return size > 0 || weight ? `${weight ?? ''} ${size > 0 ? size : labelFontSize}px ${family}`.trim() : font;
        };
        const widths = texts.map((t, j) => {
            const max = Number(props[j]?.['max-width']);
            return Math.min(textWidth(t, fontOf(j)), max > 0 ? max : Infinity);
        });
        const widest = Math.max(0, ...widths);
        const d = store.axisDefaults(pos);
        // the labels are at the end of the part of the tick marks outside of
        // the plot area (their size less the inset, also without marks) plus
        // the padding, see drawAxis of utils/axis.js
        const size = (i.tickMarks !== false ? i.tickMarks?.size : undefined) ?? d.tickMarks?.size ?? 9;
        const inset = Number.isFinite(i.tickMarks?.inset) ? i.tickMarks.inset : (Number.isFinite(d.tickMarks?.inset) ? d.tickMarks.inset : (tickInset[pos] ?? 0));
        const marks = Math.max(size - inset, 0);
        const padding = Number(i.padding ?? d.padding ?? 3);
        const titled = i.title && (def.facets?.axisTitles != 'outer' || f.outer?.[pos] !== false);
        // the title at the distance of the margin less 8 pixels from the
        // axis, see axes of coords/cartesian.js; the one of a vertical axis
        // at the top is horizontal, `gap` above the plot area
        const above = titled && (pos == 'left' || pos == 'right') && i.title.position == 'top';
        if (above)
            more('top', (i.title.gap ?? 8) + titleFontSize + 2);
        const title = titled && !above ? titleFontSize + 8 : 2;
        const angle = (Number(i.rotate) || 0)*Math.PI/180;
        if (pos == 'left' || pos == 'right') {
            const extent = angle ? widest*Math.abs(Math.cos(angle)) + labelFontSize*Math.abs(Math.sin(angle)) : widest;
            more(pos, marks + padding + extent + title);
            // the labels of the ends of the axis reach beyond the plot area
            if (texts.length > 0) {
                more('top', labelFontSize/2 + 2);
                more('bottom', labelFontSize/2 + 2);
            }
        } else if (pos == 'top' || pos == 'bottom') {
            const extent = angle ? widest*Math.abs(Math.sin(angle)) + labelFontSize*Math.abs(Math.cos(angle)) : labelFontSize;
            more(pos, marks + padding + extent + title);
            // the labels, centered on their ticks or rotated (ending at
            // their tick of a positive angle, starting at it of a negative
            // one, see drawAxis of utils/axis.js), reach beyond the plot area
            // at its ends (not the hidden ones of inner facets), of their
            // place along the axis, see spans
            const [lo, hi] = [Math.min(range[0], range[range.length - 1]), Math.max(range[0], range[range.length - 1])];
            if (texts.length > 0 && hi > lo) {
                const at = v => s(v) + bandCenter(s);
                const across = labelFontSize/2*Math.abs(Math.sin(angle));
                const along = w => w*Math.abs(Math.cos(angle));
                values.forEach((v, j) => {
                    const p = at(v);
                    if (!Number.isFinite(p) || !texts[j])
                        return;
                    const [left, right] = !angle ? [widths[j]/2, widths[j]/2]
                        : angle > 0 ? [along(widths[j]) + across, across] : [across, along(widths[j]) + across];
                    spans.push({ t: (p - lo)/(hi - lo), left: left + 1, right: right + 1 });
                });
            }
        } else if (pos == 'angular') {
            // the labels around the circle
            const space = marks + padding + 2;
            more('left', space + widest);
            more('right', space + widest);
            more('top', space + labelFontSize);
            more('bottom', space + labelFontSize);
        }
    }));
    // the texts of marks beyond the plot area, e.g. labels at the ends of
    // lines or bars, a unit at the top (see textBoxes of layout.js), along
    // the width of their place in the plot area (`x`), see spans
    facets.forEach(f => texts(f).forEach(b => {
        if (Number.isFinite(b.x) && f.innerWidth > 0)
            spans.push({ t: b.x/f.innerWidth, left: b.x - b.left + 2, right: b.right - b.x + 2 });
        else {
            more('left', -b.left + 2);
            more('right', b.right - f.innerWidth + 2);
        }
        more('top', -b.top + 2);
        more('bottom', b.bottom - f.innerHeight + 2);
    }));
    const floor = hasAxes ? 8 : 0;
    const sideOf = (k, v) => given[k] === 'auto' ? Math.max(floor, v) : given[k];
    // the left and the right margin of the texts along the width (`spans`):
    // a text at the place `t` of the width of the plot area (0 at the left,
    // 1 at the right) which reaches `left` and `right` pixels beside it
    // needs `left - t*w` and `right - (1 - t)*w` of a plot area of the
    // width w, the width of the facet less the margins, so the margins are
    // the ones of the final width, not of the provisional one of the layout
    // (a fixed point, the margins grow until it, a few steps); texts wider
    // than the chart do not fit, the plot area keeps half of the width
    if (spans.length > 0 && facets.length > 0) {
        const width = facets[0].width;
        let [left, right] = [need.left, need.right];
        for (let i = 0; i < 50; i++) {
            const w = Math.max(width/2, width - sideOf('left', left) - sideOf('right', right));
            let [l, r] = [need.left, need.right];
            for (const p of spans) {
                l = Math.max(l, p.left - p.t*w);
                r = Math.max(r, p.right - (1 - p.t)*w);
            }
            const done = Math.abs(l - left) < 0.01 && Math.abs(r - right) < 0.01;
            [left, right] = [l, r];
            if (done)
                break;
        }
        need.left = left;
        need.right = right;
    }
    return Object.fromEntries(sides.map(k => [k, given[k] === 'auto' ? Math.ceil(sideOf(k, need[k])) : given[k]]));
};
