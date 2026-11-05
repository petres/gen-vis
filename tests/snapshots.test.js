// @vitest-environment jsdom
// the html of every example definition in data/, drawn, hovered and with
// the first entry of the legend toggled, so changes of the code which change
// the charts are seen in the diff of tests/snapshots/, `vitest -u` takes
// intended changes
import { describe, test, expect } from 'vitest';
import { examples, errors, useDom, mount, pointer, nextTick } from './dom.js';

useDom();

// the attributes of the start tags of serialized html sorted by their names,
// their order does not change the drawing, e.g. the one of the props of a
// plot and of its defaults; the values of the serialization are quoted with
// `"`, which is escaped in them, a `<` of a text is escaped as well
const sortAttributes = html => html.replace(/<([a-zA-Z][^\s/>]*)((?:\s+[^\s"'>\/=]+(?:="[^"]*")?)*)(\s*\/?)>/g, (tag, name, attrs, end) => {
    const sorted = (attrs.match(/[^\s"'>\/=]+(?:="[^"]*")?/g) ?? []).sort((a, b) => {
        const [x, y] = [a, b].map(v => v.split('=')[0]);
        return x < y ? -1 : (x > y ? 1 : 0);
    });
    return `<${name}${sorted.map(a => ` ${a}`).join('')}${end}>`;
});

// without the counters of the ids of a page, numbers are rounded, e.g. the
// positions, so a different order of the computation is no change, three
// decimals are kept, e.g. 1.234 in german, the attributes sorted
const normalize = html => sortAttributes(html
    .replace(/gen-vis-(gradient|form|facet)-\d+/g, 'gen-vis-$1-N')
    .replace(/data-vis="\d+"/g, 'data-vis="N"')
    .replace(/-?\d+\.\d{4,}(e-?\d+)?/g, n => String(+Number(n).toFixed(3))))
    .replace(/></g, '>\n<');

const snapshot = el => normalize(el.querySelector('.vis')?.outerHTML ?? el.innerHTML);

const file = (def, step) => `./snapshots/${def.replace(/^\/data\//, '').replace(/\.json$/, '').replaceAll('/', '__')}.${step}.html`;

describe('the charts of the examples', () => {
    test.each(examples)('%s', async def => {
        const el = await mount({ defFile: def });
        await expect(snapshot(el)).toMatchFileSnapshot(file(def, '1-drawn'));

        // the hover in the middle of the first facet
        const events = el.querySelector('rect.vis-events');
        if (events) {
            events.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 150 }));
            await nextTick();
            await expect(snapshot(el)).toMatchFileSnapshot(file(def, '2-hover'));
            events.dispatchEvent(pointer('pointerleave'));
        }

        const entry = el.querySelector('.vis-legend .vis-legend-entries > div');
        if (entry) {
            entry.click();
            await nextTick();
            await expect(snapshot(el)).toMatchFileSnapshot(file(def, '3-toggled'));
        }
        expect(errors).toEqual([]);
    }, 60000);
});
