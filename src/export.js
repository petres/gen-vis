// the export page (dist-lib/export.html, of this module of the module build,
// dist-lib/esm/export.js): `window.genVisExport(options)` draws a chart in
// the page, at the top left, at exactly the width asked for, and returns
// its SVG and the rectangle of its image in the page, so a program which
// drives the browser (the CLI bin/gen-vis.js, wrappers of Python or R)
// takes a screenshot of it (PNG) or prints the SVG (PDF). The protocol is
// the one of README "Static export", of `genVisExport.version`.
import { createGenVis } from '@/index.js';
import { registerScheme } from '@/utils/d3';
import { staticCopy, selectParts, partsBox, backgroundOf, padding } from '@/utils/export.js';
import { composeSvg, units } from '@/utils/export-svg.js';

// the version of the protocol, a new one only of changes which are not
// compatible with the one before, e.g. a new meaning of an option
const version = 1;

// the options of genVisExport, see README "Static export"
const known = ['def', 'defUrl', 'data', 'dataUrl', 'baseUrl', 'width', 'padding', 'unit', 'css', 'classes', 'globals',
    'state', 'parts', 'fontSize', 'background', 'schemes', 'timeout'];

// the CSS pixels of a length, e.g. 800, "800px", "16cm", "160mm", "6in" or
// "8pt", and its unit
const lengthOf = (value, name) => {
    if (typeof value == 'number' && value > 0)
        return { px: value, unit: 'px' };
    const m = typeof value == 'string' && value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(px|cm|mm|in|pt)?$/);
    if (!m || !(+m[1] > 0))
        throw new Error(`genVisExport: ${name} is a length, e.g. 800, "800px", "16cm" or "6in", not ${JSON.stringify(value)}.`);
    const unit = m[2] ?? 'px';
    return { px: +m[1] * (unit == 'pt' ? 96 / 72 : units[unit]), unit };
};

// the sizes of the texts of gen-vis of a size of its texts, e.g. 8pt: 13px
// of most texts become it, the title (22px) and the small texts (11px) in
// proportion; sizes of the definition (props) stay as they are
const fontCss = px => {
    const f = px / 13;
    const groups = [
        [22, ['.vis-header .vis-title']],
        [14, ['.vis-message']],
        [13, ['.vis-header .vis-subtitle', '.vis-header .vis-selection', '.vis-footer-content > span',
            '.vis-facet-title', '.vis-facet svg g.tick text:not([font-size])', '.vis-facet svg .vis-axis-title',
            '.vis-legend .vis-legend-title', '.vis-legend .vis-legend-entries > div span', '.vis-color-legend .vis-legend-title']],
        [11, ['.vis-facet svg .vis-annotation-label', '.vis-color-legend svg', '.vis-color-legend .vis-legend-missing']],
    ];
    return groups.map(([size, selectors]) => `${selectors.join(', ')} { font-size: ${(size * f).toFixed(3)}px !important; }`).join('\n');
};

// a list of a single value, none of null
const listOf = v => v == null ? [] : Array.isArray(v) ? v : [v];

// the stylesheets of the options, a text with a { is one, others are urls,
// loaded before the chart is drawn
const addStyles = (css, fontSize) => Promise.all([...listOf(css), ...(fontSize == null ? [] : [fontCss(lengthOf(fontSize, 'fontSize').px)])].map(c => {
    if (typeof c != 'string')
        throw new Error('genVisExport: css is a stylesheet (a text or an url) or a list of them.');
    if (c.includes('{')) {
        const style = document.head.appendChild(document.createElement('style'));
        style.className = 'gen-vis-export';
        style.textContent = c;
        return null;
    }
    const link = document.head.appendChild(document.createElement('link'));
    link.className = 'gen-vis-export';
    link.rel = 'stylesheet';
    return new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = () => reject(new Error(`genVisExport: the stylesheet ${c} could not be loaded.`));
        link.href = c;
    });
}));

// the data of the options: the one given (rows, a CSV/JSON text, bytes as
// { base64 }) or the one of an url (parquet as bytes), none otherwise
const dataOf = async ({ data, dataUrl }) => {
    if (data?.base64 !== undefined)
        return Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    if (data != null || dataUrl == null)
        return data ?? null;
    const response = await fetch(dataUrl);
    if (!response.ok)
        throw new Error(`genVisExport: the data ${dataUrl} could not be loaded (${response.status} ${response.statusText}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // parquet files begin with PAR1
    return String.fromCharCode(...bytes.subarray(0, 4)) == 'PAR1' ? bytes : new TextDecoder().decode(bytes);
};

// the copy of the chart before, removed by the next one
let removeBefore = null;

const clear = () => {
    removeBefore?.();
    removeBefore = null;
    document.querySelectorAll('.gen-vis-export').forEach(e => e.remove());
};

// the next frame, at most 100 ms later, e.g. of a page in the background
// which draws no frames
const frame = () => new Promise(resolve => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 100);
});

/**
 * Draws a chart and returns `{ version, svg, width, height, box }`, see
 * README "Static export": the SVG (a string), the size of the image in CSS
 * pixels and its rectangle in the page (`x`, `y`, `width`, `height`, CSS
 * pixels of the page, e.g. the clip of a screenshot), it stays in the page
 * until the next call. Errors (e.g. of the definition) reject it with the
 * message of gen-vis.
 */
const genVisExport = async (options = {}) => {
    clear();
    const unknown = Object.keys(options).filter(k => !known.includes(k));
    if (unknown.length)
        throw new Error(`genVisExport: unknown options ${unknown.join(', ')}, expected some of ${known.join(', ')}.`);
    if ((options.def == null) == (options.defUrl == null))
        throw new Error('genVisExport: either def (a definition) or defUrl (the url of one) is needed.');
    const width = lengthOf(options.width ?? 800, 'width');
    const space = options.padding ?? padding;
    const unit = options.unit ?? (width.unit == 'pt' ? 'px' : width.unit);
    if (!Object.hasOwn(units, unit))
        throw new Error(`genVisExport: unknown unit ${unit}, expected one of ${Object.keys(units).join(', ')}.`);
    if (width.px - 2 * space <= 0)
        throw new Error(`genVisExport: the width ${options.width} has no space for the chart beside the padding.`);
    Object.entries(options.schemes ?? {}).forEach(([name, colors]) => registerScheme(name, colors));
    // the urls of a definition object are relative to the base url
    if (options.baseUrl != null) {
        const base = document.head.appendChild(document.createElement('base'));
        base.className = 'gen-vis-export';
        base.href = options.baseUrl;
    }
    await addStyles(options.css, options.fontSize);
    const data = await dataOf(options);
    const classes = listOf(options.classes).flatMap(c => String(c).split(/\s+/)).filter(Boolean);

    const mount = (holder, done) => {
        const shown = createGenVis(holder, {
            def: options.def ?? null, defFile: options.defUrl ?? null, data,
            globals: options.globals ?? null, state: options.state ?? null,
            onRendered: done.resolve, onError: done.reject,
        });
        shown.el.classList.add(...classes);
        return shown;
    };
    const { copy, remove } = await staticCopy(wrapper => document.body.append(wrapper), mount,
        { width: width.px - 2 * space, space, visible: true, wait: options.timeout ?? 30000 });
    removeBefore = remove;
    selectParts(copy, options.parts ?? null);
    copy.style.background = options.background === undefined ? backgroundOf(copy) : (options.background ?? 'none');
    // the end of the transitions of the copy, then the layout of a frame
    document.getAnimations?.().forEach(a => { try { a.finish(); } catch { /* an infinite one */ } });
    await frame();

    const b = partsBox(copy, options.parts ?? null, space);
    const svg = composeSvg(copy, { box: b, unit, width: width.px });
    return { version, svg, width: b.width, height: b.height, box: { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height } };
};
genVisExport.version = version;

window.genVisExport = genVisExport;
