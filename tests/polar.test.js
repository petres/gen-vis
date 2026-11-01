// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { nextTick } from 'vue';
import { GenVis } from '@/index.js';
import { useDom, mount, errors } from './dom.js';

useDom();

const months = [...Array(12).keys()];
const polarData = 'month,value,land\n' + months.flatMap(m => [`${m},${m + 1},Wien`, `${m},2,Tirol`]).join('\n');
const polarDef = () => ({
    options: { coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } },
    mapping: {
        x: { column: 'month', type: 'numeric', scale: { orientation: 'angular', domain: [0, 12] }, axis: { position: 'angular', values: [0, 3, 6, 9, 12], grid: true } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'radial', domain: [0, 12] }, axis: { position: 'radial', ticks: 3, grid: true }, hover: {} },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, props: { categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } } },
    },
    plot: [{ type: 'polar:circle', categories: ['c'], props: { fill: '@color', r: 3, angle: '@x:scaled', radius: '@y:scaled' } }],
});

const ticks = el => [...el.querySelectorAll('g.vis-axis-angular g.tick')];
// the angle of the middle of the path of a curved label in degrees,
// clockwise from the top, 0 to 360
const labelAngle = tick => {
    const [x, y] = tick.querySelector('path').getAttribute('d').match(/A[^A]* (-?[\d.e-]+),(-?[\d.e-]+)A/).slice(1).map(Number);
    return +(((Math.atan2(x, -y)*180/Math.PI) + 360) % 360).toFixed(1) % 360;
};
const labels = el => ticks(el).map(t => [t.querySelector('textPath')?.textContent, labelAngle(t)]);
const point = node => [+node.getAttribute('cx'), +node.getAttribute('cy')];

describe('curved labels of polar axes', () => {
    test('between ticks of a counterclockwise range', async () => {
        const def = polarDef();
        def.mapping.x.scale.range = [0, -2*Math.PI];
        def.mapping.x.axis.labels = { curved: 'between' };
        const el = await mount(GenVis, { def, data: polarData });
        expect(labels(el)).toEqual([['0', 315], ['3', 225], ['6', 135], ['9', 45]]);
    });

    test('between ticks of a reversed domain', async () => {
        const def = polarDef();
        def.mapping.x.scale.domain = [12, 0];
        def.mapping.x.axis.labels = { curved: 'between' };
        const el = await mount(GenVis, { def, data: polarData });
        // 0 and 12 are both at the top, the labels go counterclockwise
        expect(labels(el).map(([, a]) => a)).toEqual([315, 225, 135, 45]);
    });

    test('between ticks with a gap of more than half the circle', async () => {
        const def = polarDef();
        def.mapping.x.axis.values = [0, 3];
        def.mapping.x.axis.labels = { curved: 'between' };
        const el = await mount(GenVis, { def, data: polarData });
        expect(labels(el)).toEqual([['0', 45], ['3', 225]]);
    });

    test('a single tick is labelled at the tick', async () => {
        const def = polarDef();
        def.mapping.x.axis.values = [3];
        def.mapping.x.axis.labels = { curved: 'between' };
        const el = await mount(GenVis, { def, data: polarData });
        expect(labels(el)).toEqual([['3', 90]]);
    });

    test('keep their textPath with a max-width, also after a redraw', async () => {
        const def = polarDef();
        def.mapping.x.axis.labels = { curved: true, props: { 'max-width': 500 } };
        const el = await mount(GenVis, { def, data: polarData });
        expect(labels(el).map(([t]) => t)).toEqual(['0', '3', '6', '9']);
        // a toggle of the legend draws the axes anew
        el.querySelector('.vis-legend-entry').click();
        await nextTick();
        expect(labels(el).map(([t]) => t)).toEqual(['0', '3', '6', '9']);
        expect(errors).toEqual([]);
    });

    test('are cut in their textPath, also with wrap', async () => {
        for (const overflow of [undefined, 'wrap']) {
            const def = polarDef();
            def.mapping.x.axis.labels = { curved: true, props: { 'max-width': 30, 'text-overflow': overflow, text: 'ein sehr langer Monat' } };
            const el = await mount(GenVis, { def, data: polarData });
            const text = ticks(el)[0].querySelector('text');
            expect(text.querySelector('textPath').textContent).toMatch(/^ein.*…$/);
            expect(text.querySelector('tspan')).toBeNull();
            expect(text.querySelector('title').textContent).toBe('ein sehr langer Monat');
            document.body.innerHTML = '';
        }
    });

    test('have valid ids of a mapping name with a space', async () => {
        const def = polarDef();
        def.mapping['the x'] = def.mapping.x;
        delete def.mapping.x;
        def.plot[0].props.angle = '@the x:scaled';
        def.mapping['the x'].axis.labels = { curved: true };
        const el = await mount(GenVis, { def, data: polarData });
        const tick = ticks(el)[0];
        const id = tick.querySelector('path').id;
        expect(id).toMatch(/^[\w-]+$/);
        expect(tick.querySelector('textPath').getAttribute('href')).toBe(`#${id}`);
        expect(el.querySelector(`#${id}`)).toBe(tick.querySelector('path'));
    });
});

describe('polar plots', () => {
    test('values below the domain of the radius are at the inner radius, not mirrored', async () => {
        const def = polarDef();
        def.mapping.y.scale.range = [40, '@radius'];
        def.plot.push({ type: 'polar:line', categories: ['c'], props: { stroke: '@color', fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } } });
        const el = await mount(GenVis, { def, data: 'month,value,land\n3,-3,Wien\n6,-3,Wien\n3,3,Tirol' });
        const [wien] = [...el.querySelectorAll('g.vis-plot circle')].map(point);
        // month 3 is on the right
        expect(wien[0]).toBeCloseTo(40);
        expect(wien[1]).toBeCloseTo(0);
        const d = el.querySelector('g.vis-plot path').getAttribute('d');
        expect(d.startsWith('M40,0')).toBe(true);
    });

    test('dodged texts of the same angle, also 0 and 2π, are not inside the circle', async () => {
        const def = polarDef();
        def.plot = [{ type: 'polar:text', dodge: 20, props: { text: '@c', angle: '@x:scaled', radius: '@y:scaled' } }];
        const el = await mount(GenVis, { def, data: 'month,value,land\n3,0,Wien\n3,0,Tirol\n0,6,Wien\n12,6,Tirol' });
        const texts = [...el.querySelectorAll('g.vis-plot text')].map(t => [+t.getAttribute('x'), +t.getAttribute('y')]);
        // month 3 on the right, from the center outward
        const right = texts.slice(0, 2).map(([x, y]) => (expect(y).toBeCloseTo(0), x)).sort((a, b) => a - b);
        expect(right[0]).toBeCloseTo(0);
        expect(right[1]).toBeCloseTo(20);
        // month 0 and 12 at the top, 20 pixels apart
        const top = texts.slice(2).map(([x, y]) => (expect(x).toBeCloseTo(0), y));
        expect(Math.abs(top[0] - top[1])).toBeCloseTo(20);
    });

    test('a container smaller than its margins has no negative sizes', async () => {
        const def = polarDef();
        def.options.width = 80;
        def.options.height = 80;
        const el = await mount(GenVis, { def, data: polarData });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(+el.querySelector('g.vis-axis-angular circle.domain').getAttribute('r')).toBe(0);
        const cartesian = {
            options: { width: 60, height: 60, margins: { top: 40, right: 40, bottom: 40, left: 40 } },
            mapping: {
                x: { column: 'month', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
                y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' } },
            },
            plot: [{ type: 'svg:circle', props: { r: 3, cx: '@x:scaled', cy: '@y:scaled' } }],
        };
        const el2 = await mount(GenVis, { def: cartesian, data: polarData });
        const circles = [...el2.querySelectorAll('g.vis-plot circle')].map(point);
        expect(circles.length).toBeGreaterThan(0);
        expect(circles.every(([x, y]) => x == 0 && y == 0)).toBe(true);
    });
});
