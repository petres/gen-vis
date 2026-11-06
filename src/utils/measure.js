export { textWidth, clearMeasures };

// the width of a text in a font (a css font, e.g. "12px Inter, sans-serif")
// in pixels, measured on a canvas, kept per text and font (the labels of
// the axes of every draw); without a canvas (e.g. jsdom) 0.55 em per
// character, about the width of a digit
const cache = new Map();
let context;

// the widths measured before a web font was loaded are stale, see fontsLoaded of comp/vis.js
const clearMeasures = () => cache.clear();

const textWidth = (text, font) => {
    const key = `${font}\u0000${text}`;
    const known = cache.get(key);
    if (known !== undefined)
        return known;
    if (context === undefined)
        context = (typeof document != 'undefined' && document.createElement('canvas').getContext?.('2d')) || null;
    let width;
    if (context) {
        context.font = font;
        width = context.measureText(String(text)).width;
    } else
        width = 0.55*(parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 12)*String(text).length;
    // the labels of charts are few, the cache stays small
    if (cache.size > 5000)
        cache.clear();
    cache.set(key, width);
    return width;
};
