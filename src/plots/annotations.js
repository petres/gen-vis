// the annotations of the coordinate systems as plot types, a band, a line, a
// text or a circle per row at its values of the mappings (the items of
// `annotate` of the coordinate system, see coords/annotations.js), e.g. of the
// `annotations` of a definition (see prepareDef) or of the rows of a plot of
// its own `data`, e.g. events, `label` and `text` of the rows are templates
// of the globals, the props of the plot can have the names of the rows,
// nothing is drawn in a coordinate system without the type
const annotation = type => ({
    marks(groups, plot, ctx) {
        const coord = ctx.store.coord;
        if (!coord.annotate || !(coord.annotations ?? []).includes(type))
            return null;
        return {
            class: "vis-annotations",
            items: groups.flatMap(g => g.rows.flatMap(row => coord.annotate(ctx, {
                ...row,
                type,
                label: ctx.store.text(row.label),
                text: ctx.store.text(row.text),
                props: plot.props,
                scope: { ...ctx.scope, ...row },
            }))),
        };
    },
});

export default {
    'annotation:band': annotation('band'),
    'annotation:line': annotation('line'),
    'annotation:text': annotation('text'),
    'annotation:circle': annotation('circle'),
};
