export { createGenVis, propNames };

import { createStore } from '@/store.js';
import { sameValue } from "@/utils/def";
import { copyImage } from '@/utils/clipboard.js';
import { lazy } from '@/utils/lazy';
import { pixelsOf } from '@/utils/warn';
import { layout } from '@/layout';
import { el, emitter, setText } from '@/comp/html';
import { createVis } from '@/comp/vis';
import '@/styles.css';

// the heights of the visualisations drawn on the page by their definition,
// one drawn again, e.g. after a navigation of the page, has the space of
// the one before while it is loaded, the last ones are kept
const heights = new Map();
const keptHeights = 500;

// the props and their defaults, see docs/usage.md "Props", `slots` are the
// functions of the slots (see docs/usage.md "Events and slots"), props `on…` of a
// function are listeners of the events, e.g. `onSelect`
const defaults = {
    // shows the prepared definition, its warnings are logged, see check
    debug: false,
    // the warnings of the check of the definition in the console, e.g.
    // unknown mark types, while it is written, the check is only loaded then
    check: false,
    defFile: null,
    // an object or a JSON string
    def: null,
    // rows, a CSV/JSON string or parquet as an ArrayBuffer or Uint8Array
    data: null,
    // the changes of the user, e.g. kept by the page, see utils/state.js,
    // the event update:state has every change
    state: null,
    // the globals of the page, e.g. the language, also of hidden form
    // elements, they are applied without loading it again
    globals: null,
    // the rows highlighted by the page, values of dims, e.g. the
    // country under the mouse of another chart, { "country": "AT" }
    highlight: null,
    // the defaults of the parts of the chart instead of the built-in ones,
    // e.g. { "axis": { "padding": 2, "tickMarks": { "size": 4 } } }, values
    // of the definition take precedence, see utils/defaults.js
    defaults: null,
    // a button in the footer to save it as a PNG, a string is the name of the file
    download: false,
    // a button in the footer to copy the PNG to the clipboard
    copy: false,
    // a button in the footer to save the data shown as CSV, a string is the name of the file
    csv: false,
    // a button in the footer to save it as an SVG, a string is the name of the file
    svg: false,
    // a button in the footer which shows the rows as a table instead of the
    // plots and the chart again, see showTable
    table: false,
    // the width of the images, independent of the screen, the one of the
    // definition otherwise or 800, `screen` is the one on the screen
    imageWidth: null,
    // loads the definition and the data when the visualisation is near
    // the viewport, true within one height of it, a string is the rootMargin of the
    // IntersectionObserver, e.g. "800px 0px", a number pixels, see observe
    lazy: false,
    // the content of the header, the footer, the buttons and the hover, functions
    // of their props which return a node, a text or null
    slots: null,
};
const propNames = Object.keys(defaults);

// the events, see docs/usage.md "Events and slots"
const events = { onRendered: 'rendered', onError: 'error', onHover: 'hover', onSelect: 'select', 'onUpdate:state': 'update:state' };

// the margin of a lazy visualisation (see observe), one height of the
// viewport, a string of the prop `lazy` (its numbers without a unit are
// pixels, e.g. "800" of data-lazy) or a number of pixels
const defaultMargin = '100% 0px';
const rootMarginOf = lazy => typeof lazy == 'number' && Number.isFinite(lazy) ? `${lazy}px`
    : typeof lazy == 'string' && lazy.trim() ? lazy.trim().split(/\s+/).map(m => /^-?\d*\.?\d+$/.test(m) ? `${m}px` : m).join(' ')
    : defaultMargin;

// a copy of JSON, e.g. of the globals given by the page, the store changes its own
const copyOf = v => v ? JSON.parse(JSON.stringify(v)) : null;

/**
 * A visualisation in `element` (in a new element `.vis-outer` at its end,
 * with `{ root: true }` the element is the one of the visualisation), see
 * docs/usage.md. `props` are the props of docs/usage.md "Props", `slots` and the
 * listeners of the events (e.g. `onSelect`). Returns the visualisation:
 * `update(props)` changes props (together in a microtask, a new
 * definition or new data is loaded again, a new state, globals and
 * highlight are applied), `on(event, fn)` and `off(event, fn)` of the
 * events, `destroy()` removes it (of `root` the element stays, without
 * its content, its classes and its min-height), the methods of the files (`exportPng`,
 * `copyPng`, `image`, `exportSvg`, `exportCsv`), `showTable(on)`, `setHighlight(entry)`, `state` (the
 * changes of the user) and `el`, its element.
 */
const createGenVis = (element, given = {}, { root = false } = {}) => {
    const props = { ...defaults };
    const bus = emitter();
    const store = createStore();
    const outer = root ? element : el('div', { class: 'vis-outer' });
    let error = null;
    // the error is one of a draw of the definition loaded, not of its load:
    // the controls stay above it (see `failed` of createVis), a change of
    // the state, the globals or the width draws it again, see retry
    let drawFailed = false;
    let errorEl = null;
    let debugEl = null;
    let vis = null;
    let visLoads = null;
    let observer = null;
    // the observer of the load ahead and the load, see observe
    let ahead = null;
    let prefetched = null;
    let removed = false;
    let heightKey = null;
    // the height of the visualisation of the same definition and width
    // drawn before, null if there is none, see heights
    let reserved = null;
    // the min-height set of it while it is loaded and the one of the page
    // before, which it has again, see release
    let held = null;
    // the props given while they are applied, see update
    let pending = null;
    // a reload without a state of the page keeps the state of the chart
    // (`ownState`, also the changes of the user while it is loaded), as if
    // the page had passed it back, see apply and wantedState
    let keepOwn = false;
    let ownState = null;
    // the definition object of the load as JSON, a new object of the same
    // content is not loaded again, e.g. one written in a template of Vue,
    // a new one of every render of the page (not the data, a structural
    // compare of many rows would cost more than it saves)
    let loadedDef = null;
    // the listeners of the props, see setListeners
    const propListeners = {};
    // the table instead of the plots, also of a definition loaded again,
    // not of the state, see showTable
    let tableShown = false;

    const emit = (name, ...args) => {
        if (!removed)
            bus.emit(name, ...args);
    };

    // the listeners of the props `on…`, e.g. of mountGenVisElement
    const setListeners = next => {
        Object.entries(events).forEach(([prop, name]) => {
            if (!(prop in next) || next[prop] === propListeners[prop])
                return;
            if (propListeners[prop])
                bus.off(name, propListeners[prop]);
            propListeners[prop] = next[prop];
            if (typeof next[prop] == 'function')
                bus.on(name, next[prop]);
        });
    };
    const assign = next => {
        setListeners(next);
        propNames.filter(k => k in next).forEach(k => props[k] = next[k] === undefined ? defaults[k] : next[k]);
    };
    assign(given);

    // nothing is drawn yet, the space is the one drawn before or the css
    // variable --gen-vis-loading-height
    const waiting = () => !store.loaded && !error;

    // the root, the error or the visualisation, and the prepared definition of debug
    const render = () => {
        if (removed)
            return;
        const wait = waiting();
        outer.classList.add('vis-outer');
        outer.classList.toggle('vis-loading', wait);
        if (wait && reserved) {
            held ??= { before: outer.style.minHeight };
            outer.style.minHeight = held.value = `${reserved}px`;
        } else
            release();
        if (error && !drawFailed) {
            errorEl ??= el('div', { class: 'vis-error' });
            setText(errorEl, error);
            outer.insertBefore(errorEl, outer.firstChild);
        } else if (errorEl) {
            errorEl.remove();
            errorEl = null;
        }
        drawDebug();
    };

    const release = () => {
        if (held && outer.style.minHeight === held.value)
            outer.style.minHeight = held.before;
        held = null;
        if (outer.hasAttribute('style') && !outer.getAttribute('style'))
            outer.removeAttribute('style');
    };

    // the prepared definition and the one of the file, e.g. while it is written
    const drawDebug = () => {
        if (props.debug && store.def) {
            if (!debugEl) {
                const pre = () => el('pre', { style: 'height: 500px; overflow: auto; font-size: 11px;' });
                debugEl = el('div', null, el('h3', null, 'prepared:'), pre(), el('h3', null, 'org:'), pre());
            }
            const [, prepared, , org] = debugEl.children;
            setText(prepared, JSON.stringify(store.def, null, 4));
            setText(org, JSON.stringify(store.defOrg, null, 4));
            if (debugEl.parentNode !== outer || debugEl.nextSibling)
                outer.appendChild(debugEl);
        } else if (debugEl) {
            debugEl.remove();
            debugEl = null;
        }
    };

    // the visualisation of the definition loaded, a new definition is drawn
    // anew, the one before is shown while it is loaded
    const showVis = () => {
        if (error || !store.loaded) {
            dropVis();
            return;
        }
        if (vis && visLoads === store.loads)
            return;
        dropVis();
        visLoads = store.loads;
        // errors of the draw are shown instead of it
        try {
            vis = createVis(visApp);
            outer.insertBefore(vis.el, debugEl && debugEl.parentNode === outer ? debugEl : null);
            vis.mounted();
        } catch (e) {
            showError(e, true);
            return;
        }
        // the facets are drawn, once it is in the page
        const drawn = vis;
        queueMicrotask(() => {
            if (vis === drawn)
                rendered();
        });
    };
    // (also of a listener of the last `hover` which destroys it meanwhile)
    const dropVis = () => {
        const drop = vis;
        if (!drop)
            return;
        vis = null;
        visLoads = null;
        drop.destroy();
        drop.el.remove();
    };

    // the parts of the visualisation of the props, the slots and the files
    const visApp = {
        store,
        props: () => props,
        slots: () => props.slots,
        emit,
        files: { save: () => exportPng(), copy: () => copyPng(), csv: () => exportCsv(), svg: () => saveSvg() },
        table: { shown: () => tableShown, show: on => showTable(on) },
        stateChanged: () => {
            ownState = store.state;
            emit('update:state', ownState);
        },
        // after every draw, e.g. of a new width or a legend toggled
        drawn: () => {
            drawDebug();
            measureLater();
        },
        showError: e => showError(e, true),
        retry: () => queueMicrotask(retry),
    };

    // a lazy visualisation waits until it is near the viewport (one height
    // of the viewport above or below it, or the margin of `lazy`), then it
    // is drawn with the props it has then, also the ones changed while it
    // waited, and stays drawn, false if it does not wait, e.g. without an
    // IntersectionObserver (old browsers, jsdom). Ahead of it (three heights
    // of the viewport) its files and data are loaded and prepared when the
    // browser is idle, so it is drawn at once when it comes near.
    const observe = () => {
        if (props.lazy === false || typeof IntersectionObserver != 'function')
            return false;
        const near = entries => {
            if (entries.some(e => e.isIntersecting)) {
                stopObserving();
                init();
            }
        };
        // a margin the browser refuses is the default one
        try {
            observer = new IntersectionObserver(near, { rootMargin: rootMarginOf(props.lazy) });
        } catch (e) {
            console.warn(`gen-vis: lazy: the margin '${props.lazy}' is not one of an IntersectionObserver, e.g. "800px 0px", one height of the viewport is used: ${e.message}`);
            observer = new IntersectionObserver(near, { rootMargin: defaultMargin });
        }
        observer.observe(outer);
        ahead = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                stopAhead();
                whenIdle(prefetch);
            }
        }, { rootMargin: '300% 0px' });
        ahead.observe(outer);
        return true;
    };
    const stopObserving = () => {
        observer?.disconnect();
        observer = null;
        stopAhead();
    };
    const stopAhead = () => {
        ahead?.disconnect();
        ahead = null;
    };
    const whenIdle = fn => typeof requestIdleCallback == 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 100);

    // the sources of the load of the store, the ones of the props
    const sources = () => ({ def: props.def, defUrl: props.defFile, data: props.data, state: wantedState(), globals: props.globals,
        defaults: props.defaults, check: props.check || props.debug });
    // the load of a visualisation still waiting (see observe) with its
    // sources, null if the props changed since, the draw loads it anew
    const prefetch = () => {
        if (removed || !observer || prefetched || (props.def === null && props.defFile === null))
            return;
        const given = sources();
        const done = store.init(given);
        // its errors are the ones of the draw, not unhandled ones before it
        done.catch(() => {});
        prefetched = { given, done };
    };
    const prefetchedFor = given => {
        const p = prefetched;
        prefetched = null;
        return p && ['def', 'defUrl', 'data', 'defaults', 'check'].every(k => p.given[k] === given[k]) ? p.done : null;
    };

    // the definition of the visualisation, the key of its height; not with
    // its width, which would force a layout of the page at the mount of
    // every chart, the height of the same definition at another width is
    // only a guess of the space, the real one follows with the draw
    const sourceKey = () => props.defFile ?? (typeof props.def == 'string' ? props.def : JSON.stringify(props.def));

    const init = async () => {
        // the props are used when it is near the viewport
        if (observer || removed)
            return;
        heightKey = sourceKey();
        loadedDef = props.def && typeof props.def == 'object' ? JSON.stringify(props.def) : null;
        // the definition loaded before is not shown when it is ready
        if (props.def === null && props.defFile === null) {
            store.cancel();
            return showError(new Error('No definition given.'));
        }
        try {
            // a definition loaded after a newer one was given is not shown,
            // the one loaded ahead of the same sources is (see prefetch), its
            // state and globals are the ones of the props below
            const given = sources();
            if (!await (prefetchedFor(given) ?? store.init(given)))
                return;
            store.highlighted = copyOf(props.highlight);
            // the error is kept while the new definition is loaded, a
            // definition which could not be drawn is not drawn again meanwhile
            error = null;
            drawFailed = false;
            // the state and the globals might have changed while loading,
            // the store has the ones given when it started, the visualisation
            // before is not drawn with them
            dropVis();
            syncState();
            syncGlobals();
            // the choices of the user which do not apply anymore, e.g. a
            // category which is not in the new data, are the defaults now
            if (keepOwn && !sameValue(ownState ?? {}, store.state)) {
                ownState = store.state;
                emit('update:state', ownState);
            }
            showVis();
            render();
        } catch (e) {
            showError(e);
        }
    };

    const rendered = () => {
        measureLater();
        emit('rendered');
    };

    // the height of a draw is measured at the next frame, when the browser
    // lays the page out anyway, a measure now would lay it out once more,
    // e.g. of every chart of a page drawn at once; the destroy measures it
    // only if that frame has not come yet (`unmeasured`), a measure of every
    // chart removed would lay out the page once per chart
    let unmeasured = false;
    const measureLater = () => {
        if (unmeasured)
            return;
        unmeasured = true;
        requestAnimationFrame(() => {
            if (!removed && unmeasured)
                remember();
        });
    };

    // the height of the visualisation drawn, see heights
    const remember = () => {
        unmeasured = false;
        if (!store.loaded || error || props.debug)
            return;
        heights.delete(heightKey);
        heights.set(heightKey, Math.round(outer.getBoundingClientRect().height));
        if (heights.size > keptHeights)
            heights.delete(heights.keys().next().value);
    };

    // the state the chart shows: the one of the page, after a reload
    // without one its own one, see keepOwn
    const wantedState = () => keepOwn ? ownState : props.state;
    // only if it differs, the own updates of update:state come back
    // unchanged; true if it was set
    const syncState = () => {
        const state = wantedState();
        if (!store.loaded || sameValue(state ?? {}, store.state))
            return false;
        store.setState(state);
        return true;
    };
    const syncGlobals = () => {
        if (!store.loaded || sameValue(props.globals ?? {}, store.globals ?? {}))
            return false;
        store.setGlobals(copyOf(props.globals));
        return true;
    };

    // the definition whose draw failed drawn again, e.g. of another value
    // of a control, its error again if it fails again
    const retry = () => {
        if (!drawFailed || removed)
            return;
        drawFailed = false;
        error = null;
        dropVis();
        showVis();
        render();
    };

    // the elements of the rows of the values of dims in all facets,
    // e.g. { "country": "AT" }, null ends it, the hover of the chart
    // replaces it while it is shown; it is the prop `highlight`, so one
    // set while it is loaded is shown once it is drawn
    const setHighlight = entry => {
        props.highlight = entry ?? null;
        store.highlighted = copyOf(entry);
        vis?.highlight({});
    };

    // not after it was removed, e.g. a load failing later; an error of a
    // draw (`drawn`) of the definition loaded is shown below its controls,
    // not one of the controls themselves
    const showError = (e, drawn = false) => {
        if (removed)
            return;
        console.error(e);
        error = e.message;
        const again = vis?.failed;
        dropVis();
        drawFailed = drawn && store.loaded && !again;
        if (drawFailed) {
            try {
                vis = createVis(visApp, error);
                visLoads = store.loads;
                outer.insertBefore(vis.el, debugEl && debugEl.parentNode === outer ? debugEl : null);
                vis.mounted();
            } catch {
                dropVis();
                drawFailed = false;
            }
        }
        render();
        emit('error', e.message);
    };

    // the exports need the visualisation loaded, also while a new definition
    // or new data is loaded they are refused, the image would be drawn
    // with the props of the new one and the rows of the one before
    const assertLoaded = () => {
        if (!store.loaded)
            throw new Error('The visualisation is not loaded yet, e.g. a lazy one out of view.');
        if (store.loading)
            throw new Error('The visualisation is not loaded yet, a new definition or new data is loaded.');
        if (error)
            throw new Error(`The visualisation shows an error, there is nothing to export: ${error}`);
    };

    // a copy of the visualisation for the images (see staticCopy of
    // utils/export.js), the width of the images and the module of the export
    const imageSource = async () => {
        assertLoaded();
        // the rows already loaded, the data is not loaded and parsed again,
        // taken before the export is loaded, a new definition given
        // meanwhile is not drawn with the rows of this one
        const def = store.def;
        const copy = {
            def: props.def, defFile: props.defFile, data: store.rows,
            state: JSON.parse(JSON.stringify(store.state)),
            globals: props.globals,
            defaults: props.defaults,
            slots: props.slots,
        };
        // the classes of the page, e.g. of the styles of a card
        const classes = [...outer.classList].filter(c => c != 'vis-loading' && c != 'vis-outer');
        const exporting = await lazy.exporting();
        // the width of `imageWidth` is the one of the chart, also of a
        // definition with a width of its own, see staticCopy
        // (of a hidden chart, which has no width on the screen, the one of
        // the definition or the default)
        const fixed = Boolean(props.imageWidth);
        const screen = props.imageWidth == 'screen' ? outer.querySelector('.vis')?.getBoundingClientRect().width : null;
        const width = screen || Number((props.imageWidth != 'screen' && props.imageWidth) || pixelsOf(def.width) || exporting.defaultWidth);
        const mount = (holder, done) => {
            const shown = createGenVis(holder, { ...copy, onRendered: done.resolve, onError: done.reject });
            shown.el.classList.add(...classes);
            return shown;
        };
        return { exporting, mount, width, fixed };
    };

    // the visualisation as a PNG (a Blob) without the controls, of a
    // copy of the width of the images, see utils/export.js
    const image = async () => {
        const { exporting, mount, width, fixed } = await imageSource();
        return await exporting.renderImage(outer, mount, { width, fixed });
    };

    // the visualisation as an SVG (a string) of the copy of the images, of
    // the `parts` chosen, see docs/export.md and utils/export-svg.js
    const exportSvg = async (options = {}) => {
        const { exporting, mount, width, fixed } = await imageSource();
        return await exporting.renderSvg(outer, mount, { ...options, width, fixed });
    };

    // the name of a file, the one of the prop, e.g. `download`, or the
    // title (with the values of the globals)
    const fileName = prop => {
        const title = store.def.title;
        return typeof prop == 'string' && prop ? prop : (title ? store.text(title) : 'gen-vis');
    };

    // the name of the file is the argument or the one of fileName
    const exportPng = async name => {
        const png = await image();
        const { saveFile } = await lazy.exporting();
        saveFile(png, `${name ?? fileName(props.download)}.png`);
    };
    // the rows shown in the columns of their dims, see utils/export.js
    const exportCsv = async name => {
        assertLoaded();
        const { saveFile, csvOf } = await lazy.exporting();
        const rows = layout(store, store.totalWidth).rows;
        saveFile(new Blob([csvOf(store, rows)], { type: 'text/csv' }), `${name ?? fileName(props.csv)}.csv`);
    };
    const copyPng = () => copyImage(image());

    // the rows shown as a table instead of the plots (true) or the chart
    // (false), without an argument the other one, e.g. of a button of the
    // page, see drawTable of utils/table.js
    const showTable = (on = !tableShown) => {
        tableShown = Boolean(on);
        vis?.invalidate();
    };
    const saveSvg = async () => {
        const svg = await exportSvg();
        const { saveFile } = await lazy.exporting();
        saveFile(new Blob([svg], { type: 'image/svg+xml' }), `${fileName(props.svg)}.svg`);
    };

    // the props given since the last update, applied together: a new
    // definition or new data is loaded again, the others are applied
    const apply = () => {
        const next = pending;
        pending = null;
        if (!next || removed)
            return;
        // the root again, e.g. of the Vue adapter after Vue set its classes
        render();
        const before = { ...props };
        assign(next);
        const changed = k => k in next && next[k] !== before[k];
        // other defaults are drawn anew, the same ones of a new object not
        const newDef = changed('def') && !(loadedDef !== null && props.def && typeof props.def == 'object' && JSON.stringify(props.def) === loadedDef);
        const reload = newDef || changed('defFile') || changed('data') || (changed('defaults') && !sameValue(next.defaults ?? null, before.defaults ?? null));
        // a state of the page wins, without one a reload keeps the chart's own one
        if ('state' in next)
            keepOwn = false;
        else if (reload && store.loaded) {
            keepOwn = true;
            ownState = store.state;
        }
        if (reload)
            init();
        // a waiting visualisation which is not lazy anymore is loaded
        if (changed('lazy') && props.lazy === false && observer) {
            stopObserving();
            init();
        }
        if (!reload) {
            const set = ['state' in next && syncState(), 'globals' in next && syncGlobals()];
            // a draw which failed is tried again with them
            if (set.some(Boolean))
                retry();
        }
        if ('highlight' in next)
            setHighlight(props.highlight);
        // without the button the chart is shown
        if (changed('table') && !props.table)
            tableShown = false;
        if (['download', 'copy', 'csv', 'svg', 'table', 'slots'].some(changed))
            vis?.invalidate();
        if (changed('debug'))
            render();
    };

    const instance = {
        el: outer,
        store,
        // the changes of the user, see docs/usage.md "State", and the props
        get state() { return store.state },
        get props() { return { ...props } },
        update(next = {}) {
            pending = { ...pending, ...next };
            queueMicrotask(apply);
            return instance;
        },
        on(name, fn) {
            bus.on(name, fn);
            return instance;
        },
        off(name, fn) {
            bus.off(name, fn);
            return instance;
        },
        image,
        exportSvg,
        exportPng,
        exportCsv,
        copyPng,
        showTable,
        setHighlight,
        destroy() {
            if (removed)
                return;
            stopObserving();
            if (unmeasured)
                remember();
            // a definition still loaded is not shown, nor its error
            store.cancel();
            // a hover shown ends with `hover` null, e.g. for the highlights
            // of other charts linked by the page, the last event
            dropVis();
            removed = true;
            bus.clear();
            // the element of the page is left as it was, without the
            // classes and the space of the visualisation
            if (root) {
                outer.replaceChildren();
                outer.classList.remove('vis-outer', 'vis-loading');
                release();
                if (outer.hasAttribute('class') && !outer.getAttribute('class'))
                    outer.removeAttribute('class');
            } else
                outer.remove();
        },
    };

    if (!root)
        element.appendChild(outer);
    reserved = heights.get(sourceKey()) ?? null;
    render();
    if (!observe())
        init();
    return instance;
};
