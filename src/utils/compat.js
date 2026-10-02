export { upgradePlot };

// the stacked values of 0.9, e.g. "@y:st:e:scaled" is "@y:end:scaled"
const stackRefs = { s: 'start', e: 'end', h: 'height' };
const upgradeRef = v => typeof v == 'string' && v.startsWith('@')
    ? v.replace(/:st:([seh])(?=:|$)/g, (m, k) => `:${stackRefs[k]}`) : v;
const upgradeProps = props => Object.fromEntries(Object.entries(props).map(([k, v]) =>
    [k, v !== null && typeof v == 'object' && !Array.isArray(v) && !('prop' in v) ? upgradeProps(v) : upgradeRef(v)]));

const name = ref => typeof ref == 'string' ? ref.replace(/^@/, '') : ref;
const defined = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined));

/**
 * The plot types and props of 0.9 as the ones of 1.0, they still work, but
 * validateDef warns of them, `notes` are the changes. They might be removed
 * with 2.0.
 */
const upgradePlot = plot => {
    const notes = [];
    let p = plot;
    if (p.props) {
        const props = upgradeProps(p.props);
        if (JSON.stringify(props) != JSON.stringify(p.props))
            notes.push(`the stacked values are ':start', ':end' and ':height', e.g. "@y:end:scaled" instead of "@y:st:e:scaled"`);
        p = { ...p, props };
    }

    if (p.type == 'svg:path' || p.type == 'base:area') {
        const type = { 'svg:path': 'cartesian:line', 'base:area': 'cartesian:area' }[p.type];
        notes.push(`'${p.type}' is renamed to '${type}'`);
        p = { ...p, type };
    } else if (p.type == 'bar') {
        const { cx, height, ...props } = p.props ?? {};
        notes.push(`'bar' is renamed to 'cartesian:bar', its props 'cx' and 'height' to 'x' and 'y1'`);
        p = { ...p, type: 'cartesian:bar', props: defined({ ...props, x: cx, y1: height }) };
    } else if (p.type == 'stackedBar') {
        const { x, y, ...props } = p.props ?? {};
        notes.push(`'stackedBar' is 'cartesian:bar' with the props "x": "@${name(x)}:scaled", "y0": "@${name(y)}:start:scaled" and "y1": "@${name(y)}:end:scaled"`);
        p = { ...p, type: 'cartesian:bar', props: defined({
            ...props,
            x: x === undefined ? undefined : `@${name(x)}:scaled`,
            y0: y === undefined ? undefined : `@${name(y)}:start:scaled`,
            y1: y === undefined ? undefined : `@${name(y)}:end:scaled`,
        }) };
    }
    return { plot: p, notes };
};
