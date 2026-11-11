'use strict';
// Starts the real bin/www in the ways it can fail to start - the port taken,
// workers that die before they are up - and checks what that leaves the
// operator with: a line saying why, exit code 1 and no process behind.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');

const BIN_WWW = path.join(__dirname, '..', 'bin', 'www');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs node with `args` in a process group of its own and keeps what it and its
// workers write to stderr. `ended` turns true once the process has gone and
// stderr has been closed by everything that held it, its workers included.
function launch(args, env) {
    const launched = { output: '', ended: false };
    launched.process = spawn(process.execPath, args, {
        env: {
            ...process.env,
            JWT_SECRET: randomBytes(32).toString('hex'),
            DEBUG: 'Nodepop:server',
            // Never reached, and slow to say so: a worker listens and then
            // waits for a database that is not going to answer.
            MONGODB_URI: 'mongodb://127.0.0.1:1/nodepop?serverSelectionTimeoutMS=60000',
            ...env
        },
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: true
    });
    launched.process.stderr.on('data', chunk => { launched.output += chunk; });
    launched.process.once('close', code => { launched.code = code; launched.ended = true; });

    // Were this test run killed, nothing would stop what it has launched. This
    // does, from a process group the test run does not take along with it: it
    // waits on a pipe whose other end only this process holds, and which ends
    // when this process does, whatever way it goes.
    launched.lifeline = spawn('sh', ['-c',
        `read end; kill -s KILL -- -${launched.process.pid}`
    ], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    launched.lifeline.unref();
    launched.lifeline.stdin.unref();

    return launched;
}

// The whole process group, workers included, and the lifeline with it.
function stop(launched) {
    for (const group of [launched.lifeline.pid, launched.process.pid]) {
        try { process.kill(-group, 'SIGKILL'); } catch { /* already gone */ }
    }
    launched.lifeline.stdin.destroy();
}

// The only waiting these tests do: for something to have happened.
async function until(launched, what, condition) {
    const deadline = Date.now() + 20000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`${what}: not after 20 s.\n${launched.output}`);
        }
        await delay(20);
    }
}

// Somebody else listening where bin/www is going to be told to.
async function takenPort(t) {
    const holder = net.createServer();
    await new Promise((resolve, reject) => { holder.once('error', reject).listen(0, resolve); });
    t.after(() => new Promise(resolve => holder.close(resolve)));
    return holder.address().port;
}

// Every worker used to find the port taken on its own and die of it with a
// stack trace - cluster reports it as a failed `bind`, which the handler took
// for an error it did not know - until the primary had replaced enough of them
// to give up: a trace per worker and one more, for something one line explains.
test('with the port taken bin/www says so once and exits with 1', async t => {
    const port = await takenPort(t);
    const www = launch([BIN_WWW], { PORT: String(port) });
    t.after(() => stop(www));

    await until(www, 'bin/www ending', () => www.ended);
    assert.equal(www.code, 1);
    assert.equal(www.output, `Port ${port} is already in use\n`);
});

// Run by PM2 in cluster mode, or by any other manager that forks bin/www
// itself, a worker has no primary of its own to try the port first: it is the
// one that has to say it.
test('with the port taken a worker of another cluster manager says so itself', async t => {
    const port = await takenPort(t);
    // execArgv: or the worker would be started with this same `-e` script.
    const manager = launch(['-e', `
        const cluster = require('node:cluster');
        cluster.setupPrimary({ exec: process.argv[1], execArgv: [] });
        cluster.fork();
    `, BIN_WWW], { PORT: String(port) });
    t.after(() => stop(manager));

    await until(manager, 'the manager and its worker ending', () => manager.ended);
    assert.equal(manager.output, `Port ${port} is already in use\n`);
});
