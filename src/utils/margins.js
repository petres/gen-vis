export { autoMargins, labelFontSize, titleFontSize };

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
const autoMargins = (store, facets, given) => {
    const def = store.def;
    const sides = ['top', 'right', 'bottom', 'left'];
    const need = Object.fromEntries(sides.map(k => [k, 0]));
    const more = (side, v) => need[side] = Math.max(need[side], v);
    const family = store.fontFamily || 'sans-serif';
    const font = `${labelFontSize}px ${family}`;
    const hasAxes = (store.coord?.positions ?? []).length > 0;
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
        const widths = texts.map((t, j) => {
            const max = Number(props[j]?.['max-width']);
            return Math.min(textWidth(t, font), max > 0 ? max : Infinity);
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
            // the first and the last label, centered on their ticks, reach
            // beyond the plot area (not the hidden ones of inner facets)
            if (!angle && texts.length > 0) {
                const [lo, hi] = [Math.min(range[0], range[range.length - 1]), Math.max(range[0], range[range.length - 1])];
                const at = v => s(v) + bandCenter(s);
                values.forEach((v, j) => {
                    const p = at(v);
                    if (!Number.isFinite(p))
                        return;
                    more('left', widths[j]/2 - (p - lo) + 1);
                    more('right', widths[j]/2 - (hi - p) + 1);
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
    const floor = hasAxes ? 8 : 0;
    return Object.fromEntries(sides.map(k => [k, given[k] === 'auto' ? Math.ceil(Math.max(floor, need[k])) : given[k]]));
};
