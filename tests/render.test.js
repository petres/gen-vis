// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { createGenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement, registerMarkType, registerScheme, perRow } from '@/index.js';
import { markTypes } from '@/marks';
import { parquetWriteBuffer } from 'hyparquet-writer';
import * as d3 from 'd3-scale-chromatic';
import { prepareDef } from '@/utils/def';
import { createStore } from '@/store';
import { clearCache } from '@/utils/load';
import { selection } from '@/utils/export';
import { itemOf } from '@/utils/dom';
import { rowOf } from '@/utils/draw';
import { examples, errors, useDom, rendered, mount, mountVis, pointer, hover, nextTick, html, resize, highlighted, highlightCss } from './dom.js';

// the image of the copy of the visualisation, the copy (the last chart of
// the page, see placeNear of utils/export.js) and the width of its
// container are kept for the tests
const screenshot = vi.hoisted(() => ({ copy: null, width: null, scale: null }));
vi.mock('@/utils/raster.js', () => ({
    rasterize: async options => {
        const node = [...document.querySelectorAll('.vis')].at(-1);
        screenshot.copy = node.cloneNode(true);
        screenshot.width = node.parentElement.style.width;
        screenshot.scale = options.scale;
        screenshot.svg = options.svg;
        return new Blob(['png'], { type: 'image/png' });
    },
}));

useDom();

const plotElements = el => el.querySelectorAll('g.vis-mark path, g.vis-mark circle, g.vis-mark rect, g.vis-mark text').length;

const lineDef = (options = {}) => ({
    width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options,
    dims: {
        x: { column: 'year', type: 'numeric', ticks: 5, grid: true, axis: { title: { name: 'Jahr', offset: 30 } } },
        y: { column: 'value', type: 'numeric', ticks: 5, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, categories: { Wien: 'red', Tirol: 'blue' } },
    },
    marks: [{ type: 'line', by: 'c' }, { type: 'point', by: 'c' }],
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
        const el = await mount({ defFile: file });
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

    // a column without values is of no type, e.g. a time format of its axis
    test.each(examples)('%s renders without data', async file => {
        const el = await mount({ defFile: file, data: [] });
        expect(el.querySelector('.vis-error')?.textContent ?? null).toBeNull();
        await hover(el);
        expect(errors).toEqual([]);
    }, 60000);
});

describe('rendering', () => {
    test('missing values are gaps in lines and are not drawn as points', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
        const [wien, tirol] = el.querySelectorAll('g.vis-mark.mark-0 path');
        expect(wien.getAttribute('d').match(/M/g)).toHaveLength(2);
        expect(tirol.getAttribute('d').match(/M/g)).toHaveLength(1);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(7);
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
    });

    test('the values of the hover have the class value, whatever the name of the dim', async () => {
        const def = lineDef();
        def.dims.price = { ...def.dims.y, scale: { orientation: 'vertical' } };
        delete def.dims.y;
        def.marks = { type: 'line', by: 'c', y: 'price' };
        const el = await mount({ def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 150 }));
        await nextTick();
        // a swatch of the color of the category first
        expect([...el.querySelector('.vis-hover tr.vis-hover-entry').children].map(td => [td.getAttribute('data-dim'), td.className])).toEqual([[null, 'vis-swatch'], ['c', ''], ['price', 'vis-value']]);
    });

    test('hover at a position with only missing values', async () => {
        const el = await mount({ def: lineDef(), data: 'year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien' });
        expect(await hover(el)).toBe(1);
        expect(errors).toEqual([]);
    });

    test('axis title and grid lines of a bottom axis', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
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
        def.dims.x.axis.rotate = rotate;
        const el = await mount({ def, data: lineData });
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
            def.marks[0].curve = curve;
            const el = await mount({ def, data });
            return el.querySelector('g.vis-mark.mark-0 path').getAttribute('d');
        };
        // linear by default, smooth curves are bezier curves
        expect(await wien(undefined)).not.toMatch(/C/);
        expect(await wien('monotoneX')).toMatch(/C/);
        def.marks = { type: 'area', curve: 'monotoneX', by: 'c' };
        const el = await mount({ def, data });
        expect(el.querySelector('g.vis-mark path').getAttribute('d')).toMatch(/C/);
        expect(errors).toEqual([]);
    });

    test('areas', async () => {
        const def = lineDef();
        def.marks = { type: 'area', by: 'c' };
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('an axis without hover definition', async () => {
        const def = lineDef();
        delete def.dims.y.hover;
        const el = await mount({ def, data: lineData });
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
    });

    test('controls change the dims by expressions of their globals', async () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.controls = [{ type: 'radio', global: 'column', name: 'Wert', values: [{ value: 'value', name: 'Value' }, { value: 'other', name: 'Other' }] }];
        def.dims.y.column = "=match(@column, {other: 'other'}, 'value')";
        const el = await mount({ def, data: lineData });
        const ticks = () => [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent));
        expect(ticks().at(-1)).toBe(4);

        el.querySelectorAll('.vis-control .vis-radio input')[1].click();
        await nextTick();
        expect(ticks().at(-1)).toBe(40);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(8);
        expect(errors).toEqual([]);
    });

    test('column templates combine controls', async () => {
        const data = 'year,value,other,value.share,other.share,land\n2020,1,10,0.1,0.5,Wien\n2021,2,20,0.2,0.9,Wien';
        const def = lineDef();
        def.dims.y.column = '{column}{share}';
        def.dims.y.axis = { format: "=match(@share, {'.share': '.0%'})" };
        def.globals = { column: 'value', share: '' };
        def.controls = [
            { type: 'radio', global: 'column', name: 'Wert', values: [{ value: 'value', name: 'Value' }, { value: 'other', name: 'Other' }] },
            { type: 'radio', global: 'share', name: 'Anteil', values: [{ id: 'abs', name: 'Absolut', value: '' }, { id: 'rel', name: 'Anteil', value: '.share' }] },
        ];
        const el = await mount({ def, data });
        const ticks = () => [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent);
        const entries = i => el.querySelectorAll('.vis-control')[i].querySelectorAll('.vis-radio input');
        // whole numbers of whole numbers
        expect(ticks().at(-1)).toBe('2');

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
        def.controls = [{ type: 'radio', global: 'column', name: 'Wert', values: [{ value: 'value', name: 'Value' }, { value: 'other', name: 'Other' }] }];
        def.dims.y.column = "=match(@column, {other: 'other'}, 'value')";
        return def;
    };
    const maxTick = el => Math.max(...[...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent)));
    const legendVisible = el => [...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.dataset.visible);
    const checked = el => [...el.querySelectorAll('.vis-control input')].map(i => i.checked);

    test('the globals and the width are references everywhere, the rows replace globals', async () => {
        const def = lineDef();
        // the global `x` is also a dim, in the marks `@x` is the one of the row
        def.globals = { accent: 'green', x: 'global' };
        def.controls = [{ type: 'radio', global: 'accent', name: 'Farbe', values: [{ value: 'green', name: 'Grün' }, { value: 'black', name: 'Schwarz' }] }];
        def.marks[1] = { ...def.marks[1], stroke: '@accent', 'data-x': '@x', 'data-width': '@totalWidth' };
        def.dims.c.legend = { props: { 'data-accent': '@accent' } };
        def.annotations = [{ type: 'line', y: 2, props: { stroke: '@accent', 'stroke-width': '=@totalWidth * 0.005' } }];
        const el = await mount({ def, data: lineData });
        const circle = () => el.querySelector('g.vis-mark.mark-1 circle');
        expect(circle().getAttribute('stroke')).toBe('green');
        expect(circle().getAttribute('data-x')).toBe('2020');
        expect(circle().getAttribute('data-width')).toBe('600');
        const line = () => el.querySelector('g.vis-annotations line');
        expect(line().getAttribute('stroke')).toBe('green');
        expect(line().getAttribute('stroke-width')).toBe('3');
        const legend = () => el.querySelector('.vis-legend .vis-legend-entries > div').getAttribute('data-accent');
        expect(legend()).toBe('green');

        el.querySelectorAll('.vis-control .vis-radio input')[1].click();
        await nextTick();
        expect(circle().getAttribute('stroke')).toBe('black');
        expect(line().getAttribute('stroke')).toBe('black');
        expect(legend()).toBe('black');
        expect(errors).toEqual([]);
    });

    test('the texts are templates of the globals, the domain can have references', async () => {
        const def = lineDef({ source: 'Quelle {source}' });
        def.globals = { source: 'Statistik', unit: 'Personen', max: 10 };
        def.dims.y.name = 'Wert in {unit}';
        def.dims.y.domain = [0, '@max'];
        def.dims.x.axis.title.name = 'Jahr ({source})';
        def.dims.c.name = 'Land ({unit})';
        def.dims.c.categories.Wien = { name: 'Wien ({unit})', color: 'red' };
        def.facets = { by: 'c', cols: 2 };
        const el = await mount({ def, data: lineData });
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
        def.dims.c = { ...def.dims.c, fromData: true, scheme: 'Tableau10', categories: { Tirol: {} } };
        const data = lineData + '\n2020,3,30,Salzburg\n2021,3,30,Salzburg';
        const el = await mount({ def, data });
        // the listed one first, the others of the data in ascending order
        expect([...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.getAttribute('data-key'))).toEqual(['Tirol', 'Salzburg', 'Wien']);
        expect([...el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => [p.getAttribute('data-group-c'), p.getAttribute('stroke')]))
            .toEqual([['Wien', '#e15759'], ['Tirol', '#4e79a7'], ['Salzburg', '#f28e2c']]);
        expect(errors).toEqual([]);
    });

    test('categories colored by a registered scheme, without the colors of d3', async () => {
        registerScheme('test-house', ['#111111', '#222222']);
        const def = lineDef();
        def.dims.c = { ...def.dims.c, fromData: true, scheme: 'test-house', categories: { Tirol: {} } };
        const data = lineData + '\n2020,3,30,Salzburg\n2021,3,30,Salzburg';
        const el = await mount({ def, data });
        // the colors in the order of the categories, again from the first one
        expect([...el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => [p.getAttribute('data-group-c'), p.getAttribute('stroke')]))
            .toEqual([['Wien', '#111111'], ['Tirol', '#111111'], ['Salzburg', '#222222']]);
        expect(() => registerScheme('test-empty', [])).toThrow('an array of CSS colors');
        expect(errors).toEqual([]);
    });

    test('the default colors of categories without colors, of a registered scheme observable10', async () => {
        const def = lineDef();
        def.dims.c = { column: 'land', type: 'categorical', legend: {}, categories: { Wien: {}, Tirol: {} } };
        const strokes = el => [...el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => p.getAttribute('stroke'));
        expect(strokes(await mount({ def, data: lineData }))).toEqual(['#4269D0', '#EFB118']);
        // the observable10 of the page, e.g. of a house style, with the original colors afterwards
        onTestFinished(() => registerScheme('observable10', ['#4269D0', '#EFB118', '#FF725C', '#6CC5B0', '#3CA951', '#FF8AB7', '#A463F2', '#97BBF5', '#9C6B4E', '#9498A0']));
        registerScheme('Observable10', ['#010101', '#020202', '#030303']);
        expect(strokes(await mount({ def, data: lineData }))).toEqual(['#010101', '#020202']);
        // of several sizes the one of the number of categories
        registerScheme('observable10', [null, ['#111111'], ['#121212', '#222222'], ['#131313', '#232323', '#333333']]);
        expect(strokes(await mount({ def, data: lineData }))).toEqual(['#121212', '#222222']);
        // with colors of the categories none
        def.dims.c.categories.Wien = 'red';
        // a mark without categories is drawn in the color of the text, see marks/defaults.js
        expect(strokes(await mount({ def, data: lineData }))).toEqual(['red', 'currentColor']);
        expect(errors).toEqual([]);
    });

    test('registered schemes of several sizes, entry n the n colors, holes allowed', async () => {
        registerScheme('test-sizes', [null, null, ['#000002', '#000003'], undefined, ['#000004', '#000005', '#000006', '#000007']]);
        const def = lineDef();
        def.dims.c = { ...def.dims.c, fromData: true, scheme: 'test-sizes', categories: {} };
        // the colors of the entries of the legend, in the order of the categories
        const colors = async data => Object.values((await mountVis({ def, data })).vis.store.def.dims.c.categoryProps).map(p => p.color);
        // 2 categories of the entry of 2 colors
        expect(await colors(lineData)).toEqual(['#000002', '#000003']);
        // 3 categories of the next larger one, the first 3 colors
        const three = lineData + '\n2020,3,30,Salzburg\n2021,3,30,Salzburg';
        expect(await colors(three)).toEqual(['#000004', '#000005', '#000006']);
        // more categories than the largest size: its colors again from the first one
        const six = three + ['Burgenland', 'Kärnten', 'Steiermark'].map(l => `\n2020,1,1,${l}`).join('');
        expect(await colors(six)).toEqual(['#000004', '#000005', '#000006', '#000007', '#000004', '#000005']);

        // the classes of a scale of colors, e.g. 2 of a threshold scale of one limit
        const { makeScale } = await import('@/utils/scales');
        expect(makeScale('v', { column: 'v', type: 'numeric', scale: { type: 'threshold', domain: [2], scheme: 'test-sizes' } }, [{ v: 1 }]).range()).toEqual(['#000002', '#000003']);

        // entry n has n colors, at least one entry
        expect(() => registerScheme('test-wrong', [null, ['#000'], ['#000']])).toThrow('or of several sizes, an array whose entry n is the array of n colors');
        expect(() => registerScheme('test-none', [null, null])).toThrow('an array of CSS colors');
        expect(() => registerScheme('test-mixed', ['#000', ['#000']])).toThrow('an array of CSS colors');
        expect(() => registerScheme('test-zero', [[]])).toThrow('an array of CSS colors');
        expect(errors).toEqual([]);
    });

    test('a given state is applied', async () => {
        const state = { globals: { column: 'other' }, visible: { c: { Tirol: false } } };
        const el = await mount({ def: stateDef(), data: lineData, state });
        expect(checked(el)).toEqual([false, true]);
        expect(legendVisible(el)).toEqual(['true', 'false']);
        // other of Wien
        expect(maxTick(el)).toBe(40);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('v-model:state reports the changes and resets', async () => {
        const updates = [];
        // the same def, a new one would load the visualisation again
        const def = stateDef();
        const { el, vis } = await mountVis({ def, data: lineData, state: null, 'onUpdate:state': s => {
            updates.push(s);
            vis.update({ state: s });
        } });

        el.querySelectorAll('.vis-control .vis-radio input')[1].click();
        await nextTick();
        el.querySelectorAll('.vis-legend .vis-legend-entries > div')[1].click();
        await nextTick();
        expect(updates).toEqual([
            { globals: { column: 'other' } },
            { globals: { column: 'other' }, visible: { c: { Tirol: false } } },
        ]);
        expect(maxTick(el)).toBe(40);

        // back to the default, not reported as a change
        vis.update({ state: null });
        await nextTick();
        await nextTick();
        expect(checked(el)).toEqual([true, false]);
        expect(legendVisible(el)).toEqual(['true', 'true']);
        expect(maxTick(el)).toBe(4);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(7);
        expect(updates).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('several visualisations have their own state', async () => {
        const [a, b] = (await Promise.all(['A', 'B'].map(title => mount({ def: lineDef({ title }), data: lineData }))))
            .map(el => el.querySelector('.vis'));
        expect([a, b].map(v => v.querySelector('.vis-header .vis-title').textContent)).toEqual(['A', 'B']);

        a.querySelector('.vis-legend .vis-legend-entries > div').click();
        await nextTick();
        expect(a.querySelectorAll('g.vis-mark circle')).toHaveLength(4);
        expect(b.querySelectorAll('g.vis-mark circle')).toHaveLength(7);
    });

    test('errors are shown', async () => {
        const el = await mount({ defFile: '/data/missing.json' });
        expect(el.querySelector('.vis-error').textContent)
            .toBe(`Could not load '${new URL('/data/missing.json', document.baseURI)}': 404 Not Found`);
        expect(errors).toHaveLength(1);
    });

    test('a definition which could not be drawn is replaced by a valid one', async () => {
        // the one which failed is not drawn again while the new one is loaded
        const { el, vis } = await mountVis({ def: { ...lineDef(), marks: { type: 'lines' } }, data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe("marks[0].type: unknown mark type 'lines', did you mean 'line'?");

        vis.update({ def: lineDef() });
        await vi.waitFor(() => expect(el.querySelector('svg.vis-svg')).not.toBeNull(), { timeout: 2000 });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(plotElements(el)).toBeGreaterThan(0);
    });

    test('the svg fills the visualisation inside its padding and border, e.g. of a card of the page', async () => {
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '.vis { padding: 10px 20px; border: 3px solid black; }';
        try {
            const def = lineDef();
            delete def.width;
            const el = await mount({ def, data: lineData });
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
        expect(vis({ download: 'false', csv: 'true', copy: 'false', debug: 'false' }).props).toMatchObject({ download: false, csv: true, copy: false, debug: false });
        expect(vis({ download: '', csv: 'werte', copy: '' }).props).toMatchObject({ download: true, csv: 'werte', copy: true });
        expect(vis({ check: '' }).props).toMatchObject({ check: true });

        const state = { globals: {}, visible: { c: { Wien: false } } };
        const chart = vis({ state: JSON.stringify(state) });
        expect(chart.props.state).toEqual(state);
        await rendered(chart.el.parentElement);
        await nextTick();
        expect([...chart.el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.visible)).toEqual(['false', 'true']);

        expect(vis({ state: '{ no json' }).props.state).toBeNull();
        expect(errors.join()).toContain('invalid JSON in data-state');
        errors.length = 0;
    });
});

describe('controls', () => {
    const switchDef = () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.controls = [{ type: 'radio', global: 'column', name: 'Wert', values: [{ value: 'value', name: 'Value' }, { value: 'other', name: 'Other' }] }];
        def.dims.y.column = "=match(@column, {other: 'other'}, 'value')";
        def.marks[0].highlight = { 'stroke-width': 3 };
        return def;
    };
    const mountWithUpdates = async def => {
        const updates = [];
        const el = await mount({ def, data: lineData, 'onUpdate:state': s => updates.push(s) });
        return { el, updates };
    };
    const visible = el => [...el.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.getAttribute('aria-checked'));
    const click = (e, detail = 1) => e.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));

    test('a click on the label of a radio button is one change', async () => {
        const { el, updates } = await mountWithUpdates(switchDef());
        el.querySelectorAll('.vis-control label')[1].click();
        await nextTick();
        expect(updates).toEqual([{ globals: { column: 'other' } }]);
        expect(el.querySelectorAll('.vis-control input')[1].checked).toBe(true);
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
        expect(el.querySelector('g.vis-mark.mark-0 path.vis-highlight').getAttribute('data-group-c')).toBe('Wien');
        wien.dispatchEvent(new FocusEvent('blur'));
        expect(el.querySelector('g.vis-mark.mark-0 path.vis-highlight')).toBeNull();
    });

    test('a double click shows only the entry, the next one all', async () => {
        const def = switchDef();
        def.dims.c.categories.Salzburg = 'green';
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
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(4);
        await double(tirol);
        expect(visible(el)).toEqual(['true', 'true', 'true']);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });

    test('a touch does not highlight, it has no end', async () => {
        const { el } = await mountWithUpdates(switchDef());
        const [wien] = el.querySelectorAll('.vis-legend .vis-legend-entries > div');
        wien.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
        expect(el.querySelector('g.vis-mark.mark-0 path.vis-highlight')).toBeNull();
        wien.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('g.vis-mark.mark-0 path.vis-highlight')).not.toBeNull();
    });
});

describe('events and slots', () => {
    test('the templates of the hover of the definition, the values are text', async () => {
        const def = lineDef({ hover: { title: '<b>{title}</b> ({unit})', row: '{c}: <i>{y}</i> {c.unit} ({y.value})' } });
        def.globals = { unit: 'Mio.' };
        def.dims.c.categories.Wien = { color: 'red', unit: '<u>' };
        def.dims.c.hover = { props: { unit: '@unit' } };
        const el = await mount({ def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').innerHTML).toBe('<b>2020</b> (Mio.)');
        expect(el.querySelector('.vis-hover table')).toBeNull();
        const rows = [...el.querySelectorAll('.vis-hover-row')];
        expect(rows.map(r => r.innerHTML)).toEqual(['Tirol: <i>2,0</i> Mio. (2)', 'Wien: <i>1,0</i> &lt;u&gt; (1)']);
        expect(rows.map(r => r.classList.contains('vis-nearest'))).toEqual([true, false]);

        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ ...def, hover: { title: '{titel}', row: '{c.unit} {z}' } })).toEqual([
            "hover.title: unknown name 'titel' in the template",
            "hover.row: unknown name 'z' in the template",
        ]);
    });

    test('the template of the title of the hover without one of the rows, the table below it', async () => {
        const def = lineDef({ hover: { title: '<b>{title}</b> ({unit})' } });
        def.globals = { unit: '<Mio.>' };
        const el = await mount({ def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').innerHTML).toBe('<b>2020</b> (&lt;Mio.&gt;)');
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(2);
    });

    test('the hover props of the categories are the columns of the hover', async () => {
        const def = lineDef();
        def.dims.c.categories = { Wien: { color: 'red', unit: 'Mio.' }, Tirol: { color: 'blue', unit: 'Tsd.' } };
        def.dims.c.hover = { props: { unit: '@unit' } };
        const el = await mount({ def, data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        const cells = [...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => [...tr.cells].filter(td => !td.classList.contains('vis-swatch')).map(td => [td.dataset.dim, td.dataset.prop ?? null, td.textContent]));
        expect(cells).toEqual([
            [['c', null, 'Tirol'], ['c', 'unit', 'Tsd.'], ['y', null, '2,0']],
            [['c', null, 'Wien'], ['c', 'unit', 'Mio.'], ['y', null, '1,0']],
        ]);

        // without the name
        def.dims.c.hover = { props: { name: null, unit: '@unit' } };
        const other = await mount({ def, data: lineData });
        other.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect([...other.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => tr.textContent)).toEqual(['Tsd.2,0', 'Mio.1,0']);
    });

    // the styles of the rows of the props of their categories, e.g. the lines
    // which are not stacked in italics, the nearest row stays bold, the keys
    // of the categories are attributes of the rows
    test('the styles of the rows of the hover of the props of the categories', async () => {
        const def = lineDef();
        def.dims.c.common = { hoverStyle: 'normal' };
        def.dims.c.categories.Wien = { color: 'red', hoverStyle: 'italic' };
        def.dims.c.hover = { row: { props: { 'font-style': '@hoverStyle', 'font-weight': 300, color: '@color', opacity: null } } };
        const el = await mount({ def, data: lineData });
        const events = el.querySelector('rect.vis-events');
        const rows = () => [...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(tr => [
            tr.dataset.c, tr.classList.contains('vis-nearest'), tr.style.fontStyle, tr.style.fontWeight, tr.style.color, tr.style.opacity,
        ]);
        events.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        // the nearest row is bold, the other one has the weight of the props
        expect(rows()).toEqual([['Tirol', true, 'normal', '', 'blue', ''], ['Wien', false, 'italic', '300', 'red', '']]);
        // another position, the rows of the one before are drawn anew
        events.dispatchEvent(pointer('pointermove', { clientX: 400, clientY: 20 }));
        await nextTick();
        expect(rows()).toEqual([['Wien', true, 'italic', '', 'red', ''], ['Tirol', false, 'normal', '300', 'blue', '']]);

        // the rows of a template of the definition
        const template = await mount({ def: { ...def, hover: { row: '{c}: {y}' } }, data: lineData });
        template.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect([...template.querySelectorAll('.vis-hover-row')].map(r => [r.dataset.c, r.style.fontStyle, r.style.fontWeight]))
            .toEqual([['Tirol', 'normal', ''], ['Wien', 'italic', '300']]);
        expect(errors).toEqual([]);

        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ ...def, dims: { ...def.dims, c: { ...def.dims.c, hover: { row: { props: { color: '@colour' } } } } } }))
            .toEqual([expect.stringMatching(/^dims\.c\.hover\.row\.props\.color: unknown reference 'colour'/)]);
        expect(validateDef({ ...def, dims: { ...def.dims, y: { ...def.dims.y, hover: { row: { props: { color: 'red' } } } } } }))
            .toEqual([`dims.y.hover.row: the styles of the rows of the hover are props of the categories, the dim needs 'categories' or 'fromData'`]);
    });

    test('hover and select with the rows of the dims', async () => {
        const hovers = [], selects = [];
        const el = await mount({ def: lineDef(), data: lineData,
            onHover: e => hovers.push(e), onSelect: e => selects.push(e) });
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
        const el = await mount({ def: lineDef({ title: 'Titel', source: 'Quelle' }), data: lineData, slots: {
            hover: ({ title, rows, entries }) => html('div', { class: 'own' }, `${title}: ${rows.map(r => r.c).join(', ')} ${entries.map(e => e.y.name).join(' ')}`),
            header: ({ title }) => html('h2', {}, title.toUpperCase()),
            footer: ({ footer }) => html('small', {}, `${footer}!`),
        } });
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
        def.dims.x.domain = [2020, 2023];
        def.dims.y.domain = [0, 4];
        def.annotations = annotations;
        return def;
    };

    test('an annotation at a category which is not one of the scale is not drawn, with a warning', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical' }, y: 'v' }, marks: [{ type: 'bar' }],
            annotations: [{ type: 'band', x: 'zz', label: 'none' }, { type: 'line', x: 'zz' }, { type: 'text', x: 'zz', y: 1, text: 'none' }, { type: 'band', x: 'b' }] };
        const el = await mount({ def, data: 'k,v\na,1\nb,2\nc,3' });
        expect(el.querySelectorAll('.vis-annotation').length).toBe(1);
        expect(el.querySelectorAll('.vis-annotation-label').length).toBe(0);
        expect(el.querySelector('.vis-svg').outerHTML).not.toMatch(/NaN/);
        expect(errors).toEqual(['band', 'line', 'text'].map((t, i) => expect.stringContaining(`annotations[${i}]: the ${t} has no position (x: "zz"`)));
        errors.length = 0;
        // a category of rows a filter leaves out is known, no warning
        const filtered = await mount({ def: { ...def, filter: '=@x != "b"' }, data: 'k,v\na,1\nb,2\nc,3' });
        expect(filtered.querySelectorAll('.vis-annotation').length).toBe(0);
        expect(errors.filter(e => e.includes('"b"'))).toEqual([]);
        errors.length = 0;
    });

    test('bands, lines, texts and circles of cartesian charts', async () => {
        const el = await mount({ def: annotated([
            { type: 'band', x: [2021.5, null], label: 'Schätzung' },
            { type: 'line', y: 2, props: { stroke: 'red' } },
            { type: 'line', x: '2021', label: 'Lockdown' },
            { type: 'text', x: 2021, y: 3, text: 'Hinweis' },
            { type: 'circle', x: 2022, y: 1, above: true },
        ]), data: lineData });
        const band = el.querySelector('g.vis-annotations.vis-below rect.vis-band');
        expect(band.parentNode.getAttribute('data-mark')).toBe('annotation-0');
        expect(['x', 'y', 'width', 'height'].map(a => num(band, a))).toEqual([275, 0, 275, 250]);
        // the labels are above the marks
        expect(el.querySelector('g.vis-annotation-labels .vis-annotation-label').textContent).toBe('Schätzung');
        const [horizontal, vertical] = el.querySelectorAll('g.vis-annotations line');
        expect(['x1', 'x2', 'y1', 'y2'].map(a => num(horizontal, a))).toEqual([0, 550, 125.5, 125.5]);
        expect(horizontal.getAttribute('stroke')).toBe('red');
        expect(num(vertical, 'x1')).toBeCloseTo(550/3 + 0.5);
        expect(el.querySelector('g.vis-annotations text.vis-text').textContent).toBe('Hinweis');
        expect(num(el.querySelector('g.vis-annotations.vis-above circle'), 'cx')).toBeCloseTo(1100/3);
        // below the grid lines and the marks, the circle above them
        const order = [...el.querySelector('svg.vis-svg > g').children].map(c => c.getAttribute('data-mark') ?? c.getAttribute('class'));
        expect(order.indexOf('annotation-3')).toBeLessThan(order.indexOf('vis-grid'));
        expect(order.indexOf('annotation-3')).toBeLessThan(order.indexOf('mark-0'));
        expect(order.indexOf('annotation-4')).toBeGreaterThan(order.indexOf('mark-1'));
        expect(order.indexOf('vis-annotation-labels')).toBeGreaterThan(order.indexOf('annotation-4'));
        expect(errors).toEqual([]);
    });

    test('a band of a category, dates and facets', async () => {
        const def = annotated([
            { type: 'band', x: '2020' },
            { type: 'text', x: '2021-06-01', text: 'Wien', facet: 'Wien' },
        ]);
        def.dims.x = { column: 'year', type: 'categorical', scale: { type: 'band' } };
        def.dims.d = { column: 'date', type: 'date', domain: ['2021-01-01', '2022-01-01'], scale: { type: 'utc', orientation: 'horizontal' } };
        def.annotations[1] = { type: 'text', d: '2021-07-02', text: 'Wien', facet: 'Wien' };
        def.facets = { by: 'c', cols: 2 };
        def.marks = { type: 'bar', by: 'c' };
        const el = await mount({ def, data: lineData.replace('year,', 'date,year,').replace(/\n(\d{4})/g, (m, y) => `\n${y}-01-01,${y}`) });
        const [wien, tirol] = el.querySelectorAll('svg.vis-svg');
        const band = wien.querySelector('rect.vis-band');
        const bar = wien.querySelectorAll('g.vis-mark rect')[0];
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
        const el = await mount({ def, data: lineData });
        const text = el.querySelector('text.vis-text');
        expect([num(text, 'x'), num(text, 'y')]).toEqual([0, 125]);
        expect(text.textContent).toBe('Ziel 2');
        const line = el.querySelector('line.vis-line');
        expect(['x1', 'x2', 'y1', 'y2'].map(a => num(line, a))).toEqual([0, 550, 125.5, 125.5]);
        expect(el.querySelector('.vis-annotation-label').textContent).toBe('Ziel 2');
        expect(errors).toEqual([]);
    });

    test('lines on the ticks of their values, at the half pixel of the axes', async () => {
        const el = await mount({ def: annotated([{ type: 'line', y: 2 }, { type: 'line', x: 2022 }]), data: lineData });
        const tickAt = (axis, value) => [...el.querySelectorAll(`.vis-axis-${axis} .tick`)]
            .find(t => parseFloat(t.textContent.replace(/\./g, '').replace(',', '.')) == value).getAttribute('transform');
        const [horizontal, vertical] = el.querySelectorAll('g.vis-annotations line');
        expect(tickAt('left', 2)).toBe(`translate(0,${horizontal.getAttribute('y1')})`);
        expect(tickAt('bottom', 2022)).toBe(`translate(${vertical.getAttribute('x1')},0)`);
        expect(horizontal.getAttribute('y1')).toBe('125.5');
    });

    test('annotations of the rows of a mark, e.g. events, with attributes of the rows', async () => {
        const def = annotated([]);
        def.marks = [def.marks[0], {
            type: 'annotation:line',
            data: [{ x: 2021, label: 'A', color: 'red' }, { x: 2022, label: 'B', color: 'blue' }],
            stroke: '@color',
        }];
        const el = await mount({ def, data: lineData });
        const lines = [...el.querySelectorAll('g.vis-mark.mark-1 line.vis-line')];
        expect(lines.map(l => [Math.round(num(l, 'x1')), l.getAttribute('stroke')])).toEqual([[184, 'red'], [367, 'blue']]);
        expect([...el.querySelectorAll('.vis-annotation-label')].map(l => l.textContent)).toEqual(['A', 'B']);
    });

    test('sectors and rings of polar charts', async () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.dims.x = { column: 'year', type: 'numeric', domain: [2020, 2024] };
        def.dims.y = { column: 'value', type: 'numeric', domain: [0, 4] };
        def.marks = { type: 'line', by: 'c' };
        def.annotations = [
            // across the top, from 2023.5 to 2020.5
            { type: 'band', x: [2023.5, 2020.5], label: 'Winter' },
            { type: 'line', y: 2 },
            { type: 'line', x: 2022 },
            { type: 'text', x: 2021, y: 4, text: 'Osten' },
        ];
        const el = await mount({ def, data: lineData });
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
        def.dims.type = { column: 'type', type: 'categorical', legend: {}, categories: { a: {}, b: {} } };
        def.marks = { type: 'bar', by: 'type', stack: true, width: 10, stroke: 'none', highlight: { mode: 'row', stroke: 'black' } };
        const data = 'year,value,land,type\n2020,1,Wien,a\n2020,2,Wien,b\n2023,3,Wien,a\n2023,1,Wien,b';
        const el = await mount({ def, data });
        const marked = () => highlighted(el, 'g.vis-mark rect');
        expect(highlightCss(el)).toContain('.vis-highlight *:not(g) { stroke: black; }');

        // the bottom segment of 2020, a of the value 1
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 0, clientY: 240 }));
        await nextTick();
        expect(marked()).toHaveLength(1);
        expect(marked()[0].parentNode.getAttribute('data-group-type')).toBe('a');

        el.querySelector('.vis-legend[data-dim="type"] .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(marked()).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});

describe('the data of a mark', () => {
    const num = (e, a) => parseFloat(e.getAttribute(a));

    test('a text at a value of the vertical axis, at the end of the horizontal one', async () => {
        const def = lineDef();
        def.dims.y.domain = [0, 4];
        def.globals = { target: 3 };
        def.marks = [def.marks[0], { type: 'text', data: [{ y: '@target', label: 'Ziel' }], x: '@x:scaled:max', text: '@label', 'text-anchor': 'end' }];
        const el = await mount({ def, data: lineData });
        const text = el.querySelector('g.vis-mark.mark-1 text');
        expect([num(text, 'x'), num(text, 'y'), text.textContent]).toEqual([550, 62.5, 'Ziel']);
        expect(errors).toEqual([]);
    });

    test('the elements of its rows are kept from one draw to the next, also of a row of other values', async () => {
        const def = lineDef();
        def.globals = { target: 3 };
        def.marks = [...def.marks, { type: 'point', id: 'own', data: [{ x: 2021, y: 1 }, { x: 2022, y: '@target' }], r: 2 }];
        const { el, vis } = await mountVis({ def, data: lineData });
        const circles = () => [...el.querySelectorAll('[data-mark="own"] circle')];
        const [a, b] = circles();
        const cy = b.getAttribute('cy');
        // a toggle of the legend: other scales, the same rows
        el.querySelector('.vis-legend-entry[data-key="Wien"]').click();
        await nextTick();
        expect(circles()).toEqual([a, b]);
        expect(circles().map(c => c[itemOf][rowOf])).toEqual([a[itemOf][rowOf], b[itemOf][rowOf]]);
        // a global of the second row: a new row in the element of the row before
        const rows = circles().map(c => c[itemOf][rowOf]);
        vis.update({ globals: { target: 2 } });
        await nextTick();
        expect(circles()).toEqual([a, b]);
        expect(a[itemOf][rowOf]).toBe(rows[0]);
        expect(b[itemOf][rowOf]).not.toBe(rows[1]);
        expect(b.getAttribute('cy')).not.toBe(cy);
        expect(errors).toEqual([]);
    });

    test('dates are converted, a row of a facet is only in its facet', async () => {
        const def = lineDef();
        def.dims.x = { column: 'year', type: 'date', domain: ['2020-01-01', '2024-01-01'], scale: { type: 'utc' } };
        def.facets = { by: 'c', cols: 2 };
        def.marks = [def.marks[0], { type: 'point', data: [{ x: '2022-01-01' }, { x: '2023-01-01', c: 'Tirol' }], cy: 0, r: 2 }];
        const el = await mount({ def, data: lineData });
        const [wien, tirol] = [...el.querySelectorAll('svg.vis-svg')].map(f => [...f.querySelectorAll('g.vis-mark.mark-1 circle')].map(c => Math.round(num(c, 'cx'))));
        expect(wien).toEqual([125]);
        expect(tirol).toEqual([125, 188]);
    });

    test('loaded from a url relative to the definition', async () => {
        const store = createStore();
        vi.stubGlobal('fetch', async url => new Response(url.endsWith('events.csv') ? 'x,label\n2021,A' : ''));
        await store.init({ def: { ...lineDef(), marks: [{ type: 'text', data: 'http://h/data/events.csv', text: '@label' }] }, data: lineData });
        expect(store.def.marks[0].data).toEqual([{ x: '2021', label: 'A' }]);
        expect(store.def.marks[0].loaded).toBe(true);
    });
});

describe('the selection of the rows of a mark', () => {
    const labelDef = select => {
        const def = lineDef();
        def.marks = [def.marks[0], { type: 'text', by: 'c', select, text: '@name' }];
        return def;
    };
    const labels = async select => [...(await mount({ def: labelDef(select), data: lineData })).querySelectorAll('g.vis-mark.mark-1 text')]
        .map(t => [t.textContent, t[itemOf][rowOf].x]);

    test('the last or the first row of every group, e.g. labels at the end of lines', async () => {
        expect(await labels('last')).toEqual([['Wien', 2023], ['Tirol', 2023]]);
        expect(await labels('first')).toEqual([['Wien', 2020], ['Tirol', 2020]]);
    });

    test('texts of several groups moved apart', async () => {
        const def = labelDef('last');
        def.marks[1].dodge = 20;
        const el = await mount({ def, data: lineData.replace('2023,4,40,Wien', '2023,2.1,40,Wien') });
        const ys = [...el.querySelectorAll('g.vis-mark.mark-1 text')].map(t => parseFloat(t.getAttribute('y')));
        expect(Math.abs(ys[0] - ys[1])).toBeCloseTo(20);
    });

    test('a halo behind the texts, the attributes of the mark replace its props', async () => {
        const def = labelDef('last');
        def.marks[1].halo = true;
        let text = (await mount({ def, data: lineData })).querySelector('g.vis-mark.mark-1 text');
        expect(text.style.getPropertyValue('stroke')).toBe('var(--gen-vis-halo-color, white)');
        expect([text.getAttribute('stroke-width'), text.getAttribute('paint-order'), text.getAttribute('stroke-linejoin')]).toEqual(['3', 'stroke', 'round']);
        def.marks[1].halo = 2;
        def.marks[1].stroke = '#EEE';
        text = (await mount({ def, data: lineData })).querySelector('g.vis-mark.mark-1 text');
        expect([text.getAttribute('stroke'), text.getAttribute('stroke-width')]).toEqual(['#EEE', '2']);
        expect(text.style.getPropertyValue('stroke')).toBe('');
        // without one none
        delete def.marks[1].halo;
        text = (await mount({ def, data: lineData })).querySelector('g.vis-mark.mark-1 text');
        expect(text.hasAttribute('stroke-width')).toBe(false);
    });

    test('the row with the most or the least value, of the rows with values', async () => {
        expect(await labels({ max: 'y' })).toEqual([['Wien', 2023], ['Tirol', 2020]]);
        expect(await labels({ min: 'y' })).toEqual([['Wien', 2020], ['Tirol', 2020]]);
    });

    test('marks of the same id have their own elements, also of the id of another mark', async () => {
        const def = labelDef('first');
        def.marks = [{ ...def.marks[1], id: 'labels' }, { ...def.marks[1], id: 'labels', select: 'last' }];
        let el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark[data-mark="labels"]')).toHaveLength(2);
        expect(el.querySelectorAll('g.vis-mark text')).toHaveLength(4);

        def.marks = [{ ...lineDef().marks[1], id: 'mark-1' }, { ...lineDef().marks[1], r: 5 }];
        el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(14);
    });
});

describe('the layers and facets of marks', () => {
    test('below the axes, above the other marks, only in some facets', async () => {
        const def = lineDef();
        def.facets = { by: 'c', cols: 2 };
        def.marks = [
            { ...def.marks[0], id: 'line' },
            { type: 'rect', id: 'background', layer: 'below', data: [{}], width: '@innerWidth', height: '@innerHeight', fill: '#EEE' },
            { type: 'text', id: 'note', layer: 'above', facet: 'Tirol', data: [{}], text: 'Tirol' },
        ];
        const el = await mount({ def, data: lineData });
        const [wien, tirol] = el.querySelectorAll('svg.vis-svg > g');
        const order = g => [...g.children].map(c => c.getAttribute('data-mark') ?? c.getAttribute('class').split(' ')[0]);
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
        coord: 'geo', width: 300, height: 100, margins: { top: 0, right: 0, bottom: 0, left: 0 },
        geo: { data: regions, join: 'region' },
        globals: { year: '2020' },
        filter: { year: '@globals.year' },
        controls: [{ type: 'select', global: 'year', name: 'Jahr', values: ['2020', '2021'] }],
        dims: {
            region: { column: 'region', type: 'categorical' },
            year: { column: 'year', type: 'categorical' },
            value: { name: 'Wert', column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' }, legend: {}, hover: { format: '.1f' } },
        },
        marks: [
            { type: 'base', fill: '#EEE' },
            { type: 'region', by: 'region', fill: 'value', stroke: 'none', highlight: { stroke: 'black' } },
            { type: 'point', by: 'region', r: 3, fill: 'red' },
        ],
    });
    const num = (e, a) => parseFloat(e.getAttribute(a));
    const fills = el => [...el.querySelectorAll('g.vis-mark.mark-1 path')].map(p => [p.getAttribute('data-geo-key'), p.getAttribute('fill')]);

    test('the features and the rows joined to them, colored by a scale', async () => {
        const el = await mount({ def: mapDef(), data: mapData });
        // all features, also the ones without rows
        expect(el.querySelectorAll('g.vis-mark.mark-0 path')).toHaveLength(3);
        // the domain of the colors is the one of the rows, not extended
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0)], ['B', d3.interpolateBlues(1)]]);
        // the rings are in the order of d3, the squares are fitted to the facet
        const [a, b] = [...el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => p.getAttribute('d'));
        expect(a).toMatch(/^M0[.\d]*,100L/);
        expect(b).not.toBe(a);
        // the circles at the centers
        const circles = [...el.querySelectorAll('g.vis-mark.mark-2 circle')].map(c => Math.round(num(c, 'cx')));
        expect(circles).toEqual([50, 150]);
        expect(errors).toEqual([]);
    });

    test('the rows of a global of a select', async () => {
        const el = await mount({ def: mapDef(), data: mapData });
        const select = el.querySelector('.vis-control select');
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
        def.controls = [{ type: 'slider', global: 'year', name: 'Jahr', values: { column: 'year' } }];
        // without the global the last value, the latest year
        delete def.globals;
        const updates = [];
        const el = await mount({ def, data: mapData, 'onUpdate:state': s => updates.push(s) });
        const slider = el.querySelector('.vis-control input[type="range"]');
        const legend = () => [...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent);
        expect([slider.min, slider.max, slider.value]).toEqual(['0', '1', '1']);
        expect(el.querySelector('.vis-control .vis-slider .vis-slider-value').textContent).toBe('2021');
        // 2 to 4
        expect(legend()).toContain('3,0');
        // moved to 2020, while it is moved, in the next frame
        slider.value = '0';
        slider.dispatchEvent(new Event('input'));
        await nextTick();
        expect(updates).toEqual([]);
        await new Promise(r => requestAnimationFrame(r));
        await nextTick();
        expect(el.querySelector('.vis-control .vis-slider .vis-slider-value').textContent).toBe('2020');
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

    test('the region of a feature is the element of the draw before, also of another row', async () => {
        const el = await mount({ def: mapDef(), data: mapData });
        const paths = () => [...el.querySelectorAll('g.vis-mark.mark-1 path')];
        const before = paths();
        const select = el.querySelector('.vis-control select');
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change'));
        await nextTick();
        // the same elements, not equal new ones
        expect(paths().map((p, i) => p === before[i])).toEqual([true, true]);
        expect(errors).toEqual([]);
    });

    test('the projection and the paths are computed once for the same facet', async () => {
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { def: mapDef(), data: mapData });
        await rendered(vm.el);
        const paths = () => [...vm.el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => p.getAttribute('d'));
        const before = paths();
        const select = vm.el.querySelector('.vis-control select');
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
        def.controls = [{ type: 'select', global: 'year', name: 'Jahr', values: { column: 'year' } }];
        // a global which is none of the values is the last one, the state is applied
        def.globals = { year: '1999' };
        const options = el => [...el.querySelectorAll('.vis-control option')].map(o => o.textContent);
        expect(options(await mount({ def, data: mapData }))).toEqual(['2020', '2021']);
        expect((await mount({ def, data: mapData })).querySelector('.vis-control select').value).toBe('2021');
        const el = await mount({ def, data: mapData, state: { globals: { year: '2020' } } });
        expect(el.querySelector('.vis-control select').value).toBe('2020');
        // numbers by their value
        expect(options(await mount({ def, data: 'region,year,value\nA,10,1\nA,9,2\nB,100,3' }))).toEqual(['9', '10', '100']);
        expect(errors).toEqual([]);
    });

    test('the hover of the region under the pointer', async () => {
        const el = await mount({ def: mapDef(), data: mapData });
        const events = el.querySelector('rect.vis-events');
        const at = async x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 50 }));
            await nextTick();
            return el.querySelector('.vis-hover .vis-hover-title')?.textContent;
        };
        expect(await at(150)).toBe('Region B');
        expect([...el.querySelectorAll('.vis-hover td')].map(t => t.textContent)).toEqual(['3.0'.replace('.', ',')]);
        // the region is highlighted
        expect(highlighted(el, 'g.vis-mark.mark-1 path')).toHaveLength(1);
        expect(highlightCss(el)).toContain('[data-mark="mark-1"] .vis-highlight:not(g)');
        // a region without rows has no hover, with `empty` its name
        expect(await at(250)).toBeUndefined();
        expect(highlighted(el, 'g.vis-mark.mark-1 path')).toHaveLength(0);
        const def = mapDef();
        def.hover = { empty: true };
        const all = await mount({ def, data: mapData });
        all.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 250, clientY: 50 }));
        await nextTick();
        expect(all.querySelector('.vis-hover .vis-hover-title').textContent).toBe('Region C');
        expect(all.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    test('no hover where there is no region', async () => {
        const def = mapDef();
        // a and b in the center (50 to 250), nothing left of them
        def.geo = { data: { type: 'FeatureCollection', features: [square('A', 0), square('B', 1)] }, join: 'region' };
        const el = await mount({ def, data: mapData });
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
        expect(el.querySelector('g.vis-mark.mark-1 path.vis-highlight')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the key, the name and the fit of the features', async () => {
        const def = mapDef();
        def.geo = { data: regions, join: 'region', key: 'code', name: 'code', fit: 'data' };
        const el = await mount({ def, data: mapData.replace(/\n([AB])/g, (m, r) => `\n${r.toLowerCase()}`) });
        expect(fills(el).map(f => f[0])).toEqual(['a', 'b']);
        // a and b fill the height in the center, c is outside
        const circles = [...el.querySelectorAll('g.vis-mark.mark-2 circle')].map(c => Math.round(num(c, 'cx')));
        expect(circles).toEqual([100, 200]);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 225, clientY: 50 }));
        await nextTick();
        expect(el.querySelector('.vis-hover .vis-hover-title').textContent).toBe('b');
    });

    test('the borders of an object of TopoJSON, all, inner or outer, every border once', async () => {
        // the squares A, B and C as TopoJSON, the groups AB and C of them
        const topology = {
            type: 'Topology',
            objects: {
                regions: { type: 'GeometryCollection', geometries: [
                    { type: 'Polygon', id: 'A', arcs: [[0, 2]] },
                    { type: 'Polygon', id: 'B', arcs: [[3, -2, 4, 0]] },
                    { type: 'Polygon', id: 'C', arcs: [[1, 5]] }] },
                groups: { type: 'GeometryCollection', geometries: [
                    { type: 'Polygon', id: 'AB', arcs: [[2, -5, 1, -4]] },
                    { type: 'Polygon', id: 'C', arcs: [[1, 5]] }] },
            },
            arcs: [
                [[1, 0], [1, 1]], [[2, 0], [2, 1]], [[1, 1], [0, 1], [0, 0], [1, 0]],
                [[1, 1], [2, 1]], [[2, 0], [1, 0]], [[2, 1], [3, 1], [3, 0], [2, 0]],
            ],
        };
        const def = mapDef();
        def.geo = { data: topology, join: 'region' };
        def.marks = [
            ...def.marks,
            { type: 'mesh', stroke: 'black' },
            { type: 'mesh', borders: 'inner', stroke: 'black' },
            { type: 'mesh', object: 'groups', borders: 'inner', stroke: 'black', 'stroke-width': 2 },
            { type: 'mesh', object: 'groups', borders: 'outer', stroke: 'black' },
        ];
        let el = await mount({ def, data: mapData });
        const mesh = i => el.querySelectorAll(`g.vis-mark.mark-${i} path`);
        const lines = i => mesh(i)[0].getAttribute('d').match(/M/g).length;
        // the features of the TopoJSON
        expect(el.querySelectorAll('g.vis-mark.mark-0 path')).toHaveLength(3);
        // one path, not filled
        expect(mesh(3)).toHaveLength(1);
        expect(mesh(3)[0].getAttribute('fill')).toBe('none');
        expect(mesh(3)[0].closest('g').classList.contains('vis-mesh')).toBe(true);
        // the borders between A and B and between B and C, of the groups only the one of AB and C
        expect(lines(4)).toBe(2);
        expect(lines(5)).toBe(1);
        expect(mesh(5)[0].getAttribute('stroke-width')).toBe('2');
        // the outline of the groups
        expect(lines(6)).toBeGreaterThan(0);
        expect(mesh(6)[0].getAttribute('d')).not.toBe(mesh(5)[0].getAttribute('d'));
        expect(errors).toEqual([]);

        // without the features left out of the object of the geometry, not of others
        def.geo.exclude = ['C'];
        el = await mount({ def, data: mapData });
        expect(lines(4)).toBe(1);
        expect(lines(5)).toBe(1);
        expect(errors).toEqual([]);
    });

    test('an entry of the missing values beside the colors', async () => {
        const def = mapDef();
        expect((await mount({ def, data: mapData })).querySelector('.vis-color-legend .vis-legend-missing')).toBeNull();
        def.dims.value.legend = { missing: { name: 'keine Daten', color: 'grey' } };
        const el = await mount({ def, data: mapData });
        expect(el.querySelector('.vis-color-legend .vis-legend-missing').textContent.trim()).toBe('keine Daten');
        expect(el.querySelector('.vis-color-legend .vis-legend-missing .vis-swatch').style.background).toBe('grey');
        expect(errors).toEqual([]);
    });

    test('the legend of a sqrt scale at the positions of its colors', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'sequentialSqrt', interpolator: 'Blues', domain: [0, 1] };
        def.dims.value.legend = { format: '.0%' };
        const el = await mount({ def, data: 'region,year,value\nA,2020,0.04\nB,2020,1' });
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
        delete def.dims.value.legend.format;
        delete def.dims.value.hover;
        const plain = await mount({ def, data: 'region,year,value\nA,2020,0.04\nB,2020,1' });
        expect([...plain.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['0', '0,02', '0,1', '0,2', '0,5', '1']);
        expect(errors).toEqual([]);
    });

    test('the ends of a domain of the data rounded by nice', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'sequentialSqrt', interpolator: 'Blues', domain: [0, null], nice: true };
        def.dims.value.legend = { format: '.0%' };
        const data = 'region,year,value\nA,2020,0.04\nB,2020,0.951';
        const el = await mount({ def, data });
        expect(fills(el)).toEqual([['A', d3.interpolateBlues(0.2)], ['B', d3.interpolateBlues(Math.sqrt(0.951))]]);
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent).at(-1)).toBe('100%');
        // without it the end is the one of the data, a fixed end is kept
        def.dims.value.scale.nice = false;
        expect([...(await mount({ def, data })).querySelectorAll('.vis-color-legend text')].map(t => t.textContent).at(-1)).toBe('50%');
        def.dims.value.scale = { type: 'sequential', interpolator: 'Blues', domain: [0.03, null], nice: 5 };
        // 0.03 is kept, 0.951 is 1
        expect(fills(await mount({ def, data })).map(f => f[1])).toEqual([d3.interpolateBlues(0.01/0.97), d3.interpolateBlues(0.921/0.97)]);
        expect(errors).toEqual([]);
    });

    test('the legend of a diverging scale, its middle is in the center', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'diverging', interpolator: 'RdBu', domain: [-1, 0, 3] };
        const el = await mount({ def, data: mapData });
        const ticks = [...el.querySelectorAll('.vis-color-legend line')].map(l => [Math.round(num(l, 'x1')), l.nextSibling.textContent]);
        expect(ticks).toEqual([[0, '−1,0'], [60, '−0,5'], [120, '0,0'], [160, '1,0'], [200, '2,0']]);
        expect(errors).toEqual([]);
    });

    test('a diverging scale with only a middle of 0 and positive values: colors, the legend of the upper half', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'diverging', interpolator: 'RdBu', domain: [null, 0, null] };
        const el = await mount({ def, data: mapData });
        expect(fills(el)).toEqual([['A', d3.interpolateRdBu(0.5 + 0.5/3)], ['B', d3.interpolateRdBu(1)]]);
        // the gradient of the colors of the domain, 0 at the start
        const stops = [...el.querySelectorAll('.vis-color-legend stop')].map(s => s.getAttribute('stop-color'));
        expect([stops[0], stops.at(-1)]).toEqual([d3.interpolateRdBu(0.5), d3.interpolateRdBu(1)]);
        const ticks = [...el.querySelectorAll('.vis-color-legend line')].map(l => [Math.round(num(l, 'x1')), l.nextSibling.textContent]);
        expect(ticks[0]).toEqual([0, '0,0']);
        expect(ticks.at(-1)).toEqual([160, '2,0']);
        expect(errors).toEqual([]);
    });

    test('classes of a threshold scale and their legend', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'threshold', domain: [2, 3.5], scheme: 'Greens' };
        const el = await mount({ def, data: mapData });
        expect(fills(el)).toEqual([['A', d3.schemeGreens[3][0]], ['B', d3.schemeGreens[3][1]]]);
        expect(el.querySelectorAll('.vis-color-legend rect')).toHaveLength(3);
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['2,0', '3,5']);
    });

    test('a label per class of a threshold scale, open ends', async () => {
        const def = mapDef();
        def.dims.value.scale = { type: 'threshold', domain: [2, 3.5], scheme: 'Greens' };
        def.dims.value.legend = { ...def.dims.value.legend, classes: true };
        const el = await mount({ def, data: mapData });
        expect([...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['< 2,0', '2,0–3,5', '≥ 3,5']);
        expect(el.querySelectorAll('.vis-color-legend line')).toHaveLength(0);
        def.dims.value.scale.closed = 'right';
        const right = await mount({ def, data: mapData });
        expect([...right.querySelectorAll('.vis-color-legend text')].map(t => t.textContent)).toEqual(['≤ 2,0', '2,0–3,5', '> 3,5']);
        // a vertical legend as wide as the labels, after or before the scale
        def.dims.value.scale.domain = [2000, 3500];
        def.dims.value.legend = { ...def.dims.value.legend, orientation: 'vertical' };
        const vertical = await mount({ def, data: mapData });
        const breadth = el => +el.querySelector('.vis-color-legend svg').getAttribute('width');
        // the longest label in characters of 6 pixels, after the scale at 18
        const longest = el => Math.max(...[...el.querySelectorAll('.vis-color-legend text')].map(t => t.textContent.length));
        expect(longest(vertical)).toBeGreaterThan(10);
        expect(breadth(vertical)).toBeGreaterThanOrEqual(18 + 6*longest(vertical));
        def.dims.value.legend.labels = 'before';
        const before = await mount({ def, data: mapData });
        // the scale right of the labels
        const shift = +before.querySelector('.vis-color-legend svg g').getAttribute('transform').match(/translate\(([\d.]+)/)[1];
        expect(shift).toBeGreaterThanOrEqual(6*longest(before) + 6);
        expect(breadth(before)).toBeGreaterThan(shift + 10);
        expect(errors).toEqual([]);
    });

    test('topojson and its objects', async () => {
        const topo = { type: 'Topology', objects: { squares: { type: 'GeometryCollection', geometries: [
            { type: 'Polygon', id: 'A', properties: { name: 'A' }, arcs: [[0]] },
        ] } }, arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
        const def = mapDef();
        def.geo = { data: topo, join: 'region' };
        let el = await mount({ def, data: mapData });
        // B has no feature, it is not drawn
        expect([...el.querySelectorAll('g.vis-mark.mark-1 path')].map(p => p.getAttribute('data-geo-key'))).toEqual(['A']);

        def.geo.object = 'circles';
        el = await mount({ def, data: mapData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown object 'circles' of the TopoJSON, expected one of 'squares'`);
    });

    test('only the features of include, without the ones of exclude, and annotations', async () => {
        const def = mapDef();
        def.geo.include = ['A', 'B'];
        def.geo.exclude = ['B'];
        def.annotations = [{ type: 'text', lon: 0.5, lat: 0.5, text: 'A' }, { type: 'circle', lon: 0.5, lat: 0.5, above: true }];
        const el = await mount({ def, data: mapData });
        expect([...el.querySelectorAll('g.vis-mark.mark-0 path')].map(p => p.getAttribute('data-geo-key'))).toEqual(['A']);
        // A fills the facet, B has no feature, it is not drawn
        expect([...el.querySelectorAll('g.vis-mark.mark-1 path')].map(p => p.getAttribute('data-geo-key'))).toEqual(['A']);
        const text = el.querySelector('g.vis-annotations text.vis-text');
        expect([num(text, 'x'), num(text, 'y')].map(Math.round)).toEqual([150, 50]);
        expect(el.querySelector('g.vis-annotations.vis-above circle')).not.toBeNull();
        expect(errors).toEqual([]);
    });

    test('a map needs a geometry', async () => {
        const def = mapDef();
        delete def.geo;
        const el = await mount({ def, data: mapData });
        expect(el.querySelector('.vis-error').textContent).toBe('geo.data: a map needs a geometry, e.g. "geo": { "data": "regions.json" }');
    });
});

describe('highlight', () => {
    test('the elements of a group of elements per row, e.g. circles', async () => {
        const def = lineDef();
        def.marks[1].highlight = { r: 6 };
        const el = await mount({ def, data: lineData });
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const circles = 'g.vis-mark.mark-1 g.vis-group[data-group-c="Wien"] circle';
        expect(highlighted(el, circles)).toHaveLength(3);
        expect(highlightCss(el)).toContain('[data-mark="mark-1"] .vis-highlight *:not(g) { r: 6; }');
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        expect(highlighted(el, circles)).toHaveLength(0);
    });

    test('the attributes are restored as they were, a missing one is removed', async () => {
        const def = lineDef();
        def.marks[1].highlight = { r: 6, stroke: 'black' };
        def.marks[0].highlight = { 'stroke-width': 3 };
        const el = await mount({ def, data: lineData });
        const html = el.querySelector('svg.vis-svg').outerHTML.replace(/ class=""/g, '');
        const entry = el.querySelector('.vis-legend-entry[data-key="Tirol"]');
        entry.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(highlighted(el, 'g.vis-group[data-group-c="Tirol"] circle')).toHaveLength(4);
        expect(el.querySelector('path[data-group-c="Tirol"]').classList.contains('vis-highlight')).toBe(true);
        expect(highlightCss(el)).toContain('[data-mark="mark-0"] .vis-highlight *:not(g) { stroke-width: 3; }');
        entry.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        expect(el.querySelectorAll('[stroke="black"], .vis-highlight, .vis-highlighting')).toHaveLength(0);
        // the groups are in their order again after the next draw, see the update of the facets
        expect(el.querySelector('svg.vis-svg').outerHTML.replace(/ class=""/g, '').length).toBe(html.length);
    });

    test('an entry of the legend highlights its category in all facets', async () => {
        const def = lineDef();
        def.marks[1].highlight = { r: 6 };
        def.dims.f = { column: 'land', type: 'categorical', categories: { Wien: {}, Tirol: {} } };
        def.facets = { by: 'f', cols: 2 };
        def.marks.forEach(m => m.by = 'c');
        const el = await mount({ def, data: lineData });
        el.querySelector('.vis-legend[data-dim="c"] .vis-legend-entry[data-key="Wien"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const facets = [...el.querySelectorAll('svg.vis-svg')];
        expect(facets).toHaveLength(2);
        expect(facets.map(f => highlighted(f, 'circle').length)).toEqual([3, 0]);
        el.querySelector('.vis-legend[data-dim="c"] .vis-legend-entry[data-key="Tirol"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(facets.map(f => highlighted(f, 'circle').length)).toEqual([0, 4]);
    });
});

describe('data formats', () => {
    test('parquet as data, integers as categories', async () => {
        const def = lineDef();
        def.dims.c = { column: 'year', type: 'categorical', legend: {}, hover: {}, categories: { 2020: 'red', 2021: 'blue' } };
        def.dims.x.column = 'month';
        const data = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020n, 2020n, 2021n, 2021n, 2022n], type: 'INT64' },
            { name: 'month', data: [1, 2, 1, 2, 1], type: 'INT32' },
            { name: 'value', data: [1.5, 2.5, 3, null, 4], type: 'DOUBLE' },
        ] });
        const el = await mount({ def, data });
        // 2022 has no props, it is not shown
        expect(el.querySelectorAll('g.vis-mark.mark-0 path')).toHaveLength(2);
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(3);
        expect(await hover(el)).toBe(2);

        el.querySelector('.vis-legend .vis-legend-entries > div').click();
        await nextTick();
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('the data of an url without an extension by its content, parquet or text, also of the export page', async () => {
        const parquet = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020, 2021, 2022], type: 'INT32' },
            { name: 'value', data: [1, 2, 3], type: 'DOUBLE' },
            { name: 'land', data: [1, 1, 1], type: 'INT32' },
        ] });
        // the lands of the parquet are numbers, as categories "1" and "2"
        const def = () => {
            const d = lineDef();
            d.dims.c.categories = { 1: 'red', 2: 'blue', Wien: 'red', Tirol: 'blue' };
            return d;
        };
        const files = { 'http://h/api/parquet': parquet, 'http://h/api/csv': new TextEncoder().encode(lineData) };
        vi.stubGlobal('fetch', async url => url in files ? new Response(files[url]) : new Response('', { status: 404, statusText: 'Not Found' }));
        const circles = el => el.querySelectorAll('g.vis-mark.mark-1 circle').length;
        expect(circles(await mount({ def: { ...def(), data: 'http://h/api/parquet' } }))).toBe(3);
        expect(circles(await mount({ def: { ...def(), data: 'http://h/api/csv' } }))).toBe(7);
        document.body.innerHTML = '';
        await import('@/export.js');
        for (const [url, n] of [['http://h/api/parquet', 3], ['http://h/api/csv', 7]]) {
            await window.genVisExport({ def: def(), dataUrl: url });
            expect(circles(document)).toBe(n);
        }
        await expect(window.genVisExport({ def: def(), dataUrl: 'http://h/api/none' }))
            .rejects.toThrow("genVisExport: Could not load 'http://h/api/none': 404 Not Found");
        expect(errors).toEqual([]);
    });

    test('tsv by the format of the definition', async () => {
        const def = { ...lineDef(), dataFormat: 'tsv' };
        const el = await mount({ def, data: lineData.replaceAll(',', '\t') });
        expect(el.querySelectorAll('g.vis-mark.mark-1 circle')).toHaveLength(7);
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
        const el = await mount({ def: lineDef(), data: lineData });
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

    test('enter and space select the rows of the hover, as a click', async () => {
        const selected = [];
        const el = await mount({ def: lineDef(), data: lineData, onSelect: e => selected.push(e) });
        await press(el, 'Enter');
        expect(selected).toEqual([]);
        await press(el, 'ArrowRight');
        await press(el, 'Enter');
        await press(el, 'ArrowDown');
        await press(el, ' ');
        expect(selected.map(s => [s.key, s.nearest.c])).toEqual([[2020, 'Tirol'], [2020, 'Wien']]);
    });

    test('after a change the hover is at the same position or hidden without any', async () => {
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { def: lineDef(), data: lineData });
        await rendered(vm.el);
        const el = vm.el.parentNode;
        await press(el, 'End');
        await press(el, 'ArrowLeft');
        expect(shown(el)).toEqual(['2022', 'Wien3,0']);
        // without the values of 2021, the position is the one of 2022
        vm.store.setState({ visible: { c: { Tirol: false } } });
        await nextTick();
        expect(shown(el)).toEqual(['2022', 'Wien3,0']);
        vm.store.setState({ visible: { c: { Tirol: false, Wien: false } } });
        await nextTick();
        expect(el.querySelector('.vis-hover')).toBeNull();
        expect(el.querySelector('.vis-hover-marker line').hasAttribute('x1')).toBe(false);
        expect(errors).toEqual([]);
    });

    test('no motion if the user prefers it', async () => {
        vi.stubGlobal('matchMedia', query => ({ matches: query == '(prefers-reduced-motion: reduce)' }));
        const el = await mount({ def: lineDef({ transition: 500 }), data: lineData });
        const circle = el.querySelector('g.vis-group[data-group-c="Tirol"] circle');
        const cy = circle.getAttribute('cy');
        el.querySelector('.vis-legend-entry[data-key="Wien"]').click();
        await nextTick();
        expect(circle.getAttribute('cy')).not.toBe(cy);
    });

    test('the regions of a map by their names', async () => {
        const el = await mount({ defFile: '/data/bev/def-map.json' });
        await press(el, 'Home');
        const first = shown(el)[0];
        await press(el, 'ArrowRight');
        const second = shown(el)[0];
        expect([first, second].every(Boolean)).toBe(true);
        expect(first.localeCompare(second)).toBeLessThan(0);
    });

    test('a facet without a hover is not in the order of the tab key', async () => {
        const def = lineDef();
        def.dims.y.scale = { orientation: null };
        def.dims.y.axis = false;
        delete def.dims.y.ticks;
        const el = await mount({ def, data: lineData });
        expect(el.querySelector('svg.vis-svg').hasAttribute('tabindex')).toBe(false);
    });
});

describe('the hover of the nearest point', () => {
    test('the row of the nearest point within the radius, in cartesian and polar charts', async () => {
        const def = lineDef({ hover: { mode: 'point', radius: 20 } });
        def.marks = def.marks.slice(1);
        const el = await mount({ def, data: lineData });
        const circle = el.querySelector('g.vis-group[data-group-c="Wien"] circle:last-child');
        const [cx, cy] = [+circle.getAttribute('cx'), +circle.getAttribute('cy')];
        const events = el.querySelector('rect.vis-events');
        // the plot area is at 0, 0 in jsdom, see tests/dom.js
        events.dispatchEvent(pointer('pointermove', { clientX: cx + 5, clientY: cy - 5 }));
        await nextTick();
        // the title of a point is its category, its values are the cells, under their names
        expect(el.querySelector('.vis-hover-title').textContent).toBe('Wien');
        expect([...el.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent)).toEqual(['Jahry', '20234,0']);
        expect(el.querySelector('.vis-hover-marker line').hasAttribute('x1')).toBe(false);
        // too far from every point
        events.dispatchEvent(pointer('pointermove', { clientX: cx - 60, clientY: cy }));
        await nextTick();
        expect(el.querySelector('.vis-hover')).toBeNull();
        // a point of the cell beside the one of the pointer, the points are in
        // cells of the size of the radius
        const across = cx % 20 > 0 ? cx + 20 - cx % 20 + 0.5 : cx - 0.5;
        expect(Math.floor(across/20)).not.toBe(Math.floor(cx/20));
        events.dispatchEvent(pointer('pointermove', { clientX: across, clientY: cy + 1 }));
        await nextTick();
        expect([...el.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent)).toEqual(['Jahry', '20234,0']);

        const { default: polar } = await import('@/coords/polar');
        const { scaleLinear } = await import('d3-scale');
        const orientations = { a: 'angular', r: 'radial' };
        const ctx = { scales: { a: scaleLinear([0, 4], [0, Math.PI*2]), r: scaleLinear([0, 10], [0, 100]) }, stackOf: null,
            store: { dim: n => ({ scale: { orientation: orientations[n] } }) } };
        const [x, y] = polar.hover.point(ctx, { a: 1, r: 5 }, { h: 'a', v: 'r' });
        expect([Math.round(x), Math.round(y)]).toEqual([50, 0]);
    });
});

describe('formatted values', () => {
    test('labels of the format of the hover or of a format prop, dates of a format of times', async () => {
        const def = lineDef();
        def.dims.y.hover.format = ',.2f';
        def.marks = [{ type: 'text', by: 'c', select: 'last', text: '@y:formatted', 'data-x': "=format(@x, '.1f')", 'data-g': "=format(@g, '.0%')" }];
        def.globals = { g: 0.25 };
        const el = await mount({ def, data: lineData.replace('2023,4,40,Wien', '2023,1234.5,40,Wien') });
        const texts = [...el.querySelectorAll('g.vis-mark text')];
        expect(texts.map(t => t.textContent)).toEqual(['1.234,50', '2,00']);
        expect(texts.map(t => t.getAttribute('data-x'))).toEqual(['2023,0', '2023,0']);
        expect(texts[0].getAttribute('data-g')).toBe('25%');

        // the default of the locale, dates
        const dates = lineDef();
        dates.dims.x = { column: 'date', type: 'date', scale: { type: 'time' } };
        delete dates.dims.y.hover.format;
        dates.marks = { type: 'text', by: 'c', text: '@y:formatted', 'data-d': '@x:formatted', 'data-m': "=format(@x, '%b %Y')" };
        const other = await mount({ def: dates, data: 'date,value,land\n2020-03-15,1234.5,Wien' });
        const text = other.querySelector('g.vis-mark text');
        expect([text.textContent, text.getAttribute('data-d'), text.getAttribute('data-m')]).toEqual(['1234,5', '15.03.2020', 'Mrz 2020']);
        expect(errors).toEqual([]);
    });
});

describe('horizontal bars and several value axes', () => {
    const barDef = () => {
        const def = lineDef();
        def.dims.x = { column: 'value', type: 'numeric', zero: true, pad: 0, hover: { format: '.1f' } };
        def.dims.y = { column: 'year', type: 'categorical', reverse: true };
        def.marks = { type: 'bar', by: 'c', stack: true, highlight: { mode: 'row', stroke: 'black' } };
        return def;
    };

    test('stacked horizontal bars, the hover of a row of bars', async () => {
        const el = await mount({ def: barDef(), data: lineData });
        // 2023: Wien 4, Tirol 2, stacked from 0 to 6 of the width 550
        const bars = [...el.querySelectorAll('g.vis-mark rect')].filter(r => r.getAttribute('fill') && r[itemOf]);
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
        expect(highlighted(el, 'rect')).toHaveLength(1);
        const line = el.querySelector('.vis-hover-marker line');
        expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
        expect(el.querySelector('.vis-hover').style.transform).toContain('-50%');
        expect(errors).toEqual([]);
    });

    test('of two vertical axes the one with a hover, the other values with a hover are columns', async () => {
        const def = lineDef();
        def.dims.y2 = { column: 'other', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'right' } };
        def.marks.push({ type: 'point', by: 'c', y: 'y2', r: 2 });
        // only the dims with a hover of their own
        def.hover = { columns: [] };
        const values = async def => {
            const el = await mount({ def, data: lineData });
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
            await nextTick();
            return [...el.querySelectorAll('.vis-hover tr')].map(tr => [...tr.cells].filter(td => !td.classList.contains('vis-swatch')).map(td => td.textContent));
        };
        expect(await values(def)).toEqual([['Tirol', '2,0'], ['Wien', '1,0']]);
        def.dims.y2.hover = { format: '.0f' };
        // two values: a row of their names above
        expect(await values(def)).toEqual([['', 'y', 'y2'], ['Tirol', '2,0', '20'], ['Wien', '1,0', '10']]);
    });
});

describe('transforms', () => {
    test('an index of the base year of a slider, the values of the hover and the csv', async () => {
        const def = lineDef();
        def.globals = { base: '2020' };
        def.transform = { type: 'index', column: 'value', as: 'index', by: 'land', base: { year: '{base}' } };
        def.dims.y.column = 'index';
        def.controls = [{ type: 'slider', global: 'base', name: 'Basis', values: { column: 'year' } }];
        const el = await mount({ def, data: lineData, csv: true });
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
        // the export is loaded with the first one
        await vi.waitFor(() => expect(blobs).toHaveLength(1));
        const csv = await blobs[0].text();
        expect(csv.split('\n').slice(0, 3)).toEqual(['year,index,land', '2020,33.33333333333333,Wien', '2021,,Wien']);
        saved.mockRestore();
        expect(errors).toEqual([]);
    });

    test('a calc and a filter of globals are computed again if a global changes', async () => {
        const values = (global, list) => ({ type: 'radio', global, name: global, values: list });
        const def = {
            width: 600, height: 300,
            globals: { min: '0', f: '1' },
            transform: [{ type: 'calc', as: 'w', expr: '@v * @f' }, { type: 'filter', expr: '@v > @min' }],
            controls: [values('min', ['0', '2']), values('f', ['1', '100'])],
            dims: { x: 'x', y: 'w' },
            marks: { type: 'point', 'data-w': '@y' },
        };
        const data = [{ x: '1', v: '1' }, { x: '2', v: '2' }, { x: '3', v: '3' }];
        const { el, vis } = await mountVis({ def, data });
        const shown = () => [...el.querySelectorAll('.vis-mark circle')].map(c => c.getAttribute('data-w'));
        expect(shown()).toEqual(['1', '2', '3']);
        const radios = el.querySelectorAll('input[type=radio]');
        radios[1].click();
        await nextTick();
        expect(shown()).toEqual(['3']);
        radios[3].click();
        await nextTick();
        expect(shown()).toEqual(['300']);
        vis.update({ globals: { min: '0', f: '1' } });
        await nextTick();
        expect(shown()).toEqual(['1', '2', '3']);
        expect(errors).toEqual([]);
    });
});

describe('legend symbols at the middle of the capitals of the name', () => {
    // measured in Chromium (13, 20 and 8 pixels of names, boxes of 6 to 30
    // pixels): the middle of each box within 0.4 pixels of the middle of the
    // capitals, in the DOM and in the SVG export (the same positions)
    test('the box of each size moved by half its height below the middle, of a category and of "auto" of marks of rows', async () => {
        const def = lineDef();
        def.dims.c.legend = { symbol: { type: 'line', width: 24, height: 8 } };
        def.dims.c.categories.Tirol = { color: 'blue', symbol: { type: 'rect', size: 30 } };
        let el = await mount({ def, data: lineData });
        const aligns = () => [...el.querySelectorAll('.vis-legend-entry > svg')].map(s => [s.getAttribute('width'), s.getAttribute('height'), s.style.verticalAlign]);
        expect(aligns()).toEqual([['24', '8', 'calc(var(--gen-vis-legend-symbol-middle, 0.36em) - 4px)'], ['30', '30', 'calc(var(--gen-vis-legend-symbol-middle, 0.36em) - 15px)']]);
        // "auto" of marks without the categories in `by`, e.g. of the values of the rows: a box
        def.dims.c.legend = { symbol: 'auto' };
        delete def.dims.c.categories.Tirol.symbol;
        def.marks = [{ type: 'point', r: 2, fill: "=match(@c, {Wien: 'red'}, 'blue')" }];
        el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('.vis-legend-entry > svg > *')].map(s => s.tagName)).toEqual(['rect', 'rect']);
        expect(aligns()[0][2]).toBe('calc(var(--gen-vis-legend-symbol-middle, 0.36em) - 8px)');
        expect(errors).toEqual([]);
    });
});

describe('the order and the ranks of categories', () => {
    test('a symbol of a legend by its shortcut', async () => {
        const def = lineDef();
        def.dims.c.legend = { symbol: 'line' };
        def.dims.c.categories.Tirol = { color: 'blue', 'stroke-dasharray': '2 2' };
        const el = await mount({ def, data: lineData });
        const lines = [...el.querySelectorAll('.vis-legend-entry svg line')];
        expect(lines.map(l => [l.getAttribute('stroke'), l.getAttribute('stroke-width'), l.getAttribute('stroke-dasharray')])).toEqual([['red', '2', null], ['blue', '2', '2 2']]);
        expect(el.querySelector('.vis-legend-entry svg').getAttribute('width')).toBe('16');
    });

    test('a symbol of a category, the box of a width and a height', async () => {
        const def = lineDef();
        def.dims.c.legend = { symbol: { type: 'line', width: 24, height: 12 } };
        def.dims.c.categories.Tirol = { color: 'blue', symbol: 'rect' };
        const el = await mount({ def, data: lineData });
        const svgs = [...el.querySelectorAll('.vis-legend-entry svg')];
        expect(svgs.map(e => [e.getAttribute('width'), e.getAttribute('height'), e.firstElementChild.tagName])).toEqual([['24', '12', 'line'], ['16', '16', 'rect']]);
        expect(svgs[1].firstElementChild.getAttribute('fill')).toBe('blue');
    });


    test('the newest year first and red, in the legend, the stacks and the facets', async () => {
        const def = lineDef();
        def.dims.c = { column: 'year', type: 'categorical', legend: {}, hover: {}, fromData: true, order: 'descending', ranks: [{ color: 'red' }, { color: 'orange' }, { color: 'grey' }] };
        def.dims.x = { column: 'land', type: 'categorical', scale: { type: 'band' } };
        def.dims.f = { column: 'year', type: 'categorical', fromData: true, order: 'descending' };
        def.facets = { by: 'f', cols: 4 };
        def.marks = { type: 'bar', by: 'c', stack: true };
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key)).toEqual(['2023', '2022', '2021', '2020']);
        expect([...el.querySelectorAll('.vis-facet-title')].map(e => e.textContent)).toEqual(['2023', '2022', '2021', '2020']);
        expect([...el.querySelectorAll('svg.vis-svg')[0].querySelectorAll('rect[fill]')].map(r => r.getAttribute('fill'))).toEqual(['red', 'red']);
        expect([...el.querySelectorAll('svg.vis-svg')[3].querySelectorAll('rect[fill]')].map(r => r.getAttribute('fill'))).toEqual(['grey', 'grey']);
        expect(errors).toEqual([]);
    });
});

// the svg of a chart without the ids of its page, e.g. to compare it with a new one
const svgHtml = el => el.querySelector('svg.vis-svg').outerHTML.replace(/gen-vis-facet-\d+/g, 'gen-vis-facet-N');

describe('the update of the facets', () => {
    const toggle = async (el, key) => {
        el.querySelector(`.vis-legend-entry[data-key="${key}"]`).click();
        await nextTick();
    };

    test('a toggle draws into the elements of the draw before', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
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
        expect([...el.querySelectorAll('g.mark-1 g.vis-group')].map(g => g.dataset.groupC)).toEqual(['Wien', 'Tirol']);
        const fresh = await mount({ def: lineDef(), data: lineData });
        expect(svgHtml(el)).toBe(svgHtml(fresh));
        expect(errors).toEqual([]);
    });

    test('the elements of a mark type without update are drawn anew', async () => {
        registerMarkType('test:append', {
            marks: groups => ({ element: 'rect', items: groups.flatMap(g => g.rows.filter(g.complete).map(row => ({ x: g.at(row).x }))) }),
        });
        const def = lineDef();
        def.marks = { type: 'test:append', by: 'c', x: '@x:scaled' };
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark rect')).toHaveLength(8);
        await toggle(el, 'Tirol');
        expect(el.querySelectorAll('g.vis-mark rect')).toHaveLength(4);
        await toggle(el, 'Tirol');
        expect(el.querySelectorAll('g.vis-mark rect')).toHaveLength(8);
        delete markTypes['test:append'];
    });

    // jsdom has no transforms of svg, d3 interpolates the translations of the ticks of axes by them
    const svgTransforms = () => {
        Object.defineProperty(SVGElement.prototype, 'transform', { configurable: true, get() {
            const [x = 0, y = 0] = (this.getAttribute('transform')?.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
            return { baseVal: { consolidate: () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y } }) } };
        } });
        onTestFinished(() => delete SVGElement.prototype.transform);
    };

    test('a transition moves the elements of a change, its end is the one of a new chart', async () => {
        svgTransforms();
        const el = await mount({ def: lineDef({ transition: 80 }), data: lineData });
        const circle = el.querySelector('g.vis-group[data-group-c="Tirol"] circle');
        const line = el.querySelector('path[data-group-c="Tirol"]');
        const [cy, d] = [circle.getAttribute('cy'), line.getAttribute('d')];
        await toggle(el, 'Wien');
        // the elements of the draw before, not moved yet
        expect(el.querySelector('g.vis-group[data-group-c="Tirol"] circle')).toBe(circle);
        expect(circle.getAttribute('cy')).toBe(cy);
        expect(line.getAttribute('d')).toBe(d);
        await vi.waitFor(() => expect(circle.getAttribute('cy')).not.toBe(cy), { timeout: 2000, interval: 5 });
        await new Promise(resolve => setTimeout(resolve, 250));
        const fresh = await mount({ def: lineDef(), data: lineData, state: { visible: { c: { Wien: false } } } });
        // the end values of the animations are the ones of a draw without one
        expect(svgHtml(el)).toBe(svgHtml(fresh));
        expect(errors).toEqual([]);
    });

    test('a line of another number of points is set at once, its path does not move to other commands', async () => {
        svgTransforms();
        const def = transition => ({ transition, globals: { from: 2020 }, filter: '=@x >= @from',
            dims: { x: { column: 'year', type: 'numeric' }, y: 'value', c: 'land' }, marks: [{ type: 'line', by: 'c' }] });
        const { el, vis } = await mountVis({ def: def(80), data: lineData });
        const line = el.querySelector('path[data-group-c="Tirol"]');
        const points = d => d.match(/[ML]/g).length;
        expect(points(line.getAttribute('d'))).toBe(4);
        vis.update({ globals: { from: 2021 } });
        await nextTick();
        expect(el.querySelector('path[data-group-c="Tirol"]')).toBe(line);
        const fresh = await mount({ def: def(0), data: lineData, globals: { from: 2021 } });
        expect(points(line.getAttribute('d'))).toBe(3);
        expect(line.getAttribute('d')).toBe(fresh.querySelector('path[data-group-c="Tirol"]').getAttribute('d'));
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(errors).toEqual([]);
    });

    test('a highlight during a transition keeps the values of its end', async () => {
        svgTransforms();
        const def = lineDef({ transition: 80 });
        def.marks[1].highlight = { cy: 5 };
        const el = await mount({ def, data: lineData });
        await toggle(el, 'Wien');
        const tirol = el.querySelector('.vis-legend-entry[data-key="Tirol"]');
        tirol.dispatchEvent(pointer('pointerenter'));
        await new Promise(resolve => setTimeout(resolve, 250));
        // the highlight is a class, the transition of the attribute goes on
        expect(highlighted(el, 'g.vis-group[data-group-c="Tirol"] circle').length).toBeGreaterThan(0);
        tirol.dispatchEvent(pointer('pointerleave'));
        const fresh = await mount({ def: lineDef(), data: lineData, state: { visible: { c: { Wien: false } } } });
        const cys = el => [...el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')].map(c => c.getAttribute('cy'));
        expect(cys(el)).toEqual(cys(fresh));
        expect(errors).toEqual([]);
    });

    test('a new width moves the marks before they are drawn, e.g. the center of a polar chart', async () => {
        const seen = [];
        registerMarkType('test:origin', { marks: (groups, mark, ctx) => { seen.push(ctx.inner.getAttribute('transform')); return null; } });
        onTestFinished(() => delete markTypes['test:origin']);
        const def = lineDef({ coord: 'polar', width: undefined, margins: { top: 0, right: 0, bottom: 0, left: 0 } });
        def.dims.x = { column: 'year', type: 'numeric', axis: false };
        def.dims.y = { column: 'value', type: 'numeric', axis: false, hover: { format: ',.1f' } };
        def.marks = { type: 'test:origin' };
        const el = await mount({ def, data: lineData });
        expect(seen).toEqual(['translate(400 150)']);
        const measure = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });
        onTestFinished(() => Element.prototype.getBoundingClientRect = measure);
        resize();
        await new Promise(resolve => setTimeout(resolve, 150));
        await nextTick();
        expect(seen).toEqual(['translate(400 150)', 'translate(300 150)']);
    });

    test('the width of the ResizeObserver is the one of the chart, it is not measured again', async () => {
        const def = lineDef({ width: undefined });
        const { el } = await mountVis({ def, data: lineData });
        const svg = () => el.querySelector('svg.vis-svg').getAttribute('width');
        expect(svg()).toBe('800');
        const measure = Element.prototype.getBoundingClientRect;
        const measured = [];
        Element.prototype.getBoundingClientRect = function () {
            measured.push(this);
            return measure.call(this);
        };
        onTestFinished(() => Element.prototype.getBoundingClientRect = measure);
        resize(500);
        await new Promise(resolve => setTimeout(resolve, 150));
        await nextTick();
        expect(svg()).toBe('500');
        expect(measured).not.toContain(el.querySelector('.vis'));
    });

    test('the built-in mark types update their elements, the annotations are drawn anew', () => {
        const types = Object.entries(markTypes).filter(([, t]) => !t.update).map(([n]) => n);
        expect(types).toEqual(['annotation:band', 'annotation:line', 'annotation:text', 'annotation:circle']);
    });

    test('an open hover shows the rows of the new draw, e.g. of a toggle by the keyboard', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(2);
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(1);
        expect(el.querySelector('.vis-hover td:not(.vis-swatch)').textContent).toBe('Wien');
    });
});

describe('extensions', () => {
    test('a registered mark type', async () => {
        registerMarkType('test:square', {
            marks: (groups, mark, ctx) => perRow(groups, 'rect', v => ({
                ...v, x: v.cx - 2, width: 4, height: ctx.innerHeight,
            })),
        });
        const def = lineDef();
        def.marks = { type: 'test:square', by: 'c', cx: '@x:scaled', fill: '@color' };
        const el = await mount({ def, data: lineData });
        const rects = el.querySelectorAll('g.vis-mark rect');
        expect(rects).toHaveLength(8);
        expect(rects[0].getAttribute('height')).toBe('250');
        expect(rects[0].getAttribute('fill')).toBe('red');
        expect(await hover(el)).toBe(2);
        expect(errors).toEqual([]);
        delete markTypes['test:square'];
    });

    test('the groups of a mark type, the values of the attributes are plain values', async () => {
        let seen;
        registerMarkType('test:groups', { marks: (groups, mark, ctx) => { seen = { groups, ctx }; return null; } });
        const def = lineDef();
        def.marks = { type: 'test:groups', by: 'c', stroke: '@color', width: '=@innerWidth * 0.1', d: { x: '@x:scaled', y: '@y' } };
        await mount({ def, data: lineData });
        const [wien, tirol] = seen.groups;
        expect(wien.categories).toEqual({ c: 'Wien' });
        expect(wien.props).toMatchObject({ color: 'red', name: 'Wien', visible: true });
        expect(wien.rows.map(r => r.x)).toEqual([2020, 2021, 2022, 2023]);
        // the values which are the same for all rows, and the ones of a row
        expect(wien.attrs).toEqual({ stroke: 'red', width: 55 });
        const x = seen.ctx.scales.x;
        expect(tirol.at(tirol.rows[0])).toEqual({ stroke: 'blue', width: 55, d: { x: x(2020), y: 2 } });
        expect(tirol.prop('d')(tirol.rows[3])).toEqual({ x: x(2023), y: 2 });
        // a missing value of a dim of the attributes, e.g. a point is not drawn
        expect(wien.rows.map(wien.complete)).toEqual([true, false, true, true]);
        expect(Object.keys(seen.ctx)).toEqual(expect.arrayContaining(['store', 'inner', 'rows', 'scales', 'axis', 'scope', 'innerWidth', 'innerHeight']));
        expect(seen.ctx.scales.x.domain()).toEqual([2019.94, 2023.06]);
        delete markTypes['test:groups'];
    });

    test('an unknown coordinate system is an error', async () => {
        const el = await mount({ def: lineDef({ coord: 'spherical' }), data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe(`coord: unknown coordinate system 'spherical', expected one of 'cartesian', 'polar', 'geo'`);
    });

    test('scales without orientation and range, e.g. of colors', async () => {
        const def = lineDef();
        def.dims.v = { column: 'other', type: 'numeric', domain: [0, 40], scale: { type: 'linear' } };
        def.dims.col = { column: 'other', type: 'numeric', domain: [0, 40], range: ['white', 'red'], scale: { type: 'linear' } };
        def.marks = { type: 'point', r: 'v', fill: 'col' };
        const el = await mount({ def, data: lineData });
        const circles = [...el.querySelectorAll('g.vis-mark circle')];
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
        def.dims.x = { column: 'month', type: 'numeric', domain: [0, 12], grid: true, axis: { values: [0, 3, 6, 9, 12] } };
        def.dims.y = { column: 'value', type: 'numeric', domain: [0, 12], ticks: 3, grid: true, hover: {} };
        def.marks = [{ type: 'line', by: 'c', curve: 'linearClosed' }, { type: 'point', by: 'c' }];
        return def;
    };
    const num = (e, a) => parseFloat(e.getAttribute(a));

    test('lines and points around the center of the facet', async () => {
        const el = await mount({ def: polarDef(), data: polarData });
        // inner size 300, the radius is 150
        expect(el.querySelector('svg.vis-svg > g').getAttribute('transform')).toBe('translate(200 200)');
        expect(el.querySelectorAll('g.vis-mark.mark-0 path')).toHaveLength(2);
        expect(el.querySelector('g.vis-mark.mark-0 path').getAttribute('d')).toMatch(/Z$/);

        // month 3 of Tirol (radius 2 of 12) is on the right of the center
        const circles = [...el.querySelectorAll('g.vis-mark.mark-1 g.vis-group[data-group-c="Tirol"] circle')];
        expect(circles).toHaveLength(12);
        expect(num(circles[3], 'cx')).toBeCloseTo(25);
        expect(num(circles[3], 'cy')).toBeCloseTo(0);
        expect(errors).toEqual([]);
    });

    test('texts at the angle and the radius, with a halo', async () => {
        const def = polarDef();
        def.marks[1] = { type: 'text', by: 'c', halo: true, filter: { x: 3 }, text: '@name' };
        const el = await mount({ def, data: polarData });
        const texts = [...el.querySelectorAll('g.vis-mark.mark-1 text')];
        expect(texts.map(t => [t.textContent, Math.round(num(t, 'x')), Math.round(num(t, 'y'))])).toEqual([['Wien', 50], ['Tirol', 25]].map(([n, x]) => [n, x, 0]));
        expect(texts[0].getAttribute('stroke-width')).toBe('3');
        expect(errors).toEqual([]);
    });

    test('texts of the same angle moved apart along the radius', async () => {
        const def = polarDef();
        def.marks[1] = { type: 'text', by: 'c', dodge: 20, filter: { x: [2, 3] }, text: '@name' };
        // month 2: Wien 3, Tirol 2 (radii 37.5 and 25), month 3: Wien 4 (50), Tirol 2 (25)
        const el = await mount({ def, data: polarData });
        const at = month => [...el.querySelectorAll('g.vis-mark.mark-1 text')].filter(t => t[itemOf][rowOf].x == month)
            .map(t => Math.hypot(num(t, 'x'), num(t, 'y')));
        expect(at(2).map(Math.round)).toEqual([41, 21]);
        expect(at(3).map(Math.round)).toEqual([50, 25]);
        // on the right, month 3 at its angle
        const right = [...el.querySelectorAll('g.vis-mark.mark-1 text')].filter(t => Math.abs(num(t, 'y')) < 1e-6);
        expect(right).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('the axes, the end of the cycle is not a tick of its own', async () => {
        const el = await mount({ def: polarDef(), data: polarData });
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
        // above the marks
        expect(el.querySelector('svg.vis-svg > g').lastElementChild.previousElementSibling.getAttribute('class')).toMatch(/vis-axis-radial/);
    });

    test('labels along the circle, at the ticks or between them, the lower ones not upside down', async () => {
        const def = polarDef();
        def.dims.x.axis.labels = { curved: true, props: { 'font-weight': 'bold' } };
        let el = await mount({ def, data: polarData });
        const ticks = () => [...el.querySelectorAll('g.vis-axis-angular g.tick')];
        // 0 at the top, 3 on the right, 6 at the bottom, 9 on the left
        expect(ticks().map(t => t.querySelector('textPath').textContent)).toEqual(['0', '3', '6', '9']);
        const paths = ticks().map(t => t.querySelector('path'));
        const ids = paths.map(p => p.id);
        expect(new Set(ids).size).toBe(4);
        expect(ids[0]).toMatch(/^gen-vis-facet-\d+-x-0$/);
        ticks().forEach((t, i) => expect(t.querySelector('textPath').getAttribute('href')).toBe(`#${ids[i]}`));
        expect(ticks()[0].querySelector('text').getAttribute('font-weight')).toBe('bold');
        // the path through the tick, outside of the circle (150 + 6 + the padding)
        const middle = d => d.match(/A[^A]* (-?[\d.e-]+),(-?[\d.e-]+)A/).slice(1).map(Number);
        expect(middle(paths[0].getAttribute('d'))[0]).toBeCloseTo(0);
        expect(middle(paths[0].getAttribute('d'))[1]).toBeLessThan(-150);
        expect(middle(paths[1].getAttribute('d'))[0]).toBeGreaterThan(150);
        // clockwise at the top, counterclockwise at the bottom, the text below the path
        expect(paths[0].getAttribute('d')).toMatch(/0 0,1 /);
        expect(paths[2].getAttribute('d')).toMatch(/0 0,0 /);
        expect(ticks().map(t => t.querySelector('text').getAttribute('dominant-baseline'))).toEqual(['auto', 'auto', 'hanging', 'auto']);

        // between the tick and the next one: 0 at 1.5 of 12 (upper right), 9 at 10.5 (upper left)
        def.dims.x.axis.labels = { curved: 'between' };
        el = await mount({ def, data: polarData });
        const [x0, y0] = middle(ticks()[0].querySelector('path').getAttribute('d'));
        const [x9, y9] = middle(ticks()[3].querySelector('path').getAttribute('d'));
        expect(Math.atan2(x0, -y0)).toBeCloseTo(Math.PI/4);
        expect(Math.atan2(x9, -y9)).toBeCloseTo(-Math.PI/4);
        expect(errors).toEqual([]);
    });

    test('polygons as grid lines', async () => {
        const def = polarDef();
        def.dims.y.axis = { gridShape: 'polygon' };
        const el = await mount({ def, data: polarData });
        const grid = [...el.querySelectorAll('g.vis-grid path')];
        expect(grid.length).toBeGreaterThan(1);
        // through the 4 ticks of the angle
        expect(grid[1].getAttribute('d').match(/L/g)).toHaveLength(3);
    });

    test('the hover takes the nearest angle, also across the top', async () => {
        const el = await mount({ def: polarDef(), data: polarData });
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

    test('the hover beside the center or on it, side center', async () => {
        const def = polarDef();
        const shown = async def => {
            const el = await mount({ def, data: polarData });
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 0 }));
            await nextTick();
            return el.querySelector('.vis-hover');
        };
        // 3 on the right, the hover left of the center
        expect((await shown(def)).style.transform).toBe('translate(-100%, -50%)');
        def.hover = { side: 'center' };
        const hover = await shown(def);
        expect([hover.style.left, hover.style.transform]).toEqual(['0px', 'translate(-50%, -50%)']);
        expect(hover.parentElement.style.transform).toBe('translate(200px, 200px)');
        expect(errors).toEqual([]);
    });

    test('stacked arcs of a band scale', async () => {
        const def = polarDef();
        def.dims.x = { column: 'month', type: 'categorical', scale: { type: 'band' } };
        def.dims.y.domain = [0, null];
        def.marks = { type: 'arc', by: 'c', stack: true };
        const el = await mount({ def, data: polarData });
        const arcs = el.querySelectorAll('g.vis-mark path');
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

    test('pies and donuts: arcs of stacked angles, the hover of the slice under the pointer', async () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.dims = {
            share: { column: 'share', type: 'numeric', scale: { orientation: 'angular' }, hover: { format: '.0f' } },
            c: { column: 'c', type: 'categorical', legend: {}, hover: {}, categories: { A: 'red', B: 'blue', C: 'green' } },
        };
        def.marks = { type: 'arc', by: 'c', x: 'share', stack: true, innerRadius: 50, highlight: { stroke: 'black' } };
        const data = 'c,share\nA,1\nB,2\nC,1';
        const el = await mount({ def, data });
        const arcs = [...el.querySelectorAll('g.vis-mark path')];
        expect(arcs).toHaveLength(3);
        // the whole circle, A from the top to the right, B to the left, C to the top
        const { arc } = await import('d3-shape');
        const slice = (a0, a1) => arc()({ startAngle: a0*Math.PI, endAngle: a1*Math.PI, innerRadius: 50, outerRadius: 150 });
        expect(arcs.map(a => a.getAttribute('d'))).toEqual([slice(0, 0.5), slice(0.5, 1.5), slice(1.5, 2)]);

        // the pointer relative to the center, jsdom has no transforms
        const events = el.querySelector('rect.vis-events');
        const at = async (x, y) => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
            await nextTick();
            return el.querySelector('.vis-hover .vis-nearest')?.textContent ?? null;
        };
        expect(await at(-100, 10)).toBe('B2');
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(3);
        expect(highlighted(el, 'path').map(p => p.getAttribute('fill'))).toEqual(['blue']);
        expect(highlightCss(el)).toContain('.vis-highlight *:not(g) { stroke: black; }');
        expect(await at(-30, -100)).toBe('C1');
        // outside of the circle
        expect(await at(160, 0)).toBeNull();
        expect(el.querySelector('.vis-hover')).toBeNull();

        // a ring per year, the slices of the ring under the pointer
        def.dims.year = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'radial', padding: 0 } };
        def.marks = { ...def.marks, innerRadius: '@year:scaled', outerRadius: '@year:group:end' };
        const rings = await mount({ def, data: 'c,share,year\nA,1,2023\nB,1,2023\nA,1,2024\nB,3,2024' });
        // the rings from the center, of 75 pixels, stacked per year, the circle
        // is the largest sum (a share of every year closes every ring)
        // the arcs of A, then the ones of B, of the years in their order
        const ringArcs = [...rings.querySelectorAll('g.vis-mark path')];
        expect(ringArcs.map(a => a.getAttribute('d'))).toEqual([
            arc()({ startAngle: 0, endAngle: Math.PI/2, innerRadius: 0, outerRadius: 75 }),
            arc()({ startAngle: 0, endAngle: Math.PI/2, innerRadius: 75, outerRadius: 150 }),
            arc()({ startAngle: Math.PI/2, endAngle: Math.PI, innerRadius: 0, outerRadius: 75 }),
            arc()({ startAngle: Math.PI/2, endAngle: 2*Math.PI, innerRadius: 75, outerRadius: 150 }),
        ]);
        const ringEvents = rings.querySelector('rect.vis-events');
        ringEvents.dispatchEvent(pointer('pointermove', { clientX: -40, clientY: 10 }));
        await nextTick();
        expect(rings.querySelector('.vis-hover-title').textContent).toBe('2023');
        expect(rings.querySelector('.vis-hover .vis-nearest').textContent).toBe('B1');
        ringEvents.dispatchEvent(pointer('pointermove', { clientX: -120, clientY: 10 }));
        await nextTick();
        expect(rings.querySelector('.vis-hover-title').textContent).toBe('2024');
        expect(rings.querySelector('.vis-hover .vis-nearest').textContent).toBe('B3');
        expect(errors).toEqual([]);
    });

    test('cartesian mark types are not available', async () => {
        const def = polarDef();
        def.marks = { type: 'cartesian:bar', by: 'c' };
        const el = await mount({ def, data: polarData });
        expect(el.querySelector('.vis-error').textContent).toBe("marks[0].type: the mark type 'cartesian:bar' is not available in the coordinate system 'polar'");
    });
});

describe('scales', () => {
    test('dates of a fixed domain', async () => {
        const def = lineDef();
        def.dims.x = { column: 'date', type: 'date', domain: ['2020-01-01', '2021-01-01'], scale: { type: 'utc' }, axis: { format: '%b' } };
        const el = await mount({ def, data: 'date,value,land\n2020-03-01,1,Wien\n2020-06-01,2,Wien' });
        const labels = [...el.querySelectorAll('g.vis-axis-bottom g.tick text')].map(t => t.textContent);
        expect(labels[0]).toBe('Jan');
        expect(labels.at(-1)).toBe('Jan');
        expect(errors).toEqual([]);
    });

    test('the extension of a log domain is relative to its positions', async () => {
        const def = lineDef();
        // the values from 1 to 4, linear 10% of 3 would be 0.7 and 4.3
        def.dims.y = { column: 'value', type: 'numeric', pad: 0.1, scale: { type: 'log' }, axis: { format: ',.0f', values: [1, 4] }, hover: { format: ',.1f' } };
        const el = await mount({ def, data: lineData });
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
        def.dims.y = { column: 'value', type: 'numeric', tickSpacing: 50, hover: { format: ',.1f' } };
        def.dims.x = { column: 'year', type: 'numeric', tickSpacing: 1000 };
        const data = 'year,value,land\n2000,0,Wien\n2100,100,Wien';
        const el = await mount({ def, data });
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
    // thousands separators of a domain reaching 10 000
    const bigData = 'year,value,land\n2020,10000,Wien\n2021,25000,Wien';

    test('german by default, also the ticks of axes without format', async () => {
        const def = lineDef();
        def.dims.x.axis.format = ',.1f';
        const el = await mount({ def, data: bigData });
        expect(labels(el, 'bottom')).toContain('2.020,0');
        expect(labels(el, 'left')).toContain('20.000');
    });

    test('a built-in locale', async () => {
        const def = lineDef({ locale: 'en' });
        def.dims.x.axis.format = ',.1f';
        const el = await mount({ def, data: bigData });
        expect(labels(el, 'bottom')).toContain('2,020.0');
        expect(labels(el, 'left')).toContain('20,000');
    });

    test('a locale merged into a built-in one', async () => {
        const def = lineDef({ locale: { number: { thousands: ' ' } } });
        const el = await mount({ def, data: bigData });
        expect(labels(el, 'left')).toContain('20 000');
    });

    test('month names of time axes', async () => {
        const def = lineDef();
        def.dims.x = { column: 'date', type: 'date', scale: { type: 'time' } };
        const el = await mount({ def, data: 'date,value,land\n2020-01-15,1,Wien\n2020-05-15,2,Wien' });
        expect(labels(el, 'bottom')).toContain('März');
    });

    test('an unknown locale is an error', async () => {
        const el = await mount({ def: lineDef({ locale: 'xx' }), data: lineData });
        expect(el.querySelector('.vis-error').textContent).toBe(`Unknown locale 'xx', expected one of 'de', 'en' or a language of Intl, e.g. 'fr'`);
    });

    test('a language of Intl, e.g. french', async () => {
        const def = lineDef({ locale: 'fr' });
        def.dims.x = { column: 'date', type: 'date', scale: { type: 'utc' }, axis: { format: '%B' } };
        def.dims.y.axis = { format: ',.1f' };
        const el = await mount({ def, data: 'date,value,land\n2020-01-15,1000,Wien\n2020-05-15,2500,Wien' });
        expect(labels(el, 'bottom')).toContain('mars');
        expect(labels(el, 'left')).toContain('2\u202f000,0');
        const { getLocale, loadLocale } = await import('@/utils/locale');
        // the languages of Intl are loaded before, e.g. by the store
        for (const tag of ['en-US', 'it', 'fa', 'ar-EG'])
            await loadLocale(tag);
        expect(getLocale('fr').number.format('$,.2f')(1234.5)).toBe('1\u202f234,50\u00a0€');
        expect(getLocale('en-US').time.utcFormat('%x')(new Date(Date.UTC(2024, 2, 5)))).toBe('03/05/2024');
        expect(getLocale({ base: 'it', texts: { download: 'Scarica' } }).texts).toMatchObject({ download: 'Scarica', copy: 'Copy as PNG to the clipboard' });
        // the months of the gregorian calendar and the digits of d3, e.g. of Persian and Arabic
        expect(getLocale('fa').time.utcFormat('%B')(new Date(Date.UTC(2024, 0, 15)))).toBe(new Intl.DateTimeFormat('fa', { month: 'long', calendar: 'gregory', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 15)));
        expect(getLocale('ar-EG').number.format(',.1f')(1234.5)).toMatch(/^1.234.5$/);
    });

    test('the currency of the german locale', async () => {
        const { getLocale } = await import('@/utils/locale');
        expect(getLocale().number.format('$,.2f')(1234.5)).toBe('1.234,50 €');
        expect(getLocale('en').number.format('$,.2f')(1234.5)).toBe('$1,234.50');
    });

    test('the values of the hover without format in the locale, years without separators', async () => {
        const def = lineDef();
        delete def.dims.y.hover.format;
        const values = async (data, locale) => {
            const el = await mount({ def: { ...def, locale }, data });
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
        const el = await mount({ def: lineDef({ fontFamily: 'Arial' }), data: lineData });
        expect(el.querySelector('.vis').style.getPropertyValue('--gen-vis-font-family')).toBe('Arial');

        const other = await mount({ def: lineDef(), data: lineData });
        expect(other.querySelector('.vis').style.getPropertyValue('--gen-vis-font-family')).toBe('');
    });
});

describe('touch', () => {
    const touch = (type, init = {}) => pointer(type, { pointerType: 'touch', clientX: 300, clientY: 150, ...init });

    test('a touch shows the hover until the next touch outside', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
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
        const el = await mount({ def: lineDef(), data: lineData });
        const events = el.querySelector('rect.vis-events');
        events.dispatchEvent(touch('pointerdown'));
        await nextTick();
        events.dispatchEvent(touch('pointercancel'));
        await nextTick();
        expect(el.querySelectorAll('.vis-hover tr.vis-hover-entry')).toHaveLength(0);
    });

    test('vertical swipes scroll the page', async () => {
        const el = await mount({ def: lineDef(), data: lineData });
        expect(el.querySelector('rect.vis-events').style.touchAction).toBe('pan-y');
    });

    test('the listener of the document is removed', async () => {
        const remove = vi.spyOn(document, 'removeEventListener');
        const el = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(el, { def: lineDef(), data: lineData });
        await rendered(el);
        vis.destroy();
        expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
});

describe('fixed bugs', () => {
    const stackDef = () => {
        const def = lineDef();
        def.dims.type = { column: 'type', type: 'categorical', categories: { a: {}, b: {} } };
        def.marks = { type: 'bar', by: 'type', stack: true, width: 10, fill: 'red' };
        return def;
    };
    const stackData = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2021,8,Wien,a\n2021,2,Wien,b';
    const rects = el => [...el.querySelectorAll('g.vis-mark rect')].map(r => ['x', 'y', 'width', 'height'].map(a => parseFloat(r.getAttribute(a))));

    test('the defaults of the height, the columns of the facets and the offset of the title of an axis', async () => {
        const def = lineDef();
        delete def.height;
        delete def.dims.x.axis.title.offset;
        def.facets = { by: 'c' };
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('svg.vis-svg')].map(s => [s.getAttribute('width'), s.getAttribute('height')])).toEqual([['600', '400'], ['600', '400']]);
        // 8 pixels above the bottom of the margin of 40
        expect(el.querySelector('.vis-axis-title').getAttribute('transform')).toBe('translate(275 382)');
        expect(errors).toEqual([]);
    });

    test('a definition which can not be drawn is an error of the part', async () => {
        const message = async def => (await mount({ def, data: lineData })).querySelector('.vis-error')?.textContent;
        const def = lineDef();
        def.dims.y.hover = true;
        expect(await message(def)).toBe('dims.y.hover: expected an object, e.g. {}');
        // the facets of a dim which does not exist (of a numeric one its values are the categories)
        expect(await message({ ...lineDef(), facets: { by: 'nope' } })).toBe("facets.by: unknown dim 'nope', the dims are 'x', 'y', 'c'");
        expect(await message({ ...lineDef(), marks: [null] })).toMatch(/^marks\[0\]: expected a mark/);
    });

    test('a legend of a dim of positions, a locale of null', async () => {
        const def = lineDef({ locale: null });
        def.dims.y.legend = {};
        const el = await mount({ def, data: lineData });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(el.querySelectorAll('g.vis-mark path')).toHaveLength(2);
        expect(errors.filter(e => !e.includes('validateDef') && !e.includes('a legend needs'))).toEqual([]);
    });

    test('an entry of a control changes the props of the categories', async () => {
        const def = lineDef();
        def.globals = { colors: 'a' };
        def.controls = [{ type: 'radio', global: 'colors', name: 'Farben', values: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] }];
        def.dims.c.categories.Wien = "=match(@colors, {b: 'green'}, 'red')";
        const el = await mount({ def, data: lineData });
        const fills = () => [...el.querySelectorAll('g.mark-1 g.vis-group')].map(g => [g.dataset.groupC, g.querySelector('circle').getAttribute('fill')]);
        expect(fills()).toEqual([['Wien', 'red'], ['Tirol', 'blue']]);
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').click();
        el.querySelector('.vis-control input[value="b"]').click();
        await nextTick();
        // the color of the entry, the legend keeps its state
        expect(fills()).toEqual([['Wien', 'green']]);
        expect(el.querySelector('.vis-legend-entry[data-key="Tirol"]').dataset.visible).toBe('false');
        expect(errors).toEqual([]);
    });

    test('the categories of the data of another column of a control', async () => {
        const def = lineDef();
        def.globals = { col: 'land' };
        def.dims.c = { column: '{col}', type: 'categorical', legend: {}, hover: {}, fromData: true, scheme: 'Tableau10' };
        def.controls = [{ type: 'radio', global: 'col', name: 'Spalte', values: [{ value: 'land', name: 'Land' }, { value: 'other', name: 'Anderer' }] }];
        const updates = [];
        const el = await mount({ def, data: lineData, 'onUpdate:state': s => updates.push(s) });
        const keys = () => [...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key);
        expect(keys()).toEqual(['Tirol', 'Wien']);
        el.querySelector('.vis-control input[value="other"]').click();
        await nextTick();
        expect(keys()).toEqual(['10', '20', '30', '40']);
        expect(el.querySelectorAll('g.mark-0 path')).toHaveLength(4);
        el.querySelector('.vis-legend-entry[data-key="20"]').click();
        await nextTick();
        expect(updates.at(-1)).toEqual({ globals: { col: 'other' }, visible: { c: { 20: false } } });

        // the state of the other column, also when it is loaded
        const again = await mount({ def, data: lineData, state: updates.at(-1) });
        expect([...again.querySelectorAll('.vis-legend-entry')].map(e => [e.dataset.key, e.dataset.visible]))
            .toEqual([['10', 'true'], ['20', 'false'], ['30', 'true'], ['40', 'true']]);
        expect(errors).toEqual([]);
    });

    test('a legend with onlyData has the categories of the filtered rows, also of a control', async () => {
        const def = lineDef();
        def.globals = { from: 2020 };
        def.filter = '@x >= @from';
        def.dims.c.legend = { onlyData: true };
        def.dims.c.categories.Salzburg = 'green';
        def.controls = [{ type: 'radio', global: 'from', name: 'Ab', values: [{ id: 'a', name: '2020', value: 2020 }, { id: 'b', name: '2023', value: 2023 }] }];
        const data = lineData + '\n2021,5,50,Salzburg';
        const el = await mount({ def, data });
        const keys = () => [...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key);
        expect(keys()).toEqual(['Wien', 'Tirol', 'Salzburg']);
        // a hidden category stays, it has rows
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').click();
        await nextTick();
        expect(keys()).toEqual(['Wien', 'Tirol', 'Salzburg']);
        el.querySelector('.vis-control input[value="b"]').click();
        await nextTick();
        expect(keys()).toEqual(['Wien', 'Tirol']);
        el.querySelector('.vis-control input[value="a"]').click();
        await nextTick();
        expect(keys()).toEqual(['Wien', 'Tirol', 'Salzburg']);

        // without it all categories of the props
        delete def.dims.c.legend.onlyData;
        const all = await mount({ def, data: lineData });
        expect([...all.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key)).toEqual(['Wien', 'Tirol', 'Salzburg']);
        expect(errors).toEqual([]);
    });

    test('null removes a part of a dim, false also an expression of a global', async () => {
        const def = lineDef();
        def.dims.c.hover = null;
        def.dims.y.axis = null;
        let el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-axis')).toHaveLength(1);
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(7);

        const switched = lineDef();
        switched.globals = { mode: 'a' };
        switched.controls = [{ type: 'radio', global: 'mode', name: 'Modus', values: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] }];
        switched.dims.c.legend = '=match(@mode, {b: false}, literal({}))';
        el = await mount({ def: switched, data: lineData });
        el.querySelector('.vis-control input[value="b"]').click();
        await nextTick();
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('a new state resets the entries of the legends of the categories of another column', async () => {
        const def = lineDef();
        def.globals = { col: 'land' };
        def.dims.c = { column: '{col}', type: 'categorical', legend: {}, fromData: true };
        def.controls = [{ type: 'radio', global: 'col', name: 'Spalte', values: [{ value: 'land', name: 'Land' }, { value: 'other', name: 'Anderer' }] }];
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { def, data: lineData });
        await rendered(vm.el);
        vm.store.setState({ globals: { col: 'other' }, visible: { c: { 20: false } } });
        await nextTick();
        expect(vm.store.state).toEqual({ globals: { col: 'other' }, visible: { c: { 20: false } } });
        vm.store.setState({ globals: { col: 'other' } });
        await nextTick();
        expect(vm.store.state).toEqual({ globals: { col: 'other' } });
        expect(vm.el.querySelector('.vis-legend-entry[data-key="20"]').dataset.visible).toBe('true');
    });

    test('the categories of the data of a transform of a global', async () => {
        const def = lineDef();
        def.globals = { date: 'd1' };
        def.transform = { type: 'year', column: '{date}', as: 'yr' };
        def.dims.c = { column: 'yr', type: 'categorical', legend: {}, fromData: true, name: "=match(@date, {d2: 'Jahr'})" };
        def.controls = [{ type: 'radio', global: 'date', name: 'Datum', values: [{ value: 'd1', name: 'D1' }, { value: 'd2', name: 'D2' }] }];
        const data = 'year,value,land,d1,d2\n2020,1,Wien,2020-01-01,2030-01-01\n2021,2,Wien,2021-01-01,2031-01-01';
        const el = await mount({ def, data });
        const keys = () => [...el.querySelectorAll('.vis-legend-entry')].map(e => e.dataset.key);
        expect(keys()).toEqual(['2020', '2021']);
        el.querySelector('.vis-control input[value="d2"]').click();
        await nextTick();
        expect(keys()).toEqual(['2030', '2031']);
        expect(el.querySelectorAll('g.mark-1 circle')).toHaveLength(2);
    });

    test('controls of a definition without globals', async () => {
        const def = lineDef();
        def.controls = [{ type: 'radio', global: 'col', name: 'Wert', values: [{ value: 'value', name: 'Wert' }, { value: 'other', name: 'Anderer' }] }];
        def.dims.y.column = "=match(@col, {other: 'other'}, 'value')";
        const el = await mount({ def, data: lineData });
        el.querySelector('.vis-control input[value="other"]').click();
        await nextTick();
        expect(el.querySelector('.vis-control input[value="other"]').checked).toBe(true);
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the format of a date of the hover without a time scale', async () => {
        const def = lineDef();
        def.dims.d = { column: 'day', type: 'date', hover: { format: '%d.%m.%Y' } };
        const data = lineData.split('\n').map((l, i) => `${l},${i == 0 ? 'day' : '2024-06-01'}`).join('\n');
        const el = await mount({ def, data });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect([...el.querySelectorAll('.vis-hover td[data-dim="d"]')].map(td => td.textContent)).toEqual(['01.06.2024', '01.06.2024']);
        expect(errors).toEqual([]);
    });

    test('fixed values of an axis outside of its domain are not drawn', async () => {
        const def = lineDef();
        // the values are from 1 to 4, d3 drew the others in the margins
        def.dims.x.grid = false;
        def.dims.y = { column: 'value', type: 'numeric', pad: 0, grid: true, scale: { type: 'log' }, axis: { format: ',.0f', values: [0.5, 1, 2, 5, 10] }, hover: { format: ',.1f' } };
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent)).toEqual(['1', '2']);
        expect(el.querySelectorAll('g.vis-grid line')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('the domain of stacks without a fixed domain includes their start', async () => {
        const el = await mount({ def: stackDef(), data: stackData });
        const ticks = [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent);
        expect(ticks[0]).toBe('0');
        // inner height 250
        rects(el).forEach(([x, y, w, h]) => expect(y + h).toBeLessThanOrEqual(250));
    });

    const barDef = () => {
        const def = lineDef();
        def.dims.x = { column: 'year', type: 'categorical', scale: { type: 'band' } };
        def.marks = { type: 'bar', by: 'c' };
        return def;
    };

    test('bars of negative values are drawn downwards from 0', async () => {
        const el = await mount({ def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,-2,Wien' });
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

        const bar = await mount({ def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien' });
        centers(bar).forEach((c, i) => expect(c).toBeCloseTo(ticks(bar)[i]));

        const def = stackDef();
        def.dims.x = barDef().dims.x;
        // the width of the bands by default
        delete def.marks.width;
        const stack = await mount({ def, data: stackData });
        const [x, y, width] = rects(stack)[0];
        expect(x + width/2).toBeCloseTo(ticks(stack)[0]);
        expect(width).toBeGreaterThan(0);
        expect(await hover(stack)).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('the hover lists stacked values in the order of the stack', async () => {
        const def = stackDef();
        def.dims.type.hover = {};
        def.dims.type.categories = { a: {}, b: {}, n: {}, m: {} };
        // a is at the bottom, but larger than b, n and m are below 0
        const data = 'year,value,land,type\n2020,5,Wien,a\n2020,2,Wien,b\n2020,-1,Wien,n\n2020,-3,Wien,m';
        const el = await mount({ def, data });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const names = [...el.querySelectorAll('.vis-hover tr.vis-hover-entry td[data-dim="type"]')].map(t => t.textContent);
        expect(names).toEqual(['b', 'a', 'n', 'm']);
    });

    test('stacks of a continuous scale without width are an error', async () => {
        const def = stackDef();
        delete def.marks.width;
        const el = await mount({ def, data: stackData });
        expect(el.querySelector('.vis-error').textContent).toBe(`marks[0]: the bars of a continuous scale need a 'width' in pixels, e.g. "width": 8, a categorical dim of their position or an "interval" of dates (horizontal bars: "orient": "horizontal" or "type": "categorical" of the dim y, the orientation follows from the dims as the definition declares them, not from the data)`);
    });

    test('the hover of a band scale shows the band under the mouse', async () => {
        const el = await mount({ def: barDef(), data: 'year,value,land\n2020,5,Wien\n2021,2,Wien\n2022,3,Wien' });
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
        def.dims.id = { column: 'land', type: 'categorical' };
        def.marks[0] = { type: 'line', by: 'id', stroke: 'black' };
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark.mark-0 path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('mark ids which are no css classes are highlighted', async () => {
        const def = lineDef();
        def.marks[0].id = '1st line';
        def.marks[0].highlight = { 'stroke-width': 3 };
        const el = await mount({ def, data: lineData });
        expect(await hover(el)).toBe(2);
        el.querySelector('.vis-legend .vis-legend-entries > div').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('path.vis-highlight')).not.toBeNull();
        expect(highlightCss(el)).toContain('[data-mark="1st line"] .vis-highlight *:not(g) { stroke-width: 3; }');
        expect(errors).toEqual([]);
    });

    test('the labels of the controls belong to their radio buttons', async () => {
        const def = lineDef();
        def.globals = { column: 'value' };
        def.controls = [{ type: 'radio', global: 'column', name: 'Wert', values: [{ value: 'value', name: 'Value' }, { value: 'other', name: 'Other' }] }];
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('.vis-control label')).toHaveLength(2);
        el.querySelectorAll('.vis-control label').forEach(l => {
            expect(document.getElementById(l.htmlFor)).toBe(l.previousElementSibling);
        });
    });

    test('categories with quotes are highlighted', async () => {
        const def = lineDef();
        def.dims.c.categories = { "O'Brien": 'red', 'Say "hi"': 'blue' };
        def.marks[0]['stroke-width'] = 1;
        def.marks[0].highlight = { 'stroke-width': 3 };
        const data = lineData.replaceAll('Wien', `O'Brien`).replaceAll('Tirol', '"Say ""hi"""');
        const el = await mount({ def, data });

        const [first, second] = el.querySelectorAll('.vis-legend .vis-legend-entries > div');
        second.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const marked = el.querySelectorAll('g.vis-mark.mark-0 path.vis-highlight');
        expect(marked).toHaveLength(1);
        expect(marked[0].getAttribute('data-group-c')).toBe('Say "hi"');
        expect(highlightCss(el)).toContain('.vis-highlight *:not(g) { stroke-width: 3; }');

        second.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        first.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        expect(el.querySelector('g.vis-mark.mark-0 path.vis-highlight').getAttribute('data-group-c')).toBe(`O'Brien`);
        expect(el.querySelector(`g.vis-mark.mark-0 path[data-group-c='Say "hi"']`).getAttribute('stroke-width')).toBe('1');
        expect(errors).toEqual([]);
    });

    test('stacked facets, the dim is a name', async () => {
        const def = lineDef();
        def.dims.y.stacked = true;
        def.dims.type = { column: 'type', type: 'categorical', categories: { a: {}, b: {} } };
        def.marks = { type: 'point', by: 'type', r: 2, y: '@y:end:scaled' };
        // the name of the dim of the facets has several characters
        def.dims.land = def.dims.c;
        delete def.dims.c;
        def.facets = { by: 'land', cols: 2 };
        const data = 'year,value,land,type\n2020,1,Wien,a\n2020,2,Wien,b\n2020,1,Tirol,a\n2020,2,Tirol,b';
        const el = await mount({ def, data });

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
        def.dims.y.stacked = true;
        def.dims.type = { column: 'type', type: 'categorical', categories: { a: {}, b: {} } };
        def.facets = { by: 'c', cols: 2 };
        def.marks = { type: 'point', by: 'type', r: 2, y: '@y:end:scaled' };
        const data = 'year,value,land,type\n2020,2,Tirol,b\n2020,1,Tirol,a\n2020,2,Wien,b\n2020,1,Wien,a';
        const el = await mount({ def, data });

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
    test('only the source is html, the names are text', async () => {
        const def = lineDef({ title: '<b>Titel</b>', source: '<a href="#q">Quelle</a>' });
        def.dims.c.categories.Wien = { color: 'red', name: '<i>Wien</i> & Umgebung' };
        const el = await mount({ def, data: lineData });
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

    test('the html of the definition runs no script: only the tags, attributes, links and styles of text', async () => {
        const def = lineDef({
            source: '<img src=x onerror="window.pwned=1"><script>window.pwned=2</script><b onclick="window.pwned=3">Quelle</b> '
                + '<a href="javascript:window.pwned=4">a</a> <a href=" JaVa\tScript:x">b</a> <a href="https://example.org" target="_blank" id="x">c</a> '
                + '<a href="mailto:a@b.at">d</a> <a href="data.csv">e</a> <svg><a href="javascript:x">f</a></svg><font color="red">g</font>'
                + '<span style="font-weight: normal; position: fixed; color: red; background-image: url(https://example.org/x.png)">h</span>',
            hover: { title: '<img src=x onerror="window.pwned=5">{title}', row: '<style>body { display: none }</style><em title="t" onmouseover="x">{c}</em>' },
        });
        const el = await mount({ def, data: lineData });
        const footer = el.querySelector('.vis-footer-content span');
        expect(footer.querySelector('img, script, svg, font, [onclick], [id]')).toBeNull();
        expect(footer.textContent).toBe('Quelle a b c d e gh');
        expect([...footer.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual([null, null, 'https://example.org', 'mailto:a@b.at', 'data.csv']);
        expect(footer.querySelector('a[target]').getAttribute('rel')).toBe('noopener');
        const span = footer.querySelector('span');
        expect(span.style.fontWeight).toBe('normal');
        expect(span.style.color).toBe('red');
        expect(span.style.position).toBe('');
        expect(span.getAttribute('style')).not.toContain('url(');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').innerHTML).toBe('2020');
        expect([...el.querySelectorAll('.vis-hover-row')].map(r => r.innerHTML)).toEqual(['<em title="t">Tirol</em>', '<em title="t">Wien</em>']);
        expect(window.pwned).toBeUndefined();
        expect(errors).toEqual([]);
    });

    test('tables and lists of the html of the definition are kept, e.g. a table of the hover', async () => {
        const def = lineDef({
            source: '<ul><li>a</li><li onclick="x">b</li></ul><ol start="3"><li>c</li></ol>',
            hover: { row: '<table class="vis-hover-table"><tr><th scope="row" colspan="1">{c}</th><td style="text-align:right" rowspan="1" onclick="x">{y}</td></tr></table>' },
        });
        const el = await mount({ def, data: lineData });
        expect(el.querySelector('.vis-footer-content span').innerHTML).toBe('<ul><li>a</li><li>b</li></ul><ol start="3"><li>c</li></ol>');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 150 }));
        await nextTick();
        const row = el.querySelector('.vis-hover-row');
        expect(row.querySelectorAll('table.vis-hover-table tr th, table.vis-hover-table tr td')).toHaveLength(2);
        expect(row.querySelector('th').getAttribute('scope')).toBe('row');
        expect(row.querySelector('td').style.textAlign).toBe('right');
        expect(row.querySelector('td').getAttribute('rowspan')).toBe('1');
        expect(row.querySelector('[onclick]')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the footer of the slot is the cleaned html', async () => {
        let given = null;
        await mount({ def: lineDef({ source: '<b onclick="x">Quelle</b><img src=x>' }), data: lineData, slots: { footer: ({ footer }) => { given = footer; return null; } } });
        expect(given).toBe('<b>Quelle</b>');
    });

    test('the props of marks and legends set no handlers and no links of javascript, a symbol has no script', async () => {
        const def = lineDef();
        def.marks[1] = { ...def.marks[1], onclick: 'window.pwned=1', 'xlink:href': 'javascript:x', href: 'javascript:x' };
        def.dims.c.legend = { props: { onmouseover: 'window.pwned=2', title: 'Land' } };
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark circle').length).toBeGreaterThan(0);
        expect(el.querySelector('[onclick], [onmouseover], [href]')).toBeNull();
        expect(el.querySelector('.vis-legend-entry').getAttribute('title')).toBe('Land');
        expect(errors).toEqual([]);

        const symbol = lineDef();
        symbol.dims.c.legend = { symbol: { elements: [{ type: 'script', props: { text: 'window.pwned=3' } }] } };
        const failed = await mount({ def: symbol, data: lineData });
        expect(failed.querySelector('script')).toBeNull();
        expect(failed.querySelector('.vis-error').textContent).toContain('gen-vis does not draw script elements');
        expect(window.pwned).toBeUndefined();
        errors.length = 0;
    });

    test('the props of a highlight are css: other names and unsafe values are left out with a warning', async () => {
        const def = lineDef();
        def.marks[0].highlight = { 'opacity: 1 } body { display: none } x': 1, stroke: 'red /*', 'stroke-width': 3, fill: 'url(https://example.org/x)' };
        def.marks[1].highlight = { fill: 'url(#pattern)', r: 5 };
        const el = await mount({ def, data: lineData });
        const css = highlightCss(el);
        expect(css).not.toContain('body');
        expect(css).not.toContain('/*');
        expect(css).not.toContain('example.org');
        expect(css).toContain('stroke-width: 3');
        expect(css).toContain('fill: url(#pattern); r: 5');
        expect(errors).toHaveLength(3);
        expect(errors[0]).toContain('marks[0].highlight: "opacity: 1 } body { display: none } x" is no name of a property of css');
        expect(errors[1]).toContain('marks[0].highlight.stroke: "red /*" is no value');
        expect(errors[2]).toContain('marks[0].highlight.fill');
        errors.length = 0;
    });

    test('the values of the globals in the footer are text, e.g. of the data', async () => {
        const def = lineDef({ source: '<b>Land</b>: {land}' });
        def.controls = [{ type: 'select', global: 'land', name: 'Land', values: { column: 'land' } }];
        const data = `${lineData}\n2020,5,1,<img src=x onerror=alert(1)>`;
        const el = await mount({ def, data, state: { globals: { land: '<img src=x onerror=alert(1)>' } } });
        const footer = el.querySelector('.vis-footer-content span');
        expect(footer.querySelector('b').textContent).toBe('Land');
        expect(footer.querySelector('img')).toBeNull();
        expect(footer.textContent).toBe('Land: <img src=x onerror=alert(1)>');
    });

    test('the ids of the elements are unique, also of charts with the same controls', async () => {
        const def = lineDef();
        def.globals = { col: 'value' };
        def.controls = [{ type: 'radio', global: 'col', name: 'Wert', values: [{ value: 'value', name: 'Wert' }, { value: 'other', name: 'Anderer' }] }];
        def.dims.y.column = "=match(@col, {other: 'other'}, 'value')";
        await mount({ def, data: lineData });
        await mount({ def, data: lineData });
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...document.querySelectorAll('.vis-control')].map(e => e.dataset.id)).toEqual(['col', 'col']);
        expect([...document.querySelectorAll('.vis-radio > div')].map(e => e.dataset.id)).toEqual(['value', 'other', 'value', 'other']);
    });

    test('the svg is an application of the keys named by the title and the facet, the controls have labels', async () => {
        const def = { ...lineDef({ title: 'Bevölkerung {unit}' }), globals: { unit: 'Personen', year: 'a' }, facets: { by: 'c', cols: 2 } };
        def.controls = [
            { type: 'select', global: 'year', name: 'Jahr', values: [{ value: 'a', name: 'A' }] },
            { type: 'radio', global: 'unit', name: 'Einheit', values: [{ id: 'p', name: 'Personen', value: 'Personen' }] },
        ];
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('svg.vis-svg')].map(s => [s.getAttribute('role'), s.getAttribute('aria-label'), s.getAttribute('aria-roledescription')]))
            .toEqual([['application', 'Bevölkerung Personen: Wien', 'Diagramm'], ['application', 'Bevölkerung Personen: Tirol', 'Diagramm']]);
        // the description of the keys, of the language of the locale
        const svg = el.querySelector('svg.vis-svg');
        expect(document.getElementById(svg.getAttribute('aria-describedby')).textContent).toMatch(/^Die Pfeiltasten/);
        // without a hover an image
        def.dims.y.scale = { orientation: null };
        def.dims.y.axis = false;
        delete def.dims.y.ticks;
        const image = await mount({ def, data: lineData });
        expect(image.querySelector('svg.vis-svg').getAttribute('role')).toBe('img');
        expect(image.querySelector('svg.vis-svg').hasAttribute('aria-describedby')).toBe(false);
        const [select, radio] = el.querySelectorAll('.vis-control');
        expect(select.querySelector('label').getAttribute('for')).toBe(select.querySelector('select').id);
        const group = radio.querySelector('[role="radiogroup"]');
        expect(radio.querySelector(`#${group.getAttribute('aria-labelledby')}`).textContent).toBe('Einheit:');
    });

    test('the rows shown as CSV, in the columns of the dims', async () => {
        const saved = {};
        URL.createObjectURL = blob => { saved.blob = blob; return 'blob:csv'; };
        URL.revokeObjectURL = () => {};
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.name = this.download; });
        const def = lineDef({ title: 'Bevölkerung' });
        def.dims.c.categories.Tirol = { color: 'blue', visible: false };
        const el = await mount({ def, data: lineData, csv: true });
        el.querySelector('.vis-buttons .vis-csv').click();
        await vi.waitFor(() => expect(saved.name).toBe('Bevölkerung.csv'));
        expect(await saved.blob.text()).toBe('year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien\n2023,4,Wien');
        expect(el.querySelector('.vis-csv').title).toBe('Die Daten als CSV speichern');
    });

    // the rows of the table, the texts of the header and of the cells
    const tableRows = el => [...el.querySelectorAll('table.vis-table tr')].map(tr => [...tr.children].map(c => c.textContent));

    test('the button `table` shows the rows shown as a table instead of the marks and the chart again', async () => {
        const def = lineDef({ title: 'Bevölkerung' });
        def.dims.c.categories = { Wien: { color: 'red', name: 'Vienna' }, Tirol: { color: 'blue', visible: false } };
        const { el, vis } = await mountVis({ def, data: lineData, table: true, csv: true });
        const button = el.querySelector('.vis-buttons .vis-table');
        // the first one of the buttons, a toggle of a constant name
        expect([...el.querySelectorAll('.vis-buttons > button')].map(b => b.classList[1])).toEqual(['vis-table', 'vis-csv']);
        expect([button.title, button.getAttribute('aria-label'), button.getAttribute('aria-pressed')]).toEqual(['Als Tabelle zeigen', 'Als Tabelle zeigen', 'false']);
        expect(el.querySelector('.vis-table-wrapper')).toBeNull();

        button.click();
        await vi.waitFor(() => expect(el.querySelector('table.vis-table')).not.toBeNull());
        expect([button.title, button.getAttribute('aria-pressed')]).toEqual(['Als Diagramm zeigen', 'true']);
        // the marks are hidden, the title, the legend and the footer stay
        expect(el.querySelector('.vis-body').hidden).toBe(true);
        expect(el.querySelector('.vis-legend')).not.toBeNull();
        const wrapper = el.querySelector('.vis-table-wrapper');
        expect([wrapper.getAttribute('tabindex'), wrapper.getAttribute('role'), wrapper.getAttribute('aria-label')]).toEqual(['0', 'region', 'Bevölkerung']);
        expect(wrapper.nextElementSibling.classList.contains('vis-footer')).toBe(true);
        expect(el.querySelector('table.vis-table caption').textContent).toBe('Bevölkerung');
        // the columns of the CSV, the values as the hover has them, numbers at the right
        expect(tableRows(el)).toEqual([['year', 'value', 'land'], ['2020', '1,0', 'Vienna'], ['2021', '', 'Vienna'], ['2022', '3,0', 'Vienna'], ['2023', '4,0', 'Vienna']]);
        expect([...el.querySelectorAll('thead th')].map(th => [th.scope, th.className])).toEqual([['col', 'vis-number'], ['col', 'vis-number'], ['col', '']]);

        // a change of the legend changes the rows
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').click();
        await nextTick();
        expect(tableRows(el).length).toBe(9);
        expect(tableRows(el)[5]).toEqual(['2020', '2,0', 'Tirol']);

        // the chart again, with the marks of the rows of now
        button.click();
        await nextTick();
        expect(el.querySelector('.vis-table-wrapper')).toBeNull();
        expect(el.querySelector('.vis-body').hidden).toBe(false);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(7);
        expect(button.getAttribute('aria-pressed')).toBe('false');

        // of the page, and without the prop the chart
        vis.showTable(true);
        await vi.waitFor(() => expect(el.querySelector('table.vis-table')).not.toBeNull());
        vis.update({ table: false });
        await nextTick();
        expect(el.querySelector('.vis-table-wrapper')).toBeNull();
        expect(el.querySelector('.vis-buttons .vis-table')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the table of many rows draws the first ones, the CSV and the images are the ones of the chart', async () => {
        const rows = Array.from({ length: 1205 }, (_, i) => ({ year: 2000 + (i % 20), value: i * 100, land: i % 2 ? 'Wien' : 'Tirol' }));
        const def = lineDef({ title: 'Viele', locale: 'en' });
        def.dims.y.hover = {};
        const saved = {};
        URL.createObjectURL = blob => { saved.blob = blob; return 'blob:csv'; };
        URL.revokeObjectURL = () => {};
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.name = this.download; });
        const { el, vis } = await mountVis({ def, data: rows, table: true, csv: true });
        vis.showTable();
        await vi.waitFor(() => expect(el.querySelector('table.vis-table')).not.toBeNull());
        expect(el.querySelectorAll('table.vis-table tbody tr').length).toBe(1000);
        expect(el.querySelector('.vis-table-more').textContent).toBe('… and 205 more rows');
        expect(el.querySelector('.vis-buttons .vis-table').title).toBe('Show chart');
        // numbers of the column with thousands separators, as the hover of its scale
        expect(tableRows(el)[2]).toEqual(['2001', '100', 'Wien']);
        expect(tableRows(el)[1000]).toEqual(['2019', '99,900', 'Wien']);
        // the CSV has the values of the data
        el.querySelector('.vis-csv').click();
        await vi.waitFor(() => expect(saved.name).toBe('Viele.csv'));
        const csv = (await saved.blob.text()).split('\n');
        expect([csv.length, csv[0], csv[1000]]).toEqual([1206, 'year,value,land', '2019,99900,Wien']);
        // the image is a copy without the table
        await vis.image();
        expect(screenshot.copy.querySelector('.vis-table-wrapper, table')).toBeNull();
        expect(screenshot.copy.querySelector('.vis-body').hidden).toBe(false);
        expect(screenshot.copy.querySelectorAll('g.vis-mark circle').length).toBeGreaterThan(0);
    });

    test('the slot `buttons` toggles the table, data-table is a flag', async () => {
        const seen = [];
        const { el } = await mountVis({ def: lineDef(), data: lineData, slots: { buttons: ({ table, tableShown }) => {
            seen.push(tableShown);
            return Object.assign(document.createElement('button'), { className: 'own', onclick: () => table() });
        } } });
        expect(el.querySelector('.vis-buttons .vis-table')).toBeNull();
        el.querySelector('.own').click();
        await vi.waitFor(() => expect(el.querySelector('table.vis-table')).not.toBeNull());
        // without a title the caption is the kind of the chart
        expect(el.querySelector('table.vis-table caption').textContent).toBe('Diagramm');
        expect(seen).toEqual([false, true]);
        el.querySelector('.own').click();
        await nextTick();
        expect(el.querySelector('.vis-table-wrapper')).toBeNull();

        const element = document.body.appendChild(document.createElement('div'));
        element.dataset.table = 'false';
        expect(mountGenVisElement(element, { def: lineDef(), data: lineData }).props.table).toBe(false);
        element.dataset.table = '';
        expect(mountGenVisElement(element, { def: lineDef(), data: lineData }).props.table).toBe(true);
    });
});

describe('layout shifts', () => {
    const outer = el => el.querySelector('.vis-outer');

    test('the space of a visualisation drawn before is kept while it is loaded', async () => {
        const def = lineDef({ title: 'Höhe' });
        // jsdom has no layout, the height of the drawn one is 400
        const el = document.body.appendChild(document.createElement('div'));
        const first = createGenVis(el, { def, data: lineData });
        expect(outer(el).classList.contains('vis-loading')).toBe(true);
        expect(outer(el).style.minHeight).toBe('');
        await rendered(el);
        await nextTick();
        expect(outer(el).classList.contains('vis-loading')).toBe(false);
        first.destroy();

        // drawn again, e.g. after a navigation of the page
        const again = document.body.appendChild(document.createElement('div'));
        createGenVis(again, { def, data: lineData });
        // after the mount, before the browser paints
        await nextTick();
        expect(outer(again).classList.contains('vis-loading')).toBe(true);
        expect(outer(again).style.minHeight).toBe('400px');
        await rendered(again);
        await nextTick();
        expect(outer(again).style.minHeight).toBe('');

        // another definition has no space of its own
        const other = document.body.appendChild(document.createElement('div'));
        createGenVis(other, { def: lineDef({ title: 'Andere' }), data: lineData });
        expect(outer(other).style.minHeight).toBe('');
    });

    test('the height is measured in the frame after a draw, the destroy measures only a draw not measured yet', async () => {
        const measured = [];
        const measure = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
            measured.push(this);
            return measure.call(this);
        };
        onTestFinished(() => Element.prototype.getBoundingClientRect = measure);
        const frame = () => new Promise(r => requestAnimationFrame(r));
        const def = lineDef({ title: 'Gemessen' });
        const el = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(el, { def, data: lineData });
        await rendered(el);
        await nextTick();
        await frame();
        const node = outer(el);
        expect(measured).toContain(node);
        measured.length = 0;
        vis.destroy();
        expect(measured).toEqual([]);

        // a draw (a legend toggled) is measured in its frame
        const again = document.body.appendChild(document.createElement('div'));
        const shown = createGenVis(again, { def, data: lineData });
        await rendered(again);
        await nextTick();
        await frame();
        measured.length = 0;
        again.querySelector('.vis-legend-entry').click();
        await nextTick();
        await frame();
        expect(measured).toContain(outer(again));
        measured.length = 0;
        shown.destroy();
        expect(measured).toEqual([]);
    });

    test('a definition loaded after a newer one was given is not shown, also not instead of its error', async () => {
        const serve = fetch;
        let release;
        const slow = new Promise(resolve => release = resolve);
        vi.stubGlobal('fetch', async url => {
            if (url.endsWith('/data/bev/def-bar.json'))
                await slow;
            return serve(url);
        });
        const el = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(el, { defFile: '/data/bev/def-bar.json' });
        await nextTick();
        vis.update({ defFile: '/data/missing.json' });
        await vi.waitFor(() => expect(el.querySelector('.vis-error')).not.toBeNull());
        release();
        await new Promise(resolve => setTimeout(resolve, 50));
        await nextTick();
        expect(el.querySelector('.vis-error').textContent).toMatch(/missing\.json/);
        expect(el.querySelector('.vis-outer').classList.contains('vis-loading')).toBe(false);
        expect(el.querySelector('svg.vis-svg')).toBeNull();
    });

    test('a new definition is drawn when it is loaded, the one before is shown until then', async () => {
        const { el, vis } = await mountVis({ defFile: '/data/bev/def.json' });
        expect(el.querySelector('.vis-title').textContent).toBe('Bevölkerung');
        vis.update({ defFile: '/data/bev/def-bar.json' });
        await nextTick();
        // the old one while the new one is loaded
        expect(el.querySelector('.vis-title')?.textContent).toBe('Bevölkerung');
        await vi.waitFor(() => expect(el.querySelector('g.vis-mark rect')).not.toBeNull());
        expect(el.querySelectorAll('.vis')).toHaveLength(1);
    });
});

describe('lazy', () => {
    // the observers of the visualisations, `show()` brings their elements near the viewport
    // (the observer of drawing), `come()` within the margin of the load ahead
    let observers;
    const near = () => observers.filter(o => o.options.rootMargin != '300% 0px');
    const show = (o = near().at(-1)) => o.callback([{ isIntersecting: true, target: o.targets[0] }]);
    const come = (o = observers.filter(o => o.options.rootMargin == '300% 0px').at(-1)) => o.callback([{ isIntersecting: true, target: o.targets[0] }]);
    let fetched;
    beforeEach(() => {
        observers = [];
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback, options) {
                Object.assign(this, { callback, options, targets: [], disconnected: false });
                observers.push(this);
            }
            observe(el) { this.targets.push(el) }
            disconnect() { this.disconnected = true }
        });
        fetched = [];
        const serve = fetch;
        vi.stubGlobal('fetch', url => {
            fetched.push(new URL(url).pathname);
            return serve(url);
        });
    });
    const wait = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        await nextTick();
    };

    test('nothing is loaded before it is near the viewport, then it is loaded once and stays', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        createGenVis(el, { defFile: '/data/bev/def.json', lazy: true, download: true, csv: true });
        await wait();
        expect(fetched).toEqual([]);
        // near: one height of the viewport, ahead: three
        expect(observers.map(o => o.options.rootMargin)).toEqual(['100% 0px', '300% 0px']);
        expect(observers[0].targets[0]).toBe(el.querySelector('.vis-outer'));
        // the space while it waits, no buttons
        expect(el.querySelector('.vis-outer').classList.contains('vis-loading')).toBe(true);
        expect(el.querySelector('.vis-buttons')).toBeNull();

        // not near the viewport
        observers[0].callback([{ isIntersecting: false }]);
        await wait();
        expect(fetched).toEqual([]);

        show();
        await rendered(el);
        expect(observers[0].disconnected).toBe(true);
        expect(fetched).toEqual(['/data/bev/def.json', '/data/bev/data.csv']);
        expect(el.querySelectorAll('.vis-buttons button')).toHaveLength(2);
        show();
        await wait();
        expect(fetched).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('a margin without a unit is pixels, one the browser refuses is the default one with a warning', async () => {
        // as Chromium: lengths of pixels or percents
        const Stub = IntersectionObserver;
        vi.stubGlobal('IntersectionObserver', class extends Stub {
            constructor(callback, options) {
                if (!(options.rootMargin ?? '').split(' ').every(m => /^-?\d*\.?\d+(px|%)$/.test(m)))
                    throw new DOMException("Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.", 'SyntaxError');
                super(callback, options);
            }
        });
        const margins = lazy => {
            observers = [];
            const el = document.body.appendChild(document.createElement('div'));
            const vis = createGenVis(el, { defFile: '/data/bev/def.json', lazy });
            expect(vis.el.parentNode).toBe(el);
            return observers.map(o => o.options.rootMargin)[0];
        };
        expect(margins(800)).toBe('800px');
        expect(margins('800')).toBe('800px');
        expect(margins('800 0')).toBe('800px 0px');
        expect(margins('50% 0px')).toBe('50% 0px');
        expect(errors).toEqual([]);
        expect(margins('800em')).toBe('100% 0px');
        expect(errors).toEqual([expect.stringContaining("lazy: the margin '800em'")]);
        await wait();
        expect(fetched).toEqual([]);
    });

    test('changes of the props before are used when it is near the viewport', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(el, { defFile: '/data/bev/def.json', state: null, lazy: '800px 0px' });
        await wait();
        vis.update({ defFile: '/data/bev/def-bar.json', state: { globals: {} } });
        await wait();
        expect(fetched).toEqual([]);
        expect(observers.map(o => o.options.rootMargin)).toEqual(['800px 0px', '300% 0px']);
        show();
        await vi.waitFor(() => expect(el.querySelector('g.vis-mark rect')).not.toBeNull());
        expect(fetched[0]).toBe('/data/bev/def-bar.json');
        expect(fetched).not.toContain('/data/bev/def.json');
        // after it is loaded a change loads it again, as without lazy
        vis.update({ defFile: '/data/bev/def.json' });
        await vi.waitFor(() => expect(el.querySelector('.vis-title').textContent).toBe('Bevölkerung'));
        expect(errors).toEqual([]);
    });

    test('ahead of the viewport its files are loaded when the browser is idle, it is drawn near it without loading them again', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(el, { defFile: '/data/bev/def.json', lazy: true });
        await wait();
        come();
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(fetched).toEqual(['/data/bev/def.json', '/data/bev/data.csv']);
        // loaded, not drawn
        expect(el.querySelector('svg.vis-svg')).toBeNull();
        show();
        await rendered(el);
        expect(fetched).toHaveLength(2);
        expect(observers.every(o => o.disconnected)).toBe(true);

        // a definition given after the load ahead is the one drawn
        const other = document.body.appendChild(document.createElement('div'));
        const changed = createGenVis(other, { defFile: '/data/bev/def.json', lazy: true });
        await wait();
        come();
        await new Promise(resolve => setTimeout(resolve, 200));
        changed.update({ defFile: '/data/bev/def-bar.json' });
        show();
        await vi.waitFor(() => expect(other.querySelector('g.vis-mark rect')).not.toBeNull());
        vis.destroy?.();
        expect(errors).toEqual([]);
    });

    test('without an IntersectionObserver or with lazy false it is loaded at once', async () => {
        await mount({ def: lineDef(), data: lineData, lazy: false });
        expect(observers).toHaveLength(0);
        vi.stubGlobal('IntersectionObserver', undefined);
        const el = await mount({ defFile: '/data/bev/def.json', lazy: true });
        expect(el.querySelector('svg.vis-svg')).not.toBeNull();

        // lazy turned off while it waits
        vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() { this.done = true } });
        const other = document.body.appendChild(document.createElement('div'));
        const vis = createGenVis(other, { def: lineDef(), data: lineData, lazy: true });
        await wait();
        expect(other.querySelector('svg.vis-svg')).toBeNull();
        vis.update({ lazy: false });
        await rendered(other);
    });

    test('the observer is disconnected on unmount, the methods of the files need it loaded', async () => {
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { def: lineDef(), data: lineData, lazy: true });
        await expect(vm.image()).rejects.toThrow('not loaded yet');
        await expect(vm.exportCsv()).rejects.toThrow('not loaded yet');
        vm.destroy();
        expect(observers[0].disconnected).toBe(true);
        expect(errors).toEqual([]);
    });

    test('the attribute data-lazy, a margin or true', async () => {
        const el = document.body.appendChild(document.createElement('div'));
        el.dataset.defFile = '/data/bev/def.json';
        el.dataset.lazy = '';
        mountGenVisElement(el);
        const margin = document.body.appendChild(document.createElement('div'));
        margin.dataset.defFile = '/data/bev/def.json';
        margin.dataset.lazy = '1000px';
        mountGenVisElement(margin);
        await wait();
        expect(observers.map(o => o.options.rootMargin)).toEqual(['100% 0px', '300% 0px', '1000px', '300% 0px']);
        expect(fetched).toEqual([]);
        show(observers[2]);
        await rendered(margin);
        expect(el.querySelector('svg.vis-svg')).toBeNull();
    });
});

describe('images', () => {
    const def = () => ({
        ...lineDef({ title: 'Titel', subtitle: 'Untertitel', source: 'Quelle' }),
        globals: { unit: 'a' },
        controls: [{ type: 'radio', global: 'unit', name: 'Einheit', values: [{ value: 'a', name: 'Absolut' }, { value: 'b', name: 'Anteil' }] }],
    });

    // without the size of the definition, the images have their own width
    const fluid = () => {
        const d = def();
        delete d.width;
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
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { defFile: '/data/bev/def.json' });
        await rendered(vm.el);
        const fetched = [];
        const serve = fetch;
        vi.stubGlobal('fetch', url => {
            fetched.push(new URL(url).pathname);
            return serve(url);
        });
        clearCache();
        await vm.image();
        expect(fetched).toEqual(['/data/bev/def.json']);
        expect(screenshot.copy.querySelectorAll('g.vis-mark path').length).toBeGreaterThan(0);
    });

    test('the buttons are only shown with the props', async () => {
        clipboard();
        expect((await mount({ def: def(), data: lineData })).querySelector('.vis-buttons')).toBeNull();
        const el = await mount({ def: def(), data: lineData, download: true, copy: true });
        expect([...el.querySelectorAll('.vis-footer .vis-buttons button')].map(b => b.className)).toEqual(['vis-button vis-copy', 'vis-button vis-download']);
        expect(el.querySelector('.vis-download').title).toBe('Als PNG speichern');
        // a button of the page in the slot with the class vis-button has the styles of them
        const slotted = await mount({ def: def(), data: lineData, download: true, slots: {
            buttons: () => Object.assign(document.createElement('button'), { className: 'vis-button own', disabled: true }),
        } });
        expect([...slotted.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['vis-button own', 'vis-button vis-download']);
        const { readFileSync } = await import('node:fs');
        const { root } = await import('./dom.js');
        const css = readFileSync(`${root}/src/styles.css`, 'utf8');
        expect(css).toMatch(/\.vis-button svg \{[^}]*stroke: var\(--gen-vis-button-color/);
        expect(css).toMatch(/\.vis-button:disabled svg \{[^}]*--gen-vis-button-disabled-color/);
    });

    test('no copy button without the clipboard', async () => {
        vi.stubGlobal('ClipboardItem', undefined);
        const el = await mount({ def: def(), data: lineData, copy: true });
        expect(el.querySelector('.vis-buttons')).toBeNull();
    });

    test('the image has the selection but not the controls and the hidden entries', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const el = await mount({ def: def(), data: lineData, download: 'chart' });

        el.querySelector('.vis-control input[value="b"]').click();
        el.querySelector('.vis-legend [data-key="Tirol"]').click();
        await nextTick();
        el.querySelector('.vis-download').click();
        await vi.waitFor(() => expect(click).toHaveBeenCalled());

        const copy = screenshot.copy;
        expect(screenshot.file).toBe('chart.png');
        expect([...copy.querySelectorAll('.vis-header > div')].map(e => [e.className, e.textContent])).toEqual([
            ['vis-title', 'Titel'], ['vis-subtitle', 'Untertitel'], ['vis-selection', 'Einheit: Anteil'],
        ]);
        expect(copy.querySelector('.vis-controls, .vis-buttons')).toBeNull();
        expect([...copy.querySelectorAll('.vis-legend .vis-legend-entries > div')].map(e => e.dataset.key)).toEqual(['Wien']);
        // the copy is removed again, the visualisation keeps its state
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        expect(el.querySelector('.vis-control input[value="b"]').checked).toBe(true);
        expect(errors).toEqual([]);
    });

    test('the title and the subtitle with the globals, also of the image and its file', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const d = def();
        d.title = 'Titel {unit}';
        d.subtitle = 'Einheit {unit}, Untertitel';
        const el = await mount({ def: d, data: lineData, download: true });
        const header = e => [...e.querySelectorAll('.vis-header > div')].map(e => e.textContent);
        expect(header(el)).toEqual(['Titel a', 'Einheit a, Untertitel']);

        el.querySelector('.vis-control input[value="b"]').click();
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
            const vm = createGenVis(document.body.appendChild(document.createElement('div')), { ...props, data: lineData });
            await rendered(vm.el);
            await vm.exportPng('chart');
            images.push([screenshot.width, screenshot.scale]);
            vm.destroy();
        }
        expect(images).toEqual([['630px', 2], ['830px', 2], ['1630px', 2], ['830px', 2], ['390px', 3]]);
        expect(errors).toEqual([]);
    });

    test('the copy button writes the image to the clipboard', async () => {
        const write = clipboard();
        const el = await mount({ def: def(), data: lineData, copy: true });
        el.querySelector('.vis-copy').click();
        await vi.waitFor(() => expect(el.querySelector('.vis-copy').title).toBe('Kopiert'));
        expect(write).toHaveBeenCalledTimes(1);
        expect(await write.mock.calls[0][0][0].items['image/png']).toBeInstanceOf(Blob);
        expect(errors).toEqual([]);
    });

    test('an error of the copy rejects the image', async () => {
        registerMarkType('test:once', markTypes['cartesian:line']);
        const vm = createGenVis(document.body.appendChild(document.createElement('div')), { def: { ...def(), marks: [{ ...def().marks[0], type: 'test:once' }] }, data: lineData });
        await rendered(vm.el);
        // the copy is drawn again, without the mark type
        delete markTypes['test:once'];
        await expect(vm.image()).rejects.toThrow("marks[0].type: unknown mark type 'test:once'");
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        vm.destroy();
        errors.length = 0;
    });

    test('controls of the presentation are not in the selection', async () => {
        const d = def();
        d.globals.scale = 'shared';
        d.controls.push({ type: 'radio', global: 'scale', name: 'Skala', inImage: false, values: [{ value: 'shared', name: 'Geteilt' }, { value: 'free', name: 'Getrennt' }] });
        expect(selection(prepareDef(d))).toBe('Einheit: Absolut');
    });

    test('the image has no legend of the facets, their titles name them', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const el = await mount({ def: { ...def(), facets: { by: 'c', cols: 2 } }, data: lineData, download: true });
        expect(el.querySelector('.vis-legend[data-dim="c"]')).not.toBeNull();

        el.querySelector('.vis-download').click();
        await vi.waitFor(() => expect(screenshot.copy).not.toBeNull());
        expect(screenshot.copy.querySelector('.vis-legend[data-dim="c"]')).toBeNull();
        expect([...screenshot.copy.querySelectorAll('.vis-facet-title')].map(e => e.textContent)).toEqual(['Wien', 'Tirol']);
        expect(errors).toEqual([]);
    });

    test('the buttons of the slot are before the others and not in the image', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { screenshot.file = this.download; });
        const el = await mount({ def: def(), data: lineData, download: true, slots: {
            buttons: ({ save, canCopy }) => html('button', { class: 'own', 'data-copy': String(canCopy), onClick: save }),
        } });
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['own', 'vis-button vis-download']);
        expect(el.querySelector('.own').dataset.copy).toBe('false');

        // the own button saves the image too, without the buttons
        el.querySelector('.own').click();
        await vi.waitFor(() => expect(screenshot.file).toBe('Titel.png'));
        expect(screenshot.copy.querySelector('.vis-buttons, .own')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('only the buttons of the slot', async () => {
        const el = await mount({ def: def(), data: lineData, slots: { buttons: () => html('button', { class: 'own' }) } });
        expect([...el.querySelectorAll('.vis-buttons button')].map(b => b.className)).toEqual(['own']);
    });

    test('rendered once it is drawn', async () => {
        const onRendered = vi.fn();
        const el = await mount({ def: def(), data: lineData, onRendered });
        expect(el.querySelector('svg.vis-svg path')).not.toBeNull();
        expect(onRendered).toHaveBeenCalledTimes(1);
    });
});

describe('histograms: the classes of a bin', () => {
    // inner size 750 x 250, x from 0 to 10, y from 0 to 4
    const def = marks => ({
        height: 300, margins: { top: 25, right: 25, bottom: 25, left: 25 },
        transform: { type: 'bin', column: 'v', edges: [0, 2, 4, 10], by: 'g', start: 'lo', end: 'hi' },
        dims: {
            x: { column: 'v', type: 'numeric', domain: [0, 10], pad: 0 },
            lo: { column: 'lo', type: 'numeric' },
            hi: { column: 'hi', type: 'numeric' },
            y: { column: 'count', type: 'numeric', domain: [0, 4], pad: 0 },
            g: { column: 'g', type: 'categorical', fromData: true },
        },
        marks,
    });
    const data = 'v,g\n1,a\n1.5,a\n3,a\n9,a\n1,b';

    test('bars from the start to the end of a class, with crisp edges, empty ones of no height', async () => {
        const el = await mount({ def: def({ type: 'bar', by: 'g', x0: 'lo', x1: 'hi' }), data });
        const rects = [...el.querySelectorAll('g.vis-mark rect')].map(r => ['x', 'width', 'y', 'height'].map(a => +r.getAttribute(a)));
        // a: 2 in 0-2, 1 in 2-4, 1 in 4-10; b: 1 in 0-2, none in the others
        expect(rects.slice(0, 3)).toEqual([[0, 150, 125, 125], [150, 150, 187.5, 62.5], [300, 450, 187.5, 62.5]]);
        expect(rects[4]).toEqual([150, 150, 250, 0]);
        expect(el.querySelector('g.vis-mark rect').getAttribute('shape-rendering')).toBe('crispEdges');
        expect(errors).toEqual([]);
    });

    test('filled stairs of an area of x0 and x1, closed along the base', async () => {
        const el = await mount({ def: def({ type: 'area', by: 'g', x0: 'lo', x1: 'hi' }), data });
        const [a] = [...el.querySelectorAll('g.vis-mark path')].map(p => p.getAttribute('d'));
        expect(a).toBe('M0,250V125H150V187.5H300V187.5H750V250Z');
        expect(errors).toEqual([]);
    });

    test('stairs of a line of x0 and x1: down to the base at both ends', async () => {
        const el = await mount({ def: def({ type: 'line', by: 'g', x0: 'lo', x1: 'hi' }), data });
        const [a, b] = [...el.querySelectorAll('g.vis-mark path')].map(p => p.getAttribute('d'));
        expect(a).toBe('M0,250V125H150V187.5H300V187.5H750V250');
        expect(b).toBe('M0,250V187.5H150V250H300V250H750V250');
        // open ends: from the first step to the last one, e.g. of shares
        const open = await mount({ def: def({ type: 'line', by: 'g', ends: 'open', x0: 'lo', x1: 'hi' }), data });
        expect(open.querySelector('g.vis-mark path').getAttribute('d')).toBe('M0,125H150V187.5H300V187.5H750');
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def({ type: 'bar', ends: 'open' })).filter(w => w.includes('ends')))
            .toEqual([`marks[0].ends: the ends of the stairs of a line of x0 and x1, 'base' (down to the base, the default) or 'open'`]);
        expect(errors).toEqual([]);
    });
});

describe('axis titles', () => {
    test('at the top of a vertical axis, horizontal, above the range of its scale; beside it in the middle of the range', async () => {
        const def = lineDef();
        // the scale of y in the upper 60% of the plot area of 250 pixels
        def.dims.y.range = ['=@height * 0.6', 0];
        def.dims.y.axis = { title: { name: 'in €', position: 'top', offset: 30 } };
        def.dims.x.axis.title = { name: 'Jahr', offset: 30 };
        const el = await mount({ def, data: lineData });
        const [y, x] = ['y', 'x'].map(n => [...el.querySelectorAll('.vis-axis-title')].find(t => t.textContent == (n == 'y' ? 'in €' : 'Jahr')));
        expect(y.getAttribute('transform')).toBe('translate(-30 -8)');
        expect([y.getAttribute('text-anchor'), y.classList.contains('vis-axis-title-top')]).toEqual(['start', true]);
        expect(x.getAttribute('transform')).toBe('translate(275 280)');

        def.dims.y.axis.title = { name: 'in €', offset: 30 };
        const side = await mount({ def, data: lineData });
        expect([...side.querySelectorAll('.vis-axis-title')].find(t => t.textContent == 'in €').getAttribute('transform')).toBe('rotate(-90) translate(-75 -30)');
        expect(errors).toEqual([]);
    });
});

describe('axis titles of a negative offset', () => {
    test('inside the plot area, a valid transform of every position', async () => {
        const transform = async (xPosition, yPosition) => {
            const def = lineDef();
            def.dims.x = { column: 'year', type: 'numeric', axis: { position: xPosition, title: { name: 'Jahr', offset: -5 } } };
            def.dims.y = { column: 'value', type: 'numeric', axis: { position: yPosition, title: { name: 'Wert', offset: -5 } }, hover: { format: ',.1f' } };
            const el = await mount({ def, data: lineData });
            return ['Jahr', 'Wert'].map(n => [...el.querySelectorAll('.vis-axis-title')].find(t => t.textContent == n).getAttribute('transform'));
        };
        // inner size 550 x 250
        expect(await transform('bottom', 'left')).toEqual(['translate(275 245)', 'rotate(-90) translate(-125 5)']);
        expect(await transform('top', 'right')).toEqual(['translate(275 5)', 'rotate(90) translate(125 -545)']);
        expect(errors).toEqual([]);
    });
});

describe('axes at a value of the other axis (`at`)', () => {
    // inner size 550 x 250, x from 2020 to 2023, y from -2 to 4
    const def = (x = {}, y = {}) => {
        const d = lineDef();
        Object.assign(d.dims.x, { domain: [2020, 2023], pad: 0 });
        Object.assign(d.dims.y, { domain: [-2, 4], pad: 0 });
        Object.assign(d.dims.x.axis, x);
        d.dims.y.axis = y;
        return d;
    };
    const axis = (el, position) => el.querySelector(`.vis-axis-${position}`);
    const tickOf = (el, position, label) => [...axis(el, position).querySelectorAll('.tick')]
        .find(t => parseFloat(t.textContent.replace(',', '.').replace('−', '-')) == label);

    test('the line on the tick of the value, the labels at the edge', async () => {
        const el = await mount({ def: def({ at: 0 }), data: lineData });
        const x = axis(el, 'bottom');
        // y = 0 is a third from the bottom: 250 - 250/3
        expect(x.getAttribute('transform')).toBe(`translate(0, ${250 - 250/3})`);
        // the line is at the half pixel of the tick of 0 of y
        expect(tickOf(el, 'left', 0).getAttribute('transform')).toBe(`translate(0,${250 - 250/3 + 0.5})`);
        expect(x.querySelector('.domain').getAttribute('d')).toBe('M0.5,0.5H550.5');
        // the labels are moved back to the edge, the tick marks stay at the line
        expect(+x.querySelector('.tick text').getAttribute('transform').match(/translate\(0 ([\d.]+)\)/)[1]).toBeCloseTo(250/3, 9);
        expect(x.querySelector('.tick line').getAttribute('transform')).toBeNull();
        // above the marks, as it crosses them
        expect(x.classList.contains('vis-axis-at')).toBe(true);
        const marks = [...x.parentNode.querySelectorAll(':scope > .vis-mark')];
        expect(marks.length).toBeGreaterThan(0);
        expect(marks.every(p => p.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(errors).toEqual([]);
    });

    test('outside of the domain at the edge, labels with the line', async () => {
        const outside = await mount({ def: def({ at: 10 }), data: lineData });
        expect(axis(outside, 'bottom').getAttribute('transform')).toBe('translate(0, 250)');
        expect(axis(outside, 'bottom').querySelector('.tick text').hasAttribute('transform')).toBe(false);

        const el = await mount({ def: def({ at: 0, labels: { at: 'axis' } }), data: lineData });
        expect(axis(el, 'bottom').querySelector('.tick text').hasAttribute('transform')).toBe(false);
        expect(errors).toEqual([]);
    });

    test('a vertical axis at a value of x, the label at the crossing left out', async () => {
        const el = await mount({ def: def({ at: 0, labels: { at: 'axis' } }, { at: 2021.5, labels: { at: 'axis' } }), data: lineData });
        expect(axis(el, 'left').getAttribute('transform')).toBe(`translate(${550/2}, 0)`);
        // the label of 0 of y where the axis of x crosses it
        expect(tickOf(el, 'left', 2)?.querySelector('text').textContent).toBe('2');
        expect([...axis(el, 'left').querySelectorAll('.tick text')].map(t => t.textContent)).not.toContain('0');
        expect(errors).toEqual([]);
    });

    test('at a date and a reference, validateDef of polar axes', async () => {
        const d = def({}, { at: '@start' });
        d.globals = { start: '2022-01-01' };
        d.dims.x = { column: 'date', type: 'date', domain: ['2020-01-01', '2024-01-01'], pad: 0 };
        const data = 'date,value,land\n2020-01-01,1,Wien\n2024-01-01,2,Wien';
        const el = await mount({ def: d, data });
        const p = +axis(el, 'left').getAttribute('transform').match(/translate\(([\d.]+)/)[1];
        expect(p).toBeCloseTo(550*(Date.UTC(2022, 0, 1) - Date.UTC(2020, 0, 1))/(Date.UTC(2024, 0, 1) - Date.UTC(2020, 0, 1)), 0);
        const { validateDef } = await import('@/utils/validate');
        const polar = { coord: 'polar', dims: { x: { column: 'a', type: 'categorical', axis: { at: 0 } }, y: { column: 'v', type: 'numeric' } }, marks: { type: 'arc' } };
        expect(validateDef(polar).filter(w => w.includes('.at'))).toEqual([`dims.x.axis.at: only cartesian axes are at a value of the other axis`]);
    });

    test('of a log scale at 0 or null at the edge, at a value of a band scale its center, per facet of own scales', async () => {
        const log = d => {
            delete d.dims.y.domain;
            delete d.dims.y.pad;
            d.dims.y.scale = { type: 'log' };
            return d;
        };
        for (const at of [0, -1, null]) {
            const el = await mount({ def: log(def({ at })), data: lineData.replace(',,20,Wien', ',5,20,Wien') });
            expect([at, axis(el, 'bottom').getAttribute('transform'), axis(el, 'bottom').classList.contains('vis-axis-at')]).toEqual([at, 'translate(0, 250)', false]);
        }
        // y of the lands: Wien and Tirol, the line of x at the center of Tirol
        const band = def({ at: 'Tirol', labels: { at: 'axis' } }, { at: 2021, labels: { at: 'axis' } });
        band.dims.y = { column: 'land', type: 'categorical', reverse: true, scale: { type: 'band', padding: 0 }, axis: { at: 2021, labels: { at: 'axis' } } };
        const el = await mount({ def: band, data: lineData });
        // at the tick of Tirol, without its half pixel
        const tirol = [...axis(el, 'left').querySelectorAll('.tick')].map(t => t.getAttribute('transform'))[1];
        expect(tirol).toMatch(/^translate\(0,[\d.]+\)$/);
        expect(axis(el, 'bottom').getAttribute('transform')).toBe(`translate(0, ${+tirol.match(/,([\d.]+)/)[1] - 0.5})`);
        expect(+axis(el, 'left').getAttribute('transform').match(/translate\(([\d.]+)/)[1]).toBeCloseTo(550/3, 9);
        // the labels without the ones at the crossing: Tirol of y and 2021 of x
        expect([...axis(el, 'left').querySelectorAll('.tick text')].map(t => t.textContent)).toEqual(['Wien', '']);
        expect([...axis(el, 'bottom').querySelectorAll('.tick text')].map(t => t.textContent).filter(Boolean)).not.toContain('2.021');
        // facets of own scales of y: the line at 3 inside the domain of Wien (1 to 4), at the edge of Tirol (2)
        const faceted = def({ at: 3 });
        delete faceted.dims.y.domain;
        faceted.dims.f = { column: 'land', categories: { Wien: {}, Tirol: {} } };
        faceted.facets = { by: 'f', cols: 2 };
        const f = await mount({ def: faceted, data: lineData });
        expect([...f.querySelectorAll('.vis-axis-bottom')].map(a => a.classList.contains('vis-axis-at'))).toEqual([true, false]);
        expect(errors).toEqual([]);
    });
});

describe('the layer of annotations', () => {
    test('right before a mark (`before`), above all marks or below them', async () => {
        const def = lineDef();
        def.marks[1].id = 'points';
        def.annotations = [
            { type: 'line', y: 2, before: 'points' },
            { type: 'line', y: 3, layer: 'above' },
            { type: 'line', y: 1 },
        ];
        const el = await mount({ def, data: lineData });
        const order = [...el.querySelectorAll('.vis-facet svg > g > g[data-mark]')].map(g => g.getAttribute('data-mark'));
        expect(order).toEqual(['annotation-2', 'mark-0', 'annotation-0', 'points', 'annotation-1']);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ ...def, annotations: [{ type: 'line', y: 2, before: 'nope' }] }))
            .toEqual([`annotations[0].before: unknown mark 'nope', expected one of 'mark-0', 'points'`]);
    });
});

describe('annotations in the legend', () => {
    test('an entry per name with the symbol of the annotation, after the legends of the dims', async () => {
        const def = lineDef();
        def.globals = { year: '2021' };
        def.annotations = [
            { type: 'line', x: 2021, legend: 'Reform {year}', props: { stroke: 'red', 'stroke-dasharray': '2 2' } },
            { type: 'line', y: 3, legend: 'Ziel' },
            { type: 'band', x: [2022, null], legend: 'Prognose' },
            { type: 'line', x: 2022, legend: 'Reform {year}' },
            { type: 'line', x: 2023 },
        ];
        const el = await mount({ def, data: lineData });
        const legends = [...el.querySelectorAll('.vis-legends .vis-legend')];
        expect(legends.at(-1).classList.contains('vis-legend-annotations')).toBe(true);
        const entries = [...legends.at(-1).querySelectorAll('.vis-legend-entry')];
        expect(entries.map(e => e.textContent)).toEqual(['Reform 2021', 'Ziel', 'Prognose']);
        const [vertical, horizontal] = entries.map(e => e.querySelector('svg').firstElementChild);
        expect(['x1', 'x2', 'y1', 'y2', 'stroke', 'stroke-dasharray', 'class'].map(a => vertical.getAttribute(a))).toEqual(['8', '8', '0', '16', 'red', '2 2', 'vis-annotation vis-line']);
        expect(['y1', 'y2'].map(a => horizontal.getAttribute(a))).toEqual(['8', '8']);
        expect(entries[2].querySelector('svg').firstElementChild.tagName).toBe('rect');
        expect(errors).toEqual([]);
    });
});

describe('marks once per facet', () => {
    test('an element per facet of no row, at the edges of the plot area, with the name of the facet', async () => {
        const def = lineDef();
        def.dims.f = { column: 'land', categories: { Wien: { name: 'Stadt Wien' }, Tirol: {} } };
        def.facets = { by: 'f', cols: 2 };
        def.marks.push({ type: 'text', id: 'header', once: true, x: '@plot:right', y: '@plot:top', text: '@facet:name', 'text-anchor': 'end' });
        const el = await mount({ def, data: lineData });
        const texts = [...el.querySelectorAll('[data-mark="header"] text')];
        expect(texts.map(t => t.textContent)).toEqual(['Stadt Wien', 'Tirol']);
        const facet = el.querySelector('.vis-facet svg');
        expect(+texts[0].getAttribute('y')).toBe(0);
        expect(+texts[0].getAttribute('x')).toBeGreaterThan(100);
        expect(errors).toEqual([]);
    });
});

describe('rules', () => {
    test('a line per row across the plot area at x, in the color of its category, limited by y1 and y2; at y horizontal', async () => {
        const def = lineDef();
        Object.assign(def.dims.x, { domain: [2020, 2023], pad: 0 });
        def.marks = [{ type: 'rule', by: 'c', filter: { x: 2021 }, 'stroke-dasharray': '2 2' },
            { type: 'rule', id: 'h', filter: { x: 2020, c: 'Wien' }, y: 'y', x2: '=literal(100)' }];
        const el = await mount({ def, data: lineData });
        const lines = [...el.querySelectorAll('[data-mark="mark-0"] line')];
        expect(lines.map(l => ['y1', 'y2', 'stroke'].map(a => l.getAttribute(a)))).toEqual([['0', '250', 'red'], ['0', '250', 'blue']]);
        lines.forEach(l => ['x1', 'x2'].forEach(a => expect(+l.getAttribute(a)).toBeCloseTo(550/3 + 0.5, 9)));
        const h = el.querySelector('[data-mark="h"] line');
        expect(['x1', 'x2'].map(a => h.getAttribute(a))).toEqual(['0', '100']);
        expect(h.getAttribute('y1')).toBe(h.getAttribute('y2'));
        expect(errors).toEqual([]);
    });
});

describe('axis titles of facets', () => {
    test('only at the outer facets: the bottom row, the first column', async () => {
        const def = lineDef();
        def.dims.y.axis = { title: { name: 'Wert' } };
        def.dims.f = { column: 'land', categories: { Wien: {}, Tirol: {}, Salzburg: {} } };
        def.dims.c.categories.Salzburg = 'green';
        def.facets = { by: 'f', cols: 2, axisTitles: 'outer' };
        const data = lineData + '\n2020,3,30,Salzburg\n2021,4,40,Salzburg';
        const el = await mount({ def, data });
        const titles = [...el.querySelectorAll('.vis-facet')].map(f => [...f.querySelectorAll('.vis-axis-title')].map(t => t.textContent));
        // Wien and Tirol in the first row, Salzburg below Wien; Tirol has no facet below
        expect(titles).toEqual([['Wert'], ['Jahr'], ['Jahr', 'Wert']]);
        expect(errors).toEqual([]);
    });
});

describe('facet titles', () => {
    test('the props of the definition as css properties, of the category of the facet', async () => {
        const def = lineDef();
        def.dims.f = { column: 'land', categories: { Wien: 'red', Tirol: 'blue' } };
        def.facets = { by: 'f', cols: 2, title: { props: { 'font-weight': 'normal', color: '@color', 'text-align': 'center' } } };
        const el = await mount({ def, data: lineData });
        const titles = [...el.querySelectorAll('.vis-facet-title')];
        expect(titles.map(t => [t.style.fontWeight, t.style.color, t.style.textAlign])).toEqual([['normal', 'red', 'center'], ['normal', 'blue', 'center']]);
        expect(errors).toEqual([]);
    });
});

describe('small tables per facet', () => {
    test('the place of a row among the rows of the mark (@row:index), a header once per facet', async () => {
        const def = lineDef();
        def.dims.f = { column: 'land', categories: { Wien: {}, Tirol: {} } };
        def.facets = { by: 'f', cols: 2 };
        def.marks = [
            { type: 'text', id: 'header', once: true, x: '@plot:right', y: '@plot:top', text: 'Wert', 'text-anchor': 'end' },
            { type: 'text', id: 'rows', filter: { x: [2022, 2023] }, x: '@plot:right', y: '=@plot:top + 12 + @row:index * 11', text: '@y', 'text-anchor': 'end' },
        ];
        const el = await mount({ def, data: lineData });
        const facet = el.querySelector('.vis-facet');
        expect([...facet.querySelectorAll('[data-mark="rows"] text')].map(t => [t.textContent, t.getAttribute('y')])).toEqual([['3', '12'], ['4', '23']]);
        expect(facet.querySelector('[data-mark="header"] text').textContent).toBe('Wert');
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def)).toEqual([]);
        expect(errors).toEqual([]);
    });
});

describe('grids of facets', () => {
    const data = `${lineData}\n2020,5,50,Salzburg\n2021,6,60,Salzburg`;
    const grid = extra => {
        const def = lineDef();
        def.dims.c.categories.Salzburg = 'green';
        def.dims.g = { column: 'land', categories: { Wien: { name: 'Stadt' }, Tirol: { name: 'Land' }, Salzburg: { name: 'Land' } } };
        def.dims.r = { column: 'other', type: 'categorical', fromData: true };
        def.facets = { by: { rows: 'c', cols: 'g' }, ...extra };
        def.dims.g = { column: 'land', categories: { Wien: { name: 'Wien' }, Tirol: { name: 'Tirol' } } };
        return def;
    };

    test('headers of the columns above the first row, of the rows right of them rotated, an end after each row', async () => {
        const def = lineDef();
        def.dims.half = { column: 'year', type: 'categorical', categories: { 2020: { name: 'früh' }, 2021: { name: 'mittel' }, 2022: {}, 2023: {} } };
        def.facets = { by: { rows: 'c', cols: 'half' }, scales: { y: 'row' } };
        def.marks = [{ type: 'point', r: 2 }];
        const el = await mount({ def, data: lineData.replace('2021,,20,Wien', '2021,2,20,Wien') });
        expect([...el.querySelectorAll('.vis-facet-col-title')].map(t => t.textContent)).toEqual(['früh', 'mittel', '2022', '2023']);
        const headers = [...el.querySelectorAll('svg.vis-facet-row-title text')];
        expect(headers.map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        expect(headers[0].getAttribute('transform')).toMatch(/^rotate\(90 /);
        expect(el.querySelectorAll('.vis-facet-row-end')).toHaveLength(2);
        // the labels of y of the row only in the first column
        const facets = [...el.querySelectorAll('.vis-facet')];
        const labels = f => [...f.querySelectorAll('.vis-axis-left .tick text')].map(t => t.textContent).filter(Boolean).length;
        expect(facets.map(labels).map(n => n > 0)).toEqual([true, false, false, false, true, false, false, false]);
        expect(errors).toEqual([]);
    });

    test('the hover of a facet is above the facets after it, e.g. of the next row', async () => {
        const def = lineDef();
        def.dims.half = { column: 'year', type: 'categorical', categories: { 2020: {}, 2021: {} } };
        def.facets = { by: { rows: 'c', cols: 'half' } };
        const el = await mount({ def, data: lineData.replace('2021,,20,Wien', '2021,2,20,Wien') });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        // the element which places the box is a layer of its own (a transform), its z-index decides
        const place = el.querySelector('.vis-hover').parentElement;
        expect(place.style.transform).toMatch(/^translate/);
        expect(place.style.zIndex).toBe('1');
        expect(errors).toEqual([]);
    });

    test('headers of the rows of a side and a direction: vertical at the left (upwards), horizontal at the right', async () => {
        const def = lineDef();
        def.dims.half = { column: 'year', type: 'categorical', categories: { 2020: {}, 2021: {} } };
        def.marks = [{ type: 'point', r: 2 }];
        def.facets = { by: { rows: 'c', cols: 'half' }, rowHeaders: { side: 'left', vertical: true } };
        const data = lineData.replace('2021,,20,Wien', '2021,2,20,Wien');
        const left = await mount({ def, data });
        const headers = [...left.querySelectorAll('svg.vis-facet-row-title-left.vis-facet-row-title-vertical text')];
        expect(headers.map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        expect(headers[0].getAttribute('transform')).toMatch(/^rotate\(-90 /);
        // before the first facet of its row
        expect(headers[0].closest('svg').nextElementSibling.querySelector('.vis-facet')).not.toBeNull();
        def.facets.rowHeaders = { side: 'right', vertical: false };
        const right = await mount({ def, data });
        expect([...right.querySelectorAll('div.vis-facet-row-title-right.vis-facet-row-title-horizontal')].map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def)).toEqual([]);
        expect(validateDef({ ...def, facets: { ...def.facets, rowHeaders: { side: 'top' } } })).toEqual(
            [`facets.rowHeaders: expected 'left' (horizontal), 'right' (vertical, the default) or { "side": "left", "vertical": true }`]);
        expect(errors).toEqual([]);
    });

    test('headers of the rows left of them, horizontal; marks of a column (facet of the dim of the columns), empty cells', async () => {
        const def = lineDef();
        def.dims.half = { column: 'year', type: 'categorical', categories: { 2020: {}, 2021: {} } };
        def.facets = { by: { rows: 'c', cols: 'half' }, rowHeaders: 'left' };
        def.marks = [{ type: 'point', id: 'all', r: 2 }, { type: 'point', id: 'first', facet: { half: '2020' }, r: 2 }];
        // Wien has no value in 2021
        const el = await mount({ def, data: lineData.replace('2021,,20,Wien\n', '') });
        expect([...el.querySelectorAll('div.vis-facet-row-title-horizontal')].map(t => t.textContent)).toEqual(['Wien', 'Tirol']);
        expect(el.querySelectorAll('.vis-facet-empty')).toHaveLength(1);
        expect([...el.querySelectorAll('svg.vis-svg')].map(s => s.querySelectorAll('[data-mark="first"] circle').length)).toEqual([1, 1, 0]);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def)).toEqual([]);
        expect(validateDef({ ...def, facets: { by: { rows: 'c', cols: 'nope' }, scales: { y: 'rows' } } })).toEqual([
            `marks[1].facet.half: expected the dim of the rows or the columns of the grid, 'c', 'nope'`,
            `facets.by.cols: unknown dim 'nope', expected one of 'x', 'y', 'c', 'half'`, `facets.scales.y: expected 'all', 'row' or 'col'`]);
        expect(errors).toEqual([]);
    });
});

describe('grids of facets: edge cases', () => {
    // the labels of the ticks of a facet at a side, '' of an empty cell
    const labels = (el, side) => [...el.querySelectorAll('.vis-facet')].map(f => f.classList.contains('vis-facet-empty') ? ''
        : [...f.querySelectorAll(`.vis-axis-${side} .tick text`)].map(t => t.textContent).filter(Boolean).join('|'));
    const gridDef = facets => {
        const def = lineDef();
        def.dims.half = { column: 'half', type: 'categorical', categories: { a: {}, b: {} } };
        def.dims.x.ticks = 1;
        def.dims.x.axis.title = { name: 'Jahr' };
        def.dims.y.ticks = 2;
        def.marks = [{ type: 'point', r: 2 }];
        def.facets = facets;
        return def;
    };
    const data = 'year,value,land,half\n2020,10,Wien,a\n2021,20,Wien,b\n2020,1,Tirol,a\n2021,3,Tirol,b';

    test('one row or one column: the labels of a shared scale at the outer facets only', async () => {
        const row = await mount({ def: gridDef({ by: { cols: 'half' }, scales: { y: 'row' } }), data });
        expect(labels(row, 'left').map(Boolean)).toEqual([true, false]);
        expect(row.querySelectorAll('.vis-facet-row-title')).toHaveLength(0);
        const col = await mount({ def: gridDef({ by: { rows: 'half' }, scales: { x: 'col' } }), data });
        expect(labels(col, 'bottom').map(Boolean)).toEqual([false, true]);
        expect(col.querySelectorAll('.vis-facet-row-title')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('an empty cell at the edge: the facet beyond it has the labels and the title', async () => {
        // Tirol has no row in a: the bottom left cell is empty
        const def = gridDef({ by: { rows: 'c', cols: 'half' }, scales: { x: 'all', y: 'all' }, axisTitles: 'outer' });
        const el = await mount({ def, data: data.replace('2020,1,Tirol,a\n', '') });
        expect(labels(el, 'bottom').map(Boolean)).toEqual([true, false, false, true]);
        // the row of Tirol has its labels of y in its first facet, the second column
        expect(labels(el, 'left').map(Boolean)).toEqual([true, false, false, true]);
        expect([...el.querySelectorAll('.vis-facet')].map(f => f.querySelectorAll('.vis-axis-title').length)).toEqual([1, 0, 0, 1]);
        expect(errors).toEqual([]);
    });

    test('headers left of the rows wider than 40% of the width: the column of 40%, the header wraps in it', async () => {
        const { readFileSync } = await import('node:fs');
        const { root } = await import('./dom.js');
        // jsdom has no layout: every element is 800 pixels wide, so the names are measured wider than 40%
        const el = await mount({ def: gridDef({ by: { rows: 'c', cols: 'half' }, rowHeaders: 'left' }), data });
        const header = el.querySelector('div.vis-facet-row-title-horizontal');
        expect(header.style.width).toBe('240px');
        // the headers wrap (measured in one line, see rowHeaderWidth of comp/vis.js), checked in Chromium
        const rule = /\.vis-facet-row-title-horizontal \{([^}]*)\}/.exec(readFileSync(`${root}/src/styles.css`, 'utf8'))[1];
        expect(rule).not.toMatch(/nowrap/);
        expect(readFileSync(`${root}/src/comp/vis.js`, 'utf8')).toMatch(/visibility: hidden;[^']*white-space: nowrap;/);
        expect(errors).toEqual([]);
    });

    test('domainIgnores of a scale per row: the domain of the rows of the row, of all values of the condition', async () => {
        const def = gridDef({ by: { rows: 'c', cols: 'half' }, scales: { y: 'row' } });
        def.dims.y.scale = { domainIgnores: true };
        def.dims.y.pad = 0;
        def.dims.y.axis = { values: [1, 3, 10, 20] };
        def.filter = { x: 2020 };
        // Wien from 10 to 20, Tirol from 1 to 3 of both years, the rows of 2020 drawn
        const el = await mount({ def, data: data.replace(/,b$/gm, ',a') });
        expect(labels(el, 'left')).toEqual(['10|20', '1|3']);
        expect(errors).toEqual([]);
    });

    test('a step of a band scale per row: the height of the categories of the row', async () => {
        const def = gridDef({ by: { rows: 'g', cols: 'half' }, scales: { y: 'row' } });
        def.dims.g = { column: 'group', type: 'categorical', fromData: true };
        delete def.dims.c;
        def.dims.y = { column: 'land', type: 'categorical', reverse: true, scale: { type: 'band', step: 20, padding: 0 } };
        // two categories in each facet, four in the row
        const el = await mount({ def, data: 'year,land,half,group\n2020,A,a,g\n2020,B,b,g\n2020,C,a,g\n2020,D,b,g' });
        expect(labels(el, 'left')).toEqual(['A|C|B|D', '']);
        expect([...el.querySelectorAll('svg.vis-svg')].map(s => +s.getAttribute('height'))).toEqual([130, 130]);
        expect(errors).toEqual([]);
    });
});

describe('the total of the stacked values in the hover', () => {
    const stackDef = () => {
        const def = lineDef();
        def.dims.type = { column: 'type', type: 'categorical', categories: { a: {}, b: {} } };
        def.marks = { type: 'bar', by: 'type', stack: true, width: 10, fill: 'red' };
        return def;
    };
    test('a row of the sum below the rows, {total} of the title, values for templates without a cell', async () => {
        const def = stackDef();
        def.dims.type.hover = {};
        def.dims.type.categories = { a: {}, b: {}, n: {}, sum: {} };
        def.marks.stack = "@type != 'sum'";
        def.dims.half = { column: 'half', type: 'categorical', fromData: true, hover: { cell: false } };
        def.hover = { total: 'Gesamt', title: '{half}: {total}' };
        const data = 'year,value,land,type,half\n2020,5,Wien,a,H1\n2020,2,Wien,b,H1\n2020,-1,Wien,n,H1\n2020,6,Wien,sum,H1';
        const el = await mount({ def, data });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const total = el.querySelector('.vis-hover tr.vis-hover-total');
        expect([...total.querySelectorAll('td')].map(t => t.textContent).filter(Boolean)).toEqual(['Gesamt', '6,0']);
        expect(el.querySelector('.vis-hover-title').textContent).toBe('H1: 6,0');
        expect(el.querySelectorAll('.vis-hover td[data-dim="half"]')).toHaveLength(0);
        // the rows of the table are the rows before the total
        expect(total.previousElementSibling.classList.contains('vis-hover-entry')).toBe(true);
        // the name is in the column of the names of the rows, after their swatches
        const entry = [...total.previousElementSibling.querySelectorAll('td')];
        expect(entry[0].classList.contains('vis-swatch')).toBe(true);
        expect([...total.querySelectorAll('td')].findIndex(t => t.textContent == 'Gesamt')).toBe(1);
        // true: the name of the locale
        def.hover.total = true;
        const named = await mount({ def, data });
        named.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        expect(named.querySelectorAll('.vis-hover tr.vis-hover-total td')[1].textContent).toBe('Gesamt');
    });

    test('a row which is not stacked is not the nearest one in a segment of a stack', async () => {
        const { nearestRow } = await import('@/comp/facet-hover');
        const rows = [{ y: 6, t: 'sum' }, { y: 5, t: 'a' }, { y: 2, t: 'b' }];
        const stacks = new Map([[rows[1], [0, 5]], [rows[2], [5, 7]]]);
        const stackOf = r => stacks.get(r) ?? [r.y, r.y];
        const isStacked = r => stacks.has(r);
        expect(nearestRow(rows, 6, 'y', stackOf, isStacked).t).toBe('b');
        expect(nearestRow(rows, 8, 'y', stackOf, isStacked).t).toBe('b');
        expect(nearestRow(rows, 6, 'y', stackOf).t).toBe('sum');
    });
});

describe('periods of dates (interval)', () => {
    const def = () => ({
        width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, locale: 'de',
        dims: {
            x: { column: 'date', type: 'date', interval: 'half', hover: {} },
            y: { column: 'value', type: 'numeric', zero: true },
        },
        marks: [{ type: 'bar', id: 'bars', fill: 'red' },
            { type: 'point', id: 'mid', x: '@x:scaled:center', y: '=literal(0)', r: '=@x:step / 10' },
            { type: 'point', id: 'scaled', y: '@x:scaled:start', r: 1 }],
    });
    const data = 'date,value\n2023-01-01,1\n2023-07-01,2\n2024-01-01,3';

    test('the domain to the end of the last period, bars in the middle of theirs, the step of a period, the hover of the period', async () => {
        const el = await mount({ def: def(), data });
        // three halves of a year in 550 pixels, without the extension of 2%
        const rects = [...el.querySelectorAll('[data-mark="bars"] rect')].map(r => [+r.getAttribute('x'), +r.getAttribute('width')]);
        const half = 550*181/(365 + 182);
        expect(rects[0][1]).toBeCloseTo(0.8*half, 0);
        expect(rects[0][0]).toBeCloseTo(0.1*half, 0);
        const circles = [...el.querySelectorAll('[data-mark="mid"] circle')];
        expect(+circles[0].getAttribute('cx')).toBeCloseTo(half/2, 0);
        expect(+circles[0].getAttribute('r')).toBeCloseTo(half/10, 0);
        // @x:scaled is the middle of the period, @x:scaled:start its start
        const scaled = el.querySelector('[data-mark="scaled"] circle');
        expect([+scaled.getAttribute('cx'), +scaled.getAttribute('cy')].map(Math.round)).toEqual([Math.round(half/2), 0]);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 100 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').textContent).toBe('H1 2023');
        expect(errors).toEqual([]);
    });

    test('the half of a year in formats, validateDef of intervals', async () => {
        const { getLocale } = await import('@/utils/locale');
        expect(getLocale('de').time.format('%K. Halbjahr %Y')(new Date(2023, 8, 1))).toBe('2. Halbjahr 2023');
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ ...def(), dims: { ...def().dims, x: { ...def().dims.x, interval: 'fortnight' } } }).filter(w => w.includes('interval')))
            .toEqual([`dims.x.interval: expected minute, hour, day, week, month, quarter, half, year or a number of them, e.g. "6 months"`]);
    });

    test('of a time scale only: a band scale of dates is a band per date, its hover works', async () => {
        const banded = def();
        banded.dims.x = { ...banded.dims.x, type: 'categorical', scale: { type: 'band' } };
        const { validateDef } = await import('@/utils/validate');
        const dated = { ...banded, dims: { ...banded.dims, x: { ...banded.dims.x, type: 'date' } } };
        expect(validateDef(dated).filter(w => w.includes('interval'))).toEqual([`dims.x.interval: the periods of a time or utc scale, not of a band one`]);
        const el = await mount({ def: dated, data });
        const rects = [...el.querySelectorAll('[data-mark="bars"] rect')];
        expect(rects).toHaveLength(3);
        expect(new Set(rects.map(r => r.getAttribute('width'))).size).toBe(1);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 100 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').textContent).toBe('H1 2023');
        expect(errors).toEqual([]);
    });
    test('a period starts at its date, also of several units which do not start at a multiple of them', async () => {
        const { intervalOf } = await import('@/utils/scales');
        const days = (spec, date) => (+intervalOf(spec, true).offset(new Date(date)) - Date.parse(date))/864e5;
        // a half year of a fiscal year from April, a quarter from February, 3 days from the 31st
        expect(days('half', '2023-04-01T00:00Z')).toBe(183);
        expect(days('quarter', '2023-02-01T00:00Z')).toBe(89);
        expect(days('3 days', '2023-01-31T00:00Z')).toBe(3);
        expect(days('2 weeks', '2023-01-02T00:00Z')).toBe(14);
        expect(days('2 years', '2023-01-01T00:00Z')).toBe(731);
        expect(days('month', '2023-02-01T00:00Z')).toBe(28);
        expect(intervalOf('0 months')).toBe(null);
        // bars of half years from April and October, of the same width
        const d = def();
        d.dims.x.scale = { type: 'utc' };
        const el = await mount({ def: d, data: 'date,value\n2023-04-01,1\n2023-10-01,2' });
        const widths = [...el.querySelectorAll('[data-mark="bars"] rect')].map(r => Math.round(+r.getAttribute('width')));
        expect(widths[0]).toBe(widths[1]);
        expect(errors).toEqual([]);
    });
});

describe('the ticks of whole numbers and of periods', () => {
    const labels = el => [...el.querySelectorAll('g.vis-axis-bottom g.tick text')].map(t => t.textContent);
    const dated = (interval, data) => ({
        width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, locale: 'de',
        dims: {
            x: { column: 'date', type: 'date', interval, ticks: 10, hover: {} },
            y: { column: 'value', type: 'numeric', zero: true },
        },
        marks: [{ type: 'bar', id: 'bars', fill: 'red' }],
    });

    test('years of a numeric x: whole ticks without a thousands separator, other numbers as before', async () => {
        const years = lineDef();
        years.dims.x.ticks = 10;
        const el = await mount({ def: years, data: 'year,value,land\n2001,1,Wien\n2002,2,Wien\n2003,3,Wien' });
        expect(labels(el)).toEqual(['2001', '2002', '2003']);
        // the y values are whole too, 10 ticks of 1 to 3 are 1, 2, 3
        expect([...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent)).toEqual(['1', '2', '3']);
        // decimals of the data, and a domain beyond 10 000 with separators
        const el2 = await mount({ def: years, data: 'year,value,land\n0.5,1,Wien\n2,2,Wien' });
        expect(labels(el2)).toContain('0,6');
        const el3 = await mount({ def: years, data: 'year,value,land\n0,1,Wien\n20000,2,Wien' });
        expect(labels(el3)).toContain('10.000');
        expect(errors).toEqual([]);
    });

    test('whole numbers of the data: the ticks of a fixed domain between them and of a dim of the same scale are not left out', async () => {
        const left = el => [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => t.textContent);
        const fixed = await mount({ def: { locale: 'en', dims: { x: 'k', y: { column: 'v', domain: [0, 0.5] } }, marks: [{ type: 'point' }] }, data: 'k,v\n1,0\n2,1' });
        expect(left(fixed).length).toBeGreaterThan(2);
        expect(left(fixed).map(Number)).toContain(0.5);
        const borrowed = await mount({ def: { locale: 'en', dims: { x: 'k', y: 'v', y2: { column: 'w', scale: { of: 'y' } } }, marks: [{ type: 'point' }, { type: 'point', y: 'y2' }] },
            data: 'k,v,w\n1,0,0.5\n2,1,0.7' });
        expect(left(borrowed).length).toBeGreaterThan(2);
        expect(left(borrowed).map(Number)).toContain(0.5);
        expect(errors).toEqual([]);
    });

    test('the ticks of days are whole days, of hours whole hours; hours and minutes are intervals', async () => {
        const days = await mount({ def: dated('day'), data: 'date,value\n2024-03-01,1\n2024-03-02,2\n2024-03-03,3' });
        expect(labels(days).some(t => t.includes(':'))).toBe(false);
        expect(labels(days).length).toBeGreaterThanOrEqual(2);
        const hours = await mount({ def: dated('hour'), data: 'date,value\n2024-03-01 10:00,1\n2024-03-01 11:00,2\n2024-03-01 12:00,3' });
        expect(labels(hours)).toEqual(['10:00', '11:00', '12:00', '13:00']);
        const rects = [...hours.querySelectorAll('[data-mark="bars"] rect')].map(r => +r.getAttribute('width'));
        expect(rects).toHaveLength(3);
        // 80% of an hour of 3 hours in 550 pixels
        rects.forEach(w => expect(w).toBeCloseTo(0.8*550/3, 0));
        hours.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 100 }));
        await nextTick();
        expect(hours.querySelector('.vis-hover-title').textContent).toBe('01.03.2024 10:00');
        const minutes = await mount({ def: dated('15 minutes'), data: 'date,value\n2024-03-01 10:00,1\n2024-03-01 10:15,2' });
        expect(minutes.querySelectorAll('[data-mark="bars"] rect')).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('the ticks of quarters, halves and several units are the starts of the periods, not of their months', async () => {
        const ticks = el => [...el.querySelectorAll('g.vis-axis-bottom g.tick')].map(t => new Date(t[itemOf]).toISOString().slice(0, 7));
        const monthly = n => 'date,value\n' + Array.from({ length: n }, (_, i) => `2024-${String(3*i + 1).padStart(2, '0')}-01,${i + 1}`).join('\n');
        const utc = interval => {
            const def = dated(interval);
            def.dims.x.scale = { type: 'utc' };
            return def;
        };
        const quarters = await mount({ def: utc('quarter'), data: monthly(3) });
        expect(ticks(quarters)).toEqual(['2024-01', '2024-04', '2024-07', '2024-10']);
        const halves = await mount({ def: utc('half'), data: 'date,value\n2024-04-01,1\n2024-10-01,2' });
        expect(ticks(halves)).toEqual(['2024-04', '2024-10', '2025-04']);
        const six = await mount({ def: utc('6 months'), data: 'date,value\n2024-01-01,1\n2024-07-01,2' });
        expect(ticks(six)).toEqual(['2024-01', '2024-07', '2025-01']);
        // many periods: every n-th start
        const years = await mount({ def: utc('quarter'), data: 'date,value\n' + Array.from({ length: 40 }, (_, i) => `${2010 + Math.floor(i/4)}-${String(3*(i % 4) + 1).padStart(2, '0')}-01,1`).join('\n') });
        expect(ticks(years).every(t => ['01', '04', '07', '10'].includes(t.slice(5)))).toBe(true);
        expect(ticks(years).length).toBeGreaterThan(3);
        expect(errors).toEqual([]);
    });

    test('an unknown interval is an error naming it, not one of the width of bars', async () => {
        const el = await mount({ def: dated('fortnight'), data: 'date,value\n2024-03-01,1\n2024-03-15,2' });
        expect(el.querySelector('.vis-error')?.textContent ?? errors.join(' ')).toMatch(/Unknown interval 'fortnight' of 'x', expected minute, hour, day/);
        errors.length = 0;
    });
});

describe('the categories of band and point scales in the order of the categories', () => {
    const def = () => ({
        width: 400, height: 200, margins: { top: 10, right: 10, bottom: 30, left: 30 },
        dims: {
            x: { column: 'land', categories: { Wien: {}, Tirol: {}, Burgenland: {} }, scale: { type: 'point' } },
            y: { column: 'value', type: 'numeric' },
        },
        marks: [{ type: 'line', id: 'line' }, { type: 'area', id: 'area' }, { type: 'point', id: 'dots', r: 2 }],
    });
    // the rows in another order than the categories
    const data = 'land,value\nBurgenland,1\nTirol,2\nWien,3';

    test('the points of the scale and the lines and areas through them in this order, not the one of the rows', async () => {
        const el = await mount({ def: def(), data });
        const cx = [...el.querySelectorAll('[data-mark="dots"] circle')].map(c => +c.getAttribute('cx'));
        // Burgenland, Tirol, Wien in the rows, the last one at the right
        expect(cx[0]).toBeGreaterThan(cx[1]);
        expect(cx[1]).toBeGreaterThan(cx[2]);
        for (const mark of ['line', 'area']) {
            const d = el.querySelector(`[data-mark="${mark}"] path`).getAttribute('d');
            const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map(m => +m[1]).slice(0, 3);
            expect(xs.map(Math.round)).toEqual([...cx].sort((a, b) => a - b).map(Math.round));
        }
        expect(errors).toEqual([]);
    });
});

describe('the hover of the stacks of stackBy', () => {
    test('the class under the pointer, its marker in the middle of the class', async () => {
        const def = {
            width: 440, height: 240, margins: { top: 10, right: 20, bottom: 30, left: 20 },
            transform: { type: 'bin', column: 'v', edges: [0, 5, 10], by: 'g', start: 'lo', end: 'hi' },
            dims: {
                x: { column: 'v', type: 'numeric', domain: [0, 10], pad: 0 },
                lo: { column: 'lo', type: 'numeric', hover: {} },
                y: { column: 'count', type: 'numeric', zero: true, hover: {} },
                g: { column: 'g', type: 'categorical', categories: { a: {}, b: {} }, hover: {} },
            },
            marks: { type: 'bar', by: 'g', stack: true, x0: 'lo', x1: 'hi' },
        };
        const el = await mount({ def, data: 'v,g\n1,a\n2,b\n3,b\n7,a' });
        const at = async x => {
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: x, clientY: 100 }));
            await nextTick();
            return [el.querySelector('.vis-hover-title').textContent, Math.floor(+el.querySelector('g.vis-hover-marker line').getAttribute('x1'))];
        };
        // 400 pixels of 0 to 10 (the pointer in the coordinates of the plot
        // area here): the right half of the first class is the first one
        expect(await at(180)).toEqual(['0', 100]);
        expect(await at(220)).toEqual(['5', 300]);
        expect(await at(390)).toEqual(['5', 300]);
        expect(await at(5)).toEqual(['0', 100]);
        expect(errors).toEqual([]);
    });
});

describe('texts in several languages', () => {
    const def = () => ({
        width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 50 }, language: '@lang',
        title: { de: 'Bevölkerung', en: 'Population' }, subtitle: { de: 'nach Bundesland', en: 'by state' }, source: 'Statistik Austria',
        globals: { lang: 'de' },
        controls: [{ type: 'radio', global: 'lang', name: { de: 'Sprache', en: 'Language' }, values: [
            { value: 'de', name: 'Deutsch' }, { value: 'en', name: { de: 'Englisch', en: 'English' } }] }],
        dims: {
            x: { column: 'year', type: 'numeric', format: 'd', axis: { title: { name: { de: 'Jahr', en: 'Year' } } } },
            y: { column: 'value', type: 'numeric', format: ',.1f', hover: {} },
            c: { column: 'land', name: { de: 'Land', en: 'State' }, legend: {}, hover: {},
                categories: { Wien: { name: { de: 'Wien', en: 'Vienna' } }, Tirol: { name: 'Tirol' } } },
        },
        marks: { type: 'line', by: 'c' },
        annotations: [{ type: 'line', y: 2500, label: { de: 'Ziel', en: 'Target' } }],
    });
    const data = 'year,value,land\n2020,1000,Wien\n2021,2000,Wien\n2020,3000,Tirol\n2021,3500,Tirol';
    const texts = el => ({
        title: el.querySelector('.vis-title').textContent,
        subtitle: el.querySelector('.vis-subtitle').textContent,
        form: [el.querySelector('.vis-control-title').textContent, ...[...el.querySelectorAll('.vis-radio label')].map(l => l.textContent)],
        legend: [el.querySelector('.vis-legend-title').textContent, ...[...el.querySelectorAll('.vis-legend-entry span')].map(s => s.textContent)],
        axis: el.querySelector('.vis-axis-title').textContent,
        // the numbers of the locale: 1.000,0 (de) or 1,000.0 (en)
        tick: [...el.querySelectorAll('.vis-axis-left .tick text')].map(t => t.textContent).some(t => /^\d\.\d{3},\d$/.test(t)) ? 'de' : 'en',
        label: el.querySelector('.vis-annotation-label')?.textContent,
    });

    test('the texts of the language of a global, the locale of the numbers with it, a switch of the language', async () => {
        const el = await mount({ def: def(), data });
        expect(texts(el)).toEqual({ title: 'Bevölkerung', subtitle: 'nach Bundesland', form: ['Sprache:', 'Deutsch', 'Englisch'],
            legend: ['Land', 'Wien', 'Tirol'], axis: 'Jahr', tick: 'de', label: 'Ziel' });
        // a hidden entry stays hidden in the other language
        el.querySelector('.vis-legend-entry[data-key="Tirol"]').click();
        el.querySelectorAll('.vis-radio input')[1].click();
        await nextTick();
        expect(texts(el)).toEqual({ title: 'Population', subtitle: 'by state', form: ['Language:', 'Deutsch', 'English'],
            legend: ['State', 'Vienna', 'Tirol'], axis: 'Year', tick: 'en', label: 'Target' });
        expect(el.querySelector('.vis-legend-entry[data-key="Tirol"]').dataset.visible).toBe('false');
        expect(errors).toEqual([]);
    });

    test('the names of months and days of a format transform are the ones of the locale, also after a switch of the language', async () => {
        const d = def();
        d.transform = { type: 'format', column: 'date', format: '%b', as: 'month' };
        d.dims.m = { column: 'month', hover: {} };
        const { el, vis } = await mountVis({ def: d, data: 'year,value,land,date\n2020,1000,Wien,2020-03-01\n2021,2000,Wien,2021-05-01\n2020,3000,Tirol,2020-03-01\n2021,3500,Tirol,2021-05-01' });
        const months = () => vis.store.columns.get('month');
        expect(months()).toEqual(['Mrz', 'Mai', 'Mrz', 'Mai']);
        el.querySelectorAll('.vis-radio input')[1].click();
        await nextTick();
        expect(months()).toEqual(['Mar', 'May', 'Mar', 'May']);
        expect(errors).toEqual([]);
    });

    test('the language of the locale, of its region, the first text of another one; a locale of its own', async () => {
        const of = async options => texts(await mount({ def: { ...def(), ...options }, data }));
        expect((await of({ language: undefined, locale: 'en' })).title).toBe('Population');
        expect((await of({ language: 'en-GB' })).title).toBe('Population');
        expect((await of({ language: 'fr' })).title).toBe('Bevölkerung');
        // the numbers of the locale, the texts of the language
        const own = await of({ language: 'en', locale: 'de' });
        expect([own.title, own.tick]).toEqual(['Population', 'de']);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def())).toEqual([]);
        expect(errors).toEqual([]);
    });
});

describe('labels inside the bands of an area mark (place)', () => {
    // two thick bands and a thin one, stacked, a label per category inside its band
    const def = (coord = 'cartesian') => ({
        coord, width: 600, height: 300, margins: { top: 10, right: 10, bottom: 30, left: 40 },
        dims: {
            x: { column: 'hour', type: 'numeric', domain: [0, 23], pad: 0 },
            y: { column: 'value', type: 'numeric', zero: true, pad: 0 },
            c: { column: 'c', legend: {}, categories: { a: { name: 'Erster' }, b: { name: 'Zweiter' }, thin: { name: 'Dünn' } } },
        },
        marks: [
            { id: 'areas', type: 'area', by: 'c', stack: true, curve: coord == 'polar' ? 'catmullRomClosed' : 'monotoneX' },
            { id: 'names', type: 'text', by: 'c', place: { in: 'areas' }, halo: true, text: '@name', 'font-size': 11, fill: 'black' },
        ],
    });
    const data = 'hour,c,value\n' + Array.from({ length: 24 }, (_, h) => [`${h},a,${10 + Math.sin(h/4)*3}`, `${h},b,${8}`, `${h},thin,0.2`]).flat().join('\n');
    const labels = el => [...el.querySelectorAll('[data-mark="names"] text')];

    test('a label per band where it fits, centered, inside the band, none of a thin band; again of a hidden category', async () => {
        const el = await mount({ def: def(), data });
        expect(labels(el).map(t => t.textContent).sort()).toEqual(['Erster', 'Zweiter']);
        expect(labels(el).every(t => t.getAttribute('text-anchor') == 'middle' && t.getAttribute('dominant-baseline') == 'central')).toBe(true);
        // the scale of y of 0 to about 21.3 in 260 pixels: a (0 to 10 ± 3) is below b
        const y = t => +t.getAttribute('y');
        const [first, second] = ['Erster', 'Zweiter'].map(n => labels(el).find(t => t.textContent == n));
        expect(y(first)).toBeGreaterThan(y(second));
        // b without a: the whole plot area of 260 pixels, the label in its middle
        el.querySelector('.vis-legend-entry[data-key="a"]').click();
        await nextTick();
        expect(labels(el).map(t => t.textContent)).toEqual(['Zweiter']);
        expect(Math.abs(y(labels(el)[0]) - 130)).toBeLessThan(10);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def())).toEqual([]);
        const bad = def();
        bad.marks[1] = { ...bad.marks[1], place: { in: 'names' }, select: { max: 'y' } };
        expect(validateDef(bad).filter(w => w.includes('place') || w.includes('select'))).toEqual([
            `marks[1].place.in: expected an area mark, not one of 'svg:text'`,
            `marks[1].select: the labels inside of bands are placed at the positions of all their rows, without a select`]);
        expect(errors).toEqual([]);
    });

    test('in polar charts inside of their rings, in the SVG of the export', async () => {
        const el = await mount({ def: def('polar'), data });
        expect(labels(el).map(t => t.textContent).sort()).toEqual(['Erster', 'Zweiter']);
        const vis = createGenVis(document.body.appendChild(document.createElement('div')), { def: def(), data });
        await rendered(vis.el);
        const svg = await vis.exportSvg({ parts: ['plot'] });
        expect(svg).toContain('>Erster</text>');
        expect(errors).toEqual([]);
    });
});

describe('legend symbols of categories (review of 4.1)', () => {
    test('"symbol": null of a category: no symbol, also with one of the legend', async () => {
        const values = [{ year: 2020, v: 1, c: 'A' }, { year: 2021, v: 2, c: 'A' }, { year: 2020, v: 2, c: 'B' }, { year: 2021, v: 3, c: 'B' }];
        const el = await mount({ def: { width: 500, height: 300,
            dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'v', type: 'numeric' },
                color: { column: 'c', fromData: true, legend: { position: 'top', symbol: 'rect' }, categories: { A: { symbol: null } } } },
            marks: [{ type: 'line', by: 'color' }] }, data: values });
        const svg = key => !!el.querySelector(`.vis-legend-entry[data-key="${key}"] svg`);
        expect([svg('A'), svg('B')]).toEqual([false, true]);
    });
});

describe('a channel of no dim and no column (review of 5.0)', () => {
    test('a named warning with the dims and the columns', async () => {
        await mount({ def: { dims: { x: 'year', y: 'value' }, marks: { type: 'point', x: 'yaer' } }, data: 'year,value\n2020,1\n2021,2' });
        expect(errors).toContain("gen-vis inline definition: marks[0].x: no dim and no column 'yaer' in the data, the dims are 'x', 'y', the columns 'year', 'value'");
    });
    test('a reference of an attribute to a column without a dim, or to the column of a dim: a warning of the load', async () => {
        const def = { dims: { x: { column: 'a', type: 'categorical' }, y: 'b' },
            marks: [{ type: 'bar' }, { type: 'label', text: "=cat(@note, '/', @y)", fill: '@b', highlight: { opacity: '@note' } }] };
        await mount({ def, data: 'a,b,note\nX,1,n1\nY,2,n2' });
        expect(errors).toEqual([
            "gen-vis inline definition: marks[1].fill: '@b' is the column of the dim 'y', a reference names the dim: @y",
            `gen-vis inline definition: marks[1].text: '@note' is a column of the data without a dim, it has no value: a reference names a dim, e.g. "dims": { "note": "note" }`,
            `gen-vis inline definition: marks[1].highlight.opacity: '@note' is a column of the data without a dim, it has no value: a reference names a dim, e.g. "dims": { "note": "note" }`,
        ]);
        errors.length = 0;
        // of a dim of it, a global of the same name: no warning
        await mount({ def: { ...def, globals: { b: 1 }, dims: { ...def.dims, note: 'note' } }, data: 'a,b,note\nX,1,n1\nY,2,n2' });
        expect(errors).toEqual([]);
    });
    test('a chart without dims of the columns of the channels', async () => {
        const el = await mount({ def: { marks: { type: 'point', x: 'year', y: 'value' } }, data: 'year,value\n2020,1\n2021,2' });
        expect([...el.querySelectorAll('g.vis-mark circle')].every(c => Number.isFinite(parseFloat(c.getAttribute('cx'))))).toBe(true);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(2);
        expect(errors).toEqual([]);
    });
});

describe('texts of expressions of other names than globals (review of 5.0)', () => {
    const data = 'year,value\n2020,1\n2021,2';
    const base = { dims: { x: 'year', y: 'value' }, marks: { type: 'point' } };
    test('evaluated in the scope of the chart, e.g. of its width', async () => {
        const el = await mount({ def: { ...base, title: "=cat('W ', @totalWidth)", subtitle: '=@lang', source: "=match(@lang, {en: 'Source'}, 'Quelle')" }, data, globals: { lang: 'en' } });
        expect(el.querySelector('.vis-title').textContent).toBe('W 800');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('en');
        expect(errors).toEqual([]);
    });
    test('of html (the source) the texts of the names are text, the ones of the expression html', async () => {
        const el = await mount({ def: { ...base, source: "=cat('<b>', @who, '</b>')" }, data, globals: { who: '<i>x</i>' } });
        const footer = el.querySelector('.vis-footer');
        expect(footer.querySelector('b').textContent).toBe('<i>x</i>');
        expect(footer.querySelector('i')).toBeNull();
    });
    test('a name which is no global and no size has no value, the text is never the expression, a warning once', async () => {
        const el = await mount({ def: { ...base, title: "=match(@lang, {en: 'Population'}, 'Bevölkerung')", subtitle: "=match(@lang, {en: 'by state'})" }, data });
        expect(el.querySelector('.vis-title').textContent).toBe('Bevölkerung');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('');
        expect(errors).toEqual([
            `gen-vis inline definition: the text "=match(@lang, {en: 'Population'}, 'Bevölkerung')" names 'lang', no global (of "globals" or a control) and no size (totalWidth): no value`,
            `gen-vis inline definition: the text "=match(@lang, {en: 'by state'})" names 'lang', no global (of "globals" or a control) and no size (totalWidth): no value`,
        ]);
    });
});

describe('the names of the categories on the axes', () => {
    test('a category with a name of its own is labelled by it, the others by their key, labels.props.text before it', async () => {
        const def = { width: 400, height: 200, dims: { x: { column: 'd', type: 'categorical', categories: { 1: { name: 'Mon' }, 2: {}, 3: { name: 'Wed' } } }, y: 'v' }, marks: { type: 'bar' } };
        const data = 'd,v\n1,1\n2,2\n3,3';
        const texts = el => [...el.querySelectorAll('g.vis-axis-bottom g.tick text')].map(t => t.textContent);
        expect(texts(await mount({ def, data }))).toEqual(['Mon', '2', 'Wed']);
        const own = { ...def, dims: { ...def.dims, x: { ...def.dims.x, axis: { labels: { props: { text: '=cat(@x, \'!\')' } } } } } };
        expect(texts(await mount({ def: own, data }))).toEqual(['1!', '2!', '3!']);
    });
});
