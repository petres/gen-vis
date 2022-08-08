export { addScale, setProps, setGroupData };

import * as d3 from "d3";
import * as ju from "@/utils/json.js";
import * as du from "@/utils/data.js";
import * as eu from "@/utils/else.js";

const addScale = (info, dims) => {
    const scaleDef = info.mapping.scale;

    const s = d3[`scale${eu.capitalize(scaleDef.type)}`]()

    if (!Array.isArray(scaleDef.range)) {
        if (scaleDef.range == "horizontal") {
            scaleDef.range = [0, "@width"];
        } else if (scaleDef.range == "vertical") {
            scaleDef.range = ["@height", 0];
        }
    }
    s.range(ju.fillDirect(scaleDef.range, dims))
    // console.log(s.range())
    if (info.extent) {
        info.domain = [...scaleDef.domain];

        info.domainRel = [...(scaleDef.domainRel ? scaleDef.domainRel : [0, 0])];
        info.domainAbs = scaleDef.domainAbs;

        info.domain[0] ??= info.extent[0];
        info.domain[1] ??= info.extent[1];

        const da = info.domain[1] - info.domain[0];
        info.domain[0] += da*info.domainRel[0];
        info.domain[1] += da*info.domainRel[1];

        info.domain[0] += info.domainAbs[0];
        info.domain[1] += info.domainAbs[1];

        s.invertCustom = (v) => {
            const index = d3.bisectCenter(info.values, s.invert(v));
            // console.log(info.values)
            return info.values[index];
        }

    } else {
        info.domain = info.values;
        scaleDef.padding ??= 0.4
        // s.paddingInner(scaleDef.padding);
        s.padding(scaleDef.padding);
        // s.paddingOuter(scaleDef.padding/2);
        s.invertCustom = (v) => {
          const index = Math.floor(v / s.step());
          return s.domain()[Math.max(0,Math.min(index, s.domain().length-1))];
        }
    }

    // console.log(info)
    // console.log(`scale${eu.capitalize(scaleDef.type)}`)

    s.domain(info.domain)


    info.scale = s;
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
