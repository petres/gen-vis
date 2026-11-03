export { rect, placeLine };

import { create } from "@/utils/dom";

// the elements of the hover of the coordinate systems, see `hover` of
// coords/index.js

// a new rect of the size `width` and `height`, at `x` and `y` if they are
// given, e.g. the area of the pointer events
const rect = (width, height, x, y) => {
    const node = create("rect");
    if (x !== undefined) {
        node.setAttribute("x", x);
        node.setAttribute("y", y);
    }
    node.setAttribute("width", width);
    node.setAttribute("height", height);
    return node;
};

// the marker line from `x1`, `y1` to `x2`, `y2`, without a position
// (null) no line
const placeLine = (line, x1, y1, x2, y2) => {
    if (x1 === null) {
        line.removeAttribute("x1");
        line.removeAttribute("x2");
        line.removeAttribute("y1");
        line.removeAttribute("y2");
        return;
    }
    line.setAttribute("x1", x1);
    line.setAttribute("x2", x2);
    line.setAttribute("y1", y1);
    line.setAttribute("y2", y2);
};
