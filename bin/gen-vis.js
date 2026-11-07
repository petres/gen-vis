#!/usr/bin/env node
// the command line of gen-vis, see docs/export.md:
//   gen-vis export <def.json> <out.svg|out.png|out.pdf>... [<def.json> <out>...]... [options]
import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createExporter, formats } from './export.js';
import { stopBrowsers } from './cdp.js';

const usage = `Usage: gen-vis export <def.json> <out.svg|out.png|out.pdf>... [<def.json> <out>...]... [options]
       gen-vis migrate <def.json>... [--write]

Draws gen-vis definitions in a headless Chromium (Chrome, Edge) of the system
and writes them as SVG, PNG or PDF, every definition is followed by its
outputs, one browser draws them all.

Options:
  --width <length>        the width of the image: 800 (pixels), 800px, 16cm, 160mm, 6in (default 800)
  --parts <list>          the parts of the image, of title,subtitle,selection,legend,plot,footer (default all)
  --css <file|text>       a stylesheet, repeatable
  --class <name>          a class of the element of the chart, e.g. of a theme, repeatable
  --font-size <length>    the size of the texts of gen-vis, e.g. 8pt (the title in proportion)
  --dpi <n> | --scale <n> the pixels of the PNG: dots per inch, or pixels per CSS pixel (default 2)
  --globals <json>        the globals, e.g. '{"lang": "en"}'
  --state <json>          the state, e.g. '{"visible": {"land": {"Wien": false}}}'
  --defaults <json|file>  the defaults of the parts instead of the built-in ones, a JSON text or
                          file, e.g. '{"axis": {"padding": 2, "tickMarks": {"size": 4}}}'
  --data <file>           the data instead of the one of the definition (CSV, JSON or parquet)
  --background <color>    the background, none for none (default the one of gen-vis, white)
  --scheme <name=colors>  a scheme of colors, e.g. wifo=#005CA9,#E6A000, repeatable
  --unit <px|cm|mm|in>    the unit of the size of the SVG (default the one of the width)
  --padding <px>          the space around the chart (default 15)
  --timeout <ms>          the time to wait for a chart (default 30000)
  --root <dir>            the directory of site-absolute paths, e.g. /geo/europe.json (a site's root)
  --browser <path>        the browser (default GEN_VIS_BROWSER, CHROME_PATH or one found)
  --no-sandbox            runs the browser without its sandbox (also GEN_VIS_NO_SANDBOX=1)
  -h, --help              this text

migrate writes definitions of gen-vis 4 as ones of gen-vis 5 (also parents
and mixins, file by file): to the standard output, with --write into the
files themselves. A patch of a form element becomes an expression of its
global (a match); check the fallback of a patch of a part of a parent.
`;

const fail = (message, code = 2) => {
    process.stderr.write(`gen-vis: ${message}\n`);
    process.exit(code);
};

const json = (value, name) => {
    if (value === undefined)
        return undefined;
    try {
        return JSON.parse(value);
    } catch (error) {
        fail(`--${name} is not JSON: ${error.message}`);
    }
};

// the defaults of --defaults, a JSON text (it begins with a {) or a file of one
const defaultsOf = value => {
    if (value === undefined)
        return undefined;
    if (!value.trim().startsWith('{') && !existsSync(value))
        fail(`--defaults is a JSON object or a file of one, ${value} does not exist`);
    const defaults = json(value.trim().startsWith('{') ? value : readFileSync(value, 'utf8'), 'defaults');
    if (defaults === null || typeof defaults != 'object' || Array.isArray(defaults))
        fail(`--defaults is a JSON object, e.g. '{"axis": {"padding": 2}}', not ${JSON.stringify(defaults)}`);
    return defaults;
};

// the schemes of --scheme name=#hex,#hex
const schemesOf = list => list.length ? Object.fromEntries(list.map(s => {
    const m = s.match(/^([^=]+)=(.+)$/);
    if (!m)
        fail(`--scheme is name=color,color,..., e.g. wifo=#005CA9,#E6A000, not ${s}`);
    return [m[1].trim(), m[2].split(',').map(c => c.trim()).filter(Boolean)];
})) : undefined;

// the definitions and their outputs, every argument which is not an output
// (.svg, .png, .pdf) is a definition
const chartsOf = positionals => {
    const charts = [];
    for (const p of positionals) {
        if (formats.includes(path.extname(p).slice(1).toLowerCase())) {
            if (!charts.length)
                fail(`the output ${p} has no definition before it`);
            charts.at(-1).outputs.push(p);
        } else
            charts.push({ def: p, outputs: [] });
    }
    const without = charts.filter(c => !c.outputs.length);
    if (!charts.length || without.length)
        fail(without.length ? `the definition ${without[0].def} has no output (.svg, .png or .pdf)` : 'no definition given\n\n' + usage);
    return charts;
};

// a positive number of an option, 0 too if `zero`
const number = (value, name, zero = false) => {
    if (value === undefined)
        return undefined;
    const n = value.trim() ? Number(value) : NaN;
    if (!(zero ? n >= 0 : n > 0) || n == Infinity)
        fail(`--${name} is a ${zero ? 'number of 0 or more' : 'positive number'}, not ${value}`);
    return n;
};

const exportCommand = async args => {
    let parsed;
    try {
        parsed = parseArgs({
            args, allowPositionals: true, strict: true,
            options: {
                width: { type: 'string' }, parts: { type: 'string' }, css: { type: 'string', multiple: true },
                class: { type: 'string', multiple: true }, 'font-size': { type: 'string' }, dpi: { type: 'string' },
                scale: { type: 'string' }, globals: { type: 'string' }, state: { type: 'string' }, defaults: { type: 'string' }, data: { type: 'string' },
                background: { type: 'string' }, scheme: { type: 'string', multiple: true }, unit: { type: 'string' },
                padding: { type: 'string' }, timeout: { type: 'string' }, browser: { type: 'string' },
                root: { type: 'string' }, 'no-sandbox': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
            },
        });
    } catch (error) {
        fail(`${error.message}\n\n${usage}`);
    }
    const { values: o, positionals } = parsed;
    if (o.help) {
        process.stdout.write(usage);
        return 0;
    }
    if (o.dpi !== undefined && o.scale !== undefined)
        fail('either --dpi or --scale');
    const charts = chartsOf(positionals);
    const width = o.width === undefined ? undefined : /^\d+(\.\d+)?$/.test(o.width) ? Number(o.width) : o.width;
    const options = Object.fromEntries(Object.entries({
        width, parts: o.parts?.split(',').map(p => p.trim()).filter(Boolean), css: o.css ?? [], classes: o.class,
        fontSize: o['font-size'], dpi: number(o.dpi, 'dpi'), scale: number(o.scale, 'scale'),
        globals: json(o.globals, 'globals'), state: json(o.state, 'state'), defaults: defaultsOf(o.defaults), data: o.data,
        background: o.background === undefined ? undefined : o.background == 'none' ? null : o.background,
        schemes: schemesOf(o.scheme ?? []), unit: o.unit, padding: number(o.padding, 'padding', true),
        timeout: number(o.timeout, 'timeout'),
    }).filter(([, v]) => v !== undefined));

    // a signal ends the browser and removes its profile, the exit code is
    // the one of the shells, 128 and the number of the signal
    let stopping = false;
    Object.entries({ SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }).forEach(([signal, code]) => process.once(signal, async () => {
        stopping = true;
        await stopBrowsers();
        process.exit(code);
    }));
    const note = text => stopping || process.stderr.write(`gen-vis: ${text}\n`);
    const sandbox = !(o['no-sandbox'] || ['1', 'true'].includes(process.env.GEN_VIS_NO_SANDBOX ?? ''));
    let exporter;
    try {
        exporter = await createExporter({ browser: o.browser, sandbox, root: o.root, note });
    } catch (error) {
        fail(error.message, 1);
    }
    let failed = 0;
    try {
        for (const { def, outputs } of charts) {
            const start = performance.now();
            try {
                const r = await exporter.exportChart(def, outputs, options);
                r.messages.forEach(m => note(`${def}: ${m}`));
                process.stdout.write(`${def} -> ${outputs.join(', ')} (${Math.round(r.width)}x${Math.round(r.height)} px, ${((performance.now() - start) / 1000).toFixed(2)} s)\n`);
            } catch (error) {
                failed++;
                (error.messages ?? []).forEach(m => note(`${def}: ${m}`));
                // a site-absolute path, e.g. "/geo/europe.json", is a file of --root
                const absolute = !o.root && /gen-vis\.local\/(?!fs\/|__gen-vis\/)\S*': 404/.test(error.message);
                note(`${def}: ${error.message}${absolute ? ' (a site-absolute path: set --root to the site\'s directory)' : ''}`);
            }
        }
    } finally {
        await exporter.close();
    }
    return failed ? 1 : 0;
};

// the migration of definitions of 4.x, see docs/definition.md and utils/migrate.js
const migrateCommand = async args => {
    let parsed;
    try {
        parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { write: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
    } catch (error) {
        fail(`${error.message}\n\n${usage}`);
    }
    const { values: o, positionals: files } = parsed;
    if (o.help || !files.length) {
        process.stdout.write(usage);
        return o.help ? 0 : 2;
    }
    const { migrate, formatJson, isDefinition4, resolveParents, schemaMajor } = await import('../dist/check.js');
    const { writeFileSync } = await import('node:fs');
    const { pathToFileURL, fileURLToPath } = await import('node:url');
    // all files are read first: the parents of a child are migrated with it
    // as they are, also when they are written before it in this run
    const texts = new Map(files.map(f => [pathToFileURL(path.resolve(f)).href, readFileSync(f, 'utf8')]));
    const loadFile = async url => texts.get(url) ?? readFileSync(fileURLToPath(url), 'utf8');
    let failed = 0;
    for (const file of files) {
        let text;
        try {
            const url = pathToFileURL(path.resolve(file)).href;
            const def = JSON.parse(texts.get(url));
            if (!isDefinition4(def) && schemaMajor(def.$schema) !== 4) {
                process.stderr.write(`gen-vis: ${file}: already a definition of gen-vis 5\n`);
                continue;
            }
            // the parents of a child, merged: the patches of their form
            // elements and the ones of the child are expressions of the child
            const parents = def.parent === undefined ? undefined : await resolveParents({ parent: def.parent }, url, loadFile);
            text = `${formatJson(migrate(def, { parents }))}\n`;
        } catch (error) {
            failed++;
            process.stderr.write(`gen-vis: ${file}: ${error.message}\n`);
            continue;
        }
        if (o.write) {
            writeFileSync(file, text);
            process.stdout.write(`${file}: migrated\n`);
        } else
            process.stdout.write(text);
    }
    return failed ? 1 : 0;
};

const [command, ...rest] = process.argv.slice(2);
if (command == 'export')
    process.exitCode = await exportCommand(rest);
else if (command == 'migrate')
    process.exitCode = await migrateCommand(rest);
else if (command == '-h' || command == '--help' || command === undefined)
    process.stdout.write(usage);
else
    fail(`unknown command ${command}\n\n${usage}`);
