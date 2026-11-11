export { valueFormat, resolveUrl, clearCache, resolveParents, readDef, requirements, raw, geoParts, loadGeo, load, fetchData };


import { addDataValues, updateDataValues, dataFormat, distinctValues, inferTypes, oddValues, parseData, prepareData, sourceRows, toDate, usedColumns } from "@/utils/data";
import { applyTransforms, loadTransforms, madeColumns, utcColumns } from "@/utils/transform";
import { applyResolved, fillTemplate, languageOf, mergeAll, prepareDef, variants, variantsOf } from "@/utils/def";
import { translate, checkDims, implicitDims, isDefinition4, isDefinition5, optionKeys, authoredPath } from "@/utils/language";
import { resolve, namesOfGlobals, variants as resolvedVariants } from "@/utils/resolve";
import { applyGlobals, applyState, snapshot } from "@/utils/state";
import { checkLocale, getLocale, loadLocale } from "@/utils/locale";
import { loadCoord } from "@/coords";
import { loadColors, ownScheme } from "@/utils/d3";
import { lazy } from "@/utils/lazy";
import { isObject } from "@/utils/values";
import { hasCategories, normalize } from "@/utils/normalize";
import { versionError } from "@/utils/version";
import { refNames } from "@/utils/expr";
import { markTypes } from "@/plots";
import { symbolDefaults } from "@/utils/defaults";

// the load of a visualisation: its definition with its parents, the parts
// of the package it needs, its data and the files and geometries of it and
// of the values of its controls (see variants), see Store.init of store.js

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

// the entry of the cache of a url, its `content` a promise
const cached = (url, type = 'text') => {
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
    return cache.get(key);
};

const fetchCached = (url, type = 'text') => cached(url, type).content;

const fetchText = url => fetchCached(url);

// parquet is binary, the other formats are text, data of an unknown format
// (e.g. of an url without an extension) is binary, parseData reads parquet
// of its content and the others of its text
const contentType = format => format == 'parquet' || format === undefined ? 'arrayBuffer' : 'text';
const fetchData = (url, format) => fetchCached(url, contentType(format));

/**
 * The rows of the data of a url, parsed once per request of the cache: the
 * charts of a page which share a file share its rows, the same list (see
 * raw), so the types of its columns are inferred once too (see inferTypes
 * of utils/data.js); kept with the request, by the format and, of binary
 * data (parquet reads only the columns used), the `columns`, and released
 * with it. The warnings of the data (see parseData) are kept with the rows,
 * `warn` tells them of every chart. A chart does not change the rows: the
 * columns of its transforms are beside them, its rows of the dims are
 * others (see prepareData).
 */
const fetchRows = async (url, format, columns = null, warn = null) => {
    const type = contentType(format);
    const entry = cached(url, type);
    const key = JSON.stringify([format ?? null, type == 'arrayBuffer' && columns ? [...columns].sort() : null]);
    entry.rows ??= new Map();
    if (!entry.rows.has(key)) {
        // an error of the data is kept as the rows are, one of the request is
        // the one of the content
        const parsed = entry.content.then(async data => {
            const messages = [];
            try {
                return { rows: raw(await parseData(data, format, columns, message => messages.push(message))), messages };
            } catch (error) {
                return { error };
            }
        });
        // (an error of the request is the one of the charts which wait for it)
        parsed.catch(() => {});
        entry.rows.set(key, parsed);
    }
    const { rows, messages, error } = await entry.rows.get(key);
    if (error)
        throw new Error(`Could not read the data '${url}': ${error.message}`);
    messages.forEach(message => warn?.(message));
    return rows;
};

const parseDef = (text, source, what = 'definition') => {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in ${what} ${source}: ${error.message}`);
    }
};

// a definition of another version than gen-vis 5 or 4 (see utils/version.js),
// `source` is its url or the inline definition
const checkVersion = (def, source, required = false) => {
    const error = versionError(def?.$schema, required);
    if (error)
        throw new Error(`${source} is no definition of gen-vis 5: ${error}`);
};

// merges def with its parents, a parent url is relative to the def referencing
// it. A list of parents (mixins) is merged in its order, later ones override
// earlier ones. A parent shared by several mixins is merged once, before the
// first one using it, so it does not override the mixins in between. The
// parents of a def are requested at once, but merged in their order. Every
// part with a `$schema` is one of gen-vis 4, a definition of a file (of its
// `url`, undefined of an inline one) has one, in itself or in a parent.
// A chain of parts of gen-vis 4 and 5 (by their keys, see isDefinition4)
// is merged as one of 5: every part of 4 is migrated first, with the parts
// of 4 before it as its parents (as `gen-vis migrate` does per file), the
// merged definition then has `migratedKey`; a chain of parts of 4 only is
// merged as one of 4 (readDef migrates it).
const migratedKey = Symbol('migrated');
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
    const old = parts.map(isDefinition4);
    const mixed = old.some(Boolean) && parts.some((p, i) => !old[i] && ofKeys5(p));
    const merged = mixed ? mergeAll(await migratedParts(parts, old)) : mergeAll(parts);
    if (mixed)
        merged[migratedKey] = true;
    if (url !== undefined)
        checkVersion(merged, `'${url}'`, true);
    return merged;
};
// a part of keys of 5 (not one of only keys of both, e.g. a parent of only
// `data` or `geo`): dims, marks, controls or the options at the top level
const ofKeys5 = def => isDefinition5(def) && ['dims', 'marks', 'controls', ...optionKeys].some(k => def[k] !== undefined);
// the parts of a chain with the ones of 4 (`old`) migrated, each with the
// parts of 4 before it merged as its parents
const migratedParts = async (parts, old) => {
    const { migrate } = await lazy.migrate();
    return parts.map((p, i) => {
        if (!old[i])
            return p;
        const before = parts.slice(0, i).filter((q, j) => old[j]);
        return migrate(p, { parents: before.length ? mergeAll(before) : undefined });
    });
};

// the warnings of the data of the definition of `url` (`source` names the
// data, its url or the attribute), e.g. of rows left out, see parseData
const dataWarning = (url, source) => message => console.warn(`gen-vis ${url ?? 'inline definition'}: the data ${source}: ${message}`);

// the rows of data, errors name its url (`source`), `warn` tells of rows left out, see parseData
const readData = async (data, format, source, columns = null, warn = null) => {
    try {
        return await parseData(data, format, columns, warn);
    } catch (error) {
        throw new Error(`Could not read the data ${source}: ${error.message}`);
    }
};

// the rows as an array of their own, they can be large and are only
// replaced as a whole; the columns of the header of CSV and TSV (`columns`
// of the parsed rows) are kept beside them, also without rows, see
// missingColumns
const raw = rows => {
    const list = Array.from(rows);
    if (Array.isArray(rows.columns))
        headers.set(list, rows.columns);
    return list;
};
const headers = new WeakMap();

// the check of the definitions (`check` of Store.init, e.g. while a
// definition is written), loaded with the first one, together with its
// parents, a definition is drawn without it if it could not be loaded, e.g.
// a chunk of the browser module missing on its server
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
// `source` are the parts it depends on, a global which changes them makes
// a new one
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
    // the borders of an object of TopoJSON by the marks of geo:mesh, of the
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
 * the ones of the other values of its controls (see variants): the colors of d3 (`colors`, of schemes and interpolators, not
 * of the schemes registered by the page), the
 * coordinate systems (`coords`, the one of the definition first, undefined
 * for the default), the parts of maps (`geo`), the transforms, the legend
 * of a scale of colors (`colorLegend`, a dim with a legend without
 * categories) and the locales (`locales`, the one of the definition first).
 */
const requirements = defOrg => {
    const all = variants(defOrg);
    const dims = all.flatMap(d => Object.values(d.dims ?? {})).filter(isObject);
    return {
        colors: dims.some(m => Boolean(m.scale?.interpolator || [m.scale?.scheme, m.scheme].some(s => s && !ownScheme(s)))),
        coords: [...new Set(all.filter((d, i) => i == 0 || d.options?.coord != null).map(d => d.options?.coord ?? undefined))],
        geo: all.some(d => Boolean(d.geo?.data)),
        transforms: all.some(d => Boolean(d.transform)),
        colorLegend: dims.some(m => m.legend && !hasCategories(m)),
        // labels inside the bands of an area, see plots/inside.js
        inside: all.some(d => [d.marks ?? []].flat().some(p => isObject(p) && isObject(p.place) && p.place.in !== undefined)),
        locales: [...new Set([...all.filter((d, i) => i == 0 || d.options?.locale != null).map(d => d.options?.locale ?? undefined), ...languagesOf(defOrg)])],
    };
};

// the languages of the texts a definition can have (`options.language`, a
// tag or a global: the values of its form elements and of the definition),
// the locales of the numbers and dates of the ones which are locales
const languagesOf = def => {
    const given = variants(def).map(d => d.options?.language).filter(l => typeof l == 'string');
    const globals = given.filter(l => l.startsWith('@')).map(l => l.slice(1));
    const values = [...given.filter(l => !l.startsWith('@')), ...globals.map(g => def.globals?.[g]),
        ...(def.formElements ?? []).filter(e => globals.includes(e?.ref) && Array.isArray(e.values)).flatMap(e => e.values.map(v => v?.value))];
    return [...new Set(values.filter(v => typeof v == 'string'))].filter(tag => {
        try {
            checkLocale(tag);
            return true;
        } catch {
            return false;
        }
    });
};

// the parts of the requirements, loaded at once, the coordinate systems by
// their name, the module of maps and the legend of colors are the result
const loadParts = need => {
    const parts = Promise.all([
        need.colors ? loadColors() : null,
        need.geo ? lazy.geo() : null,
        need.transforms ? loadTransforms() : null,
        need.colorLegend ? lazy.colorLegend() : null,
        need.inside ? lazy.inside() : null,
        Promise.all(need.coords.map(name => loadCoord(name))),
        ...need.locales.map(locale => loadLocale(locale)),
    ]).then(([, geo, , colorLegend, inside, coords]) =>
        ({ coords: new Map(need.coords.map((name, i) => [name ?? 'cartesian', coords[i]])), geo, colorLegend, inside }));
    // the errors are the ones of the load, not unhandled ones
    parts.catch(() => {});
    return parts;
};

// an error of the engine's form with the path of the definition, e.g.
// "marks[0].fill: ..." of "marks[0].props.fill: ..."
const authoredError = error => {
    const m = /^(marks|options|formElements|facets)\b([^\s:]*): /.exec(error?.message ?? '');
    return m ? new Error(`${authoredPath(m[1] + m[2])}: ${error.message.slice(m[0].length)}`, { cause: error }) : error;
};

// the definition of the attribute (an object or a JSON text) or, of null,
// the one of its url, and its url, undefined of the attribute
// a definition given with a url (`defUrl`, e.g. the prop defFile beside
// def) has the url as the one of its file: its parents, its data and its
// geometry are relative to it, e.g. a definition of a file edited on a page
const readDef = async (def, defUrl) => {
    if (def === null) {
        const url = resolveUrl(defUrl);
        return { def: parseDef(await fetchText(url), `'${url}'`), url };
    }
    return { def: typeof def == 'string' ? parseDef(def, 'attribute') : def, url: defUrl ? resolveUrl(defUrl) : undefined };
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

    // the merged definition of gen-vis 5 (`source`, one of gen-vis 4 is
    // migrated, see utils/migrate.js), resolved with its globals, translated
    // and normalized as the engine reads it, see utils/language.js and
    // utils/normalize.js, with the definitions of all values of its controls
    const merged = await resolveParents(JSON.parse(JSON.stringify(def)), url);
    const old = isDefinition4(merged);
    // also an inline one, its warnings name the paths of 5.0
    const migrated = old || merged[migratedKey] === true;
    const name = url === undefined ? 'inline definition' : url;
    if (migrated)
        console.info(`gen-vis ${url === undefined ? 'inline definition' : `'${url}'`}: ${old ? 'a definition' : 'parts of a definition'} of gen-vis 4, migrated while it is loaded, 'gen-vis migrate' writes ${old ? 'it' : 'them'} as one of gen-vis 5`);
    // the migration is a chunk of its own, definitions of 5.0 do not need it
    const source = old ? (await lazy.migrate()).migrate(merged) : merged;
    const engine = v => {
        try {
            return normalize(checkDims(translate(v)), { markTypes });
        } catch (error) {
            throw authoredError(error);
        }
    };
    const defOrg = engine(resolve(source, namesOfGlobals(source.globals, source.controls)));
    defOrg[variantsOf] = engineVariants(resolvedVariants(source), defOrg, engine);
    // the check of the definition (of 5.0, as written) with the rows, e.g.
    // of years as dates, see load, it is loaded meanwhile
    const validate = async rows => (await checks)?.validateDef(source, rows)
        .forEach(w => console.warn(`gen-vis ${name}${migrated ? ' (migrated from gen-vis 4, the paths are the ones of 5)' : ''}: ${w}`));
    return { url, defOrg, source, validate };
};

// the parts of a resolved definition the variants are needed for (see
// variants of utils/def.js): the columns, the types and the categories of
// the dims, the files of marks and transforms, the requirements of the load
// (coordinate systems, maps, transforms, locales), see requirements
const variantParts = v => JSON.stringify([v.dims, v.marks, v.filter, v.transform, v.geo, v.coord, v.locale, v.language, v.facets,
    v.hover, v.data, v.dataFormat]);

/**
 * The variants of the definition of the values of its controls as the
 * engine reads them (`engine(v)`, translated and normalized), the first one
 * is the one of the globals (`own`); a variant whose parts of variantParts
 * are the ones of an earlier variant is left out, e.g. the years of a
 * slider which only change the title, so only the ones which differ are
 * translated and normalized.
 */
const engineVariants = (resolved, own, engine) => {
    const seen = new Set();
    return resolved.flatMap((v, i) => {
        const key = variantParts(v);
        if (seen.has(key))
            return [];
        seen.add(key);
        return [i == 0 ? own : engine(v)];
    });
};

// the rows of the data of the attribute or of the url of the definition,
// the format by default the one of the extension of its url, parquet is
// read in the columns which are used
const loadRows = async (defOrg, url, data) => {
    let format = defOrg.dataFormat;
    let rows;
    let warn;
    if (data === null) {
        if (!defOrg.data)
            throw new Error('No data given, neither in the definition nor as attribute.');
        const dataUrl = resolveUrl(defOrg.data, url);
        format = dataFormat(dataUrl, format);
        warn = dataWarning(url, `'${dataUrl}'`);
        // (the rows of a url are shared by the charts of its file, see fetchRows)
        rows = await fetchRows(dataUrl, format, usedColumns(defOrg), warn);
    } else {
        warn = dataWarning(url, 'of the attribute');
        rows = raw(await readData(data, format, 'of the attribute', usedColumns(defOrg), warn));
    }
    // a chart of no rows is blank, a text of `empty` says why; not of rows
    // of the page, e.g. none while they are loaded
    const header = headers.get(rows);
    if (rows.length == 0 && !Array.isArray(data) && !defOrg.options?.empty)
        warn(`no rows${header?.some(c => c !== '') ? ` (only the header ${header.map(c => `'${c}'`).join(', ')})` : ''}, the chart is empty; 'empty' is a text instead of the marks`);
    return rows;
};

// the data of marks of their own, e.g. events, and of the lookups of
// transforms, also of the other values of the controls, by their url relative
// to the def, the rows are not evaluated as the ones of the definition, see
// layout.js
const loadFiles = async (defOrg, url) => {
    const all = variants(defOrg);
    const withFiles = [
        ...all.flatMap(d => [d.marks ?? []].flat()).filter(p => typeof p?.data == 'string'),
        ...all.flatMap(d => [d.transform ?? []].flat()).filter(t => t?.type == 'lookup' && typeof t.data == 'string'),
    ];
    return new Map(await Promise.all([...new Set(withFiles.map(p => p.data))].map(async data => {
        const dataUrl = resolveUrl(data, url);
        const format = dataFormat(dataUrl, withFiles.find(p => p.data == data).dataFormat);
        return [data, await fetchRows(dataUrl, format, null, dataWarning(url, `'${dataUrl}'`))];
    })));
};

/**
 * The prepared definition of the rows with the state and the globals of the
 * page (the types of the dims without one are the ones of their values,
 * see inferTypes), its defaults (the state of the definition, see utils/state.js) and
 * the columns of the transforms. The form elements can have the values of
 * the data, the state needs them. The transforms of the globals of the
 * state are computed before the dims, their categories can be the ones
 * of a transform, and again after them, e.g. of a global of a scale of
 * dates to utc, the entries of the legends are the ones of the state, e.g. of the
 * categories of another column.
 */
// the format of the names of the values of a form element of a column
// (`values.format`) in the locale of the definition: a time format of dates
// (a format with %), e.g. "%b %Y" of "2026-10", a number format otherwise
const valueFormat = locale => format => {
    const { time, number } = getLocale(locale ?? undefined);
    const f = format.includes('%') ? time.format(format) : number.format(format);
    return v => {
        const date = format.includes('%') ? toDate(v) : null;
        const n = Number(v);
        return date !== null ? f(new Date(date)) : (!format.includes('%') && v.trim() !== '' && Number.isFinite(n) ? f(n) : v);
    };
};

const prepare = (defOrg, source, rows, files, state, globals, symbols = {}) => {
    let columns = applyTransforms(rows, defOrg.transform, defOrg.globals, utcColumns(defOrg), null, files, defOrg.options?.locale);
    addDataValues(defOrg, rows, columns, valueFormat(defOrg.options?.locale));
    inferTypes(defOrg, rows, columns);
    const keysOf = (column, inOrder = false) => distinctValues(rows, columns, column, inOrder).map(String);
    const transform = () => {
        columns = applyTransforms(rows, prepared.transform, prepared.globals, utcColumns(prepared), columns, files, prepared.options?.locale);
    };
    // the types of the dims of the definition resolved again from the values
    const types = part => inferTypes(part, rows, columns);
    const resolving = { dataKeys: keysOf, files, symbols, source, markTypes, types };
    const prepared = prepareDef(JSON.parse(JSON.stringify(defOrg)), resolving);
    const defaults = snapshot(prepared);
    applyState(prepared, state);
    applyGlobals(prepared, globals);
    applyResolved(prepared, defOrg, { ...resolving, transform });
    applyState(prepared, { visible: state?.visible });
    transform();
    // the values of the columns of the transforms of the globals of the
    // state and the page, not of the definition, e.g. the classes of a bin,
    // their names in the language and locale of the definition prepared
    const language = languageOf(prepared.options, prepared.globals);
    // a global which is none of the new values is the last one, the
    // definition resolved again with it, e.g. of a filter
    if ((columns.steps.length > 0 || language !== undefined)
        && updateDataValues(defOrg, prepared, rows, columns, valueFormat(prepared.options?.locale), () => true, language,
            ref => globals?.[ref] !== undefined).length > 0) {
        applyResolved(prepared, defOrg, { ...resolving, transform });
        transform();
    }
    return { prepared, defaults, columns };
};

/**
 * The warnings of the channels of marks which name neither a dim nor a
 * column of the data (of the rows or of a transform), e.g. a typo of
 * `"x": "yaer"`: a channel which names no dim is the dim of its column (see
 * implicitDims of utils/language.js), of the definition `source` resolved
 * with the `globals`; none without rows, unless the header of CSV names
 * the columns.
 */
const missingColumns = (source, globals, rows, columns) => {
    const data = sourceRows(rows, columns);
    // without rows the columns of the header of CSV, if there is one
    const header = data === rows ? headers.get(rows) : undefined;
    if (!data?.length && !header)
        return [];
    let resolved;
    try {
        resolved = resolve(source, namesOfGlobals(globals, source.controls));
    } catch {
        return [];
    }
    const names = [...new Set([...(data.length ? Object.keys(data[0]) : header), ...columns.keys(), ...[...madeColumns(resolved.transform)].map(c => fillTemplate(String(c), globals ?? {}))])];
    const known = new Set(names);
    // (also the columns of the rows of the mark of its own, `data`)
    const ownOf = path => {
        const i = /^marks\[(\d+)\]/.exec(path)?.[1];
        const data = i === undefined ? undefined : [resolved.marks ?? []].flat()[+i]?.data;
        return Array.isArray(data) ? data : [];
    };
    const implicit = implicitDims(resolved);
    return implicit.filter(d => !known.has(d.column) && !ownOf(d.path).some(r => isObject(r) && Object.hasOwn(r, d.column))).map(d => `${d.path}: no dim and no column '${d.column}' in the data, `
        + `the dims are ${Object.keys(isObject(source.dims) ? source.dims : {}).map(n => `'${n}'`).join(', ') || 'none'}, the columns ${names.map(n => `'${n}'`).join(', ')}`);
};

// the references of the attributes of the marks (also of their highlight
// and others) to columns of the data which are no dim (nor a global or a
// prop of categories): a row has the values of the dims, so they have no
// value, a warning instead of empty texts (the check warns of every unknown
// reference), e.g. "@note" of a column `note`, or "@Jahr" of the dim `x`
const columnReferences = (prepared, rows, columns) => {
    const data = sourceRows(rows, columns);
    if (!data?.length)
        return [];
    const dims = prepared.dims ?? {};
    const own = new Set([...Object.keys(dims), ...Object.keys(prepared.globals ?? {}),
        ...Object.values(dims).flatMap(m => Object.values(m?.categoryProps ?? {}).flatMap(p => Object.keys(p ?? {})))]);
    const dimOf = new Map(Object.entries(dims).map(([n, m]) => [m?.column, n]));
    const columnNames = new Set([...Object.keys(data[0]), ...columns.keys()]);
    const warnings = [];
    [].concat(prepared.marks ?? []).forEach((p, i) => [['props', p?.props], ['highlight', p?.highlight], ['others', p?.others]]
        .filter(([, props]) => isObject(props)).forEach(([part, props]) => Object.entries(props).forEach(([k, v]) => {
            let names;
            try {
                names = refNames(v);
            } catch {
                return;
            }
            [...new Set(names.filter(n => typeof n == 'string').map(n => n.split(':')[0]))].filter(n => columnNames.has(n) && !own.has(n)).forEach(n => {
                const path = authoredPath(part == 'props' ? `marks[${i}].props.${k}` : `marks[${i}].${part}.${k}`);
                warnings.push(dimOf.has(n) ? `${path}: '@${n}' is the column of the dim '${dimOf.get(n)}', a reference names the dim: @${dimOf.get(n)}`
                    : `${path}: '@${n}' is a column of the data without a dim, it has no value: a reference names a dim, e.g. "dims": { "${n}": "${n}" }`);
            });
        })));
    return warnings;
};

// the geometries of maps of the definition and of the other values of its
// controls, of the url of GeoJSON or TopoJSON or itself, by their key (see
// geoData), a control can switch to another one, e.g. of other regions
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
// marks and transforms and the geometries of maps (an error of one is the
// one of the load, the others are handled by Promise.all), the prepared
// definition and the geometry of its map. The coordinate systems and the
// geometries of all values of the controls are kept, a control can switch
// them.
const load = async ({ def = null, defUrl = null, data = null, state = null, globals = null, check = false, defaults: chartDefaults = null }) => {
    const { url, defOrg, source, validate } = await resolveDef({ def, defUrl, data, check });
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
    const [{ coords, geo: geoModule, colorLegend, inside }, rows, files, geometries] = loaded;
    await validate(rows);
    let ready;
    try {
        ready = prepare(defOrg, source, rows, files, state, globals, symbolDefaults(chartDefaults));
    } catch (error) {
        throw authoredError(error);
    }
    const { prepared, defaults, columns } = ready;
    // (with the check its warning of such a channel, see validateDef, not twice)
    if (!check)
        [...missingColumns(source, prepared.globals, rows, columns), ...columnReferences(prepared, rows, columns)]
            .forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));
    // the values the dims cannot use, e.g. "1,234" among numbers
    const odd = new Map();
    const prepRows = raw(prepareData(rows, prepared, columns, odd));
    oddValues(prepared, odd).forEach(w => console.warn(`gen-vis ${url ?? 'inline definition'}: ${w}`));

    return {
        defUrl: url ?? null,
        defOrg,
        source,
        colorLegend: colorLegend ? colorLegend.default : null,
        coords,
        coord: coords.get(prepared.options.coord ?? 'cartesian'),
        geoModule: geoModule ?? null,
        inside: inside ?? null,
        geometries,
        geo: loadGeo(geometries, geoModule, prepared),
        files,
        rows,
        columns,
        def: prepared,
        defaults,
        data: prepRows,
    };
};
