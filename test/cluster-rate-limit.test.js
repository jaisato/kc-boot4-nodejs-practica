'use strict';
// Starts the real bin/www (primary plus one worker per CPU) and checks that the
// login budget is per client for the whole cluster, not per worker - and that
// sharing it, which has the primary and the workers talking to each other for
// the first time, does not give the cluster new ways to fall over.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
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
function failedLogin(port, agent = false) {
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1', port, path: '/apiv1/users/login', method: 'POST',
            agent, headers: { 'Content-Type': 'application/json' }
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

// The primary answers every worker that asks it for a counter. When the worker
// has died in the meantime the answer cannot be written, and cluster reports
// that as an 'error' event on the worker: with nobody listening it was an
// uncaught exception in the primary, so one worker dying at the wrong moment
// took the primary, and with it every other worker, down.
//
// Made to happen on purpose: the primary is stopped so that a worker's question
// stays unanswered in the pipe, the workers are killed, and the primary is let
// go on - to find a question from a worker that is no longer there. Nothing
// here waits against the clock: each step is known to be over before the next.
test('a worker that dies with a question to the primary pending does not take the cluster down', async () => {
    const primary = www.process.pid;
    const workers = execFileSync('pgrep', ['-P', String(primary)], { encoding: 'utf8' })
        .split('\n').filter(Boolean).map(Number);
    assert.equal(workers.length, WORKERS);

    // One connection, kept open: the worker that took it also gets the request
    // sent while the primary, which hands out new connections, is stopped.
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    // Were this process killed with the primary stopped, nothing would ever let
    // the primary go on, and it would sit there for good with its workers. This
    // does it from outside, in a process group the test run does not take along.
    const lifeline = spawn('sh', ['-c', `sleep 15; kill -CONT ${primary}`], {
        stdio: 'ignore', detached: true
    });
    lifeline.unref();
    try {
        await failedLogin(www.port, agent);
        process.kill(primary, 'SIGSTOP');
        // The worker asks, gives the primary its second and refuses the
        // attempt: its question is in the pipe by now, unanswered.
        assert.equal(await failedLogin(www.port, agent), 500);

        // That connection closing is the kernel being done with the worker,
        // its end of the pipe included - until then an answer written to it
        // still goes through.
        const [connection] = Object.values(agent.freeSockets)
            .concat(Object.values(agent.sockets)).flat();
        const closed = connection.destroyed || once(connection, 'close');
        for (const pid of workers) process.kill(pid, 'SIGKILL');
        await closed;
        process.kill(primary, 'SIGCONT');

        // Every worker is replaced, and the new ones serve.
        await listening(www, WORKERS * 2);
        assert.match(String(await failedLogin(www.port)), /^4(00|29)$/);
        // And the primary did meet the answer it could not deliver.
        assert.match(www.output, /a message could not be delivered/);
    } finally {
        agent.destroy();
        if (!exited(www)) process.kill(primary, 'SIGCONT');
        try { process.kill(-lifeline.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
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
