// @vitest-environment jsdom
import { describe, test, expect, onTestFinished } from 'vitest';
import { scaleBand, scaleLinear } from 'd3-scale';
import { orderOf, byOrder, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp } from '@/utils/hover';
import { errors, useDom, mount, mountVis, rendered, pointer, nextTick } from './dom.js';
import { targetOf } from '@/utils/dom';

useDom();

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, props: { categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } } },
    },
    plot: [{ type: 'svg:circle', categories: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } }],
});

const move = async (el, x, y = 100) => {
    el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
    await nextTick();
};
const title = el => el.querySelector('.vis-hover-title')?.textContent;

describe('the nearest position of the hover', () => {
    // 2020 at 0, 2021 at 275, 2022 at 550 of the inner width
    test('a position without a value is skipped', async () => {
        const el = await mount({ def: lineDef(), data: 'year,value,land\n2020,1,Wien\n2021,,Wien\n2022,3,Wien' });
        await move(el, 260);
        expect(title(el)).toBe('2020');
        await move(el, 290);
        expect(title(el)).toBe('2022');
        expect(errors).toEqual([]);
    });

    test('a position whose rows the filter of the hover removes is skipped', async () => {
        const def = lineDef({ hover: { filter: { c: 'Wien' } } });
        const el = await mount({ def, data: 'year,value,land\n2020,1,Wien\n2021,2,Tirol\n2022,3,Wien' });
        await move(el, 260);
        expect(title(el)).toBe('2020');
        expect(errors).toEqual([]);
    });
});

describe('the legend', () => {
    test('only this entry hides the categories which are not in the data', async () => {
        const def = lineDef();
        def.globals = { from: 2020 };
        def.filter = { x: { range: ['@from', null] } };
        def.mapping.c.legend = { onlyData: true };
        def.mapping.c.props.categories.Salzburg = { color: 'green' };
        def.formElements = [{ id: 'from', name: 'Ab', ref: 'from', type: 'radio', values: [
            { id: 'a', name: '2020', value: 2020 }, { id: 'b', name: '2022', value: 2022 },
        ] }];
        const data = 'year,value,land\n2020,1,Wien\n2022,2,Wien\n2022,3,Tirol\n2021,5,Salzburg';
        const el = await mount({ def, data });
        const entries = () => [...el.querySelectorAll('.vis-legend-entry')].map(e => [e.dataset.key, e.dataset.visible]);
        el.querySelector('.vis-form-element input[value="b"]').click();
        await nextTick();
        expect(entries()).toEqual([['Wien', 'true'], ['Tirol', 'true']]);
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await nextTick();
        el.querySelector('.vis-form-element input[value="a"]').click();
        await nextTick();
        expect(entries()).toEqual([['Wien', 'true'], ['Tirol', 'false'], ['Salzburg', 'false']]);
        // again all entries, also the ones not in the data
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await nextTick();
        expect(entries()).toEqual([['Wien', 'true'], ['Tirol', 'true'], ['Salzburg', 'true']]);
        expect(errors).toEqual([]);
    });
});

describe('the parts of the hover', () => {
    test('the order of the rows, also of two rows outside of the stacks', () => {
        const rows = [{ c: 'a', y: 1 }, { c: 'b', y: 2 }, { c: 'total', y: 3 }, { c: 'other', y: 9 }];
        const stacks = {
            v: 'y',
            stackOf: row => ({ a: [0, 1], b: [1, 3] })[row.c],
            isStacked: row => row.c == 'a' || row.c == 'b',
            // the rows which are not stacked are after all categories
            stackOrder: () => -1,
        };
        expect(rows.map(r => orderOf(r, rows, stacks))).toEqual([0.5, 2, Infinity, Infinity]);
        expect(byOrder(Infinity, Infinity)).toBe(0);
        expect(byOrder(1, 2)).toBe(1);
        expect(byOrder(2, 1)).toBe(-1);
        // the same order keeps the order of the rows
        expect(sortedByOrder(rows, r => orderOf(r, rows, stacks)).map(r => r.c)).toEqual(['total', 'other', 'b', 'a']);
        expect(sortedByOrder(rows, r => orderOf(r, rows, { v: 'y' })).map(r => r.c)).toEqual(['other', 'total', 'b', 'a']);
    });

    test('the nearest key with rows', () => {
        const linear = scaleLinear([2020, 2024], [0, 400]);
        linear.nearest = p => [2020, 2021, 2022, 2023, 2024][Math.round(p/100)];
        const nearest = nearestWithRows(linear, [2020, 2023, 2024]);
        expect([0, 100, 140, 160, 200, 300, 400].map(nearest)).toEqual([2020, 2020, 2020, 2023, 2023, 2023, 2024]);
        expect(nearestWithRows(linear, [])(100)).toBeUndefined();
        expect(nearestWithRows(scaleLinear(), [1])).toBeUndefined();

        const band = scaleBand(['a', 'b', 'c'], [0, 300]);
        band.nearest = p => ['a', 'b', 'c'][Math.min(2, Math.floor(p/100))];
        expect([50, 140, 160, 250].map(nearestWithRows(band, ['a', 'c']))).toEqual(['a', 'a', 'c', 'c']);
    });

    test('the nearest row, the segment of a stack', () => {
        const rows = [{ y: 1 }, { y: 5 }];
        expect(nearestRow(rows, 4, 'y')).toBe(rows[1]);
        expect(nearestRow(rows, undefined, 'y')).toBeUndefined();
        const stackOf = row => row.y == 1 ? [0, 1] : [1, 6];
        expect(nearestRow(rows, 0.5, 'y', stackOf)).toBe(rows[0]);
        expect(nearestRow(rows, 9, 'y', stackOf)).toBe(rows[1]);
    });

    test('the nearest point within the radius', () => {
        const points = [[10, 10, 'a'], [100, 100, 'b'], [NaN, 5, 'c']];
        const find = pointFinder(points, 30);
        expect(find([15, 12])[2]).toBe('a');
        expect(find([90, 110])[2]).toBe('b');
        expect(find([50, 50])).toBeNull();
        expect(pointPosition([400, 20], 600)).toEqual({ x: 400, y: 20, side: 'left' });
        expect(pointPosition([100, 20], 600).side).toBe('right');
    });

    test('the position of the hover, at the pointer, of a side and an offset', () => {
        const position = { x: 10, y: 20, side: 'right' };
        expect(placed(position, {}, [1, 2])).toEqual(position);
        expect(placed(position, { position: 'pointer', offset: [5, -5] }, [1, 2])).toEqual({ x: 6, y: -3, side: 'right' });
        expect(placed(position, { position: 'pointer', side: 'above' }, null)).toEqual({ x: 10, y: 20, side: 'above' });
        expect(positionsInOrder([{ key: 3 }, { key: 1 }], scaleLinear(), null).map(p => p.key)).toEqual([1, 3]);
        expect(positionsInOrder([{ key: 'b' }, { key: 'a' }], undefined, k => k.toUpperCase()).map(p => p.key)).toEqual(['a', 'b']);
        expect([clamp(-1, 3), clamp(1, 3), clamp(Infinity, 3)]).toEqual([0, 1, 2]);
    });
});

describe('accessibility', () => {
    const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien';
    const svg = el => el.querySelector('svg.vis-svg');
    const described = el => svg(el).getAttribute('aria-describedby').split(' ').map(id => el.querySelector(`[id="${id}"]`).textContent);

    test('the name of the chart without a title: the subtitle or the localized name of a chart', async () => {
        const named = await mount({ def: lineDef({ title: 'Titel', subtitle: 'Untertitel' }), data });
        expect(svg(named).getAttribute('aria-label')).toBe('Titel');
        expect(described(named)).toEqual(['Untertitel', expect.stringMatching(/Pfeiltasten/)]);

        const subtitle = await mount({ def: lineDef({ subtitle: 'Untertitel' }), data });
        expect(svg(subtitle).getAttribute('aria-label')).toBe('Untertitel');
        expect(described(subtitle)).toEqual([expect.stringMatching(/Pfeiltasten/)]);

        const none = await mount({ def: lineDef({ locale: 'en' }), data });
        expect(svg(none).getAttribute('aria-label')).toBe('chart');
        expect(errors).toEqual([]);
    });

    test('the hover is announced when the keyboard moves it, not the mouse', async () => {
        const el = await mount({ def: lineDef(), data });
        const live = () => el.querySelector('.vis-hover').parentElement.getAttribute('aria-live');
        await move(el, 10);
        expect(live()).toBe('off');
        svg(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await nextTick();
        expect(live()).toBe('polite');
        await move(el, 500);
        expect(live()).toBe('off');
    });

    test('the scale of a color legend is an image with the name of the legend', async () => {
        const def = lineDef();
        def.mapping.v = { name: 'Wert', column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' }, legend: {} };
        def.plot[0].props.fill = '@v:scaled';
        const el = await mount({ def, data });
        const scale = el.querySelector('.vis-color-legend svg');
        expect([scale.getAttribute('role'), scale.getAttribute('aria-label')]).toEqual(['img', 'Wert']);
    });
});

describe('the end of a facet', () => {
    test('its transitions are interrupted', async () => {
        // jsdom has no transforms of svg, the translations of the ticks of axes are interpolated by them
        Object.defineProperty(SVGElement.prototype, 'transform', { configurable: true, get() {
            const [x = 0, y = 0] = (this.getAttribute('transform')?.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
            return { baseVal: { consolidate: () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y } }) } };
        } });
        onTestFinished(() => delete SVGElement.prototype.transform);
        const { el, vis } = await mountVis({ def: lineDef({ transition: 5000 }), data: 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,2,Tirol\n2021,3,Tirol' });
        el.querySelector('.vis-legend-entry[data-key="Wien"]').click();
        await nextTick();
        const nodes = [...el.querySelectorAll('svg.vis-svg *')];
        expect(nodes.some(n => targetOf(n))).toBe(true);
        vis.destroy();
        expect(nodes.filter(n => targetOf(n))).toEqual([]);
    });
});
