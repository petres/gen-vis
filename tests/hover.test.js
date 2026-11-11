// @vitest-environment jsdom
import { describe, test, expect, onTestFinished, vi } from 'vitest';
import { scaleBand, scaleLinear } from 'd3-scale';
import { orderOf, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp } from '@/comp/facet-hover';
import { byOrder } from '@/comp/hover';
import { errors, useDom, mount, mountVis, pointer, nextTick } from './dom.js';
import { targetOf } from '@/utils/dom';

useDom();

const lineDef = (options = {}) => ({
    options: { width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' }, hover: { format: ',.1f' } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } },
    },
    plot: [{ type: 'svg:circle', by: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } }],
});

const move = async (el, x, y = 100) => {
    el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
    await nextTick();
};
const title = el => el.querySelector('.vis-hover-title')?.textContent;

describe('the crosshair of the hover (cross)', () => {
    const lines = el => Object.fromEntries(['h', 'v'].map(d => [d, el.querySelector(`g.vis-hover-marker line.vis-hover-cross-${d}`)]));
    const at = (l, a) => Number(l.getAttribute(a));
    test('a horizontal and a vertical line through the point of the nearest row instead of the line of the position, none without', async () => {
        const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2022,3,Wien\n2022,1,Tirol';
        const plain = await mount({ def: lineDef(), data });
        expect(plain.querySelector('line.vis-hover-cross')).toBeNull();
        const el = await mount({ def: lineDef({ hover: { cross: true } }), data });
        await move(el, 540, 20);
        const { h, v } = lines(el);
        const circle = [...el.querySelectorAll('circle')].find(c => c.getAttribute('fill') == 'red' && at(c, 'cx') > 500);
        expect(Math.abs(at(h, 'y1') - at(circle, 'cy'))).toBeLessThanOrEqual(0.5);
        expect(at(h, 'y2')).toBe(at(h, 'y1'));
        expect(at(h, 'x2') - at(h, 'x1')).toBe(550);
        expect(Math.abs(at(v, 'x1') - at(circle, 'cx'))).toBeLessThanOrEqual(0.5);
        expect(at(v, 'y2') - at(v, 'y1')).toBe(250);
        // the line of the position is left out, the marker is shown
        expect(el.querySelector('g.vis-hover-marker line:not(.vis-hover-cross)').hasAttribute('x1')).toBe(false);
        expect(el.querySelector('g.vis-hover-marker').getAttribute('visibility')).toBe('visible');
        // the nearest row of the pointer, the one of Tirol below
        await move(el, 540, 240);
        const tirol = [...el.querySelectorAll('circle')].find(c => c.getAttribute('fill') == 'blue');
        expect(Math.abs(at(lines(el).h, 'y1') - at(tirol, 'cy'))).toBeLessThanOrEqual(0.5);
        // hidden: no lines
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointerleave', { pointerType: 'mouse' }));
        await nextTick();
        expect(lines(el).h.hasAttribute('x1')).toBe(false);
        expect(errors).toEqual([]);
    });

    test('also of the hover of points, with marker false', async () => {
        const el = await mount({ def: lineDef({ hover: { cross: true, marker: false, mode: 'point' } }), data: 'year,value,land\n2020,1,Wien\n2022,3,Wien' });
        await move(el, 545, 5);
        const { h, v } = lines(el);
        expect(h.hasAttribute('y1')).toBe(true);
        expect(v.hasAttribute('x1')).toBe(true);
        expect(el.querySelector('g.vis-hover-marker').getAttribute('visibility')).toBe('visible');
        expect(errors).toEqual([]);
    });
});

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
        def.mapping.c.categories.Salzburg = { color: 'green' };
        def.formElements = [{ id: 'from', name: 'Ab', ref: 'from', type: 'radio', values: [
            { id: 'a', name: '2020', value: 2020 }, { id: 'b', name: '2022', value: 2022 },
        ] }];
        const data = 'year,value,land\n2020,1,Wien\n2022,2,Wien\n2022,3,Tirol\n2021,5,Salzburg';
        const el = await mount({ def, data });
        const entries = () => [...el.querySelectorAll('.vis-legend-entry')].map(e => [e.dataset.key, e.dataset.visible]);
        el.querySelector('.vis-control input[value="b"]').click();
        await nextTick();
        expect(entries()).toEqual([['Wien', 'true'], ['Tirol', 'true']]);
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await nextTick();
        el.querySelector('.vis-control input[value="a"]').click();
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

    test('a row without a value is not the nearest one, also not in a stack', () => {
        const rows = [{ y: null }, { y: 10 }];
        expect(nearestRow(rows, 1, 'y')).toBe(rows[1]);
        expect(nearestRow(rows, 50, 'y', row => [row.y, row.y])).toBe(rows[1]);
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

describe('the highlight of props of the categories', () => {
    test('the custom properties of the groups are on their elements, of lines and of elements per row', async () => {
        const el = await mount({ def: {
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', height: 200,
            dims: { x: { column: 'year', type: 'numeric' }, y: 'value',
                land: { column: 'land', categories: { Wien: { hw: 4 }, Tirol: { hw: 6 } } } },
            marks: [{ type: 'line', by: 'land', highlight: { 'stroke-width': '@hw' } }, { type: 'point', by: 'land', highlight: { r: '@hw' } }],
        }, data: 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,3,Tirol\n2021,4,Tirol\n' });
        const paths = [...el.querySelectorAll('g.vis-mark path')];
        expect(paths.map(p => p.style.getPropertyValue('--vis-hl-stroke-width'))).toEqual(['4', '6']);
        const groups = [...el.querySelectorAll('g.vis-mark g.vis-group')];
        expect(groups.map(g => g.style.getPropertyValue('--vis-hl-r'))).toEqual(['4', '6']);
    });
});

describe('the stylesheet of the highlight', () => {
    test('numbers of the font size of texts in pixels (a stylesheet ignores a unitless one), of the geometry as they are', async () => {
        const el = await mount({ def: {
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', height: 200,
            dims: { x: { column: 'year', type: 'numeric' }, y: 'value',
                land: { column: 'land', categories: { Wien: { fs: 15 }, Tirol: { fs: 16 } } } },
            marks: [{ type: 'line', by: 'land', highlight: { 'stroke-width': 3 } }, { type: 'text', by: 'land', text: '@land', highlight: { 'font-size': 14 } },
                { type: 'label', by: 'land', text: '@land', highlight: { 'font-size': '@fs' } }],
        }, data: 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,3,Tirol\n2021,4,Tirol\n' });
        const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
        expect(css).toContain('font-size: 14px');
        expect(css).toContain('stroke-width: 3');
        expect(css).not.toContain('stroke-width: 3px');
        expect([...el.querySelectorAll('g.vis-group')].map(g => g.style.getPropertyValue('--vis-hl-font-size')).filter(Boolean)).toEqual(['15px', '16px']);
    });
});

describe('the table of the hover', () => {
    const def = hover => ({
        $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', height: 200, hover,
        dims: { x: { column: 'year', type: 'numeric' }, y: 'value', land: { column: 'land', categories: { Wien: '#C3423F', Tirol: '#4269D0' } }, note: { column: 'note', hover: {} } },
        marks: { type: 'line', by: 'land' },
    });
    const data = 'year,value,land,note\n2020,1,Wien,a\n2021,2,Wien,b\n2020,3,Tirol,c\n2021,4,Tirol,d\n';
    const table = async hover => {
        const el = await mount({ def: def(hover), data });
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 100 }));
        await nextTick();
        return [...el.querySelectorAll('.vis-hover tr')].map(tr => [...tr.cells].map(td => td.classList.contains('vis-swatch') ? (td.firstChild?.style.background ? 'swatch' : '') : td.textContent));
    };
    test('a swatch of the color of the category, a dim of texts without categories, a row of the names of two values', async () => {
        expect(await table(undefined)).toEqual([['', '', 'y', 'note'], ['swatch', 'Tirol', '3', 'c'], ['swatch', 'Wien', '1', 'a']]);
    });
    test('"value": false leaves out the value of the position', async () => {
        expect(await table({ value: false })).toEqual([['swatch', 'Tirol', 'c'], ['swatch', 'Wien', 'a']]);
    });
});

describe('the highlight of a mark without groups', () => {
    test('the element of the row under the pointer, e.g. a bar of horizontal bars', async () => {
        const el = await mount({ def: {
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', height: 200,
            dims: { x: { column: 'value', zero: true }, y: 'land' },
            marks: { type: 'bar', fill: '#1E4F77', highlight: { fill: '#5BC5F2' } },
        }, data: 'land,value\nWien,1\nTirol,2\nSalzburg,3\n' });
        const rect = el.querySelectorAll('g.vis-mark rect')[1];
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 5, clientY: +rect.getAttribute('y') + 1 }));
        await nextTick();
        const highlighted = [...el.querySelectorAll('g.vis-mark rect.vis-highlight')];
        expect(highlighted).toHaveLength(1);
        expect(el.querySelector('.vis-highlighting')).not.toBeNull();
    });
});

describe('the listeners of the page', () => {
    test('an error of a listener is reported, the chart stays and the other listeners run', async () => {
        const { el, vis } = await mountVis({ def: lineDef(), data: 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,2,Tirol\n2021,3,Tirol' });
        const seen = [];
        ['update:state', 'select', 'hover'].forEach(name => {
            vis.on(name, () => { throw new Error(`bug of the page ${name}`) });
            vis.on(name, p => seen.push(name));
        });
        el.querySelector('.vis-legend-entry[data-key="Wien"]').click();
        await nextTick();
        await move(el, 10);
        // the box of the hover is drawn after the event
        expect(el.querySelector('.vis-hover')).not.toBeNull();
        el.querySelector('svg.vis-svg').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await nextTick();
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(el.querySelector('svg.vis-svg')).not.toBeNull();
        expect(seen).toEqual(['update:state', 'hover', 'select']);
        expect(errors.map(String)).toEqual(['update:state', 'hover', 'select'].map(n => expect.stringContaining(`bug of the page ${n}`)));
    });
});

describe('the end of the hover', () => {
    const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien';
    test('a chart drawn anew while a hover is shown emits hover null once, also its destroy', async () => {
        const { el, vis } = await mountVis({ def: lineDef(), data });
        const events = [];
        vis.on('hover', p => events.push(p?.key ?? null));
        await move(el, 10);
        expect(events).toEqual([2020]);
        vis.update({ def: lineDef({ title: 'Andere' }) });
        await vi.waitFor(() => expect(el.querySelector('.vis-title').textContent).toBe('Andere'));
        await nextTick();
        expect(el.querySelector('.vis-hover')).toBeNull();
        expect(events).toEqual([2020, null]);
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(events).toEqual([2020, null]);

        // a hover shown ends with the chart, before its listeners are removed,
        // also if a listener destroys it again
        await move(el, 10);
        vis.on('hover', () => vis.destroy());
        vis.destroy();
        expect(events).toEqual([2020, null, 2020, null]);
        // none without a hover shown
        const other = await mountVis({ def: lineDef(), data });
        const none = [];
        other.vis.on('hover', p => none.push(p));
        other.vis.destroy();
        expect(none).toEqual([]);
        expect(errors).toEqual([]);
    });
});
