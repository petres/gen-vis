// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { itemOf, create, setAttr, getAttr, scriptAttr, join, pointer, cubicInOut, animate, interrupt, interruptAll, finish, targetOf, onEnd } from '@/utils/dom';

const svg = () => document.body.appendChild(create('svg'));
const wait = ms => new Promise(r => setTimeout(r, ms));

describe('elements and attributes', () => {
    test('elements of svg and of the namespaces of prefixes', () => {
        expect(create('rect').namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(create('svg:g').localName).toBe('g');
        expect(create('xhtml:div').namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    });

    test('attributes with namespaces, null removes them', () => {
        const node = create('use');
        setAttr(node, 'xlink:href', '#a');
        expect(node.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a');
        expect(getAttr(node, 'xlink:href')).toBe('#a');
        setAttr(node, 'xlink:href', null);
        expect(node.attributes).toHaveLength(0);
        setAttr(node, 'x', 1);
        expect(node.getAttribute('x')).toBe('1');
        setAttr(node, 'x', undefined);
        expect(node.hasAttribute('x')).toBe(false);
    });
});

describe('attributes and elements which run script', () => {
    test('handlers and links of javascript are not set', () => {
        const node = create('a');
        ['onclick', 'onLoad', 'xlink:onclick'].forEach(name => {
            setAttr(node, name, 'window.pwned=1');
            expect(scriptAttr(name, 'x')).toBe(true);
        });
        setAttr(node, 'href', ' java\nscript:alert(1)');
        setAttr(node, 'xlink:href', 'data:text/html,<script>alert(1)</script>');
        expect(node.attributes).toHaveLength(0);
        setAttr(node, 'href', '#clip');
        setAttr(node, 'xlink:href', 'data:image/png;base64,AAAA');
        expect(node.attributes).toHaveLength(2);
        expect(scriptAttr('opacity', 'javascript:x')).toBe(false);
    });

    test('no elements of script', () => {
        ['script', 'svg:script', 'xhtml:script', 'foreignObject', 'iframe', 'animate', 'set', 'style'].forEach(tag =>
            expect(() => create(tag)).toThrow(/does not draw/));
        expect(create('textPath').localName).toBe('textPath');
    });
});

describe('join', () => {
    const keys = parent => [...parent.children].map(c => c[itemOf]?.k ?? c[itemOf] ?? c.localName);

    test('elements of the same key are reused, in the order of the items, the others removed', () => {
        const parent = svg();
        const key = d => d.k;
        const first = join(parent, [{ k: 'a' }, { k: 'b' }, { k: 'c' }], { key, create: 'circle' });
        expect(keys(parent)).toEqual(['a', 'b', 'c']);
        const second = join(parent, [{ k: 'c' }, { k: 'd' }, { k: 'a' }], { key, create: 'circle' });
        expect(keys(parent)).toEqual(['c', 'd', 'a']);
        expect(second[0]).toBe(first[2]);
        expect(second[2]).toBe(first[0]);
        expect(first[1].isConnected).toBe(false);
        expect(second[1].localName).toBe('circle');
        expect(second[0][itemOf]).toEqual({ k: 'c' });
    });

    test('by default by index, the elements of other selectors are kept', () => {
        const parent = svg();
        parent.appendChild(create('text'));
        const first = join(parent, [1, 2, 3], { select: 'rect', create: 'rect' });
        const second = join(parent, [4, 5], { select: 'rect', create: () => create('rect') });
        expect(second).toEqual(first.slice(0, 2));
        expect(second.map(n => n[itemOf])).toEqual([4, 5]);
        expect(keys(parent)).toEqual(['text', 4, 5]);
    });

    test('elements of a key twice are new ones', () => {
        const parent = svg();
        const [a] = join(parent, ['x'], { key: d => d, create: 'g' });
        const nodes = join(parent, ['x', 'x'], { key: d => d, create: 'g' });
        expect(nodes[0]).toBe(a);
        expect(nodes[1]).not.toBe(a);
    });

    test('an exit can remove the elements itself, they leave the join at once', async () => {
        const parent = svg();
        const [a] = join(parent, ['a'], { key: d => d, create: 'g' });
        a.setAttribute('opacity', 1);
        const exit = node => (animate(node, { opacity: 0 }, { duration: 20, remove: true }), true);
        const nodes = join(parent, ['b'], { key: d => d, create: 'g', exit });
        expect(a.isConnected).toBe(true);
        // a new element of the key of a leaving one
        const again = join(parent, ['a', 'b'], { key: d => d, create: 'g', exit });
        expect(again[0]).not.toBe(a);
        expect(again[1]).toBe(nodes[0]);
        await vi.waitFor(() => expect(a.isConnected).toBe(false));
    });
});

describe('pointer', () => {
    test('the position in an element without svg points of its rectangle', () => {
        const node = document.body.appendChild(document.createElement('div'));
        node.getBoundingClientRect = () => ({ left: 10, top: 20 });
        expect(pointer({ clientX: 15, clientY: 30 }, node)).toEqual([5, 10]);
        expect(pointer({ sourceEvent: { clientX: 15, clientY: 30 } }, node)).toEqual([5, 10]);
        expect(pointer({ pageX: 1, pageY: 2 }, null)).toEqual([1, 2]);
    });
});

describe('animate', () => {
    test('the easing of d3-transition', () => {
        expect([0, 0.25, 0.5, 1].map(cubicInOut)).toEqual([0, 0.0625, 0.5, 1]);
    });

    test('attributes move to their end values, new ones and null at once', async () => {
        const node = svg().appendChild(create('circle'));
        node.setAttribute('cx', 0);
        node.setAttribute('fill', 'red');
        node.setAttribute('stroke', 'blue');
        const ended = vi.fn();
        animate(node, { cx: 100, fill: 'blue', r: 5, stroke: null }, { duration: 60 });
        onEnd(node, 'vis', ended);
        expect(node.getAttribute('cx')).toBe('0');
        expect(node.getAttribute('r')).toBe('5');
        expect(node.hasAttribute('stroke')).toBe(false);
        expect(targetOf(node, 'vis')).toEqual({ cx: 100, fill: 'blue' });
        await vi.waitFor(() => expect(+node.getAttribute('cx')).toBeGreaterThan(0));
        expect(node.getAttribute('fill')).toMatch(/^rgb\(/);
        await vi.waitFor(() => expect(ended).toHaveBeenCalledWith(node));
        expect([node.getAttribute('cx'), node.getAttribute('fill')]).toEqual(['100', 'blue']);
        expect(targetOf(node, 'vis')).toBeNull();
    });

    test('interrupt stops where it is, finish jumps to the end, a new one starts from the current values', async () => {
        const node = svg().appendChild(create('rect'));
        node.setAttribute('x', 0);
        const ended = vi.fn();
        animate(node, { x: 1000 }, { duration: 200, ease: t => t });
        onEnd(node, 'vis', ended);
        await vi.waitFor(() => expect(+node.getAttribute('x')).toBeGreaterThan(0));
        interrupt(node, 'vis');
        const x = node.getAttribute('x');
        await wait(40);
        expect(node.getAttribute('x')).toBe(x);
        expect(ended).not.toHaveBeenCalled();
        expect(targetOf(node, 'vis')).toBeNull();

        animate(node, { x: 2000 }, { duration: 200 });
        onEnd(node, 'vis', ended);
        animate(node, { x: 3000 }, { duration: 200 });
        // the one before is interrupted, without the functions of its end
        expect(targetOf(node, 'vis')).toEqual({ x: 3000 });
        finish(node, 'vis');
        expect(node.getAttribute('x')).toBe('3000');
        expect(ended).not.toHaveBeenCalled();
    });

    test('channels are independent', async () => {
        const node = svg().appendChild(create('rect'));
        node.setAttribute('x', 0);
        node.setAttribute('opacity', 1);
        animate(node, { x: 10 }, { channel: 'vis', duration: 40 });
        animate(node, { opacity: 0 }, { channel: 'highlight', duration: 40 });
        expect(targetOf(node, 'vis')).toEqual({ x: 10 });
        expect(targetOf(node, 'highlight')).toEqual({ opacity: 0 });
        interrupt(node, 'highlight');
        expect(targetOf(node, 'vis')).toEqual({ x: 10 });
        await vi.waitFor(() => expect(node.getAttribute('x')).toBe('10'));
        expect(node.getAttribute('opacity')).not.toBe('0');
    });

    test('a removal at the end, at once without a duration, interruptAll of a chart', async () => {
        const parent = svg();
        const a = parent.appendChild(create('g'));
        animate(a, {}, { duration: 20, remove: true });
        expect(a.isConnected).toBe(true);
        await vi.waitFor(() => expect(a.isConnected).toBe(false));
        const b = parent.appendChild(create('g'));
        b.setAttribute('x', 1);
        animate(b, { x: 5 }, { duration: 0, remove: true });
        expect([b.isConnected, b.getAttribute('x')]).toEqual([false, '5']);
        const c = parent.appendChild(create('g'));
        c.setAttribute('x', 1);
        animate(c, { x: 5 }, { duration: 50 });
        interruptAll(parent);
        expect(targetOf(c, 'vis')).toBeNull();
        expect(c.getAttribute('x')).toBe('1');
    });
});
