export { createStore };

import { distinctValues, prepareData, scaleDef, sourceRows, updateData, updateDataValues } from "@/utils/data";
import { warnOnce } from "@/utils/warn";
import { applyTransforms, utcColumns } from "@/utils/transform";
import { applyResolved, escapeHtml, fillHtml, fillText, formatOf, languageOf, templateNames } from "@/utils/def";
import { inferTypes } from "@/utils/data";
import { markTypes } from "@/marks";
import { applyGlobals, applyState, diffState, snapshot } from "@/utils/state";
import { getLocale } from "@/utils/locale";
import { evaluate, formatter, isOperator, refNames } from "@/utils/expr";
import { formatExpression } from "@/utils/expr-parse";
import { axisNames } from "@/layout";
import { axisDefaults, symbolDefaults, marginDefaults, withMarkDefaults } from "@/utils/defaults";
import { geoParts, load, loadGeo, raw, valueFormat } from "@/utils/load";

// the formatters of the locales by their definition, the last ones are kept
const locales = new Map();
const localeOf = locale => {
    const key = JSON.stringify(locale ?? null);
    if (!locales.has(key)) {
        if (locales.size >= 20)
            locales.delete(locales.keys().next().value);
        locales.set(key, getLocale(locale ?? undefined));
    }
    return locales.get(key);
};

class Store {
    defUrl = null;
    defOrg = null;
    // the definition of gen-vis 5 with its expressions of the globals, see
    // utils/resolve.js and applyResolved of utils/def.js
    authored = null;
    // the coordinate system of the definition, of the values of its globals
    // the one of them, of the ones loaded by their name (`coords`), see
    // applyControls
    coord = null;
    coords = null;
    // the map of the definition, see geoOf, of the module of maps and of the
    // geometries of all values of the controls by their key, see
    // loadGeometries of utils/load.js
    geo = null;
    geoModule = null;
    // the placement of labels inside of bands, loaded for them, see marks/inside.js
    inside = null;
    geometries = null;
    def = null;
    rows = null;
    // the columns of the transforms, see utils/transform.js
    columns = null;
    // the rows of the files of marks by their url, see applyResolved of
    // utils/def.js
    files = null;
    data = null;
    defaults = null;
    // the defaults of the parts of the chart of its prop `defaults`, before
    // the ones of the page and the built-in ones, see utils/defaults.js
    chartDefaults = null;
    // the width of the plots and of the visualisation, set by its measure,
    // they differ with legends beside the plots
    totalWidth = null;
    visWidth = null;
    // the font of the visualisation, of the measure of its texts, e.g. of the margins of the axes
    fontFamily = null;
    // the margins of the styles of the page (--gen-vis-margin-left, ...), set by the measure of the visualisation
    styleMargins = null;
    // the part of the tick marks inside the plot area of the styles of the page (--gen-vis-tick-inset), null without one
    tickInset = null;
    runs = 0;
    // the number of the definitions loaded, a new one is drawn anew, while it
    // is loaded the one before is shown, see comp/app.js
    loads = 0;
    loading = false;
    // incremented if the state or the globals are set from outside, the
    // listeners are called then, e.g. the visualisation draws a new view
    stateSets = 0;
    listeners = new Set();
    // the globals of the page, see setGlobals
    globals = null;
    // the rows highlighted by the page, values of dims, see comp/app.js
    highlighted = null;
    // the categories of the data of the last column, see dataKeys
    keyCache = null;
    // the legends of scales of colors (see comp/color-legend.js), loaded for definitions with one
    colorLegend = null;

    get loaded() { return this.def !== null && this.data !== null }

    // the formatters of the locale of the definition, also of a global,
    // e.g. of a control of the language, see utils/locale.js
    get locale() { return localeOf(this.def?.locale) }

    // the changes of the user compared to the definition, see utils/state.js
    get state() { return this.loaded ? diffState(snapshot(this.def), this.defaults) : null }

    // the names of the dims of the positions (h) and of the values (v) of
    // the hover and the stacks, see layout.js
    get axis() { return axisNames(this) }

    // the format of the values of a dim in the hover and in labels: its
    // own, the one of its axis or the default of the locale, `scale` is the
    // one of the facet, see valueFormat of utils/locale.js
    valueFormat(n, scale) {
        const m = this.def.dims[n];
        const format = formatOf(m, 'hover');
        return format ? this.format(format, n) : this.locale.valueFormat(m, scale);
    }

    // the names of the references in all parts of the definition, the globals
    // and the width of the visualisation, a facet adds its sizes, a mark the
    // props of the categories and the row, see docs/definition.md "Expressions" > "Names"
    get scope() { return { ...this.names, totalWidth: this.totalWidth, [formatter]: (format, name) => this.format(format, name) } }

    // a d3 format in the locale of the values of a dim, of times if it is
    // a dim of dates or of a time scale, e.g. "%Y", local or UTC of a
    // `utc` scale, of numbers otherwise, see also the prop format of
    // utils/expr.js
    format(format, name) {
        const m = Object.hasOwn(this.def.dims, name) ? this.def.dims[name] : undefined;
        const type = scaleDef(this.def.dims, m)?.type;
        if (type == 'utc' || type == 'time' || m?.type == 'date')
            return this.locale.time[type == 'utc' ? 'utcFormat' : 'format'](format);
        // an invalid format of numbers names its dim, e.g. "%,.0f" of a time
        // format and a number format
        try {
            return this.locale.number.format(format);
        } catch (error) {
            throw new Error(`${m ? `dims.${name}.format` : 'format'}: '${format}' is no d3 format of numbers (${error.message}), e.g. ",.0f"`, { cause: error });
        }
    }

    dim(n) { return this.def.dims[n] }

    // the defaults of the axes of a position, e.g. "left", and of the type
    // of their scale, e.g. "band", see axisDefaults of utils/defaults.js
    axisDefaults(position, scaleType) { return axisDefaults(this.chartDefaults, position, scaleType) }
    // the margins of the defaults of the page and of the chart, see utils/defaults.js
    marginDefaults() { return marginDefaults(this.chartDefaults) }

    // the names of the templates, the globals and the fields of the selected
    // entries of the controls, e.g. `group:name`, see templateNames
    get names() { return templateNames(this.def) }

    // a text of the definition with the values of the globals, e.g. "{base} = 100"
    text(t) { return fillText(this.textOf(t), this.names) }
    // html of the definition, e.g. the footer, with the values of the globals
    // as text, they can be values of the data, e.g. of a control
    // (of an expression the texts of its names, e.g. globals of the page, as
    // text, the texts of the expression itself as html)
    html(t) { const v = this.textOf(t, true); return typeof v == 'string' ? fillHtml(v, this.names) : v }
    // a text which is an expression of names which are not all globals
    // (those are evaluated before, see utils/resolve.js), evaluated in the
    // scope of the chart, e.g. "=cat('Breite ', @totalWidth)", no value is
    // the empty text, never the expression; a name which is none of the
    // scope (no global, no size) has no value, a warning once
    textOf(t, html = false) {
        if (!isOperator(t))
            return t;
        const scope = html ? Object.fromEntries(Object.entries(this.scope).map(([k, v]) => [k, typeof v == 'string' ? escapeHtml(v) : v])) : this.scope;
        const unknown = refNames(t).filter(n => typeof n == 'string' && !Object.hasOwn(scope, n));
        if (unknown.length > 0)
            warnOnce(this, `text:${JSON.stringify(t)}`, `the text "=${formatExpression(t)}" names ${unknown.map(n => `'${n}'`).join(', ')}, `
                + `no global (of "globals" or a control) and no size (totalWidth): no value`);
        const v = evaluate(t, scope);
        return v === null || v === undefined ? '' : String(v);
    }
    // the props of a category, e.g. of a value of the data, undefined for other values
    prop(n, k) { const props = this.def.dims[n].categoryProps; return Object.hasOwn(props, k) ? props[k] : undefined }
    dimNamesWithKey(k) { return Object.keys(this.def.dims).filter(n => Boolean(this.def.dims[n][k])) }

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
            Object.assign(this, state, { globals: sources.globals ?? null, chartDefaults: sources.defaults });
            this.warnNotes();
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

    // the parts of the definition of the values of the globals (of the
    // controls), see applyResolved of utils/def.js, the columns of dims
    // might have changed, and the ones of transforms of the globals, e.g. an
    // index of a base year, the transforms are computed from the first one of
    // a changed global before the dims, their categories can be the ones
    // of a transform, and again after them, e.g. of a global of a scale of
    // dates to utc, `keepVisible` keeps the entries shown or hidden of the
    // dims prepared again
    applyControls(keepVisible = true) {
        const changedColumns = new Set();
        const transform = () => {
            const columns = applyTransforms(this.rows, this.def.transform, this.def.globals, utcColumns(this.def), this.columns, this.files, this.def.locale);
            if (columns !== this.columns) {
                this.columns = columns;
                columns.changed.forEach(c => changedColumns.add(c));
            }
        };
        const source = sourceRows(this.rows, this.columns);
        const changed = [];
        // a second pass if a global of a control of a column was none of
        // its new values and is the last one now, see below
        for (let pass = 0; pass < 2; pass++) {
            const before = sourceRows(this.rows, this.columns);
            const columnsBefore = new Set(changedColumns);
            applyResolved(this.def, this.defOrg, { dataKeys: (column, inOrder) => this.dataKeys(column, inOrder), keepVisible, transform, files: this.files,
                symbols: symbolDefaults(this.chartDefaults), authored: this.authored, markTypes: withMarkDefaults(markTypes, this.chartDefaults),
                types: part => inferTypes(part, this.rows, this.columns) }).forEach(n => changed.includes(n) || changed.push(n));
            transform();
            Object.keys(this.def.dims).filter(n => changedColumns.has(this.def.dims[n].column) && !changed.includes(n))
                .forEach(n => changed.push(n));
            // the values of controls of columns of transforms computed
            // again, e.g. the classes of other edges of a bin, and their names
            // of another language; a global which is none of them anymore is
            // the last one (not one of the page), e.g. of a filter
            const passRows = sourceRows(this.rows, this.columns) !== before;
            const passColumns = [...changedColumns].filter(c => !columnsBefore.has(c));
            const language = languageOf(this.def, this.def.globals);
            const languageChanged = language !== this.valuesLanguage;
            this.valuesLanguage = language;
            if (!passRows && passColumns.length == 0 && !languageChanged)
                break;
            const reset = updateDataValues(this.defOrg ?? {}, this.def, this.rows, this.columns, valueFormat(this.def.locale),
                spec => passRows || languageChanged || passColumns.includes(spec.column) || passColumns.includes(spec.names),
                language, ref => this.globals?.[ref] !== undefined);
            if (reset.length == 0)
                break;
        }
        this.warnNotes();
        const rowsChanged = sourceRows(this.rows, this.columns) !== source;
        // other rows of a transform of rows, e.g. the classes of other edges
        // of a bin, are prepared again, the same ones are updated in place
        if (rowsChanged)
            this.data = raw(prepareData(this.rows, this.def, this.columns));
        else if (changed.length > 0)
            this.data = raw(updateData(this.rows, this.data, this.def, changed, this.columns));
        // the coordinate system of a global, e.g. polar instead of cartesian
        const coord = this.coords?.get(this.def.coord ?? 'cartesian');
        if (coord && coord !== this.coord)
            this.coord = coord;
        // another geometry or the features of another part of a map, e.g. of
        // other countries
        if ((this.geo?.source ?? null) !== (this.def.geo?.data ? geoParts(this.def.geo) : null))
            this.geo = this.geometries && loadGeo(this.geometries, this.geoModule, this.def);
    }

    // the warnings of the transforms, e.g. of values outside the edges of a bin
    warnNotes() {
        (this.columns?.notes ?? []).forEach(note => warnOnce(this, note, note));
    }

    // the categories of the data of a column, e.g. of a column of a form
    // element, the last ones are kept
    dataKeys(column, inOrder = false) {
        const source = this.columns?.get(column) ?? sourceRows(this.rows, this.columns);
        if (this.keyCache?.column !== column || this.keyCache.source !== source || this.keyCache.inOrder !== inOrder)
            this.keyCache = { column, source, inOrder, keys: distinctValues(this.rows, this.columns, column, inOrder).map(String) };
        return this.keyCache.keys;
    }

    // replaces the state of the loaded visualisation, null for the defaults,
    // the globals of the page are kept
    setState(state) {
        applyState(this.def, this.defaults);
        applyState(this.def, state);
        applyGlobals(this.def, this.globals);
        // the entries of the legends of the dims prepared again are the
        // ones of the definition and of the state, not the ones before
        this.applyControls(false);
        applyState(this.def, { visible: state?.visible });
        this.changed();
    }

    // the globals of the page, e.g. the language, see applyGlobals, they
    // are kept for a new state
    setGlobals(globals) {
        this.globals = globals;
        applyGlobals(this.def, globals);
        this.applyControls();
        this.changed();
    }

    // the state or the globals were set from outside
    changed() {
        this.stateSets++;
        this.listeners.forEach(fn => fn());
    }
}

// every visualisation has its own store, it is given to all its parts
const createStore = () => new Store();
