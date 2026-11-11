// @vitest-environment jsdom
// the parts of 3.0 which make definitions more flexible: expressions of the globals in all parts
// of a definition, globals of the page, filters, props, scales, the hover,
// the highlight, legends, texts, transforms and messages
import { describe, test, expect, vi, onTestFinished } from 'vitest';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { errors, useDom, mount, mountVis, nextTick, rendered, highlighted, highlightCss } from './dom.js';

useDom();

const lineDef = (options = {}) => ({
    width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 }, ...options,
    dims: {
        x: { column: 'year', type: 'numeric', ticks: 5 },
        y: { column: 'value', type: 'numeric', ticks: 5, hover: { format: ',.1f' } },
        c: { column: 'land', legend: {}, hover: {}, categories: { Wien: 'red', Tirol: 'blue' } },
    },
    marks: [
        { id: 'lines', type: 'line', by: 'c' },
        { id: 'dots', type: 'point', by: 'c' },
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
    el.querySelector(`.vis-control input[value="${id}"]`).click();
    await nextTick();
};

describe('the parts of a definition as expressions of the global of a control', () => {
    const globalDef = () => {
        const def = lineDef({ title: 'Werte von {group:name}', subtitle: "=match(@group, {wien: 'in {unit}'})", height: '=match(@group, {wien: 200}, 300)' });
        def.marks[1].r = '=match(@group, {wien: 5}, 3)';
        return {
            ...def,
            globals: { group: 'all' },
            filter: "=match(@group, {wien: @c == 'Wien'}, true)",
            controls: [{ id: 'group', name: 'Gruppe', global: 'group', type: 'radio', values: [
                { id: 'all', name: 'Alle', value: 'all' },
                { id: 'wien', name: 'Wien', value: 'wien', globals: { unit: 'Personen' } },
            ] }],
        };
    };

    test('the options, the filter and the marks, the names of the entries in the texts', async () => {
        const el = await mount({ def: globalDef(), data: lineData });
        expect(el.querySelector('.vis-title').textContent).toBe('Werte von Alle');
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(7);
        expect(el.querySelector('svg.vis-svg').getAttribute('height')).toBe('300');

        await select(el, 'wien');
        expect(el.querySelector('.vis-title').textContent).toBe('Werte von Wien');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('in Personen');
        expect(el.querySelector('svg.vis-svg').getAttribute('height')).toBe('200');
        const circles = el.querySelectorAll('g.vis-mark circle');
        expect(circles).toHaveLength(3);
        expect(circles[0].getAttribute('r')).toBe('5');

        // back to the definition
        await select(el, 'all');
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(7);
        expect(el.querySelector('g.vis-mark circle').getAttribute('r')).toBe('3');
        expect(el.querySelector('.vis-subtitle').textContent).toBe('');
        expect(errors).toEqual([]);
    });

    test('the geometry of a map of a global, e.g. other features', async () => {
        const square = (id, x) => ({ type: 'Feature', id, properties: { name: id },
            geometry: { type: 'Polygon', coordinates: [[[x, 0], [x, 1], [x + 1, 1], [x + 1, 0], [x, 0]]] } });
        const def = {
            coord: 'geo', width: 300, height: 100,
            geo: { data: { type: 'FeatureCollection', features: [square('A', 0), square('B', 2), square('C', 4)] }, join: 'region',
                include: "=match(@view, {ab: literal(['A', 'B'])})" },
            globals: { view: 'all' },
            controls: [{ id: 'view', name: 'Karte', global: 'view', type: 'radio', values: [
                { id: 'all', name: 'Alle', value: 'all' },
                { id: 'ab', name: 'A und B', value: 'ab' },
            ] }],
            dims: { region: { column: 'region', type: 'categorical' }, value: { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } } },
            marks: { type: 'base', fill: '#EEE' },
        };
        const el = await mount({ def, data: 'region,value\nA,1\nB,2' });
        expect(el.querySelectorAll('.vis-features path')).toHaveLength(3);
        await select(el, 'ab');
        expect(el.querySelectorAll('.vis-features path')).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});

describe('globals of the page', () => {
    const def = () => {
        const def = lineDef({ title: '{titleText}{suffix}' });
        def.dims.c.categories.Wien = { color: 'red', name: "=match(@lang, {en: 'Vienna'})" };
        return {
            ...def,
            globals: { lang: 'de', titleText: 'Werte', suffix: '' },
            controls: [{ id: 'lang', global: 'lang', type: 'hidden', values: [
                { id: 'de', value: 'de', globals: { titleText: 'Werte' } },
                { id: 'en', value: 'en', globals: { titleText: 'Values' } },
            ] }],
        };
    };

    test('a hidden control is set by the page, not by the user', async () => {
        const states = [];
        const { el, vis } = await mountVis({ def: def(), data: lineData, globals: { lang: 'en' }, 'onUpdate:state': s => states.push(s) });
        expect(el.querySelector('.vis-control')).toBeNull();
        expect(el.querySelector('.vis-title').textContent).toBe('Values');
        expect(el.querySelector('.vis-legend-entry[data-key="Wien"]').textContent).toBe('Vienna');

        vis.update({ globals: { lang: 'de' } });
        await nextTick();
        expect(el.querySelector('.vis-title').textContent).toBe('Werte');
        expect(el.querySelector('.vis-legend-entry[data-key="Wien"]').textContent).toBe('Wien');
        // an unknown value of a control is ignored, other globals are set
        vis.update({ globals: { lang: 'fr', suffix: '!' } });
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
        const dims = { x: { type: 'numeric' }, d: { type: 'date' }, c: { type: 'categorical' } };
        const rows = [
            { x: 1, d: new Date(2020, 0, 1).getTime(), c: 'a' },
            { x: 2, d: new Date(2021, 0, 1).getTime(), c: 'b' },
            { x: null, d: null, c: 'c' },
        ];
        const keep = (conditions, scope) => filter(rows, rowFilter(conditions, dims, scope)).map(r => r.c);
        expect(keep({ x: 1 })).toEqual(['a']);
        expect(keep({ x: '2' })).toEqual(['b']);
        expect(keep({ c: ['a', 'c'] })).toEqual(['a', 'c']);
        expect(keep({ x: null })).toEqual(['c']);
        expect(keep({ x: { not: null } })).toEqual(['a', 'b']);
        expect(keep({ c: { not: ['a'] } })).toEqual(['b', 'c']);
        expect(keep({ d: { range: ['2020-06-01', null] } })).toEqual(['b']);
        expect(keep({ x: { range: [null, '@max'] } }, { max: 1 })).toEqual(['a']);
        expect(keep({ c: '@c', x: { not: null } }, { c: 'b' })).toEqual(['b']);
        expect(() => rowFilter({ x: { from: 1 } }, dims)).toThrow('filter.x: expected');
    });

    test('of a mark and of the hover', async () => {
        const def = lineDef();
        def.marks[1].filter = "@c == 'Wien' and @y != null";
        def.hover = { filter: { c: 'Tirol' } };
        const el = await mount({ def, data: lineData });
        expect(el.querySelectorAll('g.vis-mark[data-mark="dots"] circle')).toHaveLength(3);
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        expect([...el.querySelectorAll('.vis-hover tr.vis-hover-entry')].map(r => r.textContent)).toEqual(['Tirol2,0']);
        expect(errors).toEqual([]);
    });
});

describe('props', () => {
    test('margins of the width of the visualisation, offsets and matches of marks', async () => {
        const def = lineDef();
        def.margins.left = '=steps(@totalWidth, {0: 20, 500: 100})';
        def.dims.x.pad = 0;
        def.marks[1].cx = '=@x:scaled - 5';
        def.marks[1].r = '=match(@c, {Wien: 6}, 2)';
        const el = await mount({ def, data: lineData });
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
        const scale = (s, type = 'numeric') => makeScale('v', { type, scale: { type: 'linear', orientation: 'horizontal', domain: [null, null], pad: 0, ...s } }, rows, { coord: { ranges: { horizontal: [0, 100] } } });
        expect(scale({ include: 0 }).domain()).toEqual([0, 6]);
        expect(scale({ include: [10, '@max'] }).domain()).toEqual([2, 10]);
        expect(makeScale('v', { type: 'numeric', scale: { type: 'linear', domain: [null, null], include: ['@max'] } }, rows, { scope: { max: 20 } }).domain()).toEqual([2, 20]);
        expect(scale({ center: 0 }).domain()).toEqual([-6, 6]);
        expect(scale({ include: 0, pad: 0.5 }).domain()).toEqual([-3, 9]);
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
        def.dims.y = { column: 'land', scale: { type: 'band', padding: 0 } };
        def.dims.x.pad = 0;
        def.marks = [{ id: 'zero', type: 'rect', x: '@x:scaled:2021', height: '@y:bandwidth', width: '@y:step' }];
        def.annotations = [{ type: 'text', x: 2020, y: 'Wien', text: 'a', props: { dy: '@y:bandwidth' } }];
        const el = await mount({ def, data: lineData });
        // 250 pixels, two bands
        const rect = el.querySelector('g.vis-mark[data-mark="zero"] rect');
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
            width: 400, height: 260, margins: { top: 0, right: 0, bottom: 0, left: 60 },
            dims: {
                x: { column: 'v', domain: [0, 10], pad: 0 },
                y: { column: 'y', type: 'categorical', range: [0, '@height'], scale: { type: 'band', padding: 0, groups: { by: 'g' } } },
                g: { column: 'g', type: 'categorical' },
            },
            marks: [
                { id: 'bars', type: 'bar', orient: 'horizontal' },
                { id: 'zero', type: 'svg:line', x1: 0, x2: 0, y1: '@y:group:start', y2: '@y:group:end', stroke: 'black' },
            ],
        };
        const data = 'y,g,v\na,one,1\nb,one,2\nc,two,3';
        const el = await mount({ def, data });
        // 3 categories and a gap, 65 pixels each
        expect([...el.querySelectorAll('g.vis-mark[data-mark="bars"] rect')].map(r => [r.getAttribute('y'), r.getAttribute('height')]))
            .toEqual([['0', '65'], ['65', '65'], ['195', '65']]);
        expect([...el.querySelectorAll('g.vis-axis-left .tick')].map(t => t.getAttribute('transform'))).toEqual(['translate(0,32.5)', 'translate(0,97.5)', 'translate(0,227.5)']);
        expect([...el.querySelectorAll('g.vis-mark[data-mark="zero"] line')].map(l => [l.getAttribute('y1'), l.getAttribute('y2')]))
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
        def.hover = { box: false, marker: false };
        def.marks[1].highlight = { r: 6 };
        const hovers = [];
        const el = await mount({ def, data: lineData, onHover: e => hovers.push(e) });
        await move(el, 100, 100);
        expect(el.querySelector('.vis-hover')).toBeNull();
        expect(el.querySelector('.vis-hover-marker').getAttribute('visibility')).toBe('hidden');
        expect(highlighted(el, 'circle').length).toBeGreaterThan(0);
        expect(hovers.at(-1).key).toBe(2021);
        expect(errors).toEqual([]);
    });

    test('at the pointer, on a side, moved by an offset', async () => {
        const def = lineDef();
        def.hover = { position: 'pointer', side: 'above', offset: [0, -10] };
        const el = await mount({ def, data: lineData });
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
        def.dims.x = { column: 'value', zero: true };
        def.dims.y = { column: 'year', type: 'categorical' };
        def.marks = { type: 'bar', by: 'c' };
        def.hover = { area: 'facet' };
        const el = await mount({ def, data: lineData });
        const area = el.querySelector('rect.vis-events');
        expect(['x', 'y', 'width', 'height'].map(a => area.getAttribute(a))).toEqual(['-40', '-10', '600', '300']);
        expect(errors).toEqual([]);
    });
});

describe('the highlight', () => {
    test('the symbols of the legend and of the hover of a mark with a highlight: of the stylesheet of the highlighted entry and the nearest row, the props of a category as custom properties', async () => {
        const def = { width: 500, height: 200, dims: { x: 'year', y: 'v', c: { column: 'c', legend: {}, categories: { a: { color: '#C3423F', wide: 4 }, b: { color: '#1E4F77', wide: 5 } } } },
            marks: [{ type: 'line', by: 'c', 'stroke-width': 2, highlight: { 'stroke-width': '@wide', opacity: 1, 'font-weight': 'bold' } }, { type: 'point', by: 'c', r: 2 }] };
        const el = await mount({ def, data: 'year,v,c\n2020,1,a\n2021,2,a\n2020,2,b\n2021,3,b' });
        const lines = [...el.querySelectorAll('.vis-legend-entry svg line')];
        expect(lines.map(l => [l.getAttribute('data-symbol-of'), l.style.getPropertyValue('--vis-hl-stroke-width')])).toEqual([['mark-0', '4'], ['mark-0', '5']]);
        // the points have no highlight: no attribute
        expect(el.querySelector('.vis-legend-entry svg circle').hasAttribute('data-symbol-of')).toBe(false);
        // only the props a symbol shows, not a font-weight
        const rule = highlightCss(el).split('\n').find(r => r.includes('[data-symbol-of="mark-0"]'));
        expect(rule).toMatch(/\.vis-legend-highlight \[data-symbol-of="mark-0"\], .* \.vis-hover \.vis-nearest \[data-symbol-of="mark-0"\] \{ stroke-width: var\(--vis-hl-stroke-width\); opacity: 1; \}$/);
        expect(errors).toEqual([]);
    });

    test('a highlight value of the rows is none of the symbols; the hover of default colors has swatches, unless another dim of the row has a color of its own', async () => {
        const def = { width: 500, height: 200, dims: { x: 'year', y: 'v', c: { column: 'c', legend: {} } },
            marks: [{ type: 'line', by: 'c', 'stroke-width': 2, highlight: { 'stroke-width': '=@y > 1 ? 4 : 2', stroke: '@color' } }] };
        const data = 'year,v,c\n2020,1,a\n2021,2,a\n2020,2,b\n2021,3,b';
        const el = await mount({ def, data });
        const lines = [...el.querySelectorAll('.vis-legend-entry svg line')];
        expect(lines.map(l => [l.style.getPropertyValue('--vis-hl-stroke-width'), l.style.getPropertyValue('--vis-hl-stroke')]))
            .toEqual([['', '#4269D0'], ['', '#EFB118']]);
        const { pointer } = await import('./dom.js');
        const swatches = async el => {
            el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
            await new Promise(r => setTimeout(r, 0));
            return el.querySelectorAll('.vis-hover .vis-swatch').length;
        };
        expect(await swatches(el)).toBe(2);
        // the lines of the colors of t, not of the default ones of c
        const other = await mount({ def: { ...def, hover: { columns: ['c'] }, dims: { ...def.dims, t: { column: 't', categories: { u: '#111111' } } },
            marks: [{ type: 'line', by: ['c', 't'] }] }, data: 'year,v,c,t\n2020,1,a,u\n2021,2,a,u\n2020,2,b,u\n2021,3,b,u' });
        expect(await swatches(other)).toBe(0);
        expect(other.querySelectorAll('.vis-hover .vis-hover-entry').length).toBe(2);
        expect(errors).toEqual([]);
    });

    test('the props of the others, the elements which are not highlighted, also of marks without categories', async () => {
        const def = lineDef();
        def.marks[1] = { ...def.marks[1], highlight: { mode: 'row', r: 6 }, others: { opacity: 0.3 } };
        def.marks.push({ id: 'last', type: 'text', select: 'last', order: 'x', text: 'last', others: { visibility: 'hidden' } });
        const el = await mount({ def, data: lineData });
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        // the element of the row has the class, the others are styled by the
        // stylesheet while the marks are highlighting, see utils/highlight.js
        const circles = [...el.querySelectorAll('g.vis-mark[data-mark="dots"] circle')];
        expect(highlighted(el, 'g.vis-mark[data-mark="dots"] circle')).toHaveLength(1);
        expect(circles.every(c => c.getAttribute('r') == '3' && c.getAttribute('opacity') === null)).toBe(true);
        expect(el.querySelector('g.vis-highlighting g.vis-mark[data-mark="dots"]')).not.toBeNull();
        const css = highlightCss(el);
        expect(css).toContain('[data-mark="dots"] .vis-highlight:not(g), .vis[data-vis="');
        expect(css).toContain('.vis-highlight *:not(g) { r: 6; }');
        expect(css).toContain('.vis-highlighting [data-mark="dots"] *:not(g):not(.vis-highlight):not(.vis-highlight *) { opacity: 0.3; }');
        expect(css).toContain('.vis-highlighting [data-mark="last"] *:not(g):not(.vis-highlight):not(.vis-highlight *) { visibility: hidden; }');

        // the end of the highlight removes the classes
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(el.querySelectorAll('.vis-highlight, .vis-highlighting, .vis-highlight-group')).toHaveLength(0);

        // an entry of the legend highlights its category
        el.querySelector('.vis-legend-entry[data-key="Wien"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        await nextTick();
        expect(highlighted(el, 'g.vis-group[data-group-c="Wien"] circle')).toHaveLength(3);
        expect(highlighted(el, 'g.vis-group[data-group-c="Tirol"] circle')).toHaveLength(0);
        expect(el.querySelector('g.vis-highlighting g.vis-mark[data-mark="dots"]')).not.toBeNull();
        expect(errors).toEqual([]);
    });

    test('a highlight of the same elements changes nothing, others- props also without highlight- props', async () => {
        const def = lineDef();
        def.marks[1] = { ...def.marks[1], highlight: { r: 6 } };
        const el = await mount({ def, data: lineData });
        const { pointer } = await import('./dom.js');
        const events = el.querySelector('rect.vis-events');
        // the position of a circle of a group, Wien has no value of 2021
        const at = (land, i) => {
            const c = el.querySelectorAll(`g.vis-group[data-group-c="${land}"] circle`)[i];
            return { clientX: +c.getAttribute('cx'), clientY: +c.getAttribute('cy') };
        };
        events.dispatchEvent(pointer('pointermove', at('Wien', 0)));
        await nextTick();
        expect(highlighted(el, 'g.vis-group[data-group-c="Wien"] circle')).toHaveLength(3);
        // another row of the same group
        const mark = el.querySelector('g.vis-mark[data-mark="dots"]');
        const changes = [];
        const observer = new MutationObserver(records => changes.push(...records));
        observer.observe(mark, { attributes: true, subtree: true, childList: true });
        events.dispatchEvent(pointer('pointermove', at('Wien', 2)));
        await nextTick();
        changes.push(...observer.takeRecords());
        expect(el.querySelector('.vis-hover-title').textContent).toBe('2023');
        expect(changes.map(c => [c.type, c.attributeName, c.target.tagName, c.target.getAttribute(c.attributeName), c.oldValue])).toEqual([]);
        // another group
        events.dispatchEvent(pointer('pointermove', at('Tirol', 3)));
        await nextTick();
        changes.push(...observer.takeRecords());
        expect(changes.length).toBeGreaterThan(0);
        expect(highlighted(el, 'g.vis-group[data-group-c="Tirol"] circle')).toHaveLength(4);
        observer.disconnect();

        // the others- props of a highlight without elements of highlight- props
        const others = lineDef();
        others.marks[1] = { ...others.marks[1], others: { opacity: 0.3 } };
        const el2 = await mount({ def: others, data: lineData });
        el2.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        expect(el2.querySelector('g.vis-highlighting g.vis-mark[data-mark="dots"]')).not.toBeNull();
        expect(highlightCss(el2)).toContain('[data-mark="dots"] *:not(g):not(.vis-highlight):not(.vis-highlight *) { opacity: 0.3; }');
        expect(errors).toEqual([]);
    });

    test('the transitions of quick changes of the highlight end at the values of the definition', async () => {
        const def = lineDef();
        def.highlight = { transition: 40 };
        def.marks[1] = { ...def.marks[1], highlight: { mode: 'row', fill: 'black' }, others: { opacity: 0.3 }, fill: 'red' };
        def.dims.c.categories.Wien = {};
        const el = await mount({ def, data: lineData });
        const { pointer } = await import('./dom.js');
        const events = el.querySelector('rect.vis-events');
        // other rows, back to the first one and away, while the transitions run
        for (const x of [100, 300, 500, 100, 300, 100, 500]) {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 100 }));
            await new Promise(r => setTimeout(r, 15));
        }
        events.dispatchEvent(pointer('pointerleave'));
        const circles = [...el.querySelectorAll('g.vis-mark[data-mark="dots"] circle')];
        await vi.waitFor(() => expect(circles.map(c => [c.getAttribute('fill'), c.getAttribute('opacity')]).filter(([f, o]) => !['red', 'rgb(255, 0, 0)'].includes(f) || o !== null)).toEqual([]));
        expect(circles.every(c => !c.hasAttribute('default-fill'))).toBe(true);
        expect(errors).toEqual([]);
    });

    test('a transition of the highlight', async () => {
        const def = lineDef();
        def.highlight = { transition: 50 };
        def.marks[1].highlight = { r: 6 };
        const el = await mount({ def, data: lineData });
        const { pointer } = await import('./dom.js');
        el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        expect(highlighted(el, 'circle').length).toBeGreaterThan(0);
        // the transition is the one of the stylesheet
        expect(highlightCss(el)).toContain('[data-mark] *:not(g) { transition-property: r; transition-duration: 50ms; }');
        expect(errors).toEqual([]);
    });
});

describe('legends', () => {
    test('categories without an entry, legends below and beside the plot area', async () => {
        const def = lineDef();
        def.dims.c.categories.Tirol = { color: 'blue', legend: false };
        def.dims.c.legend = { position: 'bottom' };
        def.dims.v = { column: 'value', type: 'numeric', name: 'Wert', scale: { type: 'sequential', interpolator: 'Blues' }, legend: { position: 'left', orientation: 'vertical', size: 120, values: [1, 2, 3], labels: 'before' } };
        delete def.width;
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('.vis-legends-bottom .vis-legend-entry')].map(e => e.dataset.key)).toEqual(['Wien']);
        // Tirol stays visible
        expect(el.querySelectorAll('g.vis-group[data-group-c="Tirol"] circle')).toHaveLength(4);
        // the legend of the colors left of the plot area
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
        def.dims.x = { column: 'value', zero: true };
        def.dims.y = { column: 'name', type: 'categorical', reverse: true,
            axis: { labels: { by: ['level'], props: { 'font-weight': '@weight', text: '@short', 'max-width': 30 } } } };
        def.dims.level = { column: 'level', categories: { header: { weight: 'bold' }, item: { weight: 'normal' } } };
        def.dims.short = { column: 'short', type: 'categorical' };
        def.marks = { type: 'bar' };
        delete def.dims.c;
        return def;
    };
    const data = 'name,short,level,value\nA long name,A long,header,1\nB,B,item,2';

    test('the props of the labels of an axis by the categories of their rows, cut in a width', async () => {
        const el = await mount({ def: bars(), data });
        const labels = [...el.querySelectorAll('.vis-axis-left .tick text')];
        expect(labels.map(t => t.getAttribute('font-weight'))).toEqual(['bold', 'normal']);
        // 30 pixels of 12 pixels per character are 4 characters, estimated without layout
        expect(labels.map(t => t.childNodes[0].textContent)).toEqual(['A l…', 'B']);
        expect(labels[0].querySelector('title').textContent).toBe('A long');
        expect(errors).toEqual([]);
    });

    test('texts of a text mark cut or wrapped in a width', async () => {
        const def = lineDef();
        def.marks = [
            { id: 'cut', type: 'text', select: 'first', by: 'c', x: '=literal(0)', y: '=literal(0)', text: 'a long label of a line', 'max-width': 40 },
            { id: 'wrap', type: 'text', select: 'first', by: 'c', x: '=literal(5)', y: '=literal(0)', text: 'a long label of a line', 'max-width': 40, 'text-overflow': 'wrap', 'dominant-baseline': 'middle' },
        ];
        const el = await mount({ def, data: lineData });
        const cut = el.querySelector('g.vis-mark[data-mark="cut"] text');
        expect(cut.childNodes[0].textContent).toBe('a lon…');
        const lines = [...el.querySelectorAll('g.vis-mark[data-mark="wrap"] text')[0].querySelectorAll('tspan')];
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
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json',
            ...lineDef(),
            globals: { lang: 'de' },
            controls: [{ id: 'lang', global: 'lang', type: 'hidden', values: [{ id: 'de', value: 'de' }, { id: 'en', value: 'en' }] }],
            transform: [
                { type: 'lookup', column: 'land', data: 'names.csv', key: 'code', value: '{lang}', as: 'label' },
                { type: 'rank', column: 'value', by: 'year', descending: true, as: 'rank' },
            ],
            dims: { ...lineDef().dims, label: { column: 'label', type: 'categorical' }, rank: { column: 'rank', type: 'numeric' } },
            marks: [{ id: 'labels', type: 'text', select: 'last', by: 'c', x: '=literal(0)', y: '=literal(0)', text: '@label', 'data-rank': '@rank' }],
        }));
        try {
            const { el, vis } = await mountVis({ defFile: '/tests/tmp-lookup/def.json', data: lineData, globals: { lang: 'en' } });
            const texts = () => [...el.querySelectorAll('g.vis-mark[data-mark="labels"] text')].map(t => [t.textContent, t.getAttribute('data-rank')]);
            // 2023: Wien 4, Tirol 2
            expect(texts()).toEqual([['Vienna', '1'], ['Tyrol', '2']]);
            vis.update({ globals: { lang: 'de' } });
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
        const narrowMessage = "steps(@totalWidth, {0: 'Zu schmal', 400: null})";
        const def = lineDef({
            message: `=match(@group, {top3: 'Die Top 3 sind je Indikator andere Länder.'}, ${narrowMessage})`,
            empty: 'Keine Daten für {group:name}',
            class: 'chart-{group}',
        });
        def.globals = { group: 'all', shareScale: 'x' };
        def.filter = "@group != 'none'";
        def.controls = [{ id: 'group', name: 'Gruppe', global: 'group', type: 'radio', values: [
            { id: 'all', name: 'Alle', value: 'all' },
            { id: 'none', name: 'Keine', value: 'none' },
            { id: 'top3', name: 'Top 3', value: 'top3' },
        ] }];
        const el = await mount({ def, data: lineData });
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
        expect(el.querySelectorAll('g.vis-mark circle')).toHaveLength(7);

        // a narrow visualisation
        const narrow = lineDef({ width: 300, message: `=${narrowMessage}` });
        const small = await mount({ def: narrow, data: lineData });
        expect(small.querySelector('.vis-message').textContent).toBe('Zu schmal');
        expect(errors).toEqual([]);
    });
});

describe('linked charts', () => {
    test('the highlight of the page, e.g. the row under the mouse of another chart', async () => {
        const { pointer } = await import('./dom.js');
        const def = lineDef();
        def.marks[1].highlight = { r: 6 };
        const row = { value: null };
        const el = document.body.appendChild(document.createElement('div'));
        const b = await mountVis({ def, data: lineData, highlight: null });
        const a = await mountVis({ def, data: lineData, onHover: e => b.vis.update({ highlight: row.value = e?.nearest ? { c: e.nearest.c } : null }) });
        a.el.classList.add('a');
        b.el.classList.add('b');
        el.append(a.el, b.el);
        const marked = () => highlighted(el, '.b circle').map(c => c.parentNode.dataset.groupC);
        expect(marked()).toEqual([]);

        // the hover of the first chart highlights the category in the second one
        el.querySelector('.a rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        await nextTick();
        const key = row.value.c;
        expect(new Set(marked())).toEqual(new Set([key]));

        // its own hover replaces it while it is shown
        el.querySelector('.b rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
        await nextTick();
        el.querySelector('.b rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        expect(new Set(marked())).toEqual(new Set([key]));

        el.querySelector('.a rect.vis-events').dispatchEvent(pointer('pointerleave'));
        await nextTick();
        await nextTick();
        expect(marked()).toEqual([]);
        expect(errors).toEqual([]);
    });
});

describe('the marks of a global', () => {
    test('a mark of another type of a global is drawn anew', async () => {
        const def = lineDef();
        def.globals = { kind: 'dots' };
        def.marks = "=match(@kind, {bars: literal([{id: 'lines', type: 'line', by: 'c'}, {id: 'dots', type: 'rect', by: 'c', x: 'x', y: 'y', width: 4, height: 4}])}, "
            + "literal([{id: 'lines', type: 'line', by: 'c'}, {id: 'dots', type: 'point', by: 'c'}]))";
        def.controls = [{ id: 'kind', name: 'Art', global: 'kind', type: 'radio', values: [
            { id: 'dots', name: 'Punkte', value: 'dots' },
            { id: 'bars', name: 'Balken', value: 'bars' },
        ] }];
        const el = await mount({ def, data: lineData });
        await select(el, 'bars');
        expect(el.querySelectorAll('g.vis-mark[data-mark="dots"] circle')).toHaveLength(0);
        expect(el.querySelectorAll('g.vis-mark[data-mark="dots"] rect')).toHaveLength(7);
        await select(el, 'dots');
        expect(el.querySelectorAll('g.vis-mark[data-mark="dots"] circle')).toHaveLength(7);
        expect(errors).toEqual([]);
    });

    test('the legend symbol "auto" is the one of the marks of the global', async () => {
        const def = lineDef();
        def.dims.c.legend = { symbol: 'auto' };
        def.globals = { kind: 'lines' };
        def.marks = "=match(@kind, {bars: literal([{id: 'p', type: 'bar', by: 'c', width: 4}])}, literal([{id: 'p', type: 'line', by: 'c'}]))";
        def.controls = [{ id: 'kind', name: 'Art', global: 'kind', type: 'radio', values: [
            { id: 'lines', name: 'Linien', value: 'lines' },
            { id: 'bars', name: 'Balken', value: 'bars' },
        ] }];
        const el = await mount({ def, data: lineData });
        const symbols = () => [...el.querySelectorAll('.vis-legend-entry svg')].map(s => [...s.children].map(c => c.tagName).join());
        expect(symbols()).toEqual(['line', 'line']);
        await select(el, 'bars');
        expect(symbols()).toEqual(['rect', 'rect']);
        await select(el, 'lines');
        expect(symbols()).toEqual(['line', 'line']);
        expect(errors).toEqual([]);
    });
});

describe('the locale of a global', () => {
    test('a control of the language changes the formats', async () => {
        const def = lineDef({ locale: '@lang' });
        def.dims.y.hover = { format: ',.1f' };
        def.globals = { lang: 'de' };
        def.controls = [{ id: 'lang', name: 'Sprache', global: 'lang', type: 'radio', values: [
            { id: 'de', name: 'Deutsch', value: 'de' },
            { id: 'en', name: 'English', value: 'en' },
        ] }];
        const el = await mount({ def, data: lineData });
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
    test('of the data, ascending, descending or by a dim, also in groups', async () => {
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
        def.dims.x = { column: 'value', zero: true };
        def.dims.y = { column: 'name', type: 'categorical', reverse: true, axis: { labels: { props: { 'max-width': 30 } } } };
        delete def.dims.c;
        def.marks = { type: 'bar' };
        def.hover = { area: 'facet' };
        const el = await mount({ def, data: 'name,value\nA long name,1\nB,2' });
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

describe('fixed ticks of dates', () => {
    test('are converted as the dates of the data', async () => {
        const def = lineDef();
        def.dims.x = { column: 'day', type: 'date', scale: { type: 'utc' }, grid: true,
            axis: { values: ['2020-02-01', '2020-03-01', '2030-01-01'], format: '%b' } };
        const el = await mount({ def, data: 'day,value,land\n2020-01-01,1,Wien\n2020-04-01,2,Wien' });
        expect([...el.querySelectorAll('.vis-axis-bottom .tick text')].map(t => t.textContent)).toEqual(['Feb', 'Mrz']);
        expect(el.querySelectorAll('.vis-grid line')).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});

describe('ticks of null', () => {
    test('are the ones of tickSpacing, e.g. a parent with ticks', async () => {
        const def = lineDef();
        def.dims.x.ticks = null;
        def.dims.x.tickSpacing = 250;
        const el = await mount({ def, data: lineData });
        // 550 pixels, about 2 ticks
        expect(el.querySelectorAll('.vis-axis-bottom .tick').length).toBeLessThanOrEqual(3);
        expect(errors).toEqual([]);
    });
});

describe('labels of a horizontal axis which overlap', () => {
    const years = Array.from({ length: 21 }, (_, i) => 2002 + i);
    const rows = 'year,value\n' + years.map(y => `${y},1`).join('\n');
    const labels = el => [...el.querySelectorAll('.vis-axis-bottom .tick text')].map(t => t.textContent);

    test('every n-th label of the categories of a narrow chart, all of a wide one, the tick marks stay', async () => {
        const def = { width: 300, height: 200, dims: { x: { column: 'year', type: 'categorical' }, y: 'value' }, marks: { type: 'bar' } };
        const narrow = await mount({ def, data: rows });
        const texts = labels(narrow);
        expect(texts).toHaveLength(21);
        const shown = texts.filter(Boolean);
        expect(shown.length).toBeLessThan(21);
        expect(shown[0]).toBe('2002');
        // the same step between the ones shown
        const step = texts.indexOf(shown[1]);
        expect(texts.every((t, i) => (i % step == 0) == (t !== ''))).toBe(true);
        const wide = await mount({ def: { ...def, width: 2000 }, data: rows });
        expect(labels(wide).filter(Boolean)).toHaveLength(21);
        expect(errors).toEqual([]);
    });

    test('of numbers of many ticks, not of values given or rotated labels', async () => {
        const def = { width: 200, height: 200, dims: { x: { column: 'year', type: 'numeric', format: 'd', axis: { ticks: 21 } }, y: 'value' }, marks: { type: 'line' } };
        const shown = labels(await mount({ def, data: rows })).filter(Boolean);
        expect(shown.length).toBeGreaterThan(1);
        expect(shown.length).toBeLessThan(labels(await mount({ def, data: rows })).length);
        const given = { ...def, dims: { ...def.dims, x: { ...def.dims.x, axis: { values: years } } } };
        expect(labels(await mount({ def: given, data: rows })).filter(Boolean)).toHaveLength(21);
        const rotated = { ...def, dims: { ...def.dims, x: { ...def.dims.x, axis: { ticks: 21, rotate: 90 } } } };
        expect(labels(await mount({ def: rotated, data: rows })).every(Boolean)).toBe(true);
        expect(errors).toEqual([]);
    });
});

describe('fixed ticks as a prop', () => {
    test('e.g. fewer of a narrow visualisation', async () => {
        const def = lineDef({ width: 400 });
        delete def.dims.x.ticks;
        def.dims.x.axis = { format: 'd', values: '=steps(@totalWidth, {0: literal([2020, 2023]), 500: literal([2020, 2021, 2022, 2023])})' };
        const el = await mount({ def, data: lineData });
        expect([...el.querySelectorAll('.vis-axis-bottom .tick text')].map(t => t.textContent)).toEqual(['2020', '2023']);
        expect(errors).toEqual([]);
    });
});

describe('default colors', () => {
    test('of categories without colors, the colors of the categories of a mark first', async () => {
        const def = lineDef();
        def.dims.c.categories = { Wien: {}, Tirol: {} };
        def.dims.g = { column: 'land', categories: { Wien: 'black', Tirol: {} } };
        def.marks[1].by = ['c', 'g'];
        const el = await mount({ def, data: lineData });
        // the lines of the default colors, a color of a category of the mark before them
        expect([...el.querySelectorAll('g.vis-mark[data-mark="lines"] path')].map(p => p.getAttribute('stroke'))).toEqual(['#4269D0', '#EFB118']);
        expect([...el.querySelectorAll('g.vis-mark[data-mark="dots"] g.vis-group')].map(g => g.querySelector('circle').getAttribute('fill'))).toEqual(['black', '#EFB118']);
        expect(el.querySelector('.vis-legend-entry[data-key="Tirol"]').textContent).toBe('Tirol');
        expect(errors).toEqual([]);
    });
});

describe('the step of a band scale', () => {
    test('the height of the plot area follows the categories, the bars keep their size', async () => {
        const def = lineDef();
        def.margins = { top: 10, right: 10, bottom: 20, left: 40 };
        def.dims.x = { column: 'value', zero: true };
        def.dims.y = { column: 'year', type: 'categorical', scale: { padding: 0, step: 20 } };
        def.marks = { type: 'bar', by: 'c' };
        const el = await mount({ def, data: lineData });
        // 4 years of 20 pixels, the margins
        const svg = el.querySelector('svg.vis-svg');
        expect(svg.getAttribute('height')).toBe('110');
        const data = lineData.split('\n').filter(l => !l.startsWith('2023')).join('\n');
        const less = await mount({ def, data });
        expect(less.querySelector('svg.vis-svg').getAttribute('height')).toBe('90');
        expect(less.querySelector('g.vis-mark rect').getAttribute('height')).toBe('20');
        expect(errors).toEqual([]);
    });
});

describe('the props of the labels and of the line of an axis, the titles of facets', () => {
    // the years around the circle, the values from the center
    const polarDef = () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.dims.x = { column: 'year', type: 'numeric', domain: [2020, 2024], axis: {
            values: [2020, 2021, 2022, 2023], labels: { props: { fill: '#777', 'font-size': 10, text: '@x', 'max-width': 15 } },
            domain: { props: { 'stroke-opacity': 0.4 } } } };
        def.dims.y = { column: 'value', type: 'numeric', domain: [0, 4], ticks: 2, axis: { angle: 90,
            labels: { props: { fill: '#777', 'stroke-width': 2, 'stroke-opacity': 0.5 } }, domain: { props: { 'stroke-opacity': '@opacity' } } }, hover: {} };
        def.globals = { opacity: 0.4 };
        def.marks = { type: 'line', by: 'c' };
        return def;
    };

    test('the labels and the lines of the axes of polar charts', async () => {
        const { validateDef } = await import('@/utils/validate');
        const def = polarDef();
        expect(validateDef(def)).toEqual([]);
        const el = await mount({ def, data: lineData });
        // the texts of the props, 10 pixels high and cut at 15 pixels, estimated without layout
        const angular = [...el.querySelectorAll('.vis-axis-angular .tick text')];
        expect(angular.map(t => t.childNodes[0].textContent)).toEqual(['2…', '2…', '2…', '2…']);
        expect(angular.map(t => t.querySelector('title').textContent)).toEqual(['2020', '2021', '2022', '2023']);
        expect(angular.every(t => t.getAttribute('fill') == '#777' && t.getAttribute('font-size') == '10')).toBe(true);
        expect(el.querySelector('.vis-axis-angular circle.domain').getAttribute('stroke-opacity')).toBe('0.4');
        // the values of the format, the halo of the props
        const radial = [...el.querySelectorAll('.vis-axis-radial .tick text')];
        expect(radial.map(t => t.textContent)).toEqual(['0', '2', '4']);
        expect(radial.map(t => [t.getAttribute('fill'), t.getAttribute('stroke-width'), t.getAttribute('stroke-opacity')]))
            .toEqual(Array(3).fill(['#777', '2', '0.5']));
        expect(el.querySelector('.vis-axis-radial line.domain').getAttribute('stroke-opacity')).toBe('0.4');
        expect(errors).toEqual([]);
    });

    test('the line of a cartesian axis and the size of its labels', async () => {
        const def = lineDef();
        def.dims.y.axis = { labels: { props: { 'font-size': 9 } }, domain: { props: { 'stroke-opacity': 0.4 } } };
        const el = await mount({ def, data: lineData });
        expect(el.querySelector('.vis-axis-left path.domain').getAttribute('stroke-opacity')).toBe('0.4');
        expect([...el.querySelectorAll('.vis-axis-left .tick text')].every(t => t.getAttribute('font-size') == '9')).toBe(true);

        const { validateDef } = await import('@/utils/validate');
        def.dims.y.axis.domain = { props: { stroke: '@colour' } };
        def.dims.x.axis = { domain: 'none' };
        expect(validateDef(def)).toEqual([
            `dims.x.axis.domain: expected the props of the line of the axis, e.g. { "props": { "stroke-opacity": 0.4 } }`,
            "dims.y.axis.domain.props.stroke: unknown reference 'colour', expected one of 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height'",
        ]);
        expect(errors).toEqual([]);
    });

    test('the titles of the facets span their plot areas, the ones of polar plots are centered', async () => {
        const def = lineDef();
        def.facets = { by: 'c', cols: 2 };
        const el = await mount({ def, data: lineData });
        const titles = [...el.querySelectorAll('.vis-facet-title')];
        expect(titles.map(t => [t.style.getPropertyValue('--gen-vis-margin-left'), t.style.getPropertyValue('--gen-vis-margin-right')]))
            .toEqual([['40px', '10px'], ['40px', '10px']]);
        // no margin of their own, so a style of the page replaces it
        expect(titles.every(t => t.style.marginLeft === '' && !t.classList.contains('vis-facet-title-center'))).toBe(true);

        const polar = polarDef();
        polar.facets = { by: 'c', cols: 2 };
        const circles = await mount({ def: polar, data: lineData });
        expect([...circles.querySelectorAll('.vis-facet-title')].map(t => t.classList.contains('vis-facet-title-center'))).toEqual([true, true]);
        expect(errors).toEqual([]);
    });
});

// parquet of columns, the strings are bytes of node, the TextEncoder of jsdom
// has arrays of its own, which the writer does not take
const parquetOf = columns => parquetWriteBuffer({ columnData: columns.map(c => c.type == 'STRING'
    ? { ...c, data: c.data.map(v => new Uint8Array(Buffer.from(v))) } : c) });

describe('parquet: the columns read', () => {
    test('a filter on a column which is no dim reads the column, of the chart and of a mark', async () => {
        const data = parquetOf([
            { name: 'year', data: [2020, 2021, 2020, 2021], type: 'INT32' },
            { name: 'value', data: [1, 2, 3, 4], type: 'INT32' },
            { name: 'region', data: ['W', 'W', 'T', 'T'], type: 'STRING' },
            { name: 'kind', data: ['a', 'b', 'a', 'b'], type: 'STRING' },
        ]);
        const def = { dims: { x: { column: 'year', type: 'categorical' }, y: 'value' }, filter: "@region == 'W'",
            marks: [{ type: 'bar' }, { type: 'label', filter: "@kind == 'b'", text: '@y' }] };
        const el = await mount({ def, data });
        expect(el.querySelectorAll('g.vis-mark.mark-0 rect')).toHaveLength(2);
        expect([...el.querySelectorAll('g.vis-mark.mark-1 text')].map(t => t.textContent)).toEqual(['2']);
        expect(errors).toEqual([]);
    });
});

describe('the categories of every format of the data', () => {
    // the same rows as csv, JSON and parquet (the years as INT32, as of R arrow)
    const years = [2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012];
    const rows = years.map((year, i) => ({ measure: 'passengers', year, value: 200 + i }));
    const formats = {
        csv: () => `measure,year,value\n${rows.map(r => `${r.measure},${r.year},${r.value}`).join('\n')}`,
        json: () => JSON.stringify(rows),
        parquet: () => parquetOf([
            { name: 'measure', data: rows.map(r => r.measure), type: 'STRING' },
            { name: 'year', data: rows.map(r => r.year), type: 'INT32' },
            { name: 'value', data: rows.map(r => r.value), type: 'DOUBLE' },
        ]),
    };
    // the fixed values of the definition as strings or as numbers: the order
    // of the domain, the ticks (2016 is no category), the annotations, the
    // rows of a mark and a position of a reference
    const barsDef = fixed => ({
        width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 },
        dims: {
            x: { column: 'year', type: 'categorical', domain: fixed([...years].reverse()), scale: { padding: 0.2 }, axis: { values: fixed([2004, 2008, 2012, 2016]) } },
            y: { column: 'value', zero: true },
        },
        marks: [
            { id: 'bars', type: 'bar' },
            // at the start of the band
            { id: 'label', type: 'text', data: [{ x: fixed([2010])[0], label: 'mark' }], x: '@x:scaled', y: '=literal(0)', text: '@label' },
            { id: 'rule', type: 'svg:line', data: [{}], x1: `@x:scaled:${2008}`, x2: `@x:scaled:${2008}`, y1: 0, y2: 10 },
        ],
        annotations: [{ type: 'band', x: fixed([2006, 2008]) }, { type: 'line', x: fixed([2010])[0] }],
    });
    const drawn = el => ({
        ticks: [...el.querySelectorAll('.vis-axis-bottom .tick')].map(t => [t.textContent, t.getAttribute('transform')]),
        bars: [...el.querySelectorAll('g.vis-mark.bars rect')].map(r => r.getAttribute('x')),
        label: el.querySelector('g.vis-mark.label text').getAttribute('x'),
        rule: el.querySelector('g.vis-mark.rule line').getAttribute('x1'),
        band: ['x', 'width'].map(a => el.querySelector('.vis-annotation.vis-band').getAttribute(a)),
        line: el.querySelector('.vis-annotation.vis-line').getAttribute('x1'),
    });

    test('the same chart of csv, JSON and parquet, the fixed values as strings or as numbers', async () => {
        const results = {};
        const hovers = {};
        for (const [format, data] of Object.entries(formats))
            for (const [kind, fixed] of Object.entries({ strings: v => v.map(String), numbers: v => v })) {
                const el = await mount({ def: barsDef(fixed), data: data(), onHover: e => hovers[format] = e });
                results[`${format} ${kind}`] = drawn(el);
                const { pointer } = await import('./dom.js');
                el.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 100 }));
                await nextTick();
            }
        const csv = results['csv strings'];
        Object.entries(results).forEach(([k, r]) => expect([k, r]).toEqual([k, csv]));
        // the ticks of the categories in the order of the fixed domain, the years from the right
        expect(csv.ticks.map(([text]) => text)).toEqual(['2004', '2008', '2012']);
        const at = csv.ticks.map(([, t]) => parseFloat(t.slice(10)));
        expect(at[0]).toBeGreaterThan(at[1]);
        expect(at[1]).toBeGreaterThan(at[2]);
        expect(new Set(csv.bars).size).toBe(9);
        // the categories of the events are strings of every format
        expect(Object.values(hovers).map(e => [e.key, e.rows[0].x])).toEqual(Array(3).fill(['2004', '2004']));
        expect(errors).toEqual([]);
    });

    test('ranges and the most of categories by their numbers, the values of controls as strings', async () => {
        const { filter, rowFilter } = await import('@/utils/data');
        const { compareCategories } = await import('@/utils/values');
        const dims = { m: { column: 'month', type: 'categorical' } };
        const months = ['8', '9', '10', '11'].map(m => ({ m }));
        expect(filter(months, rowFilter({ m: { range: [9, 10] } }, dims)).map(r => r.m)).toEqual(['9', '10']);
        expect(['10', '9', 'b', 'a'].sort(compareCategories)).toEqual(['9', '10', 'a', 'b']);

        // labels at the last month, "10" after "9"
        const def = lineDef();
        def.dims.x = { column: 'year', type: 'categorical', scale: { type: 'point' } };
        def.marks = { id: 'last', type: 'text', by: 'c', select: { max: 'x' }, y: '=literal(0)', text: '@x' };
        const el = await mount({ def, data: 'year,value,land\n9,1,Wien\n10,2,Wien' });
        expect(el.querySelector('g.vis-mark.last text').textContent).toBe('10');

        // a slider of the years of parquet data, its values are the strings of csv
        const years = lineDef();
        years.controls = [{ id: 'year', name: 'Jahr', global: 'year', type: 'select', values: { column: 'year' } }];
        let state;
        const parquet = parquetOf([
            { name: 'year', data: [2020, 2021], type: 'INT32' },
            { name: 'value', data: [1, 2], type: 'DOUBLE' },
            { name: 'land', data: ['Wien', 'Wien'], type: 'STRING' },
        ]);
        const chart = await mount({ def: years, data: parquet, 'onUpdate:state': s => state = s });
        expect([...chart.querySelectorAll('.vis-control option')].map(o => o.value)).toEqual(['2020', '2021']);
        const select = chart.querySelector('.vis-control select');
        select.value = '2020';
        select.dispatchEvent(new Event('change'));
        await nextTick();
        expect(state.globals.year).toBe('2020');
        expect(errors).toEqual([]);
    });
});

describe('the labels of an axis with a transition', () => {
    test('the ticks of the same positions have the texts of their new values, also with props of the labels', async () => {
        // jsdom has no transforms of svg, d3 interpolates the translations of the ticks by them
        Object.defineProperty(SVGElement.prototype, 'transform', { configurable: true, get() {
            const [x = 0, y = 0] = (this.getAttribute('transform')?.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
            return { baseVal: { consolidate: () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y } }) } };
        } });
        onTestFinished(() => delete SVGElement.prototype.transform);
        const def = lineDef({ transition: 40 });
        def.globals = { col: 'a' };
        def.dims.x = { column: '{col}', type: 'categorical', axis: { labels: { props: { 'font-weight': 'bold' } } } };
        delete def.dims.c;
        def.controls = [{ id: 'col', name: 'Spalte', global: 'col', type: 'radio', values: [{ id: 'a', name: 'A', value: 'a' }, { id: 'b', name: 'B', value: 'b' }] }];
        def.marks = { type: 'bar' };
        const el = await mount({ def, data: 'a,b,value\nA,C,1\nB,D,2' });
        const labels = () => [...el.querySelectorAll('.vis-axis-bottom .tick text')].map(t => [t.textContent, t.getAttribute('font-weight')]);
        expect(labels()).toEqual([['A', 'bold'], ['B', 'bold']]);
        await select(el, 'b');
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(labels()).toEqual([['C', 'bold'], ['D', 'bold']]);
        expect(errors).toEqual([]);
    });
});

describe('the scale of another dim', () => {
    test('a band between two columns on the scale of y, its domain includes them, dates of a utc scale', async () => {
        const def = lineDef();
        // on the scale of y as the ends of the area
        def.dims.lo = { column: 'other', hover: {} };
        def.dims.hi = { column: 'top' };
        def.dims.y.zero = true;
        def.dims.y.nice = true;
        delete def.dims.c;
        def.marks = { type: 'area', y: 'hi', y0: 'lo', fill: 'gray' };
        const data = 'year,value,other,top\n2020,1,0.5,2\n2021,2,1,10\n2022,3,2,4';
        const el = await mount({ def, data });
        // the axis of y reaches the largest value of hi
        const ticks = [...el.querySelectorAll('.vis-axis-left .tick text')].map(t => t.textContent);
        expect(ticks.at(-1)).toBe('10');
        // the point of 10 of hi is at the tick of 10 of y (the ticks are moved by half a pixel)
        const tick = el.querySelectorAll('.vis-axis-left .tick')[ticks.length - 1].getAttribute('transform');
        const at = +tick.match(/,([\d.]+)\)/)[1] - 0.5;
        const second = el.querySelector('g.vis-mark path').getAttribute('d').split('L')[1].split(',').map(Number);
        expect(second[1]).toBeCloseTo(at, 2);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def)).toEqual([]);

        // a second date of a utc scale is a date of UTC as well, e.g. the end of a range
        const dates = lineDef();
        dates.dims.x = { column: 'start', type: 'date', scale: { type: 'utc' } };
        dates.dims.end = { column: 'end', type: 'date' };
        dates.marks = { type: 'svg:line', x1: 'x', x2: 'end', y1: 0, y2: 0 };
        const lines = await mount({ def: dates, data: 'start,end,value,land\n2020-01-01,2020-01-01,1,Wien\n2020-06-01,2020-12-31,2,Wien' });
        const first = lines.querySelector('g.vis-mark line');
        expect(first.getAttribute('x2')).toBe(first.getAttribute('x1'));

        def.dims.lo.scale = { of: 'hi', type: 'log' };
        def.dims.hi.scale = { of: 'z' };
        expect(validateDef(def)).toEqual([
            `dims.lo.scale.of: expected a dim with a scale of its own, e.g. "y"`,
            `dims.lo.scale.type: not used, the scale is the one of 'hi'`,
            `dims.hi.scale.of: expected a dim with a scale of its own, e.g. "y"`,
        ]);
        expect(errors).toEqual([]);
    });
});

describe('the tick marks of axes', () => {
    test('their props, their size and none, of cartesian and angular axes', async () => {
        const def = lineDef();
        def.dims.x.axis = { tickMarks: { size: 4, props: { 'stroke-opacity': 0.4 } } };
        def.dims.y.axis = { tickMarks: false };
        const el = await mount({ def, data: lineData });
        const bottom = [...el.querySelectorAll('.vis-axis-bottom .tick line')];
        expect(bottom.length).toBeGreaterThan(0);
        expect(bottom.every(l => l.getAttribute('y2') == '4' && l.getAttribute('stroke-opacity') == '0.4')).toBe(true);
        // the labels 3 pixels (the padding) after the marks of 4 pixels, of which the inset of 4 is inside
        expect(el.querySelector('.vis-axis-bottom .tick text').getAttribute('y')).toBe('3');
        // without marks the labels are at their places, 9 pixels of the marks without the inset of 5 and the padding
        expect(el.querySelectorAll('.vis-axis-left .tick line')).toHaveLength(0);
        expect(el.querySelector('.vis-axis-left .tick text').getAttribute('x')).toBe('-7');

        // the marks of an angular axis outside of the circle of 150 pixels, a css variable is a style
        const polar = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        polar.dims.x = { column: 'year', type: 'numeric', domain: [2020, 2024], axis: {
            values: [2020, 2022], tickMarks: { size: 10, props: { stroke: 'var(--gen-vis-grid-color)', 'stroke-width': 0.75 } } } };
        polar.dims.y = { column: 'value', type: 'numeric', domain: [0, 4] };
        polar.marks = { type: 'line', by: 'c' };
        const circle = await mount({ def: polar, data: lineData });
        const marks = [...circle.querySelectorAll('.vis-axis-angular .tick line')];
        expect(marks.map(l => [+l.getAttribute('y1'), +l.getAttribute('y2')])).toEqual([[-150, -160], [150, 160]].map(([a, b], i) => i == 0 ? [a, b] : [expect.closeTo(a, 6), expect.closeTo(b, 6)]));
        expect(marks.every(l => !l.hasAttribute('stroke') && l.style.getPropertyValue('stroke') == 'var(--gen-vis-grid-color)' && l.getAttribute('stroke-width') == '0.75')).toBe(true);
        polar.dims.x.axis.tickMarks = false;
        const without = await mount({ def: polar, data: lineData });
        expect(without.querySelectorAll('.vis-axis-angular .tick line')).toHaveLength(0);
        expect(without.querySelectorAll('.vis-axis-angular .tick text')).toHaveLength(2);

        const { validateDef } = await import('@/utils/validate');
        polar.dims.x.axis.tickMarks = { size: -1, inset: 'x', props: { stroke: '@colour' } };
        polar.dims.y.axis = { tickMarks: { size: 4 } };
        expect(validateDef(polar)).toEqual([
            'dims.x.axis.tickMarks.size: expected the length of the tick marks in pixels, e.g. 4',
            'dims.x.axis.tickMarks.inset: expected the part of the tick marks inside the plot area in pixels, e.g. 0',
            "dims.x.axis.tickMarks.props.stroke: unknown reference 'colour', expected one of 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'radius', 'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height'",
            'dims.y.axis.tickMarks: a radial axis has no tick marks, the circles of the grid mark its values',
        ]);
        expect(errors).toEqual([]);
    });
});

describe('the defaults of the parts', () => {
    // the tick marks and the positions of the labels of an axis
    const marks = (el, position, x) => [...el.querySelectorAll(`.vis-axis-${position} .tick line`)].map(l => l.getAttribute(`${x}2`));
    const label = (el, position, x) => el.querySelector(`.vis-axis-${position} .tick text`).getAttribute(x);
    const polarDef = () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        def.dims.x = { column: 'year', type: 'numeric', domain: [2020, 2024], axis: { values: [2020, 2022] } };
        def.dims.y = { column: 'value', type: 'numeric', domain: [0, 4], axis: { angle: 0, values: [2], title: { name: 'Wert' } } };
        def.marks = { type: 'line', by: 'c' };
        return def;
    };
    // the first mark and label of the angular axis (at the top), the label
    // of the radial one and its title
    const polarAxes = el => {
        const line = el.querySelector('.vis-axis-angular .tick line');
        return {
            mark: [+line.getAttribute('y1'), +line.getAttribute('y2')],
            label: +el.querySelector('.vis-axis-angular .tick text').getAttribute('y'),
            radial: Math.round(el.querySelector('.vis-axis-radial .tick text').getAttribute('x') * 1000) / 1000,
            title: +el.querySelector('.vis-axis-title').getAttribute('y'),
        };
    };

    test('the built-in ones without defaults', async () => {
        const { builtInDefaults } = await import('@/utils/defaults');
        expect(builtInDefaults).toEqual({
            axis: { padding: 3, tickMarks: { size: 9, inset: null }, title: { offset: null } },
            margins: {},
            angularAxis: { tickMarks: { size: 6, inset: 0 } },
            radialAxis: { title: { offset: 16 } },
            legend: { symbol: { size: 16 } },
        });
        const el = await mount({ def: lineDef(), data: lineData });
        expect(new Set(marks(el, 'bottom', 'y'))).toEqual(new Set(['9']));
        // the part inside the plot area of the styles
        expect(el.querySelector('.vis-axis-bottom').hasAttribute('style')).toBe(false);
        // the padding after the part of the marks outside, 9 - 4 (or 5 of the left one) of the inset
        expect(label(el, 'bottom', 'y')).toBe('8');
        expect(label(el, 'left', 'x')).toBe('-7');
        expect(polarAxes(await mount({ def: polarDef(), data: lineData }))).toEqual({ mark: [-150, -156], label: -159, radial: -3, title: -166 });
    });

    test('the inset of the styles of the page (--gen-vis-tick-inset) of the chart or an element above it, the definition wins', async () => {
        const styled = async def => {
            const wrapper = document.body.appendChild(document.createElement('div'));
            wrapper.style.setProperty('--gen-vis-tick-inset', '0px');
            const { createGenVis } = await import('@/index.js');
            const el = wrapper.appendChild(document.createElement('div'));
            createGenVis(el, { def, data: lineData });
            await rendered(el);
            await nextTick();
            return el;
        };
        // the labels after the marks of 9 pixels, all outside, and the padding of 3
        const el = await styled(lineDef());
        expect([label(el, 'bottom', 'y'), label(el, 'left', 'x')]).toEqual(['12', '-12']);
        const def = lineDef();
        def.dims.x.axis = { tickMarks: { inset: 2 } };
        const own = await styled(def);
        expect([label(own, 'bottom', 'y'), label(own, 'left', 'x')]).toEqual(['10', '-12']);
    });

    test('of all axes, cartesian and polar, the values of the definition win', async () => {
        const defaults = { axis: { padding: 1, tickMarks: { size: 4 }, title: { offset: 20 } } };
        const def = lineDef();
        def.dims.x.axis = {};
        def.dims.y.axis = { padding: 6, title: { name: 'Wert' } };
        const el = await mount({ def, data: lineData, defaults });
        expect(new Set(marks(el, 'bottom', 'y'))).toEqual(new Set(['4']));
        // the marks of 4 pixels all inside (the inset of 4), the padding of 1
        expect(label(el, 'bottom', 'y')).toBe('1');
        expect(new Set(marks(el, 'left', 'x'))).toEqual(new Set(['-4']));
        // the padding of the definition
        expect(label(el, 'left', 'x')).toBe('-6');
        expect(el.querySelector('.vis-axis-title').getAttribute('transform')).toMatch(/translate\(-\d+(\.\d+)? -20\)/);
        // the tick marks outside of the plot area, e.g. of ggplot2
        const outside = await mount({ def, data: lineData, defaults: { axis: { ...defaults.axis, tickMarks: { size: 4, inset: 0 } } } });
        expect(outside.querySelector('.vis-axis-bottom').style.getPropertyValue('--gen-vis-tick-inset')).toBe('0px');
        expect(outside.querySelector('.vis-axis-bottom .tick line').getAttribute('y2')).toBe('4');
        def.dims.x.axis.tickMarks = { inset: 2 };
        const inset = await mount({ def, data: lineData, defaults: { axis: { ...defaults.axis, tickMarks: { size: 4, inset: 0 } } } });
        expect(inset.querySelector('.vis-axis-bottom').style.getPropertyValue('--gen-vis-tick-inset')).toBe('2px');
        expect(inset.querySelector('.vis-axis-left').style.getPropertyValue('--gen-vis-tick-inset')).toBe('0px');
        // the labels after the part outside: 4 - 2 + the padding of 1, of the left axis 4 - 0 + 6
        expect([label(inset, 'bottom', 'y'), label(inset, 'left', 'x')]).toEqual(['3', '-10']);
        // the size of the definition, the labels without marks at their places of the default
        def.dims.x.axis.tickMarks = { size: 2 };
        def.dims.y.axis.tickMarks = false;
        const own = await mount({ def, data: lineData, defaults });
        expect(new Set(marks(own, 'bottom', 'y'))).toEqual(new Set(['2']));
        expect(label(own, 'bottom', 'y')).toBe('1');
        expect(label(own, 'left', 'x')).toBe('-6');

        // the angular axis and the radial one, the title of the radial one at its offset
        expect(polarAxes(await mount({ def: polarDef(), data: lineData, defaults }))).toEqual({ mark: [-150, -154], label: -155, radial: -1, title: -170 });
        // the defaults of polar axes before the ones of all axes, the part inside the circle
        const polar = await mount({ def: polarDef(), data: lineData, defaults: { ...defaults, angularAxis: { tickMarks: { size: 8, inset: 2 } }, radialAxis: { padding: 5 } } });
        expect(polarAxes(polar)).toEqual({ mark: [-148, -156], label: -159, radial: -5, title: -170 });
        // of a position of cartesian axes
        const left = await mount({ def: lineDef(), data: lineData, defaults: { ...defaults, leftAxis: { padding: 7 } } });
        expect([label(left, 'bottom', 'y'), label(left, 'left', 'x')]).toEqual(['1', '-7']);
        const ownPolar = polarDef();
        ownPolar.dims.x.axis = { ...ownPolar.dims.x.axis, padding: 0, tickMarks: { size: 10 } };
        ownPolar.dims.y.axis = { ...ownPolar.dims.y.axis, padding: 2, title: { name: 'Wert', offset: 30 } };
        expect(polarAxes(await mount({ def: ownPolar, data: lineData, defaults }))).toEqual({ mark: [-150, -160], label: -160, radial: -2, title: -180 });
        expect(errors).toEqual([]);
    });

    test('of the type of the scale (`bandAxis`, ...) between all axes and a position, `tickMarks: false` of the defaults', async () => {
        const bars = (axis = {}) => ({
            width: 400, height: 260, margins: { top: 10, right: 10, bottom: 40, left: 60 },
            dims: { x: { column: 'value', zero: true, axis: {} }, y: { column: 'name', type: 'categorical', axis } },
            marks: { type: 'bar' },
        });
        const data = 'name,value\nA,1\nB,2';
        // no marks of the categories of the bars (left), the ones of the values (bottom) stay
        const el = await mount({ def: bars(), data, defaults: { bandAxis: { tickMarks: false, padding: 2 } } });
        expect(el.querySelector('.vis-axis-left').getAttribute('data-dim')).toBe('y');
        expect(el.querySelectorAll('.vis-axis-left .tick line')).toHaveLength(0);
        expect(el.querySelectorAll('.vis-axis-bottom .tick line').length).toBeGreaterThan(0);
        // the labels at their places of the marks: 9 - 5 of the inset and the padding of the band axes
        expect(label(el, 'left', 'x')).toBe('-6');
        expect(label(el, 'bottom', 'y')).toBe('8');
        // the definition shows them again, also an object of a position of the defaults
        expect(marks(await mount({ def: bars({ tickMarks: { size: 4 } }), data, defaults: { bandAxis: { tickMarks: false } } }), 'left', 'x')[0]).toBe('-4');
        expect(marks(await mount({ def: bars(), data, defaults: { bandAxis: { tickMarks: false }, leftAxis: { tickMarks: { size: 3 } } } }), 'left', 'x')[0]).toBe('-3');
        // a position before the type, also of the page: the prop of the chart wins
        expect(label(await mount({ def: bars(), data, defaults: { bandAxis: { padding: 2 }, leftAxis: { padding: 5 } } }), 'left', 'x')).toBe('-9');
        // of all axes, false of the defaults
        const none = await mount({ def: lineDef(), data: lineData, defaults: { axis: { tickMarks: false } } });
        expect(none.querySelectorAll('.tick line')).toHaveLength(0);
        expect(label(none, 'bottom', 'y')).toBe('8');
        // a point scale of a categorical axis of lines, not a band one
        const points = lineDef();
        points.dims.x = { column: 'year', type: 'categorical' };
        const p = await mount({ def: points, data: lineData, defaults: { bandAxis: { tickMarks: false }, pointAxis: { tickMarks: { size: 2 } }, linearAxis: { padding: 0 } } });
        expect(new Set(marks(p, 'bottom', 'y'))).toEqual(new Set(['2']));
        expect(label(p, 'left', 'x')).toBe('-4');
        expect(errors).toEqual([]);
    });

    test('of the page (registerDefaults), the prop takes precedence, of a data attribute and of an update', async () => {
        const { registerDefaults, mountGenVisElement } = await import('@/index.js');
        onTestFinished(() => registerDefaults(null));
        registerDefaults({ axis: { padding: 0, tickMarks: { size: 5 } } });
        const page = await mount({ def: lineDef(), data: lineData });
        expect(new Set(marks(page, 'bottom', 'y'))).toEqual(new Set(['5']));
        expect(label(page, 'bottom', 'y')).toBe('1');
        const prop = await mount({ def: lineDef(), data: lineData, defaults: { axis: { tickMarks: { size: 2 } } } });
        expect(label(prop, 'bottom', 'y')).toBe('0');
        registerDefaults(null);

        const el = document.body.appendChild(document.createElement('div'));
        el.dataset.def = JSON.stringify(lineDef());
        el.dataset.data = lineData;
        el.dataset.defaults = '{"axis": {"padding": 1, "tickMarks": {"size": 4}}}';
        const vis = mountGenVisElement(el);
        await rendered(vis.el);
        await nextTick();
        expect(label(el, 'bottom', 'y')).toBe('1');

        // other defaults draw the chart anew
        vis.update({ defaults: { axis: { tickMarks: { size: 6 } } } });
        await vi.waitFor(() => expect(label(el, 'bottom', 'y')).toBe('5'));
        expect(new Set(marks(el, 'bottom', 'y'))).toEqual(new Set(['6']));
        expect(errors).toEqual([]);
    });
});

describe('css variables in props', () => {
    test('a value with a css variable is a style, also of the highlight, annotations, lines of axes and legends', async () => {
        const def = lineDef();
        def.globals = { lineColor: 'var(--line-color)' };
        def.marks[1] = { ...def.marks[1], highlight: { stroke: 'black', fill: 'var(--highlight-color)' }, stroke: '@lineColor' };
        def.dims.c.categories.Wien = 'var(--wien-color)';
        def.dims.c.legend = { symbol: { size: 16, elements: [{ type: 'rect', props: { width: 12, height: 12, fill: '@color' } }] } };
        def.dims.y.axis = { domain: { props: { stroke: 'var(--gen-vis-grid-color)' } } };
        def.annotations = [{ type: 'band', x: [2021, 2022], props: { fill: 'var(--band-color)' } }];
        const el = await mount({ def, data: lineData });
        const style = (e, k) => e.style.getPropertyValue(k);
        const circle = el.querySelector('g.vis-group[data-group-c="Wien"] circle');
        // the props of a category, of a global and of the highlight, which are attributes of data
        expect([style(circle, 'fill'), circle.hasAttribute('fill'), circle.getAttribute('stroke'), style(circle, 'stroke')])
            .toEqual(['var(--wien-color)', false, null, 'var(--line-color)']);
        // the props of the highlight are the stylesheet of the chart
        expect(highlightCss(el)).toContain('[data-mark="dots"] .vis-highlight *:not(g) { stroke: black; fill: var(--highlight-color); }');
        expect(style(el.querySelector('g.vis-group[data-group-c="Tirol"] circle'), 'fill')).toBe('');
        expect(el.querySelector('g.vis-group[data-group-c="Tirol"] circle').getAttribute('fill')).toBe('blue');
        expect(style(el.querySelector('.vis-axis-left path.domain'), 'stroke')).toBe('var(--gen-vis-grid-color)');
        expect(style(el.querySelector('.vis-annotation.vis-band'), 'fill')).toBe('var(--band-color)');
        expect(style(el.querySelector('.vis-legend-entry[data-key="Wien"] rect'), 'fill')).toBe('var(--wien-color)');

        // the highlight is a class, the styles of the elements stay as they are
        const entry = el.querySelector('.vis-legend-entry[data-key="Wien"]');
        entry.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        await nextTick();
        expect(highlighted(el, 'circle')).toHaveLength(3);
        expect([circle.getAttribute('stroke'), style(circle, 'stroke'), style(circle, 'fill')]).toEqual([null, 'var(--line-color)', 'var(--wien-color)']);
        entry.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        await nextTick();
        expect(highlighted(el, 'circle')).toHaveLength(0);
        expect([circle.getAttribute('stroke'), style(circle, 'stroke'), style(circle, 'fill')]).toEqual([null, 'var(--line-color)', 'var(--wien-color)']);
        expect(errors).toEqual([]);
    });
});

describe('radar charts', () => {
    test('the first category of a point scale of angles at the top, the hover title of the names of the nearest row', async () => {
        const def = lineDef({ coord: 'polar', width: 400, height: 400, margins: { top: 50, right: 50, bottom: 50, left: 50 },
            hover: { title: '<b>{title}</b> <i>{info}</i>', row: '{c}: {y}' } });
        def.dims.x = { column: 'year', type: 'categorical', scale: { type: 'point', padding: 0 } };
        def.dims.y = { column: 'value', type: 'numeric', domain: [0, 4], hover: {} };
        def.dims.info = { column: 'other', type: 'categorical', fromData: true, hover: {} };
        def.marks = { type: 'line', by: 'c', curve: 'linearClosed' };
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def)).toEqual([]);
        const el = await mount({ def, data: lineData });
        // four years, 2020 at the top, 2021 at the right (a quarter of the circle)
        const angles = [...el.querySelectorAll('.vis-axis-angular .tick text')].map(t => Math.atan2(+t.getAttribute('x'), -t.getAttribute('y')));
        expect(angles[0]).toBeCloseTo(0);
        expect(angles[1]).toBeCloseTo(Math.PI/2);
        // the hover of the right, of 2021, the title has the category of info of the nearest row
        el.querySelector('rect.vis-events').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true, clientX: 100, clientY: -2 }));
        await nextTick();
        expect(el.querySelector('.vis-hover-title').innerHTML).toBe('<b>2021</b> <i>20</i>');
        expect(errors).toEqual([]);
    });
});

describe('rows which are not stacked', () => {
    // the generation of two sources by hour, stacked, and the consumption as a line on them
    const data = `hour,type,value,share
0,hydro,1,0.25
0,wind,3,0.75
0,load,4,1
1,hydro,2,0.4
1,wind,3,0.6
1,load,8,1.6`;
    const loadDef = (order = ['hydro', 'wind', 'load']) => ({
        width: 600, height: 300, margins: { top: 10, right: 10, bottom: 40, left: 40 },
        globals: { values: 'value' },
        controls: [{ id: 'values', name: 'Werte', global: 'values', type: 'radio', values: [
            { id: 'abs', name: 'absolut', value: 'value' },
            { id: 'share', name: 'Anteil', value: 'share' }
        ] }],
        dims: {
            x: { column: 'hour', type: 'numeric' },
            y: { column: '{values}', type: 'numeric', zero: true, pad: 0, ticks: 4, hover: { format: '.1f' } },
            type: { column: 'type', legend: {}, hover: {},
                categories: Object.fromEntries(order.map(k => [k, { name: { hydro: 'Wasser', wind: 'Wind', load: 'Verbrauch' }[k] }])) },
        },
        marks: [
            { id: 'areas', type: 'area', by: 'type', filter: "@type != 'load'", stack: "@type != 'load'", fill: 'gray' },
            { id: 'load', type: 'line', by: 'type', filter: { type: 'load' }, stroke: 'black' },
            { id: 'labels', type: 'text', filter: { type: 'load' }, y: '@y:end:scaled', 'data-start': '@y:start', 'data-mid': '@y:mid:scaled', text: '@y' },
        ],
    });
    const points = path => path.slice(1).split('L').map(p => p.split(',').map(Number));

    test('a line of the consumption on the stacked generation, its domain, its own values and its place in the hover', async () => {
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(loadDef())).toEqual([]);
        const el = await mount({ def: loadDef(), data });
        // the domain reaches 8 of the consumption (the stacks reach 5), 0 at 250, 8 at 0 pixels
        const line = points(el.querySelector('g.vis-mark.load path').getAttribute('d'));
        expect(line.map(([, y]) => y)).toEqual([125, 0]);
        // the top of the stack of 4 at 0 is where the consumption of 4 is
        const wind = el.querySelector('g.vis-mark.areas path[data-group-type="wind"]').getAttribute('d');
        expect(points(wind.split('Z')[0])[0][1]).toBe(125);
        // the start and the end of a row which is not stacked are its value
        const labels = [...el.querySelectorAll('g.vis-mark.labels text')];
        expect(labels.map(t => [t.textContent, t.getAttribute('y'), t.getAttribute('data-start'), t.getAttribute('data-mid')]))
            .toEqual([['4', '125', '4', '125'], ['8', '0', '8', '0']]);
        // the hover, the consumption above the sources, the category after them
        const events = el.querySelector('rect.vis-events');
        const { pointer } = await import('./dom.js');
        events.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 100 }));
        await nextTick();
        const rows = () => [...el.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent);
        expect(rows()).toEqual(['Verbrauch4,0', 'Wind3,0', 'Wasser1,0']);

        // the share of the consumption of the column of the global, its own value
        el.querySelector('.vis-control input[value="share"]').click();
        await nextTick();
        expect(points(el.querySelector('g.vis-mark.load path').getAttribute('d')).map(([, y]) => y)).toEqual([250 - 250/1.6, 0]);

        // the consumption before the sources is below them in the hover
        const below = await mount({ def: loadDef(['load', 'hydro', 'wind']), data });
        below.querySelector('rect.vis-events').dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 100 }));
        await nextTick();
        expect([...below.querySelectorAll('.vis-hover tr')].map(tr => tr.textContent)).toEqual(['Wind3,0', 'Wasser1,0', 'Verbrauch4,0']);

        const wrong = loadDef();
        wrong.dims.y.stacked = { kind: 'load' };
        wrong.dims.x.stacked = 'yes';
        expect(validateDef(wrong)).toEqual([
            `dims.x.stacked: expected true or the conditions of the rows which are stacked, e.g. { "type": { "not": "load" } }`,
        ]);
        expect(errors).toEqual([]);
    });
});
