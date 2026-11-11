import { describe, test, expect } from 'vitest';
import { snapshot, diffState, applyState } from '@/utils/state';
import { prepareDef } from '@/utils/def';

const def = () => prepareDef({
    globals: { column: 'value', scales: ['y'] },
    controls: [
        { id: 'column', name: 'Wert', global: 'column', type: 'radio', values: [
            { id: 'value', name: 'Value', value: 'value' },
            { id: 'other', name: 'Other', value: 'other' },
        ] },
        { id: 'scales', name: 'Skala', global: 'scales', type: 'radio', values: [
            { id: 'shared', name: 'Geteilt', value: ['y'] },
            { id: 'free', name: 'Getrennt', value: [] },
        ] },
    ],
    dims: {
        x: { column: 'year', type: 'numeric' },
        c: { column: 'land', type: 'categorical', legend: {}, categories: { Wien: {}, Tirol: { visible: false } } },
        f: { column: 'type', type: 'categorical', categories: { a: {}, b: {} } },
    },
    plot: { type: 'cartesian:line', props: {} },
});

describe('snapshot', () => {
    test('the globals of the controls and the visible entries of the legends', () => {
        expect(snapshot(def())).toEqual({
            globals: { column: 'value', scales: ['y'] },
            visible: { c: { Wien: true, Tirol: false } },
        });
    });
});

describe('diffState', () => {
    test('only the changes', () => {
        const d = def();
        const defaults = snapshot(d);
        expect(diffState(snapshot(d), defaults)).toEqual({});

        d.globals.scales = [];
        d.dims.c.categoryProps.Tirol.visible = true;
        expect(diffState(snapshot(d), defaults)).toEqual({
            globals: { scales: [] },
            visible: { c: { Tirol: true } },
        });
    });
});

describe('applyState', () => {
    test('sets the globals and the visible entries', () => {
        const d = def();
        applyState(d, { globals: { column: 'other', scales: [] }, visible: { c: { Wien: false, Tirol: true } } });
        expect(d.globals).toEqual({ column: 'other', scales: [] });
        expect(d.dims.c.categoryProps.Wien.visible).toBe(false);
        expect(d.dims.c.categoryProps.Tirol.visible).toBe(true);
    });

    test('ignores unknown globals, values, dims and entries', () => {
        const d = def();
        applyState(d, {
            globals: { column: 'missing', unknown: 1 },
            visible: { c: { Wien: false, Vorarlberg: true }, f: { a: false }, missing: { a: false } },
        });
        expect(d.globals).toEqual({ column: 'value', scales: ['y'] });
        expect(Object.keys(d.dims.c.categoryProps)).toEqual(['Wien', 'Tirol']);
        expect(d.dims.c.categoryProps.Wien.visible).toBe(false);
        // no legend, the user can not change it
        expect(d.dims.f.categoryProps.a.visible).toBe(true);
    });

    test('the keys of the prototype of objects are unknown, e.g. of a state of a url', () => {
        const d = def();
        applyState(d, JSON.parse('{ "visible": { "c": { "__proto__": false, "toString": false }, "__proto__": { "a": false } } }'));
        expect(Object.prototype.visible).toBeUndefined();
        expect(Object.prototype.toString.visible).toBeUndefined();
        expect(snapshot(d)).toEqual(snapshot(def()));
    });

    test('null and empty states', () => {
        const d = def();
        applyState(d, null);
        applyState(d, {});
        expect(snapshot(d)).toEqual(snapshot(def()));
    });
});
