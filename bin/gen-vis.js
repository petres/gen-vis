#!/usr/bin/env node
// the command line of gen-vis, see README "Static export":
//   gen-vis export <def.json> <out.svg|out.png|out.pdf>... [<def.json> <out>...]... [options]
import { parseArgs } from 'node:util';
import path from 'node:path';
import { createExporter, formats } from './export.js';

const usage = `Usage: gen-vis export <def.json> <out.svg|out.png|out.pdf>... [<def.json> <out>...]... [options]

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
  --data <file>           the data instead of the one of the definition (CSV, JSON or parquet)
  --background <color>    the background, none for none (default the one of gen-vis, white)
  --scheme <name=colors>  a scheme of colors, e.g. wifo=#005CA9,#E6A000, repeatable
  --unit <px|cm|mm|in>    the unit of the size of the SVG (default the one of the width)
  --padding <px>          the space around the chart (default 15)
  --timeout <ms>          the time to wait for a chart (default 30000)
  --browser <path>        the browser (default GEN_VIS_BROWSER, CHROME_PATH or one found)
  --no-sandbox            runs the browser without its sandbox (also GEN_VIS_NO_SANDBOX=1)
  -h, --help              this text
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

const number = (value, name) => {
    if (value === undefined)
        return undefined;
    const n = Number(value);
    if (!(n > 0))
        fail(`--${name} is a positive number, not ${value}`);
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
                scale: { type: 'string' }, globals: { type: 'string' }, state: { type: 'string' }, data: { type: 'string' },
                background: { type: 'string' }, scheme: { type: 'string', multiple: true }, unit: { type: 'string' },
                padding: { type: 'string' }, timeout: { type: 'string' }, browser: { type: 'string' },
                'no-sandbox': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
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
        globals: json(o.globals, 'globals'), state: json(o.state, 'state'), data: o.data,
        background: o.background === undefined ? undefined : o.background == 'none' ? null : o.background,
        schemes: schemesOf(o.scheme ?? []), unit: o.unit, padding: o.padding === undefined ? undefined : Number(o.padding),
        timeout: number(o.timeout, 'timeout'),
    }).filter(([, v]) => v !== undefined));

    const note = text => process.stderr.write(`gen-vis: ${text}\n`);
    const sandbox = !(o['no-sandbox'] || ['1', 'true'].includes(process.env.GEN_VIS_NO_SANDBOX ?? ''));
    let exporter;
    try {
        exporter = await createExporter({ browser: o.browser, sandbox, note });
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
                note(`${def}: ${error.message}`);
            }
        }
    } finally {
        await exporter.close();
    }
    return failed ? 1 : 0;
};

const [command, ...rest] = process.argv.slice(2);
if (command == 'export')
    process.exitCode = await exportCommand(rest);
else if (command == '-h' || command == '--help' || command === undefined)
    process.stdout.write(usage);
else
    fail(`unknown command ${command}\n\n${usage}`);
