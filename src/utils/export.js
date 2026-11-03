// the images (PNG, SVG) and the CSV of a visualisation, loaded with the
// first one, see comp/app.js, the SVG is composed by utils/export-svg.js
export { selection, staticCopy, parts, selectParts, partsBox, backgroundOf, renderImage, renderSvg, saveFile, csvOf, defaultWidth, padding };

import * as d3 from "@/utils/d3";
import { selectedEntry } from "@/utils/def";
import { columnValues } from "@/utils/data";
import { lazy } from "@/utils/lazy";

// the space around the visualisation in the images
const padding = 15;

// the width of the images, if neither the page nor the definition sets one
const defaultWidth = 1200;

// the time to wait for the copy of the visualisation
const timeout = 20000;

// the chosen entries of the form elements of a prepared definition, e.g.
// "Einheit: Anteil · Jahr: 2024", the image has no form elements, the ones
// with `"inImage": false` only change the presentation, e.g. shared scales
const selection = def => (def.formElements ?? []).filter(e => e.inImage !== false && e.type != 'hidden').map(e => {
    const entry = selectedEntry(def, e);
    return entry ? `${e.name}: ${entry.name}` : null;
}).filter(Boolean).join(' · ');

// a copy of the visualisation without the form elements, the buttons and the
// legend of the facets (their titles name them), the selection is a line
// below the subtitle (of the class `vis-selection`, with the attributes of
// the subtitle) and the legends only have the entries shown
const prepare = (vis, { text, facets, space }) => {
    const copy = vis.cloneNode(true);
    copy.querySelectorAll('.vis-form-elements, .vis-buttons').forEach(e => e.remove());
    if (facets)
        copy.querySelector(`.vis-legend[data-dim="${CSS.escape(facets)}"]`)?.remove();
    copy.querySelectorAll('.vis-legend [data-visible="false"]').forEach(e => e.remove());

    const subtitle = copy.querySelector('.vis-header .vis-subtitle');
    if (text && subtitle) {
        const line = subtitle.cloneNode(false);
        line.className = 'vis-selection';
        line.removeAttribute('id');
        line.textContent = text;
        subtitle.after(line);
    }

    copy.style.padding = `${space}px`;
    return copy;
};

/**
 * A static copy of a visualisation of the given `width` (and `space` around
 * it), independent of the size of the screen, the one of the images: the
 * copy (`.vis`, see prepare) is drawn once, nothing of it changes anymore,
 * e.g. of a new width. `mount(holder, done)` draws a visualisation of the
 * same definition, data and state in `holder`, which calls `done.resolve`
 * once it is drawn and `done.reject` on errors, and returns it (of
 * createGenVis), it is removed once it is copied. `place(wrapper)` puts the
 * element of the copy into the page, e.g. next to the visualisation, so
 * the styles of the page apply, it is outside of the screen, `visible` at
 * the top left of the page (e.g. of a screenshot of the export page).
 * Returns the copy and `remove()`, which removes it.
 */
const staticCopy = async (place, mount, { width, space = padding, visible = false, wait = timeout }) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = visible ? 'position: absolute; top: 0; left: 0;' : 'position: fixed; top: 0; left: -100000px;';
    const holder = wrapper.appendChild(document.createElement('div'));
    holder.style.width = `${width}px`;
    place(wrapper);

    let shown = null;
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('The image was not rendered in time.')), wait);
            shown = mount(holder, {
                resolve: () => { clearTimeout(timer); resolve(); },
                reject: message => { clearTimeout(timer); reject(new Error(message)); },
            });
        });
        // the texts in their fonts, e.g. of a stylesheet of the page
        await document.fonts?.ready;

        // the copy is in an element as the one of the visualisation, e.g. of its classes
        const root = holder.firstElementChild;
        const shot = wrapper.appendChild(root.cloneNode(false));
        shot.style.cssText = `margin: 0; width: ${width + 2*space}px;`;
        const def = shown.store.def;
        const copy = shot.appendChild(prepare(root.querySelector('.vis'), { text: selection(def), facets: def.facets?.dim, space }));
        return { copy, remove: () => wrapper.remove() };
    } catch (error) {
        wrapper.remove();
        throw error;
    } finally {
        shown?.destroy();
        holder.remove();
    }
};

// the parts of the images, see README "Static export"
const parts = ['title', 'subtitle', 'selection', 'legend', 'plot', 'footer'];

// the elements of a part of a copy (`.vis`), see README "Styles"
const partSelectors = {
    title: '.vis-header .vis-title',
    subtitle: '.vis-header .vis-subtitle',
    selection: '.vis-header .vis-selection',
    legend: '.vis-legends',
    plot: '.vis-body > :not(.vis-legends), .vis-message',
    footer: '.vis-footer',
};

// all parts, also of null (the default)
const allParts = chosen => !chosen || parts.every(p => chosen.includes(p));

// the parts of a copy not chosen are not displayed, the others move
// together, e.g. the plots to the top without the header
const selectParts = (copy, chosen) => {
    if (chosen && (!Array.isArray(chosen) || !chosen.length))
        throw new Error(`The parts of an image are a list of ${parts.join(', ')}.`);
    const unknown = (chosen ?? []).filter(p => !parts.includes(p));
    if (unknown.length)
        throw new Error(`Unknown parts of an image: ${unknown.join(', ')}, expected some of ${parts.join(', ')}.`);
    if (!allParts(chosen))
        parts.filter(p => !chosen.includes(p)).forEach(p => copy.querySelectorAll(partSelectors[p]).forEach(e => e.style.display = 'none'));
};

// the rectangle of the image of a copy in the coordinates of the page
// (client coordinates): the copy with its space, of some parts the full
// width and the height of them, with the space above and below
const partsBox = (copy, chosen, space = padding) => {
    const r = copy.getBoundingClientRect();
    if (allParts(chosen))
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    const rects = chosen.flatMap(p => [...copy.querySelectorAll(partSelectors[p])])
        .map(e => e.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0);
    if (!rects.length)
        throw new Error(`The image has nothing of the parts ${chosen.join(', ')}.`);
    const top = Math.max(r.top, Math.min(...rects.map(b => b.top)) - space);
    const bottom = Math.min(r.bottom, Math.max(...rects.map(b => b.bottom)) + space);
    return { left: r.left, top, width: r.width, height: bottom - top };
};

// the background of the images, the one of the page, e.g. a dark one
const backgroundOf = copy => getComputedStyle(copy).getPropertyValue('--gen-vis-background').trim() || '#FFF';

// the scale of the images, twice the size, narrow ones (e.g. of a phone) more,
// so they have at least the pixels of the default width, e.g. 4 of 360
const scaleOf = width => Math.max(2, Math.ceil(defaultWidth / width));

/**
 * The PNG (a Blob, see scaleOf) of the static copy of a visualisation of
 * the given `width` next to `outer`, see staticCopy.
 */
const renderImage = async (outer, mount, { width }) => {
    const { domToBlob } = await lazy.screenshot();
    const { copy, remove } = await staticCopy(wrapper => outer.after(wrapper), mount, { width });
    try {
        return await domToBlob(copy, { scale: scaleOf(width), backgroundColor: backgroundOf(copy), type: 'image/png' });
    } finally {
        remove();
    }
};

/**
 * The SVG (a string) of the static copy of a visualisation of the given
 * `width` next to `outer` (see staticCopy), of the `parts` chosen (default
 * all), its size in `unit`, on its `background` (by default the one of the
 * PNG, null none), see README "Static export" and utils/export-svg.js.
 */
const renderSvg = async (outer, mount, { width, parts = null, unit = 'px', background }) => {
    const { composeSvg } = await lazy.svg();
    const { copy, remove } = await staticCopy(wrapper => outer.after(wrapper), mount, { width });
    try {
        selectParts(copy, parts);
        copy.style.background = background === undefined ? backgroundOf(copy) : (background ?? 'none');
        return composeSvg(copy, { box: partsBox(copy, parts), unit });
    } finally {
        remove();
    }
};

// a file saved by the browser, e.g. a PNG or a CSV, `name` with the extension
const saveFile = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// the rows shown as CSV, in the columns of the mappings, the values as the
// ones of the data, e.g. dates as they are in the file, also the columns of
// transforms
const csvOf = (store, rows) => {
    const positions = new Map(store.data.map((r, i) => [r, i]));
    const columns = [...new Set(Object.values(store.def.mapping).map(m => m.column).filter(c => typeof c == 'string'))];
    const values = columns.map(c => columnValues(store.rows, store.columns, c));
    return d3.csvFormat(rows.map(r => {
        const i = positions.get(r);
        return Object.fromEntries(columns.map((c, j) => [c, values[j](i)]));
    }), columns);
};

