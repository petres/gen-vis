// @vitest-environment jsdom
import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp, h, nextTick, ref } from 'vue';
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
