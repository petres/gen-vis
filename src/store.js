export { createStore, resolveUrl, resolveParents, clearCache };

import { reactive, markRaw, toRaw } from 'vue';

import { addDataValues, dataFormat, parseData, prepareData, updateData } from "@/utils/data";
import { applyFormElements, mergeAll, prepareDef } from "@/utils/def";
import { applyState, diffState, snapshot } from "@/utils/state";
import { getLocale } from "@/utils/locale";
import { validateDef } from "@/utils/validate";
import { getCoord } from "@/coords";
import { geoFeatures, geoKey } from "@/utils/geo";

// relative urls are resolved against `base`, e.g. the url of the def referencing them
const resolveUrl = (url, base = document.baseURI) => new URL(url, base).href;

// requests of the last minutes are shared, e.g. the parents of the charts of a
// page or a csv of two charts, later ones load again, e.g. for updated data
const cacheTime = 5 * 60 * 1000;
const cache = new Map();
const clearCache = () => cache.clear();

// the content of a url, `type` is text or arrayBuffer, e.g. of parquet data
const request = async (url, type) => {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
    return response[type]();
};

const fetchCached = (url, type = 'text') => {
    const now = Date.now();
    const key = `${type} ${url}`;
    cache.forEach((c, k) => { if (now - c.time >= cacheTime) cache.delete(k) });
    if (!cache.has(key)) {
        const content = request(url, type).catch(error => {
            // failed requests are not kept
            if (cache.get(key)?.content === content)
                cache.delete(key);
            throw new Error(`Could not load '${url}': ${error.message}`);
        });
        cache.set(key, { content, time: now });
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

// the rows are not made reactive, they can be large and are only replaced as a whole
const raw = rows => markRaw(Array.from(toRaw(rows)));

// see Store.init, urls of inline defs are relative to the page
const load = async ({ def = null, defUrl = null, data = null, state = null }) => {
    let url;
    if (def === null) {
        url = resolveUrl(defUrl);
        def = parseDef(await fetchText(url), `'${url}'`);
    } else if (typeof def == 'string') {
        def = parseDef(def, 'attribute');
    }

    // the data and the geometry are requested together with the parents, if the def names them
    if (data === null && typeof def.data == 'string' && !def.data.includes('{')) {
        const dataUrl = resolveUrl(def.data, url);
        fetchData(dataUrl, dataFormat(dataUrl, def.dataFormat)).catch(() => {});
    }
    if (typeof def.geo?.data == 'string')
        fetchText(resolveUrl(def.geo.data, url)).catch(() => {});

    const defOrg = await resolveParents(JSON.parse(JSON.stringify(def)), url);
    validateDef(defOrg).forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));
    // the format of the data, by default the one of the extension of its url
    let format = defOrg.dataFormat;
    if (data === null) {
        if (!defOrg.data)
            throw new Error('No data given, neither in the definition nor as attribute.');
        const dataUrl = resolveUrl(defOrg.data, url);
        format = dataFormat(dataUrl, format);
        data = await fetchData(dataUrl, format);
    }
    const rows = raw(await parseData(data, format));

    // the form elements can have the values of the data, the state needs them
    addDataValues(defOrg, rows);
    const prepared = prepareDef(JSON.parse(JSON.stringify(defOrg)));
    const defaults = snapshot(prepared);
    applyState(prepared, state);
    applyFormElements(prepared, defOrg);

    // the features of a map, see coords/geo.js, the url of GeoJSON or TopoJSON or itself
    let geo = null;
    if (defOrg.geo?.data) {
        let json = defOrg.geo.data;
        if (typeof json == 'string') {
            const geoUrl = resolveUrl(json, url);
            json = parseDef(await fetchText(geoUrl), `'${geoUrl}'`, 'geometry');
        }
        const key = geoKey(defOrg.geo.key ?? 'id');
        // only the features of `include`, without the ones of `exclude`, they are not drawn at all
        const include = defOrg.geo.include && new Set(defOrg.geo.include.map(String));
        const exclude = new Set((defOrg.geo.exclude ?? []).map(String));
        const features = geoFeatures(json, defOrg.geo.object)
            .filter(f => (!include || include.has(key(f))) && !exclude.has(key(f)));
        geo = markRaw({ features, key, byKey: new Map(features.map(f => [key(f), f])) });
    }

    return {
        defUrl: url ?? null,
        defOrg,
        locale: markRaw(getLocale(defOrg.options?.locale)),
        coord: markRaw(getCoord(defOrg.options?.coord)),
        geo,
        rows,
        def: prepared,
        defaults,
        data: raw(prepareData(rows, prepared)),
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
    data = null;
    defaults = null;
    // the width of the visualisation, set by its measure
    totalWidth = null;
    runs = 0;
    // incremented if the state is set from outside, the components update
    stateSets = 0;

    get loaded() { return this.def !== null && this.data !== null }

    // the changes of the user compared to the definition, see utils/state.js
    get state() { return this.loaded ? diffState(snapshot(this.def), this.defaults) : null }

    // the names of the mappings of the positions (h) and of the values (v) of
    // the hover and the stacks, e.g. of the horizontal and the vertical axis
    get axis() {
        if (this.coord.names)
            return this.coord.names(this);
        const axis = {};
        this.mappingNamesWithKey('scale').forEach(n => {
            const o = this.mapping(n).scale.orientation;
            Object.entries(this.coord.axis).forEach(([a, orientation]) => {
                if (o == orientation)
                    axis[a] = n;
            });
        });
        return axis;
    }

    // d3 format of the locale for the values of a scale type
    formatter(scaleType) {
        if (scaleType == 'time')
            return this.locale.time.format;
        if (scaleType == 'utc')
            return this.locale.time.utcFormat;
        return this.locale.number.format;
    }

    // the names of the references in all parts of the definition, the globals
    // and the width of the visualisation, a facet adds its sizes, a plot the
    // props of the categories and the row, see README "Props"
    get bases() { return { ...this.def.globals, totalWidth: this.totalWidth } }

    mapping(n) { return this.def.mapping[n] }
    prop(n, k) { return this.def.mapping[n].props[k] }
    mappingNamesWithKey(k) { return Object.keys(this.def.mapping).filter(n => k in this.def.mapping[n]) }

    /**
     * def is an object or a JSON string, if it is null the def is loaded from
     * defUrl. data are rows or a CSV/JSON string, if it is null it is loaded
     * from the url given in the def. state is applied to the def, see
     * utils/state.js.
     */
    async init(sources) {
        const run = ++this.runs;
        this.def = this.data = null;
        try {
            const state = await load(sources);
            if (run == this.runs)
                Object.assign(this, state);
        } catch (error) {
            // a newer init was started in the meantime
            if (run == this.runs)
                throw error;
        }
    }

    // the columns of patched mappings might have changed
    applyFormElements() {
        const changed = applyFormElements(this.def, this.defOrg);
        if (changed.length > 0)
            this.data = raw(updateData(this.rows, this.data, this.def, changed));
    }

    // replaces the state of the loaded visualisation, null for the defaults
    setState(state) {
        applyState(this.def, this.defaults);
        applyState(this.def, state);
        this.applyFormElements();
        this.stateSets++;
    }
}

// every visualisation has its own store, it is provided to all its components
const createStore = () => reactive(new Store());
