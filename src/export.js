// the export page (dist-lib/export.html, of this module of the module build,
// dist-lib/esm/export.js): `window.genVisExport(options)` draws a chart in
// the page, at the top left, at exactly the width asked for, and returns
// its SVG and the rectangle of its image in the page, so a program which
// drives the browser (the CLI bin/gen-vis.js, wrappers of Python or R)
// takes a screenshot of it (PNG) or prints the SVG (PDF). The protocol is
// the one of docs/export.md, of `genVisExport.version`;
// `genVisExport.resolve(options)` returns the merged definition, e.g. of
// the plot types a wrapper chooses its colors by.
import { createGenVis } from '@/index.js';
import { registerScheme } from '@/utils/d3';
import { clearCache, fetchData, readDef, resolveParents, resolveUrl } from '@/utils/load';
import { staticCopy, selectParts, partsBox, backgroundOf, defaultWidth, padding } from '@/utils/export.js';
import { composeSvg, units } from '@/utils/export-svg.js';

// the version of the protocol, a new one only of changes which are not
// compatible with the one before, e.g. a new meaning of an option
const version = 1;

// the options of genVisExport, see docs/export.md
const known = ['def', 'defUrl', 'data', 'dataUrl', 'baseUrl', 'width', 'padding', 'unit', 'css', 'classes', 'globals',
    'state', 'defaults', 'parts', 'fontSize', 'background', 'schemes', 'timeout'];

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
            '.vis-legend .vis-legend-title', '.vis-legend .vis-legend-entries > div', '.vis-color-legend .vis-legend-title']],
        [11, ['.vis-facet svg .vis-annotation-label', '.vis-color-legend svg', '.vis-color-legend .vis-legend-missing']],
    ];
    return groups.map(([size, selectors]) => `${selectors.join(', ')} { font-size: ${(size * f).toFixed(3)}px !important; }`).join('\n');
};

// the options of genVisExport and of resolve: unknown ones are an error,
// one of def and defUrl is needed
const checkOptions = options => {
    const unknown = Object.keys(options).filter(k => !known.includes(k));
    if (unknown.length)
        throw new Error(`genVisExport: unknown options ${unknown.join(', ')}, expected some of ${known.join(', ')}.`);
    if ((options.def == null) == (options.defUrl == null))
        throw new Error('genVisExport: either def (a definition) or defUrl (the url of one) is needed.');
};

// the <base> of the url of the relative urls of a definition object, the
// first one of the page, before the one of a chart before
const addBase = baseUrl => {
    if (baseUrl == null)
        return null;
    const base = document.head.insertBefore(document.createElement('base'), document.head.firstChild);
    base.className = 'gen-vis-export';
    base.href = baseUrl;
    return base;
};

// the definition of the options with its parents and mixins (resolveParents
// of the load of a chart, not normalized), a definition object relative to
// the <base> of baseUrl, if there is one
const mergedOf = async options => {
    const { def, url } = await readDef(options.def ?? null, options.defUrl ?? null);
    return resolveParents(JSON.parse(JSON.stringify(def)), url);
};

// the value of an option which may be a function of the merged definition,
// its result (also of a promise) an object or null, other values as they are
const ofMerged = async (value, name, merged) => {
    if (typeof value != 'function')
        return value ?? null;
    const result = await value(merged);
    if (result != null && (typeof result != 'object' || Array.isArray(result)))
        throw new Error(`genVisExport: the function of ${name} returns an object, not ${JSON.stringify(result) ?? String(result)}.`);
    return result ?? null;
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
// { base64 }) or the bytes of an url, as the data of a definition of an url
// without an extension (parquet of its content, see parseData), none otherwise
const dataOf = async ({ data, dataUrl }) => {
    if (data?.base64 !== undefined)
        return Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    if (data != null || dataUrl == null)
        return data ?? null;
    try {
        return await fetchData(resolveUrl(dataUrl), undefined);
    } catch (error) {
        throw new Error(`genVisExport: ${error.message}`);
    }
};

// the copy of the chart before, removed by the next one, and the restores
// of the schemes of its options (registerScheme), so they are the ones of
// that call only
let removeBefore = null;
let restoreSchemes = [];

// each call loads its files again (the cache of utils/load.js is the one
// of a call, e.g. of the merged definition and the chart, see mergedOf), a
// file changed since the call before or one of another caller of the same
// url is not the one of the call before. A request still running of a
// call before (e.g. one that timed out) is not kept: the cache keeps an
// entry from the start of its request, and the cleared ones are gone; a
// load of that call which requests a file later requests it anew, after
// this call began.
const clear = () => {
    clearCache();
    removeBefore?.();
    removeBefore = null;
    restoreSchemes.reverse().forEach(restore => restore());
    restoreSchemes = [];
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
 * docs/export.md: the SVG (a string), the size of the image in CSS
 * pixels and its rectangle in the page (`x`, `y`, `width`, `height`, CSS
 * pixels of the page, e.g. the clip of a screenshot), it stays in the page
 * until the next call. Errors (e.g. of the definition) reject it with the
 * message of gen-vis.
 */
const genVisExport = async (options = {}) => {
    clear();
    checkOptions(options);
    const width = lengthOf(options.width ?? defaultWidth, 'width');
    const space = options.padding ?? padding;
    if (typeof space != 'number' || !(space >= 0) || space == Infinity)
        throw new Error(`genVisExport: padding is a number of pixels, 0 or more, not ${JSON.stringify(space) ?? String(space)}.`);
    const unit = options.unit ?? (width.unit == 'pt' ? 'px' : width.unit);
    if (!Object.hasOwn(units, unit))
        throw new Error(`genVisExport: unknown unit ${unit}, expected one of ${Object.keys(units).join(', ')}.`);
    if (width.px - 2 * space <= 0)
        throw new Error(`genVisExport: the width ${options.width} has no space for the chart beside the padding.`);
    // the urls of a definition object are relative to the base url
    addBase(options.baseUrl);
    // schemes and defaults of functions of the merged definition, it is
    // resolved only for them, its files are loaded once (the cache of the load)
    const merged = [options.schemes, options.defaults].some(o => typeof o == 'function') ? await mergedOf(options) : null;
    Object.entries(await ofMerged(options.schemes, 'schemes', merged) ?? {}).forEach(([name, colors]) => restoreSchemes.push(registerScheme(name, colors)));
    const defaults = await ofMerged(options.defaults, 'defaults', merged);
    await addStyles(options.css, options.fontSize);
    const data = await dataOf(options);
    const classes = listOf(options.classes).flatMap(c => String(c).split(/\s+/)).filter(Boolean);

    const mount = (holder, done) => {
        const shown = createGenVis(holder, {
            def: options.def ?? null, defFile: options.defUrl ?? null, data,
            globals: options.globals ?? null, state: options.state ?? null, defaults,
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

/**
 * The definition of the options (`def` or `defUrl`, relative to `baseUrl`)
 * with its parents and mixins, merged as the load of a chart does, not
 * normalized, see docs/export.md; it takes the options of
 * genVisExport (the others are not used) and leaves the chart before as it
 * is. Errors (e.g. of a missing parent) reject it with the message of
 * gen-vis.
 */
genVisExport.resolve = async (options = {}) => {
    checkOptions(options);
    // its files are loaded anew, as the ones of genVisExport
    clearCache();
    const base = addBase(options.baseUrl);
    try {
        return await mergedOf(options);
    } finally {
        base?.remove();
    }
};

window.genVisExport = genVisExport;
