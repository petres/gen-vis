import { describe, test, expect } from 'vitest';
import { snapshot, diffState, applyState } from '@/utils/state';
import { prepareDef } from '@/utils/def';

const def = () => prepareDef({
    globals: { column: 'value', scales: ['y'] },
    formElements: [
        { id: 'column', name: 'Wert', ref: 'column', type: 'switch', values: [
            { id: 'value', name: 'Value', value: 'value' },
            { id: 'other', name: 'Other', value: 'other' },
        ] },
        { id: 'scales', name: 'Skala', ref: 'scales', type: 'switch', values: [
            { id: 'shared', name: 'Geteilt', value: ['y'] },
            { id: 'free', name: 'Getrennt', value: [] },
        ] },
    ],
    mapping: {
        x: { column: 'year', type: 'numeric' },
        c: { column: 'land', type: 'categorical', legend: {}, props: { manual: { Wien: {}, Tirol: { visible: false } } } },
        f: { column: 'type', type: 'categorical', props: { manual: { a: {}, b: {} } } },
    },
    plot: { type: 'cartesian:line', props: {} },
});

describe('snapshot', () => {
    test('the globals of the form elements and the visible entries of the legends', () => {
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
        d.mapping.c.props.Tirol.visible = true;
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
        expect(d.mapping.c.props.Wien.visible).toBe(false);
        expect(d.mapping.c.props.Tirol.visible).toBe(true);
    });

    test('ignores unknown globals, values, mappings and entries', () => {
        const d = def();
        applyState(d, {
            globals: { column: 'missing', unknown: 1 },
            visible: { c: { Wien: false, Vorarlberg: true }, f: { a: false }, missing: { a: false } },
        });
        expect(d.globals).toEqual({ column: 'value', scales: ['y'] });
        expect(Object.keys(d.mapping.c.props)).toEqual(['Wien', 'Tirol']);
        expect(d.mapping.c.props.Wien.visible).toBe(false);
        // no legend, the user can not change it
        expect(d.mapping.f.props.a.visible).toBe(true);
    });

    test('null and empty states', () => {
        const d = def();
        applyState(d, null);
        applyState(d, {});
        expect(snapshot(d)).toEqual(snapshot(def()));
    });
});
