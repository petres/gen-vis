export { createStore, resolveUrl, resolveParents, clearCache };

import { reactive, markRaw, toRaw } from 'vue';

import { addDataValues, dataFormat, distinctValues, parseData, prepareData, updateData, usedColumns } from "@/utils/data";
import { applyTransforms, loadTransforms, transformGlobals, utcColumns } from "@/utils/transform";
import { applyFormElements, fillHtml, fillText, formatOf, mergeAll, prepareDef } from "@/utils/def";
import { applyState, diffState, snapshot } from "@/utils/state";
import { getLocale, loadLocale } from "@/utils/locale";
import { formatter } from "@/utils/props";
import { loadCoord } from "@/coords";
import { axisNames } from "@/layout";
import { loadColors, loadTransition } from "@/utils/d3";
import { lazy } from "@/utils/lazy";

// relative urls are resolved against `base`, e.g. the url of the def referencing them
const resolveUrl = (url, base = document.baseURI) => new URL(url, base).href;

// requests of the last minutes are shared, e.g. the parents of the charts of a
// page or a csv of two charts, later ones load again, e.g. for updated data,
// the content is not kept longer, e.g. after the charts of a page are removed
const cacheTime = 5 * 60 * 1000;
const cache = new Map();
const clearCache = () => {
    cache.forEach(c => clearTimeout(c.timer));
    cache.clear();
};

// the content of a url, `type` is text or arrayBuffer, e.g. of parquet data
const request = async (url, type) => {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
    return response[type]();
};

const fetchCached = (url, type = 'text') => {
    const key = `${type} ${url}`;
    if (!cache.has(key)) {
        const forget = entry => {
            if (cache.get(key) === entry) {
                clearTimeout(entry.timer);
                cache.delete(key);
            }
        };
        const entry = {};
        entry.content = request(url, type).catch(error => {
            // failed requests are not kept
            forget(entry);
            throw new Error(`Could not load '${url}': ${error.message}`);
        });
        entry.timer = setTimeout(() => forget(entry), cacheTime);
        // the timer does not keep a script of node running, e.g. a check
        entry.timer.unref?.();
        cache.set(key, entry);
    }
    return cache.get(key).content;
};

const fetchText = url => fetchCached(url);

// parquet is binary, the other formats are text
const fetchData = (url, format) => fetchCached(url, format == 'parquet' ? 'arrayBuffer' : 'text');

const parseDef = (text, source, what = 'definition') => {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in ${what} ${source}: ${error.message}`);
    }
};

// merges def with its parents, a parent url is relative to the def referencing
// it. A list of parents (mixins) is merged in its order, later ones override
// earlier ones. A parent shared by several mixins is merged once, before the
// first one using it, so it does not override the mixins in between. The
// parents of a def are requested at once, but merged in their order.
const resolveParents = async (def, url, load = fetchText) => {
    const parts = [];
    const included = new Set();
    const add = async (def, url, ancestors) => {
        const parents = [def.parent ?? []].flat().map(p => resolveUrl(p, url));
        const texts = new Map(parents.filter(u => !included.has(u)).map(u => [u, Promise.resolve().then(() => load(u))]));
        // errors are thrown in the order of the parents, not as unhandled ones
        texts.forEach(t => t.catch(() => {}));
        for (const parentUrl of parents) {
            if (ancestors.includes(parentUrl))
                throw new Error(`Cyclic parent definition '${parentUrl}'`);
            if (included.has(parentUrl))
                continue;
            included.add(parentUrl);
            await add(parseDef(await texts.get(parentUrl), `'${parentUrl}'`), parentUrl, [...ancestors, parentUrl]);
        }
        parts.push(def);
    };
    await add(def, url, []);
    return mergeAll(parts);
};

// the rows of data, errors name its url (`source`)
const readData = async (data, format, source, columns = null) => {
    try {
        return await parseData(data, format, columns);
    } catch (error) {
        throw new Error(`Could not read the data ${source}: ${error.message}`);
    }
};

// the rows are not made reactive, they can be large and are only replaced as a whole
const raw = rows => markRaw(Array.from(toRaw(rows)));

// the check of the definitions, loaded with the first one, together with its
// parents, a definition is drawn without it if it could not be loaded
let validator = null;
const loadValidator = () => validator ??= lazy.validate().catch(() => {
    validator = null;
    return null;
});

// see Store.init, urls of inline defs are relative to the page
const load = async ({ def = null, defUrl = null, data = null, state = null }) => {
    const checks = loadValidator();
    let url;
    if (def === null) {
        url = resolveUrl(defUrl);
        def = parseDef(await fetchText(url), `'${url}'`);
    } else if (typeof def == 'string') {
        def = parseDef(def, 'attribute');
    }

    // the data and the geometry are requested together with the parents, if the
    // def names them, the data if its format is known, it can be the one of a parent
    if (data === null && typeof def.data == 'string' && !def.data.includes('{')) {
        const dataUrl = resolveUrl(def.data, url);
        const format = dataFormat(dataUrl, def.dataFormat);
        if (format !== undefined || def.parent === undefined)
            fetchData(dataUrl, format).catch(() => {});
    }
    if (typeof def.geo?.data == 'string')
        fetchText(resolveUrl(def.geo.data, url)).catch(() => {});

    const defOrg = await resolveParents(JSON.parse(JSON.stringify(def)), url);
    (await checks)?.validateDef(defOrg).forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));
    // the colors of d3 are only loaded if the mappings name one, also the
    // patches of form elements, and the parts of the coordinate system, e.g.
    // of maps, with the data
    const parts = Promise.all([
        /"(scheme|interpolator)":/.test(JSON.stringify([defOrg.mapping, defOrg.formElements])) ? loadColors() : null,
        loadCoord(defOrg.options?.coord),
        defOrg.geo?.data ? lazy.geo() : null,
        defOrg.options?.transition ? loadTransition() : null,
        defOrg.transform ? loadTransforms() : null,
        // the legend of a scale of colors, a mapping with a legend without props, also of a patch
        [defOrg.mapping, ...(defOrg.formElements ?? []).flatMap(e => Array.isArray(e?.values) ? e.values.map(v => v?.mapping) : [])]
            .some(ms => Object.values(ms ?? {}).some(m => m?.legend && !m.props)) ? lazy.colorLegend() : null,
        loadLocale(defOrg.options?.locale ?? undefined),
    ]);
    parts.catch(() => {});
    // the format of the data, by default the one of the extension of its url
    let format = defOrg.dataFormat;
    let source = 'of the attribute';
    if (data === null) {
        if (!defOrg.data)
            throw new Error('No data given, neither in the definition nor as attribute.');
        const dataUrl = resolveUrl(defOrg.data, url);
        format = dataFormat(dataUrl, format);
        data = await fetchData(dataUrl, format);
        source = `'${dataUrl}'`;
    }
    // parquet is read in the columns which are used
    const rows = raw(await readData(data, format, source, usedColumns(defOrg)));

    const [, coord, geoModule, , , colorLegend] = await parts;

    // the columns of the transforms, the form elements can have their values
    let columns = applyTransforms(rows, defOrg.transform, defOrg.globals, utcColumns(defOrg));

    // the form elements can have the values of the data, the state needs them
    addDataValues(defOrg, rows, columns);
    const keysOf = column => distinctValues(rows, columns, column).map(String);
    const prepared = prepareDef(JSON.parse(JSON.stringify(defOrg)), keysOf);

    // the data of plots of their own, e.g. events, the url relative to the def,
    // the rows are not evaluated as the ones of the definition, see layout.js
    await Promise.all(prepared.plot.filter(p => typeof p.data == 'string').map(async p => {
        const dataUrl = resolveUrl(p.data, url);
        const format = dataFormat(dataUrl, p.dataFormat);
        p.data = raw(await readData(await fetchData(dataUrl, format), format, `'${dataUrl}'`));
        p.loaded = true;
    }));
    const defaults = snapshot(prepared);
    applyState(prepared, state);
    // the mappings of the globals of the state, the entries of their legends
    // of the state, e.g. of the categories of another column
    applyFormElements(prepared, defOrg, keysOf);
    applyState(prepared, { visible: state?.visible });
    // the transforms of the globals of the form elements and the state
    if (transformGlobals(prepared.transform).length > 0)
        columns = applyTransforms(rows, prepared.transform, prepared.globals, utcColumns(prepared), columns);

    // the features of a map, see coords/geo.js, the url of GeoJSON or TopoJSON or itself
    let geo = null;
    if (defOrg.geo?.data) {
        let json = defOrg.geo.data;
        if (typeof json == 'string') {
            const geoUrl = resolveUrl(json, url);
            json = parseDef(await fetchText(geoUrl), `'${geoUrl}'`, 'geometry');
        }
        const { geoFeatures, geoKey } = geoModule;
        const key = geoKey(defOrg.geo.key ?? 'id');
        // only the features of `include`, without the ones of `exclude`, they are not drawn at all
        const include = defOrg.geo.include && new Set(defOrg.geo.include.map(String));
        const exclude = new Set((defOrg.geo.exclude ?? []).map(String));
        const features = geoFeatures(json, defOrg.geo.object)
            .filter(f => (!include || include.has(key(f))) && !exclude.has(key(f)));
        // the projections of the facets, see coords/geo.js
        geo = markRaw({ features, key, byKey: new Map(features.map(f => [key(f), f])), projections: new Map() });
    }

    return {
        defUrl: url ?? null,
        defOrg,
        locale: markRaw(getLocale(defOrg.options?.locale)),
        colorLegend: colorLegend ? markRaw(colorLegend.default) : null,
        coord: markRaw(coord),
        geo,
        rows,
        columns: markRaw(columns),
        def: prepared,
        defaults,
        data: raw(prepareData(rows, prepared, columns)),
    };
};

class Store {
    defUrl = null;
    defOrg = null;
    locale = null;
    coord = null;
    geo = null;
    def = null;
    rows = null;
    // the columns of the transforms, see utils/transform.js
    columns = null;
    data = null;
    defaults = null;
    // the width of the visualisation, set by its measure
    totalWidth = null;
    runs = 0;
    // the number of the definitions loaded, a new one is drawn anew, while it
    // is loaded the one before is shown, see App.vue
    loads = 0;
    loading = false;
    // incremented if the state is set from outside, the components update
    stateSets = 0;
    // the categories of the data of the last column, see dataKeys
    keyCache = null;
    // the component of the legends of scales of colors, loaded for definitions with one
    colorLegend = null;

    get loaded() { return this.def !== null && this.data !== null }

    // the changes of the user compared to the definition, see utils/state.js
    get state() { return this.loaded ? diffState(snapshot(this.def), this.defaults) : null }

    // the names of the mappings of the positions (h) and of the values (v) of
    // the hover and the stacks, see layout.js
    get axis() { return axisNames(this) }

    // the format of the values of a mapping in the hover and in labels: its
    // own, the one of its axis or the default of the locale, `scale` is the
    // one of the facet, see valueFormat of utils/locale.js
    valueFormat(n, scale) {
        const m = this.def.mapping[n];
        const format = formatOf(m, 'hover');
        return format ? this.format(format, n) : this.locale.valueFormat(m, scale);
    }

    // the names of the references in all parts of the definition, the globals
    // and the width of the visualisation, a facet adds its sizes, a plot the
    // props of the categories and the row, see README "Props"
    get scope() { return { ...this.def.globals, totalWidth: this.totalWidth, [formatter]: (format, name) => this.format(format, name) } }

    // a d3 format in the locale of the values of a mapping, of times if it is
    // a mapping of dates or of a time scale, e.g. "%Y", local or UTC of a
    // `utc` scale, of numbers otherwise, see also the prop format of
    // utils/props.js
    format(format, name) {
        const m = Object.hasOwn(this.def.mapping, name) ? this.def.mapping[name] : undefined;
        const type = m?.scale?.type;
        if (type == 'utc')
            return this.locale.time.utcFormat(format);
        if (type == 'time' || m?.type == 'date')
            return this.locale.time.format(format);
        return this.locale.number.format(format);
    }

    mapping(n) { return this.def.mapping[n] }

    // a text of the definition with the values of the globals, e.g. "{base} = 100"
    text(t) { return fillText(t, this.def.globals) }
    // html of the definition, e.g. the footer, with the values of the globals
    // as text, they can be values of the data, e.g. of a form element
    html(t) { return typeof t == 'string' ? fillHtml(t, this.def.globals) : t }
    // the props of a category, e.g. of a value of the data, undefined for other values
    prop(n, k) { const props = this.def.mapping[n].props; return Object.hasOwn(props, k) ? props[k] : undefined }
    mappingNamesWithKey(k) { return Object.keys(this.def.mapping).filter(n => Boolean(this.def.mapping[n][k])) }

    /**
     * def is an object or a JSON string, if it is null the def is loaded from
     * defUrl. data are rows or a CSV/JSON string, if it is null it is loaded
     * from the url given in the def. state is applied to the def, see
     * utils/state.js. Returns false if a newer init was started meanwhile,
     * its result (or its error) is the one of the store.
     */
    async init(sources) {
        const run = ++this.runs;
        this.loading = true;
        try {
            const state = await load(sources);
            if (run != this.runs)
                return false;
            Object.assign(this, state);
            this.loads++;
            return true;
        } catch (error) {
            // a newer init was started in the meantime
            if (run == this.runs)
                throw error;
            return false;
        } finally {
            if (run == this.runs)
                this.loading = false;
        }
    }

    // the columns of patched mappings might have changed, and the ones of
    // transforms of the globals, e.g. an index of a base year, the transforms
    // are computed from the first one of a changed global
    applyFormElements() {
        const changed = applyFormElements(this.def, this.defOrg, column => this.dataKeys(column));
        if (transformGlobals(this.def.transform).length > 0) {
            const columns = applyTransforms(this.rows, this.def.transform, this.def.globals, utcColumns(this.def), this.columns);
            if (columns !== this.columns) {
                this.columns = markRaw(columns);
                Object.keys(this.def.mapping).filter(n => columns.changed.has(this.def.mapping[n].column) && !changed.includes(n))
                    .forEach(n => changed.push(n));
            }
        }
        if (changed.length > 0)
            this.data = raw(updateData(this.rows, this.data, this.def, changed, this.columns));
    }

    // the categories of the data of a column, e.g. of a column of a form
    // element, the last ones are kept, the rows are not reactive
    dataKeys(column) {
        const source = this.columns?.get(column) ?? this.rows;
        if (this.keyCache?.column !== column || this.keyCache.source !== source)
            this.keyCache = markRaw({ column, source, keys: distinctValues(this.rows, this.columns, column).map(String) });
        return this.keyCache.keys;
    }

    // replaces the state of the loaded visualisation, null for the defaults
    setState(state) {
        applyState(this.def, this.defaults);
        applyState(this.def, state);
        this.applyFormElements();
        applyState(this.def, { visible: state?.visible });
        this.stateSets++;
    }
}

// every visualisation has its own store, it is provided to all its components
const createStore = () => reactive(new Store());
