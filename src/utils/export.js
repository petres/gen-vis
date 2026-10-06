export { selection, renderImage, saveImage, copyImage, canCopy, defaultWidth };

import { render } from "vue";
import { sameValue } from "@/utils/json";

// the space around the visualisation in the image
const padding = 15;

// the width of the images, if neither the page nor the definition sets one
const defaultWidth = 1200;

// the time to wait for the copy of the visualisation
const timeout = 20000;

// the chosen entries of the form elements of a prepared definition, e.g.
// "Einheit: Anteil · Jahr: 2024", the image has no form elements
const selection = def => (def.formElements ?? []).map(e => {
    const entry = e.values.find(v => sameValue(v.value, def.globals?.[e.ref]));
    return entry ? `${e.name}: ${entry.name}` : null;
}).filter(Boolean).join(' · ');

// a copy of the visualisation without the form elements and the buttons, the
// selection is a line below the subtitle and the legends only have the
// entries shown
const prepare = (vis, text) => {
    const copy = vis.cloneNode(true);
    copy.querySelectorAll('.vis-form-elements, .vis-buttons').forEach(e => e.remove());
    copy.querySelectorAll('.legend [data-visible="false"]').forEach(e => e.remove());

    const subtitle = copy.querySelector('.vis-header .subtitle');
    if (text && subtitle) {
        const line = subtitle.textContent.trim() ? subtitle.cloneNode(false) : subtitle;
        subtitle.after(line);
        line.textContent = text;
    }

    copy.style.padding = `${padding}px`;
    return copy;
};

/**
 * The PNG (a Blob, twice the size) of a visualisation of the given `width`,
 * independent of the size of the screen. `vnode(done)` is a GenVis of the
 * same definition, data and state, which calls `done.resolve` once it is
 * drawn and `done.reject` on errors. It is rendered next to `outer` (outside
 * of the screen), so the styles of the page apply.
 */
const renderImage = async (outer, vnode, { width, text }) => {
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
        const copy = shot.appendChild(prepare(root.querySelector('.vis'), text));

        return await domToBlob(copy, { scale: 2, backgroundColor: '#FFF', type: 'image/png' });
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
