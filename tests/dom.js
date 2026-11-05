// the helpers of the tests in jsdom, e.g. of the rendering, `useDom()`
// registers the hooks: the files of the project are served, errors and
// warnings are collected in `errors`
import { vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGenVis } from '@/index.js';
import { definitions } from '@/dev/definitions.js';
import { clearCache } from '@/utils/load';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// all definitions in data/, see the page of the dev server
export const examples = definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' })).map(d => `/data/${d.path}`);

export let errors = [];

// the observers of the sizes of the visualisations, see resize
const resizeObservers = new Set();

// a new size of the visualisations, their ResizeObservers are called
export const resize = () => resizeObservers.forEach(o => o.callback([]));

// an html element of the content of a slot, its attributes, its listeners
// (`onClick`) and its text
export const html = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => k.startsWith('on') ? node.addEventListener(k.slice(2).toLowerCase(), v) : node.setAttribute(k, v));
    if (text !== undefined)
        node.textContent = text;
    return node;
};

export const useDom = () => {
    beforeAll(() => {
        // jsdom has no layout
        Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
        // the SVG of the images (see utils/export-svg.js) reads the rectangles of
        // the words of the texts and the styles of pseudo-elements, jsdom has
        // neither: a line of 10 pixels of every text, no content
        Range.prototype.getClientRects = () => [{ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }];
        HTMLCanvasElement.prototype.getContext = () => null;
        const computed = window.getComputedStyle;
        window.getComputedStyle = (e, pseudo) => pseudo ? Object.assign([], { content: 'none', display: 'inline' }) : computed(e);
        globalThis.ResizeObserver = class {
            constructor(callback) { this.callback = callback; }
            observe() { resizeObservers.add(this); }
            disconnect() { resizeObservers.delete(this); }
        };
    });

    beforeEach(() => {
        // the files of the project, e.g. /data/bev/def.json
        vi.stubGlobal('fetch', async url => {
            const file = root + decodeURIComponent(new URL(url).pathname);
            return existsSync(file)
                ? new Response(readFileSync(file))
                : new Response('', { status: 404, statusText: 'Not Found' });
        });
        errors = [];
        // errors in event handlers, e.g. of the hover
        window.onerror = message => {
            errors.push(message);
            return true;
        };
        vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
        vi.spyOn(console, 'warn').mockImplementation((...a) => errors.push(a.join(' ')));
    });

    afterEach(() => {
        clearCache();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });
};

export const rendered = el => vi.waitFor(() => {
    if (!el.querySelector('svg.vis-svg, .vis-error, .vis-message'))
        throw new Error('not rendered');
}, { timeout: 20000, interval: 10 });

// the changes drawn, the visualisation draws them in microtasks, e.g. the
// ones of an event, also the ones which follow, e.g. a new width
export const nextTick = async () => {
    for (let i = 0; i < 4; i++)
        await Promise.resolve();
};

// a visualisation of `props` in a new element of the page, drawn (or its
// error), returns the element and the visualisation, see createGenVis
export const mountVis = async props => {
    const el = document.body.appendChild(document.createElement('div'));
    const vis = createGenVis(el, props);
    await rendered(el);
    await nextTick();
    return { el, vis };
};

// the element of a visualisation of `props` drawn, see mountVis
export const mount = async props => (await mountVis(props)).el;

export const pointer = (type, init = {}) => new PointerEvent(type, { pointerType: 'mouse', bubbles: true, ...init });

// the rows of the hover shown, of a hover without a box (`"box": false`) 1
// if it highlights elements
const hoverRows = el => {
    const rows = el.querySelectorAll('.vis-hover tr.vis-hover-entry, .vis-hover .vis-hover-row').length;
    return rows > 0 || el.querySelector('.vis-hover') ? rows : (el.querySelector('.vis-plot .vis-highlight') ? 1 : 0);
};

// moves the mouse over all facets, returns the most hover rows at a position
export const hover = async el => {
    let rows = 0;
    for (const events of el.querySelectorAll('rect.vis-events')) {
        // other heights only if the line at 150 has no hover, e.g. the space
        // between the groups of the rows of horizontal bars or a narrow list
        let found = 0;
        for (const y of [150, 100, 200, 50, 250, 300, 350]) {
            for (let x = 0; x <= 800; x += 25) {
                events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
                await nextTick();
                found = Math.max(found, hoverRows(el));
            }
            if (found > 0)
                break;
        }
        rows = Math.max(rows, found);
        events.dispatchEvent(pointer('pointerleave'));
    }
    return rows;
};
