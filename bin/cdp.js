// a Chromium (or Chrome, Edge) of the system driven by the DevTools protocol
// (CDP) over a pipe (--remote-debugging-pipe), without dependencies, see
// bin/export.js
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

// the browsers of POSIX in process groups of their own, so their
// processes (renderers, GPU, zygote) end with them, see stop
const grouped = process.platform != 'win32';

// a browser and all its processes killed, at once
const kill = child => {
    if (child.pid === undefined)
        return;
    try {
        grouped ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL');
    } catch { /* ended already */ }
};

// the end of a process, at most `ms` later
const ended = (child, ms) => child.exitCode !== null || child.signalCode !== null || child.pid === undefined ? Promise.resolve()
    : Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, ms).unref())]);

// the browsers which run and their profiles, ended by stopBrowsers and at
// the exit of the process
const running = new Set();

// a browser killed and its profile removed
const stop = async b => {
    running.delete(b);
    if (b.child) {
        kill(b.child);
        await ended(b.child, 3000);
    }
    rmSync(b.profile, { recursive: true, force: true, maxRetries: 3 });
};

/**
 * Kills the browsers of launch which still run and removes their
 * profiles, e.g. of a signal (see bin/gen-vis.js).
 */
export const stopBrowsers = () => Promise.all([...running].map(stop));

process.on('exit', () => running.forEach(b => {
    if (b.child)
        kill(b.child);
    try {
        rmSync(b.profile, { recursive: true, force: true });
    } catch { /* a process of the browser writes it */ }
}));

// the browser started with its DevTools on a pipe (fds 3 and 4, messages of
// JSON ended by a NUL), so it ends with the program, also with one which is
// killed (its end of the pipe closes); resolves once it answers a first
// command with the browser and its pipe (`send(message)`, `receive(fn)` of
// the messages, `closed(fn)` of the end of the pipe), rejects with its
// output if it ends first; `started(child)` gets it at once, its temporary
// files are in the profile
const start = (executable, args, profile, wait, started) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], detached: grouped, env: { ...process.env, TMPDIR: profile } });
    started(child);
    let output = '';
    const timer = setTimeout(() => {
        kill(child);
        reject(new Error(`the browser did not start within ${wait / 1000} s`));
    }, wait);
    child.stderr.setEncoding('utf8');
    // (the last lines of the output, of the error of an end)
    child.stderr.on('data', chunk => output = (output + chunk).slice(-20000));
    const [, , , input, messages] = child.stdio;
    // (a write after the end of the browser, its exit tells)
    input.on('error', () => {});
    let receiver = null, onClosed = null, buffer = '';
    messages.setEncoding('utf8');
    messages.on('data', chunk => {
        const parts = (buffer + chunk).split('\0');
        buffer = parts.pop();
        parts.forEach(text => {
            const m = JSON.parse(text);
            if (m.id === 0) {
                clearTimeout(timer);
                resolve({ child, pipe });
            } else
                receiver?.(m);
        });
    });
    messages.on('close', () => onClosed?.());
    const pipe = {
        send: message => input.write(`${JSON.stringify(message)}\0`),
        receive: fn => receiver = fn,
        closed: fn => onClosed = fn,
    };
    child.on('error', error => {
        clearTimeout(timer);
        reject(error);
    });
    child.on('exit', code => {
        clearTimeout(timer);
        reject(Object.assign(new Error(`the browser ended (${code}): ${output.trim().split('\n').slice(-3).join(' ')}`), { output }));
    });
    pipe.send({ id: 0, method: 'Browser.getVersion' });
});

/**
 * A headless browser of `executable` and its connection: `send(method,
 * params, session)` of the commands, `on(method, fn)` of the events (with
 * their session), `close()` ends it. Without the sandbox of the browser
 * (`sandbox: false`) as root, else it is tried with it first and without it
 * if the browser can not start one, e.g. in a container (`note` tells).
 */
export const launch = async (executable, { sandbox = true, wait = 30000, note = () => {} } = {}) => {
    const b = { child: null, profile: mkdtempSync(path.join(tmpdir(), 'gen-vis-')) };
    running.add(b);
    try {
        return await connect(executable, b, sandbox, wait, note);
    } catch (error) {
        await stop(b);
        throw error;
    }
};

// the browser of `b` started (`b.child`) of its profile and connected
const connect = async (executable, b, sandbox, wait, note) => {
    const { profile } = b;
    const started = child => b.child = child;
    const args = ['--headless', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--disable-extensions', '--window-size=1600,1200', 'about:blank'];
    const root = process.getuid?.() === 0;
    let browser;
    try {
        browser = await start(executable, sandbox && !root ? args : ['--no-sandbox', ...args], profile, wait, started);
    } catch (error) {
        if (!sandbox || root || !/sandbox/i.test(error.output ?? ''))
            throw error;
        note('the browser has no sandbox here (e.g. in a container), it runs without one');
        browser = await start(executable, ['--no-sandbox', ...args], profile, wait, started);
    }
    const { child, pipe } = browser;

    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    let closed = null;
    pipe.receive(m => {
        if (m.id !== undefined) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error)
                p?.reject(new Error(`${p.method}: ${m.error.message}${m.error.data ? ` (${m.error.data})` : ''}`));
            else
                p?.resolve(m.result);
        } else
            (listeners.get(m.method) ?? []).forEach(fn => fn(m.params, m.sessionId));
    });
    pipe.closed(() => {
        closed = new Error('the browser closed the connection');
        pending.forEach(p => p.reject(closed));
        pending.clear();
    });

    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        if (closed)
            return reject(closed);
        pending.set(++id, { resolve, reject, method });
        pipe.send({ id, method, params, ...(sessionId ? { sessionId } : {}) });
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

    // (the timer of the wait is cleared, else the process waits for it)
    const close = async () => {
        let timer;
        try {
            await Promise.race([send('Browser.close'), new Promise(r => timer = setTimeout(r, 2000))]);
        } catch { /* closed already */ } finally {
            clearTimeout(timer);
        }
        child.stdio[3].end();
        await ended(child, 3000);
        await stop(b);
    };
    return { send, on, once, close, executable };
};
