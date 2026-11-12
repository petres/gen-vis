import { markPath, warnOnce } from "@/utils/warn";
import { directOf } from "@/utils/draw";
import { convert } from "@/utils/data";
import * as d3 from "@/utils/d3";

// the annotations of the coordinate systems as mark types, a band, a line, a
// text or a circle per row at its values of the dims (the items of
// `annotate` of the coordinate system, see coords/annotations.js), e.g. of the
// `annotations` of a definition (see prepareDef) or of the rows of a mark of
// its own `data`, e.g. events, `label` and `text` of the rows are templates
// of the globals, the props of the mark can have the names of the rows,
// nothing is drawn in a coordinate system without the type, e.g. a band on a
// map, it warns once
// the items of an annotation have a place: the attributes of their
// positions (set at once, see annotationItem of coords/annotations.js) are
// finite, also the numbers of a path
const placed = items => items.every(item => Object.values(item[directOf] ?? {})
    .every(v => typeof v == 'number' ? Number.isFinite(v) : !/NaN|Infinity/.test(String(v))));

// the path of an annotation in the definition, e.g. "annotations[0]", of
// the rows of a mark the one of the mark
const pathOf = (ctx, mark) => {
    const m = /^annotation-(\d+)$/.exec(String(mark.id));
    return m ? `annotations[${m[1]}]` : markPath(ctx.store.def, mark, true);
};

// the dims of the values of an annotation (`row`) which are never on their
// scale: of a band or a point scale a category which is none of the data
// (one of rows which are not shown, e.g. of a filter, is known), of a
// continuous scale with a domain a value without a position, e.g. 0 of a
// log scale (not without rows, the scale has no domain)
const unknownOf = (ctx, row) => Object.keys(row).filter(k => ctx.scales[k] && row[k] !== null && row[k] !== undefined).filter(k => {
    const s = ctx.scales[k];
    const m = ctx.store.dim(k);
    const values = [row[k]].flat().filter(v => v !== null && v !== undefined);
    if (s.step) {
        const known = new Set([...s.domain().map(String), ...(m.keys ?? []), ...(typeof m.column == 'string' ? ctx.store.dataKeys(m.column) : [])]);
        return ctx.store.rows?.length > 0 && values.some(v => !known.has(String(v)));
    }
    return s.domain().every(d => Number.isFinite(+d)) && values.some(v => !Number.isFinite(s(convert(m, v))));
});

// the dims of the values of an annotation (`row`) which are wholly outside
// of the domain of their continuous scale, beyond one end of its range (a
// range of values beyond the same end, `null` is the edge of the domain),
// e.g. a target line above the data: annotations do not extend the domain
// (`include` of the dim does), they are not drawn, nor their labels, which
// would be far beyond the plot area, see textBoxes of layout.js
const outsideOf = (ctx, row) => Object.keys(row).filter(k => ctx.scales[k] && row[k] !== null && row[k] !== undefined).filter(k => {
    const s = ctx.scales[k];
    const range = s.range();
    if (s.step || !range.every(v => typeof v == 'number'))
        return false;
    const m = ctx.store.dim(k);
    const [r0, r1] = d3.extent(range);
    const at = [row[k]].flat().map((v, i) => s(v === null || v === undefined ? s.domain()[i ? s.domain().length - 1 : 0] : convert(m, v)));
    return at.every(Number.isFinite) && (d3.max(at) < r0 - 0.5 || d3.min(at) > r1 + 0.5);
});

const annotation = type => ({
    marks(groups, mark, ctx) {
        const coord = ctx.store.coord;
        if (!coord.annotate || !(coord.annotations ?? []).includes(type)) {
            const name = ctx.store.def.coord ?? 'cartesian';
            const known = coord.annotations?.length ? `, only ${coord.annotations.map(t => `'${t}'`).join(', ')}` : '';
            warnOnce(ctx.store, `annotation:${type}`, `the coordinate system '${name}' has no annotations of the type '${type}'${known}, they are not drawn`);
            return null;
        }
        return {
            class: "vis-annotations",
            items: groups.flatMap(g => g.rows.flatMap(row => {
                // (no warning: the domain changes with the data, e.g. of a
                // filter or the entries of a legend hidden)
                if (outsideOf(ctx, row).length > 0)
                    return [];
                const items = coord.annotate(ctx, {
                    ...row,
                    type,
                    label: ctx.store.text(row.label),
                    text: ctx.store.text(row.text),
                    props: mark.props,
                    scope: { ...ctx.scope, ...row },
                });
                if (placed(items))
                    return items;
                // a value without a position: nothing is drawn, e.g. a text at
                // a category whose rows a filter left out, a warning of a value
                // which is never on the scale, see unknownOf
                const unknown = unknownOf(ctx, row);
                if (unknown.length > 0) {
                    const values = unknown.map(k => `${k}: ${JSON.stringify(row[k])}`).join(', ');
                    warnOnce(ctx.store, `annotation:${mark.id}:${values}`, `${pathOf(ctx, mark)}: the ${type} has no position (${values}), a value which is not on its scale, e.g. a category which is not in the data, it is not drawn`);
                }
                return [];
            })),
        };
    },
});

export default {
    'annotation:band': annotation('band'),
    'annotation:line': annotation('line'),
    'annotation:text': annotation('text'),
    'annotation:circle': annotation('circle'),
};
