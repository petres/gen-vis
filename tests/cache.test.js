// @vitest-environment jsdom
// the parts kept for a new width (the rows of a view, the values of the
// scales) and the highlight which only changes the elements whose state
// changes: the drawing is the one of a new visualisation
import { describe, test, expect, onTestFinished } from 'vitest';
import { createStore } from '@/store';
import { layout } from '@/layout';
import { makeScale } from '@/utils/scales';
import { examples, errors, useDom, mount, mountVis, pointer, nextTick, resize } from './dom.js';

useDom();

const lineDef = (options = {}) => ({
    options: { height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom', ticks: 5 } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left', ticks: 5 } },
        c: { column: 'land', type: 'categorical', legend: {}, hover: {}, categories: { Wien: { color: 'red' }, Tirol: { color: 'blue' } } },
    },
    plot: [
        { type: 'cartesian:line', by: ['c'], props: { stroke: '@color', fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } } },
        { type: 'svg:circle', by: ['c'], props: { fill: '@color', r: 3, cx: '@x:scaled', cy: '@y:scaled' } },
    ],
});

const lineData = `year,value,other,land
2020,1,10,Wien
2021,5,20,Wien
2022,3,30,Wien
2023,4,40,Wien
2020,2,50,Tirol
2021,2,60,Tirol
2022,2,70,Tirol
2023,2,80,Tirol`;

// the html of the visualisation without the counters of the ids, the
// attributes sorted, see snapshots.test.js
const drawing = el => (el.querySelector('.vis')?.outerHTML ?? '')
    .replace(/gen-vis-(gradient|control|facet)-\d+/g, 'gen-vis-$1-N')
    .replace(/data-vis="\d+"/g, 'data-vis="N"')
    .replace(/<([a-zA-Z][^\s/>]*)((?:\s+[^\s"'>/=]+(?:="[^"]*")?)*)(\s*\/?)>/g, (tag, name, attrs, end) =>
        `<${name}${(attrs.match(/[^\s"'>/=]+(?:="[^"]*")?/g) ?? []).sort((a, b) => a.split('=')[0] < b.split('=')[0] ? -1 : 1).map(a => ` ${a}`).join('')}${end}>`);

// the elements of the page measured with a width, e.g. of a resize
const measured = width => {
    const measure = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height: 400, right: width, bottom: 400 });
    onTestFinished(() => Element.prototype.getBoundingClientRect = measure);
};
const resizeTo = async width => {
    measured(width);
    resize();
    await new Promise(resolve => setTimeout(resolve, 150));
    await nextTick();
};

const cys = el => [...el.querySelectorAll('g.vis-mark.mark-1 circle')].map(c => c.getAttribute('cy'));

describe('a new width keeps the rows', () => {
    const store = async def => {
        const s = createStore();
        await s.init({ def, data: lineData });
        return s;
    };

    test('of the view before, the scales are the ones of the new width', async () => {
        const s = await store(lineDef());
        const before = layout(s, 800);
        const next = layout(s, 600, before);
        const fresh = layout(s, 600);
        expect(next.rows).toBe(before.rows);
        expect(next.facets[0].rows).toBe(before.facets[0].rows);
        expect(next.facets[0].scales.x.range()).toEqual(fresh.facets[0].scales.x.range());
        expect(next.facets[0].scales.x.domain()).toEqual(fresh.facets[0].scales.x.domain());
        expect(next.facets[0].scales.y.domain()).toEqual(fresh.facets[0].scales.y.domain());
        expect(next.facets[0].scales.x.range()).not.toEqual(before.facets[0].scales.x.range());
    });

    test('not of another state, data or definition', async () => {
        const s = await store(lineDef());
        const before = layout(s, 800);
        s.setState({ visible: { c: { Wien: false } } });
        const next = layout(s, 600, before);
        expect(next.rows).not.toBe(before.rows);
        expect(next.rows.map(r => r.c)).toEqual(['Tirol', 'Tirol', 'Tirol', 'Tirol']);

        const other = await store(lineDef());
        expect(layout(other, 600, next).rows).toHaveLength(8);
        other.data = other.data.slice(0, 2);
        expect(layout(other, 600, layout(other, 800)).rows).toHaveLength(2);
    });

    test('not of a filter of the width', async () => {
        const def = lineDef();
        def.filter = { x: { range: [{ steps: ['@totalWidth', { 0: 2022, 700: 2020 }] }, null] } };
        const s = await store(def);
        const before = layout(s, 800);
        expect(before.rows).toHaveLength(8);
        const next = layout(s, 600, before);
        expect(next.rows).not.toBe(before.rows);
        expect(next.rows).toHaveLength(4);
        expect(next.rows.map(r => r.x)).toEqual(layout(s, 600).rows.map(r => r.x));
    });
});

describe('a resize after a change draws the new rows', () => {
    // the visualisation after `change` and a resize to 600 is the one of a
    // new one of the same props in 600
    const resizedAfter = async (props, change, freshProps) => {
        const { el, vis } = await mountVis(props);
        await change(el, vis);
        await nextTick();
        await resizeTo(600);
        const fresh = await mount(freshProps);
        expect(drawing(el)).toBe(drawing(fresh));
        expect(errors).toEqual([]);
        return el;
    };

    test('of a toggle of a legend', async () => {
        const el = await resizedAfter({ def: lineDef(), data: lineData },
            el => el.querySelector('.vis-legend-entry[data-key="Wien"]').click(),
            { def: lineDef(), data: lineData, state: { visible: { c: { Wien: false } } } });
        expect(cys(el)).toHaveLength(4);
    });

    test('of a state set from outside', async () => {
        await resizedAfter({ def: lineDef(), data: lineData },
            (el, vis) => vis.update({ state: { visible: { c: { Tirol: false } } } }),
            { def: lineDef(), data: lineData, state: { visible: { c: { Tirol: false } } } });
    });

    test('of new data', async () => {
        const data = lineData.split('\n').slice(0, 5).join('\n');
        const { el, vis } = await mountVis({ def: lineDef(), data: lineData });
        vis.update({ data });
        await new Promise(resolve => setTimeout(resolve, 50));
        await nextTick();
        await resizeTo(600);
        expect(cys(el)).toHaveLength(4);
        expect(drawing(el)).toBe(drawing(await mount({ def: lineDef(), data })));
    });

    test('of a patch of a form element, which changes the rows in place', async () => {
        const withForm = () => {
            const def = lineDef();
            def.globals = { column: 'value' };
            def.formElements = [{ id: 'column', name: 'Wert', ref: 'column', type: 'radio', values: [
                { id: 'value', name: 'Value', value: 'value', patch: { mapping: { y: { column: 'value' } } } },
                { id: 'other', name: 'Other', value: 'other', patch: { mapping: { y: { column: 'other' } } } },
            ] }];
            return def;
        };
        const fresh = withForm();
        fresh.globals.column = 'other';
        const el = await resizedAfter({ def: withForm(), data: lineData },
            el => el.querySelectorAll('.vis-control .vis-radio input')[1].click(),
            { def: fresh, data: lineData });
        const ticks = [...el.querySelectorAll('g.vis-axis-left g.tick text')].map(t => parseFloat(t.textContent));
        expect(Math.max(...ticks)).toBe(80);
    });

    test('of globals of the page', async () => {
        const def = () => ({ ...lineDef(), globals: { year: 2020 }, filter: { x: { range: ['@year', null] } } });
        await resizedAfter({ def: def(), data: lineData },
            (el, vis) => vis.update({ globals: { year: 2022 } }),
            { def: def(), data: lineData, globals: { year: 2022 } });
    });
});

describe('the rows of the filter of a plot', () => {
    const def = () => {
        const d = { ...lineDef(), globals: { land: 'Wien' } };
        d.plot[1] = { ...d.plot[1], filter: { c: '@land' } };
        return d;
    };

    test('are the ones of the globals after a resize', async () => {
        const { el, vis } = await mountVis({ def: def(), data: lineData });
        expect(cys(el)).toHaveLength(4);
        await resizeTo(600);
        vis.update({ globals: { land: 'Tirol' } });
        await nextTick();
        await resizeTo(500);
        const fresh = await mount({ def: def(), data: lineData, globals: { land: 'Tirol' } });
        expect(cys(el)).toHaveLength(4);
        expect(drawing(el)).toBe(drawing(fresh));
    });

    test('of the width are new ones of a new width', async () => {
        const d = lineDef();
        d.plot[1] = { ...d.plot[1], filter: { x: { range: [{ steps: ['@totalWidth', { 0: 2022, 700: 2020 }] }, null] } } };
        const el = await mount({ def: d, data: lineData });
        expect(cys(el)).toHaveLength(8);
        await resizeTo(600);
        expect(cys(el)).toHaveLength(4);
        await resizeTo(800);
        expect(cys(el)).toHaveLength(8);
    });
});

describe('the values of the scales', () => {
    const rows = [{ v: 3 }, { v: 1 }, { v: null }, { v: 2 }, { v: 1 }];
    const scale = (type, extra = {}) => makeScale('v', { type: 'numeric', scale: { type, domain: [null, null], ...extra } }, rows);

    test('are the same for the same rows, also of other types of scales', () => {
        expect(scale('linear').domain()).toEqual([1, 3]);
        expect(scale('quantile', { range: ['a', 'b'] }).quantiles()).toEqual([2]);
        expect(makeScale('v', { type: 'numeric', scale: { type: 'linear', domain: [null, null], orientation: 'horizontal' } }, rows,
            { coord: { ranges: { horizontal: [0, 100] } } }).nearest(40)).toBe(2);
        expect(scale('ordinal').domain()).toEqual([1, 2, 3]);
        expect(makeScale('v', { type: 'categorical', scale: { type: 'band' } }, rows).domain()).toEqual([3, 1, 2]);
    });

    test('of new rows are new', () => {
        const a = [{ v: 1 }, { v: 2 }];
        const m = { type: 'numeric', scale: { type: 'linear', domain: [null, null] } };
        expect(makeScale('v', m, a).domain()).toEqual([1, 2]);
        expect(makeScale('v', m, [...a, { v: 5 }]).domain()).toEqual([1, 5]);
    });
});

describe('the highlight changes only the elements of another state', () => {
    // the definitions with others- props or highlights of rows
    const highlighted = examples.filter(d => /generation-hourly|wc\/def|bev\/def-bar|fti\/d2-series|rechtsform\/def-stacked-p|sprit-nuts\/def-facets/.test(d));

    test('of examples of others- props and of highlights of rows', () => {
        expect(highlighted.length).toBeGreaterThan(4);
    });

    // the elements of a drawing, not their order: a highlight puts the
    // highlighted groups after the others (also after it ends)
    const elements = el => drawing(el).split('><').sort();

    test.each(highlighted)('%s: moves of the pointer are the highlight of the last position', async def => {
        const el = await mount({ defFile: def });
        const drawn = elements(el);
        const events = el.querySelector('rect.vis-events');
        const move = async x => {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 150 }));
            await nextTick();
        };
        for (const x of [100, 300, 320, 500, 300])
            await move(x);
        // the end of the transitions of the highlight, e.g. of its opacity
        const ended = () => new Promise(resolve => setTimeout(resolve, 600));
        await ended();
        const moved = elements(el);
        events.dispatchEvent(pointer('pointerleave'));
        await nextTick();
        await ended();
        expect(elements(el)).toEqual(drawn);

        const fresh = await mount({ defFile: def });
        fresh.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 150 }));
        await nextTick();
        await ended();
        expect(moved).toEqual(elements(fresh));
        expect(errors).toEqual([]);
    }, 60000);
});
