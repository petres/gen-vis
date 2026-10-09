export { selection, renderImage, saveImage, copyImage, canCopy, defaultWidth };

import { render } from "vue";
import { sameValue } from "@/utils/def";

// the space around the visualisation in the image
const padding = 15;

// the width of the images, if neither the page nor the definition sets one
const defaultWidth = 1200;

// the time to wait for the copy of the visualisation
const timeout = 20000;

// the chosen entries of the form elements of a prepared definition, e.g.
// "Einheit: Anteil · Jahr: 2024", the image has no form elements, the ones
// with `"inImage": false` only change the presentation, e.g. shared scales
const selection = def => (def.formElements ?? []).filter(e => e.inImage !== false).map(e => {
    const entry = e.values.find(v => sameValue(v.value, def.globals?.[e.ref]));
    return entry ? `${e.name}: ${entry.name}` : null;
}).filter(Boolean).join(' · ');

// a copy of the visualisation without the form elements, the buttons and the
// legend of the facets (their titles name them), the selection is a line
// below the subtitle (of the class `selection`, with the scoped styles of the
// subtitle) and the legends only have the entries shown
const prepare = (vis, { text, facets }) => {
    const copy = vis.cloneNode(true);
    copy.querySelectorAll('.vis-form-elements, .vis-buttons').forEach(e => e.remove());
    if (facets)
        copy.querySelector(`.legend[data-dim="${CSS.escape(facets)}"]`)?.remove();
    copy.querySelectorAll('.legend [data-visible="false"]').forEach(e => e.remove());

    const subtitle = copy.querySelector('.vis-header .subtitle');
    if (text && subtitle) {
        const line = subtitle.cloneNode(false);
        line.className = 'selection';
        line.textContent = text;
        subtitle.after(line);
    }

    copy.style.padding = `${padding}px`;
    return copy;
};

// the scale of the images, twice the size, narrow ones (e.g. of a phone) more,
// so they have at least the pixels of the default width, e.g. 4 of 360
const scaleOf = width => Math.max(2, Math.ceil(defaultWidth / width));

/**
 * The PNG (a Blob, see scaleOf) of a visualisation of the given `width`,
 * independent of the size of the screen. `vnode(done)` is a GenVis of the
 * same definition, data and state, which calls `done.resolve` once it is
 * drawn and `done.reject` on errors. It is rendered next to `outer` (outside
 * of the screen), so the styles of the page apply. `text` is the selection,
 * `facets` the mapping of the facets.
 */
const renderImage = async (outer, vnode, { width, ...parts }) => {
    const { domToBlob } = await import('modern-screenshot');

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: fixed; top: 0; left: -100000px;';
    const holder = wrapper.appendChild(document.createElement('div'));
    holder.style.width = `${width}px`;
    outer.after(wrapper);

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('The image was not rendered in time.')), timeout);
            render(vnode({
                resolve: () => { clearTimeout(timer); resolve(); },
                reject: message => { clearTimeout(timer); reject(new Error(message)); },
            }), holder);
        });

        // the copy is in an element as the one of the component, e.g. of its classes
        const root = holder.firstElementChild;
        const shot = wrapper.appendChild(root.cloneNode(false));
        shot.style.cssText = `margin: 0; width: ${width + 2*padding}px;`;
        const copy = shot.appendChild(prepare(root.querySelector('.vis'), parts));

        return await domToBlob(copy, { scale: scaleOf(width), backgroundColor: '#FFF', type: 'image/png' });
    } finally {
        render(null, holder);
        wrapper.remove();
    }
};

const saveImage = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// only on https (or localhost), the blob is a promise, so the clipboard is
// written while the click is still the action of the user (as Safari needs)
const canCopy = () => typeof ClipboardItem != 'undefined' && Boolean(globalThis.navigator?.clipboard?.write);

const copyImage = blob => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
