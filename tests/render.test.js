// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { GenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement, registerPlotType, pointwise } from '@/index.js';
import { plotTypes } from '@/plots';
import { parquetWriteBuffer } from 'hyparquet-writer';
import * as d3 from 'd3-scale-chromatic';
import { prepareDef } from '@/utils/def';
import { clearCache, createStore } from '@/store';
import { selection } from '@/utils/export';
import { examples, errors, useDom, rendered, mount, pointer, hover } from './dom.js';

// the image of the copy of the visualisation, the copy and the width of its
// container are kept for the tests
const screenshot = vi.hoisted(() => ({ copy: null, width: null, scale: null }));
vi.mock('modern-screenshot', () => ({
    domToBlob: async (node, options) => {
        screenshot.copy = node.cloneNode(true);
        screenshot.width = node.parentElement.style.width;
        screenshot.scale = options.scale;
        return new Blob(['png'], { type: 'image/png' });
    },
}));

useDom();

const plotElements = el => el.querySelectorAll('g.vis-plot path, g.vis-plot circle, g.vis-plot rect, g.vis-plot text').length;

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom', ticks: 5, grid: true, title: { name: 'Jahr', offset: 30 } } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left', ticks: 5 }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, props: { categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } } },
    },
    plot: [
        { type: 'cartesian:line', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } } },
        { type: 'svg:circle', categories: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } },
    ],
});

const lineData = `year,value,other,land
2020,1,10,Wien
2021,,20,Wien
2022,3,30,Wien
2023,4,40,Wien
2020,2,20,Tirol
2021,2,20,Tirol
2022,2,20,Tirol
2023,2,20,Tirol`;

describe('the example definitions', () => {
    test('are found', () => {
        expect(examples.length).toBeGreaterThan(10);
    });

    test.each(examples)('%s renders, hovers and filters', async file => {
        const el = await mount(GenVis, { defFile: file });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(plotElements(el)).toBeGreaterThan(0);
        expect(await hover(el)).toBeGreaterThan(0);

        // hide all entries of the legends, the hover has nothing to show
        for (const entry of el.querySelectorAll('.vis-legend .vis-legend-entries > div[data-visible="true"]'))
            entry.click();
        await nextTick();
        await hover(el);

        expect(errors).toEqual([]);
    }, 60000);
});

describe('rendering', () => {
    test('missing values are gaps in lines and are not drawn as points', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        const [wien, tirol] = el.querySelectorAll('g.vis-plot.plot-0 path');
        expect(wien.getAttribute('d').match(/M/g)).toHaveLength(2);
        expect(tirol.getAttribute('d').match(/M/g)).toHaveLength(1);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(7);
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
    });

    test('the values of the hover have the class value, whatever the name of the mapping', async () => {
        const def = lineDef();
        def.mapping.price = def.mapping.y;
        delete def.mapping.y;
        def.plot = { type: 'cartesian:line', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { x: '@x:scaled', y: '@price:scaled' } } };
        const el = await mount(GenVis, { def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 150 }));
        await nextTick();
        expect([...el.querySelector('.vis-hover tr.vis-hover-entry').children].map(td => [td.getAttribute('data-mapping'), td.className])).toEqual([['c', ''], ['price', 'vis-value']]);
    });

    test('hover at a position with only missing values', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: 'year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien' });
        expect(await hover(el)).toBe(1);
        expect(errors).toEqual([]);
    });

    test('axis title and grid lines of a bottom axis', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        // inner width 550, inner height 250
        expect(el.querySelector('.vis-axis-title').getAttribute('transform')).toBe('translate(275 280)');

        const lines = [...el.querySelectorAll('g.vis-grid line')];
        expect(lines).toHaveLength(el.querySelectorAll('g.vis-axis-bottom g.tick').length);
        lines.forEach(l => {
            expect(l.getAttribute('x1')).toBe(l.getAttribute('x2'));
            expect([l.getAttribute('y1'), l.getAttribute('y2')]).toEqual(['0', '250']);
        });
    });

    test.each([
        [40, 'rotate(-40)', 'end'],
        [-40, 'rotate(40)', 'start'],
    ])('axis labels rotated by %s', async (rotate, transform, anchor) => {
        const def = lineDef();
        def.mapping.x.axis.rotate = rotate;
        const el = await mount(GenVis, { def, data: lineData });
        const labels = [...el.querySelectorAll('g.vis-axis-bottom g.tick text')];
        expect(labels.length).toBeGreaterThan(0);
        labels.forEach(t => {
            expect(t.getAttribute('transform')).toBe(transform);
            expect(t.getAttribute('text-anchor')).toBe(anchor);
        });
    });

    test('curves of lines and areas', async () => {
        const def = lineDef();
        // without gaps, a segment of two points is straight
        const data = lineData.replace('2021,,20', '2021,5,20');
        const wien = async curve => {
            def.plot[0].curve = curve;
            const el = await mount(GenVis, { def, data });
            return el.querySelector('g.vis-plot.plot-0 path').getAttribute('d');
        };
        // linear by default, smooth curves are bezier curves
        expect(await wien(undefined)).not.toMatch(/C/);
        expect(await wien('monotoneX')).toMatch(/C/);
        def.plot = { type: 'cartesian:area', curve: 'monotoneX', categories: ['c'], props: { fill: '@color', d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } } };
        const el = await mount(GenVis, { def, data });
        expect(el.querySelector('g.vis-plot path').getAttribute('d')).toMatch(/C/);
        expect(errors).toEqual([]);
    });

    test('areas', async () => {
        const def = lineDef();
        def.plot = { type: 'cartesian:area', categories: ['c'], props: { fill: '@color', d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } } };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('g.vis-plot path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('an axis without hover definition', async () => {
        const def = lineDef();
        delete def.mapping.y.hover;
        const el = await mount(GenVis, { def, data: lineData });
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
    });

    test('form elements patch the mappings', async () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
            { id: 'value', name: 'Value', value: 'value', mapping: { y: { column: 'value' } } },
            { id: 'other', name: 'Other', value: 'other', mapping: { y: { column: 'other' } } },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        const ticks = () => [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent));
        expect(ticks().at(-1)).toBe(4);

        el.querySelectorAll('.vis-form-element .vis-radio input')[1].click();
        await nextTick();
        expect(ticks().at(-1)).toBe(40);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(8);
        expect(errors).toEqual([]);
    });

    test('column templates combine form elements', async () => {
        const data = 'year,value,other,value.share,other.share,land\n2020,1,10,0.1,0.5,Wien\n2021,2,20,0.2,0.9,Wien';
        const def = lineDef();
        def.mapping.y.column = '{column}{share}';
        def.globals = { column: 'value', share: '' };
        def.formElements = [
            { id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
                { id: 'value', name: 'Value', value: 'value' },
                { id: 'other', name: 'Other', value: 'other' },
            ] },
            { id: 'share', name: 'Anteil', ref: 'share', type: 'radio', values: [
                { id: 'abs', name: 'Absolut', value: '' },
                { id: 'rel', name: 'Anteil', value: '.share', mapping: { y: { axis: { format: '.0%' } } } },
            ] },
        ];
        const el = await mount(GenVis, { def, data });
        const ticks = () => [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent);
        const entries = i => el.querySelectorAll('.vis-form-element')[i].querySelectorAll('.vis-radio input');
        expect(ticks().at(-1)).toBe('2,0');

        entries(0)[1].click();
        await nextTick();
        expect(ticks().at(-1)).toBe('20');

        // other.share
        entries(1)[1].click();
        await nextTick();
        expect(ticks().at(-1)).toBe('90%');

        // value.share
        entries(0)[0].click();
        await nextTick();
        expect(ticks().at(-1)).toBe('20%');
        expect(errors).toEqual([]);
    });

    const stateDef = () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
            { id: 'value', name: 'Value', value: 'value', mapping: { y: { column: 'value' } } },
            { id: 'other', name: 'Other', value: 'other', mapping: { y: { column: 'other' } } },
        ] }];
        return def;
    };
    const maxTick = el => Math.max(...[...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent)));
    const legendVisible = el => [...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.dataset.visible);
    const checked = el => [...el.querySelectorAll('.vis-form-element input')].map(i => i.checked);

    test('the globals and the width are references everywhere, the rows replace globals', async () => {
        const def = lineDef();
        // the global `x` is also a mapping, in the plots `@x` is the one of the row
        def.globals = { accent: 'green', x: 'global' };
        def.formElements = [{ id: 'accent', name: 'Farbe', ref: 'accent', type: 'radio', values: [
            { id: 'green', name: 'Grün', value: 'green' },
            { id: 'black', name: 'Schwarz', value: 'black' },
        ] }];
        def.plot[1].props = { ...def.plot[1].props, stroke: '@accent', 'data-x': '@x', 'data-width': '@totalWidth' };
        def.mapping.c.legend = { props: { 'data-accent': '@accent' } };
        def.annotations = [{ type: 'line', y: 2, props: { stroke: '@accent', 'stroke-width': { prop: 'relative', ref: 'totalWidth', ratio: 0.005 } } }];
        const el = await mount(GenVis, { def, data: lineData });
        const circle = () => el.querySelector('g.vis-plot.plot-1 circle');
        expect(circle().getAttribute('stroke')).toBe('green');
        expect(circle().getAttribute('data-x')).toBe('2020');
        expect(circle().getAttribute('data-width')).toBe('600');
        const line = () => el.querySelector('g.vis-annotations line');
        expect(line().getAttribute('stroke')).toBe('green');
        expect(line().getAttribute('stroke-width')).toBe('3');
        const legend = () => el.querySelector('.vis-legend .vis-legend-entries > div').getAttribute('data-accent');
        expect(legend()).toBe('green');

        el.querySelectorAll('.vis-form-element .vis-radio input')[1].click();
        await nextTick();
        expect(circle().getAttribute('stroke')).toBe('black');
        expect(line().getAttribute('stroke')).toBe('black');
        expect(legend()).toBe('black');
        expect(errors).toEqual([]);
    });

    test('the texts are templates of the globals, the domain can have references', async () => {
        const def = lineDef({ footer: 'Quelle {source}' });
        def.globals = { source: 'Statistik', unit: 'Personen', max: 10 };
        def.mapping.y.name = 'Wert in {unit}';
        def.mapping.y.scale.domain = [0, '@max'];
        def.mapping.x.axis.title.name = 'Jahr ({source})';
        def.mapping.c.name = 'Land ({unit})';
        def.mapping.c.props.categories.Wien.name = 'Wien ({unit})';
        def.facets = { dim: 'c', cols: 2 };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelector('.vis-footer-content span').textContent).toBe('Quelle Statistik');
        expect(el.querySelector('.vis-axis-title').textContent).toBe('Jahr (Statistik)');
        expect(el.querySelector('.vis-legend .vis-legend-title').textContent).toBe('Land (Personen)');
        expect(el.querySelector('.vis-legend [data-key="Wien"] span').textContent).toBe('Wien (Personen)');
        expect(el.querySelector('.vis-facet-title').textContent).toBe('Wien (Personen)');
        expect([...el.querySelectorAll('g.vis-axis-left g.tick text')].at(-1).textContent).toBe('10');
        expect(errors).toEqual([]);
    });

    test('categories of the data, colored by a scheme', async () => {
        const def = lineDef();
        def.mapping.c.props = { fromData: true, scheme: 'Tableau10', categories: { Tirol: {} } };
        const data = lineData + '\n2020,3,30,Salzburg\n2021,3,30,Salzburg';
        const el = await mount(GenVis, { def, data });
        // the listed one first, the others of the data in ascending order
        expect([...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.getAttribute('data-key'))).toEqual(['Tirol', 'Salzburg', 'Wien']);
        expect([...el.querySelectorAll('g.vis-plot.plot-0 path')].map(p => [p.getAttribute('data-group-c'), p.getAttribute('stroke')]))
            .toEqual([['Wien', '#e15759'], ['Tirol', '#4e79a7'], ['Salzburg', '#f28e2c']]);
        expect(errors).toEqual([]);
    });

    test('a given state is applied', async () => {
        const state = { globals: { column: 'other' }, visible: { c: { Tirol: false } } };
        const el = await mount(GenVis, { def: stateDef(), data: lineData, state });
        expect(checked(el)).toEqual([false, true]);
        expect(legendVisible(el)).toEqual(['true', 'false']);
        // other of Wien
        expect(maxTick(el)).toBe(40);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('v-model:state reports the changes and resets', async () => {
        const state = ref(null);
        const updates = [];
        // the same def, a new one would load the visualisation again
        const def = stateDef();
        const el = await mount({
            render: () => h(GenVis, { def, data: lineData, state: state.value, 'onUpdate:state': s => {
                updates.push(s);
                state.value = s;
            } }),
        });

        el.querySelectorAll('.vis-form-element .vis-radio input')[1].click();
        await nextTick();
        el.querySelectorAll('.vis-legend .vis-legend-entries > div')[1].click();
        await nextTick();
        expect(updates).toEqual([
            { globals: { column: 'other' } },
            { globals: { column: 'other' }, visible: { c: { Tirol: false } } },
        ]);
        expect(maxTick(el)).toBe(40);

        // back to the default, not reported as a change
        state.value = null;
        await nextTick();
        await nextTick();
        expect(checked(el)).toEqual([true, false]);
        expect(legendVisible(el)).toEqual(['true', 'true']);
        expect(maxTick(el)).toBe(4);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(7);
        expect(updates).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('several visualisations have their own state', async () => {
        const el = await mount({
            render: () => ['A', 'B'].map(title => h(GenVis, { def: lineDef({ title }), data: lineData })),
        });
        await vi.waitFor(() => expect(el.querySelectorAll('svg.vis-svg')).toHaveLength(2));
        const [a, b] = el.querySelectorAll('.vis');
        expect([a, b].map(v => v.querySelector('.vis-header .vis-title').textContent)).toEqual(['A', 'B']);

        a.querySelector('.vis-legend .vis-legend-entries > div').click();
        await nextTick();
        expect(a.querySelectorAll('g.vis-plot circle')).toHaveLength(4);
        expect(b.querySelectorAll('g.vis-plot circle')).toHaveLength(7);
    });

    test('errors are shown', async () => {
        const el = await mount(GenVis, { defFile: '/data/missing.json' });
        expect(el.querySelector('.vis-error').textContent)
            .toBe(`Could not load '${new URL('/data/missing.json', document.baseURI)}': 404 Not Found`);
        expect(errors).toHaveLength(1);
    });

    test('a definition which could not be drawn is replaced by a valid one', async () => {
        // the one which failed is not drawn again while the new one is loaded
        const def = ref({ ...lineDef(), plot: { type: 'cartesian:lines', props: {} } });
        const el = await mount({ render: () => h(GenVis, { def: def.value, data: lineData }) });
        expect(el.querySelector('.vis-error').textContent).toBe("Unknown plot type 'cartesian:lines'");

        def.value = lineDef();
        await vi.waitFor(() => expect(el.querySelector('svg.vis-svg')).not.toBeNull(), { timeout: 2000 });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(plotElements(el)).toBeGreaterThan(0);
    });

    test('the svg fills the visualisation inside its padding and border, e.g. of a card of the page', async () => {
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '.vis { padding: 10px 20px; border: 3px solid black; }';
        try {
            const def = lineDef();
            delete def.options.width;
            const el = await mount(GenVis, { def, data: lineData });
            // the elements are 800 pixels wide in the tests
            expect(el.querySelector('svg.vis-svg').getAttribute('width')).toBe(String(800 - 2*20 - 2*3));
        } finally {
            style.remove();
        }
    });

    test('mountGenVisElement takes the props from the data attributes', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        el.dataset.defFile = '/data/bev/def.json';
        mountGenVisElement(el);
        await rendered(el);
        expect(el.querySelector('.vis-header .vis-title').textContent).toBe('Bevölkerung');
    });

    test('the elements of a class are mounted once, an element is unmounted', async () => {
        const els = [1, 2].map(() => {
            const el = document.body.appendChild(document.createElement('div'));
            el.className = 'chart';
            el.dataset.defFile = '/data/bev/def.json';
            return el;
        });
        const charts = mountGenVisByClass('chart');
        expect(charts).toHaveLength(2);
        expect(mountGenVisByClass('chart')).toHaveLength(0);
        await Promise.all(els.map(rendered));
        expect(els.every(e => e.classList.contains('vis-mounted'))).toBe(true);
        const removed = vi.spyOn(document, 'removeEventListener');

        expect(unmountGenVisElement(els[0])).toBe(true);
        expect(els[0].innerHTML).toBe('');
        expect(els[0].classList.contains('vis-mounted')).toBe(false);
        // the listener of the hover of the facet
        expect(removed).toHaveBeenCalledWith('pointerdown', expect.any(Function));
        expect(unmountGenVisElement(els[0])).toBe(false);
        // again
        expect(mountGenVisByClass('chart')).toHaveLength(1);
        await rendered(els[0]);
        expect(els[0].querySelector('.vis-title').textContent).toBe('Bevölkerung');
    });

    test('the values of the data attributes: flags, names of files and the state as JSON', async () => {
        const vis = (attributes, props) => {
            const el = document.body.appendChild(document.createElement('div'));
            Object.entries(attributes).forEach(([k, v]) => el.setAttribute(`data-${k}`, v));
            return mountGenVisElement(el, { def: lineDef(), data: lineData, ...props });
        };
        expect(vis({ download: 'false', csv: 'true', copy: 'false', debug: 'false' }).$props).toMatchObject({ download: false, csv: true, copy: false, debug: false });
        expect(vis({ download: '', csv: 'werte', copy: '' }).$props).toMatchObject({ download: true, csv: 'werte', copy: true });

        const state = { globals: {}, visible: { c: { Wien: false } } };
        const chart = vis({ state: JSON.stringify(state) });
        expect(chart.$props.state).toEqual(state);
        await rendered(chart.$el.parentElement);
        await nextTick();
        expect([...chart.$el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.visible)).toEqual(['false', 'true']);

        expect(vis({ state: '{ no json' }).$props.state).toBeNull();
        expect(errors.join()).toContain('invalid JSON in data-state');
        errors.length = 0;
    });
});

describe('controls', () => {
    const switchDef = () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
            { id: 'value', name: 'Value', value: 'value', mapping: { y: { column: 'value' } } },
            { id: 'other', name: 'Other', value: 'other', mapping: { y: { column: 'other' } } },
        ] }];
        def.plot[0].props['highlight-stroke-width'] = 3;
        return def;
    };
    const mountWithUpdates = async def => {
        const updates = [];
        const el = await mount({ render: () => h(GenVis, { def, data: lineData, 'onUpdate:state': s => updates.push(s) }) });
        return { el, updates };
    };
    const visible = el => [...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.getAttribute('aria-checked'));
    const click = (e, detail = 1) => e.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));

    test('a click on the label of a radio button is one change', async () => {
        const { el, updates } = await mountWithUpdates(switchDef());
        el.querySelectorAll('.vis-form-element label')[1].click();
        await nextTick();
        expect(updates).toEqual([{ globals: { column: 'other' } }]);
        expect(el.querySelectorAll('.vis-form-element input')[1].checked).toBe(true);
    });

    test('the entries of a legend by the keyboard, the focus highlights them', async () => {
        const { el, updates } = await mountWithUpdates(switchDef());
        const [wien] = el.querySelectorAll('.vis-legend .vis-legend-entries > div');
        expect(wien.getAttribute('role')).toBe('checkbox');
        expect(wien.tabIndex).toBe(0);
        wien.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await nextTick();
        expect(visible(el)).toEqual(['false', 'true']);
        wien.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        await nextTick();
        expect(visible(el)).toEqual(['true', 'true']);
        expect(updates).toHaveLength(2);

        wien.dispatchEvent(new FocusEvent('focus'));
        expect(el.querySelector('g.vis-plot.plot-0 path.vis-highlight').getAttribute('data-group-c')).toBe('Wien');
        wien.dispatchEvent(new FocusEvent('blur'));
        expect(el.querySelector('g.vis-plot.plot-0 path.vis-highlight')).toBeNull();
    });

    test('a double click shows only the entry, the next one all', async () => {
        const def = switchDef();
        def.mapping.c.props.categories.Salzburg = { color: 'green' };
        const { el } = await mountWithUpdates(def);
        const tirol = el.querySelectorAll('.vis-legend .vis-legend-entries > div')[1];
        const double = async e => {
            click(e, 1);
            await nextTick();
            click(e, 2);
            e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
            await nextTick();
        };
        await double(tirol);
        expect(visible(el)).toEqual(['false', 'true', 'false']);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(4);
        await double(tirol);
        expect(visible(el)).toEqual(['true', 'true', 'true']);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });

    test('a touch does not highlight, it has no end', async () => {
        const { el } = await mountWithUpdates(switchDef());
        const [wien] = el.querySelectorAll('.vis-legend .vis-legend-entries > div');
        wien.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
        expect(el.querySelector('g.vis-plot.plot-0 path.vis-highlight')).toBeNull();
        wien.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('g.vis-plot.plot-0 path.vis-highlight')).not.toBeNull();
    });
});

describe('events and slots', () => {
    test('the templates of the hover of the definition, the values are text', async () => {
        const def = lineDef({ hover: { title: '<b>{title}</b> ({unit})', row: '{c}: <i>{y}</i> {c.unit} ({y.value})' } });
        def.globals = { unit: 'Mio.' };
        def.mapping.c.props.categories.Wien.unit = '<u>';
        def.mapping.c.hover = { props: { unit: '@unit' } };
        const el = await mount(GenVis, { def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').innerHTML).toBe('<b>2020</b> (Mio.)');
        expect(el.querySelector('.vis-hover table')).toBeNull();
        const rows = [...el.querySelectorAll('.vis-hover-row')];
        expect(rows.map(r => r.innerHTML)).toEqual(['Tirol: <i>2,0</i> Mio. (2)', 'Wien: <i>1,0</i> &lt;u&gt; (1)']);
        expect(rows.map(r => r.classList.contains('vis-nearest'))).toEqual([true, false]);

        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ ...def, options: { hover: { title: '{titel}', row: '{c.unit} {z}' } } })).toEqual([
            "options.hover.title: unknown name 'titel' in the template",
            "options.hover.row: unknown name 'z' in the template",
        ]);
    });

    test('the hover props of the categories are the columns of the hover', async () => {
        const def = lineDef();
        def.mapping.c.props.categories.Wien.unit = 'Mio.';
        def.mapping.c.props.categories.Tirol.unit = 'Tsd.';
        def.mapping.c.hover = { props: { unit: '@unit' } };
        const el = await mount(GenVis, { def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        const cells = [...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => [...tr.cells].map(td => [td.dataset.mapping, td.dataset.prop ?? null, td.textContent]));
        expect(cells).toEqual([
            [['c', null, 'Tirol'], ['c', 'unit', 'Tsd.'], ['y', null, '2,0']],
            [['c', null, 'Wien'], ['c', 'unit', 'Mio.'], ['y', null, '1,0']],
        ]);

        // without the name
        def.mapping.c.hover = { props: { name: null, unit: '@unit' } };
        const other = await mount(GenVis, { def, data: lineData });
        other.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect([...other.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => tr.textContent)).toEqual(['Tsd.2,0', 'Mio.1,0']);
    });

    test('hover and select with the rows of the mappings', async () => {
        const hovers = [], selects = [];
        const el = await mount({ render: () => h(GenVis, { def: lineDef(), data: lineData,
            onHover: e => hovers.push(e), onSelect: e => selects.push(e) }) });
        const events = el.querySelector('rect.vis-events');
        // the right end, 2023, Wien is 4, Tirol 2
        events.dispatchEvent(pointer('pointermove', { clientX: 549, clientY: 0 }));
        await nextTick();
        expect(hovers).toHaveLength(1);
        expect(hovers[0]).toMatchObject({ key: 2023, title: '2023', nearest: { x: 2023, y: 4, c: 'Wien' } });
        expect(hovers[0].rows).toEqual([{ x: 2023, y: 4, c: 'Wien' }, { x: 2023, y: 2, c: 'Tirol' }]);
        // the same position is no new hover
        events.dispatchEvent(pointer('pointermove', { clientX: 548, clientY: 0 }));
        events.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 549, clientY: 0 }));
        events.dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(hovers).toHaveLength(2);
        expect(hovers[1]).toBeNull();
        expect(selects).toEqual([hovers[0]]);
    });

    test('the content of the hover, the header and the footer', async () => {
        const el = await mount({ render: () => h(GenVis, { def: lineDef({ title: 'Titel', footer: 'Quelle' }), data: lineData }, {
            hover: ({ title, rows, entries }) => h('div', { class: 'own' }, `${title}: ${rows.map(r => r.c).join(', ')} ${entries.map(e => e.y.name).join(' ')}`),
            header: ({ title }) => h('h2', title.toUpperCase()),
            footer: ({ footer }) => h('small', `${footer}!`),
        }) });
        expect(el.querySelector('.vis-header h2').textContent).toBe('TITEL');
        expect(el.querySelector('.vis-footer small').textContent).toBe('Quelle!');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 549, clientY: 0 }));
        await nextTick();
        expect(el.querySelector('.vis-hover .own').textContent).toBe('2023: Wien, Tirol 4,0 2,0');
        expect(el.querySelector('.vis-hover table')).toBeNull();
        expect(errors).toEqual([]);
    });
});

describe('annotations', () => {
    const num = (e, a) => parseFloat(e.getAttribute(a));
    const annotated = annotations => {
        const def = lineDef();
        // inner size 550 x 250, 2020 to 2023
        def.mapping.x.scale.domain = [2020, 2023];
        def.mapping.y.scale.domain = [0, 4];
        def.annotations = annotations;
        return def;
    };

    test('bands, lines, texts and circles of cartesian plots', async () => {
        const el = await mount(GenVis, { def: annotated([
            { type: 'band', x: [2021.5, null], label: 'Schätzung' },
            { type: 'line', y: 2, props: { stroke: 'red' } },
            { type: 'line', x: '2021', label: 'Lockdown' },
            { type: 'text', x: 2021, y: 3, text: 'Hinweis' },
            { type: 'circle', x: 2022, y: 1, above: true },
        ]), data: lineData });
        const band = el.querySelector('g.vis-annotations.vis-below rect.vis-band');
        expect(band.parentNode.getAttribute('data-plot')).toBe('annotation-0');
        expect(['x', 'y', 'width', 'height'].map(a => num(band, a))).toEqual([275, 0, 275, 250]);
        // the labels are above the plots
        expect(el.querySelector('g.vis-annotation-labels .vis-annotation-label').textContent).toBe('Schätzung');
        const [horizontal, vertical] = el.querySelectorAll('g.vis-annotations line');
        expect(['x1', 'x2', 'y1', 'y2'].map(a => num(horizontal, a))).toEqual([0, 550, 125, 125]);
        expect(horizontal.getAttribute('stroke')).toBe('red');
        expect(num(vertical, 'x1')).toBeCloseTo(550/3);
        expect(el.querySelector('g.vis-annotations text.vis-text').textContent).toBe('Hinweis');
        expect(num(el.querySelector('g.vis-annotations.vis-above circle'), 'cx')).toBeCloseTo(1100/3);
        // below the grid lines and the plots, the circle above them
        const order = [...el.querySelector('svg.vis-svg > g').children].map(c => c.getAttribute('data-plot') ?? c.getAttribute('class'));
        expect(order.indexOf('annotation-3')).toBeLessThan(order.indexOf('vis-grid'));
        expect(order.indexOf('annotation-3')).toBeLessThan(order.indexOf('plot-0'));
        expect(order.indexOf('annotation-4')).toBeGreaterThan(order.indexOf('plot-1'));
        expect(order.indexOf('vis-annotation-labels')).toBeGreaterThan(order.indexOf('annotation-4'));
        expect(errors).toEqual([]);
    });

    test('a band of a category, dates and facets', async () => {
        const def = annotated([
            { type: 'band', x: '2020' },
            { type: 'text', x: '2021-06-01', text: 'Wien', facet: 'Wien' },
        ]);
        def.mapping.x = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'horizontal' }, axis: { position: 'bottom' } };
        def.mapping.d = { column: 'date', type: 'date', scale: { type: 'utc', orientation: 'horizontal', domain: ['2021-01-01', '2022-01-01'] } };
        def.annotations[1] = { type: 'text', d: '2021-07-02', text: 'Wien', facet: 'Wien' };
        def.facets = { dim: 'c', cols: 2 };
        def.plot = { type: 'cartesian:bar', categories: ['c'], props: { x: '@x:scaled', y1: '@y:scaled' } };
        const el = await mount(GenVis, { def, data: lineData.replace('year,', 'date,year,').replace(/\n(\d{4})/g, (m, y) => `\n${y}-01-01,${y}`) });
        const [wien, tirol] = el.querySelectorAll('svg.vis-svg');
        const band = wien.querySelector('rect.vis-band');
        const bar = wien.querySelectorAll('g.vis-plot rect')[0];
        // the band of the category, the bar is in its middle
        expect(num(band, 'width')).toBeGreaterThanOrEqual(num(bar, 'width') - 1e-9);
        expect(num(band, 'x') + num(band, 'width')/2).toBeCloseTo(num(bar, 'x') + num(bar, 'width')/2);
        // in the middle of the year, the inner width of a facet is 250
        expect(num(wien.querySelector('text.vis-text'), 'x')).toBeCloseTo(125, -1);
        expect(tirol.querySelector('text.vis-text')).toBeNull();
        expect(tirol.querySelector('rect.vis-band')).not.toBeNull();
    });

    test('null is no value, references to globals and templates', async () => {
        const def = annotated([
            { type: 'text', x: null, y: '@target', text: 'Ziel {target}' },
            { type: 'line', x: null, y: '@target', label: 'Ziel {target}' },
        ]);
        def.globals = { target: 2 };
        const el = await mount(GenVis, { def, data: lineData });
        const text = el.querySelector('text.vis-text');
        expect([num(text, 'x'), num(text, 'y')]).toEqual([0, 125]);
        expect(text.textContent).toBe('Ziel 2');
        const line = el.querySelector('line.vis-line');
        expect(['x1', 'x2', 'y1', 'y2'].map(a => num(line, a))).toEqual([0, 550, 125, 125]);
        expect(el.querySelector('.vis-annotation-label').textContent).toBe('Ziel 2');
        expect(errors).toEqual([]);
    });

    test('annotations of the rows of a plot, e.g. events, with props of the rows', async () => {
        const def = annotated([]);
        def.plot = [def.plot[0], {
            type: 'annotation:line',
            data: [{ x: 2021, label: 'A', color: 'red' }, { x: 2022, label: 'B', color: 'blue' }],
            props: { stroke: '@color' },
        }];
        const el = await mount(GenVis, { def, data: lineData });
        const lines = [...el.querySelectorAll('g.vis-plot.plot-1 line.vis-line')];
        expect(lines.map(l => [Math.round(num(l, 'x1')), l.getAttribute('stroke')])).toEqual([[183, 'red'], [367, 'blue']]);
        expect([...el.querySelectorAll('.vis-annotation-label')].map(l => l.textContent)).toEqual(['A', 'B']);
    });

    test('sectors and rings of polar plots', async () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.mapping.x = { column: 'year', type: 'numeric', scale: { orientation: 'angular', domain: [2020, 2024] } };
        def.mapping.y = { column: 'value', type: 'numeric', scale: { orientation: 'radial', domain: [0, 4] } };
        def.plot = { type: 'polar:line', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } } };
        def.annotations = [
            // across the top, from 2023.5 to 2020.5
            { type: 'band', x: [2023.5, 2020.5], label: 'Winter' },
            { type: 'line', y: 2 },
            { type: 'line', x: 2022 },
            { type: 'text', x: 2021, y: 4, text: 'Osten' },
        ];
        const el = await mount(GenVis, { def, data: lineData });
        const sector = el.querySelector('path.vis-band');
        expect(sector.getAttribute('d')).toMatch(/^M/);
        // the label of the sector is above the center
        const label = el.querySelector('.vis-annotation-label');
        expect(Math.abs(num(label, 'x'))).toBeLessThan(1);
        expect(num(label, 'y')).toBeLessThan(0);
        expect(num(el.querySelector('circle.vis-line'), 'r')).toBeCloseTo(75);
        const spoke = el.querySelector('line.vis-line');
        expect([num(spoke, 'x2'), num(spoke, 'y2')].map(Math.round)).toEqual([0, 150]);
        const text = el.querySelector('text.vis-text');
        expect([num(text, 'x'), num(text, 'y')].map(Math.round)).toEqual([150, 0]);
        expect(errors).toEqual([]);
    });
});

describe('the highlight of a row', () => {
    test('the segment of a stacked bar under the mouse, the legend all of the category', async () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.y.scale.domain = [0, null];
        def.mapping.type = { column: 'type', type: 'categorical', legend: {}, props: { categories: { a: {}, b: {} } } };
        def.plot = { type: 'cartesian:bar', categories: ['type'], highlight: 'row',
            props: { x: '@x:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled', width: 10, stroke: 'none', 'highlight-stroke': 'black' } };
        const data = 'year,value,land,type\n2020,1,Wien,a\n2020,2,Wien,b\n2023,3,Wien,a\n2023,1,Wien,b';
        const el = await mount(GenVis, { def, data });
        const highlighted = () => [...el.querySelectorAll('g.vis-plot rect')].filter(r => r.getAttribute('stroke') == 'black');

        // the bottom segment of 2020, a of the value 1
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 0, clientY: 240 }));
        await nextTick();
        expect(highlighted()).toHaveLength(1);
        expect(highlighted()[0].parentNode.getAttribute('data-group-type')).toBe('a');

        el.querySelector('.vis-legend[data-dim="type"] .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(highlighted()).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});

describe('the data of a plot', () => {
    const num = (e, a) => parseFloat(e.getAttribute(a));

    test('a text at a value of the vertical axis, at the end of the horizontal one', async () => {
        const def = lineDef();
        def.mapping.y.scale.domain = [0, 4];
        def.globals = { target: 3 };
        def.plot = [def.plot[0], {
            type: 'svg:text',
            data: [{ y: '@target', label: 'Ziel' }],
            props: { x: '@x:scaled:max', y: '@y:scaled', text: '@label', 'text-anchor': 'end' },
        }];
        const el = await mount(GenVis, { def, data: lineData });
        const text = el.querySelector('g.vis-plot.plot-1 text');
        expect([num(text, 'x'), num(text, 'y'), text.textContent]).toEqual([550, 62.5, 'Ziel']);
        expect(errors).toEqual([]);
    });

    test('dates are converted, a row of a facet is only in its facet', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'year', type: 'date', scale: { type: 'utc', orientation: 'horizontal', domain: ['2020-01-01', '2024-01-01'] } };
        def.facets = { dim: 'c', cols: 2 };
        def.plot = [def.plot[0], { type: 'svg:circle', data: [{ x: '2022-01-01' }, { x: '2023-01-01', c: 'Tirol' }], props: { cx: '@x:scaled', cy: 0, r: 2 } }];
        const el = await mount(GenVis, { def, data: lineData });
        const [wien, tirol] = [...el.querySelectorAll('svg.vis-svg')].map(f => [...f.querySelectorAll('g.vis-plot.plot-1 circle')].map(c => Math.round(num(c, 'cx'))));
        expect(wien).toEqual([125]);
        expect(tirol).toEqual([125, 188]);
    });

    test('loaded from a url relative to the definition', async () => {
        const store = createStore();
        vi.stubGlobal('fetch', async url => new Response(url.endsWith('events.csv') ? 'x,label\n2021,A' : ''));
        await store.init({ def: { ...lineDef(), plot: [{ type: 'svg:text', data: 'http://h/data/events.csv', props: { text: '@label' } }] }, data: lineData });
        expect(store.def.plot[0].data).toEqual([{ x: '2021', label: 'A' }]);
        expect(store.def.plot[0].loaded).toBe(true);
    });
});

describe('the selection of the rows of a plot', () => {
    const labelDef = select => {
        const def = lineDef();
        def.plot = [def.plot[0], { type: 'svg:text', categories: ['c'], select, props: { x: '@x:scaled', y: '@y:scaled', text: '@name', fill: '@color' } }];
        return def;
    };
    const labels = async select => [...(await mount(GenVis, { def: labelDef(select), data: lineData })).querySelectorAll('g.vis-plot.plot-1 text')]
        .map(t => [t.textContent, t.__data__[Object.getOwnPropertySymbols(t.__data__)[0]].x]);

    test('the last or the first row of every group, e.g. labels at the end of lines', async () => {
        expect(await labels('last')).toEqual([['Wien', 2023], ['Tirol', 2023]]);
        expect(await labels('first')).toEqual([['Wien', 2020], ['Tirol', 2020]]);
    });

    test('texts of several groups moved apart', async () => {
        const def = labelDef('last');
        def.plot[1].dodge = 20;
        const el = await mount(GenVis, { def, data: lineData.replace('2023,4,40,Wien', '2023,2.1,40,Wien') });
        const ys = [...el.querySelectorAll('g.vis-plot.plot-1 text')].map(t => parseFloat(t.getAttribute('y')));
        expect(Math.abs(ys[0] - ys[1])).toBeCloseTo(20);
    });

    test('the row with the most or the least value, of the rows with values', async () => {
        expect(await labels({ max: 'y' })).toEqual([['Wien', 2023], ['Tirol', 2020]]);
        expect(await labels({ min: 'y' })).toEqual([['Wien', 2020], ['Tirol', 2020]]);
    });
});

describe('the layers and facets of plots', () => {
    test('below the axes, above the other plots, only in some facets', async () => {
        const def = lineDef();
        def.facets = { dim: 'c', cols: 2 };
        def.plot = [
            { ...def.plot[0], id: 'line' },
            { type: 'svg:rect', id: 'background', layer: 'below', data: [{}], props: { width: '@innerWidth', height: '@innerHeight', fill: '#EEE' } },
            { type: 'svg:text', id: 'note', layer: 'above', facet: 'Tirol', data: [{}], props: { text: 'Tirol' } },
        ];
        const el = await mount(GenVis, { def, data: lineData });
        const [wien, tirol] = el.querySelectorAll('svg.vis-svg > g');
        const order = g => [...g.children].map(c => c.getAttribute('data-plot') ?? c.getAttribute('class').split(' ')[0]);
        expect(order(tirol).filter(c => !['vis-hover-marker', 'vis-events'].includes(c))).toEqual(['background', 'vis-grid', 'vis-axis', 'vis-axis-title', 'vis-axis', 'line', 'note']);
        expect(order(wien)).not.toContain('note');
        expect(wien.querySelector('g.vis-below rect').getAttribute('width')).toBe('250');
    });
});

describe('maps', () => {
    // two squares next to each other, the rings are counterclockwise as of GeoJSON (RFC 7946)
    const square = (id, x) => ({ type: 'Feature', id, properties: { name: `Region ${id}`, code: id.toLowerCase() },
        geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
    const regions = { type: 'FeatureCollection', features: [square('A', 0), square('B', 1), square('C', 2)] };
    const mapData = 'region,year,value\nA,2020,1\nB,2020,3\nA,2021,2\nB,2021,4';
    const mapDef = () => ({
        options: { coord: 'geo', width: 300, height: 100, margins: { top: 0, right: 0, bottom: 0, left: 0 } },
        geo: { data: regions, join: 'region' },
        globals: { year: '2020' },
        filter: { year: '@year' },
        formElements: [{ id: 'year', name: 'Jahr', ref: 'year', type: 'select', values: [
            { id: '2020', name: '2020', value: '2020' }, { id: '2021', name: '2021', value: '2021' }] }],
        mapping: {
            region: { column: 'region', type: 'categorical' },
            year: { column: 'year', type: 'categorical' },
            value: { name: 'Wert', column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' }, legend: {}, hover: { format: '.1f' } },
        },
        plot: [
            { type: 'geo:base', props: { fill: '#EEE' } },
            { type: 'geo:region', categories: ['region'], props: { fill: '@value:scaled', stroke: 'none', 'highlight-stroke': 'black' } },
            { type: 'geo:circle', categories: ['region'], props: { r: 3, fill: 'red' } },
        ],
    });
    const num = (e, a) => parseFloat(e.getAttribute(a));
    const fills = el => [...el.querySelectorAll('g.vis-plot.plot-1 path')].map(p => [p.getAttribute('data-geo-key'), p.getAttribute('fill')]);

    test('the features and the rows joined to them, colored by a scale', async () => {
        const el = await mount(GenVis, { def: mapDef(), data: mapData });
        // all features, also the ones without rows
        expect(el.querySelectorAll('g.vis-plot.plot-0 path')).toHaveLength(3);
        // the domain of the colors is the one of the rows, not extended
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0)], ['B', d3.interpolateBlues(1)]]);
        // the rings are in the order of d3, the squares are fitted to the facet
        const [a, b] = [...el.querySelectorAll('g.vis-plot.plot-0 path')].map(p => p.getAttribute('d'));
        expect(a).toMatch(/^M0[.\d]*,100L/);
        expect(b).not.toBe(a);
        // the circles at the centers
        const circles = [...el.querySelectorAll('g.vis-plot.plot-2 circle')].map(c => Math.round(num(c, 'cx')));
        expect(circles).toEqual([50, 150]);
        expect(errors).toEqual([]);
    });

    test('the rows of a global of a select', async () => {
        const el = await mount(GenVis, { def: mapDef(), data: mapData });
        const select = el.querySelector('.vis-form-element select');
        expect(select.value).toBe('2020');
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change'));
        await nextTick();
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0)], ['B', d3.interpolateBlues(1)]]);
        expect(el.querySelector('.vis-color-legend .vis-legend-title').textContent).toBe('Wert');
        // 2 to 4 now
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toContain('3,0');
        expect(errors).toEqual([]);
    });

    test('a slider over the values of a column of the data', async () => {
        const def = mapDef();
        def.formElements = [{ id: 'year', name: 'Jahr', ref: 'year', type: 'slider', values: { column: 'year' } }];
        // without the global the last value, the latest year
        delete def.globals;
        const updates = [];
        const el = await mount({ render: () => h(GenVis, { def, data: mapData, 'onUpdate:state': s => updates.push(s) }) });
        const slider = el.querySelector('.vis-form-element input[type="range"]');
        const legend = () => [...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent);
        expect([slider.min, slider.max, slider.value]).toEqual(['0', '1', '1']);
        expect(el.querySelector('.vis-form-element .vis-slider .vis-slider-value').textContent).toBe('2021');
        // 2 to 4
        expect(legend()).toContain('3,0');
        // moved to 2020, while it is moved, in the next frame
        slider.value = '0';
        slider.dispatchEvent(new Event('input'));
        await nextTick();
        expect(updates).toEqual([]);
        await new Promise(r => requestAnimationFrame(r));
        await nextTick();
        expect(el.querySelector('.vis-form-element .vis-slider .vis-slider-value').textContent).toBe('2020');
        expect(legend()).toContain('2,0');
        expect(updates).toEqual([{ globals: { year: '2020' } }]);

        // the moves of a frame are drawn once, the end of the move at once
        for (const v of ['1', '0', '1'])
            slider.value = v, slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
        await nextTick();
        expect(updates).toEqual([{ globals: { year: '2020' } }, {}]);
        await new Promise(r => requestAnimationFrame(r));
        expect(updates).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('the projection and the paths are computed once for the same facet', async () => {
        const vm = createApp(GenVis, { def: mapDef(), data: mapData }).mount(document.body.appendChild(document.createElement('div')));
        await rendered(vm.$el);
        const paths = () => [...vm.$el.querySelectorAll('g.vis-plot.plot-0 path')].map(p => p.getAttribute('d'));
        const before = paths();
        const select = vm.$el.querySelector('.vis-form-element select');
        for (const year of ['1', '0', '1']) {
            select.selectedIndex = +year;
            select.dispatchEvent(new Event('change'));
            await nextTick();
        }
        expect(paths()).toEqual(before);
        expect(vm.store.geo.projections.size).toBe(1);
    });

    test('the values of the data and a given state', async () => {
        const def = mapDef();
        def.formElements = [{ id: 'year', name: 'Jahr', ref: 'year', type: 'select', values: { column: 'year' } }];
        // a global which is none of the values is the last one, the state is applied
        def.globals = { year: '1999' };
        const options = el => [...el.querySelectorAll('.vis-form-element option')].map(o => o.textContent);
        expect(options(await mount(GenVis, { def, data: mapData }))).toEqual(['2020', '2021']);
        expect((await mount(GenVis, { def, data: mapData })).querySelector('.vis-form-element select').value).toBe('2021');
        const el = await mount(GenVis, { def, data: mapData, state: { globals: { year: '2020' } } });
        expect(el.querySelector('.vis-form-element select').value).toBe('2020');
        // numbers by their value
        expect(options(await mount(GenVis, { def, data: 'region,year,value\nA,10,1\nA,9,2\nB,100,3' }))).toEqual(['9', '10', '100']);
        expect(errors).toEqual([]);
    });

    test('the hover of the region under the pointer', async () => {
        const el = await mount(GenVis, { def: mapDef(), data: mapData });
        const events = el.querySelector('rect.vis-events');
        const at = async x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 50 }));
            await nextTick();
            return el.querySelector('.vis-hover .vis-hover-title')?.textContent;
        };
        expect(await at(150)).toBe('Region B');
        expect([...el.querySelectorAll('.vis-hover td')].map(t => t.textContent)).toEqual(['3.0'.replace('.', ',')]);
        // the region is highlighted
        expect(el.querySelector('g.vis-plot.plot-1 path.vis-highlight').getAttribute('stroke')).toBe('black');
        // a region without rows has its name
        expect(await at(250)).toBe('Region C');
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    test('no hover where there is no region', async () => {
        const def = mapDef();
        // a and b in the center (50 to 250), nothing left of them
        def.geo = { data: { type: 'FeatureCollection', features: [square('A', 0), square('B', 1)] }, join: 'region' };
        const el = await mount(GenVis, { def, data: mapData });
        const events = el.querySelector('rect.vis-events');
        const move = async x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 50 }));
            await nextTick();
        };
        // first outside, then a region and outside again
        await move(25);
        expect(el.querySelector('.vis-hover')).toBeNull();
        await move(200);
        expect(el.querySelector('.vis-hover .vis-hover-title').textContent).toBe('Region B');
        await move(25);
        expect(el.querySelector('.vis-hover')).toBeNull();
        expect(el.querySelector('g.vis-plot.plot-1 path.vis-highlight')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the key, the name and the fit of the features', async () => {
        const def = mapDef();
        def.geo = { data: regions, join: 'region', key: 'code', name: 'code', fit: 'data' };
        const el = await mount(GenVis, { def, data: mapData.replace(/\n([AB])/g, (m, r) => `\n${r.toLowerCase()}`) });
        expect(fills(el).map(f => f[0])).toEqual(['a', 'b']);
        // a and b fill the height in the center, c is outside
        const circles = [...el.querySelectorAll('g.vis-plot.plot-2 circle')].map(c => Math.round(num(c, 'cx')));
        expect(circles).toEqual([100, 200]);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 225, clientY: 50 }));
        await nextTick();
        expect(el.querySelector('.vis-hover .vis-hover-title').textContent).toBe('b');
    });

    test('an entry of the missing values beside the colors', async () => {
        const def = mapDef();
        expect((await mount(GenVis, { def, data: mapData })).querySelector('.vis-color-legend .vis-legend-missing')).toBeNull();
        def.mapping.value.legend = { missing: { name: 'keine Daten', color: 'grey' } };
        const el = await mount(GenVis, { def, data: mapData });
        expect(el.querySelector('.vis-color-legend .vis-legend-missing').textContent.trim()).toBe('keine Daten');
        expect(el.querySelector('.vis-color-legend .vis-legend-missing .vis-swatch').style.background).toBe('grey');
        expect(errors).toEqual([]);
    });

    test('the legend of a sqrt scale at the positions of its colors', async () => {
        const def = mapDef();
        def.mapping.value.scale = { type: 'sequentialSqrt', interpolator: 'Blues', domain: [0, 1] };
        def.mapping.value.legend = { format: '.0%' };
        const el = await mount(GenVis, { def, data: 'region,year,value\nA,2020,0.04\nB,2020,1' });
        // A is at 20% of the colors
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0.2)], ['B', d3.interpolateBlues(1)]]);
        const stops = [...el.querySelectorAll('.vis-color-legend stop')].map(s => s.getAttribute('stop-color'));
        expect(stops[5]).toBe(d3.interpolateBlues(0.5));
        // 1, 2, 5 steps, at least 30 pixels apart, at their positions
        const ticks = [...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent);
        expect(ticks).toEqual(['0%', '2%', '10%', '20%', '50%', '100%']);
        const x = [...el.querySelectorAll('.vis-color-legend line')].map(l => Math.round(num(l, 'x1')));
        expect(x).toEqual([0, 34, 76, 107, 170, 240]);
        // without a format the digits of the smallest tick
        delete def.mapping.value.legend.format;
        delete def.mapping.value.hover;
        const plain = await mount(GenVis, { def, data: 'region,year,value\nA,2020,0.04\nB,2020,1' });
        expect([...plain.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['0', '0,02', '0,1', '0,2', '0,5', '1']);
        expect(errors).toEqual([]);
    });

    test('the ends of a domain of the data rounded by nice', async () => {
        const def = mapDef();
        def.mapping.value.scale = { type: 'sequentialSqrt', interpolator: 'Blues', domain: [0, null], nice: true };
        def.mapping.value.legend = { format: '.0%' };
        const data = 'region,year,value\nA,2020,0.04\nB,2020,0.951';
        const el = await mount(GenVis, { def, data });
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0.2)], ['B', d3.interpolateBlues(Math.sqrt(0.951))]]);
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent).at(-1)).toBe('100%');
        // without it the end is the one of the data, a fixed end is kept
        def.mapping.value.scale.nice = false;
        expect([...(await mount(GenVis, { def, data })).querySelectorAll('.vis-color-legend text')].map(t => t.textContent).at(-1)).toBe('50%');
        def.mapping.value.scale = { type: 'sequential', interpolator: 'Blues', domain: [0.03, null], nice: 5 };
        // 0.03 is kept, 0.951 is 1
        expect(fills(await mount(GenVis, { def, data })).map(f => f[1])).toEqual([d3.interpolateBlues(0.01/0.97), d3.interpolateBlues(0.921/0.97)]);
        expect(errors).toEqual([]);
    });

    test('the legend of a diverging scale, its middle is in the center', async () => {
        const def = mapDef();
        def.mapping.value.scale = { type: 'diverging', interpolator: 'RdBu', domain: [-1, 0, 3] };
        const el = await mount(GenVis, { def, data: mapData });
        const ticks = [...el.querySelectorAll('.vis-color-legend line')].map(l => [Math.round(num(l, 'x1')), l.nextSibling.textContent]);
        expect(ticks).toEqual([[0, '−1,0'], [60, '−0,5'], [120, '0,0'], [160, '1,0'], [200, '2,0']]);
        expect(errors).toEqual([]);
    });

    test('classes of a threshold scale and their legend', async () => {
        const def = mapDef();
        def.mapping.value.scale = { type: 'threshold', domain: [2, 3.5], scheme: 'Greens' };
        const el = await mount(GenVis, { def, data: mapData });
        expect(fills(el)).toEqual([['A', d3.schemeGreens[3][0]], ['B', d3.schemeGreens[3][1]]]);
        expect(el.querySelectorAll('.vis-color-legend rect')).toHaveLength(3);
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['2,0', '3,5']);
    });

    test('topojson and its objects', async () => {
        const topo = { type: 'Topology', objects: { squares: { type: 'GeometryCollection', geometries: [
            { type: 'Polygon', id: 'A', properties: { name: 'A' }, arcs: [[0]] },
        ] } }, arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
        const def = mapDef();
        def.geo = { data: topo, join: 'region' };
        let el = await mount(GenVis, { def, data: mapData });
        // B has no feature, its path is empty
        expect([...el.querySelectorAll('g.vis-plot.plot-1 path')].map(p => p.hasAttribute('d'))).toEqual([true, false]);

        def.geo.object = 'circles';
        el = await mount(GenVis, { def, data: mapData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown object 'circles' of the TopoJSON, expected one of 'squares'`);
    });

    test('only the features of include, without the ones of exclude, and annotations', async () => {
        const def = mapDef();
        def.geo.include = ['A', 'B'];
        def.geo.exclude = ['B'];
        def.annotations = [{ type: 'text', lon: 0.5, lat: 0.5, text: 'A' }, { type: 'circle', lon: 0.5, lat: 0.5, above: true }];
        const el = await mount(GenVis, { def, data: mapData });
        expect([...el.querySelectorAll('g.vis-plot.plot-0 path')].map(p => p.getAttribute('data-geo-key'))).toEqual(['A']);
        // A fills the facet, B has no feature
        expect([...el.querySelectorAll('g.vis-plot.plot-1 path')].map(p => p.hasAttribute('d'))).toEqual([true, false]);
        const text = el.querySelector('g.vis-annotations text.vis-text');
        expect([num(text, 'x'), num(text, 'y')].map(Math.round)).toEqual([150, 50]);
        expect(el.querySelector('g.vis-annotations.vis-above circle')).not.toBeNull();
        expect(errors).toEqual([]);
    });

    test('a map needs a geometry', async () => {
        const def = mapDef();
        delete def.geo;
        const el = await mount(GenVis, { def, data: mapData });
        expect(el.querySelector('.vis-error').textContent).toBe('A map needs a geometry, e.g. "geo": { "data": "regions.json" }');
    });
});

describe('highlight', () => {
    test('the elements of a group of elements per row, e.g. circles', async () => {
        const def = lineDef();
        def.plot[1].props['highlight-r'] = 6;
        const el = await mount(GenVis, { def, data: lineData });
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const circles = [...el.querySelectorAll('g.vis-plot.plot-1 g.vis-group[data-group-c="Wien"] circle')];
        expect(circles.map(c => c.getAttribute('r'))).toEqual(['6', '6', '6']);
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        expect(circles.map(c => c.getAttribute('r'))).toEqual(['3', '3', '3']);
    });

    test('the attributes are restored as they were, a missing one is removed', async () => {
        const def = lineDef();
        def.plot[1].props['highlight-r'] = 6;
        def.plot[1].props['highlight-stroke'] = 'black';
        def.plot[0].props['highlight-stroke-width'] = 3;
        const el = await mount(GenVis, { def, data: lineData });
        const html = el.querySelector('svg.vis-svg').outerHTML.replace(/ class=""/g, '');
        const entry = el.querySelector('.vis-legend-entry[data-key="Tirol"]');
        entry.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect([...el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')].map(c => c.getAttribute('stroke'))).toEqual(['black', 'black', 'black', 'black']);
        expect(el.querySelector('path[data-group-c="Tirol"]').getAttribute('stroke-width')).toBe('3');
        entry.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        expect(el.querySelectorAll('[default-r], [stroke="black"], .vis-highlight')).toHaveLength(0);
        // the groups are in their order again after the next draw, see the update of the facets
        expect(el.querySelector('svg.vis-svg').outerHTML.replace(/ class=""/g, '').length).toBe(html.length);
    });

    test('an entry of the legend highlights its category in all facets', async () => {
        const def = lineDef();
        def.plot[1].props['highlight-r'] = 6;
        def.mapping.f = { column: 'land', type: 'categorical', props: { categories: { Wien: {}, Tirol: {} } } };
        def.facets = { dim: 'f', cols: 2 };
        def.plot.forEach(p => p.categories = ['c']);
        const el = await mount(GenVis, { def, data: lineData });
        el.querySelector('.vis-legend[data-dim="c"] .vis-legend-entry[data-key="Wien"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const facets = [...el.querySelectorAll('svg.vis-svg')];
        expect(facets).toHaveLength(2);
        expect(facets.map(f => f.querySelectorAll('circle[r="6"]').length)).toEqual([3, 0]);
        el.querySelector('.vis-legend[data-dim="c"] .vis-legend-entry[data-key="Tirol"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(facets.map(f => f.querySelectorAll('circle[r="6"]').length)).toEqual([0, 4]);
    });
});

describe('data formats', () => {
    test('parquet as data, integers as categories', async () => {
        const def = lineDef();
        def.mapping.c = { column: 'year', type: 'categorical', legend: {}, hover: {}, props: { categories: { 2020: { color: 'red' }, 2021: { color: 'blue' } } } };
        def.mapping.x.column = 'month';
        const data = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020n, 2020n, 2021n, 2021n, 2022n], type: 'INT64' },
            { name: 'month', data: [1, 2, 1, 2, 1], type: 'INT32' },
            { name: 'value', data: [1.5, 2.5, 3, null, 4], type: 'DOUBLE' },
        ] });
        const el = await mount(GenVis, { def, data });
        // 2022 has no props, it is not shown
        expect(el.querySelectorAll('g.vis-plot.plot-0 path')).toHaveLength(2);
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(3);
        expect(await hover(el)).toBe(2);

        el.querySelector('.vis-legend .vis-legend-entries > div').click();
        await nextTick();
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('tsv by the format of the definition', async () => {
        const def = { ...lineDef(), dataFormat: 'tsv' };
        const el = await mount(GenVis, { def, data: lineData.replaceAll(',', '\t') });
        expect(el.querySelectorAll('g.vis-plot.plot-1 circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });
});

describe('the hover by the keyboard', () => {
    const press = async (el, key) => {
        el.querySelector('svg.vis-svg').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await nextTick();
    };
    const shown = el => [el.querySelector('.vis-hover-title')?.textContent, el.querySelector('.vis-hover tr.vis-nearest')?.textContent];

    test('the arrows move the hover over the positions and the rows, escape hides it', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        expect(el.querySelector('svg.vis-svg').getAttribute('tabindex')).toBe('0');
        await press(el, 'ArrowRight');
        // the first position, the top row
        expect(shown(el)).toEqual(['2020', 'Tirol2,0']);
        await press(el, 'ArrowDown');
        expect(shown(el)).toEqual(['2020', 'Wien1,0']);
        await press(el, 'ArrowDown');
        expect(shown(el)).toEqual(['2020', 'Wien1,0']);
        await press(el, 'ArrowRight');
        // 2021 has no value of Wien
        expect(shown(el)).toEqual(['2021', 'Tirol2,0']);
        await press(el, 'End');
        expect(shown(el)).toEqual(['2023', 'Wien4,0']);
        await press(el, 'ArrowRight');
        expect(shown(el)).toEqual(['2023', 'Wien4,0']);
        expect(el.querySelector('[aria-live="polite"] .vis-hover')).not.toBeNull();

        // a toggle by the keyboard keeps the position
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await nextTick();
        expect(shown(el)).toEqual(['2023', 'Tirol2,0']);

        await press(el, 'Escape');
        expect(el.querySelector('.vis-hover')).toBeNull();
        await press(el, 'ArrowLeft');
        expect(shown(el)).toEqual(['2023', 'Tirol2,0']);
        el.querySelector('svg.vis-svg').dispatchEvent(new FocusEvent('blur'));
        await nextTick();
        expect(el.querySelector('.vis-hover')).toBeNull();
    });

    test('the regions of a map by their names', async () => {
        const el = await mount(GenVis, { defFile: '/data/bev/def-map.json' });
        await press(el, 'Home');
        const first = shown(el)[0];
        await press(el, 'ArrowRight');
        const second = shown(el)[0];
        expect([first, second].every(Boolean)).toBe(true);
        expect(first.localeCompare(second)).toBeLessThan(0);
    });

    test('a facet without a hover is not in the order of the tab key', async () => {
        const def = lineDef();
        def.mapping.y.scale.orientation = undefined;
        delete def.mapping.y.axis;
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelector('svg.vis-svg').hasAttribute('tabindex')).toBe(false);
    });
});

describe('the hover of the nearest point', () => {
    test('the row of the nearest point within the radius, in cartesian and polar plots', async () => {
        const def = lineDef({ hover: { mode: 'point', radius: 20 } });
        def.plot = def.plot.slice(1);
        const el = await mount(GenVis, { def, data: lineData });
        const circle = el.querySelector('g.vis-group[data-group-c="Wien"] circle:last-child');
        const [cx, cy] = [+circle.getAttribute('cx'), +circle.getAttribute('cy')];
        const events = el.querySelector('rect.vis-events');
        // the plot area is at 0, 0 in jsdom, see tests/dom.js
        events.dispatchEvent(pointer('pointermove', { clientX: cx + 5, clientY: cy - 5 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').textContent).toBe('2023');
        expect([...el.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent)).toEqual(['Wien4,0']);
        expect(el.querySelector('.vis-hover-marker line').hasAttribute('x1')).toBe(false);
        // too far from every point
        events.dispatchEvent(pointer('pointermove', { clientX: cx - 60, clientY: cy }));
        await nextTick();
        expect(el.querySelector('.vis-hover')).toBeNull();

        const { default: polar } = await import('@/coords/polar');
        const { scaleLinear } = await import('d3-scale');
        const ctx = { scales: { a: scaleLinear([0, 4], [0, Math.PI*2]), r: scaleLinear([0, 10], [0, 100]) }, stackOf: null };
        const [x, y] = polar.hover.point(ctx, { a: 1, r: 5 }, { h: 'a', v: 'r' });
        expect([Math.round(x), Math.round(y)]).toEqual([50, 0]);
    });
});

describe('formatted values', () => {
    test('labels of the format of the hover or of a format prop, dates of a format of times', async () => {
        const def = lineDef();
        def.mapping.y.hover.format = ',.2f';
        def.plot = [{ type: 'svg:text', categories: ['c'], select: 'last', props: {
            x: '@x:scaled', y: '@y:scaled', text: '@y:formatted',
            'data-x': { prop: 'format', ref: 'x', format: '.1f' }, 'data-g': { prop: 'format', ref: 'g', format: '.0%' } } }];
        def.globals = { g: 0.25 };
        const el = await mount(GenVis, { def, data: lineData.replace('2023,4,40,Wien', '2023,1234.5,40,Wien') });
        const texts = [...el.querySelectorAll('g.vis-plot text')];
        expect(texts.map(t => t.textContent)).toEqual(['1.234,50', '2,00']);
        expect(texts.map(t => t.getAttribute('data-x'))).toEqual(['2023,0', '2023,0']);
        expect(texts[0].getAttribute('data-g')).toBe('25%');

        // the default of the locale, dates
        const dates = lineDef();
        dates.mapping.x = { column: 'date', type: 'date', scale: { type: 'time', orientation: 'horizontal' } };
        delete dates.mapping.y.hover.format;
        dates.plot = { type: 'svg:text', categories: ['c'], props: { x: '@x:scaled', y: '@y:scaled', text: '@y:formatted', 'data-d': '@x:formatted', 'data-m': { prop: 'format', ref: 'x', format: '%b %Y' } } };
        const other = await mount(GenVis, { def: dates, data: 'date,value,land\n2020-03-15,1234.5,Wien' });
        const text = other.querySelector('g.vis-plot text');
        expect([text.textContent, text.getAttribute('data-d'), text.getAttribute('data-m')]).toEqual(['1234,5', '15.03.2020', 'Mrz 2020']);
        expect(errors).toEqual([]);
    });
});

describe('horizontal bars and several value axes', () => {
    const barDef = () => {
        const def = lineDef();
        def.mapping.x = { column: 'value', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, null], domainRel: [0, 0] }, axis: { position: 'bottom' }, stacked: true, hover: { format: '.1f' } };
        def.mapping.y = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'vertical' }, axis: { position: 'left' } };
        def.plot = { type: 'cartesian:bar', categories: ['c'], highlight: 'row', props: { x0: '@x:start:scaled', x1: '@x:end:scaled', y: '@y:scaled', fill: '@color', 'highlight-stroke': 'black' } };
        return def;
    };

    test('stacked horizontal bars, the hover of a row of bars', async () => {
        const el = await mount(GenVis, { def: barDef(), data: lineData });
        // 2023: Wien 4, Tirol 2, stacked from 0 to 6 of the width 550
        const bars = [...el.querySelectorAll('g.vis-plot rect')].filter(r => r.getAttribute('fill') && r.__data__);
        const wien = el.querySelectorAll('g.vis-group[data-group-c="Wien"] rect');
        expect(wien).toHaveLength(3);
        const last = [...wien].at(-1);
        expect([last.getAttribute('x'), Math.round(last.getAttribute('width'))]).toEqual(['0', 367]);
        const tirol = [...el.querySelectorAll('g.vis-group[data-group-c="Tirol"] rect')].at(-1);
        expect(Math.round(tirol.getAttribute('x'))).toBe(367);
        expect(bars.every(r => +r.getAttribute('height') > 0)).toBe(true);

        // the positions of the hover are the years, vertical, the values horizontal
        const y = +last.getAttribute('y') + last.getAttribute('height')/2;
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 10 + y }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').textContent).toBe('2023');
        expect([...el.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent)).toEqual(['Tirol2,0', 'Wien4,0']);
        // the segment under the pointer, Tirol from 4 to 6
        expect(el.querySelector('.vis-hover tr.vis-nearest').textContent).toBe('Tirol2,0');
        expect(el.querySelectorAll('rect[stroke="black"]')).toHaveLength(1);
        const line = el.querySelector('.vis-hover-marker line');
        expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
        expect(el.querySelector('.vis-hover').style.transform).toContain('-50%');
        expect(errors).toEqual([]);
    });

    test('of two vertical axes the one with a hover, the other values with a hover are columns', async () => {
        const def = lineDef();
        def.mapping.y2 = { column: 'other', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'right' } };
        def.plot.push({ type: 'svg:circle', categories: ['c'], props: { cx: '@x:scaled', cy: '@y2:scaled', r: 2 } });
        const values = async def => {
            const el = await mount(GenVis, { def, data: lineData });
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
            await nextTick();
            return [...el.querySelectorAll('.vis-hover tr')].map(tr => [...tr.cells].map(td => td.textContent));
        };
        expect(await values(def)).toEqual([['Tirol', '2,0'], ['Wien', '1,0']]);
        def.mapping.y2.hover = { format: '.0f' };
        expect(await values(def)).toEqual([['Tirol', '2,0', '20'], ['Wien', '1,0', '10']]);
    });
});

describe('transforms', () => {
    test('an index of the base year of a slider, the values of the hover and the csv', async () => {
        const def = lineDef();
        def.globals = { base: '2020' };
        def.transform = { type: 'index', column: 'value', as: 'index', by: 'land', base: { year: '{base}' } };
        def.mapping.y.column = 'index';
        def.formElements = [{ id: 'base', name: 'Basis', ref: 'base', type: 'slider', values: { column: 'year' } }];
        const el = await mount(GenVis, { def, data: lineData, csv: true });
        const values = async () => {
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 550, clientY: 150 }));
            await nextTick();
            return [...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => tr.textContent);
        };
        // 2023 of 2020 = 100: Wien 4 of 1, Tirol 2 of 2
        expect(await values()).toEqual(['Wien400,0', 'Tirol100,0']);
        const slider = el.querySelector('.vis-slider input');
        slider.value = 2;
        slider.dispatchEvent(new Event('change'));
        await nextTick();
        // of 2022: Wien 4 of 3
        expect(await values()).toEqual(['Wien133,3', 'Tirol100,0']);

        const saved = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const blobs = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { blobs.push(b); return 'blob:x'; });
        el.querySelector('.vis-csv').click();
        const csv = await blobs[0].text();
        expect(csv.split('\n').slice(0, 3)).toEqual(['year,index,land', '2020,33.33333333333333,Wien', '2021,,Wien']);
        saved.mockRestore();
        expect(errors).toEqual([]);
    });
});

describe('the order and the ranks of categories', () => {
    test('a symbol of a legend by its shortcut', async () => {
        const def = lineDef();
        def.mapping.c.legend = { symbol: 'line' };
        def.mapping.c.props.categories.Tirol['stroke-dasharray'] = '2 2';
        const el = await mount(GenVis, { def, data: lineData });
        const lines = [...el.querySelectorAll('.vis-legend-entry svg line')];
        expect(lines.map(l => [l.getAttribute('stroke'), l.getAttribute('stroke-width'), l.getAttribute('stroke-dasharray')])).toEqual([['red', '2', null], ['blue', '2', '2 2']]);
        expect(el.querySelector('.vis-legend-entry svg').getAttribute('width')).toBe('16');
    });


    test('the newest year first and red, in the legend, the stacks and the facets', async () => {
        const def = lineDef();
        def.mapping.c = { column: 'year', type: 'categorical', legend: {}, hover: {}, props: {
            fromData: true, order: 'descending', ranks: [{ color: 'red' }, { color: 'orange' }, { color: 'grey' }] } };
        def.mapping.x = { column: 'land', type: 'categorical', scale: { type: 'band', orientation: 'horizontal' } };
        def.mapping.y.stacked = true;
        def.mapping.y.scale.domain = [0, null];
        def.mapping.f = { column: 'year', type: 'categorical', props: { fromData: true, order: 'descending' } };
        def.facets = { dim: 'f', cols: 4 };
        def.plot = { type: 'cartesian:bar', categories: ['c'], props: { x: '@x:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled', fill: '@color' } };
        const el = await mount(GenVis, { def, data: lineData });
        expect([...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key)).toEqual(['2023', '2022', '2021', '2020']);
        expect([...el.querySelectorAll('.vis-facet-title')].map(e => e.textContent)).toEqual(['2023', '2022', '2021', '2020']);
        expect([...el.querySelectorAll('svg.vis-svg')[0].querySelectorAll('rect[fill]')].map(r => r.getAttribute('fill'))).toEqual(['red', 'red']);
        expect([...el.querySelectorAll('svg.vis-svg')[3].querySelectorAll('rect[fill]')].map(r => r.getAttribute('fill'))).toEqual(['grey', 'grey']);
        expect(errors).toEqual([]);
    });
});

describe('the update of the facets', () => {
    const toggle = async (el, key) => {
        el.querySelector(`.vis-legend-entry[data-key="${key}"]`).click();
        await nextTick();
    };

    test('a toggle draws into the elements of the draw before', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        const svg = el.querySelector('svg.vis-svg');
        const tirol = [...el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')];
        const line = el.querySelector('path[data-group-c="Tirol"]');
        const y = tirol.map(c => c.getAttribute('cy'));
        await toggle(el, 'Wien');
        expect(el.querySelector('svg.vis-svg')).toBe(svg);
        expect([...el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')]).toEqual(tirol);
        expect(el.querySelector('path[data-group-c="Tirol"]')).toBe(line);
        expect(el.querySelectorAll('g.vis-group[data-group-c="Wien"]')).toHaveLength(0);
        // the scale of the values of Tirol only
        expect(tirol.map(c => c.getAttribute('cy'))).not.toEqual(y);

        await toggle(el, 'Wien');
        expect(tirol.map(c => c.getAttribute('cy'))).toEqual(y);
        // the groups in the order of the categories, as in a new draw
        expect([...el.querySelectorAll('g.plot-1 g.vis-group')].map(g => g.dataset.groupC)).toEqual(['Wien', 'Tirol']);
        const fresh = await mount(GenVis, { def: lineDef(), data: lineData });
        expect(el.querySelector('svg.vis-svg').outerHTML).toBe(fresh.querySelector('svg.vis-svg').outerHTML);
        expect(errors).toEqual([]);
    });

    test('the elements of a plot type without update are drawn anew', async () => {
        registerPlotType('test:append', {
            render: (groups, parent) => groups.forEach(g => g.rows.filter(g.complete).forEach(row => parent.append('rect').attr('x', g.at(row).x))),
        });
        const def = lineDef();
        def.plot = { type: 'test:append', categories: ['c'], props: { x: '@x:scaled' } };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('g.vis-plot rect')).toHaveLength(8);
        await toggle(el, 'Tirol');
        expect(el.querySelectorAll('g.vis-plot rect')).toHaveLength(4);
        await toggle(el, 'Tirol');
        expect(el.querySelectorAll('g.vis-plot rect')).toHaveLength(8);
        delete plotTypes['test:append'];
    });

    test('the built-in plot types update their elements, the annotations are drawn anew', () => {
        const types = Object.entries(plotTypes).filter(([, t]) => !t.update).map(([n]) => n);
        expect(types).toEqual(['annotation:band', 'annotation:line', 'annotation:text', 'annotation:circle']);
    });

    test('an open hover shows the rows of the new draw, e.g. of a toggle by the keyboard', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(2);
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(1);
        expect(el.querySelector('.vis-hover td').textContent).toBe('Wien');
    });
});

describe('extensions', () => {
    test('a registered plot type', async () => {
        registerPlotType('test:square', {
            render: (groups, parent, plot, ctx) => pointwise(groups, parent, 'rect', v => ({
                ...v, x: v.cx - 2, width: 4, height: ctx.innerHeight,
            })),
        });
        const def = lineDef();
        def.plot = { type: 'test:square', categories: ['c'], props: { cx: '@x:scaled', fill: '@color' } };
        const el = await mount(GenVis, { def, data: lineData });
        const rects = el.querySelectorAll('g.vis-plot rect');
        expect(rects).toHaveLength(8);
        expect(rects[0].getAttribute('height')).toBe('250');
        expect(rects[0].getAttribute('fill')).toBe('red');
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
        delete plotTypes['test:square'];
    });

    test('the groups of a plot type, the values of the props are plain values', async () => {
        let seen;
        registerPlotType('test:groups', { render: (groups, parent, plot, ctx) => { seen = { groups, ctx }; } });
        const def = lineDef();
        def.plot = { type: 'test:groups', categories: ['c'], props: { stroke: '@color', width: { prop: 'relative', ref: 'innerWidth', ratio: 0.1 }, d: { x: '@x:scaled', y: '@y' } } };
        await mount(GenVis, { def, data: lineData });
        const [wien, tirol] = seen.groups;
        expect(wien.categories).toEqual({ c: 'Wien' });
        expect(wien.props).toMatchObject({ color: 'red', name: 'Wien', visible: true });
        expect(wien.rows.map(r => r.x)).toEqual([2020, 2021, 2022, 2023]);
        // the values which are the same for all rows, and the ones of a row
        expect(wien.attrs).toEqual({ stroke: 'red', width: 55 });
        const x = seen.ctx.scales.x;
        expect(tirol.at(tirol.rows[0])).toEqual({ stroke: 'blue', width: 55, d: { x: x(2020), y: 2 } });
        expect(tirol.prop('d')(tirol.rows[3])).toEqual({ x: x(2023), y: 2 });
        // a missing value of a mapping of the props, e.g. a point is not drawn
        expect(wien.rows.map(wien.complete)).toEqual([true, false, true, true]);
        expect(Object.keys(seen.ctx)).toEqual(expect.arrayContaining(['store', 'inner', 'rows', 'scales', 'axis', 'scope', 'innerWidth', 'innerHeight']));
        expect(seen.ctx.scales.x.domain()).toEqual([2019.94, 2023.06]);
        delete plotTypes['test:groups'];
    });

    test('an unknown coordinate system is an error', async () => {
        const el = await mount(GenVis, { def: lineDef({ coord: 'spherical' }), data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown coordinate system 'spherical', expected one of 'cartesian', 'polar', 'geo'`);
    });

    test('scales without orientation and range, e.g. of colors', async () => {
        const def = lineDef();
        def.mapping.v = { column: 'other', type: 'numeric', scale: { type: 'linear', domain: [0, 40] } };
        def.mapping.col = { column: 'other', type: 'numeric', scale: { type: 'linear', domain: [0, 40], range: ['white', 'red'] } };
        def.plot = { type: 'svg:circle', props: { r: '@v:scaled', fill: '@col:scaled', cx: '@x:scaled', cy: '@y:scaled' } };
        const el = await mount(GenVis, { def, data: lineData });
        const circles = [...el.querySelectorAll('g.vis-plot circle')];
        expect(circles.map(c => c.getAttribute('r'))).toContain('1');
        expect(circles.map(c => c.getAttribute('fill'))).toContain('rgb(255, 0, 0)');
        expect(errors).toEqual([]);
    });
});

describe('polar', () => {
    // a month (0 to 11) per row, the angle is cyclic, 12 is at the angle of 0
    const months = Array.from({ length: 12 }, (_, m) => m);
    const polarData = 'month,value,land\n' + months.flatMap(m => [`${m},${m + 1},Wien`, `${m},2,Tirol`]).join('\n');
    const polarDef = () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.mapping.x = { column: 'month', type: 'numeric', scale: { orientation: 'angular', domain: [0, 12] }, axis: { position: 'angular', values: [0, 3, 6, 9, 12], grid: true } };
        def.mapping.y = { column: 'value', type: 'numeric', scale: { orientation: 'radial', domain: [0, 12] }, axis: { position: 'radial', ticks: 3, grid: true }, hover: {} };
        def.plot = [
            { type: 'polar:line', categories: ['c'], curve: 'linearClosed', props: { stroke: '@color', fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } } },
            { type: 'polar:circle', categories: ['c'], props: { fill: '@color', r: 3, angle: '@x:scaled', radius: '@y:scaled' } },
        ];
        return def;
    };
    const num = (e, a) => parseFloat(e.getAttribute(a));

    test('lines and points around the center of the facet', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        // inner size 300, the radius is 150
        expect(el.querySelector('svg.vis-svg > g').getAttribute('transform')).toBe('translate(200 200)');
        expect(el.querySelectorAll('g.vis-plot.plot-0 path')).toHaveLength(2);
        expect(el.querySelector('g.vis-plot.plot-0 path').getAttribute('d')).toMatch(/Z$/);

        // month 3 of Tirol (radius 2 of 12) is on the right of the center
        const circles = [...el.querySelectorAll('g.vis-plot.plot-1 g.vis-group[data-group-c="Tirol"] circle')];
        expect(circles).toHaveLength(12);
        expect(num(circles[3], 'cx')).toBeCloseTo(25);
        expect(num(circles[3], 'cy')).toBeCloseTo(0);
        expect(errors).toEqual([]);
    });

    test('the axes, the end of the cycle is not a tick of its own', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        const angular = [...el.querySelectorAll('g.vis-axis-angular g.tick text')];
        expect(angular.map(t => t.textContent)).toEqual(['0', '3', '6', '9']);
        // 3 is on the right, 6 at the bottom
        expect(num(angular[1], 'x')).toBeGreaterThan(150);
        expect(angular[1].getAttribute('text-anchor')).toBe('start');
        expect(num(angular[2], 'y')).toBeGreaterThan(150);
        expect(el.querySelectorAll('g.vis-grid line')).toHaveLength(4);

        const radial = [...el.querySelectorAll('g.vis-axis-radial g.tick text')];
        expect(radial.length).toBeGreaterThan(1);
        expect(el.querySelectorAll('g.vis-grid circle')).toHaveLength(radial.length);
        // above the plots
        expect(el.querySelector('svg.vis-svg > g').lastElementChild.previousElementSibling.getAttribute('class')).toMatch(/vis-axis-radial/);
    });

    test('polygons as grid lines', async () => {
        const def = polarDef();
        def.mapping.y.axis.gridShape = 'polygon';
        const el = await mount(GenVis, { def, data: polarData });
        const grid = [...el.querySelectorAll('g.vis-grid path')];
        expect(grid.length).toBeGreaterThan(1);
        // through the 4 ticks of the angle
        expect(grid[1].getAttribute('d').match(/L/g)).toHaveLength(3);
    });

    test('the hover takes the nearest angle, also across the top', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        const events = el.querySelector('rect.vis-events');
        // the pointer relative to the center, jsdom has no transforms
        const at = async (x, y) => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
            await nextTick();
            return el.querySelector('.vis-hover .vis-hover-title').textContent;
        };
        expect(await at(100, 0)).toBe('3');
        expect(await at(0, 100)).toBe('6');
        // just left of the top, 11 is at 330 degrees, 0 at 0 degrees
        expect(await at(-5, -100)).toBe('0');
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(2);
        // the marker from the center to the outer radius
        const line = el.querySelector('.vis-hover-marker line');
        expect([num(line, 'x1'), num(line, 'y1'), num(line, 'x2'), num(line, 'y2')].map(Math.round)).toEqual([0, 0, 0, -150]);
        expect(errors).toEqual([]);
    });

    test('stacked arcs of a band scale', async () => {
        const def = polarDef();
        def.mapping.x = { column: 'month', type: 'categorical', scale: { type: 'band', orientation: 'angular' }, axis: { position: 'angular' } };
        def.mapping.y.stacked = true;
        def.mapping.y.scale.domain = [0, null];
        def.plot = { type: 'polar:arc', categories: ['c'], props: { fill: '@color', angle: '@x:scaled', innerRadius: '@y:start:scaled', outerRadius: '@y:end:scaled' } };
        const el = await mount(GenVis, { def, data: polarData });
        const arcs = el.querySelectorAll('g.vis-plot path');
        expect(arcs).toHaveLength(24);
        arcs.forEach(a => expect(a.getAttribute('d')).toMatch(/^M.*A/));
        expect(await hover(el)).toBe(2);

        // the categories have the same distance, also the last and the first one
        const angles = [...el.querySelectorAll('g.vis-axis-angular g.tick text')]
            .map(t => Math.atan2(num(t, 'x'), -num(t, 'y')));
        const step = 2*Math.PI/12;
        expect(angles[0]).toBeCloseTo(step/2);
        expect(angles[1] - angles[0]).toBeCloseTo(step);
        expect(errors).toEqual([]);
    });

    test('cartesian plot types are not available', async () => {
        const def = polarDef();
        def.plot = { type: 'cartesian:bar', categories: ['c'], props: { x: '@x:scaled', y1: '@y:scaled' } };
        await mount(GenVis, { def, data: polarData });
        expect(errors).toContainEqual(expect.stringMatching(/plot\[0\]\.type: not available in the coordinate system 'polar'/));
    });
});

describe('scales', () => {
    test('dates of a fixed domain', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'date', type: 'date', scale: { type: 'utc', orientation: 'horizontal', domain: ['2020-01-01', '2021-01-01'] }, axis: { position: 'bottom', format: '%b' } };
        const el = await mount(GenVis, { def, data: 'date,value,land\n2020-03-01,1,Wien\n2020-06-01,2,Wien' });
        const labels = [...el.querySelectorAll('g.vis-axis-bottom g.tick text')].map(t => t.textContent);
        expect(labels[0]).toBe('Jan');
        expect(labels.at(-1)).toBe('Jan');
        expect(errors).toEqual([]);
    });

    test('the extension of a log domain is relative to its positions', async () => {
        const def = lineDef();
        // the values from 1 to 4, linear 10% of 3 would be 0.7 and 4.3
        def.mapping.y.scale = { orientation: 'vertical', type: 'log', domainRel: [-0.1, 0.1] };
        def.mapping.y.axis = { position: 'left', format: ',.0f', values: [1, 4] };
        const el = await mount(GenVis, { def, data: lineData });
        const ys = [...el.querySelectorAll('g.vis-axis-left g.tick')].map(t => parseFloat(t.getAttribute('transform').match(/,\s*([\d.]+)/)[1]));
        // the inner height is 250, the same space below 1 and above 4 (d3
        // moves the ticks by 0.5 for sharp lines)
        expect(ys).toHaveLength(2);
        expect(ys[0] - ys[1]).toBeCloseTo(250 / 1.2);
        expect(Math.abs((ys[0] + ys[1]) / 2 - 125)).toBeLessThanOrEqual(0.5);
        expect(errors).toEqual([]);
    });
});

describe('the space of the ticks', () => {
    test('a tick per tickSpacing pixels of the axis, also of polar axes', async () => {
        const def = lineDef({ width: 600 });
        def.mapping.y.axis = { position: 'left', tickSpacing: 50 };
        def.mapping.x.axis = { position: 'bottom', tickSpacing: 1000 };
        const data = 'year,value,land\n2000,0,Wien\n2100,100,Wien';
        const el = await mount(GenVis, { def, data });
        // 250 pixels of the height, 5 ticks of d3, it rounds to nice values
        expect(el.querySelectorAll('g.vis-axis-left g.tick').length).toBe(6);
        // at least 2
        expect(el.querySelectorAll('g.vis-axis-bottom g.tick').length).toBeLessThanOrEqual(3);

        const { tickCount } = await import('@/coords/ticks');
        expect(tickCount({ tickSpacing: 80 }, {}, 800)).toBe(10);
        expect(tickCount({ tickSpacing: 80, ticks: 3 }, {}, 800)).toBe(3);
        expect(tickCount({ tickSpacing: 80 }, {}, 50)).toBe(2);
        expect(tickCount({}, {}, 800)).toBeUndefined();
    });
});

describe('locale and font', () => {
    const labels = (el, position) => [...el.querySelectorAll(`g.vis-axis-${position} g.tick text`)].map(t => t.textContent);
    const bigData = 'year,value,land\n2020,1000,Wien\n2021,2500,Wien';

    test('german by default, also the ticks of axes without format', async () => {
        const def = lineDef();
        def.mapping.x.axis.format = ',.1f';
        const el = await mount(GenVis, { def, data: bigData });
        expect(labels(el, 'bottom')).toContain('2.020,0');
        expect(labels(el, 'left')).toContain('2.000');
    });

    test('a built-in locale', async () => {
        const def = lineDef({ locale: 'en' });
        def.mapping.x.axis.format = ',.1f';
        const el = await mount(GenVis, { def, data: bigData });
        expect(labels(el, 'bottom')).toContain('2,020.0');
        expect(labels(el, 'left')).toContain('2,000');
    });

    test('a locale merged into a built-in one', async () => {
        const def = lineDef({ locale: { number: { thousands: ' ' } } });
        const el = await mount(GenVis, { def, data: bigData });
        expect(labels(el, 'left')).toContain('2 000');
    });

    test('month names of time axes', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'date', type: 'date', scale: { type: 'time', orientation: 'horizontal' }, axis: { position: 'bottom' } };
        const el = await mount(GenVis, { def, data: 'date,value,land\n2020-01-15,1,Wien\n2020-05-15,2,Wien' });
        expect(labels(el, 'bottom')).toContain('März');
    });

    test('an unknown locale is an error', async () => {
        const el = await mount(GenVis, { def: lineDef({ locale: 'xx' }), data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown locale 'xx', expected one of 'de', 'en' or a language of Intl, e.g. 'fr'`);
    });

    test('a language of Intl, e.g. french', async () => {
        const def = lineDef({ locale: 'fr' });
        def.mapping.x = { column: 'date', type: 'date', scale: { type: 'utc', orientation: 'horizontal' }, axis: { position: 'bottom', format: '%B' } };
        def.mapping.y.axis.format = ',.1f';
        const el = await mount(GenVis, { def, data: 'date,value,land\n2020-01-15,1000,Wien\n2020-05-15,2500,Wien' });
        expect(labels(el, 'bottom')).toContain('mars');
        expect(labels(el, 'left')).toContain('2\u202f000,0');
        const { getLocale } = await import('@/utils/locale');
        expect(getLocale('fr').number.format('$,.2f')(1234.5)).toBe('1\u202f234,50\u00a0€');
        expect(getLocale('en-US').time.utcFormat('%x')(new Date(Date.UTC(2024, 2, 5)))).toBe('03/05/2024');
        expect(getLocale({ base: 'it', texts: { download: 'Scarica' } }).texts).toMatchObject({ download: 'Scarica', copy: 'Copy as PNG to the clipboard' });
    });

    test('the currency of the german locale', async () => {
        const { getLocale } = await import('@/utils/locale');
        expect(getLocale().number.format('$,.2f')(1234.5)).toBe('1.234,50 €');
        expect(getLocale('en').number.format('$,.2f')(1234.5)).toBe('$1,234.50');
    });

    test('the values of the hover without format in the locale, years without separators', async () => {
        const def = lineDef();
        delete def.mapping.y.hover.format;
        const values = async (data, locale) => {
            const el = await mount(GenVis, { def: { ...def, options: { ...def.options, locale } }, data });
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
            await nextTick();
            return [el.querySelector('.vis-hover-title').textContent, ...[...el.querySelectorAll('.vis-hover td.vis-value')].map(td => td.textContent)];
        };
        expect(await values('year,value,land\n2020,1234.5,Wien\n2021,0.25,Wien')).toEqual(['2020', '1234,5']);
        expect(await values('year,value,land\n2020,12345.678,Wien\n2021,0.25,Wien')).toEqual(['2020', '12.345,678']);
        expect(await values('year,value,land\n2020,12345.678,Wien\n2021,0.25,Wien', 'en')).toEqual(['2020', '12,345.678']);
        expect(await values('year,value,land\n2020,0.1234567891,Wien\n2021,0.25,Wien')).toEqual(['2020', '0,123457']);

        const { getLocale } = await import('@/utils/locale');
        const date = getLocale().valueFormat({ type: 'date', scale: { type: 'time' } });
        expect(date(new Date(2024, 2, 5))).toBe('05.03.2024');
        expect(getLocale().valueFormat({ type: 'categorical' })('Wien')).toBe('Wien');
    });

    test('the font', async () => {
        const el = await mount(GenVis, { def: lineDef({ fontFamily: 'Arial' }), data: lineData });
        expect(el.querySelector('.vis').style.getPropertyValue('--gen-vis-font-family')).toBe('Arial');

        const other = await mount(GenVis, { def: lineDef(), data: lineData });
        expect(other.querySelector('.vis').style.getPropertyValue('--gen-vis-font-family')).toBe('');
    });
});

describe('touch', () => {
    const touch = (type, init = {}) => pointer(type, { pointerType: 'touch', clientX: 300, clientY: 150, ...init });

    test('a touch shows the hover until the next touch outside', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        const events = el.querySelector('rect.vis-events');
        const rows = () => el.querySelectorAll('.vis-hover tr.vis-hover-entry').length;

        events.dispatchEvent(touch('pointerdown'));
        await nextTick();
        expect(rows()).toBe(2);

        // lifting the finger keeps the hover
        events.dispatchEvent(touch('pointerup'));
        events.dispatchEvent(touch('pointerleave'));
        await nextTick();
        expect(rows()).toBe(2);

        // a touch in the facet moves it, outside it hides it
        events.dispatchEvent(touch('pointerdown', { clientX: 500 }));
        await nextTick();
        expect(rows()).toBe(2);
        document.body.dispatchEvent(touch('pointerdown'));
        await nextTick();
        expect(rows()).toBe(0);
        expect(errors).toEqual([]);
    });

    test('scrolling hides the hover', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        const events = el.querySelector('rect.vis-events');
        events.dispatchEvent(touch('pointerdown'));
        await nextTick();
        events.dispatchEvent(touch('pointercancel'));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(0);
    });

    test('vertical swipes scroll the page', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        expect(el.querySelector('rect.vis-events').style.touchAction).toBe('pan-y');
    });

    test('the listener of the document is removed', async () => {
        const remove = vi.spyOn(document, 'removeEventListener');
        const el = document.body.appendChild(document.createElement('div'));
        const app = createApp(GenVis, { def: lineDef(), data: lineData });
        app.mount(el);
        await rendered(el);
        app.unmount();
        expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
});

describe('fixed bugs', () => {
    const stackDef = () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.type = { column: 'type', type: 'categorical', props: { categories: { a: {}, b: {} } } };
        def.plot = { type: 'cartesian:bar', categories: ['type'], props: { x: '@x:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled', width: 10, fill: 'red' } };
        return def;
    };
    const stackData = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2021,8,Wien,a\n2021,2,Wien,b';
    const rects = el => [...el.querySelectorAll('g.vis-plot rect')].map(r => ['x', 'y', 'width', 'height'].map(a => parseFloat(r.getAttribute(a))));

    test('fixed values of an axis outside of its domain are not drawn', async () => {
        const def = lineDef();
        // the values are from 1 to 4, d3 drew the others in the margins
        def.mapping.x.axis.grid = false;
        def.mapping.y.scale = { orientation: 'vertical', type: 'log', domainRel: [0, 0] };
        def.mapping.y.axis = { position: 'left', grid: true, format: ',.0f', values: [0.5, 1, 2, 5, 10] };
        const el = await mount(GenVis, { def, data: lineData });
        expect([...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent)).toEqual(['1', '2']);
        expect(el.querySelectorAll('g.vis-grid line')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('the domain of stacks without a fixed domain includes their start', async () => {
        const el = await mount(GenVis, { def: stackDef(), data: stackData });
        const ticks = [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent);
        expect(ticks[0]).toBe('0');
        // inner height 250
        rects(el).forEach(([x, y, w, h]) => expect(y + h).toBeLessThanOrEqual(250));
    });

    const barDef = () => {
        const def = lineDef();
        def.mapping.x = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'horizontal' }, axis: { position: 'bottom' } };
        def.plot = { type: 'cartesian:bar', categories: ['c'], props: { x: '@x:scaled', y1: '@y:scaled', fill: '@color' } };
        return def;
    };

    test('bars of negative values are drawn downwards from 0', async () => {
        const el = await mount(GenVis, { def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,-2,Wien' });
        const [pos, neg] = rects(el);
        expect(pos[3]).toBeGreaterThan(0);
        expect(neg[3]).toBeGreaterThan(0);
        // both end at 0
        expect(pos[1] + pos[3]).toBeCloseTo(neg[1]);
        expect(errors).toEqual([]);
    });

    test('bars and stacks are centered in the bands of a band scale', async () => {
        const centers = el => rects(el).map(([x, y, w]) => x + w/2);
        const ticks = el => [...el.querySelectorAll('g.vis-axis-bottom g.tick')]
            .map(t => parseFloat(t.getAttribute('transform').match(/translate\(([\d.]+)/)[1]));

        const bar = await mount(GenVis, { def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien' });
        centers(bar).forEach((c, i) => expect(c).toBeCloseTo(ticks(bar)[i]));

        const def = stackDef();
        def.mapping.x = barDef().mapping.x;
        // the width of the bands by default
        delete def.plot.props.width;
        const stack = await mount(GenVis, { def, data: stackData });
        const [x, y, width] = rects(stack)[0];
        expect(x + width/2).toBeCloseTo(ticks(stack)[0]);
        expect(width).toBeGreaterThan(0);
        expect(await hover(stack)).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('the hover lists stacked values in the order of the stack', async () => {
        const def = stackDef();
        def.mapping.type.hover = {};
        def.mapping.type.props.categories = { a: {}, b: {}, n: {}, m: {} };
        // a is at the bottom, but larger than b, n and m are below 0
        const data = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2020,-1,Wien,n\n2020,-3,Wien,m';
        const el = await mount(GenVis, { def, data });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const names = [...el.querySelectorAll('.vis-hover tr.vis-hover-entry td[data-mapping="type"]')].map(t => t.textContent);
        expect(names).toEqual(['b', 'a', 'n', 'm']);
    });

    test('stacks of a continuous scale without width are an error', async () => {
        const def = stackDef();
        delete def.plot.props.width;
        const el = await mount(GenVis, { def, data: stackData });
        expect(el.querySelector('.vis-error').textContent).toBe(`cartesian:bar: a 'width' is needed for a continuous scale`);
    });

    test('the hover of a band scale shows the band under the mouse', async () => {
        const el = await mount(GenVis, { def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien\n2022,3,Wien' });
        const events = el.querySelector('rect.vis-events');
        const title = x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 100 }));
            return nextTick().then(() => el.querySelector('.vis-hover .vis-hover-title').textContent);
        };
        // inner width 550, the centers of the bands are at 113, 275 and 437
        expect(await title(185)).toBe('2020');
        expect(await title(200)).toBe('2021');
        expect(await title(350)).toBe('2021');
        expect(await title(362)).toBe('2022');
    });

    test('categories without props only group the rows', async () => {
        const def = lineDef();
        def.mapping.id = { column: 'land', type: 'categorical' };
        def.plot[0].categories = ['id'];
        def.plot[0].props.stroke = 'black';
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('g.vis-plot.plot-0 path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('plot ids which are no css classes are highlighted', async () => {
        const def = lineDef();
        def.plot[0].id = '1st line';
        def.plot[0].props['highlight-stroke-width'] = 3;
        const el = await mount(GenVis, { def, data: lineData });
        expect(await hover(el)).toBe(2);
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('path.vis-highlight').getAttribute('stroke-width')).toBe('3');
        expect(errors).toEqual([]);
    });

    test('the labels of the form elements belong to their radio buttons', async () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
            { id: 'value', name: 'Value', value: 'value' },
            { id: 'other', name: 'Other', value: 'other' },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('.vis-form-element label')).toHaveLength(2);
        el.querySelectorAll('.vis-form-element label').forEach(l => {
            expect(document.getElementById(l.htmlFor)).toBe(l.previousElementSibling);
        });
    });

    test('categories with quotes are highlighted', async () => {
        const def = lineDef();
        def.mapping.c.props.categories = { "O'Brien": { color: 'red' }, 'Say "hi"': { color: 'blue' } };
        def.plot[0].props['stroke-width'] = 1;
        def.plot[0].props['highlight-stroke-width'] = 3;
        const data = lineData.replaceAll('Wien', `O'Brien`).replaceAll('Tirol', '"Say ""hi"""');
        const el = await mount(GenVis, { def, data });

        const [first, second] = el.querySelectorAll('.vis-legend .vis-legend-entries > div');
        second.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const highlighted = el.querySelectorAll('g.vis-plot.plot-0 path.vis-highlight');
        expect(highlighted).toHaveLength(1);
        expect(highlighted[0].getAttribute('data-group-c')).toBe('Say "hi"');
        expect(highlighted[0].getAttribute('stroke-width')).toBe('3');

        second.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        first.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('g.vis-plot.plot-0 path.vis-highlight').getAttribute('data-group-c')).toBe(`O'Brien`);
        expect(el.querySelector(`g.vis-plot.plot-0 path[data-group-c='Say "hi"']`).getAttribute('stroke-width')).toBe('1');
        expect(errors).toEqual([]);
    });

    test('stacked facets, the dim is a name', async () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.type = { column: 'type', type: 'categorical', props: { categories: { a: {}, b: {} } } };
        def.facets = { dim: 'c', cols: 2 };
        def.mapping.facet = def.mapping.c;
        def.plot = { type: 'svg:circle', categories: ['type'], props: { r: 2, cx: '@x:scaled', cy: '@y:end:scaled' } };
        // the name of the facet mapping has several characters
        def.mapping.land = def.mapping.c;
        delete def.mapping.c;
        delete def.mapping.facet;
        def.facets.dim = 'land';
        const data = 'year,value,land,type\n2020,1,Wien,a\n2020,2,Wien,b\n2020,1,Tirol,a\n2020,2,Tirol,b';
        const el = await mount(GenVis, { def, data });

        // stacked within every facet, not across them
        const facets = [...el.querySelectorAll('svg.vis-svg')];
        expect(facets).toHaveLength(2);
        facets.forEach(f => {
            const ticks = [...f.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent));
            expect(Math.max(...ticks)).toBeLessThanOrEqual(3);
        });
    });

    test('facets and stacks in the order of the categories, not of the rows', async () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.type = { column: 'type', type: 'categorical', props: { categories: { a: {}, b: {} } } };
        def.facets = { dim: 'c', cols: 2 };
        def.plot = { type: 'svg:circle', categories: ['type'], props: { r: 2, cx: '@x:scaled', cy: '@y:end:scaled' } };
        const data = 'year,value,land,type\n2020,2,Tirol,b\n2020,1,Tirol,a\n2020,2,Wien,b\n2020,1,Wien,a';
        const el = await mount(GenVis, { def, data });

        expect([...el.querySelectorAll('.vis-facet-title')].map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        el.querySelectorAll('svg.vis-svg').forEach(f => {
            const cy = type => parseFloat(f.querySelector(`g.vis-group[data-group-type='${type}'] circle`).getAttribute('cy'));
            // a is at the bottom of the stack, the top of b is above it
            expect(cy('a')).toBeGreaterThan(cy('b'));
        });
        expect(errors).toEqual([]);
    });
});

describe('accessibility and the data', () => {
    test('only the footer is html, the names are text', async () => {
        const def = lineDef({ title: '<b>Titel</b>', footer: '<a href="#q">Quelle</a>' });
        def.mapping.c.props.categories.Wien.name = '<i>Wien</i> & Umgebung';
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelector('.vis-footer-content a').textContent).toBe('Quelle');
        expect(el.querySelector('.vis-title').textContent).toBe('<b>Titel</b>');
        const entry = el.querySelector('.vis-legend-entry[data-key="Wien"] span');
        expect(entry.textContent).toBe('<i>Wien</i> & Umgebung');
        expect(entry.querySelector('i')).toBeNull();
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        const cell = [...el.querySelectorAll('.vis-hover td')].find(td => td.textContent.includes('Wien'));
        expect(cell.textContent).toBe('<i>Wien</i> & Umgebung');
        expect(cell.querySelector('i')).toBeNull();
    });

    test('the ids of the elements are unique, also of charts with the same form elements', async () => {
        const def = lineDef();
        def.globals = { col: 'value' };
        def.formElements = [{ id: 'col', name: 'Wert', ref: 'col', type: 'radio', values: [
            { id: 'value', name: 'Wert', value: 'value' }, { id: 'other', name: 'Anderer', value: 'other', mapping: { y: { column: 'other' } } }] }];
        await mount(GenVis, { def, data: lineData });
        await mount(GenVis, { def, data: lineData });
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...document.querySelectorAll('.vis-form-element')].map(e => e.dataset.id)).toEqual(['col', 'col']);
        expect([...document.querySelectorAll('.vis-radio > div')].map(e => e.dataset.id)).toEqual(['value', 'other', 'value', 'other']);
    });

    test('the svg is an image named by the title and the facet, the form elements have labels', async () => {
        const def = { ...lineDef({ title: 'Bevölkerung {unit}' }), globals: { unit: 'Personen', year: 'a' }, facets: { dim: 'c', cols: 2 } };
        def.formElements = [
            { id: 'year', name: 'Jahr', ref: 'year', type: 'select', values: [{ id: 'a', name: 'A', value: 'a' }] },
            { id: 'unit', name: 'Einheit', ref: 'unit', type: 'radio', values: [{ id: 'p', name: 'Personen', value: 'Personen' }] },
        ];
        const el = await mount(GenVis, { def, data: lineData });
        expect([...el.querySelectorAll('svg.vis-svg')].map(s => [s.getAttribute('role'), s.getAttribute('aria-label')]))
            .toEqual([['img', 'Bevölkerung Personen: Wien'], ['img', 'Bevölkerung Personen: Tirol']]);
        const [select, radio] = el.querySelectorAll('.vis-form-element');
        expect(select.querySelector('label').getAttribute('for')).toBe(select.querySelector('select').id);
        const group = radio.querySelector('[role="radiogroup"]');
        expect(radio.querySelector(`#${group.getAttribute('aria-labelledby')}`).textContent).toBe('Einheit:');
    });

    test('the rows shown as CSV, in the columns of the mappings', async () => {
        const saved = {};
        URL.createObjectURL = blob => { saved.blob = blob; return 'blob:csv'; };
        URL.revokeObjectURL = () => {};
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.name = this.download; });
        const def = lineDef({ title: 'Bevölkerung' });
        def.mapping.c.props.categories.Tirol.visible = false;
        const el = await mount(GenVis, { def, data: lineData, csv: true });
        el.querySelector('.vis-buttons .vis-csv').click();
        await vi.waitFor(() => expect(saved.name).toBe('Bevölkerung.csv'));
        expect(await saved.blob.text()).toBe('year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien\n2023,4,Wien');
        expect(el.querySelector('.vis-csv').title).toBe('Die Daten als CSV speichern');
    });
});

describe('layout shifts', () => {
    const outer = el => el.querySelector('.vis-outer');

    test('the space of a visualisation drawn before is kept while it is loaded', async () => {
        const def = lineDef({ title: 'Höhe' });
        // jsdom has no layout, the height of the drawn one is 400
        const first = createApp(GenVis, { def, data: lineData });
        const el = document.body.appendChild(document.createElement('div'));
        first.mount(el);
        expect(outer(el).classList.contains('vis-loading')).toBe(true);
        expect(outer(el).style.minHeight).toBe('');
        await rendered(el);
        await nextTick();
        expect(outer(el).classList.contains('vis-loading')).toBe(false);
        first.unmount();

        // drawn again, e.g. after a navigation of the page
        const again = document.body.appendChild(document.createElement('div'));
        createApp(GenVis, { def, data: lineData }).mount(again);
        // after the mount, before the browser paints
        await nextTick();
        expect(outer(again).classList.contains('vis-loading')).toBe(true);
        expect(outer(again).style.minHeight).toBe('400px');
        await rendered(again);
        await nextTick();
        expect(outer(again).style.minHeight).toBe('');

        // another definition has no space of its own
        const other = document.body.appendChild(document.createElement('div'));
        createApp(GenVis, { def: lineDef({ title: 'Andere' }), data: lineData }).mount(other);
        expect(outer(other).style.minHeight).toBe('');
    });

    test('a new definition is drawn when it is loaded, the one before is shown until then', async () => {
        const defFile = ref('/data/bev/def.json');
        const el = await mount({ render: () => h(GenVis, { defFile: defFile.value }) });
        expect(el.querySelector('.vis-title').textContent).toBe('Bevölkerung');
        defFile.value = '/data/bev/def-bar.json';
        await nextTick();
        // the old one while the new one is loaded
        expect(el.querySelector('.vis-title')?.textContent).toBe('Bevölkerung');
        await vi.waitFor(() => expect(el.querySelector('g.vis-plot rect')).not.toBeNull());
        expect(el.querySelectorAll('.vis')).toHaveLength(1);
    });
});

describe('images', () => {
    const def = () => ({
        ...lineDef({ title: 'Titel', subtitle: 'Untertitel', footer: 'Quelle' }),
        globals: { unit: 'a' },
        formElements: [{ id: 'unit', name: 'Einheit', ref: 'unit', type: 'radio', values: [
            { id: 'a', name: 'Absolut', value: 'a' },
            { id: 'b', name: 'Anteil', value: 'b' },
        ] }],
    });

    // without the size of the definition, the images have their own width
    const fluid = () => {
        const d = def();
        delete d.options.width;
        return d;
    };

    const clipboard = () => {
        const write = vi.fn(async items => { await items[0].items['image/png']; });
        vi.stubGlobal('ClipboardItem', class { constructor(items) { this.items = items; } });
        vi.stubGlobal('navigator', { ...navigator, clipboard: { write } });
        return write;
    };

    beforeEach(() => {
        screenshot.copy = screenshot.width = null;
        URL.createObjectURL = () => 'blob:png';
        URL.revokeObjectURL = () => {};
    });

    test('the image takes the rows already loaded, the data is not loaded again', async () => {
        const vm = createApp(GenVis, { defFile: '/data/bev/def.json' }).mount(document.body.appendChild(document.createElement('div')));
        await rendered(vm.$el);
        const fetched = [];
        const serve = fetch;
        vi.stubGlobal('fetch', url => {
            fetched.push(new URL(url).pathname);
            return serve(url);
        });
        clearCache();
        await vm.image();
        expect(fetched).toEqual(['/data/bev/def.json']);
        expect(screenshot.copy.querySelectorAll('g.vis-plot path').length).toBeGreaterThan(0);
    });

    test('the buttons are only shown with the props', async () => {
        clipboard();
        expect((await mount(GenVis, { def: def(), data: lineData })).querySelector('.vis-buttons')).toBeNull();
        const el = await mount(GenVis, { def: def(), data: lineData, download: true, copy: true });
        expect([...el.querySelectorAll('.vis-footer .vis-buttons button')].map(b => b.className)).toEqual(['vis-copy', 'vis-download']);
        expect(el.querySelector('.vis-download').title).toBe('Als PNG speichern');
    });

    test('no copy button without the clipboard', async () => {
        vi.stubGlobal('ClipboardItem', undefined);
        const el = await mount(GenVis, { def: def(), data: lineData, copy: true });
        expect(el.querySelector('.vis-buttons')).toBeNull();
    });

    test('the image has the selection but not the controls and the hidden entries', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const el = await mount(GenVis, { def: def(), data: lineData, download: 'chart' });

        el.querySelector('.vis-form-element input[value="b"]').click();
        el.querySelector('.vis-legend [data-key="Tirol"]').click();
        await nextTick();
        el.querySelector('.vis-download').click();
        await vi.waitFor(() => expect(click).toHaveBeenCalled());

        const copy = screenshot.copy;
        expect(screenshot.file).toBe('chart.png');
        expect([...copy.querySelectorAll('.vis-header > div')].map(e => [e.className, e.textContent])).toEqual([
            ['vis-title', 'Titel'], ['vis-subtitle', 'Untertitel'], ['vis-selection', 'Einheit: Anteil'],
        ]);
        expect(copy.querySelector('.vis-form-elements, .vis-buttons')).toBeNull();
        expect([...copy.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.dataset.key)).toEqual(['Wien']);
        // the copy is removed again, the visualisation keeps its state
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        expect(el.querySelector('.vis-form-element input[value="b"]').checked).toBe(true);
        expect(errors).toEqual([]);
    });

    test('the title and the subtitle with the globals, also of the image and its file', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const d = def();
        d.options.title = 'Titel {unit}';
        d.options.subtitle = 'Einheit {unit}, Untertitel';
        const el = await mount(GenVis, { def: d, data: lineData, download: true });
        const header = e => [...e.querySelectorAll('.vis-header > div')].map(e => e.textContent);
        expect(header(el)).toEqual(['Titel a', 'Einheit a, Untertitel']);

        el.querySelector('.vis-form-element input[value="b"]').click();
        await nextTick();
        expect(header(el)).toEqual(['Titel b', 'Einheit b, Untertitel']);
        el.querySelector('.vis-download').click();
        await vi.waitFor(() => expect(click).toHaveBeenCalled());
        expect(screenshot.file).toBe('Titel b.png');
        expect(header(screenshot.copy)).toEqual(['Titel b', 'Einheit b, Untertitel', 'Einheit: Anteil']);
        expect(errors).toEqual([]);
    });

    test('the width of the images', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        // of the definition, the default, the prop and the screen (800 in the
        // tests), with the padding, narrow ones of a larger scale
        const images = [];
        const sizes = [{ def: def() }, { def: fluid() }, { def: fluid(), imageWidth: 1600 }, { def: fluid(), imageWidth: 'screen' }, { def: fluid(), imageWidth: 360 }];
        for (const props of sizes) {
            const app = createApp(GenVis, { ...props, data: lineData });
            const vm = app.mount(document.body.appendChild(document.createElement('div')));
            await rendered(vm.$el);
            await vm.exportPng('chart');
            images.push([screenshot.width, screenshot.scale]);
            app.unmount();
        }
        expect(images).toEqual([['630px', 2], ['1230px', 2], ['1630px', 2], ['830px', 2], ['390px', 4]]);
        expect(errors).toEqual([]);
    });

    test('the copy button writes the image to the clipboard', async () => {
        const write = clipboard();
        const el = await mount(GenVis, { def: def(), data: lineData, copy: true });
        el.querySelector('.vis-copy').click();
        await vi.waitFor(() => expect(el.querySelector('.vis-copy').title).toBe('Kopiert'));
        expect(write).toHaveBeenCalledTimes(1);
        expect(await write.mock.calls[0][0][0].items['image/png']).toBeInstanceOf(Blob);
        expect(errors).toEqual([]);
    });

    test('an error of the copy rejects the image', async () => {
        registerPlotType('test:once', plotTypes['cartesian:line']);
        const app = createApp(GenVis, { def: { ...def(), plot: [{ ...def().plot[0], type: 'test:once' }] }, data: lineData });
        const vm = app.mount(document.body.appendChild(document.createElement('div')));
        await rendered(vm.$el);
        // the copy is drawn again, without the plot type
        delete plotTypes['test:once'];
        await expect(vm.image()).rejects.toThrow("Unknown plot type 'test:once'");
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        app.unmount();
        errors.length = 0;
    });

    test('form elements of the presentation are not in the selection', async () => {
        const d = def();
        d.globals.scale = 'shared';
        d.formElements.push({ id: 'scale', name: 'Skala', ref: 'scale', type: 'radio', inImage: false, values: [
            { id: 'shared', name: 'Geteilt', value: 'shared' },
            { id: 'free', name: 'Getrennt', value: 'free' },
        ] });
        expect(selection(prepareDef(d))).toBe('Einheit: Absolut');
    });

    test('the image has no legend of the facets, their titles name them', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const el = await mount(GenVis, { def: { ...def(), facets: { dim: 'c', cols: 2 } }, data: lineData, download: true });
        expect(el.querySelector('.vis-legend[data-dim="c"]')).not.toBeNull();

        el.querySelector('.vis-download').click();
        await vi.waitFor(() => expect(screenshot.copy).not.toBeNull());
        expect(screenshot.copy.querySelector('.vis-legend[data-dim="c"]')).toBeNull();
        expect([...screenshot.copy.querySelectorAll('.vis-facet-title')].map(e => e.textContent)).toEqual(['Wien', 'Tirol']);
        expect(errors).toEqual([]);
    });

    test('the buttons of the slot are before the others and not in the image', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const el = await mount({ render: () => h(GenVis, { def: def(), data: lineData, download: true }, {
            buttons: ({ save, canCopy }) => h('button', { class: 'own', 'data-copy': String(canCopy), onClick: save }),
        }) });
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['own', 'vis-download']);
        expect(el.querySelector('.own').dataset.copy).toBe('false');

        // the own button saves the image too, without the buttons
        el.querySelector('.own').click();
        await vi.waitFor(() => expect(screenshot.file).toBe('Titel.png'));
        expect(screenshot.copy.querySelector('.vis-buttons, .own')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('only the buttons of the slot', async () => {
        const el = await mount({ render: () => h(GenVis, { def: def(), data: lineData }, { buttons: () => h('button', { class: 'own' }) }) });
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['own']);
    });

    test('rendered once it is drawn', async () => {
        const onRendered = vi.fn();
        const el = await mount(GenVis, { def: def(), data: lineData, onRendered });
        expect(el.querySelector('svg.vis-svg path')).not.toBeNull();
        expect(onRendered).toHaveBeenCalledTimes(1);
    });
});
