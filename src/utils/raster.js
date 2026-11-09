// the PNG of the SVG of an image, drawn by the browser on a canvas, loaded
// with the first image, see renderImage of utils/export.js
export { rasterize };

// the @font-face rules of the fonts of the package (Inter, injected by the
// script, see vite.config.js) with their files inlined, so the SVG drawn as
// an image has them, an image loads no files; read once, the files are
// fetched once; the fonts of a page of its own font are not embedded, an
// image has the fonts the system has
let faces = null;
const fontFaces = async () => {
    if (faces)
        return faces;
    const rules = [...document.styleSheets].flatMap(sheet => {
        try {
            return [...sheet.cssRules];
        } catch {
            return [];
        }
    }).flatMap(rule => rule.cssRules ? [...rule.cssRules] : [rule])
        .filter(rule => rule.constructor.name == 'CSSFontFaceRule' && /^['"]?Inter['"]?$/.test(rule.style.getPropertyValue('font-family').trim()));
    const embedded = await Promise.all(rules.map(async rule => {
        const url = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
        if (!url)
            return null;
        try {
            const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
            let binary = '';
            bytes.forEach(b => binary += String.fromCharCode(b));
            return rule.cssText.replace(/url\([^)]*\)/, `url(data:font/woff2;base64,${btoa(binary)})`);
        } catch {
            return null;
        }
    }));
    faces = embedded.filter(Boolean).join('\n');
    return faces;
};

// the SVG with the fonts in a style element after its opening tag
const withFonts = (svg, fonts) => fonts ? svg.replace(/<svg\b[^>]*>/, m => `${m}<style>${fonts}</style>`) : svg;

/**
 * The PNG (a Blob) of the SVG `svg` (a text) of the static copy `copy` of a
 * visualisation (the copy is the one of the image, e.g. for tests), of
 * `width` × `height` CSS pixels at `scale` times the size, on `background`.
 */
const rasterize = async (copy, { svg, width, height, scale, background }) => {
    const fonts = await fontFaces();
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
