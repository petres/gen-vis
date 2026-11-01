// @vitest-environment jsdom
// the examples of the page (site/), they are checked as the ones of data/, so
// they stay valid with the changes of the package
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import Ajv from 'ajv';
import schema from '../schema.json';
import { GenVis } from '@/index.js';
import { validateDef } from '@/utils/validate';
import { errors, useDom, mount, root } from './dom.js';
import steps from '../site/guide/steps.js';

useDom();

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(schema);

// the examples and the chart of the examples of the use (public/charts/), its
// urls are relative to the definition, as the url of the page
const examples = [
    ...readdirSync(`${root}/site/examples`).filter(f => f.endsWith('.json'))
        .map(file => [file, JSON.parse(readFileSync(`${root}/site/examples/${file}`, 'utf8'))]),
    ...readdirSync(`${root}/site/public/charts`).filter(f => f.endsWith('.json'))
        .map(file => [`charts/${file}`, { ...JSON.parse(readFileSync(`${root}/site/public/charts/${file}`, 'utf8')), data: undefined }]),
];
const chartData = readFileSync(`${root}/site/public/data/fossil.csv`, 'utf8');

// the urls of the examples are relative to the page, its files are the ones of site/public
beforeEach(() => {
    vi.stubGlobal('fetch', async url => {
        const file = `${root}/site/public${decodeURIComponent(new URL(url).pathname)}`;
        return existsSync(file)
            ? new Response(readFileSync(file))
            : new Response('', { status: 404, statusText: 'Not Found' });
    });
});

describe('the examples of the page', () => {
    test('are found', () => {
        expect(examples.length).toBeGreaterThanOrEqual(5);
    });

    test.each(examples)('%s is valid and drawn', async (file, def) => {
        expect(validate(def) ? [] : validate.errors).toEqual([]);
        expect(validateDef(def)).toEqual([]);
        const el = await mount(GenVis, file.startsWith('charts/') ? { def, data: chartData } : { def });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(el.querySelectorAll('svg.vis-svg g.vis-plot').length).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });
});

// the steps of the page "How it works" (site/guide.html)
describe('the steps of the page how it works', () => {
    test.each(steps.map(s => [s.id, s.def]))('%s is valid and drawn', async (id, def) => {
        expect(validate(def) ? [] : validate.errors).toEqual([]);
        expect(validateDef(def)).toEqual([]);
        const el = await mount(GenVis, { def });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(el.querySelectorAll('svg.vis-svg g.vis-plot').length).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('the last one switches to nuclear power, without the line at half, and to another first year', async () => {
        const def = steps.at(-1).def;
        const el = await mount(GenVis, { def });
        expect(el.querySelector('.vis-annotation.vis-line')).not.toBeNull();
        const nuclear = await mount(GenVis, { def, state: { globals: { source: 'nuclear', from: '2021' } } });
        expect(nuclear.querySelector('.vis-error')).toBeNull();
        expect(nuclear.querySelector('.vis-annotation.vis-line')).toBeNull();
        expect(nuclear.querySelector('.vis-subtitle').textContent).toBe('Share of the generation of nuclear power, 2021 and 2025');
        expect([...nuclear.querySelectorAll('.vis-legend-entry')].map(e => e.textContent.trim())).toEqual(['2021', '2025']);
        expect(errors).toEqual([]);
    });
});
