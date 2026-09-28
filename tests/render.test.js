// @vitest-environment jsdom
import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { GenVis, mountGenVisElement } from '@/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = Object.keys(import.meta.glob('../data/*/def*.json')).map(f => f.substring(2));

let errors;

beforeAll(() => {
    // jsdom has no layout
    Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
    globalThis.ResizeObserver = class { observe() {} disconnect() {} };
});

beforeEach(() => {
    // the files of the project, e.g. /data/bev/def.json
    vi.stubGlobal('fetch', async url => {
        const file = root + decodeURIComponent(new URL(url).pathname);
        return existsSync(file)
            ? new Response(readFileSync(file))
            : new Response('', { status: 404, statusText: 'Not Found' });
    });
    errors = [];
    // errors in event handlers, e.g. of the hover
    window.onerror = message => {
        errors.push(message);
        return true;
    };
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...a) => errors.push(a.join(' ')));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

const rendered = el => vi.waitFor(() => {
    if (!el.querySelector('svg.facet, .vis-error'))
        throw new Error('not rendered');
}, { timeout: 20000, interval: 10 });

const mount = async (component, props) => {
    const el = document.body.appendChild(document.createElement('div'));
    createApp(component, props).mount(el);
    await rendered(el);
    await nextTick();
    return el;
};

// moves the mouse over all facets, returns the most hover rows at a position
const hover = async el => {
    let rows = 0;
    for (const events of el.querySelectorAll('rect.events')) {
        events.dispatchEvent(new MouseEvent('mouseenter'));
        for (let x = 0; x <= 800; x += 25) {
            events.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 150 }));
            await nextTick();
            rows = Math.max(rows, el.querySelectorAll('.hover tr.entry').length);
        }
        events.dispatchEvent(new MouseEvent('mouseout'));
    }
    return rows;
};

const plotElements = el => el.querySelectorAll('g.plotGroup path, g.plotGroup circle, g.plotGroup rect, g.plotGroup text').length;

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom', ticks: 5, grid: true, title: { name: 'Jahr', offset: 30 } } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left', ticks: 5 }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, props: { manual: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } } },
    },
    plot: [
        { type: 'svg:path', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } } },
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
        for (const entry of el.querySelectorAll('.legend .entries > div[data-visible="true"]'))
            entry.click();
        await nextTick();
        await hover(el);

        expect(errors).toEqual([]);
    }, 60000);
});

describe('rendering', () => {
    test('missing values are gaps in lines and are not drawn as points', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        const [wien, tirol] = el.querySelectorAll('g.plotGroup.plot-0 path');
        expect(wien.getAttribute('d').match(/M/g)).toHaveLength(2);
        expect(tirol.getAttribute('d').match(/M/g)).toHaveLength(1);
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(7);
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
    });

    test('hover at a position with only missing values', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: 'year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien' });
        expect(await hover(el)).toBe(1);
        expect(errors).toEqual([]);
    });

    test('axis title and grid lines of a bottom axis', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        // inner width 550, inner height 250
        expect(el.querySelector('.axis-title').getAttribute('transform')).toBe('translate(275 280)');

        const lines = [...el.querySelectorAll('g.grid line')];
        expect(lines).toHaveLength(el.querySelectorAll('g.axis-position-bottom g.tick').length);
        lines.forEach(l => {
            expect(l.getAttribute('x1')).toBe(l.getAttribute('x2'));
            expect([l.getAttribute('y1'), l.getAttribute('y2')]).toEqual(['0', '250']);
        });
    });

    test('areas', async () => {
        const def = lineDef();
        def.plot = { type: 'base:area', categories: ['c'], props: { fill: '@color', d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } } };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('g.plotGroup path')).toHaveLength(2);
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
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'switch', values: [
            { id: 'value', name: 'Value', value: 'value', mapping: { y: { column: 'value' } } },
            { id: 'other', name: 'Other', value: 'other', mapping: { y: { column: 'other' } } },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        const ticks = () => [...el.querySelectorAll('g.axis-position-left g.tick text')].map(t => parseFloat(t.textContent));
        expect(ticks().at(-1)).toBe(4);

        el.querySelectorAll('.formElement .entries > div')[1].click();
        await nextTick();
        expect(ticks().at(-1)).toBe(40);
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(8);
        expect(errors).toEqual([]);
    });

    test('several visualisations have their own state', async () => {
        const el = await mount({
            render: () => ['A', 'B'].map(title => h(GenVis, { def: lineDef({ title }), data: lineData })),
        });
        await vi.waitFor(() => expect(el.querySelectorAll('svg.facet')).toHaveLength(2));
        const [a, b] = el.querySelectorAll('.vis');
        expect([a, b].map(v => v.querySelector('.vis-header .title').textContent)).toEqual(['A', 'B']);

        a.querySelector('.legend .entries > div').click();
        await nextTick();
        expect(a.querySelectorAll('g.plotGroup circle')).toHaveLength(4);
        expect(b.querySelectorAll('g.plotGroup circle')).toHaveLength(7);
    });

    test('errors are shown', async () => {
        const el = await mount(GenVis, { defFile: '/data/missing.json' });
        expect(el.querySelector('.vis-error').textContent)
            .toBe(`Could not load '${new URL('/data/missing.json', document.baseURI)}': 404 Not Found`);
        expect(errors).toHaveLength(1);
    });

    test('mountGenVisElement takes the props from the data attributes', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        el.dataset.defFile = '/data/bev/def.json';
        mountGenVisElement(el);
        await rendered(el);
        expect(el.querySelector('.vis-header .title').textContent).toBe('Bevölkerung');
    });
});
