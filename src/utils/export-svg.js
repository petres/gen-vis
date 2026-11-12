// the SVG of the static copy of a visualisation (see staticCopy of
// utils/export.js), loaded with the first one, see exportSvg of comp/app.js
// and the export page (src/export.js). It is made for Word, LaTeX (through
// a PDF) and editors, which draw SVG but not HTML and not CSS: the texts of
// the HTML (the title, the subtitle, the legends, the footer) are <text>
// elements at the positions the browser drew them, one per line, the
// backgrounds and borders <rect> and <line> elements, the svg elements of
// the plots are copied with every style resolved into presentation
// attributes. It has no foreignObject, no <style>, no classes, no style
// attributes, no css variables, no images and no fonts of its own, no
// scripts and no handlers of events (see scriptElement and scriptAttr of
// utils/dom.js); colors are hex colors with opacities of their own (no
// rgba), lengths have no units, the baselines of the texts
// (dominant-baseline) are offsets, the halos of labels (paint-order) are
// two texts, nested svg elements are groups (with a clip only where their
// content overflows them), lengths of texts in em are pixels, an href is
// also an xlink:href (SVG 1.1), the ids have a prefix of the content of the
// file (see prefixIds).
export { composeSvg, units };

import { scriptAttr, scriptElement } from "@/utils/dom";

const ns = 'http://www.w3.org/2000/svg';
const xlink = 'http://www.w3.org/1999/xlink';

// the CSS pixels of the units of the size of an SVG, a CSS pixel is 1/96 in
const units = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

// a color of CSS which is not rgb (e.g. oklch() or color()) as rgba() of
// a pixel drawn of it, of sRGB, null without a canvas (e.g. jsdom)
const rgbOf = new Map();
let pixel = null;
const toRgb = c => {
    if (!rgbOf.has(c)) {
        pixel ??= document.createElement('canvas').getContext?.('2d', { willReadFrequently: true }) ?? false;
        let rgb = null;
        if (pixel && globalThis.CSS?.supports?.('color', c)) {
            pixel.clearRect(0, 0, 1, 1);
            pixel.fillStyle = c;
            pixel.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
            rgb = `rgba(${r}, ${g}, ${b}, ${r3(a / 255)})`;
        }
        rgbOf.set(c, rgb);
    }
    return rgbOf.get(c);
};

// a color of a computed style as a hex color and its alpha, null of none,
// a color which is not rgb as the rgb of a pixel of it, one the browser can
// not draw as it is
const parseColor = c => {
    if (!c || c == 'none' || c == 'transparent')
        return null;
    const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;
    const m = c.match(rgba) ?? toRgb(c)?.match(rgba);
    if (!m)
        return { value: c, alpha: 1 };
    const hex = [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('');
    const alpha = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return { value: `#${hex}`.toUpperCase(), alpha };
};
const transparent = c => (parseColor(c)?.alpha ?? 0) == 0;

// a paint of a computed style (fill, stroke): a hex color, none or the
// reference of a gradient of the svg (url(#id)), undefined of none computed
const paint = v => {
    if (!v)
        return { value: undefined, alpha: 1 };
    const url = v?.match(/url\(["']?[^"')]*?(#[^"')]+)["']?\)/);
    if (url)
        return { value: `url(${url[1]})`, alpha: 1 };
    return parseColor(v) ?? { value: 'none', alpha: 1 };
};

// a length or a list of them without px, e.g. "4 3" of "4px, 3px"
const unitless = v => v.replace(/(-?[\d.]+)px/g, '$1').replace(/,\s*/g, ' ');

// lengths in em and rem (e.g. "0.71em", "0 1em") as pixels of a font size
const emToPx = (v, size) => v.replace(/(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(r?em)\b/g,
    (_, n, u) => String(r2(n * (u == 'rem' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : size))));

// the opacity of an attribute, none of 1
const opacityOf = a => a < 1 ? r2(a) : null;

// the inherited properties of svg and their initial values, an element has
// the ones which differ from the ones of its parent
const inherited = {
    'fill': '#000000', 'fill-opacity': '1', 'fill-rule': 'nonzero', 'stroke': 'none', 'stroke-width': '1',
    'stroke-opacity': '1', 'stroke-dasharray': 'none', 'stroke-dashoffset': '0', 'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', 'font-family': '', 'font-size': '', 'font-weight': '400',
    'font-style': 'normal', 'font-variant': 'normal', 'text-anchor': 'start', 'letter-spacing': '0',
    'visibility': 'visible', 'shape-rendering': 'auto',
};
// the properties which are not inherited and their initial values
const own = { 'opacity': '1', 'mix-blend-mode': 'normal', 'stop-opacity': '1', 'vector-effect': 'none' };

// the inherited properties of a computed style
const resolved = cs => {
    const fill = paint(cs.fill), stroke = paint(cs.stroke);
    return {
        'fill': fill.value,
        'fill-opacity': String(r2(parseFloat(cs.fillOpacity) * fill.alpha)),
        'fill-rule': cs.fillRule,
        'stroke': stroke.value,
        'stroke-opacity': String(r2(parseFloat(cs.strokeOpacity) * stroke.alpha)),
        'stroke-width': unitless(cs.strokeWidth),
        'stroke-dasharray': unitless(cs.strokeDasharray),
        'stroke-dashoffset': unitless(cs.strokeDashoffset),
        'stroke-linecap': cs.strokeLinecap,
        'stroke-linejoin': cs.strokeLinejoin,
        'stroke-miterlimit': cs.strokeMiterlimit,
        'font-family': cs.fontFamily,
        'font-size': unitless(cs.fontSize),
        'font-weight': cs.fontWeight,
        'font-style': cs.fontStyle,
        'font-variant': cs.fontVariantCaps,
        'text-anchor': cs.textAnchor,
        'letter-spacing': cs.letterSpacing == 'normal' ? '0' : unitless(cs.letterSpacing),
        'visibility': cs.visibility,
        'shape-rendering': cs.shapeRendering,
    };
};

// a text in the case of a CSS text-transform, e.g. of the legends
const transformText = (text, t) =>
    t == 'uppercase' ? text.toUpperCase() : t == 'lowercase' ? text.toLowerCase()
        : t == 'capitalize' ? text.replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase()) : text;

// the arrowheads in the color of their marker while the svg is copied,
// not in the stroke of their line (context-stroke, see styles.css), which
// other programs do not know and which is no color of an attribute; an
// export shows no highlight, the color is the one of the line (the
// inline style wins over the !important of the stylesheet), returns the
// function which restores them
const pinnedArrows = svg => {
    const paths = [...svg.querySelectorAll('marker.vis-arrow > path')];
    const priorities = paths.map(p => p.style.getPropertyPriority('fill'));
    paths.forEach(p => p.style.setProperty('fill', p.style.getPropertyValue('fill'), 'important'));
    return () => paths.forEach((p, i) => p.style.setProperty('fill', p.style.getPropertyValue('fill'), priorities[i]));
};

// the attributes which are left out, of the styles of the page and of the
// screen readers (the ids stay, e.g. of the clips of the plots)
const dropped = ['style', 'class', 'dominant-baseline', 'alignment-baseline', 'paint-order', 'tabindex', 'role', 'focusable'];

// the shifts of the texts of an svg element of their dominant-baseline (or
// alignment-baseline) to the alphabetic one, in their own coordinates, Word
// and others do not know them; measured together, of two layouts
const baselineShifts = svg => {
    const texts = [...svg.querySelectorAll('text')].filter(t => {
        const cs = getComputedStyle(t);
        const db = cs.dominantBaseline, ab = cs.alignmentBaseline;
        return cs.display != 'none' && !((db == 'auto' || db == 'alphabetic') && (ab == 'auto' || ab == 'baseline' || ab == 'alphabetic'));
    });
    const top = t => { try { return t.getBBox().y; } catch { return null; } };
    const before = texts.map(top);
    const styles = texts.map(t => [t.style.dominantBaseline, t.style.alignmentBaseline]);
    texts.forEach(t => { t.style.dominantBaseline = 'alphabetic'; t.style.alignmentBaseline = 'baseline'; });
    const shifts = new Map();
    texts.forEach((t, i) => {
        const after = top(t);
        if (before[i] != null && after != null)
            shifts.set(t, r2(before[i] - after));
    });
    texts.forEach((t, i) => [t.style.dominantBaseline, t.style.alignmentBaseline] = styles[i]);
    return shifts;
};

// the styles of an svg element and of its children as attributes, in place
// of their classes and styles (the copy has the structure of the original),
// `parent` the inherited properties of the parent, `halos` the texts with
// a halo, see splitHalos
const inlineSvg = (orig, copy, parent, shifts, halos) => {
    const cs = getComputedStyle(orig);
    if (cs.display == 'none') {
        copy.remove();
        return;
    }
    // a property the browser does not compute (e.g. jsdom) keeps its attribute
    const props = Object.fromEntries(Object.entries(resolved(cs)).filter(([, v]) => v && !v.includes('NaN') && !v.includes('undefined')));
    Object.entries(props).forEach(([p, v]) => (parent[p] ?? inherited[p]) != v ? copy.setAttribute(p, v) : copy.removeAttribute(p));
    Object.entries(own).forEach(([p, initial]) => {
        const v = cs.getPropertyValue(p);
        v && v != initial ? copy.setAttribute(p, v) : copy.removeAttribute(p);
    });
    const tag = orig.tagName;
    if (tag == 'stop') {
        const c = parseColor(cs.stopColor);
        if (c) {
            copy.setAttribute('stop-color', c.value);
            if (c.alpha < 1)
                copy.setAttribute('stop-opacity', r2(c.alpha * parseFloat(cs.stopOpacity)));
        }
    }
    // a transform of a stylesheet (not of the attribute), e.g. of the ticks
    if (cs.transform && cs.transform != 'none' && !orig.hasAttribute('transform') && tag != 'svg')
        copy.setAttribute('transform', cs.transform.replace(/,\s*/g, ' '));
    if (tag == 'text') {
        const shift = shifts.get(orig);
        if (shift)
            copy.setAttribute('transform', `${copy.getAttribute('transform') ?? ''} translate(0 ${shift})`.trim());
        if (cs.paintOrder?.startsWith('stroke') && props.stroke && props.stroke != 'none')
            halos.push(copy);
    }
    // lengths of texts in em (e.g. the dy of the ticks of d3) in pixels of
    // their font size, LibreOffice and Word place them otherwise
    const fontSize = parseFloat(cs.fontSize);
    if ((tag == 'text' || tag == 'tspan') && fontSize > 0)
        ['x', 'y', 'dx', 'dy'].forEach(a => {
            const v = copy.getAttribute(a);
            if (v?.includes('em'))
                copy.setAttribute(a, emToPx(v, fontSize));
        });
    // the href of SVG 2 also as the xlink:href of SVG 1.1, e.g. of a
    // textPath, rsvg-convert and others know only that one
    if (copy.hasAttribute('href'))
        copy.setAttributeNS(xlink, 'xlink:href', copy.getAttribute('href'));
    dropped.forEach(a => copy.removeAttribute(a));
    [...copy.attributes].filter(a => a.name.startsWith('data-') || a.name.startsWith('aria-') || scriptAttr(a.name, a.value, tag)).forEach(a => copy.removeAttribute(a.name));
    if (cs.textTransform && cs.textTransform != 'none' && (tag == 'text' || tag == 'tspan'))
        copy.childNodes.forEach(n => {
            if (n.nodeType == Node.TEXT_NODE)
                n.data = transformText(n.data, cs.textTransform);
        });
    const children = [...copy.children];
    [...orig.children].forEach((o, i) => inlineSvg(o, children[i], props, shifts, halos));
};

// a text with a halo (paint-order stroke) as the halo (its stroke) below
// the text (its fill), Word does not know paint-order
const splitHalos = halos => halos.forEach(t => {
    const halo = t.cloneNode(true);
    halo.setAttribute('fill', 'none');
    halo.removeAttribute('fill-opacity');
    t.setAttribute('stroke', 'none');
    ['stroke-width', 'stroke-opacity', 'stroke-linejoin', 'stroke-linecap'].forEach(a => t.removeAttribute(a));
    t.before(halo);
});

// the ascents of the fonts, the distance of the top of a line of a text to
// its baseline, of the canvas, of 0.9 of the size without one (e.g. jsdom)
const ascents = new Map();
let canvas = null;
const ascentOf = cs => {
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!ascents.has(font)) {
        canvas ??= document.createElement('canvas').getContext?.('2d') ?? false;
        let ascent = null;
        if (canvas) {
            canvas.font = font;
            ascent = canvas.measureText('Hg').fontBoundingBoxAscent;
        }
        ascents.set(font, Number.isFinite(ascent) ? ascent : 0.9 * parseFloat(cs.fontSize));
    }
    return ascents.get(font);
};

// an svg element of its attributes, none of null and ''
const svgEl = (name, attrs = {}) => {
    const e = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => {
        if (v != null && v !== '')
            e.setAttribute(k, v);
    });
    return e;
};

// the texts of ::before and ::after as spans of their styles while the
// copy is walked (it only sees nodes), returns the function which removes them
const pseudoElements = root => {
    const added = [];
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = '.vis-export-before::before, .vis-export-after::after { content: none !important; }';
    root.querySelectorAll('*').forEach(e => {
        if (e instanceof SVGElement)
            return;
        ['before', 'after'].forEach(which => {
            const ps = getComputedStyle(e, `::${which}`);
            const m = ps.content?.match(/^"(.*)"$/s);
            if (!m || ps.display == 'none')
                return;
            const span = document.createElement('span');
            for (const p of ps)
                span.style.setProperty(p, ps.getPropertyValue(p));
            span.style.content = 'normal';
            span.textContent = m[1].replace(/\\(.)/g, '$1');
            added.push({ e, which, span });
        });
    });
    added.forEach(({ e, which, span }) => {
        e.classList.add(`vis-export-${which}`);
        which == 'before' ? e.prepend(span) : e.append(span);
    });
    return () => {
        added.forEach(({ e, which, span }) => {
            span.remove();
            e.classList.remove(`vis-export-${which}`);
        });
        style.remove();
    };
};

/**
 * The SVG (a string) of `root`, the static copy of a visualisation in the
 * page: `box` is the rectangle of the image in client coordinates (by
 * default the one of the root, see partsBox of utils/export.js), `unit`
 * the unit of its width and height (`px`, `cm`, `mm` or `in`, the viewBox
 * is in CSS pixels), `width` the width asked for in CSS pixels, e.g. of
 * 16cm, which is the one of the attribute if the box has it (the layout
 * is in fractions of pixels). The background of the root is the one of the
 * image, e.g. of exportSvg, none if it has none.
 */
const composeSvg = (root, { box = root.getBoundingClientRect(), unit = 'px', width = null } = {}) => {
    if (!Object.hasOwn(units, unit))
        throw new Error(`Unknown unit of an SVG: ${unit}, expected one of ${Object.keys(units).join(', ')}.`);
    const restore = pseudoElements(root);
    try {
        return compose(root, box, unit, width);
    } finally {
        restore();
    }
};

const compose = (root, B, unit, asked) => {
    const size = v => unit == 'px' ? r2(v) : `${r3(v / units[unit])}${unit}`;
    const width = asked && Math.abs(asked - B.width) < 0.5 ? asked : B.width;
    const out = svgEl('svg', { version: '1.1', width: size(width), height: size(B.height), viewBox: `0 0 ${r2(B.width)} ${r2(B.height)}` });
    const defs = svgEl('defs');
    let clips = 0;
    const X = x => r2(x - B.left), Y = y => r2(y - B.top);
    const fillOf = (c, opacity) => {
        const p = parseColor(c);
        return { fill: p.value, 'fill-opacity': opacityOf(p.alpha * opacity) };
    };
    const strokeOf = (c, w, style, opacity) => {
        const p = parseColor(c);
        return { stroke: p.value, 'stroke-width': r2(w), 'stroke-opacity': opacityOf(p.alpha * opacity),
            'stroke-dasharray': style == 'dashed' ? '4 3' : style == 'dotted' ? '1 2' : null };
    };

    // the background and the borders of an element, of the root the
    // background of the whole image (of a part its rectangle)
    const background = (target, e, cs, opacity, isRoot) => {
        const own = e.getBoundingClientRect();
        const b = isRoot ? { left: B.left, top: B.top, width: B.width, height: B.height } : own;
        if (b.width == 0 || b.height == 0)
            return;
        const radius = isRoot ? 0 : parseFloat(cs.borderTopLeftRadius) || 0;
        let color = cs.backgroundColor;
        // a gradient of CSS as its first color
        if (transparent(color) && cs.backgroundImage.includes('gradient'))
            color = cs.backgroundImage.match(/rgba?\([^)]*\)/)?.[0] ?? null;
        if (!transparent(color))
            target.append(svgEl('rect', { x: X(b.left), y: Y(b.top), width: r2(b.width), height: r2(b.height),
                rx: radius ? r2(Math.min(radius, b.width / 2, b.height / 2)) : null, ...fillOf(color, opacity) }));
        // the borders at the element itself, of the root too
        const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => ({
            s, w: parseFloat(cs[`border${s}Width`]) || 0, c: cs[`border${s}Color`], style: cs[`border${s}Style`],
        })).filter(x => x.w > 0 && x.style != 'none' && x.style != 'hidden' && !transparent(x.c));
        if (sides.length == 4 && sides.every(x => x.w == sides[0].w && x.c == sides[0].c)) {
            const { w, c, style } = sides[0];
            target.append(svgEl('rect', { x: X(own.left + w / 2), y: Y(own.top + w / 2), width: r2(own.width - w), height: r2(own.height - w),
                rx: !isRoot && radius ? r2(radius) : null, fill: 'none', ...strokeOf(c, w, style, opacity) }));
        } else
            sides.forEach(({ s, w, c, style }) => {
                const [x1, y1, x2, y2] = s == 'Top' ? [own.left, own.top + w / 2, own.right, own.top + w / 2]
                    : s == 'Bottom' ? [own.left, own.bottom - w / 2, own.right, own.bottom - w / 2]
                    : s == 'Left' ? [own.left + w / 2, own.top, own.left + w / 2, own.bottom]
                    : [own.right - w / 2, own.top, own.right - w / 2, own.bottom];
                target.append(svgEl('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), ...strokeOf(c, w, style, opacity) }));
            });
    };

    // an outline of CSS, drawn above the content, e.g. a frame of a map
    const outline = (target, e, cs, opacity) => {
        const w = parseFloat(cs.outlineWidth) || 0;
        if (!w || cs.outlineStyle == 'none' || transparent(cs.outlineColor))
            return;
        const b = e.getBoundingClientRect();
        const d = (parseFloat(cs.outlineOffset) || 0) + w / 2;
        target.append(svgEl('rect', { x: X(b.left - d), y: Y(b.top - d), width: r2(b.width + 2 * d), height: r2(b.height + 2 * d),
            fill: 'none', ...strokeOf(cs.outlineColor, w, cs.outlineStyle, opacity) }));
    };

    // the lines of a text node, its words by the top of their rectangles, a
    // word broken at a hyphen by the ones of its characters
    const linesOf = node => {
        const range = document.createRange();
        const rects = (from, to) => {
            range.setStart(node, from);
            range.setEnd(node, to);
            return [...range.getClientRects()].filter(r => r.width > 0);
        };
        const lines = [];
        const add = (word, r) => {
            const line = lines.find(l => Math.abs(l.top - r.top) < 1);
            if (line)
                line.words.push(word);
            else
                lines.push({ top: r.top, left: r.left, words: [word] });
        };
        for (const m of node.data.matchAll(/\S+/g)) {
            const of = rects(m.index, m.index + m[0].length);
            if (of.length == 1)
                add(m[0], of[0]);
            else if (of.length > 1) {
                let part = null;
                [...m[0]].forEach((c, i) => {
                    const r = rects(m.index + i, m.index + i + 1)[0];
                    if (!r)
                        return;
                    if (part && Math.abs(part.r.top - r.top) < 1)
                        part.word += c;
                    else {
                        if (part)
                            add(part.word, part.r);
                        part = { word: c, r };
                    }
                });
                if (part)
                    add(part.word, part.r);
            }
        }
        return lines;
    };

    // a text node as a <text> per line, at the baseline of the line
    const text = (target, node, cs, opacity) => {
        if (!node.data.trim())
            return;
        const ascent = ascentOf(cs);
        const color = parseColor(cs.color) ?? { value: '#000000', alpha: 1 };
        linesOf(node).forEach(l => {
            const t = svgEl('text', {
                x: X(l.left), y: Y(l.top + ascent),
                fill: color.value, 'fill-opacity': opacityOf(color.alpha * opacity),
                'font-family': cs.fontFamily, 'font-size': unitless(cs.fontSize),
                'font-weight': cs.fontWeight != '400' ? cs.fontWeight : null,
                'font-style': cs.fontStyle != 'normal' ? cs.fontStyle : null,
                'font-variant': cs.fontVariantCaps != 'normal' ? cs.fontVariantCaps : null,
                'letter-spacing': cs.letterSpacing != 'normal' ? unitless(cs.letterSpacing) : null,
                'text-decoration': cs.textDecorationLine != 'none' ? cs.textDecorationLine : null,
            });
            t.setAttribute('xml:space', 'preserve');
            t.textContent = transformText(l.words.join(' '), cs.textTransform);
            target.append(t);
        });
    };

    // an svg element of the copy as a <g> at its position, its styles resolved
    const svg = (target, s, cs, opacity) => {
        // the content box (inside a border and a padding of CSS)
        const outer = s.getBoundingClientRect();
        if (outer.width == 0 || outer.height == 0)
            return;
        const px = p => parseFloat(cs[p]) || 0;
        const l = px('borderLeftWidth') + px('paddingLeft'), t = px('borderTopWidth') + px('paddingTop');
        const b = { left: outer.left + l, top: outer.top + t,
            width: outer.width - l - px('borderRightWidth') - px('paddingRight'),
            height: outer.height - t - px('borderBottomWidth') - px('paddingBottom') };
        const copy = s.cloneNode(true);
        const halos = [];
        const unpin = pinnedArrows(s);
        inlineSvg(s, copy, {}, baselineShifts(s), halos);
        unpin();
        // no script of the page in the file, e.g. of a slot (see scriptElement),
        // no images and no uses of other files, e.g. of a symbol of a legend
        [...copy.querySelectorAll('*')].filter(e => scriptElement(e.localName) || /^(?:image|feimage)$/i.test(e.localName)
            || (e.localName == 'use' && !(e.getAttribute('href') ?? e.getAttributeNS(xlink, 'href') ?? '').startsWith('#'))).forEach(e => e.remove());
        splitHalos(halos);
        const g = svgEl('g');
        // the opacity of the svg element itself is in the one of the walk
        [...copy.attributes].filter(a => a.name != 'opacity' && (a.name in inherited || a.name in own)).forEach(a => g.setAttribute(a.name, a.value));
        if (opacity < 1)
            g.setAttribute('opacity', r2(opacity));
        const vb = s.viewBox?.baseVal;
        const scaled = vb && vb.width && vb.height;
        g.setAttribute('transform', `translate(${X(b.left)} ${Y(b.top)})`
            + (scaled ? ` scale(${r3(b.width / vb.width)} ${r3(b.height / vb.height)}) translate(${-vb.x} ${-vb.y})` : ''));
        // a clip of the box of the svg element only if its content overflows
        // it (e.g. the regions of a map), not around every text
        const w = scaled ? vb.width : b.width, h = scaled ? vb.height : b.height;
        let bb = null;
        try { bb = s.getBBox(); } catch { /* not drawn */ }
        if (cs.overflow != 'visible' && bb && (bb.x < -1 || bb.y < -1 || bb.x + bb.width > w + 1 || bb.y + bb.height > h + 1)) {
            const id = `vis-export-clip-${++clips}`;
            const clip = defs.appendChild(svgEl('clipPath', { id }));
            clip.append(svgEl('rect', { x: scaled ? vb.x : 0, y: scaled ? vb.y : 0, width: r2(w), height: r2(h) }));
            g.appendChild(svgEl('g', { 'clip-path': `url(#${id})` })).append(...copy.childNodes);
        } else
            g.append(...copy.childNodes);
        target.append(g);
    };

    // the elements of the HTML in the order they are painted (without
    // z-index and positioned elements above the others), the controls
    // are not drawn
    const skipped = ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'SCRIPT', 'STYLE', 'TEMPLATE'];
    const walk = (target, e, opacity, isRoot) => {
        const cs = getComputedStyle(e);
        if (cs.display == 'none')
            return;
        const op = opacity * parseFloat(cs.opacity || 1);
        if (op == 0)
            return;
        const shown = cs.visibility != 'hidden';
        if (e instanceof SVGSVGElement) {
            if (shown) {
                background(target, e, cs, op, false);
                svg(target, e, cs, op);
                outline(target, e, cs, op);
            }
            return;
        }
        if (!(e instanceof HTMLElement) || skipped.includes(e.tagName))
            return;
        if (shown)
            background(target, e, cs, op, isRoot);
        e.childNodes.forEach(n => {
            if (n.nodeType == Node.TEXT_NODE && shown)
                text(target, n, cs, op);
            else if (n.nodeType == Node.ELEMENT_NODE)
                walk(target, n, op, false);
        });
        if (shown)
            outline(target, e, cs, op);
    };

    walk(out, root, 1, true);
    // the prefix of xlink:href (see inlineSvg) declared once, at the root
    if (out.querySelector('[href]'))
        out.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', xlink);
    // the serializer declares the namespace of the root (xmlns)
    if (defs.childNodes.length)
        out.prepend(defs);
    prefixIds(out);
    return new XMLSerializer().serializeToString(out);
};

// a short hash of a text (FNV-1a of 32 bits) in base 36
const hashOf = text => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++)
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
};

// the ids of an svg (e.g. of the clips and the gradients) and their
// references (url(#id) and href="#id") with a prefix of its content, so
// two files in one page do not draw the elements of each other (an
// url(#id) is the first element of the id in the page); the same content
// has the same prefix, an export of the same chart is the same file
const prefixIds = out => {
    const elements = [...out.querySelectorAll('[id]')];
    if (!elements.length)
        return;
    const prefix = `gv${hashOf(new XMLSerializer().serializeToString(out))}-`;
    const ids = new Set(elements.map(e => e.getAttribute('id')));
    const ref = id => ids.has(id) ? prefix + id : id;
    elements.forEach(e => e.setAttribute('id', prefix + e.getAttribute('id')));
    out.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => {
        const v = a.localName == 'href' && a.value.startsWith('#') ? `#${ref(a.value.slice(1))}`
            : a.value.replace(/url\((['"]?)#([^'")]+)\1\)/g, (m, q, id) => `url(${q}#${ref(id)}${q})`);
        if (v != a.value)
            a.value = v;
    }));
};
