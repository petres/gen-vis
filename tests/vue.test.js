// @vitest-environment jsdom
// the Vue adapter (src/vue.js): the props, v-model:state, the events, the
// slots (also of data of the page which changes), the methods, the plugin,
// the component of another Vue and the unmount, e.g. as the pages of an
// application use it
import { describe, test, expect, vi } from 'vitest';
import * as Vue from 'vue';
import { createApp, h, nextTick as vueTick, ref, reactive } from 'vue';
import plugin, { GenVis, createVueComponent, vuePlugin } from '@/vue.js';
import { errors, useDom, rendered, mount, pointer, nextTick } from './dom.js';

vi.mock('@/utils/raster.js', () => ({
    rasterize: async () => new Blob(['png'], { type: 'image/png' }),
}));

useDom();

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, title: 'Titel', footer: 'Quelle', ...options },
    globals: { column: 'value' },
    formElements: [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
        { id: 'value', name: 'Value', value: 'value', patch: { mapping: { y: { column: 'value' } } } },
        { id: 'other', name: 'Other', value: 'other', patch: { mapping: { y: { column: 'other' } } } },
    ] }],
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } },
    },
    plot: [{ type: 'svg:circle', by: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } }],
});

const lineData = `year,value,other,land
2020,1,10,Wien
2021,2,20,Wien
2020,2,20,Tirol
2021,2,20,Tirol`;

// an application of `render`, its element, drawn
const mountApp = async (render, setup = {}) => {
    const el = document.body.appendChild(document.createElement('div'));
    const app = createApp({ setup: () => setup, render });
    app.mount(el);
    await rendered(el);
    await nextTick();
    return { el, app };
};

const html = el => el.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/ gen-vis-(gradient|control|facet)-\d+/g, ' gen-vis-$1-N').replace(/"gen-vis-(gradient|control|facet)-\d+/g, '"gen-vis-$1-N');

describe('the component', () => {
    test('draws the same elements as the core, in the element of the component with the classes of the page', async () => {
        const { el } = await mountApp(() => h(GenVis, { class: 'card', def: lineDef(), data: lineData, csv: true }));
        const core = await mount({ def: lineDef(), data: lineData, csv: true });
        const outer = el.firstElementChild;
        expect(outer.className).toBe('vis-outer card');
        const same = h => h.replace(/gen-vis-\w+-\d+/g, 'ID').replace(/data-vis="\d+"/g, 'data-vis="N"');
        expect(same(html(outer))).toBe(same(html(core.firstElementChild)));
        expect(errors).toEqual([]);
    });

    test('the props: a new definition is loaded, a new state and globals are applied, the buttons follow', async () => {
        const def = ref(lineDef());
        const state = ref(null);
        const download = ref(false);
        const { el } = await mountApp(() => h(GenVis, { def: def.value, data: lineData, state: state.value, download: download.value }));
        expect(el.querySelector('.vis-buttons')).toBeNull();
        download.value = 'chart';
        await vueTick();
        await nextTick();
        expect(el.querySelector('.vis-download')).not.toBeNull();

        state.value = { globals: { column: 'other' }, visible: { c: { Tirol: false } } };
        await vueTick();
        await nextTick();
        expect([...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.visible)).toEqual(['true', 'false']);
        expect(el.querySelectorAll('.vis-control input')[1].checked).toBe(true);

        def.value = lineDef({ title: 'Neu' });
        await vi.waitFor(() => expect(el.querySelector('.vis-title').textContent).toBe('Neu'));
        expect(errors).toEqual([]);
    });

    test('the defaults of the parts, e.g. of the tick marks, also changed ones', async () => {
        const defaults = ref({ axis: { padding: 1, tickMarks: { size: 4 } } });
        const { el } = await mountApp(() => h(GenVis, { def: lineDef(), data: lineData, defaults: defaults.value }));
        const label = () => el.querySelector('.vis-axis-bottom .tick text').getAttribute('y');
        expect(el.querySelector('.vis-axis-bottom .tick line').getAttribute('y2')).toBe('4');
        // the marks inside (their inset of 4), the padding of 1
        expect(label()).toBe('1');
        defaults.value = { axis: { tickMarks: { size: 2 } } };
        await vi.waitFor(() => expect(label()).toBe('3'));
        await vi.waitFor(() => expect(el.querySelector('.vis-axis-bottom .tick line').getAttribute('y2')).toBe('2'));
        expect(errors).toEqual([]);
    });

    test('v-model:state reports the changes of the user and takes the ones of the page', async () => {
        const state = ref(null);
        const updates = [];
        // the same definition, a new one is loaded again
        const def = lineDef();
        const { el } = await mountApp(() => h(GenVis, { def, data: lineData, state: state.value, 'onUpdate:state': s => {
            updates.push(s);
            state.value = s;
        } }));
        el.querySelectorAll('.vis-control .vis-radio input')[1].click();
        await vueTick();
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').click();
        await vueTick();
        await nextTick();
        expect(updates).toEqual([
            { globals: { column: 'other' } },
            { globals: { column: 'other' }, visible: { c: { Tirol: false } } },
        ]);
        // the page resets it, not reported as a change
        state.value = null;
        await vueTick();
        await nextTick();
        expect([...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.visible)).toEqual(['true', 'true']);
        expect(updates).toHaveLength(2);
        // a change of the state of the page in place, e.g. of a reactive object
        const kept = reactive({ visible: { c: { Wien: true } } });
        state.value = kept;
        await vueTick();
        kept.visible.c.Wien = false;
        await vueTick();
        await nextTick();
        expect(el.querySelector('.vis-legend-entry[data-key="Wien"]').dataset.visible).toBe('false');
        expect(errors).toEqual([]);
    });

    test('the events: rendered, hover, select and error', async () => {
        const events = [];
        const on = name => e => events.push([name, e && (e.key ?? e)]);
        const { el } = await mountApp(() => h(GenVis, { def: lineDef(), data: lineData, onRendered: on('rendered'), onHover: on('hover'), onSelect: on('select') }));
        const area = el.querySelector('rect.vis-events');
        area.dispatchEvent(pointer('pointermove', { clientX: 549, clientY: 0 }));
        area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 549, clientY: 0 }));
        area.dispatchEvent(pointer('pointerleave'));
        expect(events).toEqual([['rendered', undefined], ['hover', 2021], ['select', 2021], ['hover', null]]);

        const failed = [];
        const { el: broken } = await mountApp(() => h(GenVis, { defFile: '/data/missing.json', onError: e => failed.push(e) }));
        expect(broken.querySelector('.vis-error')).not.toBeNull();
        expect(failed).toHaveLength(1);
        errors.length = 0;
    });

    test('the slots: header, footer, hover and buttons, with the data of the page', async () => {
        const active = ref(false);
        const save = vi.fn();
        const { el } = await mountApp(() => h(GenVis, { def: lineDef(), data: lineData }, {
            header: ({ title }) => h('h2', title.toUpperCase()),
            footer: ({ footer }) => h('small', `${footer}!`),
            hover: ({ title, rows }) => h('div', { class: 'own' }, `${title}: ${rows.map(r => r.c).join(', ')}`),
            buttons: ({ save: s, canCopy }) => [
                h('button', { class: ['fav', { active: active.value }], onClick: () => active.value = !active.value }),
                h('button', { class: 'own-save', 'data-copy': String(canCopy), onClick: () => { save(); s; } }),
            ],
        }));
        expect(el.querySelector('.vis-header h2').textContent).toBe('TITEL');
        expect(el.querySelector('.vis-footer-content small').textContent).toBe('Quelle!');
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['fav', 'own-save']);
        // the content of a slot follows the data of the page it uses
        el.querySelector('.fav').click();
        await vueTick();
        expect(el.querySelector('.fav').className).toBe('fav active');
        el.querySelector('.own-save').click();
        expect(save).toHaveBeenCalledTimes(1);

        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 549, clientY: 0 }));
        expect(el.querySelector('.vis-hover .own').textContent).toBe('2021: Wien, Tirol');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 1, clientY: 0 }));
        expect(el.querySelector('.vis-hover .own').textContent).toBe('2020: Wien, Tirol');
        expect(el.querySelectorAll('.vis-hover .own')).toHaveLength(1);

        // a new state draws the header again
        el.querySelectorAll('.vis-control .vis-radio input')[1].click();
        await nextTick();
        expect(el.querySelectorAll('.vis-header h2')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('a slot of v-if, e.g. buttons of the settings of the page', async () => {
        const settings = ref(false);
        const movable = ref(false);
        const def = lineDef();
        const { el } = await mountApp(() => h(GenVis, { def, data: lineData, download: 'name', copy: true, imageWidth: 'screen' },
            settings.value ? { buttons: () => [h('button', { class: 'reset' }), movable.value ? h('button', { class: 'move' }) : null] } : {}));
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['vis-button vis-download']);
        settings.value = true;
        await vueTick();
        await nextTick();
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['reset', 'vis-button vis-download']);
        // the content of the slot changes, Vue draws it between the nodes of the slot
        movable.value = true;
        await vueTick();
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['reset', 'move', 'vis-button vis-download']);
        settings.value = false;
        await vueTick();
        await nextTick();
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['vis-button vis-download']);
        expect(errors).toEqual([]);
    });

    test('the methods of a ref, the image and the CSV', async () => {
        URL.createObjectURL = () => 'blob:png';
        URL.revokeObjectURL = () => {};
        const files = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { files.push(this.download); });
        const chart = ref();
        const { el } = await mountApp(() => h(GenVis, { ref: chart, def: lineDef(), data: lineData, imageWidth: 'screen' }), { chart });
        await expect(chart.value.image()).resolves.toBeInstanceOf(Blob);
        await chart.value.exportPng('bild');
        await chart.value.exportCsv();
        expect(files).toEqual(['bild.png', 'Titel.csv']);
        // the copy of the image is removed again
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        chart.value.setHighlight({ c: 'Wien' });
        expect(el.querySelectorAll('circle.vis-highlight').length).toBe(0);
        // the rows as a table and the chart again
        chart.value.showTable(true);
        await vi.waitFor(() => expect(el.querySelector('table.vis-table')).not.toBeNull());
        chart.value.showTable(false);
        await nextTick();
        expect(el.querySelector('table.vis-table')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the prop table, a button of the table', async () => {
        const table = ref(true);
        const { el } = await mountApp(() => h(GenVis, { def: lineDef(), data: lineData, table: table.value }), { table });
        expect(el.querySelector('.vis-buttons .vis-table')).not.toBeNull();
        table.value = false;
        await vueTick();
        await nextTick();
        expect(el.querySelector('.vis-buttons .vis-table')).toBeNull();
    });

    test('the element of the component, e.g. for its position on the page', async () => {
        const chart = ref();
        await mountApp(() => h(GenVis, { ref: chart, class: 'visEntry', def: lineDef(), data: lineData }), { chart });
        expect(chart.value.$el.classList.contains('vis-outer')).toBe(true);
        expect(chart.value.$el.classList.contains('visEntry')).toBe(true);
        expect(chart.value.$el.getBoundingClientRect().width).toBe(800);
    });

    test('a lazy one has the class vis-loading also after a change of the classes of the page', async () => {
        const observers = [];
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(el) { this.el = el; }
            disconnect() {}
        });
        const cls = ref('a');
        const def = lineDef();
        const el = document.body.appendChild(document.createElement('div'));
        createApp({ render: () => h(GenVis, { class: cls.value, def, data: lineData, lazy: true }) }).mount(el);
        await nextTick();
        expect(el.firstElementChild.className).toBe('vis-outer a vis-loading');
        cls.value = 'b';
        await vueTick();
        await nextTick();
        expect(el.firstElementChild.classList.contains('vis-loading')).toBe(true);
        expect(el.firstElementChild.classList.contains('b')).toBe(true);
        observers[0].callback([{ isIntersecting: true }]);
        await rendered(el);
        expect(el.firstElementChild.classList.contains('vis-loading')).toBe(false);
    });

    test('a component of a new key while the one before is loaded: a new element of the visualisation', async () => {
        const key = ref(1);
        const cls = ref('a');
        const def = lineDef({ title: 'Schlüssel' });
        const { el } = await mountApp(() => h(GenVis, { key: key.value, class: cls.value, def, data: lineData }));
        const first = el.firstElementChild;
        // drawn anew, the one before is destroyed while it is loaded (with its height of 400)
        key.value = 2;
        await vueTick();
        key.value = 3;
        cls.value = 'b';
        await vueTick();
        await rendered(el);
        await nextTick();
        expect(el.children).toHaveLength(1);
        expect(el.firstElementChild).not.toBe(first);
        expect(el.firstElementChild.className).toBe('vis-outer b');
        expect(el.firstElementChild.getAttribute('style')).toBeNull();
        expect(el.querySelector('.vis-title').textContent).toBe('Schlüssel');
        expect(errors).toEqual([]);
    });

    test('the unmount removes the visualisation, its listeners and the slots', async () => {
        const remove = vi.spyOn(document, 'removeEventListener');
        const show = ref(true);
        const def = lineDef();
        const { el } = await mountApp(() => show.value ? h(GenVis, { def, data: lineData }, { header: () => h('h2', 'Kopf') }) : null);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 549, clientY: 0 }));
        show.value = false;
        await vueTick();
        expect(el.innerHTML.replace(/<!--[\s\S]*?-->/g, '')).toBe('');
        expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
        expect(errors).toEqual([]);
    });
});

describe('the plugin and another Vue', () => {
    test('app.use registers <GenVis>', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        createApp({ template: '<GenVis :def="def" data="year,value,other,land\n2020,1,10,Wien"/>', data: () => ({ def: lineDef() }) })
            .use(plugin).mount(el);
        await rendered(el);
        expect(el.querySelector('.vis-title').textContent).toBe('Titel');
    });

    test('the component and the plugin of the Vue of a page, e.g. the global Vue', async () => {
        const component = createVueComponent(Vue);
        expect(component.name).toBe('GenVis');
        const own = vuePlugin(Vue);
        const el = document.body.appendChild(document.createElement('div'));
        createApp({ render: () => h(own.component, { def: lineDef(), data: lineData }) }).use(own).mount(el);
        await rendered(el);
        expect(el.querySelector('svg.vis-svg')).not.toBeNull();
        expect(errors).toEqual([]);
    });
});
