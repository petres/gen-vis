// @vitest-environment jsdom
// the lifecycle of a visualisation: definitions and globals changed while it is
// loaded, unmounted while it is loaded, exports while it is loaded, mounting
// by class and the buttons of the footer
import { test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createGenVis, mountGenVisByClass, unmountGenVisElement } from '@/index.js';
import { errors, useDom, rendered, nextTick, resize } from './dom.js';

vi.mock('@/utils/raster.js', () => ({
    rasterize: async () => new Blob(['png'], { type: 'image/png' }),
}));

useDom();

const defOf = (title, extra = {}) => ({
    $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json',
    data: 'd.csv',
    width: 600,
    height: 300,
    title,
    dims: { x: 'year', y: 'value' },
    marks: { type: 'point' },
    ...extra,
});
// a definition with a control of a global
const globalDef = title => defOf(title, { globals: { col: 'value' }, controls: [{ type: 'radio', global: 'col', name: 'C', values: [
    { value: 'value', name: 'V' }, { value: 'other', name: 'O' }] }] });
const csv = 'year,value\n2020,1\n2021,2';

// the files by their name, a delay per name simulates slow responses
const delays = {};
const files = async url => {
    const name = new URL(url).pathname.slice(1);
    await new Promise(r => setTimeout(r, delays[name] ?? 0));
    if (name.startsWith('def'))
        return new Response(JSON.stringify(defOf(name)));
    if (name.startsWith('g'))
        return new Response(JSON.stringify(globalDef(name)));
    if (name.endsWith('.csv'))
        return new Response(csv);
    return new Response('', { status: 404, statusText: 'Not Found' });
};
// also between the tests, when the stubs are removed (see useDom): a
// delayed request of a visualisation of the test before still answers,
// otherwise it fails with the real fetch and the next test shares the
// pending request (fetchCached of utils/load.js)
beforeAll(() => {
    globalThis.fetch = files;
});
beforeEach(() => {
    for (const k in delays)
        delete delays[k];
    vi.stubGlobal('fetch', files);
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

test('a highlight set while it is loaded is shown once it is drawn, it is the prop highlight', async () => {
    const def = defOf('h', { dims: { ...defOf('h').dims, c: 'land' },
        marks: { type: 'point', by: 'c', highlight: { r: 6 } } });
    const data = 'year,value,land\n2020,1,Wien\n2021,2,Tirol';
    const { el, vis } = create({ def, data });
    vis.setHighlight({ c: 'Wien' });
    expect(vis.props.highlight).toEqual({ c: 'Wien' });
    await rendered(el);
    await nextTick();
    expect(vis.store.highlighted).toEqual({ c: 'Wien' });
    expect(el.querySelectorAll('.vis-highlight').length).toBeGreaterThan(0);
    // a later update wins, null ends it
    vis.update({ highlight: { c: 'Tirol' } });
    await nextTick();
    expect(vis.store.highlighted).toEqual({ c: 'Tirol' });
    vis.setHighlight(null);
    expect(vis.props.highlight).toBeNull();
    expect(el.querySelectorAll('.vis-highlight')).toHaveLength(0);
    // also while a new definition is loaded
    vis.update({ def: { ...def, title: 'h2' } });
    await nextTick();
    vis.setHighlight({ c: 'Tirol' });
    await vi.waitFor(() => expect(title(el)).toBe('h2'));
    await nextTick();
    expect(vis.store.highlighted).toEqual({ c: 'Tirol' });
    expect(errors).toEqual([]);
});

test('the element of the page of { root: true } is left as it was after the destroy, also while it is loaded', async () => {
    const { el, vis } = create({ defFile: 'defRoot.json' });
    await rendered(el);
    await nextTick();
    // the height of the one drawn before (400 of jsdom)
    vis.destroy();
    delays['defRoot.json'] = 50;
    const card = document.body.appendChild(document.createElement('div'));
    card.className = 'card';
    card.style.color = 'red';
    const loading = createGenVis(card, { defFile: 'defRoot.json' }, { root: true });
    expect(card.className).toBe('card vis-outer vis-loading');
    expect(card.style.minHeight).toBe('400px');
    loading.destroy();
    expect(card.outerHTML).toBe('<div class="card" style="color: red;"></div>');

    // drawn, a min-height of the page stays
    const page = document.body.appendChild(document.createElement('div'));
    page.style.minHeight = '100px';
    const drawn = createGenVis(page, { defFile: 'defRoot.json' }, { root: true });
    await rendered(page);
    await nextTick();
    expect(page.style.minHeight).toBe('100px');
    drawn.destroy();
    expect(page.outerHTML).toBe('<div style="min-height: 100px;"></div>');
    expect(errors).toEqual([]);
});

// review of 5.0: the error of a draw replaced the controls, nothing but a new definition drew it again
test('an error of a draw is shown below the controls, another value, state, globals or width draws it again', async () => {
    const def = defOf('t', { data: undefined, globals: { col: 'value' },
        controls: [{ type: 'radio', global: 'col', name: 'C', values: ['value', 'bad'] }],
        marks: "=match(@col, {bad: literal([{type: 'nosuch'}])}, literal([{type: 'point'}]))" });
    const errorsOf = [], states = [];
    const { el, vis } = create({ def, data: csv, onError: e => errorsOf.push(e), 'onUpdate:state': s => states.push(s) });
    await rendered(el);
    const radio = i => el.querySelectorAll('input[type=radio]')[i];
    const shown = () => ({ error: el.querySelector('.vis-error')?.textContent ?? null, svg: el.querySelectorAll('svg.vis-svg').length, radios: el.querySelectorAll('input[type=radio]').length });
    radio(1).click();
    await nextTick();
    expect(shown()).toEqual({ error: expect.stringMatching(/unknown mark type 'nosuch'/), svg: 0, radios: 2 });
    expect(title(el)).toBe('t');
    expect(states).toEqual([{ globals: { col: 'bad' } }]);
    // the user chooses the other value again
    radio(0).click();
    await nextTick();
    expect(shown()).toEqual({ error: null, svg: 1, radios: 2 });
    expect(states.at(-1)).toEqual({});
    // of the state and the globals of the page
    radio(1).click();
    await nextTick();
    vis.update({ state: null });
    await nextTick();
    expect(shown().svg).toBe(1);
    vis.update({ globals: { col: 'bad' } });
    await nextTick();
    expect(shown().svg).toBe(0);
    vis.update({ globals: { col: 'value' } });
    await nextTick();
    expect(shown().svg).toBe(1);
    // of another width (the first one observed is the one of the error)
    radio(1).click();
    await nextTick();
    const failed = errorsOf.length;
    resize(500);
    resize(500);
    await nextTick();
    expect(errorsOf.length).toBe(failed);
    resize(400);
    await nextTick();
    expect(errorsOf.length).toBe(failed + 1);
    expect(shown().radios).toBe(2);
    // an error of the load has no controls
    vis.update({ def: null, defFile: 'missing.json' });
    await vi.waitFor(() => expect(errorsOf.length).toBe(failed + 2));
    expect(shown()).toEqual({ error: expect.stringMatching(/missing.json/), svg: 0, radios: 0 });
    errors.length = 0;
});
