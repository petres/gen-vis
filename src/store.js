export { createStore, resolveUrl, resolveParents, clearCache };

import { reactive, markRaw, toRaw } from 'vue';
import * as d3 from "d3";

import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import { validateDef } from "@/utils/validate";
import * as su from "@/utils/state";
import { getLocale } from "@/utils/else";
import { getCoord } from "@/coords";

// relative urls are resolved against `base`, e.g. the url of the def referencing them
const resolveUrl = (url, base = document.baseURI) => new URL(url, base).href;

// requests of the last minutes are shared, e.g. the parents of the charts of a
// page or a csv of two charts, later ones load again, e.g. for updated data
const cacheTime = 5 * 60 * 1000;
const cache = new Map();
const clearCache = () => cache.clear();

const fetchText = url => {
    const now = Date.now();
    cache.forEach((c, u) => { if (now - c.time >= cacheTime) cache.delete(u) });
    if (!cache.has(url)) {
        const text = d3.text(url).catch(error => {
            // failed requests are not kept
            if (cache.get(url)?.text === text)
                cache.delete(url);
            throw new Error(`Could not load '${url}': ${error.message}`);
        });
        cache.set(url, { text, time: now });
    }
    return cache.get(url).text;
};

const parseDef = (text, source) => {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in definition ${source}: ${error.message}`);
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
    return ju.mergeAll(parts);
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

    // the data is requested together with the parents, if the def names it
    if (data === null && typeof def.data == 'string' && !def.data.includes('{'))
        fetchText(resolveUrl(def.data, url)).catch(() => {});

    const defOrg = await resolveParents(JSON.parse(JSON.stringify(def)), url);
    validateDef(defOrg).forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));
    const prepared = ju.prepareDef(JSON.parse(JSON.stringify(defOrg)));
    const defaults = su.snapshot(prepared);
    su.applyState(prepared, state);
    ju.applyFormElements(prepared, defOrg);

    if (data === null) {
        if (!defOrg.data)
            throw new Error('No data given, neither in the definition nor as attribute.');
        data = await fetchText(resolveUrl(defOrg.data, url));
    }
    const rows = raw(du.parseData(data));

    return {
        defUrl: url ?? null,
        defOrg,
        locale: markRaw(getLocale(defOrg.options?.locale)),
        coord: markRaw(getCoord(defOrg.options?.coord)),
        rows,
        def: prepared,
        defaults,
        data: raw(du.prepareData(rows, prepared)),
    };
};

class Store {
    defUrl = null;
    defOrg = null;
    locale = null;
    coord = null;
    def = null;
    rows = null;
    data = null;
    defaults = null;
    runs = 0;
    // incremented if the state is set from outside, the components update
    stateSets = 0;

    get loaded() { return this.def !== null && this.data !== null }

    // the changes of the user compared to the definition, see utils/state.js
    get state() { return this.loaded ? su.diffState(su.snapshot(this.def), this.defaults) : null }

    // the names of the mappings of the positions (h) and of the values (v) of
    // the hover and the stacks, e.g. of the horizontal and the vertical axis
    get axis() {
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
        if (ju.applyFormElements(this.def, this.defOrg))
            this.data = raw(du.prepareData(this.rows, this.def));
    }

    // replaces the state of the loaded visualisation, null for the defaults
    setState(state) {
        su.applyState(this.def, this.defaults);
        su.applyState(this.def, state);
        this.applyFormElements();
        this.stateSets++;
    }
}

// every visualisation has its own store, it is provided to all its components
const createStore = () => reactive(new Store());
