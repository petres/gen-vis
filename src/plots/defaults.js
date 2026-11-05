// the default props of the built-in plot types, the `defaults` of the types
// (see plots/index.js), of the plots of the type, "line" and
// "cartesian:line" alike, see utils/normalize.js, a definition writes only
// the props which differ, null removes one. A position is the one of the
// mappings x and y, the color of a plot without categories the one of the text.
const color = { or: ['@color', 'currentColor'] };

export const defaults = {
    // stairs with `x0` and `x1` of `d`, e.g. the classes of a bin, without an `x`
    'cartesian:line': props => props?.d && typeof props.d == 'object' && ('x0' in props.d || 'x1' in props.d)
        ? { stroke: color, fill: 'none', d: { y: '@y:scaled' } }
        : { stroke: color, fill: 'none', d: { x: '@x:scaled', y: '@y:scaled' } },
    // filled stairs with `x0` and `x1` of `d`, without an `x`
    'cartesian:area': props => props?.d && typeof props.d == 'object' && ('x0' in props.d || 'x1' in props.d)
        ? { fill: color, d: { y0: '@y:scaled:0', y1: '@y:scaled' } }
        : { fill: color, d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } },
    // a horizontal bar with `x1`, a vertical one from `x0` to `x1` with `x1`
    // and `y1` (e.g. the classes of a bin, with crisp edges, so neighbours
    // meet without a seam also in a scaled image), otherwise a vertical one
    'cartesian:bar': props => props && 'x1' in props && 'y1' in props ? { fill: color, 'shape-rendering': 'crispEdges' }
        : (props && 'x1' in props ? { fill: color, x1: '@x:scaled', y: '@y:scaled' }
            : { fill: color, x: '@x:scaled', y1: '@y:scaled' }),
    // vertical at `x`, horizontal at `y` without an `x`
    'cartesian:rule': props => props && 'y' in props && !('x' in props) ? { stroke: color, y: '@y:scaled' } : { stroke: color, x: '@x:scaled' },
    'svg:circle': { cx: '@x:scaled', cy: '@y:scaled', r: 3, fill: color },
    'svg:text': { x: '@x:scaled', y: '@y:scaled', fill: '@color' },
    'polar:line': { stroke: color, fill: 'none', d: { angle: '@x:scaled', radius: '@y:scaled' } },
    'polar:area': { fill: color, d: { angle: '@x:scaled', innerRadius: '@y:scaled:0', outerRadius: '@y:scaled' } },
    'polar:arc': { fill: color },
    'polar:circle': { angle: '@x:scaled', radius: '@y:scaled', r: 3, fill: color },
    'polar:text': { angle: '@x:scaled', radius: '@y:scaled', fill: '@color' },
};
