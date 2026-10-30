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
