// @vitest-environment jsdom
// the html of every example definition in data/, drawn, hovered and with
// the first entry of the legend toggled, so changes of the code which change
// the charts are seen in the diff of tests/snapshots/, `vitest -u` takes
// intended changes
import { describe, test, expect } from 'vitest';
import { nextTick } from 'vue';
import { GenVis } from '@/index.js';
import { examples, errors, useDom, mount, pointer } from './dom.js';

useDom();

// without comments, the scoped ids of vue and the counters of the ids of a page,
// numbers are rounded, e.g. the positions, so a different order of the
// computation is no change, three decimals are kept, e.g. 1.234 in german
const normalize = html => html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/ data-v-[0-9a-f]+=""/g, '')
    .replace(/gen-vis-(gradient|form)-\d+/g, 'gen-vis-$1-N')
    .replace(/-?\d+\.\d{4,}(e-?\d+)?/g, n => String(+Number(n).toFixed(3)))
    .replace(/></g, '>\n<');

const snapshot = el => normalize(el.querySelector('.vis')?.outerHTML ?? el.innerHTML);

const file = (def, step) => `./snapshots/${def.replace(/^\/data\//, '').replace(/\.json$/, '').replaceAll('/', '__')}.${step}.html`;

describe('the charts of the examples', () => {
    test.each(examples)('%s', async def => {
        const el = await mount(GenVis, { defFile: def });
        await expect(snapshot(el)).toMatchFileSnapshot(file(def, '1-drawn'));

        // the hover in the middle of the first facet
        const events = el.querySelector('rect.events');
        if (events) {
            events.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 150 }));
            await nextTick();
            await expect(snapshot(el)).toMatchFileSnapshot(file(def, '2-hover'));
            events.dispatchEvent(pointer('pointerleave'));
        }

        const entry = el.querySelector('.legend .entries > div');
        if (entry) {
            entry.click();
            await nextTick();
            await expect(snapshot(el)).toMatchFileSnapshot(file(def, '3-toggled'));
        }
        expect(errors).toEqual([]);
    }, 60000);
});
