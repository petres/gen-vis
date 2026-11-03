// @vitest-environment jsdom
// the lifecycle of a visualisation: definitions and globals changed while it is
// loaded, unmounted while it is loaded, exports while it is loaded, mounting
// by class and the buttons of the footer
import { test, expect, vi, beforeEach } from 'vitest';
import { createGenVis, mountGenVisElement, mountGenVisByClass, unmountGenVisElement } from '@/index.js';
import { errors, useDom, rendered, mount, nextTick } from './dom.js';

vi.mock('modern-screenshot', () => ({
    domToBlob: async () => new Blob(['png'], { type: 'image/png' }),
}));

useDom();

const defOf = (title, extra = {}) => ({
    $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json',
    data: 'd.csv',
    options: { width: 600, height: 300, title },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' } },
    },
    plot: [{ type: 'svg:circle', props: { r: 3, cx: '@x:scaled', cy: '@y:scaled' } }],
    ...extra,
});
// a definition with a form element of a global
const globalDef = title => defOf(title, { globals: { col: 'value' }, formElements: [{ id: 'col', name: 'C', ref: 'col', type: 'radio', values: [
    { id: 'value', name: 'V', value: 'value' }, { id: 'other', name: 'O', value: 'other' }] }] });
const csv = 'year,value\n2020,1\n2021,2';

// the files by their name, a delay per name simulates slow responses
const delays = {};
beforeEach(() => {
    for (const k in delays)
        delete delays[k];
    vi.stubGlobal('fetch', async url => {
        const name = new URL(url).pathname.slice(1);
        await new Promise(r => setTimeout(r, delays[name] ?? 0));
        if (name.startsWith('def'))
            return new Response(JSON.stringify(defOf(name)));
        if (name.startsWith('g'))
            return new Response(JSON.stringify(globalDef(name)));
        if (name.endsWith('.csv'))
            return new Response(csv);
        return new Response('', { status: 404, statusText: 'Not Found' });
    });
    URL.createObjectURL = () => 'blob:png';
    URL.revokeObjectURL = () => {};
});

const wait = ms => new Promise(r => setTimeout(r, ms));
const title = el => el.querySelector('.vis-title')?.textContent;
const checked = el => [...el.querySelectorAll('input[type=radio]')].map(i => i.checked);
const create = props => {
    const el = document.body.appendChild(document.createElement('div'));
    return { el, vis: createGenVis(el, props) };
};

test('a definition removed while one is loaded keeps the error', async () => {
    delays['defA.json'] = 100;
    const { el, vis } = create({ defFile: 'defA.json' });
    await wait(10);
    vis.update({ defFile: null });
    await wait(200);
    await nextTick();
    expect(el.querySelector('.vis-error')?.textContent).toBe('No definition given.');
    expect(title(el)).toBeUndefined();
});

test('the globals changed while the first definition is loaded are applied', async () => {
    delays['g1.json'] = 100;
    const { el, vis } = create({ defFile: 'g1.json', globals: { col: 'value' } });
    await wait(10);
    vis.update({ globals: { col: 'other' } });
    await rendered(el);
    await wait(50);
    await nextTick();
    expect(checked(el)).toEqual([false, true]);
});

test('the globals changed while a new definition is loaded are applied', async () => {
    delays['g2.json'] = 100;
    const { el, vis } = create({ defFile: 'g1.json', globals: { col: 'value' } });
    await rendered(el);
    vis.update({ defFile: 'g2.json' });
    await wait(10);
    vis.update({ globals: { col: 'other' } });
    await vi.waitFor(() => expect(title(el)).toBe('g2.json'));
    await nextTick();
    expect(checked(el)).toEqual([false, true]);
});

test('a load failing after the unmount is not reported', async () => {
    delays['missing.json'] = 50;
    const emitted = [];
    const { vis } = create({ defFile: 'missing.json', onError: e => emitted.push(e), onRendered: () => emitted.push('rendered') });
    await wait(10);
    vis.destroy();
    await wait(100);
    expect(emitted).toEqual([]);
    expect(errors).toEqual([]);
});

test('a definition loaded after the unmount is not drawn', async () => {
    delays['defA.json'] = 50;
    const emitted = [];
    const { vis } = create({ defFile: 'defA.json', onRendered: () => emitted.push('rendered') });
    await wait(10);
    vis.destroy();
    await wait(100);
    expect(emitted).toEqual([]);
    expect(errors).toEqual([]);
});

test('a copy of a mounted element (with the class vis-mounted) is mounted by class', async () => {
    const el = document.body.appendChild(document.createElement('div'));
    el.className = 'chart';
    el.dataset.defFile = 'defA.json';
    expect(mountGenVisByClass('chart')).toHaveLength(1);
    await rendered(el);
    const clone = document.body.appendChild(el.cloneNode(false));
    expect(clone.classList.contains('vis-mounted')).toBe(true);
    expect(mountGenVisByClass('chart')).toHaveLength(1);
    await rendered(clone);
    expect(title(clone)).toBe('defA.json');
    expect(mountGenVisByClass('chart')).toHaveLength(0);
    // an element unmounted is mounted again
    expect(unmountGenVisElement(clone)).toBe(true);
    expect(mountGenVisByClass('chart')).toHaveLength(1);
});

test('the exports are refused while a new definition is loaded', async () => {
    delays['defB.json'] = 100;
    const { el, vis } = create({ defFile: 'defA.json' });
    await rendered(el);
    await expect(vis.image()).resolves.toBeInstanceOf(Blob);
    vis.update({ defFile: 'defB.json' });
    await nextTick();
    await expect(vis.image()).rejects.toThrow('not loaded yet');
    await expect(vis.exportCsv()).rejects.toThrow('not loaded yet');
    await vi.waitFor(() => expect(title(el)).toBe('defB.json'));
    await expect(vis.image()).resolves.toBeInstanceOf(Blob);
});

test('the buttons of the footer do not submit a form, the label of the copy shows it is copied', async () => {
    vi.stubGlobal('ClipboardItem', class { constructor(items) { this.items = items; } });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { write: async items => { await items[0].items['image/png']; } } });
    const form = document.body.appendChild(document.createElement('form'));
    const submitted = vi.fn(e => e.preventDefault());
    form.addEventListener('submit', submitted);
    const el = form.appendChild(document.createElement('div'));
    createGenVis(el, { def: defOf('a'), data: csv, copy: true, csv: true, download: true });
    await rendered(el);
    const buttons = [...el.querySelectorAll('.vis-buttons button')];
    expect(buttons.map(b => b.type)).toEqual(['button', 'button', 'button']);
    const copy = el.querySelector('.vis-copy');
    expect(copy.getAttribute('aria-label')).toBe(copy.title);
    copy.click();
    await vi.waitFor(() => expect(copy.title).toBe('Kopiert'));
    expect(copy.getAttribute('aria-label')).toBe('Kopiert');
    expect(submitted).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
});
