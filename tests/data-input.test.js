// @vitest-environment jsdom
// the data as it comes (review of the release of 5.0): odd values, the order
// of the rows, missing rows and columns
import { describe, test, expect } from 'vitest';
import { errors, useDom, mount } from './dom.js';

useDom();

const legendKeys = el => [...el.querySelectorAll('.vis-legend [data-key]')].map(e => e.getAttribute('data-key'));

describe('the categories of the data in the order of the rows', () => {
    test('also integers, of the legend and of the stacks', async () => {
        const def = { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'line', by: 'c' }] };
        let el = await mount({ def, data: 'a,b,c\n1,1,2024\n1,2,2023\n1,3,Total\n1,4,2022\n2,1,2024\n2,2,2023\n2,3,Total\n2,4,2022' });
        expect(legendKeys(el)).toEqual(['2024', '2023', 'Total', '2022']);
        el = await mount({ def, data: 'a,b,c\n1,1,B\n1,2,01\n1,3,1\n2,1,B\n2,2,01\n2,3,1' });
        expect(legendKeys(el)).toEqual(['B', '01', '1']);
        // the stacks from the bottom in the order of the categories
        el = await mount({ def: { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'bar', by: 'c', stack: true }] }, data: 'a,b,c\nX,1,Zeta\nX,2,10\nX,3,Alpha' });
        expect(legendKeys(el)).toEqual(['Zeta', '10', 'Alpha']);
        const bottom = rect => parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height'));
        const rects = [...el.querySelectorAll('g.vis-mark rect')].sort((a, b) => bottom(b) - bottom(a));
        expect(rects.map(r => r.closest('[data-group-c]')?.getAttribute('data-group-c') ?? r.getAttribute('data-group-c'))).toEqual(['Zeta', '10', 'Alpha']);
        expect(errors).toEqual([]);
    });

    test('a category __proto__ keeps its rows', async () => {
        const el = await mount({ def: { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'line', by: 'c' }, { type: 'point', by: 'c' }] },
            data: 'a,b,c\n1,2,__proto__\n2,3,__proto__\n1,4,B\n2,5,B' });
        expect(legendKeys(el)).toEqual(['__proto__', 'B']);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(4);
        expect(errors).toEqual([]);
    });
});
