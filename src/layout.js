export { layout, axisNames, visibleKeys };

import { addDimInfo, addScaledData, addStackedData, categoryOrder, convert, filter, groupBy } from "@/utils/data";
import { entryToValue } from "@/utils/props";
import { addScale } from "@/utils/scales";

/**
 * The view of a visualisation, computed from its store without Vue: the rows
 * shown, the facets with their rows, sizes and scales, and the scales of
 * colors, the components only draw it. The scales of colors and the ones of
 * `facets.scales` are the same in all facets, the others are the ones of the
 * rows of a facet.
 */

// the names of the mappings of the positions (h) and of the values (v) of
// the hover and the stacks, e.g. of the horizontal and the vertical axis
const axisNames = store => {
    if (store.coord.names)
        return store.coord.names(store);
    const axis = {};
    Object.entries(store.def.mapping).filter(([, m]) => m.scale).forEach(([n, m]) => {
        Object.entries(store.coord.axis).forEach(([a, orientation]) => {
            if (m.scale.orientation == orientation)
                axis[a] = n;
        });
    });
    return axis;
};

// the visible categories of the mappings with props, e.g. of the legends
const visibleKeys = def => Object.entries(def.mapping)
    .filter(([, m]) => m.props)
    .map(([dim, m]) => ({ dim, key: Object.keys(m.props).filter(k => m.props[k].visible) }));

// the scale of a mapping for the rows, in the sizes of a facet
const scaleOf = (store, name, rows, size, scope) => {
    const info = { dim: name, mapping: store.mapping(name) };
    addDimInfo(info, rows);
    addScale(info, store.coord.dims(size.innerWidth, size.innerHeight), store.coord, scope);
    return info;
};

// the facets in the order of the categories of their mapping, not of the
// rows, only the ones with rows
const facetEntries = (store, rows) => {
    const d = store.def.facets.dim;
    const props = store.mapping(d).props;
    const keys = Object.keys(props);
    return groupBy(rows, [d])
        .filter(g => keys.includes(String(g.group[d])))
        .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
        .map(g => ({ key: g.group[d], name: props[g.group[d]].name, rows: g.entries }));
};

/**
 * The view of the store in the `width` of the visualisation, the globals
 * and the width are the references of the definition, e.g. of the height.
 */
const layout = (store, width) => {
    const def = store.def;
    const axis = axisNames(store);
    const scope = { ...def.globals, totalWidth: width };

    // the rows of the visible categories and of the values of `filter`, e.g.
    // of a global of a form element, they are compared as the values of the
    // rows, e.g. dates as timestamps
    const visible = visibleKeys(def);
    const values = Object.entries(def.filter ?? {}).map(([dim, v]) => ({
        dim,
        key: [entryToValue(v, scope)].flat().map(k => convert(store.mapping(dim), k)),
    }));
    const rows = filter(store.data, [...visible, ...values]);

    // stacked in the order of the categories, not of the rows
    if (axis.v && store.mapping(axis.v).stacked)
        addStackedData(rows, axis, def.facets ? [def.facets.dim] : [], categoryOrder(visible.map(f => ({ dim: f.dim, keys: f.key }))));

    // without facets, or if no facet has rows, one of all rows
    const entries = def.facets ? facetEntries(store, rows) : [];
    const faceted = entries.length > 0;

    // the sizes of a facet
    const margins = def.options.margins;
    const cols = faceted ? entryToValue(def.facets.cols, scope) : 1;
    const size = { width: width/cols, height: entryToValue(def.options.height, scope) };
    size.innerWidth = size.width - (margins.left + margins.right);
    size.innerHeight = size.height - (margins.top + margins.bottom);
    const facetScope = { ...scope, ...size };

    // the scales of all facets: the shared ones and the ones without
    // orientation, e.g. of colors
    const scaled = Object.keys(def.mapping).filter(n => def.mapping[n].scale);
    const colors = scaled.filter(n => !def.mapping[n].scale.orientation);
    const shared = faceted && def.facets.scales ? entryToValue(def.facets.scales, scope) : [];
    const common = Object.fromEntries([...new Set([...shared, ...colors])]
        .map(n => [n, scaleOf(store, n, rows, size, facetScope)]));
    addScaledData(rows, common);

    const facets = (faceted ? entries : [{ key: undefined, name: undefined, rows }]).map(f => {
        const own = Object.fromEntries(scaled.filter(n => !(n in common))
            .map(n => [n, scaleOf(store, n, f.rows, size, facetScope)]));
        addScaledData(f.rows, own);
        return { ...f, ...size, margins, scope: facetScope, info: { ...common, ...own } };
    });

    return {
        axis,
        rows,
        faceted,
        facets,
        colors: Object.fromEntries(colors.map(n => [n, common[n]])),
        height: size.height,
    };
};
