import * as pu from "@/utils/plot";
import * as ju from "@/utils/json";
import { pointwise } from "@/plots/elements";

// the scale of a prop of a bar, e.g. of "@x:scaled"
const barScale = (info, prop, type) => {
    const scale = info[prop?.parts?.[0]]?.scale;
    if (!scale)
        throw new Error(`${type}: the positions need a scaled value, e.g. "@x:scaled"`);
    return scale;
};

// the default width of the bars of a categorical scale
const barWidth = (scale, type) => {
    if (!scale.step)
        throw new Error(`${type}: a 'width' is needed for a continuous horizontal scale`);
    return scale.bandwidth() || scale.step()*(1 - scale.padding());
};

// the bars are centered at their category, in the middle of a band
export default {
    // negative values are drawn downwards from 0
    bar: {
        coords: ['cartesian'],
        render: (groups, parent, plotDef, { info }) => pointwise(groups, parent, "rect", v => {
            const yZero = barScale(info, v.height, 'bar')(0);
            const xScale = barScale(info, v.cx, 'bar');

            v.width ??= ju.entryToProp(barWidth(xScale, 'bar'));

            v.x = ju.entryToProp(v.cx.value + pu.bandCenter(xScale) - v.width.value/2);
            delete v.cx;

            v.y = ju.entryToProp(Math.min(v.height.value, yZero));
            v.height = ju.entryToProp(Math.abs(yZero - v.height.value));
            return v;
        }),
    },

    stackedBar: {
        coords: ['cartesian'],
        render(groups, parent, plotDef, { info }) {
            groups.forEach(g => {
                const x = g.props["x"].ref;
                const y = g.props["y"].ref;
                g.props["x"] = ju.entryToProp(`@${x}:scaled`);
                g.props["y"] = ju.entryToProp(`@${y}:st:e:scaled`);

                g.props["height"] = ju.entryToProp(`@${y}:st:h:scaled`);

                const xScale = barScale(info, g.props.x, 'stackedBar');
                g.props.width ??= ju.entryToProp(barWidth(xScale, 'stackedBar'));
                g.props["transform"] = ju.entryToProp(`translate(${pu.bandCenter(xScale) - g.props.width.value/2} 0)`);
            });
            pointwise(groups, parent, "rect", v => {
                if (v.height.value < 0) {
                    v.y.value += v.height.value;
                    v.height.value = -v.height.value;
                }
                return v;
            });
        },
    },
};
