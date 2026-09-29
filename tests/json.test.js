import { describe, test, expect } from 'vitest';
import * as ju from '@/utils/json';

describe('props', () => {
    test('fixed values and refs', () => {
        expect(ju.entryToValue(3, {})).toBe(3);
        expect(ju.entryToValue('@a', { a: 'x' })).toBe('x');
        expect(ju.entryToProp('@y:st:e:scaled')).toEqual({ prop: 'ref', ref: 'y:st:e:scaled', parts: ['y', 'st', 'e', 'scaled'] });
    });

    test('relative', () => {
        expect(ju.entryToValue({ prop: 'relative', ref: 'innerWidth', ratio: 0.5 }, { innerWidth: 100 })).toBe(50);
    });

    test('steps', () => {
        const steps = { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 1 }, { cut: 500, value: 2 }] };
        expect(ju.entryToValue(steps, { totalWidth: 400 })).toBe(1);
        expect(ju.entryToValue(steps, { totalWidth: 600 })).toBe(2);
    });

    test('refNames of nested props', () => {
        const props = ju.entryToProp({ x: '@x:scaled', d: { y: '@y:st:e:scaled' }, fill: 'red', w: { prop: 'relative', ref: 'innerWidth', ratio: 1 } });
        expect(ju.refNames(props)).toEqual(['x', 'y', 'innerWidth']);
    });
});

describe('prepareDef', () => {
    test('the facets dim of older definitions is a list', () => {
        const def = ju.prepareDef({ mapping: {}, plot: [], facets: { dim: ['land'] } });
        expect(def.facets.dim).toBe('land');
    });

    test('defaults', () => {
        const def = ju.prepareDef({
            mapping: {
                x: { column: 'a', scale: { orientation: 'horizontal' }, axis: { format: 'c' }, hover: {} },
                c: { column: 'b', props: { common: { r: 3 }, manual: { a: {}, b: { visible: false, name: 'B' } } } },
            },
            plot: { type: 'svg:circle', props: { r: '@r', 'highlight-r': 5 } },
        });
        expect(def.mapping.x.scale).toMatchObject({ type: 'linear', range: [0, '@width'], domainAbs: [0, 0] });
        expect(def.mapping.x.hover.format).toBe('c');
        expect(def.mapping.c.props).toEqual({ a: { r: 3, name: 'a', visible: true }, b: { r: 3, name: 'B', visible: false } });
        expect(def.plot).toHaveLength(1);
        expect(def.plot[0]).toMatchObject({ id: 'plot-0', categories: [], highlightProps: ['r'] });
    });
});

describe('getProps', () => {
    test('the props of one group do not leak into others', () => {
        const def = ju.prepareDef({
            mapping: { c: { column: 'c', props: { manual: { a: { color: 'red', bold: 'bold' }, b: { color: 'blue' } } } } },
            plot: { type: 'svg:circle', categories: ['c'], props: { fill: '@color', 'font-weight': '@bold' } },
        });
        const groups = [{ group: { c: 'a' }, entries: [] }, { group: { c: 'b' }, entries: [] }];
        const globs = { width: 100 };
        const [a, b] = ju.getProps(groups, def.plot[0], globs, def.mapping);
        expect(a.props['font-weight'].value).toBe('bold');
        expect(b.props['font-weight'].value).toBeUndefined();
        expect(b.props.fill.value).toBe('blue');
        expect(globs).toEqual({ width: 100 });
    });
});

describe('applyFormElements', () => {
    const defOrg = {
        globals: { value: 'a' },
        formElements: [{ ref: 'value', type: 'switch', values: [
            { value: 'a', mapping: { y: { column: 'A' } } },
            { value: 'b', mapping: { y: { column: 'B' } } },
        ] }],
        mapping: { y: { column: 'A', type: 'numeric', scale: { orientation: 'vertical' } } },
        plot: { type: 'svg:path', props: {} },
    };

    test('the selected entries patch the mappings', () => {
        const def = ju.prepareDef(JSON.parse(JSON.stringify(defOrg)));
        def.globals.value = 'b';
        expect(ju.applyFormElements(def, defOrg)).toBe(true);
        expect(def.mapping.y).toMatchObject({ column: 'B', type: 'numeric', scale: { type: 'linear' } });
        expect(defOrg.mapping.y.column).toBe('A');
    });

    test('nothing to do without patches', () => {
        expect(ju.applyFormElements({ mapping: {} }, { mapping: {} })).toBe(false);
    });
});
