// a Chromium (or Chrome, Edge) of the system driven by the DevTools protocol
// (CDP) over the WebSocket of node (22 or newer), without dependencies,
// see bin/export.js
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// the names of the browsers on the PATH and their usual places on macOS and Windows
const names = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'microsoft-edge', 'microsoft-edge-stable', 'msedge'];
const places = () => [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].map(v => process.env[v]).filter(Boolean).flatMap(dir => [
        path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(dir, 'Chromium', 'Application', 'chrome.exe'),
        path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]),
];

// a program of the PATH, of the extensions of PATHEXT on Windows
const onPath = name => {
    const extensions = process.platform == 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : [''];
    for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
        for (const ext of extensions)
            if (existsSync(path.join(dir, name + ext)))
                return path.join(dir, name + ext);
    return null;
};

/**
 * The path of the browser: `given` (e.g. of --browser), the environment
 * variables GEN_VIS_BROWSER and CHROME_PATH, the names on the PATH and the
 * usual places of Chrome and Edge, an error if there is none.
 */
export const findBrowser = given => {
    const set = given ?? process.env.GEN_VIS_BROWSER ?? process.env.CHROME_PATH;
    if (set) {
        const found = existsSync(set) ? set : onPath(set);
        if (!found)
            throw new Error(`the browser ${set} does not exist`);
        return found;
    }
    const found = names.map(onPath).find(Boolean) ?? places().find(p => existsSync(p));
    if (!found)
        throw new Error('no Chromium, Chrome or Edge found: install one, or give its path with --browser or GEN_VIS_BROWSER');
    return found;
};

// the browser started with its DevTools on a port of its own, resolves
// with the url of its WebSocket, rejects with its output if it ends first
const start = (executable, args, wait) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`the browser did not start within ${wait / 1000} s`));
    }, wait);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
        output += chunk;
        const m = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) {
            clearTimeout(timer);
            child.stderr.removeAllListeners('data');
            child.stderr.resume();
            resolve({ child, url: m[1] });
        }
    });
    child.on('error', error => {
        clearTimeout(timer);
        reject(error);
    });
    child.on('exit', code => {
        clearTimeout(timer);
        reject(Object.assign(new Error(`the browser ended (${code}): ${output.trim().split('\n').slice(-3).join(' ')}`), { output }));
    });
});

/**
 * A headless browser of `executable` and its connection: `send(method,
 * params, session)` of the commands, `on(method, fn)` of the events (with
 * their session), `close()` ends it. Without the sandbox of the browser
 * (`sandbox: false`) as root, else it is tried with it first and without it
 * if the browser can not start one, e.g. in a container (`note` tells).
 */
export const launch = async (executable, { sandbox = true, wait = 30000, note = () => {} } = {}) => {
    if (typeof WebSocket != 'function')
        throw new Error(`the export needs node 22 or newer (its WebSocket), this is ${process.version}`);
    const profile = mkdtempSync(path.join(tmpdir(), 'gen-vis-'));
    const args = ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--disable-extensions', '--window-size=1600,1200', 'about:blank'];
    const root = process.getuid?.() === 0;
    let browser;
    try {
        browser = await start(executable, sandbox && !root ? args : ['--no-sandbox', ...args], wait);
    } catch (error) {
        if (!sandbox || root || !/sandbox/i.test(error.output ?? ''))
            throw error;
        note('the browser has no sandbox here (e.g. in a container), it runs without one');
        browser = await start(executable, ['--no-sandbox', ...args], wait);
    }
    const { child, url } = browser;

    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error(`no connection to the browser at ${url}`));
    });
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    let closed = null;
    ws.onmessage = message => {
        const m = JSON.parse(message.data);
        if (m.id !== undefined) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error)
                p?.reject(new Error(`${p.method}: ${m.error.message}${m.error.data ? ` (${m.error.data})` : ''}`));
            else
                p?.resolve(m.result);
        } else
            (listeners.get(m.method) ?? []).forEach(fn => fn(m.params, m.sessionId));
    };
    ws.onclose = () => {
        closed = new Error('the browser closed the connection');
        pending.forEach(p => p.reject(closed));
        pending.clear();
    };

    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        if (closed)
            return reject(closed);
        pending.set(++id, { resolve, reject, method });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const on = (method, fn) => {
        listeners.set(method, [...(listeners.get(method) ?? []), fn]);
        return () => listeners.set(method, listeners.get(method).filter(f => f !== fn));
    };
    // the next event of a session which `test` accepts
    const once = (method, sessionId, test = () => true) => new Promise(resolve => {
        const off = on(method, (params, session) => {
            if (session == sessionId && test(params)) {
                off();
                resolve(params);
            }
        });
    });

    const close = async () => {
        try {
            await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 2000))]);
        } catch { /* closed already */ }
        ws.close();
        if (child.exitCode === null)
            await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 3000))]);
        child.kill();
        rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    };
    return { send, on, once, close, executable };
};
