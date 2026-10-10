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

useDom();

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(schema);

const examples = readdirSync(`${root}/site/examples`).filter(f => f.endsWith('.json'))
    .map(file => [file, JSON.parse(readFileSync(`${root}/site/examples/${file}`, 'utf8'))]);

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
        const el = await mount(GenVis, { def });
        expect(el.querySelector('.vis-error')).toBeNull();
        expect(el.querySelectorAll('svg.vis-svg g.vis-plot').length).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });
});
