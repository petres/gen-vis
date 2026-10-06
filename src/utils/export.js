export { selection, exportPng };

import { sameValue } from "@/utils/json";

// the space around the visualisation in the image
const padding = 15;

// the chosen entries of the form elements of a prepared definition, e.g.
// "Einheit: Anteil · Jahr: 2024", the image has no form elements
const selection = def => (def.formElements ?? []).map(e => {
    const entry = e.values.find(v => sameValue(v.value, def.globals?.[e.ref]));
    return entry ? `${e.name}: ${entry.name}` : null;
}).filter(Boolean).join(' · ');

// a copy of the visualisation without the form elements and the button, the
// selection is a line below the subtitle and the legends only have the
// entries shown
const prepare = (vis, text) => {
    const copy = vis.cloneNode(true);
    copy.querySelectorAll('.vis-form-elements, .vis-download').forEach(e => e.remove());
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

// the visualisation (the element of the class `vis`) as a PNG of twice its
// size, the copy is next to it outside of the screen, in an element as the
// one of the component, so the styles of the page apply
const exportPng = async (vis, { name, text }) => {
    const { domToPng } = await import('modern-screenshot');

    const outer = vis.parentElement;
    const wrapper = outer.cloneNode(false);
    wrapper.style.cssText = `position: fixed; top: 0; left: -100000px; margin: 0; width: ${vis.getBoundingClientRect().width + 2*padding}px;`;
    const copy = prepare(vis, text);
    wrapper.appendChild(copy);
    outer.after(wrapper);

    try {
        const url = await domToPng(copy, { scale: 2, backgroundColor: '#FFF' });
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.png`;
        a.click();
    } finally {
        wrapper.remove();
    }
};
