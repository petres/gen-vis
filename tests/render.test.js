// @vitest-environment jsdom
import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp, h, nextTick, ref } from 'vue';
import { GenVis, mountGenVisElement, registerPlotType, pointwise } from '@/index.js';
import { plotTypes } from '@/plots';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { clearCache } from '@/store';

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
    clearCache();
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

const pointer = (type, init = {}) => new PointerEvent(type, { pointerType: 'mouse', bubbles: true, ...init });

// moves the mouse over all facets, returns the most hover rows at a position
const hover = async el => {
    let rows = 0;
    for (const events of el.querySelectorAll('rect.events')) {
        for (let x = 0; x <= 800; x += 25) {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 150 }));
            await nextTick();
            rows = Math.max(rows, el.querySelectorAll('.hover tr.entry').length);
        }
        events.dispatchEvent(pointer('pointerleave'));
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

    test.each([
        [40, 'rotate(-40)', 'end'],
        [-40, 'rotate(40)', 'start'],
    ])('axis labels rotated by %s', async (rotate, transform, anchor) => {
        const def = lineDef();
        def.mapping.x.axis.rotate = rotate;
        const el = await mount(GenVis, { def, data: lineData });
        const labels = [...el.querySelectorAll('g.axis-position-bottom g.tick text')];
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
            return el.querySelector('g.plotGroup.plot-0 path').getAttribute('d');
        };
        // linear by default, smooth curves are bezier curves
        expect(await wien(undefined)).not.toMatch(/C/);
        expect(await wien('monotoneX')).toMatch(/C/);
        def.plot = { type: 'base:area', curve: 'monotoneX', categories: ['c'], props: { fill: '@color', d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } } };
        const el = await mount(GenVis, { def, data });
        expect(el.querySelector('g.plotGroup path').getAttribute('d')).toMatch(/C/);
        expect(errors).toEqual([]);
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

    test('column templates combine form elements', async () => {
        const data = 'year,value,other,value.share,other.share,land\n2020,1,10,0.1,0.5,Wien\n2021,2,20,0.2,0.9,Wien';
        const def = lineDef();
        def.mapping.y.column = '{column}{share}';
        def.globals = { column: 'value', share: '' };
        def.formElements = [
            { id: 'column', name: 'Wert', ref: 'column', type: 'switch', values: [
                { id: 'value', name: 'Value', value: 'value' },
                { id: 'other', name: 'Other', value: 'other' },
            ] },
            { id: 'share', name: 'Anteil', ref: 'share', type: 'switch', values: [
                { id: 'abs', name: 'Absolut', value: '' },
                { id: 'rel', name: 'Anteil', value: '.share', mapping: { y: { axis: { format: '.0%' } } } },
            ] },
        ];
        const el = await mount(GenVis, { def, data });
        const ticks = () => [...el.querySelectorAll('g.axis-position-left g.tick text')].map(t => t.textContent);
        const entries = i => el.querySelectorAll('.formElement')[i].querySelectorAll('.entries > div');
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
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'switch', values: [
            { id: 'value', name: 'Value', value: 'value', mapping: { y: { column: 'value' } } },
            { id: 'other', name: 'Other', value: 'other', mapping: { y: { column: 'other' } } },
        ] }];
        return def;
    };
    const maxTick = el => Math.max(...[...el.querySelectorAll('g.axis-position-left g.tick text')].map(t => parseFloat(t.textContent)));
    const legendVisible = el => [...el.querySelectorAll('.legend .entries > div')].map(e => e.dataset.visible);
    const checked = el => [...el.querySelectorAll('.formElement input')].map(i => i.checked);

    test('a given state is applied', async () => {
        const state = { globals: { column: 'other' }, visible: { c: { Tirol: false } } };
        const el = await mount(GenVis, { def: stateDef(), data: lineData, state });
        expect(checked(el)).toEqual([false, true]);
        expect(legendVisible(el)).toEqual(['true', 'false']);
        // other of Wien
        expect(maxTick(el)).toBe(40);
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(4);
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

        el.querySelectorAll('.formElement .entries > div')[1].click();
        await nextTick();
        el.querySelectorAll('.legend .entries > div')[1].click();
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
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(7);
        expect(updates).toHaveLength(2);
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

describe('data formats', () => {
    test('parquet as data, integers as categories', async () => {
        const def = lineDef();
        def.mapping.c = { column: 'year', type: 'categorical', legend: {}, hover: {}, props: { manual: { 2020: { color: 'red' }, 2021: { color: 'blue' } } } };
        def.mapping.x.column = 'month';
        const data = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020n, 2020n, 2021n, 2021n, 2022n], type: 'INT64' },
            { name: 'month', data: [1, 2, 1, 2, 1], type: 'INT32' },
            { name: 'value', data: [1.5, 2.5, 3, null, 4], type: 'DOUBLE' },
        ] });
        const el = await mount(GenVis, { def, data });
        // 2022 has no props, it is not shown
        expect(el.querySelectorAll('g.plotGroup.plot-0 path')).toHaveLength(2);
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(3);
        expect(await hover(el)).toBe(2);

        el.querySelector('.legend .entries > div').click();
        await nextTick();
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('tsv by the format of the definition', async () => {
        const def = { ...lineDef(), dataFormat: 'tsv' };
        const el = await mount(GenVis, { def, data: lineData.replaceAll(',', '\t') });
        expect(el.querySelectorAll('g.plotGroup.plot-1 circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });
});

describe('extensions', () => {
    test('a registered plot type', async () => {
        registerPlotType('test:square', {
            render: (groups, parent, plotDef, ctx) => pointwise(groups, parent, 'rect', v => ({
                ...v, x: { prop: 'fixed', value: v.cx.value - 2 }, width: { prop: 'fixed', value: 4 }, height: { prop: 'fixed', value: ctx.innerHeight },
            })),
        });
        const def = lineDef();
        def.plot = { type: 'test:square', categories: ['c'], props: { cx: '@x:scaled', fill: '@color' } };
        const el = await mount(GenVis, { def, data: lineData });
        const rects = el.querySelectorAll('g.plotGroup rect');
        expect(rects).toHaveLength(8);
        expect(rects[0].getAttribute('height')).toBe('250');
        expect(rects[0].getAttribute('fill')).toBe('red');
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
        delete plotTypes['test:square'];
    });

    test('an unknown coordinate system is an error', async () => {
        const el = await mount(GenVis, { def: lineDef({ coord: 'spherical' }), data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown coordinate system 'spherical', expected one of 'cartesian', 'polar'`);
    });

    test('scales without orientation and range, e.g. of colors', async () => {
        const def = lineDef();
        def.mapping.v = { column: 'other', type: 'numeric', scale: { type: 'linear', domain: [0, 40] } };
        def.mapping.col = { column: 'other', type: 'numeric', scale: { type: 'linear', domain: [0, 40], range: ['white', 'red'] } };
        def.plot = { type: 'svg:circle', props: { r: '@v:scaled', fill: '@col:scaled', cx: '@x:scaled', cy: '@y:scaled' } };
        const el = await mount(GenVis, { def, data: lineData });
        const circles = [...el.querySelectorAll('g.plotGroup circle')];
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
        def.mapping.x = { column: 'month', type: 'numeric', scale: { orientation: 'angle', domain: [0, 12] }, axis: { position: 'angular', values: [0, 3, 6, 9, 12], grid: true } };
        def.mapping.y = { column: 'value', type: 'numeric', scale: { orientation: 'radius', domain: [0, 12] }, axis: { position: 'radial', ticks: 3, grid: true }, hover: {} };
        def.plot = [
            { type: 'radial:path', categories: ['c'], curve: 'linearClosed', props: { stroke: '@color', fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } } },
            { type: 'radial:circle', categories: ['c'], props: { fill: '@color', r: 3, angle: '@x:scaled', radius: '@y:scaled' } },
        ];
        return def;
    };
    const num = (e, a) => parseFloat(e.getAttribute(a));

    test('lines and points around the center of the facet', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        // inner size 300, the radius is 150
        expect(el.querySelector('svg.facet > g').getAttribute('transform')).toBe('translate(200 200)');
        expect(el.querySelectorAll('g.plotGroup.plot-0 path')).toHaveLength(2);
        expect(el.querySelector('g.plotGroup.plot-0 path').getAttribute('d')).toMatch(/Z$/);

        // month 3 of Tirol (radius 2 of 12) is on the right of the center
        const circles = [...el.querySelectorAll('g.plotGroup.plot-1 g.group[data-group-c="Tirol"] circle')];
        expect(circles).toHaveLength(12);
        expect(num(circles[3], 'cx')).toBeCloseTo(25);
        expect(num(circles[3], 'cy')).toBeCloseTo(0);
        expect(errors).toEqual([]);
    });

    test('the axes, the end of the cycle is not a tick of its own', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        const angular = [...el.querySelectorAll('g.axis-position-angular g.tick text')];
        expect(angular.map(t => t.textContent)).toEqual(['0', '3', '6', '9']);
        // 3 is on the right, 6 at the bottom
        expect(num(angular[1], 'x')).toBeGreaterThan(150);
        expect(angular[1].getAttribute('text-anchor')).toBe('start');
        expect(num(angular[2], 'y')).toBeGreaterThan(150);
        expect(el.querySelectorAll('g.grid line')).toHaveLength(4);

        const radial = [...el.querySelectorAll('g.axis-position-radial g.tick text')];
        expect(radial.length).toBeGreaterThan(1);
        expect(el.querySelectorAll('g.grid circle')).toHaveLength(radial.length);
        // above the plots
        expect(el.querySelector('svg.facet > g').lastElementChild.previousElementSibling.getAttribute('class')).toMatch(/axis-position-radial/);
    });

    test('polygons as grid lines', async () => {
        const def = polarDef();
        def.mapping.y.axis.gridShape = 'polygon';
        const el = await mount(GenVis, { def, data: polarData });
        const grid = [...el.querySelectorAll('g.grid path')];
        expect(grid.length).toBeGreaterThan(1);
        // through the 4 ticks of the angle
        expect(grid[1].getAttribute('d').match(/L/g)).toHaveLength(3);
    });

    test('the hover takes the nearest angle, also across the top', async () => {
        const el = await mount(GenVis, { def: polarDef(), data: polarData });
        const events = el.querySelector('rect.events');
        // the pointer relative to the center, jsdom has no transforms
        const at = async (x, y) => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
            await nextTick();
            return el.querySelector('.hover .title').textContent;
        };
        expect(await at(100, 0)).toBe('3');
        expect(await at(0, 100)).toBe('6');
        // just left of the top, 11 is at 330 degrees, 0 at 0 degrees
        expect(await at(-5, -100)).toBe('0');
        expect(el.querySelectorAll('.hover tr.entry')).toHaveLength(2);
        // the marker from the center to the outer radius
        const line = el.querySelector('.hoverMarker line');
        expect([num(line, 'x1'), num(line, 'y1'), num(line, 'x2'), num(line, 'y2')].map(Math.round)).toEqual([0, 0, 0, -150]);
        expect(errors).toEqual([]);
    });

    test('stacked arcs of a band scale', async () => {
        const def = polarDef();
        def.mapping.x = { column: 'month', type: 'categorical', scale: { type: 'band', orientation: 'angle' }, axis: { position: 'angular' } };
        def.mapping.y.stacked = true;
        def.mapping.y.scale.domain = [0, null];
        def.plot = { type: 'radial:arc', categories: ['c'], props: { fill: '@color', angle: '@x:scaled', innerRadius: '@y:st:s:scaled', outerRadius: '@y:st:e:scaled' } };
        const el = await mount(GenVis, { def, data: polarData });
        const arcs = el.querySelectorAll('g.plotGroup path');
        expect(arcs).toHaveLength(24);
        arcs.forEach(a => expect(a.getAttribute('d')).toMatch(/^M.*A/));
        expect(await hover(el)).toBe(2);

        // the categories have the same distance, also the last and the first one
        const angles = [...el.querySelectorAll('g.axis-position-angular g.tick text')]
            .map(t => Math.atan2(num(t, 'x'), -num(t, 'y')));
        const step = 2*Math.PI/12;
        expect(angles[0]).toBeCloseTo(step/2);
        expect(angles[1] - angles[0]).toBeCloseTo(step);
        expect(errors).toEqual([]);
    });

    test('cartesian plot types are not available', async () => {
        const def = polarDef();
        def.plot = { type: 'bar', categories: ['c'], props: { cx: '@x:scaled', height: '@y:scaled' } };
        await mount(GenVis, { def, data: polarData });
        expect(errors).toContainEqual(expect.stringMatching(/plot\[0\]\.type: not available in the coordinate system 'polar'/));
    });
});

describe('scales', () => {
    test('dates of a fixed domain', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'date', type: 'date', scale: { type: 'utc', orientation: 'horizontal', domain: ['2020-01-01', '2021-01-01'] }, axis: { position: 'bottom', format: '%b' } };
        const el = await mount(GenVis, { def, data: 'date,value,land\n2020-03-01,1,Wien\n2020-06-01,2,Wien' });
        const labels = [...el.querySelectorAll('g.axis-position-bottom g.tick text')].map(t => t.textContent);
        expect(labels[0]).toBe('Jan');
        expect(labels.at(-1)).toBe('Jan');
        expect(errors).toEqual([]);
    });
});

describe('locale and font', () => {
    const labels = (el, position) => [...el.querySelectorAll(`g.axis-position-${position} g.tick text`)].map(t => t.textContent);
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
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown locale 'xx', expected one of 'de', 'en'`);
    });

    test('the currency of the german locale', async () => {
        const { getLocale } = await import('@/utils/else');
        expect(getLocale().number.format('$,.2f')(1234.5)).toBe('1.234,50 €');
        expect(getLocale('en').number.format('$,.2f')(1234.5)).toBe('$1,234.50');
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
        const events = el.querySelector('rect.events');
        const rows = () => el.querySelectorAll('.hover tr.entry').length;

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
        const events = el.querySelector('rect.events');
        events.dispatchEvent(touch('pointerdown'));
        await nextTick();
        events.dispatchEvent(touch('pointercancel'));
        await nextTick();
        expect(el.querySelectorAll('.hover tr.entry')).toHaveLength(0);
    });

    test('vertical swipes scroll the page', async () => {
        const el = await mount(GenVis, { def: lineDef(), data: lineData });
        expect(el.querySelector('rect.events').style.touchAction).toBe('pan-y');
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
        def.mapping.type = { column: 'type', type: 'categorical', props: { manual: { a: {}, b: {} } } };
        def.plot = { type: 'stackedBar', categories: ['type'], props: { x: '@x', y: '@y', width: 10, fill: 'red' } };
        return def;
    };
    const stackData = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2021,8,Wien,a\n2021,2,Wien,b';
    const rects = el => [...el.querySelectorAll('g.plotGroup rect')].map(r => ['x', 'y', 'width', 'height'].map(a => parseFloat(r.getAttribute(a))));

    test('the domain of stacks without a fixed domain includes their start', async () => {
        const el = await mount(GenVis, { def: stackDef(), data: stackData });
        const ticks = [...el.querySelectorAll('g.axis-position-left g.tick text')].map(t => t.textContent);
        expect(ticks[0]).toBe('0');
        // inner height 250
        rects(el).forEach(([x, y, w, h]) => expect(y + h).toBeLessThanOrEqual(250));
    });

    const barDef = () => {
        const def = lineDef();
        def.mapping.x = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'horizontal' }, axis: { position: 'bottom' } };
        def.plot = { type: 'bar', categories: ['c'], props: { cx: '@x:scaled', height: '@y:scaled', fill: '@color' } };
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
        const ticks = el => [...el.querySelectorAll('g.axis-position-bottom g.tick')]
            .map(t => parseFloat(t.getAttribute('transform').match(/translate\(([\d.]+)/)[1]));

        const bar = await mount(GenVis, { def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien' });
        centers(bar).forEach((c, i) => expect(c).toBeCloseTo(ticks(bar)[i]));

        const def = stackDef();
        def.mapping.x = barDef().mapping.x;
        // the width of the bands by default
        delete def.plot.props.width;
        const stack = await mount(GenVis, { def, data: stackData });
        const [x, y, width] = rects(stack)[0];
        const transform = parseFloat(stack.querySelector('g.plotGroup rect').getAttribute('transform').match(/translate\((-?[\d.]+)/)[1]);
        expect(x + transform + width/2).toBeCloseTo(ticks(stack)[0]);
        expect(width).toBeGreaterThan(0);
        expect(await hover(stack)).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('the hover lists stacked values in the order of the stack', async () => {
        const def = stackDef();
        def.mapping.type.hover = {};
        def.mapping.type.props.manual = { a: {}, b: {}, n: {}, m: {} };
        // a is at the bottom, but larger than b, n and m are below 0
        const data = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2020,-1,Wien,n\n2020,-3,Wien,m';
        const el = await mount(GenVis, { def, data });
        el.querySelector('rect.events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const names = [...el.querySelectorAll('.hover tr.entry td.type')].map(t => t.textContent);
        expect(names).toEqual(['b', 'a', 'n', 'm']);
    });

    test('stacks of a continuous scale without width are an error', async () => {
        const def = stackDef();
        delete def.plot.props.width;
        const el = await mount(GenVis, { def, data: stackData });
        expect(el.querySelector('.vis-error').textContent).toBe(`stackedBar: a 'width' is needed for a continuous scale`);
    });

    test('the hover of a band scale shows the band under the mouse', async () => {
        const el = await mount(GenVis, { def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien\n2022,3,Wien' });
        const events = el.querySelector('rect.events');
        const title = x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 100 }));
            return nextTick().then(() => el.querySelector('.hover .title').textContent);
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
        expect(el.querySelectorAll('g.plotGroup.plot-0 path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('plot ids which are no css classes are highlighted', async () => {
        const def = lineDef();
        def.plot[0].id = '1st line';
        def.plot[0].props['highlight-stroke-width'] = 3;
        const el = await mount(GenVis, { def, data: lineData });
        expect(await hover(el)).toBe(2);
        el.querySelector('.legend .entries > div').dispatchEvent(new MouseEvent('mouseenter'));
        expect(el.querySelector('path.highlight').getAttribute('stroke-width')).toBe('3');
        expect(errors).toEqual([]);
    });

    test('the labels of the form elements belong to their radio buttons', async () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'switch', values: [
            { id: 'value', name: 'Value', value: 'value' },
            { id: 'other', name: 'Other', value: 'other' },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('.formElement label')).toHaveLength(2);
        el.querySelectorAll('.formElement label').forEach(l => {
            expect(document.getElementById(l.htmlFor)).toBe(l.previousElementSibling);
        });
    });

    test('categories with quotes are highlighted', async () => {
        const def = lineDef();
        def.mapping.c.props.manual = { "O'Brien": { color: 'red' }, 'Say "hi"': { color: 'blue' } };
        def.plot[0].props['stroke-width'] = 1;
        def.plot[0].props['highlight-stroke-width'] = 3;
        const data = lineData.replaceAll('Wien', `O'Brien`).replaceAll('Tirol', '"Say ""hi"""');
        const el = await mount(GenVis, { def, data });

        const [first, second] = el.querySelectorAll('.legend .entries > div');
        second.dispatchEvent(new MouseEvent('mouseenter'));
        const highlighted = el.querySelectorAll('g.plotGroup.plot-0 path.highlight');
        expect(highlighted).toHaveLength(1);
        expect(highlighted[0].getAttribute('data-group-c')).toBe('Say "hi"');
        expect(highlighted[0].getAttribute('stroke-width')).toBe('3');

        second.dispatchEvent(new MouseEvent('mouseleave'));
        first.dispatchEvent(new MouseEvent('mouseenter'));
        expect(el.querySelector('g.plotGroup.plot-0 path.highlight').getAttribute('data-group-c')).toBe(`O'Brien`);
        expect(el.querySelector(`g.plotGroup.plot-0 path[data-group-c='Say "hi"']`).getAttribute('stroke-width')).toBe('1');
        expect(errors).toEqual([]);
    });

    test('stacked facets, the dim is a name', async () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.type = { column: 'type', type: 'categorical', props: { manual: { a: {}, b: {} } } };
        def.facets = { dim: 'c', cols: 2 };
        def.mapping.facet = def.mapping.c;
        def.plot = { type: 'svg:circle', categories: ['type'], props: { r: 2, cx: '@x:scaled', cy: '@y:st:e:scaled' } };
        // the name of the facet mapping has several characters
        def.mapping.land = def.mapping.c;
        delete def.mapping.c;
        delete def.mapping.facet;
        def.facets.dim = 'land';
        const data = 'year,value,land,type\n2020,1,Wien,a\n2020,2,Wien,b\n2020,1,Tirol,a\n2020,2,Tirol,b';
        const el = await mount(GenVis, { def, data });

        // stacked within every facet, not across them
        const facets = [...el.querySelectorAll('svg.facet')];
        expect(facets).toHaveLength(2);
        facets.forEach(f => {
            const ticks = [...f.querySelectorAll('g.axis-position-left g.tick text')].map(t => parseFloat(t.textContent));
            expect(Math.max(...ticks)).toBeLessThanOrEqual(3);
        });
    });

    test('facets and stacks in the order of the categories, not of the rows', async () => {
        const def = lineDef();
        def.mapping.y.stacked = true;
        def.mapping.type = { column: 'type', type: 'categorical', props: { manual: { a: {}, b: {} } } };
        def.facets = { dim: 'c', cols: 2 };
        def.plot = { type: 'svg:circle', categories: ['type'], props: { r: 2, cx: '@x:scaled', cy: '@y:st:e:scaled' } };
        const data = 'year,value,land,type\n2020,2,Tirol,b\n2020,1,Tirol,a\n2020,2,Wien,b\n2020,1,Wien,a';
        const el = await mount(GenVis, { def, data });

        expect([...el.querySelectorAll('.facet-title')].map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        el.querySelectorAll('svg.facet').forEach(f => {
            const cy = type => parseFloat(f.querySelector(`g.group[data-group-type='${type}'] circle`).getAttribute('cy'));
            // a is at the bottom of the stack, the top of b is above it
            expect(cy('a')).toBeGreaterThan(cy('b'));
        });
        expect(errors).toEqual([]);
    });
});
