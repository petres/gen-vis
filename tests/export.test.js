// @vitest-environment jsdom
// the SVG of the static export (exportSvg, utils/export-svg.js) in jsdom: its
// structure, the parts and the rules of Word (no foreignObject, no classes,
// no styles, no css variables, texts as text, no baselines of CSS); jsdom
// has no layout, the positions are the ones of tests/dom.js, the drawing
// itself is checked by the CLI in a browser, see cli.test.js
import { describe, test, expect, vi, beforeAll } from 'vitest';
import { createGenVis } from '@/index.js';
import { composeSvg } from '@/utils/export-svg.js';
import { errors, useDom, rendered } from './dom.js';

useDom();

beforeAll(() => {
    // a line of 10 pixels of every text, jsdom has no canvas
    Range.prototype.getClientRects = () => [{ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }];
    HTMLCanvasElement.prototype.getContext = () => null;
    // jsdom has no styles of pseudo-elements, they have no content
    const computed = window.getComputedStyle;
    window.getComputedStyle = (e, pseudo) => pseudo ? Object.assign([], { content: 'none', display: 'inline' }) : computed(e);
});

const def = () => ({
    options: { width: 600, height: 300, title: 'Titel', subtitle: 'Untertitel', footer: 'Quelle' },
    globals: { unit: 'a' },
    formElements: [{ id: 'unit', name: 'Einheit', ref: 'unit', type: 'radio', values: [
        { id: 'a', name: 'Absolut', value: 'a' },
        { id: 'b', name: 'Anteil', value: 'b' },
    ] }],
    mapping: {
        x: { column: 'year', type: 'numeric', axis: { title: { name: 'Jahr', offset: 30 } } },
        y: 'value',
        c: { column: 'land', legend: {}, categories: { Wien: { color: 'rgba(255, 0, 0, 0.5)' }, Tirol: { color: 'blue' } } },
    },
    plot: [
        { type: 'line', by: ['c'] },
        { type: 'text', by: ['c'], props: { text: '@c', x: '@x:scaled', y: '@y:scaled', 'dominant-baseline': 'middle', class: 'own', style: 'font-weight: bold' } },
    ],
});
const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,2,Tirol\n2021,3,Tirol';

const chart = async (props = {}) => {
    const vis = createGenVis(document.body.appendChild(document.createElement('div')), { def: def(), data, ...props });
    await rendered(vis.el);
    return vis;
};

const parse = svg => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
const texts = root => [...root.querySelectorAll('text')].map(t => t.textContent);

describe('exportSvg', () => {
    test('an SVG of its own, without HTML, classes, styles and css variables', async () => {
        const vis = await chart();
        const svg = await vis.exportSvg();
        const root = parse(svg);
        expect(root.tagName).toBe('svg');
        expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
        // the size of the copy (600 and the space around it) in pixels
        expect(root.getAttribute('viewBox')).toBe('0 0 800 400');
        expect(root.getAttribute('width')).toBe('800');
        expect(svg).not.toMatch(/foreignObject|<div|<span|<style|var\(|<image|<use\b/);
        const all = [root, ...root.querySelectorAll('*')];
        expect(all.filter(e => ['class', 'style', 'dominant-baseline', 'alignment-baseline', 'paint-order', 'role', 'tabindex']
            .some(a => e.hasAttribute(a)))).toEqual([]);
        expect(all.filter(e => [...e.attributes].some(a => a.name.startsWith('data-') || a.name.startsWith('aria-')))).toEqual([]);
        // only elements of SVG
        expect(all.filter(e => e.namespaceURI != 'http://www.w3.org/2000/svg')).toEqual([]);
        // the background of the PNG, then the texts of the HTML as text, with
        // the selection and without the form elements
        expect(root.firstElementChild.tagName).toBe('rect');
        expect(root.firstElementChild.getAttribute('fill')).toBe('#FFFFFF');
        expect(texts(root)).toEqual(expect.arrayContaining(['Titel', 'Untertitel', 'Einheit: Absolut', 'Wien', 'Tirol', 'Quelle', 'Jahr']));
        expect(texts(root).join(' ')).not.toContain('Anteil');
        // the texts of the HTML at their baselines, of the size of their fonts
        const title = [...root.querySelectorAll('text')].find(t => t.textContent == 'Titel');
        expect(title.getAttribute('xml:space')).toBe('preserve');
        expect(Number(title.getAttribute('y'))).toBeGreaterThan(0);
        // the copy is removed again, the visualisation is the one of the page
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('colors as hex colors and their opacities, no rgb', () => {
        // the computed colors of jsdom are the ones of the styles, the ones of
        // svg elements are not computed, see cli.test.js of the browser
        const root = document.body.appendChild(document.createElement('div'));
        root.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        root.appendChild(document.createElement('span')).textContent = 'Text';
        root.lastChild.style.color = 'rgb(0, 128, 255)';
        const svg = composeSvg(root);
        expect(svg).not.toMatch(/rgba?\(/);
        const out = parse(svg);
        expect(['fill', 'fill-opacity'].map(a => out.querySelector('rect').getAttribute(a))).toEqual(['#FF0000', '0.5']);
        expect(out.querySelector('text').getAttribute('fill')).toBe('#0080FF');
        expect(out.querySelector('text').hasAttribute('fill-opacity')).toBe(false);
    });

    test('the opacity of an svg once, lengths of texts in pixels, href also as xlink:href', () => {
        const root = document.body.appendChild(document.createElement('div'));
        root.innerHTML = '<svg style="opacity: 0.5"><path id="p" d="M0,0L100,0"/>'
            + '<text style="font-size: 10px" x="1.5em" dy="0.71em">A</text><text style="font-size: 10px"><textPath href="#p">B</textPath></text></svg>';
        const out = parse(composeSvg(root));
        const g = out.querySelector('g');
        expect(g.getAttribute('opacity')).toBe('0.5');
        expect(out.querySelectorAll('[opacity]')).toHaveLength(1);
        const [a] = out.querySelectorAll('text');
        expect([a.getAttribute('x'), a.getAttribute('dy')]).toEqual(['15', '7.1']);
        const path = out.querySelector('textPath');
        expect(path.getAttribute('href')).toBe('#p');
        expect(path.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#p');
        expect(out.getAttribute('xmlns:xlink')).toBe('http://www.w3.org/1999/xlink');
        root.remove();
    });

    test('the parts, cropped to them', async () => {
        const vis = await chart();
        const plot = parse(await vis.exportSvg({ parts: ['plot'] }));
        expect(texts(plot)).not.toContain('Titel');
        expect(texts(plot)).not.toContain('Quelle');
        expect(texts(plot)).toContain('Jahr');
        expect(plot.querySelectorAll('path').length).toBeGreaterThan(0);
        // the full width, the height of the chosen parts and the space above and below
        expect(plot.getAttribute('viewBox')).toBe('0 0 800 400');

        const header = parse(await vis.exportSvg({ parts: ['title', 'selection'] }));
        expect(texts(header)).toEqual(['Titel', 'Einheit: Absolut']);
        expect(header.querySelectorAll('path')).toHaveLength(0);

        await expect(vis.exportSvg({ parts: ['plots'] })).rejects.toThrow('Unknown parts of an image: plots');
        await expect(vis.exportSvg({ parts: [] })).rejects.toThrow('The parts of an image are a list');
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
    });

    test('the unit of the size and the background', async () => {
        const vis = await chart();
        const cm = parse(await vis.exportSvg({ unit: 'cm', background: null }));
        expect(cm.getAttribute('width')).toBe(`${Math.round(800 * 2.54 / 96 * 1000) / 1000}cm`);
        expect(cm.getAttribute('viewBox')).toBe('0 0 800 400');
        // no background
        expect(cm.querySelector(':scope > rect[width="800"]')).toBeNull();
        const dark = parse(await vis.exportSvg({ background: '#123456' }));
        expect(dark.firstElementChild.getAttribute('fill')).toBe('#123456');
        await expect(vis.exportSvg({ unit: 'pt' })).rejects.toThrow('Unknown unit of an SVG: pt');
    });

    test('the width asked for, of a layout in fractions of pixels', () => {
        const root = document.body.appendChild(document.createElement('div'));
        const svg = parse(composeSvg(root, { box: { left: 0, top: 0, width: 604.71875, height: 100 }, unit: 'cm', width: 16 * 96 / 2.54 }));
        expect(svg.getAttribute('width')).toBe('16cm');
        expect(svg.getAttribute('viewBox')).toBe('0 0 604.72 100');
    });

    test('not while it is loaded', async () => {
        const vis = createGenVis(document.body.appendChild(document.createElement('div')), { def: def(), data });
        await expect(vis.exportSvg()).rejects.toThrow('not loaded yet');
        await rendered(vis.el);
    });

    test('the button of the SVG saves the file', async () => {
        URL.createObjectURL = () => 'blob:svg';
        URL.revokeObjectURL = () => {};
        const saved = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.push(this.download); });
        const vis = await chart({ svg: true, download: true });
        expect([...vis.el.querySelectorAll('.vis-buttons button')].map(b => [b.className, b.title]))
            .toEqual([['vis-download-svg', 'Als SVG speichern'], ['vis-download', 'Als PNG speichern']]);
        vis.el.querySelector('.vis-download-svg').click();
        await vi.waitFor(() => expect(saved).toEqual(['Titel.svg']));
        expect(errors).toEqual([]);
    });
});

describe('the defaults of the parts in the export', () => {
    // the ends of the lines of an SVG, of the tick marks of the horizontal axis the lengths
    const marks = svg => [...parse(svg).querySelectorAll('line')].map(l => l.getAttribute('y2'));

    test('the SVG of a chart with defaults has them, also the one of the export page (genVisExport)', async () => {
        const vis = await chart({ defaults: { axis: { tickMarks: { size: 4 } } } });
        const svg = await vis.exportSvg();
        expect(marks(svg).filter(Boolean)).toEqual(Array(11).fill('4'));
        vis.el.remove();

        // the export page, of the protocol version 1
        await import('@/export.js');
        expect(window.genVisExport.version).toBe(1);
        const page = await window.genVisExport({ def: def(), data, defaults: { axis: { tickMarks: { size: 3 } } } });
        expect(page.version).toBe(1);
        expect(marks(page.svg).filter(Boolean)).toEqual(Array(11).fill('3'));
        // without defaults the built-in ones
        expect(new Set(marks((await window.genVisExport({ def: def(), data })).svg).filter(Boolean))).toEqual(new Set(['9']));
        await expect(window.genVisExport({ def: def(), data, defaultz: {} })).rejects.toThrow(/unknown options defaultz, expected some of .*defaults/);
        expect(errors).toEqual([]);
    });
});

describe('the merged definition of the export page (genVisExport.resolve, schemes and defaults of functions)', () => {
    // a definition file of a chart and one of its own with it as parent,
    // which colors the categories with the scheme house
    const parent = () => {
        const d = def();
        d.$schema = 'https://unpkg.com/@preschen/gen-vis@4/schema.json';
        d.mapping.c = { column: 'land', fromData: true, legend: {} };
        return d;
    };
    const child = { parent: 'parent.json', options: { title: 'Kind' }, mapping: { c: { scheme: 'house' } } };
    const files = { 'http://h/defs/parent.json': JSON.stringify(parent()), 'http://h/defs/child.json': JSON.stringify(child) };
    let fetched;
    const serve = () => {
        fetched = [];
        vi.stubGlobal('fetch', async url => {
            fetched.push(url);
            return url in files ? new Response(files[url]) : new Response('', { status: 404, statusText: 'Not Found' });
        });
    };
    // the colors of the lines of the chart in the page, jsdom computes no
    // styles of svg elements, the SVG has none of them
    const strokes = () => [...document.querySelectorAll('g.vis-plot.plot-0 path')].map(p => [p.getAttribute('data-group-c'), p.getAttribute('stroke')]);
    // the ends of the tick marks
    const marks = svg => [...parse(svg).querySelectorAll('line')].map(l => l.getAttribute('y2')).filter(Boolean);

    beforeAll(() => import('@/export.js'));

    test('resolve: the definition with its parents, merged and not normalized, of def and baseUrl or of defUrl', async () => {
        serve();
        const merged = await window.genVisExport.resolve({ def: child, baseUrl: 'http://h/defs/' });
        expect(merged.options).toEqual({ ...parent().options, title: 'Kind' });
        expect(merged.plot).toEqual(parent().plot);
        expect(merged.mapping.c).toEqual({ column: 'land', fromData: true, legend: {}, scheme: 'house' });
        // the y of the definition, not the internal form of normalize
        expect(merged.mapping.y).toBe('value');
        // the base of the page is removed again, the definition object is as it was
        expect(document.querySelector('base')).toBeNull();
        expect(child.options).toEqual({ title: 'Kind' });
        expect(await window.genVisExport.resolve({ defUrl: 'http://h/defs/child.json', width: '16cm' })).toEqual(merged);
        expect(await window.genVisExport.resolve({ def: JSON.stringify(child), baseUrl: 'http://h/defs/' })).toEqual(merged);
        // a chart drawn before stays
        await window.genVisExport({ def: def(), data });
        await window.genVisExport.resolve({ defUrl: 'http://h/defs/child.json' });
        expect(document.querySelectorAll('.vis')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('schemes of a function of the merged definition, its colors drawn, also of a promise; defaults of one', async () => {
        serve();
        const seen = [];
        const schemes = merged => {
            seen.push(merged.plot.map(p => p.type));
            return { house: merged.plot.some(p => p.type == 'line') ? ['#112233', '#445566'] : ['#FFFFFF'] };
        };
        await window.genVisExport({ defUrl: 'http://h/defs/child.json', data, schemes });
        expect(seen).toEqual([['line', 'text']]);
        // the categories in ascending order (fromData), Tirol first
        expect(strokes()).toEqual([['Wien', '#445566'], ['Tirol', '#112233']]);
        // the files of the definition are loaded once
        expect(fetched.filter(u => u.endsWith('.json'))).toEqual(['http://h/defs/child.json', 'http://h/defs/parent.json']);

        const later = async merged => {
            await new Promise(r => setTimeout(r, 10));
            return { house: [merged.options.title == 'Kind' ? '#AA0000' : '#FFFFFF'] };
        };
        const defaults = async merged => ({ axis: { tickMarks: { size: merged.plot.length + 2 } } });
        const promised = await window.genVisExport({ def: child, baseUrl: 'http://h/defs/', data, schemes: later, defaults });
        expect(strokes()).toEqual([['Wien', '#AA0000'], ['Tirol', '#AA0000']]);
        expect(marks(promised.svg)).toEqual(Array(11).fill('4'));
        // the object form as before
        await window.genVisExport({ def: child, baseUrl: 'http://h/defs/', data, schemes: { house: ['#00AA00'] } });
        expect(strokes()).toEqual([['Wien', '#00AA00'], ['Tirol', '#00AA00']]);
        expect(errors).toEqual([]);
    });

    test('errors: of the definition, of the options and of the functions', async () => {
        serve();
        const { genVisExport } = window;
        // the <base> of the chart before (its baseUrl) stays, the one of resolve is removed
        const bases = [...document.querySelectorAll('base')];
        await expect(genVisExport.resolve({ def: { ...child, parent: 'missing.json' }, baseUrl: 'http://h/defs/' }))
            .rejects.toThrow("Could not load 'http://h/defs/missing.json': 404 Not Found");
        await expect(genVisExport.resolve({ defUrl: 'http://h/defs/nope.json' })).rejects.toThrow("Could not load 'http://h/defs/nope.json'");
        await expect(genVisExport.resolve({ def: '{"plot": ' })).rejects.toThrow('Invalid JSON in definition attribute');
        await expect(genVisExport.resolve({})).rejects.toThrow('either def (a definition) or defUrl');
        await expect(genVisExport.resolve({ def: child, sheme: {} })).rejects.toThrow('unknown options sheme');
        expect([...document.querySelectorAll('base')]).toEqual(bases);

        const options = { defUrl: 'http://h/defs/child.json', data };
        await expect(genVisExport({ ...options, schemes: () => [['#000000']] }))
            .rejects.toThrow('the function of schemes returns an object, not [["#000000"]]');
        await expect(genVisExport({ ...options, defaults: async () => 4 })).rejects.toThrow('the function of defaults returns an object, not 4');
        await expect(genVisExport({ ...options, schemes: async () => { throw new Error('no colors'); } })).rejects.toThrow('no colors');
        await expect(genVisExport({ ...options, schemes: () => ({ house: [] }) })).rejects.toThrow("the colors of the scheme 'house'");
        await expect(genVisExport({ defUrl: 'http://h/defs/missing.json', data, schemes: () => ({}) }))
            .rejects.toThrow("Could not load 'http://h/defs/missing.json': 404 Not Found");
        // null of a function: no defaults, the built-in ones
        const none = await genVisExport({ ...options, schemes: () => ({ house: ['#123456'] }), defaults: () => null });
        expect(marks(none.svg)).toEqual(Array(11).fill('9'));
        expect(errors).toEqual([]);
    });
});
