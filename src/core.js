// A classic script for pages without modules. It is small and loads the
// module esm/gen-vis.js next to it (68 kB gzipped at first), see
// docs/usage.md. Its functions exist at once, return promises and wait for
// the module. Functions which must return at once (perRow, perGroup,
// createVueComponent, vuePlugin) are on the module: `(await GenVis.ready)`.
const names = ['createGenVis', 'mountGenVisElement', 'mountGenVisByClass', 'unmountGenVisElement', 'registerPlotType', 'registerCoord', 'registerScheme', 'registerDefaults'];

// the url of this script, of the page if it is not known, e.g. of a script
// added by another one after the page was loaded
const base = document.currentScript?.src || document.baseURI;
const ready = import(/* @vite-ignore */ new URL('esm/gen-vis.js', base).href);
ready.catch(error => console.error(`gen-vis: could not load ${new URL('esm/gen-vis.js', base).href}: ${error.message}`));

const later = name => (...args) => ready.then(module => module[name](...args));
const GenVis = { ...Object.fromEntries(names.map(n => [n, later(n)])), ready };
const globals = { mountGenVisElement: GenVis.mountGenVisElement, mountGenVisByClass: GenVis.mountGenVisByClass, unmountGenVisElement: GenVis.unmountGenVisElement };

// the module sets its own globals, which return the components at once,
// the ones of this script stay, so they always return promises
Object.assign(window, { GenVis }, globals);
ready.then(() => Object.assign(window, globals), () => {});
