'use strict';
// Starts the real bin/www (primary plus one worker per CPU) and checks that the
// login budget is per client for the whole cluster, not per worker.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const WORKERS = os.availableParallelism();
const LOGIN_LIMIT = 10;

let child, port;

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer().once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

before(async () => {
    port = await freePort();
    child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'www')], {
        env: {
            ...process.env,
            PORT: String(port),
            JWT_SECRET: randomBytes(32).toString('hex'),
            DEBUG: 'Nodepop:server',
            // Nothing here reaches the database; the long timeout only keeps the
            // workers from giving up on it while the test runs.
            MONGODB_URI: 'mongodb://127.0.0.1:1/nodepop?serverSelectionTimeoutMS=60000'
        },
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: true
    });

    // Every worker announces itself on stderr through debug().
    await new Promise((resolve, reject) => {
        let listening = 0, output = '';
        const timer = setTimeout(() => reject(new Error('bin/www did not start:\n' + output)), 15000);
        child.stderr.on('data', chunk => {
            output += chunk;
            listening = (output.match(/Listening on port/g) || []).length;
            if (listening >= WORKERS) { clearTimeout(timer); resolve(); }
        });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`bin/www exited with ${code}:\n${output}`)); });
    });
});

after(() => {
    if (child && child.exitCode === null) {
        // The whole process group: the primary and its workers.
        process.kill(-child.pid, 'SIGKILL');
    }
});

// A new connection per request, so the cluster hands consecutive attempts to
// different workers the way a client opening fresh connections would.
function failedLogin() {
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1', port, path: '/apiv1/users/login', method: 'POST',
            agent: false, headers: { 'Content-Type': 'application/json' }
        }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject);
        request.end('{}');
    });
}

test(`the login budget is shared by the ${WORKERS} workers`, async () => {
    const statuses = [];
    for (let i = 0; i <= LOGIN_LIMIT; i++) {
        statuses.push(await failedLogin());
    }
    assert.deepEqual(statuses, [...Array(LOGIN_LIMIT).fill(400), 429]);
});
