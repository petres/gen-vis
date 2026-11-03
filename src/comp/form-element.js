export { createFormElement };

import { itemOf, join } from "@/utils/dom";
import { sameValue } from "@/utils/def";
import { el, patch, setText } from "@/comp/html";

// the radio buttons of a form element are a group of their own, also if
// several visualisations on a page use the same ids
let count = 0;

/**
 * A form element of the definition (a select, radio buttons or a slider),
 * its entry is the value of the global `element.ref` of `globals`, a change
 * of the user sets it and calls `changed()`. `update()` draws it again,
 * e.g. of a new state, `destroy()` ends a move of a slider.
 */
const createFormElement = (vis, element, globals, changed) => {
    const uid = `gen-vis-form-${count++}`;
    const type = element.type;
    const root = el('div', { class: 'vis-form-element', 'data-id': element.id });
    let frame = null;
    let position = null;

    const equal = v => sameValue(v, globals[element.ref]);
    const switched = entry => {
        if (!entry || equal(entry.value))
            return;
        globals[element.ref] = entry.value;
        changed();
    };
    // the entry of a slider, at most once a frame, the events of a fast
    // move are drawn together, at its end (`change`) at once
    const moved = (index, end = false) => {
        position = index;
        if (end) {
            cancelAnimationFrame(frame);
            frame = null;
            return switched(element.values[index]);
        }
        frame ??= requestAnimationFrame(() => vis.guard(() => {
            frame = null;
            switched(element.values[position]);
        }));
    };
    const on = (node, name, fn) => node.addEventListener(name, e => vis.guard(() => fn(e)));

    // the title is the label of the select and the slider, the name of the radio buttons
    const title = root.appendChild(el(type == 'radio' ? 'div' : 'label'));
    let input = null, value = null;
    if (type == 'select') {
        input = root.appendChild(el('select'));
        on(input, 'change', e => switched(element.values[e.target.selectedIndex]));
    } else if (type == 'radio') {
        input = root.appendChild(el('div'));
    } else if (type == 'slider') {
        // the positions of the entries, e.g. years, the visualisation changes while it is moved
        input = el('input');
        value = el('span');
        root.appendChild(el('div', { class: 'vis-slider' }, input, value));
        on(input, 'input', e => moved(+e.target.value));
        on(input, 'change', e => moved(+e.target.value, true));
    }

    const update = () => {
        const id = `${uid}-${element.id}`;
        patch(root, { class: 'vis-form-element', 'data-id': element.id });
        patch(title, type == 'radio' ? { class: 'vis-form-element-title', id: `${id}-title` } : { class: 'vis-form-element-title', for: id });
        setText(title, `${element.name ?? ''}:`);
        if (type == 'select') {
            patch(input, { id });
            join(input, element.values, { key: e => e.id, create: () => el('option') }).forEach((option, i) => {
                const e = element.values[i];
                patch(option, { selected: equal(e.value), value: e.id });
                setText(option, e.name);
            });
        } else if (type == 'radio') {
            patch(input, { class: 'vis-radio', role: 'radiogroup', 'aria-labelledby': `${id}-title` });
            // the change of the radio button, by its label, a click or the keyboard
            join(input, element.values, { key: e => e.id, create: () => {
                const div = el('div', null, el('input'), el('label'));
                on(div.firstChild, 'change', () => switched(div[itemOf]));
                return div;
            } }).forEach((div, i) => {
                const e = element.values[i];
                patch(div, { 'data-id': e.id });
                patch(div.firstChild, { type: 'radio', id: `${id}-${e.id}`, name: id, checked: equal(e.value), value: e.id });
                patch(div.lastChild, { for: `${id}-${e.id}` });
                setText(div.lastChild, e.name);
            });
        } else if (type == 'slider') {
            const index = Math.max(element.values.findIndex(e => equal(e.value)), 0);
            patch(input, { type: 'range', id, min: '0', max: element.values.length - 1, step: '1', 'aria-valuetext': element.values[index]?.name, value: index });
            patch(value, { class: 'vis-slider-value' });
            setText(value, element.values[index]?.name);
        }
    };
    update();

    return {
        el: root,
        update,
        destroy() {
            cancelAnimationFrame(frame);
        },
    };
};
