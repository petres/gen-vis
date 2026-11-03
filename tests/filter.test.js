// @vitest-environment jsdom
// the filter transform: the plots, the scales and the later transforms have
// only its rows
import { describe, test, expect } from 'vitest';
import { GenVis } from '@/index.js';
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
        const el = await mount(GenVis, { def: def([
            { type: 'filter', expr: { '>': ['@value', '@min'] } },
            { type: 'share', column: 'value', as: 'share' },
        ]), data });
        const circles = [...el.querySelectorAll('g.vis-plot circle')];
        expect(circles.map(c => c.getAttribute('data-share'))).toEqual(['0.1111111111111111', '0.3333333333333333', '0.5555555555555556']);
        expect(errors).toEqual([]);
    });

    test('a definition of the shorthand of 4.0: the types of the values, the scales and axes of x and y, a line of its defaults', async () => {
        const el = await mount(GenVis, { def: { options: { width: 400, height: 200 }, mapping: { x: 'year', y: 'value' }, plot: { type: 'line' } }, data });
        expect(el.querySelectorAll('.vis-axis')).toHaveLength(2);
        const path = el.querySelector('g.vis-plot path');
        expect(path.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+L/);
        expect(path.getAttribute('fill')).toBe('none');
        expect(path.getAttribute('stroke')).toBe('currentColor');
        expect(errors).toEqual([]);
    });

    test('without rows nothing is drawn', async () => {
        const el = await mount(GenVis, { def: def([{ type: 'filter', expr: false }]), data });
        expect(el.querySelectorAll('g.vis-plot circle')).toHaveLength(0);
    });
});
