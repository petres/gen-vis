export { createFacets };

import { el, patch, place, setText } from "@/comp/html";
import { createFacet } from "@/comp/facet";
import { evaluate } from "@/utils/expr";

/**
 * The facets of the view (see layout.js), the children of `parent`, a
 * facet of a view is drawn into the elements of the facet of the same key
 * of the view before (see update of facet.js), faceted ones with their
 * titles. `update(view)` draws a new view, `highlight(entry)` the elements
 * of a row in all facets (null ends it), `destroy()` removes them.
 */
const createFacets = (vis, parent) => {
    const { store } = vis;
    // the facets by their key, each with its element (a box with the title
    // of faceted ones) and its facet, see facet.js
    let shown = new Map();
    let faceted = null;

    const remove = entry => {
        entry.facet.destroy();
        entry.el.remove();
    };

    // the props of the title of a facet (`facets.title.props`), css
    // properties, the ones of the facet before which are none anymore are removed
    let propNames = new Set();
    const titleProps = f => {
        const raw = store.def.facets?.title?.props;
        const category = store.prop(store.def.facets.dim, String(f.key)) ?? {};
        const props = raw ? evaluate(raw, { ...store.scope, ...category, facet: f.key, 'facet:name': f.name }) : {};
        const own = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== null && typeof v != 'object').map(([k, v]) => [k, String(v)]));
        propNames.forEach(k => {
            if (!Object.hasOwn(own, k))
                own[k] = null;
        });
        propNames = new Set(Object.keys(own).filter(k => own[k] !== null));
        return own;
    };

    const update = view => {
        // a view of the other kind, the facets are new ones
        if (faceted !== null && faceted !== view.faceted) {
            shown.forEach(remove);
            shown = new Map();
        }
        faceted = view.faceted;
        const next = new Map();
        const mounted = [];
        const facets = view.faceted ? view.facets : [view.facets[0]];
        facets.forEach(f => {
            const key = view.faceted ? String(f.key) : '';
            let entry = shown.get(key);
            if (!entry) {
                const facet = createFacet(vis, f);
                // the title spans the plot area, its margins are the ones of
                // the facet, a style of the page can replace them
                const title = view.faceted ? el('div') : null;
                const box = view.faceted ? el('div', null, title, facet.el) : facet.el;
                entry = { el: box, title, facet, new: true };
            } else
                entry.facet.update(f);
            if (entry.title) {
                patch(entry.el, { style: `width: ${f.width}px; display: inline-block;` });
                // the props of the titles (css properties), of the props of
                // the category of the facet, e.g. its color, and the globals
                const props = titleProps(f);
                patch(entry.title, {
                    class: store.coord.centered ? 'vis-facet-title vis-facet-title-center' : 'vis-facet-title',
                    style: { ...props, '--gen-vis-margin-left': `${f.margins.left}px`, '--gen-vis-margin-right': `${f.margins.right}px` },
                });
                setText(entry.title, store.text(f.name));
            }
            next.set(key, entry);
            shown.delete(key);
        });
        shown.forEach(remove);
        shown = next;
        // in the order of the view
        [...shown.values()].reduceRight((next, entry) => place(parent, entry.el, next), null);
        shown.forEach(entry => {
            if (entry.new) {
                entry.new = false;
                mounted.push(entry.facet);
            }
        });
        mounted.forEach(f => f.mounted());
    };

    return {
        update,
        highlight(entry) {
            shown.forEach(e => e.facet.highlight(entry));
        },
        destroy() {
            shown.forEach(remove);
            shown = new Map();
        },
    };
};
