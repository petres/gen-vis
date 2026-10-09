// the helpers of the tests in jsdom, e.g. of the rendering, `useDom()`
// registers the hooks: the files of the project are served, errors and
// warnings are collected in `errors`
import { vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp, nextTick } from 'vue';
import { definitions } from '@/dev/definitions.js';
import { clearCache } from '@/store';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// all definitions in data/, see the page of the dev server
export const examples = definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' })).map(d => `/data/${d.path}`);

export let errors = [];

export const useDom = () => {
    beforeAll(() => {
        // jsdom has no layout
        Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
        globalThis.ResizeObserver = class { observe() {} disconnect() {} };
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
    if (!el.querySelector('svg.facet, .vis-error'))
        throw new Error('not rendered');
}, { timeout: 20000, interval: 10 });

export const mount = async (component, props) => {
    const el = document.body.appendChild(document.createElement('div'));
    createApp(component, props).mount(el);
    await rendered(el);
    await nextTick();
    return el;
};

export const pointer = (type, init = {}) => new PointerEvent(type, { pointerType: 'mouse', bubbles: true, ...init });

// moves the mouse over all facets, returns the most hover rows at a position
export const hover = async el => {
    let rows = 0;
    for (const events of el.querySelectorAll('rect.events')) {
        for (let x = 0; x <= 800; x += 25) {
            events.dispatchEvent(pointer('pointermove', { clientX: x, clientY: 150 }));
            await nextTick();
            rows = Math.max(rows, el.querySelectorAll('.hover tr.entry').length);
        }
        events.dispatchEvent(pointer('pointerleave'));
    }
    return rows;
};
