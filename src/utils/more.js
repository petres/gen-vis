// the scales and curves few definitions name, loaded for the ones which do
// (see loadMore of utils/d3.js and requirements of utils/load.js), their
// names are known before, see scaleNames and curveNames of utils/d3.js
import {
    scaleDiverging, scaleDivergingLog, scaleDivergingPow, scaleDivergingSqrt, scaleDivergingSymlog, scaleIdentity,
    scaleQuantile, scaleQuantize, scaleRadial, scaleSequentialLog, scaleSequentialPow, scaleSequentialQuantile,
    scaleSequentialSqrt, scaleSequentialSymlog, scaleSymlog,
} from 'd3-scale';
import { curveBasis, curveBasisClosed, curveCatmullRom, curveCatmullRomClosed, curveNatural } from 'd3-shape';

export const scales = {
    diverging: scaleDiverging, divergingLog: scaleDivergingLog, divergingPow: scaleDivergingPow, divergingSqrt: scaleDivergingSqrt,
    divergingSymlog: scaleDivergingSymlog, identity: scaleIdentity, quantile: scaleQuantile, quantize: scaleQuantize, radial: scaleRadial,
    sequentialLog: scaleSequentialLog, sequentialPow: scaleSequentialPow, sequentialQuantile: scaleSequentialQuantile,
    sequentialSqrt: scaleSequentialSqrt, sequentialSymlog: scaleSequentialSymlog, symlog: scaleSymlog,
};
export const curves = {
    natural: curveNatural, catmullRom: curveCatmullRom, basis: curveBasis, catmullRomClosed: curveCatmullRomClosed, basisClosed: curveBasisClosed,
};
