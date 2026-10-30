// @vitest-environment jsdom
// the parts of 3.0 which make definitions more flexible: patches of all parts
// of a definition, globals of the page, filters, props, scales, the hover,
// the highlight, legends, texts, transforms and messages
import { describe, test, expect } from 'vitest';
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
