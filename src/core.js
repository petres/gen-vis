// the standalone script as a classic script, e.g. of a page which loads its
// scripts without modules, small, it loads the module of esm/ next to it
// (~90 kB gzipped at first, the parts a chart needs when it needs them), see
// the readme. Its functions are the globals at once, they return promises,
// e.g. of the components, and wait for the module; `GenVis.ready` is the
// module itself, e.g. for registerPlotType with perRow.
const names = ['mountGenVisElement', 'mountGenVisByClass', 'unmountGenVisElement', 'registerPlotType', 'registerCoord'];

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
