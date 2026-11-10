'use strict';
// Starts the real bin/www (primary plus one worker per CPU) and checks that the
// login budget is per client for the whole cluster, not per worker - and that
// sharing it, which has the primary and the workers talking to each other for
// the first time, does not give the cluster new ways to fall over.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const BIN_WWW = path.join(__dirname, '..', 'bin', 'www');
// The same count bin/www makes.
const WORKERS = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
const LOGIN_LIMIT = 10;

let www;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer().once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

// Runs `args` with node in a process group of its own, listening on a free
// port, and keeps what it writes to stderr: every worker announces itself there
// through debug(), and the primary reports the workers it replaces.
async function launch(args) {
    const launched = { port: await freePort(), output: '' };
    launched.process = spawn(process.execPath, args, {
        env: {
            ...process.env,
            PORT: String(launched.port),
            JWT_SECRET: randomBytes(32).toString('hex'),
            DEBUG: 'Nodepop:server',
            // Nothing here reaches the database; the long timeout only keeps the
            // workers from giving up on it while the test runs.
            MONGODB_URI: 'mongodb://127.0.0.1:1/nodepop?serverSelectionTimeoutMS=60000'
        },
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: true
    });
    launched.process.stderr.on('data', chunk => { launched.output += chunk; });
    return launched;
}

function exited(launched) {
    return launched.process.exitCode !== null || launched.process.signalCode !== null;
}

// Waits until `count` workers have announced that they are listening.
async function listening(launched, count) {
    const deadline = Date.now() + 15000;
    while ((launched.output.match(/Listening on port/g) || []).length < count) {
        if (exited(launched)) throw new Error('the process exited:\n' + launched.output);
        if (Date.now() > deadline) throw new Error(`fewer than ${count} workers listening:\n` + launched.output);
        await delay(50);
    }
}

function stop(launched) {
    if (launched && !exited(launched)) {
        // The whole process group: the primary and its workers.
        process.kill(-launched.process.pid, 'SIGKILL');
    }
}

before(async () => {
    www = await launch([BIN_WWW]);
    await listening(www, WORKERS);
});

after(() => stop(www));

// A new connection per request, so the cluster hands consecutive attempts to
// different workers the way a client opening fresh connections would.
function failedLogin(port) {
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1', port, path: '/apiv1/users/login', method: 'POST',
            agent: false, headers: { 'Content-Type': 'application/json' }
        }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject);
        request.end('{}');
    });
}

async function failedLogins(port, count) {
    const statuses = [];
    for (let i = 0; i < count; i++) {
        statuses.push(await failedLogin(port));
    }
    return statuses;
}

test(`the login budget is shared by the ${WORKERS} workers`, async () => {
    assert.deepEqual(
        await failedLogins(www.port, LOGIN_LIMIT + 1),
        [...Array(LOGIN_LIMIT).fill(400), 429]
    );
});

// PM2 in cluster mode, like any other manager that forks bin/www itself, is a
// primary that knows nothing about the counters: a worker asking it would wait
// a second for an answer that never comes and refuse every login and sign-up
// with a 500. Such a worker has to keep its own count instead.
test('a worker forked by another cluster manager keeps its own budget', async t => {
    // execArgv: or the worker would be started with this same `-e` script.
    const manager = await launch(['-e', `
        const cluster = require('node:cluster');
        cluster.setupPrimary({ exec: process.argv[1], execArgv: [] });
        cluster.fork();
    `, BIN_WWW]);
    t.after(() => stop(manager));
    await listening(manager, 1);

    assert.deepEqual(
        await failedLogins(manager.port, LOGIN_LIMIT + 1),
        [...Array(LOGIN_LIMIT).fill(400), 429]
    );
});
