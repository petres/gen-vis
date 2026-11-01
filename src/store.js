export { createStore, resolveUrl, resolveParents, clearCache, requirements };

import { reactive, markRaw } from 'vue';

import { distinctValues, scaleDef, updateData } from "@/utils/data";
import { applyTransforms, utcColumns } from "@/utils/transform";
import { applyPatches, fillHtml, fillText, formatOf, templateNames } from "@/utils/def";
import { applyGlobals, applyState, diffState, snapshot } from "@/utils/state";
import { getLocale } from "@/utils/locale";
import { formatter } from "@/utils/props";
import { axisNames } from "@/layout";
import { clearCache, geoParts, load, loadGeo, raw, requirements, resolveParents, resolveUrl } from "@/utils/load";

// the formatters of the locales by their definition, the last ones are kept
const locales = new Map();
const localeOf = locale => {
    const key = JSON.stringify(locale ?? null);
    if (!locales.has(key)) {
        if (locales.size >= 20)
            locales.delete(locales.keys().next().value);
        locales.set(key, markRaw(getLocale(locale ?? undefined)));
    }
    return locales.get(key);
};

class Store {
    defUrl = null;
    defOrg = null;
    // the coordinate system of the definition, of a patch its one, of the
    // ones loaded by their name (`coords`), see applyFormElements
    coord = null;
    coords = null;
    // the map of the definition, see geoOf, of the module of maps and of the
    // geometries of all patches by their key, see loadGeometries
    geo = null;
    geoModule = null;
    geometries = null;
    def = null;
    rows = null;
    // the columns of the transforms, see utils/transform.js
    columns = null;
    // the rows of the files of plots by their url, see applyPatches
    files = null;
    data = null;
    defaults = null;
    // the width of the plots and of the visualisation, set by its measure,
    // they differ with legends beside the plots
    totalWidth = null;
    visWidth = null;
    runs = 0;
    // the number of the definitions loaded, a new one is drawn anew, while it
    // is loaded the one before is shown, see App.vue
    loads = 0;
    loading = false;
    // incremented if the state or the globals are set from outside, the components update
    stateSets = 0;
    // the globals of the page, see setGlobals
    globals = null;
    // the rows highlighted by the page, values of mappings, see App.vue
    highlighted = null;
    // the categories of the data of the last column, see dataKeys
    keyCache = null;
    // the component of the legends of scales of colors, loaded for definitions with one
    colorLegend = null;

    get loaded() { return this.def !== null && this.data !== null }

    // the formatters of the locale of the definition, also of a patch, e.g.
    // of a form element of the language, see utils/locale.js
    get locale() { return localeOf(this.def?.options?.locale) }

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
    get scope() { return { ...this.names, totalWidth: this.totalWidth, [formatter]: (format, name) => this.format(format, name) } }

    // a d3 format in the locale of the values of a mapping, of times if it is
    // a mapping of dates or of a time scale, e.g. "%Y", local or UTC of a
    // `utc` scale, of numbers otherwise, see also the prop format of
    // utils/props.js
    format(format, name) {
        const m = Object.hasOwn(this.def.mapping, name) ? this.def.mapping[name] : undefined;
        const type = scaleDef(this.def.mapping, m)?.type;
        if (type == 'utc')
            return this.locale.time.utcFormat(format);
        if (type == 'time' || m?.type == 'date')
            return this.locale.time.format(format);
        return this.locale.number.format(format);
    }

    mapping(n) { return this.def.mapping[n] }

    // the names of the templates, the globals and the fields of the selected
    // entries of the form elements, e.g. `group:name`, see templateNames
    get names() { return templateNames(this.def) }

    // a text of the definition with the values of the globals, e.g. "{base} = 100"
    text(t) { return fillText(t, this.names) }
    // html of the definition, e.g. the footer, with the values of the globals
    // as text, they can be values of the data, e.g. of a form element
    html(t) { return typeof t == 'string' ? fillHtml(t, this.names) : t }
    // the props of a category, e.g. of a value of the data, undefined for other values
    prop(n, k) { const props = this.def.mapping[n].props; return Object.hasOwn(props, k) ? props[k] : undefined }
    mappingNamesWithKey(k) { return Object.keys(this.def.mapping).filter(n => Boolean(this.def.mapping[n][k])) }

    /**
     * def is an object or a JSON string, if it is null the def is loaded from
     * defUrl. data are rows or a CSV/JSON string, if it is null it is loaded
     * from the url given in the def. state is applied to the def, see
     * utils/state.js. check logs the warnings of the check of the definition
     * (validateDef) in the console, it is only loaded then. Returns false if
     * a newer init was started meanwhile,
     * its result (or its error) is the one of the store.
     */
    async init(sources) {
        const run = ++this.runs;
        this.loading = true;
        try {
            const state = await load(sources);
            if (run != this.runs)
                return false;
            Object.assign(this, state, { globals: sources.globals ?? null });
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

    // a running init is not applied anymore, e.g. the definition was
    // removed or the visualisation unmounted while it was loaded
    cancel() {
        this.runs++;
        this.loading = false;
    }

    // the parts of the definition patched by the entries of the form
    // elements, see applyPatches, the columns of patched mappings might have
    // changed, and the ones of transforms of the globals, e.g. an index of a
    // base year, the transforms are computed from the first one of a changed
    // global before the mappings, their categories can be the ones of a
    // transform, and again after them, e.g. of a patch of a scale of dates to
    // utc, `keepVisible` keeps the entries shown or hidden of the mappings
    // prepared again
    applyFormElements(keepVisible = true) {
        const changedColumns = new Set();
        const transform = () => {
            const columns = applyTransforms(this.rows, this.def.transform, this.def.globals, utcColumns(this.def), this.columns, this.files);
            if (columns !== this.columns) {
                this.columns = markRaw(columns);
                columns.changed.forEach(c => changedColumns.add(c));
            }
        };
        const changed = applyPatches(this.def, this.defOrg, { dataKeys: column => this.dataKeys(column), keepVisible, transform, files: this.files });
        transform();
        Object.keys(this.def.mapping).filter(n => changedColumns.has(this.def.mapping[n].column) && !changed.includes(n))
            .forEach(n => changed.push(n));
        if (changed.length > 0)
            this.data = raw(updateData(this.rows, this.data, this.def, changed, this.columns));
        // the coordinate system of a patch, e.g. polar instead of cartesian
        const coord = this.coords?.get(this.def.options.coord ?? 'cartesian');
        if (coord && coord !== this.coord)
            this.coord = coord;
        // another geometry or the features of another part of a map, e.g. of
        // other countries
        if ((this.geo?.source ?? null) !== (this.def.geo?.data ? geoParts(this.def.geo) : null))
            this.geo = this.geometries && loadGeo(this.geometries, this.geoModule, this.def);
    }

    // the categories of the data of a column, e.g. of a column of a form
    // element, the last ones are kept, the rows are not reactive
    dataKeys(column) {
        const source = this.columns?.get(column) ?? this.rows;
        if (this.keyCache?.column !== column || this.keyCache.source !== source)
            this.keyCache = markRaw({ column, source, keys: distinctValues(this.rows, this.columns, column).map(String) });
        return this.keyCache.keys;
    }

    // replaces the state of the loaded visualisation, null for the defaults,
    // the globals of the page are kept
    setState(state) {
        applyState(this.def, this.defaults);
        applyState(this.def, state);
        applyGlobals(this.def, this.globals);
        // the entries of the legends of the mappings prepared again are the
        // ones of the definition and of the state, not the ones before
        this.applyFormElements(false);
        applyState(this.def, { visible: state?.visible });
        this.stateSets++;
    }

    // the globals of the page, e.g. the language, see applyGlobals, they
    // are kept for a new state
    setGlobals(globals) {
        this.globals = globals;
        applyGlobals(this.def, globals);
        this.applyFormElements();
        this.stateSets++;
    }
}

// every visualisation has its own store, it is provided to all its components
const createStore = () => reactive(new Store());
