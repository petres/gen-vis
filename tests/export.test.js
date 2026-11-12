// @vitest-environment jsdom
// the SVG of the static export (exportSvg, utils/export-svg.js) in jsdom: its
// structure, the parts and the rules of Word (no foreignObject, no classes,
// no styles, no css variables, texts as text, no baselines of CSS); jsdom
// has no layout, the positions are the ones of tests/dom.js, the drawing
// itself is checked by the CLI in a browser, see cli.test.js
import { describe, test, expect, vi, beforeAll } from 'vitest';
import { createGenVis } from '@/index.js';
import { composeSvg } from '@/utils/export-svg.js';
import { selection, csvCell } from '@/utils/export.js';
import { errors, useDom, rendered } from './dom.js';

useDom();

// the legend of names only: the lines of the SVG are the tick marks
const def = () => ({
    width: 600, height: 300, title: 'Titel', subtitle: 'Untertitel', source: 'Quelle',
    globals: { unit: 'a' },
    controls: [{ id: 'unit', name: 'Einheit', global: 'unit', type: 'radio', values: [
        { id: 'a', name: 'Absolut', value: 'a' },
        { id: 'b', name: 'Anteil', value: 'b' },
    ] }],
    dims: {
        x: { column: 'year', type: 'numeric', axis: { title: { name: 'Jahr', offset: 30 } } },
        y: 'value',
        c: { column: 'land', legend: { symbol: null }, categories: { Wien: 'rgba(255, 0, 0, 0.5)', Tirol: 'blue' } },
    },
    marks: [
        { type: 'line', by: 'c' },
        { type: 'text', by: 'c', text: '@c', 'dominant-baseline': 'middle', class: 'own', style: 'font-weight: bold' },
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

describe('the selection line of the images', () => {
    test('the entries chosen, of a control without a name only the entry', () => {
        const def = { globals: { u: 'b', y: '2024' }, controls: [
            { global: 'u', type: 'radio', name: 'Unit', values: [{ id: 'a', name: 'TWh', value: 'a' }, { id: 'b', name: 'PJ', value: 'b' }] },
            { global: 'y', type: 'select', values: [{ id: '2024', name: '2024', value: '2024' }] },
        ] };
        expect(selection(def)).toBe('Unit: PJ · 2024');
    });

    test('without the controls whose global the title or the subtitle names, unless "inImage": true', () => {
        const controls = () => [
            { global: 'u', type: 'radio', name: 'Unit', values: [{ id: 'b', name: 'PJ', value: 'b' }] },
            { global: 'y', type: 'select', name: 'Jahr', values: [{ id: '2024', name: '2024', value: '2024' }] },
        ];
        const def = (title, subtitle, own = {}) => ({ globals: { u: 'b', y: '2024' }, title, subtitle, controls: controls().map(e => ({ ...e, ...own[e.global] })) });
        expect(selection(def('Bevölkerung {y}'))).toBe('Unit: PJ');
        expect(selection(def('Bevölkerung', 'in {u:name}, {y}'))).toBe('');
        expect(selection(def({ de: 'Bevölkerung {y}', en: 'Population' }))).toBe('Unit: PJ');
        // an expression of the authored definition, the prepared one has its text
        expect(selection(def('Bevölkerung 2024'), { title: "=cat('Bevölkerung ', @y)" })).toBe('Unit: PJ');
        expect(selection(def('Bevölkerung 2024'), { title: { cat: ['Bevölkerung ', '@y'] } })).toBe('Unit: PJ');
        expect(selection(def('Bevölkerung {y}', null, { y: { inImage: true } }))).toBe('Unit: PJ · Jahr: 2024');
        expect(selection(def('Bevölkerung'))).toBe('Unit: PJ · Jahr: 2024');
    });
});

describe('the width of an export', () => {
    // the end of the line of the horizontal axis, the width of the plot area
    const plotWidth = svg => Math.max(...[...parse(svg).querySelectorAll('path')].map(p => p.getAttribute('d') ?? '')
        .map(d => /^M[-\d.]+,[-\d.]+H([-\d.]+)/.exec(d)?.[1]).filter(Boolean).map(Number));

    test('imageWidth wins over the width of the definition, without one the chart has its own width', async () => {
        const own = plotWidth(await (await chart()).exportSvg());
        const wide = plotWidth(await (await chart({ imageWidth: 1000 })).exportSvg());
        // about 400 pixels wider (the measured margins of other ticks differ a bit)
        expect(wide - own).toBeGreaterThan(380);
        expect(wide - own).toBeLessThan(420);
        expect(errors).toEqual([]);
    });

    // review of 5.0: "The PNG could not be made" of a hidden chart, a TypeError of one showing an error
    test('screen: of a hidden chart the width of the definition; a chart showing an error is refused', async () => {
        const own = plotWidth(await (await chart()).exportSvg());
        const hidden = await chart({ imageWidth: 'screen' });
        const measure = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
            return this.classList.contains('vis') ? { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 } : measure.call(this);
        };
        try {
            expect(plotWidth(await hidden.exportSvg())).toBe(own);
        } finally {
            Element.prototype.getBoundingClientRect = measure;
        }
        const failing = await chart({ imageWidth: 'screen', def: { ...def(), marks: [{ type: 'nosuch' }] } });
        expect(failing.el.querySelector('.vis-error')).not.toBeNull();
        await expect(failing.exportSvg()).rejects.toThrow(/shows an error.*nosuch/);
        await expect(failing.image()).rejects.toThrow(/shows an error/);
        await expect(failing.exportCsv()).rejects.toThrow(/shows an error/);
        errors.length = 0;
    });
});

describe('exportSvg', () => {
    // review of 5.0: a definition made the page and its images load files of other origins
    test('no images and no files of other origins, also of the symbols and the props of a legend', async () => {
        const d = def();
        d.dims.c.legend = { props: { style: 'color: red; background: url(http://evil.example/leg.png)' }, symbol: { size: 16, elements: [
            { type: 'image', props: { href: 'data:image/png;base64,AAAA', width: 16, height: 16 } },
            { type: 'image', props: { href: 'http://evil.example/sym.png', width: 16, height: 16 } },
            { type: 'use', props: { href: 'http://evil.example/u.svg#x' } },
            { type: 'circle', props: { r: 5, style: 'fill: url(http://evil.example/st.png)', stroke: 'url(http://evil.example/s.svg#a)' } }] } };
        d.marks[0].style = 'stroke: red; background: url(http://evil.example/mark.png)';
        const vis = await chart({ def: d });
        const html = vis.el.innerHTML;
        expect(html).not.toMatch(/evil\.example/);
        expect(vis.el.querySelector('.vis-legend-entry').getAttribute('style') ?? '').toBe('');
        // the image of data: is drawn on the page, not in the file
        expect(vis.el.querySelectorAll('.vis-legend image')).not.toHaveLength(0);
        const svg = await vis.exportSvg();
        expect(svg).not.toMatch(/evil\.example|<image|<use\b/);
        expect(errors).toEqual([]);
    });

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
        // the selection and without the controls
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

    test('the clip of the plot area of a mark with `clip` is in the SVG, with its id', async () => {
        const clipped = def();
        clipped.marks[0].clip = true;
        const vis = await chart({ def: clipped });
        const root = parse(await vis.exportSvg());
        const clip = root.querySelector('clipPath[id$="-clip"]');
        expect(clip.querySelector('rect').getAttribute('width')).toBe(vis.el.querySelector('clipPath.vis-clip rect').getAttribute('width'));
        expect([...root.querySelectorAll('g[clip-path]')].map(g => g.getAttribute('clip-path'))).toContain(`url(#${clip.id})`);
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

    test('no scripts and no handlers of events in the file, e.g. of a slot of the page', () => {
        const root = document.body.appendChild(document.createElement('div'));
        root.innerHTML = '<svg><circle r="3" onclick="alert(1)"/><a href="javascript:alert(2)"><text>A</text></a>'
            + '<script>alert(3)</script><foreignObject><div>B</div></foreignObject><set attributeName="href" to="javascript:x"/></svg>';
        const svg = composeSvg(root);
        expect(svg).not.toMatch(/onclick|javascript|<script|foreignObject|<set\b|alert/);
        expect(parse(svg).querySelector('circle')).not.toBeNull();
        root.remove();
    });

    test('the ids and their references have a prefix of the content, the same of the same file', () => {
        const svgOf = color => {
            const root = document.body.appendChild(document.createElement('div'));
            root.innerHTML = `<svg><defs><linearGradient id="gen-vis-gradient-1"><stop offset="0" stop-color="${color}"/></linearGradient>`
                + '<clipPath id="clip"><rect width="5" height="5"/></clipPath><path id="p" d="M0,0L100,0"/></defs>'
                + '<rect clip-path="url(#clip)" mask=\'url("#gen-vis-gradient-1")\' width="10" height="10"/>'
                + '<text><textPath href="#p">A</textPath></text><use href="#other"/></svg>';
            const svg = composeSvg(root);
            root.remove();
            return svg;
        };
        const red = svgOf('#FF0000');
        const [, prefix] = red.match(/id="(gv[0-9a-z]+-)gen-vis-gradient-1"/);
        expect(red).toContain(`clip-path="url(#${prefix}clip)"`);
        expect(red).toContain(`mask="url(&quot;#${prefix}gen-vis-gradient-1&quot;)"`);
        expect(red).toContain(`id="${prefix}p"`);
        expect(red).toMatch(new RegExp(`<textPath href="#${prefix}p" xlink:href="#${prefix}p"`));
        // a reference of an id which the file does not have stays
        expect(red).toContain('href="#other"');
        expect(red).not.toMatch(/id="(gen-vis-gradient-1|p)"/);
        expect(svgOf('#FF0000')).toBe(red);
        expect(svgOf('#0000FF')).not.toContain(prefix);
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
        const id = out.querySelector('path').id;
        expect(id).toMatch(/^gv[0-9a-z]+-p$/);
        expect(path.getAttribute('href')).toBe(`#${id}`);
        expect(path.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(`#${id}`);
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
            .toEqual([['vis-button vis-download-svg', 'Als SVG speichern'], ['vis-button vis-download', 'Als PNG speichern']]);
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
        expect(marks(svg).filter(Boolean)).toEqual(Array(2).fill('4'));
        vis.el.remove();

        // the export page, of the protocol version 1
        await import('@/export.js');
        expect(window.genVisExport.version).toBe(1);
        const page = await window.genVisExport({ def: def(), data, defaults: { axis: { tickMarks: { size: 3 } } } });
        expect(page.version).toBe(1);
        expect(marks(page.svg).filter(Boolean)).toEqual(Array(2).fill('3'));
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
        d.$schema = 'https://unpkg.com/@preschen/gen-vis@5/schema.json';
        d.dims.c = { column: 'land', fromData: true, legend: { symbol: null } };
        return d;
    };
    const child = { parent: 'parent.json', title: 'Kind', dims: { c: { scheme: 'house' } } };
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
    const strokes = () => [...document.querySelectorAll('g.vis-mark.mark-0 path')].map(p => [p.getAttribute('data-group-c'), p.getAttribute('stroke')]);
    // the ends of the tick marks
    const marks = svg => [...parse(svg).querySelectorAll('line')].map(l => l.getAttribute('y2')).filter(Boolean);

    beforeAll(() => import('@/export.js'));

    test('resolve: the definition with its parents, merged and not normalized, of def and baseUrl or of defUrl', async () => {
        serve();
        const merged = await window.genVisExport.resolve({ def: child, baseUrl: 'http://h/defs/' });
        const options = d => ({ width: d.width, height: d.height, title: d.title, subtitle: d.subtitle, source: d.source });
        expect(options(merged)).toEqual({ ...options(parent()), title: 'Kind' });
        expect(merged.marks).toEqual(parent().marks);
        expect(merged.dims.c).toEqual({ column: 'land', fromData: true, legend: { symbol: null }, scheme: 'house' });
        // the y of the definition, not the normalized one
        expect(merged.dims.y).toBe('value');
        // the base of the page is removed again, the definition object is as it was
        expect(document.querySelector('base')).toBeNull();
        expect(child).toEqual({ parent: 'parent.json', title: 'Kind', dims: { c: { scheme: 'house' } } });
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
            seen.push(merged.marks.map(p => p.type));
            return { house: merged.marks.some(p => p.type == 'line') ? ['#112233', '#445566'] : ['#FFFFFF'] };
        };
        await window.genVisExport({ defUrl: 'http://h/defs/child.json', data, schemes });
        expect(seen).toEqual([['line', 'text']]);
        // the categories in ascending order (fromData), Tirol first
        expect(strokes()).toEqual([['Wien', '#445566'], ['Tirol', '#112233']]);
        // the files of the definition are loaded once
        expect(fetched.filter(u => u.endsWith('.json'))).toEqual(['http://h/defs/child.json', 'http://h/defs/parent.json']);

        const later = async merged => {
            await new Promise(r => setTimeout(r, 10));
            return { house: [merged.title == 'Kind' ? '#AA0000' : '#FFFFFF'] };
        };
        const defaults = async merged => ({ axis: { tickMarks: { size: merged.marks.length + 2 } } });
        const promised = await window.genVisExport({ def: child, baseUrl: 'http://h/defs/', data, schemes: later, defaults });
        expect(strokes()).toEqual([['Wien', '#AA0000'], ['Tirol', '#AA0000']]);
        expect(marks(promised.svg)).toEqual(Array(2).fill('4'));
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
        await expect(genVisExport.resolve({ def: '{"marks": ' })).rejects.toThrow('Invalid JSON in definition attribute');
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
        expect(marks(none.svg)).toEqual(Array(2).fill('9'));
        expect(errors).toEqual([]);
    });
});

describe('each call of the export page loads its files anew', () => {
    // a definition file with its data file, of the responses of `files`,
    // a response of `slow` is answered once `release` is called
    const file = { ...def(), $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', data: 'data.csv' };
    const files = {};
    const slow = new Set();
    let fetched;
    let release;
    beforeAll(() => import('@/export.js'));
    const serve = () => {
        fetched = [];
        slow.clear();
        Object.assign(files, { 'http://h/defs/def.json': JSON.stringify(file), 'http://h/defs/data.csv': data });
        vi.stubGlobal('fetch', async url => {
            fetched.push(url);
            const body = files[url];
            if (slow.has(url))
                await new Promise(resolve => release = resolve);
            return new Response(body);
        });
    };
    const tens = 'year,value,land\n2020,10,Wien\n2021,20,Wien\n2020,20,Tirol\n2021,30,Tirol';
    const options = { defUrl: 'http://h/defs/def.json' };
    // the ticks of the y axis
    const ticks = svg => texts(parse(svg)).filter(t => /^\d+([.,]\d+)?$/.test(t) && !t.startsWith('20'));

    test('fontSize sizes the legend entries, whose font size the symbols are centered by', async () => {
        serve();
        await window.genVisExport({ ...options, fontSize: '8pt' });
        const css = [...document.head.querySelectorAll('style.gen-vis-export')].map(s => s.textContent).join('\n');
        expect(css).toMatch(/\.vis-legend \.vis-legend-entries > div[,{ ][^}]*font-size: 10\.667px/);
        expect(css).not.toContain('.vis-legend-entries > div span');
    });

    test('a changed data file of the same definition is the one drawn', async () => {
        serve();
        const before = await window.genVisExport(options);
        files['http://h/defs/data.csv'] = tens;
        const after = await window.genVisExport(options);
        expect(after.svg).not.toBe(before.svg);
        expect(ticks(before.svg)).toContain('3');
        expect(ticks(before.svg)).not.toContain('30');
        expect(ticks(after.svg)).toContain('30');
        // the definition and its data are loaded again, once by each call
        expect(fetched.filter(u => u.endsWith('def.json'))).toHaveLength(2);
        expect(fetched.filter(u => u.endsWith('data.csv'))).toHaveLength(2);
        // also by resolve
        files['http://h/defs/def.json'] = JSON.stringify({ ...file, title: 'Neu' });
        expect((await window.genVisExport.resolve(options)).title).toBe('Neu');
        expect(errors).toEqual([]);
    });

    test('a request of a call that timed out is not the one of the next call', async () => {
        serve();
        slow.add('http://h/defs/data.csv');
        await expect(window.genVisExport({ ...options, timeout: 50 })).rejects.toThrow('not rendered in time');
        slow.clear();
        files['http://h/defs/data.csv'] = tens;
        const next = window.genVisExport(options);
        // the request before ends with the old data while the next call runs
        await new Promise(resolve => setTimeout(resolve, 0));
        release();
        const { svg } = await next;
        expect(ticks(svg)).toContain('30');
        expect(fetched.filter(u => u.endsWith('data.csv'))).toHaveLength(2);
        // the old data is not kept either
        files['http://h/defs/data.csv'] = data;
        expect(ticks((await window.genVisExport(options)).svg)).not.toContain('30');
    });
});

describe('legend entries without a symbol', () => {
    test('no svg before the name (null, no elements or no size), keyboard, highlight and export as with one', async () => {
        for (const symbol of [null, { size: 0, elements: [] }, { elements: [] }]) {
            const d = def();
            d.dims.c.legend = { symbol };
            const vis = createGenVis(document.body.appendChild(document.createElement('div')), { def: d, data });
            await rendered(vis.el);
            const entries = [...vis.el.querySelectorAll('.vis-legend .vis-legend-entry')];
            expect(entries.map(e => [e.querySelector('svg'), e.textContent, e.getAttribute('tabindex')])).toEqual([[null, 'Wien', '0'], [null, 'Tirol', '0']]);
            // the highlight of the entry of a hovered category, the toggle by the keyboard
            entries[0].dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
            entries[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(vis.el.querySelector('.vis-legend-entry[data-key="Tirol"]').getAttribute('aria-checked')).toBe('false');
            const svg = parse(await vis.exportSvg({ parts: ['legend'] }));
            expect(texts(svg)).toEqual(['Wien']);
        }
        expect(errors).toEqual([]);
    });
});

describe('the cells of the CSV', () => {
    test('texts a spreadsheet would read as a formula get a \' before them, numbers stay', () => {
        expect(['=1+2', '+A1', '-A1', '@SUM(A1)', '\tx', '\r=1', '=HYPERLINK("http://x")'].map(csvCell))
            .toEqual(["'=1+2", "'+A1", "'-A1", "'@SUM(A1)", "'\tx", "'\r=1", '\'=HYPERLINK("http://x")']);
        expect(['-1.5', '+3', '-.5', '-1e3', '-', '=', 'Wien', 'a=b', '', null, -2, 3].map(csvCell))
            .toEqual(['-1.5', '+3', '-.5', '-1e3', '-', '=', 'Wien', 'a=b', '', null, -2, 3]);
    });
});
