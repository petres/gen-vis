// the PNG of the SVG of an image, drawn by the browser on a canvas, loaded
// with the first image, see renderImage of utils/export.js
export { rasterize };

// the @font-face rules of the fonts of the package (Inter, injected by the
// script, see vite.config.js), found once; the fonts of a page of its own
// font are not embedded, an image has the fonts the system has
let rules = null;
const interRules = () => rules ??= [...document.styleSheets].flatMap(sheet => {
    try {
        return [...sheet.cssRules];
    } catch {
        return [];
    }
}).flatMap(rule => rule.cssRules ? [...rule.cssRules] : [rule])
    .filter(rule => rule.constructor.name == 'CSSFontFaceRule' && /^['"]?Inter['"]?$/.test(rule.style.getPropertyValue('font-family').trim()));

// the base64 of bytes, in chunks (a string of a character per byte is slow)
const base64 = bytes => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};

// the rule of a face with its file inlined (an image loads no files),
// fetched once, null if it can not be
const inlined = new Map();
const inline = rule => {
    if (!inlined.has(rule))
        inlined.set(rule, (async () => {
            const url = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
            if (!url)
                return null;
            try {
                const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
                return rule.cssText.replace(/url\([^)]*\)/, `url(data:font/woff2;base64,${base64(bytes)})`);
            } catch {
                return null;
            }
        })());
    return inlined.get(rule);
};

// whether a code point is in a unicode-range of css, e.g. "U+0000-00FF, U+0131"
const inRange = (range, code) => !range || range.split(',').some(r => {
    const m = /^\s*U\+([0-9a-f?]+)(?:-([0-9a-f]+))?\s*$/i.exec(r);
    if (!m)
        return false;
    const from = parseInt(m[1].replace(/\?/g, '0'), 16), to = parseInt(m[2] ?? m[1].replace(/\?/g, 'F'), 16);
    return code >= from && code <= to;
});

/**
 * The faces of Inter the texts of an SVG draw, inlined (see inline): only
 * if a text is of Inter, the faces of the characters of the texts of their
 * weights (the faces are 400 and 600: a weight up to 500 is drawn in 400, a
 * heavier one in 600) and their unicode ranges.
 */
const fontFaces = async svg => {
    if (!/font-family="[^"]*\bInter\b/.test(svg))
        return '';
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    // the characters of the faces of 400 and 600 (a relative weight, e.g.
    // bolder, of both)
    const codes = { 400: new Set(), 600: new Set() };
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const given = node.parentElement?.closest('[font-weight]')?.getAttribute('font-weight') ?? '400';
        const weight = given == 'normal' ? 400 : given == 'bold' ? 700 : Number(given);
        const faces = Number.isNaN(weight) ? [400, 600] : [weight <= 500 ? 400 : 600];
        faces.forEach(f => [...node.data].forEach(c => codes[f].add(c.codePointAt(0))));
    }
    const used = interRules().filter(rule => {
        const weight = (Number(rule.style.getPropertyValue('font-weight')) || 400) <= 500 ? 400 : 600;
        const range = rule.style.getPropertyValue('unicode-range');
        return [...codes[weight]].some(code => inRange(range, code));
    });
    return (await Promise.all(used.map(inline))).filter(Boolean).join('\n');
};

// the SVG with the fonts in a style element after its opening tag
const withFonts = (svg, fonts) => fonts ? svg.replace(/<svg\b[^>]*>/, m => `${m}<style>${fonts}</style>`) : svg;

/**
 * The PNG (a Blob) of the SVG `svg` (a text) of the static copy of a
 * visualisation, of `width` × `height` CSS pixels at `scale` times the
 * size, on `background`, with the faces of Inter it draws (see fontFaces).
 */
const rasterize = async ({ svg, width, height, scale, background }) => {
    const fonts = await fontFaces(svg);
    const url = URL.createObjectURL(new Blob([withFonts(svg, fonts)], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('The SVG of the image could not be drawn.'));
            image.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width*scale);
        canvas.height = Math.round(height*scale);
        const context = canvas.getContext('2d');
        if (background && background != 'none') {
            context.fillStyle = background;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The PNG could not be made.')), 'image/png'));
    } finally {
        URL.revokeObjectURL(url);
    }
};
