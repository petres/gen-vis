import { describe, test, expect } from 'vitest';
import * as du from '@/utils/data';

const def = {
    mapping: {
        x: { column: 'year', type: 'numeric' },
        t: { column: 'date', type: 'date' },
        c: { column: 'land', type: 'categorical' },
    },
};

describe('parseData', () => {
    test('csv', () => {
        expect([...du.parseData('a,b\n1,2')]).toEqual([{ a: '1', b: '2' }]);
    });

    test('json, also with leading whitespace', () => {
        expect(du.parseData('[{"a": 1}]')).toEqual([{ a: 1 }]);
        expect(du.parseData(' \n[{"a": 1}]')).toEqual([{ a: 1 }]);
    });

    test('a byte order mark is removed', () => {
        expect(du.parseData('﻿a,b\n1,2').columns).toEqual(['a', 'b']);
        expect(du.parseData('﻿[{"a": 1}]')).toEqual([{ a: 1 }]);
    });

    test('parsed data is passed through', () => {
        const rows = [{ a: 1 }];
        expect(du.parseData(rows)).toBe(rows);
    });
});

describe('prepareData', () => {
    test('maps the columns and converts the values', () => {
        expect(du.prepareData([{ year: '2020', date: '2020-01-01', land: 'Wien' }], def))
            .toEqual([{ x: 2020, t: Date.parse('2020-01-01'), c: 'Wien' }]);
    });

    test('missing and invalid values are null, not 0', () => {
        expect(du.prepareData([
            { year: '', date: '', land: '' },
            { year: 'NA', date: 'unknown', land: 'Tirol' },
            { year: null },
        ], def)).toEqual([
            { x: null, t: null, c: '' },
            { x: null, t: null, c: 'Tirol' },
            { x: null, t: null, c: undefined },
        ]);
    });

    test('numbers and timestamps of json data', () => {
        expect(du.prepareData([{ year: 0, date: 86400000 }], def)[0]).toMatchObject({ x: 0, t: 86400000 });
    });
});

describe('addDimInfo', () => {
    test('continuous values are sorted, without missing ones', () => {
        const info = { dim: 'x', mapping: { type: 'numeric' } };
        du.addDimInfo(info, [{ x: 3 }, { x: null }, { x: 1 }, { x: 2 }, { x: 1 }]);
        expect(info.values).toEqual([1, 2, 3]);
        expect(info.extent).toEqual([1, 3]);
    });

    test('categorical values keep their order', () => {
        const info = { dim: 'c', mapping: { type: 'categorical' } };
        du.addDimInfo(info, [{ c: 'b' }, { c: 'a' }, { c: 'b' }]);
        expect(info.values).toEqual(['b', 'a']);
        expect(info.extent).toBeUndefined();
    });
});

describe('addStackedData', () => {
    test('positive and negative values are stacked separately', () => {
        const data = [{ x: 1, y: 2 }, { x: 1, y: -1 }, { x: 1, y: 3 }, { x: 2, y: 5 }];
        du.addStackedData(data, { h: 'x', v: 'y' });
        expect(data.map(d => [d['y:st:s'], d['y:st:e']])).toEqual([[0, 2], [0, -1], [2, 5], [0, 5]]);
    });
});

describe('filter', () => {
    const data = [{ c: 'a', x: 1 }, { c: 'b', x: 2 }, { c: 'c', x: 3 }];

    test('by value, list and function', () => {
        expect(du.filter(data, [{ dim: 'c', key: 'b' }])).toEqual([data[1]]);
        expect(du.filter(data, [{ dim: 'c', key: ['a', 'c'] }])).toEqual([data[0], data[2]]);
        expect(du.filter(data, [{ dim: 'x', key: v => v > 1 }, { dim: 'c', key: ['a', 'c'] }])).toEqual([data[2]]);
    });

    test('always returns a new array', () => {
        const filtered = du.filter(data, []);
        expect(filtered).toEqual(data);
        expect(filtered).not.toBe(data);
    });
});

describe('groupBy', () => {
    test('groups by several keys', () => {
        const data = [{ a: 1, b: 'x' }, { a: 1, b: 'y' }, { a: 1, b: 'x' }];
        expect(du.groupBy(data, ['a', 'b'])).toEqual([
            { group: { a: 1, b: 'x' }, entries: [data[0], data[2]] },
            { group: { a: 1, b: 'y' }, entries: [data[1]] },
        ]);
    });
});
