// the default props of the built-in plot types, the `defaults` of the types
// (see plots/index.js), of a plot whose type has no prefix of a coordinate
// system, e.g. "line", see utils/normalize.js, a definition writes only the
// props which differ, null removes one. A position is the one of the
// mappings x and y, the color of a plot without categories the one of the text.
const color = { or: ['@color', 'currentColor'] };

export const defaults = {
    'cartesian:line': { stroke: color, fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } },
    'cartesian:area': { fill: color, d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } },
    // a horizontal bar with `x1`, otherwise a vertical one
    'cartesian:bar': props => props && 'x1' in props
        ? { fill: color, x1: '@x:scaled', y: '@y:scaled' }
        : { fill: color, x: '@x:scaled', y1: '@y:scaled' },
    'svg:circle': { cx: '@x:scaled', cy: '@y:scaled', r: 3, fill: color },
    'svg:text': { x: '@x:scaled', y: '@y:scaled', fill: '@color' },
    'polar:line': { stroke: color, fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } },
    'polar:area': { fill: color, d: { angle: '@x:scaled', innerRadius: '@y:scaled:0', outerRadius: '@y:scaled' } },
    'polar:arc': { fill: color },
    'polar:circle': { angle: '@x:scaled', radius: '@y:scaled', r: 3, fill: color },
    'polar:text': { angle: '@x:scaled', radius: '@y:scaled', fill: '@color' },
};
