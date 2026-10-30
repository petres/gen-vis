// @vitest-environment jsdom
// the parts of 3.0 which make definitions more flexible: patches of all parts
// of a definition, globals of the page, filters, props, scales, the hover,
// the highlight, legends, texts, transforms and messages
import { describe, test, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { GenVis } from '@/index.js';
import { errors, useDom, mount } from './dom.js';

useDom();

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom', ticks: 5 } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left', ticks: 5 }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, props: { categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } } },
    },
    plot: [
        { id: 'lines', type: 'cartesian:line', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } } },
        { id: 'dots', type: 'svg:circle', categories: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } },
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

const select = async (el, id) => {
    el.querySelector(`.vis-form-element input[value="${id}"]`).click();
    await nextTick();
};

describe('patches of the entries of form elements', () => {
    const patchedDef = () => ({
        ...lineDef({ title: 'Werte von {group:name}' }),
        globals: { group: 'all' },
        formElements: [{ id: 'group', name: 'Gruppe', ref: 'group', type: 'radio', values: [
            { id: 'all', name: 'Alle', value: 'all' },
            { id: 'wien', name: 'Wien', value: 'wien', globals: { unit: 'Personen' }, patch: {
                options: { subtitle: 'in {unit}', height: 200 },
                filter: { c: 'Wien' },
                plot: [{ id: 'dots', props: { r: 5 } }],
            } },
        ] }],
    });

    test('the options, the filter and the plots, the names of the entries in the texts', async () => {
        const el = await mount(GenVis, { def: patchedDef(), data: lineData });
        expect(el.querySelector('.vis-title').textContent).toBe('Werte von Alle');
        expect(el.querySelectorAll('g.vis-plot circle')).toHaveLength(7);
        expect(el.querySelector('svg.vis-svg').getAttribute('height')).toBe('300');

        await select(el, 'wien');
        expect(el.querySelector('.vis-title').textContent).toBe('Werte von Wien');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('in Personen');
        expect(el.querySelector('svg.vis-svg').getAttribute('height')).toBe('200');
        const circles = el.querySelectorAll('g.vis-plot circle');
        expect(circles).toHaveLength(3);
        expect(circles[0].getAttribute('r')).toBe('5');

        // back to the definition
        await select(el, 'all');
        expect(el.querySelectorAll('g.vis-plot circle')).toHaveLength(7);
        expect(el.querySelector('g.vis-plot circle').getAttribute('r')).toBe('3');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('');
        expect(errors).toEqual([]);
    });

    test('a patch of the geometry of a map, e.g. other features', async () => {
        const square = (id, x) => ({ type: 'Feature', id, properties: { name: id },
            geometry: { type: 'Polygon', coordinates: [[[x, 0], [x, 1], [x + 1, 1], [x + 1, 0], [x, 0]]] } });
        const def = {
            options: { coord: 'geo', width: 300, height: 100 },
            geo: { data: { type: 'FeatureCollection', features: [square('A', 0), square('B', 2), square('C', 4)] }, join: 'region' },
            globals: { view: 'all' },
            formElements: [{ id: 'view', name: 'Karte', ref: 'view', type: 'radio', values: [
                { id: 'all', name: 'Alle', value: 'all' },
                { id: 'ab', name: 'A und B', value: 'ab', patch: { geo: { include: ['A', 'B'] } } },
            ] }],
            mapping: { region: { column: 'region', type: 'categorical' }, value: { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } } },
            plot: [{ type: 'geo:base', props: { fill: '#EEE' } }],
        };
        const el = await mount(GenVis, { def, data: 'region,value\nA,1\nB,2' });
        expect(el.querySelectorAll('.vis-features path')).toHaveLength(3);
        await select(el, 'ab');
        expect(el.querySelectorAll('.vis-features path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});

describe('globals of the page', () => {
    const def = () => ({
        ...lineDef({ title: '{titleText}{suffix}' }),
        globals: { lang: 'de', titleText: 'Werte', suffix: '' },
        formElements: [{ id: 'lang', ref: 'lang', type: 'hidden', values: [
            { id: 'de', value: 'de', globals: { titleText: 'Werte' } },
            { id: 'en', value: 'en', globals: { titleText: 'Values' }, patch: { mapping: { c: { props: { categories: { Wien: { name: 'Vienna' } } } } } } },
        ] }],
    });

    test('a hidden form element is set by the page, not by the user', async () => {
        const { createApp, h, ref } = await import('vue');
        const globals = ref({ lang: 'en' });
        const states = [];
        const el = document.body.appendChild(document.createElement('div'));
        createApp({ render: () => h(GenVis, { def: def(), data: lineData, globals: globals.value, 'onUpdate:state': s => states.push(s) }) }).mount(el);
        await (await import('./dom.js')).rendered(el);
        await nextTick();
        expect(el.querySelector('.vis-form-element')).toBeNull();
        expect(el.querySelector('.vis-title').textContent).toBe('Values');
        expect(el.querySelector('.vis-legend-entry[data-key="Wien"]').textContent).toBe('Vienna');

        globals.value = { lang: 'de' };
        await nextTick();
        await nextTick();
        expect(el.querySelector('.vis-title').textContent).toBe('Werte');
        expect(el.querySelector('.vis-legend-entry[data-key="Wien"]').textContent).toBe('Wien');
        // an unknown value of a form element is ignored, other globals are set
        globals.value = { lang: 'fr', suffix: '!' };
        await nextTick();
        await nextTick();
        expect(el.querySelector('.vis-title').textContent).toBe('Werte!');
        // not a change of the user
        expect(states).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('data-globals of the standalone script', async () => {
        const { mountGenVisElement } = await import('@/index.js');
        const el = document.body.appendChild(document.createElement('div'));
        el.dataset.def = JSON.stringify(def());
        el.dataset.data = lineData;
        el.dataset.globals = '{"lang": "en"}';
        mountGenVisElement(el);
        await (await import('./dom.js')).rendered(el);
        expect(el.querySelector('.vis-title').textContent).toBe('Values');
    });
});

describe('filters of rows', () => {
    test('values, lists, missing values, not and ranges, also of references', async () => {
        const { rowFilter, filter } = await import('@/utils/data');
        const mapping = { x: { type: 'numeric' }, d: { type: 'date' }, c: { type: 'categorical' } };
        const rows = [
            { x: 1, d: new Date(2020, 0, 1).getTime(), c: 'a' },
            { x: 2, d: new Date(2021, 0, 1).getTime(), c: 'b' },
            { x: null, d: null, c: 'c' },
        ];
        const keep = (conditions, scope) => filter(rows, rowFilter(conditions, mapping, scope)).map(r => r.c);
        expect(keep({ x: 1 })).toEqual(['a']);
        expect(keep({ x: '2' })).toEqual(['b']);
        expect(keep({ c: ['a', 'c'] })).toEqual(['a', 'c']);
        expect(keep({ x: null })).toEqual(['c']);
        expect(keep({ x: { not: null } })).toEqual(['a', 'b']);
        expect(keep({ c: { not: ['a'] } })).toEqual(['b', 'c']);
        expect(keep({ d: { range: ['2020-06-01', null] } })).toEqual(['b']);
        expect(keep({ x: { range: [null, '@max'] } }, { max: 1 })).toEqual(['a']);
        expect(keep({ c: '@c', x: { not: null } }, { c: 'b' })).toEqual(['b']);
        expect(() => rowFilter({ x: { from: 1 } }, mapping)).toThrow('filter.x: expected');
    });

    test('of a plot and of the hover', async () => {
        const def = lineDef();
        def.plot[1].filter = { c: 'Wien', y: { not: null } };
        def.options.hover = { filter: { c: 'Tirol' } };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelectorAll('g.vis-plot[data-plot="dots"] circle')).toHaveLength(3);
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        expect([...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(r => r.textContent)).toEqual(['Tirol2,0']);
        expect(errors).toEqual([]);
    });
});

describe('props', () => {
    test('margins of the width of the visualisation, offsets and matches of plots', async () => {
        const def = lineDef();
        def.options.margins.left = { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 20 }, { cut: 500, value: 100 }] };
        def.mapping.x.scale.domainRel = [0, 0];
        def.plot[1].props.cx = { prop: 'relative', ref: 'x:scaled', offset: -5 };
        def.plot[1].props.r = { prop: 'match', ref: 'c', cases: { Wien: 6 }, default: 2 };
        const el = await mount(GenVis, { def, data: lineData });
        expect(el.querySelector('svg.vis-svg > g').getAttribute('transform')).toBe('translate(100 10)');
        const wien = el.querySelector('g.vis-group[data-group-c="Wien"] circle');
        const tirol = el.querySelector('g.vis-group[data-group-c="Tirol"] circle');
        expect([wien.getAttribute('cx'), wien.getAttribute('r'), tirol.getAttribute('r')]).toEqual(['-5', '6', '2']);
        expect(errors).toEqual([]);
    });
});

describe('scales', () => {
    test('include, center and the classes closed on the right', async () => {
        const { makeScale } = await import('@/utils/scales');
        const rows = [{ v: 2 }, { v: 6 }];
        const scale = (s, type = 'numeric') => makeScale('v', { type, scale: { type: 'linear', orientation: 'horizontal', domain: [null, null], domainRel: [0, 0], ...s } }, rows, { coord: { ranges: { horizontal: [0, 100] } } });
        expect(scale({ include: 0 }).domain()).toEqual([0, 6]);
        expect(scale({ include: [10, '@max'] }).domain()).toEqual([2, 10]);
        expect(makeScale('v', { type: 'numeric', scale: { type: 'linear', domain: [null, null], include: ['@max'] } }, rows, { scope: { max: 20 } }).domain()).toEqual([2, 20]);
        expect(scale({ center: 0 }).domain()).toEqual([-6, 6]);
        expect(scale({ include: 0, domainRel: [-0.5, 0.5] }).domain()).toEqual([-3, 9]);
        // fixed ends stay
        expect(scale({ include: 10, domain: [null, 8] }).domain()).toEqual([2, 8]);

        const classes = closed => makeScale('v', { type: 'numeric', scale: { type: 'threshold', domain: [74.5, 89.5], range: ['red', 'orange', 'green'], closed } }, rows);
        expect([74.5, 74.6, 89.5, 90].map(classes())).toEqual(['orange', 'orange', 'green', 'green']);
        const right = classes('right');
        expect([74.4, 74.5, 74.6, 89.5, 90].map(right)).toEqual(['red', 'red', 'orange', 'orange', 'green']);
        expect(right.invertExtent('orange')).toEqual([74.5, 89.5]);
        expect(right.copy()(74.5)).toBe('red');
    });

    test('the sizes of bands and the positions of values as references', async () => {
        const def = lineDef();
        def.mapping.y = { column: 'land', type: 'categorical', scale: { type: 'band', orientation: 'vertical', padding: 0 } };
        def.mapping.x.scale.domainRel = [0, 0];
        def.plot = [{ id: 'zero', type: 'svg:rect', props: { x: '@x:scaled:2021', y: '@y:scaled', height: '@y:bandwidth', width: '@y:step' } }];
        def.annotations = [{ type: 'text', x: 2020, y: 'Wien', text: 'a', props: { dy: '@y:bandwidth' } }];
        const el = await mount(GenVis, { def, data: lineData });
        // 250 pixels, two bands
        const rect = el.querySelector('g.vis-plot[data-plot="zero"] rect');
        expect(['x', 'height', 'width'].map(a => Math.round(rect.getAttribute(a)))).toEqual([183, 125, 125]);
        expect(el.querySelector('.vis-annotation.vis-text').getAttribute('dy')).toBe('125');
        expect(errors).toEqual([]);
    });
});

describe('groups of band scales', () => {
    const rows = [
        { y: 'a', g: 'one' }, { y: 'b', g: 'two' }, { y: 'c', g: 'one' }, { y: 'd', g: 'two' }, { y: 'e', g: 'three' },
    ];

    test('the categories of a group are next to each other, with a space between the groups', async () => {
        const { makeScale } = await import('@/utils/scales');
        const scale = (type, groups, range = [0, 100]) => makeScale('y', { type: 'categorical', scale: { type, domain: [null, null], padding: 0, range, groups } }, rows);
        const s = scale('band', { by: 'g', padding: 1 });
        // 5 categories and 2 gaps of a step each
        expect(s.domain()).toEqual(['a', 'c', 'b', 'd', 'e']);
        expect(s.step()).toBeCloseTo(100/7);
        expect(s.bandwidth()).toBeCloseTo(100/7);
        expect(['a', 'c', 'b', 'd', 'e'].map(d => Math.round(s(d)))).toEqual([0, 14, 43, 57, 86]);
        expect(s.groupExtent('c').map(Math.round)).toEqual([0, 29]);
        expect(s.nearest(50)).toBe('b');
        // reversed, e.g. a vertical range from the bottom
        const r = scale('band', { by: 'g', padding: 1 }, [100, 0]);
        expect(Math.round(r('a'))).toBe(86);
        expect(r('e')).toBeCloseTo(0);
        // a point scale, without the space of a band
        const p = scale('point', { by: 'g', padding: 0.5 });
        expect(p.bandwidth()).toBe(0);
        expect(['a', 'c', 'b'].map(d => Math.round(p(d)))).toEqual([0, 20, 50]);
    });

    test('axes, bars and lines of the groups', async () => {
        const def = {
            options: { width: 400, height: 260, margins: { top: 0, right: 0, bottom: 0, left: 60 } },
            mapping: {
                x: { column: 'v', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, 10], domainRel: [0, 0] } },
                y: { column: 'y', type: 'categorical', scale: { type: 'band', orientation: 'vertical', range: [0, '@height'], padding: 0, groups: { by: 'g' } }, axis: { position: 'left' } },
                g: { column: 'g', type: 'categorical' },
            },
            plot: [
                { id: 'bars', type: 'cartesian:bar', props: { x1: '@x:scaled', y: '@y:scaled' } },
                { id: 'zero', type: 'svg:line', props: { x1: 0, x2: 0, y1: '@y:group:start', y2: '@y:group:end', stroke: 'black' } },
            ],
        };
        const data = 'y,g,v\na,one,1\nb,one,2\nc,two,3';
        const el = await mount(GenVis, { def, data });
        // 3 categories and a gap, 65 pixels each
        expect([...el.querySelectorAll('g.vis-plot[data-plot="bars"] rect')].map(r => [r.getAttribute('y'), r.getAttribute('height')]))
            .toEqual([['0', '65'], ['65', '65'], ['195', '65']]);
        expect([...el.querySelectorAll('g.vis-axis-left .tick')].map(t => t.getAttribute('transform'))).toEqual(['translate(0,32.5)', 'translate(0,97.5)', 'translate(0,227.5)']);
        expect([...el.querySelectorAll('g.vis-plot[data-plot="zero"] line')].map(l => [l.getAttribute('y1'), l.getAttribute('y2')]))
            .toEqual([['0', '130'], ['0', '130'], ['195', '260']]);
        expect(errors).toEqual([]);
    });
});

describe('the hover', () => {
    const move = async (el, x, y) => {
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
        await nextTick();
    };

    test('without the box and the marker, the highlight and the events stay', async () => {
        const def = lineDef();
        def.options.hover = { box: false, marker: false };
        def.plot[1].props['highlight-r'] = 6;
        const hovers = [];
        const el = await mount(GenVis, { def, data: lineData, onHover: e => hovers.push(e) });
        await move(el, 100, 100);
        expect(el.querySelector('.vis-hover')).toBeNull();
        expect(el.querySelector('.vis-hover-marker').getAttribute('visibility')).toBe('hidden');
        expect(el.querySelectorAll('circle.vis-highlight').length).toBeGreaterThan(0);
        expect(hovers.at(-1).key).toBe(2021);
        expect(errors).toEqual([]);
    });

    test('at the pointer, on a side, moved by an offset', async () => {
        const def = lineDef();
        def.options.hover = { position: 'pointer', side: 'above', offset: [0, -10] };
        const el = await mount(GenVis, { def, data: lineData });
        await move(el, 100, 100);
        // the pointer in the plot area (in jsdom the one of the facet), with
        // its margins of 40 and 10 and the offset
        const holder = el.querySelector('.vis-hover').parentElement;
        expect(holder.style.transform).toBe('translate(140px, 100px)');
        expect(el.querySelector('.vis-hover').style.transform).toBe('translate(-50%, calc(-100% - 20px))');
        // it moves with the pointer within a position
        await move(el, 105, 120);
        expect(holder.style.transform).toBe('translate(145px, 120px)');
    });

    test('the area of the facet, e.g. the labels of the rows of horizontal bars', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'value', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, null] }, axis: { position: 'bottom' } };
        def.mapping.y = { column: 'year', type: 'categorical', scale: { type: 'band', orientation: 'vertical' }, axis: { position: 'left' } };
        def.plot = { type: 'cartesian:bar', categories: ['c'], props: { x1: '@x:scaled', y: '@y:scaled', fill: '@color' } };
        def.options.hover = { area: 'facet' };
        const el = await mount(GenVis, { def, data: lineData });
        const area = el.querySelector('rect.vis-events');
        expect(['x', 'y', 'width', 'height'].map(a => area.getAttribute(a))).toEqual(['-40', '-10', '600', '300']);
        expect(errors).toEqual([]);
    });
});

describe('the highlight', () => {
    test('others- props of the elements which are not highlighted, also of plots without categories', async () => {
        const def = lineDef();
        def.plot[1] = { ...def.plot[1], highlight: 'row', props: { ...def.plot[1].props, 'highlight-r': 6, 'others-opacity': 0.3 } };
        def.plot.push({ id: 'last', type: 'svg:text', select: 'last', props: { x: '@x:scaled', y: '@y:scaled', text: 'last', 'others-visibility': 'hidden' } });
        const el = await mount(GenVis, { def, data: lineData });
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const circles = [...el.querySelectorAll('g.vis-plot[data-plot="dots"] circle')];
        expect(circles.filter(c => c.getAttribute('r') == '6')).toHaveLength(1);
        expect(circles.filter(c => c.getAttribute('opacity') == '0.3')).toHaveLength(circles.length - 1);
        expect(el.querySelector('g.vis-plot[data-plot="last"] text').getAttribute('visibility')).toBe('hidden');

        // the end of the highlight restores the values
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(circles.every(c => c.getAttribute('opacity') === null && c.getAttribute('r') == '3')).toBe(true);
        expect(el.querySelector('g.vis-plot[data-plot="last"] text').getAttribute('visibility')).toBeNull();

        // an entry of the legend highlights its category
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        await nextTick();
        expect(el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle[opacity="0.3"]')).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('a transition of the highlight', async () => {
        const def = lineDef();
        def.options.highlight = { transition: 50 };
        def.plot[1].props['highlight-r'] = 6;
        const el = await mount(GenVis, { def, data: lineData });
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        const circle = el.querySelector('circle.vis-highlight');
        await vi.waitFor(() => expect(circle.getAttribute('r')).toBe('6'));
        expect(errors).toEqual([]);
    });
});

describe('legends', () => {
    test('categories without an entry, legends below and beside the plots', async () => {
        const def = lineDef();
        def.mapping.c.props.categories.Tirol.legend = false;
        def.mapping.c.legend = { position: 'bottom' };
        def.mapping.v = { column: 'value', type: 'numeric', name: 'Wert', scale: { type: 'sequential', interpolator: 'Blues' }, legend: { position: 'left', orientation: 'vertical', size: 120, values: [1, 2, 3], labels: 'before' } };
        delete def.options.width;
        const el = await mount(GenVis, { def, data: lineData });
        expect([...el.querySelectorAll('.vis-legends-bottom .vis-legend-entry')].map(e => e.dataset.key)).toEqual(['Wien']);
        // Tirol stays visible
        expect(el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')).toHaveLength(4);
        // the legend of the colors left of the plots
        const body = el.querySelector('.vis-body');
        expect([...body.children].map(c => c.className)).toEqual(['vis-legends vis-legends-left', 'vis-plots']);
        const svg = el.querySelector('.vis-legends-left .vis-color-legend svg');
        expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['64', '152']);
        // the ticks of the definition, the high values at the top, the labels left of the scale
        const labels = [...svg.querySelectorAll('text')];
        expect(labels.map(t => t.textContent)).toEqual(['1,0', '2,0', '3,0']);
        expect(labels.map(t => t.getAttribute('text-anchor'))).toEqual(['end', 'end', 'end']);
        expect(+labels[0].getAttribute('y')).toBeGreaterThan(+labels[2].getAttribute('y'));
        expect(svg.querySelector('linearGradient').getAttribute('y1')).toBe('1');
        expect(errors).toEqual([]);
    });
});

describe('texts', () => {
    const bars = () => {
        const def = lineDef();
        def.mapping.x = { column: 'value', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, null] }, axis: { position: 'bottom' } };
        def.mapping.y = { column: 'name', type: 'categorical', scale: { type: 'band', orientation: 'vertical' }, axis: { position: 'left',
            labels: { categories: ['level'], props: { 'font-weight': '@weight', text: '@short', 'max-width': 30 } } } };
        def.mapping.level = { column: 'level', type: 'categorical', props: { categories: { header: { weight: 'bold' }, item: { weight: 'normal' } } } };
        def.mapping.short = { column: 'short', type: 'categorical' };
        def.plot = { type: 'cartesian:bar', props: { x1: '@x:scaled', y: '@y:scaled' } };
        delete def.mapping.c;
        return def;
    };
    const data = 'name,short,level,value\nA long name,A long,header,1\nB,B,item,2';

    test('the props of the labels of an axis by the categories of their rows, cut in a width', async () => {
        const el = await mount(GenVis, { def: bars(), data });
        const labels = [...el.querySelectorAll('.vis-axis-left .tick text')];
        expect(labels.map(t => t.getAttribute('font-weight'))).toEqual(['bold', 'normal']);
        // 30 pixels of 12 pixels per character are 4 characters, estimated without layout
        expect(labels.map(t => t.childNodes[0].textContent)).toEqual(['A l…', 'B']);
        expect(labels[0].querySelector('title').textContent).toBe('A long');
        expect(errors).toEqual([]);
    });

    test('texts of svg:text cut or wrapped in a width', async () => {
        const def = lineDef();
        def.plot = [
            { id: 'cut', type: 'svg:text', select: 'first', categories: ['c'], props: { x: 0, y: 0, text: 'a long label of a line', 'max-width': 40 } },
            { id: 'wrap', type: 'svg:text', select: 'first', categories: ['c'], props: { x: 5, y: 0, text: 'a long label of a line', 'max-width': 40, 'text-overflow': 'wrap', 'dominant-baseline': 'middle' } },
        ];
        const el = await mount(GenVis, { def, data: lineData });
        const cut = el.querySelector('g.vis-plot[data-plot="cut"] text');
        expect(cut.childNodes[0].textContent).toBe('a lon…');
        const lines = [...el.querySelectorAll('g.vis-plot[data-plot="wrap"] text')[0].querySelectorAll('tspan')];
        expect(lines.map(t => t.textContent)).toEqual(['a long', 'label', 'of a', 'line']);
        expect(lines.map(t => t.getAttribute('dy'))).toEqual(['-1.8em', '1.2em', '1.2em', '1.2em']);
        expect(lines.every(t => t.getAttribute('x') == '5')).toBe(true);
        expect(errors).toEqual([]);
    });
});

describe('transforms', () => {
    test('a lookup of a file, e.g. the names of a language of the page, and ranks', async () => {
        const { readFileSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
        const { root } = await import('./dom.js');
        mkdirSync(`${root}/tests/tmp-lookup`, { recursive: true });
        writeFileSync(`${root}/tests/tmp-lookup/names.csv`, 'code,de,en\nWien,Wien,Vienna\nTirol,Tirol,Tyrol\n');
        writeFileSync(`${root}/tests/tmp-lookup/def.json`, JSON.stringify({
            ...lineDef(),
            globals: { lang: 'de' },
            formElements: [{ id: 'lang', ref: 'lang', type: 'hidden', values: [{ id: 'de', value: 'de' }, { id: 'en', value: 'en' }] }],
            transform: [
                { type: 'lookup', column: 'land', data: 'names.csv', key: 'code', value: '{lang}', as: 'label' },
                { type: 'rank', column: 'value', by: 'year', descending: true, as: 'rank' },
            ],
            mapping: { ...lineDef().mapping, label: { column: 'label', type: 'categorical' }, rank: { column: 'rank', type: 'numeric' } },
            plot: [{ id: 'labels', type: 'svg:text', select: 'last', categories: ['c'], props: { x: 0, y: 0, text: '@label', 'data-rank': '@rank' } }],
        }));
        try {
            const { createApp, h, ref } = await import('vue');
            const globals = ref({ lang: 'en' });
            const el = document.body.appendChild(document.createElement('div'));
            createApp({ render: () => h(GenVis, { defFile: '/tests/tmp-lookup/def.json', data: lineData, globals: globals.value }) }).mount(el);
            await (await import('./dom.js')).rendered(el);
            await nextTick();
            const texts = () => [...el.querySelectorAll('g.vis-plot[data-plot="labels"] text')].map(t => [t.textContent, t.getAttribute('data-rank')]);
            // 2023: Wien 4, Tirol 2
            expect(texts()).toEqual([['Vienna', '1'], ['Tyrol', '2']]);
            globals.value = { lang: 'de' };
            await nextTick();
            await nextTick();
            expect(texts()).toEqual([['Wien', '1'], ['Tirol', '2']]);
            expect(errors).toEqual([]);
        } finally {
            rmSync(`${root}/tests/tmp-lookup`, { recursive: true });
        }
    });
});

describe('messages and the classes of the root', () => {
    test('a message of a narrow screen and of an entry, the text without rows, the class and the globals of the root', async () => {
        const def = lineDef({
            message: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 'Zu schmal' }, { cut: 400, value: null }] },
            empty: 'Keine Daten für {group:name}',
            class: 'chart-{group}',
        });
        def.globals = { group: 'all', shareScale: 'x' };
        def.formElements = [{ id: 'group', name: 'Gruppe', ref: 'group', type: 'radio', values: [
            { id: 'all', name: 'Alle', value: 'all' },
            { id: 'none', name: 'Keine', value: 'none', patch: { filter: { c: [] } } },
            { id: 'top3', name: 'Top 3', value: 'top3', patch: { options: { message: 'Die Top 3 sind je Indikator andere Länder.' } } },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        const vis = el.querySelector('.vis');
        expect(vis.className).toBe('vis chart-all');
        expect([vis.dataset.globalGroup, vis.dataset.globalShareScale]).toEqual(['all', 'x']);
        expect(el.querySelector('.vis-message')).toBeNull();

        await select(el, 'none');
        expect(el.querySelector('.vis-message').textContent).toBe('Keine Daten für Keine');
        expect(el.querySelector('.vis-body, .vis-legends')).toBeNull();
        expect(vis.className).toBe('vis chart-none');

        await select(el, 'top3');
        expect(el.querySelector('.vis-message').textContent).toBe('Die Top 3 sind je Indikator andere Länder.');
        await select(el, 'all');
        expect(el.querySelectorAll('g.vis-plot circle')).toHaveLength(7);

        // a narrow visualisation
        const narrow = lineDef({ width: 300, message: def.options.message });
        const small = await mount(GenVis, { def: narrow, data: lineData });
        expect(small.querySelector('.vis-message').textContent).toBe('Zu schmal');
        expect(errors).toEqual([]);
    });
});

describe('linked charts', () => {
    test('the highlight of the page, e.g. the row under the mouse of another chart', async () => {
        const { createApp, h, ref } = await import('vue');
        const { pointer, rendered } = await import('./dom.js');
        const def = lineDef();
        def.plot[1].props['highlight-r'] = 6;
        const row = ref(null);
        const el = document.body.appendChild(document.createElement('div'));
        createApp({ render: () => h('div', [
            h(GenVis, { class: 'a', def, data: lineData, onHover: e => row.value = e?.nearest ? { c: e.nearest.c } : null }),
            h(GenVis, { class: 'b', def, data: lineData, highlight: row.value }),
        ]) }).mount(el);
        await rendered(el.querySelector('.a'));
        await rendered(el.querySelector('.b'));
        await nextTick();
        const highlighted = () => [...el.querySelectorAll('.b circle.vis-highlight')].map(c => c.parentNode.dataset.groupC);
        expect(highlighted()).toEqual([]);

        // the hover of the first chart highlights the category in the second one
        el.querySelector('.a rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        await nextTick();
        const key = row.value.c;
        expect(new Set(highlighted())).toEqual(new Set([key]));

        // its own hover replaces it while it is shown
        el.querySelector('.b rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        el.querySelector('.b rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(new Set(highlighted())).toEqual(new Set([key]));

        el.querySelector('.a rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        await nextTick();
        expect(highlighted()).toEqual([]);
        expect(errors).toEqual([]);
    });
});

describe('patches of the plots', () => {
    test('a plot of another type of a patch is drawn anew', async () => {
        const def = lineDef();
        def.globals = { kind: 'dots' };
        def.formElements = [{ id: 'kind', name: 'Art', ref: 'kind', type: 'radio', values: [
            { id: 'dots', name: 'Punkte', value: 'dots' },
            { id: 'bars', name: 'Balken', value: 'bars', patch: { plot: [{ id: 'dots', type: 'svg:rect', props: { x: '@x:scaled', y: '@y:scaled', width: 4, height: 4 } }] } },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        await select(el, 'bars');
        expect(el.querySelectorAll('g.vis-plot[data-plot="dots"] circle')).toHaveLength(0);
        expect(el.querySelectorAll('g.vis-plot[data-plot="dots"] rect')).toHaveLength(7);
        await select(el, 'dots');
        expect(el.querySelectorAll('g.vis-plot[data-plot="dots"] circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });
});

describe('the locale of a patch', () => {
    test('a form element of the language changes the formats', async () => {
        const def = lineDef({ locale: 'de' });
        def.mapping.y.hover = { format: ',.1f' };
        def.globals = { lang: 'de' };
        def.formElements = [{ id: 'lang', name: 'Sprache', ref: 'lang', type: 'radio', values: [
            { id: 'de', name: 'Deutsch', value: 'de' },
            { id: 'en', name: 'English', value: 'en', patch: { options: { locale: 'en' } } },
        ] }];
        const el = await mount(GenVis, { def, data: lineData });
        const { pointer } = await import('./dom.js');
        const value = async () => {
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
            await nextTick();
            return el.querySelector('.vis-hover td.vis-value').textContent;
        };
        expect(await value()).toBe('2,0');
        await select(el, 'en');
        expect(await value()).toBe('2.0');
        expect(errors).toEqual([]);
    });
});

describe('the order of the categories of a scale', () => {
    test('of the data, ascending, descending or by a mapping, also in groups', async () => {
        const { makeScale } = await import('@/utils/scales');
        const rows = [{ y: 'b', x: 2, g: 'one' }, { y: 'a', x: 3, g: 'two' }, { y: 'c', x: 1, g: 'one' }, { y: 'd', x: null, g: 'two' }];
        const domain = (order, groups) => makeScale('y', { type: 'categorical', scale: { type: 'band', domain: [null, null], range: [0, 100], order, groups } }, rows).domain();
        expect(domain()).toEqual(['b', 'a', 'c', 'd']);
        expect(domain('ascending')).toEqual(['a', 'b', 'c', 'd']);
        expect(domain('descending')).toEqual(['d', 'c', 'b', 'a']);
        expect(domain({ by: 'x' })).toEqual(['c', 'b', 'a', 'd']);
        expect(domain({ by: 'x', descending: true })).toEqual(['a', 'b', 'c', 'd']);
        // the groups in the order of their first category
        expect(domain({ by: 'x', descending: true }, { by: 'g' })).toEqual(['a', 'd', 'b', 'c']);
    });
});

describe('the full text of a cut text', () => {
    test('is the title of the area of the hover above it', async () => {
        const def = lineDef();
        def.mapping.x = { column: 'value', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, null] } };
        def.mapping.y = { column: 'name', type: 'categorical', scale: { type: 'band', orientation: 'vertical' },
            axis: { position: 'left', labels: { props: { 'max-width': 30 } } } };
        delete def.mapping.c;
        def.plot = { type: 'cartesian:bar', props: { x1: '@x:scaled', y: '@y:scaled' } };
        def.options.hover = { area: 'facet' };
        const el = await mount(GenVis, { def, data: 'name,value\nA long name,1\nB,2' });
        const label = el.querySelector('.vis-axis-left .tick text');
        const area = el.querySelector('rect.vis-events');
        const { pointer } = await import('./dom.js');
        // jsdom has no layout, the element under the pointer is the label or the area
        document.elementsFromPoint = x => x < 40 ? [area, label] : [area];
        area.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 50 }));
        expect(area.querySelector('title').textContent).toBe('A long name');
        area.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 50 }));
        expect(area.querySelector('title').textContent).toBe('');
        delete document.elementsFromPoint;
        expect(errors).toEqual([]);
    });
});
