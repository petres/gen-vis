export { scale, axis, setProps, setGroupData };

import * as d3 from "d3";
import * as ju from "@/utils/json.js";
import * as du from "@/utils/data.js";
import * as eu from "@/utils/else.js";

const scale = (i, info, constants) => {
    // console.log(i)
    info.domain = [...(i.domain ? i.domain : [null, null])];
    info.domainRel = [...(i.domainRel ? i.domainRel : [0, 0])];
    info.domainAbs = [...(i.domainAbs ? i.domainAbs : [0, 0])];

    info.domain[0] ??= info.extent[0];
    info.domain[1] ??= info.extent[1];

    const da = info.domain[1] - info.domain[0];
    info.domain[0] += da*info.domainRel[0];
    info.domain[1] += da*info.domainRel[1];

    info.domain[0] += info.domainAbs[0];
    info.domain[1] += info.domainAbs[1];

    // console.log(info)
    // console.log(info.domain)

    return d3[`scale${eu.capitalize(i.type)}`]()
        .domain(info.domain)
        .range(ju.fill(i.range, constants))
};

const axis = (i, scale) => {
    const a = d3.axisBottom(scale);
    if (i.ticks) a.ticks(i.ticks);
    return a;
};

const setProps = function(d) {
    const e = d3.select(this);
    for (const [key, value] of Object.entries(d)) {
        if (value instanceof Object)
            continue;
        // console.log([key, value])
        if (key == "text") {
            e.text(value);
            continue;
        }
        e.attr(key, value);
    }
}

const setGroupData = function(d) {
    const element = d3.select(this);
    // console.log(d)
    d.group.forEach(e => {
        element.attr(`data-group-${e.dim}`, e.key)
    });

    d.group.forEach(e => {
        element.attr(`data-visible-${e.dim}`, e.visible)
    });

    element.attr(`data-visible`, d.group.reduce((s, e) => s && e.visible, true))

    // for (const [key, value] of Object.entries(d)) {
    //     if (value instanceof Object)
    //         continue;
    //     // console.log([key, value])
    //     if (key == "text") {
    //         e.text(value);
    //         continue;
    //     }
    //     e.attr(key, value);
    // }
}
