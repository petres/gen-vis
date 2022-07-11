export { scale, axis, setAttrs };

import * as d3 from "d3";

const scale = (i, vg) => {
    i.domain ??= [null, null];
    if (i.domain.includes(null)) {
        const e = d3.extent(vg());
        i.domain[0] ??= e[0];
        i.domain[1] ??= e[1];
    }
    return d3.scaleLinear()
        .domain(i.domain)
};

const axis = (i, scale) => {
    const a = d3.axisBottom(scale);
    if (i.ticks) a.ticks(i.ticks);
    return a;
};

const setAttrs = function(d) {
    const e = d3.select(this);
    for (const [key, value] of Object.entries(d.a)) {
        e.attr(key, value);
    }
}
