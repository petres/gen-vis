export { publicType };

// The context of the mark types of a page (registerMarkType) is the one of
// the facet with a store of its own: the parts of the store which are for
// them, read-only, so the store of the package can change without them, and
// a mark type can not change a chart behind the draw. See docs/extensions.md.

const fail = () => { throw new TypeError('the store of a mark type is read-only'); };
const plain = v => v !== null && typeof v == 'object' && [Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(v));
const views = new WeakMap();
// a view of an object of the definition which can not be written, its
// objects and lists are views as well; frozen objects are themselves
const handler = {
    get(target, key) {
        const v = Reflect.get(target, key);
        return plain(v) && !Object.isFrozen(target) ? readOnly(v) : v;
    },
    set: fail, defineProperty: fail, deleteProperty: fail, setPrototypeOf: fail, preventExtensions: fail,
};
const readOnly = v => {
    if (!plain(v) || Object.isFrozen(v))
        return v;
    if (!views.has(v))
        views.set(v, new Proxy(v, handler));
    return views.get(v);
};

// the store of the mark types: the prepared definition (`def`), a dim by
// its name (`dim`), the props of a category of one (`prop`), the formatter
// of a d3 format or of the format of a dim (`format`), a text with the values
// of the globals (`text`), the formatters of the locale (`locale`), all rows
// (`rows`, never changed, as everywhere) and the names of the references of
// the chart (`scope`)
const stores = new WeakMap();
const publicStore = store => {
    if (!stores.has(store))
        stores.set(store, Object.freeze({
            get def() { return readOnly(store.def); },
            get rows() { return store.rows; },
            get locale() { return store.locale; },
            get scope() { return store.scope; },
            dim: name => readOnly(store.dim(name)),
            prop: (name, key) => readOnly(store.prop(name, key)),
            format: (format, name) => store.format(format, name),
            text: text => store.text(text),
        }));
    return stores.get(store);
};

// the context of a facet with the store of the mark types, it can not be
// written either, its other parts are the ones of the facet
const publicContext = ctx => Object.freeze({ ...ctx, store: publicStore(ctx.store) });

// a mark type of a page: its functions get the context above
const publicType = type => ({ ...type, marks: (groups, mark, ctx) => type.marks(groups, mark, publicContext(ctx)) });
