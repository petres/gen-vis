export { scale, axis, setProps };

import * as d3 from "d3";
import * as ju from "@/utils/json.js";
import * as du from "@/utils/data.js";
import * as eu from "@/utils/else.js";

const scale = (i, constants, vf) => {
    // console.log(i)
    i.domain ??= [null, null];
    if (i.domain.includes(null)) {
        const e = d3.extent(vf());
        i.domain[0] ??= e[0];
        i.domain[1] ??= e[1];
    }

    return d3[`scale${eu.capitalize(i.type)}`]()
        .domain(i.domain)
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
