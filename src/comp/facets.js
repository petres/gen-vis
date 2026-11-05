export { createFacets };

import { el, patch, place, setText } from "@/comp/html";
import { createFacet } from "@/comp/facet";
import { evaluate } from "@/utils/expr";
import { create } from "@/utils/dom";
import { gridOf } from "@/layout";

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
        entry.facet?.destroy();
        entry.el.remove();
    };

    // the header of a row of a grid (`.vis-facet-row-title`), beside the plot
    // area of its facets: left of them horizontal text (html), right of them
    // rotated text (svg, the export keeps it as a text), of the width of the
    // headers, see the measure of vis.js
    const rowHeader = (node, f, side) => {
        const { cell, margins } = f;
        const width = store.rowHeaderWidth ?? 0;
        const props = titleProps(f, gridOf(store.def).rows, cell.row);
        if (side == 'left') {
            patch(node, { class: 'vis-facet-row-title vis-facet-row-title-left',
                style: { ...props, width: `${width}px`, height: `${f.height}px`, 'padding-top': `${margins.top}px`, 'padding-bottom': `${margins.bottom}px` } });
            setText(node, store.text(cell.rowName));
            return;
        }
        patch(node, { class: 'vis-facet-row-title vis-facet-row-title-right', width, height: f.height });
        let text = node.firstElementChild;
        if (!text)
            text = node.appendChild(create('text'));
        const [x, y] = [width/2, margins.top + f.innerHeight/2];
        Object.entries({ x, y, transform: `rotate(90 ${x} ${y})`, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
            .forEach(([k, v]) => text.setAttribute(k, v));
        Object.entries(props).forEach(([k, v]) => v === null ? text.style.removeProperty(k) : text.style.setProperty(k, v));
        text.textContent = store.text(cell.rowName);
    };

    // the props of the title of a facet (`facets.title.props`), css
    // properties, the ones of the facet before which are none anymore are removed
    let propNames = new Set();
    const titleProps = (f, dim = store.def.facets.dim, key = f.key) => {
        const raw = store.def.facets?.title?.props;
        const category = (dim && key !== undefined ? store.prop(dim, String(key)) : null) ?? {};
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
        const grid = view.faceted ? gridOf(store.def) : null;
        const side = store.def.facets?.rowHeaders ?? 'right';
        // the elements of a grid besides the facets, e.g. the headers of its rows
        const extra = (key, make) => {
            let entry = shown.get(key);
            if (!entry)
                entry = { el: make(), facet: null, new: false };
            next.set(key, entry);
            shown.delete(key);
            return entry.el;
        };
        facets.forEach(f => {
            const key = view.faceted ? String(f.key) : '';
            const cell = grid ? f.cell : null;
            // the header of the row of a grid, left of its first facet
            if (cell?.row !== undefined && side == 'left' && cell.colIndex == 0)
                rowHeader(extra(`row ${cell.row}`, () => el('div')), f, side);
            // an empty cell of a grid, a box of the size of a facet
            let entry = shown.get(key);
            if (entry && Boolean(entry.facet) == Boolean(f.empty)) {
                remove(entry);
                entry = null;
            }
            if (!entry && f.empty) {
                const title = cell && cell.rowIndex == 0 && grid.cols ? el('div') : null;
                entry = { el: el('div', null, title, el('div', { class: 'vis-facet vis-facet-empty' })), title, facet: null, new: false };
            } else if (!entry) {
                const facet = createFacet(vis, f);
                // the title spans the plot area, its margins are the ones of
                // the facet, a style of the page can replace them; of a grid
                // the names of the columns above its first row
                const title = view.faceted && (!cell || (cell.rowIndex == 0 && grid.cols)) ? el('div') : null;
                const box = view.faceted ? el('div', null, ...[title, facet.el].filter(Boolean)) : facet.el;
                entry = { el: box, title, facet, new: true };
            } else if (entry.facet)
                entry.facet.update(f);
            if (f.empty)
                patch(entry.el.lastChild, { class: 'vis-facet vis-facet-empty', style: `width: ${f.width}px; height: ${f.height}px;` });
            if (view.faceted)
                patch(entry.el, { style: `width: ${f.width}px; display: inline-block;${grid ? ' vertical-align: bottom;' : ''}` });
            if (entry.title) {
                // the props of the titles (css properties), of the props of
                // the category of the facet, e.g. its color, and the globals
                const props = cell ? titleProps(f, grid.cols, cell.col) : titleProps(f);
                patch(entry.title, {
                    class: (store.coord.centered ? 'vis-facet-title vis-facet-title-center' : 'vis-facet-title') + (cell ? ' vis-facet-col-title' : ''),
                    style: { ...props, '--gen-vis-margin-left': `${f.margins.left}px`, '--gen-vis-margin-right': `${f.margins.right}px` },
                });
                setText(entry.title, store.text(f.name));
            }
            next.set(key, entry);
            shown.delete(key);
            // the header of the row right of its last facet, the end of the row
            if (cell && cell.colIndex == cell.cols - 1) {
                if (cell.row !== undefined && side != 'left')
                    rowHeader(extra(`row ${cell.row}`, () => create('svg')), f, side);
                extra(`end ${cell.rowIndex}`, () => el('div', { class: 'vis-facet-row-end' }));
            }
        });
        shown.forEach(remove);
        shown = next;
        // in the order of the view
        [...shown.values()].reduceRight((next, entry) => place(parent, entry.el, next), null);
        shown.forEach(entry => {
            if (entry.new && entry.facet) {
                entry.new = false;
                mounted.push(entry.facet);
            }
        });
        mounted.forEach(f => f.mounted());
    };

    return {
        update,
        highlight(entry) {
            shown.forEach(e => e.facet?.highlight(entry));
        },
        destroy() {
            shown.forEach(remove);
            shown = new Map();
        },
    };
};
