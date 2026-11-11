// the plot area is a circle in the center of the facet, the angle (clockwise
// from the top) and the radius are the positions. The axes, the annotations,
// the hover and the mark types (polar:line, ...) are loaded with the first
// polar plot, see coords/polar-plot.js and loadCoord of coords/index.js.
import { lazy } from '@/utils/lazy';
import { markTypes } from '@/marks';

const tau = 2*Math.PI;

export default {
    ranges: { angular: [0, tau], radial: [0, "@radius"] },
    cyclic: ['angular'],
    axis: { h: 'angular', v: 'radial' },
    // a stacked angle is the one of the values, e.g. of a pie, see axisNames of layout.js
    flip: 'stacked',
    // the plots are a circle in the center of the facet, its title is centered above it
    centered: true,
    positions: ['angular', 'radial'],
    dims: (width, height) => ({ width, height, radius: Math.min(width, height)/2 }),
    origin: (width, height) => [width/2, height/2],
    annotations: ['band', 'line', 'text', 'circle'],
    load: () => lazy.polar().then(m => {
        Object.assign(markTypes, m.markTypes);
        return m;
    }),
};
