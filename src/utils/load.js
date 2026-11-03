export { resolveUrl, clearCache, resolveParents, readDef, requirements, raw, geoParts, loadGeo, load };


import { addDataValues, dataFormat, distinctValues, inferTypes, parseData, prepareData, usedColumns } from "@/utils/data";
import { applyTransforms, loadTransforms, utcColumns } from "@/utils/transform";
import { applyPatches, mergeAll, prepareDef, variants } from "@/utils/def";
import { applyGlobals, applyState, snapshot } from "@/utils/state";
import { loadLocale } from "@/utils/locale";
import { loadCoord } from "@/coords";
import { loadColors, ownScheme } from "@/utils/d3";
import { lazy } from "@/utils/lazy";
import { isObject } from "@/utils/values";
import { normalize } from "@/utils/normalize";
import { versionError } from "@/utils/version";
import { plotTypes } from "@/plots";

// the load of a visualisation: its definition with its parents, the parts
// of the package it needs, its data and the files and geometries of it and
// of its patches, see Store.init of store.js

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

// a definition of another version than gen-vis 4 (see utils/version.js),
// `source` is its url or the inline definition
const checkVersion = (def, source, required = false) => {
    const error = versionError(def?.$schema, required);
    if (error)
        throw new Error(`${source} is no definition of gen-vis 4: ${error}`);
};

// merges def with its parents, a parent url is relative to the def referencing
// it. A list of parents (mixins) is merged in its order, later ones override
// earlier ones. A parent shared by several mixins is merged once, before the
// first one using it, so it does not override the mixins in between. The
// parents of a def are requested at once, but merged in their order. Every
// part with a `$schema` is one of gen-vis 4, a definition of a file (of its
// `url`, undefined of an inline one) has one, in itself or in a parent.
const resolveParents = async (def, url, load = fetchText) => {
    const parts = [];
    const included = new Set();
    const add = async (def, url, ancestors) => {
        checkVersion(def, url === undefined ? 'the inline definition' : `'${url}'`);
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
    const merged = mergeAll(parts);
    if (url !== undefined)
        checkVersion(merged, `'${url}'`, true);
    return merged;
};

// the rows of data, errors name its url (`source`)
const readData = async (data, format, source, columns = null) => {
    try {
        return await parseData(data, format, columns);
    } catch (error) {
        throw new Error(`Could not read the data ${source}: ${error.message}`);
    }
};

// the rows as an array of their own, they can be large and are only replaced as a whole
const raw = rows => Array.from(rows);

// the check of the definitions (`check` of Store.init, e.g. while a
// definition is written), loaded with the first one, together with its
// parents, a definition is drawn without it if it could not be loaded, e.g.
// of the single file of the standalone script, which has none
let validator = null;
const loadValidator = () => validator ??= lazy.validate().catch(error => {
    console.warn(`gen-vis: the definition is not checked, ${error.message}`);
    validator = null;
    return null;
});

// the features of a map of the geometry `json` and the part `geo` of a
// prepared definition: only the ones of `include`, without the ones of
// `exclude`, they are not drawn at all, the borders of the objects of
// TopoJSON (`mesh`) and the projections of the facets, see coords/geo.js,
// `source` are the parts it depends on, a patch of them makes a new one
const geoParts = g => JSON.stringify([geoData(g), g?.key ?? 'id', g?.object ?? null, g?.include ?? null, g?.exclude ?? null]);
// the key of the geometry of the part `geo`, its url or itself, see loadGeometries
const geoData = g => typeof g?.data == 'string' ? g.data : JSON.stringify(g?.data ?? null);
const geoOf = (module, json, def = {}) => {
    const { geoFeatures, geoKey, geoMesh } = module;
    const key = geoKey(def.key ?? 'id');
    const include = def.include && new Set(def.include.map(String));
    const exclude = new Set((def.exclude ?? []).map(String));
    const keep = f => (!include || include.has(key(f))) && !exclude.has(key(f));
    const features = geoFeatures(json, def.object).filter(keep);
    // the borders of an object of TopoJSON by the plots of geo:mesh, of the
    // object of the features also without the ones left out
    const objectName = object => object ?? def.object ?? Object.keys(json.objects ?? {})[0];
    const meshes = new Map();
    const mesh = (object, borders = 'all') => {
        const id = JSON.stringify([objectName(object), borders]);
        if (!meshes.has(id))
            meshes.set(id, geoMesh(json, objectName(object), borders,
                objectName(object) == objectName(undefined) ? keep : undefined));
        return meshes.get(id);
    };
    return { json, module, source: geoParts(def), features, key, byKey: new Map(features.map(f => [key(f), f])), mesh, projections: new Map() };
};

/**
 * The parts of the package a definition needs, loaded with its data, also
 * the ones of the patches of the entries of its form elements (see
 * variants): the colors of d3 (`colors`, of schemes and interpolators, not
 * of the schemes registered by the page), the
 * coordinate systems (`coords`, the one of the definition first, undefined
 * for the default), the parts of maps (`geo`), the transforms, the legend
 * of a scale of colors (`colorLegend`, a mapping with a legend without
 * props) and the locales (`locales`, the one of the definition first).
 */
const requirements = defOrg => {
    const all = variants(defOrg);
    const mappings = all.flatMap(d => Object.values(d.mapping ?? {})).filter(isObject);
    return {
        colors: mappings.some(m => Boolean(m.scale?.interpolator || [m.scale?.scheme, m.props?.scheme].some(s => s && !ownScheme(s)))),
        coords: [...new Set(all.filter((d, i) => i == 0 || d.options?.coord !== undefined).map(d => d.options?.coord ?? undefined))],
        geo: all.some(d => Boolean(d.geo?.data)),
        transforms: all.some(d => Boolean(d.transform)),
        colorLegend: mappings.some(m => m.legend && !m.props),
        locales: all.filter((d, i) => i == 0 || d.options?.locale !== undefined).map(d => d.options?.locale ?? undefined),
    };
};

// the parts of the requirements, loaded at once, the coordinate systems by
// their name, the module of maps and the legend of colors are the result
const loadParts = need => {
    const parts = Promise.all([
        need.colors ? loadColors() : null,
        need.geo ? lazy.geo() : null,
        need.transforms ? loadTransforms() : null,
        need.colorLegend ? lazy.colorLegend() : null,
        Promise.all(need.coords.map(name => loadCoord(name))),
        ...need.locales.map(locale => loadLocale(locale)),
    ]).then(([, geo, , colorLegend, coords]) =>
        ({ coords: new Map(need.coords.map((name, i) => [name ?? 'cartesian', coords[i]])), geo, colorLegend }));
    // the errors are the ones of the load, not unhandled ones
    parts.catch(() => {});
    return parts;
};

// the definition of the attribute (an object or a JSON text) or, of null,
// the one of its url, and its url, undefined of the attribute
const readDef = async (def, defUrl) => {
    if (def === null) {
        const url = resolveUrl(defUrl);
        return { def: parseDef(await fetchText(url), `'${url}'`), url };
    }
    return { def: typeof def == 'string' ? parseDef(def, 'attribute') : def, url: undefined };
};

// the definition of the attribute or of its url, with its parents, the
// warnings of its check (`check`), the data and the geometry are requested together
// with the parents, if the def names them, the data if its format is known,
// it can be the one of a parent, `url` is undefined for inline definitions
const resolveDef = async ({ def: given, defUrl, data, check }) => {
    const checks = check ? loadValidator() : null;
    const { def, url } = await readDef(given, defUrl);

    if (data === null && typeof def.data == 'string' && !def.data.includes('{')) {
        const dataUrl = resolveUrl(def.data, url);
        const format = dataFormat(dataUrl, def.dataFormat);
        if (format !== undefined || def.parent === undefined)
            fetchData(dataUrl, format).catch(() => {});
    }
    if (typeof def.geo?.data == 'string')
        fetchText(resolveUrl(def.geo.data, url)).catch(() => {});

    // the internal form of the merged definition, see utils/normalize.js
    const merged = await resolveParents(JSON.parse(JSON.stringify(def)), url);
    const defOrg = normalize(merged, { plotTypes });
    // the check of the merged definition (not of its internal form) with
    // the rows, e.g. of years as dates, see load, it is loaded meanwhile
    const validate = async rows => (await checks)?.validateDef(merged, rows)
        .forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));
    return { url, defOrg, validate };
};

// the rows of the data of the attribute or of the url of the definition,
// the format by default the one of the extension of its url, parquet is
// read in the columns which are used
const loadRows = async (defOrg, url, data) => {
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
    return raw(await readData(data, format, source, usedColumns(defOrg)));
};

// the data of plots of their own, e.g. events, and of the lookups of
// transforms, also of the patches of form elements, by their url relative
// to the def, the rows are not evaluated as the ones of the definition, see
// layout.js
const loadFiles = async (defOrg, url) => {
    const all = variants(defOrg);
    const withFiles = [
        ...all.flatMap(d => [d.plot ?? []].flat()).filter(p => typeof p?.data == 'string'),
        ...all.flatMap(d => [d.transform ?? []].flat()).filter(t => t?.type == 'lookup' && typeof t.data == 'string'),
    ];
    return new Map(await Promise.all([...new Set(withFiles.map(p => p.data))].map(async data => {
        const dataUrl = resolveUrl(data, url);
        const format = dataFormat(dataUrl, withFiles.find(p => p.data == data).dataFormat);
        return [data, raw(await readData(await fetchData(dataUrl, format), format, `'${dataUrl}'`))];
    })));
};

/**
 * The prepared definition of the rows with the state and the globals of the
 * page (the types of the mappings without one are the ones of their values,
 * see inferTypes), its defaults (the state of the definition, see utils/state.js) and
 * the columns of the transforms. The form elements can have the values of
 * the data, the state needs them. The transforms of the globals of the
 * state are computed before the mappings, their categories can be the ones
 * of a transform, and again after them, e.g. of a patch of a scale of dates
 * to utc, the entries of the legends are the ones of the state, e.g. of the
 * categories of another column.
 */
const prepare = (defOrg, rows, files, state, globals) => {
    let columns = applyTransforms(rows, defOrg.transform, defOrg.globals, utcColumns(defOrg), null, files);
    addDataValues(defOrg, rows, columns);
    inferTypes(defOrg, rows, columns);
    const keysOf = column => distinctValues(rows, columns, column).map(String);
    const transform = () => {
        columns = applyTransforms(rows, prepared.transform, prepared.globals, utcColumns(prepared), columns, files);
    };
    const prepared = prepareDef(JSON.parse(JSON.stringify(defOrg)), { dataKeys: keysOf, files });
    const defaults = snapshot(prepared);
    applyState(prepared, state);
    applyGlobals(prepared, globals);
    applyPatches(prepared, defOrg, { dataKeys: keysOf, files, transform });
    applyState(prepared, { visible: state?.visible });
    transform();
    return { prepared, defaults, columns };
};

// the geometries of maps of the definition and of the patches of its form
// elements, of the url of GeoJSON or TopoJSON or itself, by their key (see
// geoData), a patch can switch to another one, e.g. of other regions
const loadGeometries = async (defOrg, url) => {
    const data = [...new Map(variants(defOrg).filter(d => d.geo?.data).map(d => [geoData(d.geo), d.geo.data])).entries()];
    return new Map(await Promise.all(data.map(async ([key, json]) => {
        if (typeof json == 'string') {
            const geoUrl = resolveUrl(json, url);
            json = parseDef(await fetchText(geoUrl), `'${geoUrl}'`, 'geometry');
        }
        return [key, json];
    })));
};

// the geometry of a map of the prepared definition, see coords/geo.js, its
// features are the ones of its part `geo`, null without one
const loadGeo = (geometries, module, prepared) => {
    const json = prepared.geo?.data ? geometries.get(geoData(prepared.geo)) : undefined;
    return json ? geoOf(module, json, prepared.geo) : null;
};

// see Store.init, urls of inline defs are relative to the page: the
// definition, then at once the parts it needs, its data, the files of its
// plots and transforms and the geometries of maps (an error of one is the
// one of the load, the others are handled by Promise.all), the prepared
// definition and the geometry of its map. The coordinate systems and the
// geometries of all patches are kept, a form element can switch them.
const load = async ({ def = null, defUrl = null, data = null, state = null, globals = null, check = false }) => {
    const { url, defOrg, validate } = await resolveDef({ def, defUrl, data, check });
    let loaded;
    try {
        loaded = await Promise.all([
            loadParts(requirements(defOrg)),
            loadRows(defOrg, url, data),
            loadFiles(defOrg, url),
            loadGeometries(defOrg, url),
        ]);
    } catch (error) {
        // the warnings of the check also if a part could not be loaded,
        // they might be its reason, e.g. a wrong name
        await validate();
        throw error;
    }
    const [{ coords, geo: geoModule, colorLegend }, rows, files, geometries] = loaded;
    await validate(rows);
    const { prepared, defaults, columns } = prepare(defOrg, rows, files, state, globals);

    return {
        defUrl: url ?? null,
        defOrg,
        colorLegend: colorLegend ? colorLegend.default : null,
        coords,
        coord: coords.get(prepared.options.coord ?? 'cartesian'),
        geoModule: geoModule ?? null,
        geometries,
        geo: loadGeo(geometries, geoModule, prepared),
        files,
        rows,
        columns,
        def: prepared,
        defaults,
        data: raw(prepareData(rows, prepared, columns)),
    };
};
