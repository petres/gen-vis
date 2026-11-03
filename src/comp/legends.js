export { createLegends };

import { place } from "@/comp/html";
import { createLegend } from "@/comp/legend";

/**
 * The legends of the mappings `names` in `parent`: toggles of categories,
 * the colors of a scale of the view otherwise (see color-legend.js, loaded
 * with the definitions which have one). `update(names, view)` draws them
 * again, the legend of a mapping is kept from one draw to the next.
 */
const createLegends = (vis, parent) => {
    const { store } = vis;
    // the legends by the mapping, of the kind `entries` or `colors`
    let shown = new Map();

    const update = (names, view) => {
        const next = new Map();
        names.forEach(name => {
            const kind = store.mapping(name).categoryProps ? 'entries'
                : store.colorLegend && view?.colors[name] ? 'colors' : null;
            if (!kind)
                return;
            let legend = shown.get(name);
            if (legend?.kind !== kind) {
                legend?.el.remove();
                legend = kind == 'entries' ? createLegend(vis, name) : store.colorLegend(vis, name);
                legend.kind = kind;
            }
            legend.update(kind == 'entries' ? view?.inData[name] : view.colors[name]);
            next.set(name, legend);
            shown.delete(name);
        });
        shown.forEach(legend => legend.el.remove());
        shown = next;
        [...shown.values()].reduceRight((after, legend) => place(parent, legend.el, after), null);
    };

    return { update };
};
