// @vitest-environment jsdom
// the filter transform: the plots, the scales and the later transforms have
// only its rows
import { describe, test, expect } from 'vitest';
import { useDom, mount, errors } from './dom.js';

useDom();

const def = transform => ({
    options: { width: 400, height: 200 },
    globals: { min: 0 },
    transform,
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' } },
        share: { column: 'share', type: 'numeric' },
    },
    plot: { type: 'svg:circle', props: { cx: '@x:scaled', cy: '@y:scaled', r: 3, 'data-share': '@share' } },
});
const data = 'year,value\n2020,1\n2021,-2\n2022,3\n2023,5\n';

describe('the filter transform', () => {
    test('the rows whose expression is true are drawn, later transforms have only them', async () => {
        const el = await mount({ def: def([
            { type: 'filter', expr: { '>': ['@value', '@min'] } },
            { type: 'share', column: 'value', as: 'share' },
        ]), data });
        const circles = [...el.querySelectorAll('g.vis-mark circle')];
        expect(circles.map(c => c.getAttribute('data-share'))).toEqual(['0.1111111111111111', '0.3333333333333333', '0.5555555555555556']);
        expect(errors).toEqual([]);
    });

    test('a definition of the shorthand of 4.0: the types of the values, the scales and axes of x and y, a line of its defaults', async () => {
        const el = await mount({ def: { options: { width: 400, height: 200 }, mapping: { x: 'year', y: 'value' }, plot: { type: 'line' } }, data });
        expect(el.querySelectorAll('.vis-axis')).toHaveLength(2);
        const path = el.querySelector('g.vis-mark path');
        expect(path.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+L/);
        expect(path.getAttribute('fill')).toBe('none');
        expect(path.getAttribute('stroke')).toBe('currentColor');
        expect(errors).toEqual([]);
    });

    test('without rows nothing is drawn', async () => {
        const el = await mount({ def: def([{ type: 'filter', expr: false }]), data });
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(0);
    });
});

describe('the names of a filter expression', () => {
    test('a column of the data before a global of the same name, @globals.<name> is the global', async () => {
        const el = await mount({ def: {
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json',
            height: 200,
            globals: { country: 'AT' },
            controls: [{ type: 'select', global: 'country', values: ['AT', 'DE'] }],
            filter: "@country == @globals.country and @year == 2021",
            dims: { x: { column: 'value', zero: true }, y: { column: 'year', type: 'categorical' } },
            marks: { type: 'bar', 'data-c': '@x' },
        }, data: 'country,year,value\nAT,2020,1\nAT,2021,2\nDE,2021,3\nDE,2020,4\n' });
        expect([...el.querySelectorAll('g.vis-mark rect')].map(r => r.getAttribute('data-c'))).toEqual(['2']);
        expect(errors).toEqual([]);
    });
});

describe('filters of dates compare dates', () => {
    const dateDef = (filter, extra = {}) => ({
        dims: { x: { column: 'day', type: 'date' }, y: 'value' }, filter, marks: { type: 'point' }, ...extra,
    });
    const drawn = el => el.querySelectorAll('g.vis-mark circle').length;

    test('of dates of every format: ISO, day first, JSON timestamps, as the object form', async () => {
        const iso = 'day,value\n2020-01-01,1\n2020-06-01,2\n2021-01-01,3';
        const dayFirst = 'day,value\n01.01.2020,1\n01.06.2020,2\n01.01.2021,3';
        // the timestamps of the local midnights, as the dates without a time zone
        const json = JSON.stringify([[2020, 0, 1], [2020, 5, 1], [2021, 0, 1]].map(([y, m, d], i) => ({ day: new Date(y, m, d).getTime(), value: i + 1 })));
        for (const data of [iso, dayFirst, json]) {
            expect(drawn(await mount({ def: dateDef("@x >= '2020-06-01'"), data }))).toBe(2);
            expect(drawn(await mount({ def: dateDef("@x == '2020-06-01'"), data }))).toBe(1);
            expect(drawn(await mount({ def: dateDef("@x == @sel", { globals: { sel: '2021-01-01' } }), data }))).toBe(1);
            expect(drawn(await mount({ def: dateDef("=match(@x, {'2020-01-01': true}, false)"), data }))).toBe(1);
            expect(drawn(await mount({ def: dateDef({ x: { range: ['2020-06-01', null] } }), data }))).toBe(2);
        }
        expect(errors).toEqual([]);
    });

    test('of a date column of a transform', async () => {
        const def = dateDef("@x < '2021-01-01'", { transform: { type: 'calc', as: 'day', expr: "=cat(@year, '-01-01')" } });
        const el = await mount({ def, data: 'year,value\n2019,1\n2020,2\n2021,3' });
        expect(drawn(el)).toBe(2);
        expect(errors).toEqual([]);
    });
});
