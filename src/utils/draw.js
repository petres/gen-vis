export { curves, setProps, setGroupData, highlighter, rowOf };

import * as d3 from "@/utils/d3";

// the interpolations of the paths and areas between their points, `monotoneX`
// is smooth without overshooting the values, e.g. for monthly data
const curves = {
    linear: d3.curveLinear,
    monotoneX: d3.curveMonotoneX,
    natural: d3.curveNatural,
    catmullRom: d3.curveCatmullRom,
    basis: d3.curveBasis,
    step: d3.curveStep,
    stepBefore: d3.curveStepBefore,
    stepAfter: d3.curveStepAfter,
    // closed, e.g. around the circle of polar plots
    linearClosed: d3.curveLinearClosed,
    catmullRomClosed: d3.curveCatmullRomClosed,
    basisClosed: d3.curveBasisClosed,
};

// the values of props as the attributes of an element, `text` is its text,
// objects are nested props, e.g. `d` of a line, null removes an attribute
const setProps = function(values) {
    const e = d3.select(this);
    for (const [k, v] of Object.entries(values)) {
        if (v !== null && (typeof v == 'object' || typeof v == 'function'))
            continue;
        if (k == "text")
            e.text(v);
        else
            e.attr(k, v);
    }
};

// the keys of the categories of the group of an element, e.g. for the highlight
const setGroupData = function(g) {
    const element = d3.select(this);
    Object.entries(g.categories).forEach(([dim, key]) => element.attr(`data-group-${dim}`, key));
};

// the row of an element per row, a symbol, so it is not an attribute
const rowOf = Symbol('row');

/**
 * The highlight of the elements of a facet: the highlight- props of the
 * plots replace the props of the elements of the categories of a row, e.g.
 * of the hover or of an entry of a legend, their values are kept in
 * default- attributes. With `"highlight": "row"` only the element of the
 * row is highlighted, e.g. the segment of a stacked bar, if it has one.
 * The groups of the plots (the elements with the keys of their categories
 * as data-group- attributes) and their elements with highlight- props are
 * found once, at the first highlight, so a highlight does not search the
 * elements of the facet. `inner` is the element of the plots.
 */
const highlighter = (inner, plotDefs) => {
    const plots = plotDefs.filter(p => p.highlightProps.length > 0 && p.categories.length > 0);
    let index = null;
    // the highlighted groups and elements
    let groups = [];
    let elements = [];

    const build = () => plots.map(plot => {
        // the ids are compared directly, they are not part of a selector, so
        // they can contain any character, e.g. spaces
        const node = [...inner.children].find(c => c.getAttribute('data-plot') === plot.id);
        const attrs = plot.categories.map(c => `data-group-${c}`);
        return {
            plot,
            groups: node ? [...node.querySelectorAll('*')].filter(g => attrs.some(a => g.hasAttribute(a))).map(node => ({
                node,
                keys: Object.fromEntries(plot.categories.map((c, i) => [c, node.getAttribute(attrs[i])])),
                targets: null,
            })) : [],
        };
    });

    // the path of a group or its elements per row with highlight- props, e.g. circles
    const targetsOf = (plot, group, dataEntry) => {
        group.targets ??= [group.node, ...group.node.querySelectorAll('*')]
            .filter(node => plot.highlightProps.some(n => node.hasAttribute(`highlight-${n}`)));
        if (plot.highlight != 'row')
            return group.targets;
        const rows = group.targets.filter(node => node.__data__?.[rowOf] === dataEntry);
        return rows.length > 0 ? rows : group.targets;
    };

    return dataEntry => {
        groups.forEach(node => node.classList.remove('vis-highlight'));
        elements.forEach(({ node, props }) => {
            node.classList.remove('vis-highlight');
            props.forEach(n => {
                const value = node.getAttribute(`default-${n}`);
                if (value === null)
                    node.removeAttribute(n);
                else
                    node.setAttribute(n, value);
                node.removeAttribute(`default-${n}`);
            });
        });
        groups = [];
        elements = [];
        if (!dataEntry)
            return;

        index ??= build();
        index.forEach(({ plot, groups: all }) => {
            // the values are compared as strings, as the ones of the attributes
            const conditions = plot.categories.filter(c => c in dataEntry).map(c => [c, String(dataEntry[c])]);
            if (conditions.length == 0)
                return;
            all.filter(g => conditions.every(([c, v]) => g.keys[c] === v)).forEach(g => {
                g.node.classList.add('vis-highlight');
                g.node.parentNode.appendChild(g.node);
                groups.push(g.node);
                targetsOf(plot, g, dataEntry).forEach(node => {
                    node.classList.add('vis-highlight');
                    plot.highlightProps.forEach(n => {
                        const value = node.getAttribute(n);
                        const highlight = node.getAttribute(`highlight-${n}`);
                        if (value !== null)
                            node.setAttribute(`default-${n}`, value);
                        if (highlight === null)
                            node.removeAttribute(n);
                        else
                            node.setAttribute(n, highlight);
                    });
                    elements.push({ node, props: plot.highlightProps });
                });
            });
        });
    };
};
