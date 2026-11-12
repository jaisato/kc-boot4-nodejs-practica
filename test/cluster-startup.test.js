'use strict';
// Starts the real bin/www in the ways it can fail to start - the port taken,
// a setting missing or wrong, workers that die before they are up - and checks
// what that leaves the operator with: a line saying why, exit code 1 and no
// process behind. And that it does not give up on a cluster that is serving,
// and that asked to stop it does, with nothing to say and no process behind
// either.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
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

// Evaluated in front of bin/www, in the primary and - cluster starts them with
// the same arguments - in every worker: how these tests make workers fail, how
// they give them what there is none of here, time and a database, and how they
// have the primary signalled at the very moment that a test is about.
const SABOTAGE = `
    const cluster = require('node:cluster');

    // Every worker dies before it has loaded anything, except one that is slow
    // to start: it gets no further until its primary has gone.
    if (cluster.isWorker && process.env.TEST_SLOW_WORKER) {
        if (cluster.worker.id !== Number(process.env.TEST_SLOW_WORKER)) process.exit(1);
        const primary = process.ppid;
        const nothing = new Int32Array(new SharedArrayBuffer(4));
        while (process.ppid === primary) Atomics.wait(nothing, 0, 0, 10);
    }

    // No worker gets as far as loading anything until its primary has gone: a
    // start that lasts for as long as a test needs it to. They know the
    // primary by its pid, written down for them here, so that one that comes
    // to look when the primary has already gone does not wait for ever.
    if (process.env.TEST_SLOW_START) {
        if (cluster.isPrimary) {
            process.env.TEST_PRIMARY = String(process.pid);
        } else {
            const nothing = new Int32Array(new SharedArrayBuffer(4));
            while (process.ppid === Number(process.env.TEST_PRIMARY)) Atomics.wait(nothing, 0, 0, 10);
        }
    }

    // The primary is sent this signal when it has forked its first worker and
    // is about to fork the next: it sends it to itself.
    if (cluster.isPrimary && process.env.TEST_SIGNAL_AT_FIRST_FORK) {
        const fork = cluster.fork;
        cluster.fork = function (...args) {
            const worker = fork.apply(this, args);
            if (worker.id === 1) process.kill(process.pid, process.env.TEST_SIGNAL_AT_FIRST_FORK);
            return worker;
        };
    }

    // The primary is sent this signal when it has stopped the first of its
    // workers and is about to stop the next: it sends it to itself.
    if (cluster.isPrimary && process.env.TEST_SIGNAL_AT_FIRST_STOP) {
        cluster.once('fork', worker => {
            const kill = worker.process.kill;
            worker.process.kill = function (...args) {
                const killed = kill.apply(this, args);
                process.kill(process.pid, process.env.TEST_SIGNAL_AT_FIRST_STOP);
                return killed;
            };
        });
    }

    // The primary hears of a stop the way it can when the signal is sent to
    // the whole process group: the death of a worker first, its own signal
    // after. Once it has its workers it sends this signal to the first, waits
    // right there until that one has died of it, and sends itself the same.
    if (cluster.isPrimary && process.env.TEST_SIGNAL_TO_A_WORKER_FIRST) {
        cluster.once('fork', worker => {
            const { execFileSync } = require('node:child_process');
            const state = () => execFileSync('ps', ['-o', 'stat=', '-p', String(worker.process.pid)], { encoding: 'utf8' });
            process.kill(worker.process.pid, process.env.TEST_SIGNAL_TO_A_WORKER_FIRST);
            while (!/^Z[^l]*$/.test(state().trim())) { /* still dying */ }
            process.kill(process.pid, process.env.TEST_SIGNAL_TO_A_WORKER_FIRST);
        });
    }

    // The primary has something to tell every worker that dies, as it would
    // have had one of them asked it a question with its last breath.
    if (cluster.isPrimary && process.env.TEST_LATE_ANSWERS) {
        cluster.on('exit', worker => worker.send('too late'));
    }

    // The primary's clock, a minute further on every time it is looked at:
    // however fast workers die, to the primary they die less than once a minute.
    if (cluster.isPrimary && process.env.TEST_SLOW_DEATHS) {
        const now = Date.now;
        let ahead = 0;
        Date.now = () => now() + (ahead += 61000);
    }

    // A database that answers, for the workers up to this one.
    if (cluster.isWorker && cluster.worker.id <= Number(process.env.TEST_DATABASE_UP_TO)) {
        const mongoose = require(${JSON.stringify(require.resolve('mongoose'))});
        mongoose.connect = () => {
            process.nextTick(() => mongoose.connection.emit('open'));
            return Promise.resolve(mongoose);
        };
    }

    require(process.argv[1]);
`;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs node with `args` in a process group of its own and keeps what it and its
// workers write to stderr. `ended` turns true once the process has gone and
// stderr has been closed by everything that held it, its workers included:
// with its exit code in `code`, or the signal that ended it in `signal`.
function launch(args, env) {
    const launched = { output: '', ended: false };
    launched.process = spawn(process.execPath, args, {
        env: {
            ...process.env,
            // Any port that is free: the workers of a cluster share it.
            PORT: '0',
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
    launched.process.once('close', (code, signal) => {
        launched.code = code;
        launched.signal = signal;
        launched.ended = true;
    });

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
        if (launched.ended) {
            throw new Error(`${what}: it ended instead.\n${launched.output}`);
        }
        if (Date.now() > deadline) {
            throw new Error(`${what}: not after 20 s.\n${launched.output}`);
        }
        await delay(20);
    }
}

// The workers a primary has right now.
function workers(launched) {
    let found = '';
    try {
        found = execFileSync('pgrep', ['-P', String(launched.process.pid)], { encoding: 'utf8' });
    } catch (err) {
        // Exit status 1 is how pgrep says that there are none.
        if (err.status !== 1) throw err;
    }
    return found.split('\n').filter(Boolean).map(Number);
}

// How many workers have said they are listening, and of how many the primary
// has said that they have started: both through debug(), on stderr.
function listening(launched) {
    return (launched.output.match(/Listening on port/g) || []).length;
}

function started(launched) {
    return (launched.output.match(/Worker \d+ started/g) || []).length;
}

// An attempt to sign in with nothing: what a worker that is serving answers.
// On the port of the last worker to say it was listening: asked for any free
// port, a cluster gets another one each time it is left without workers.
function failedLogin(launched) {
    const port = Number(launched.output.match(/Listening on port (\d+)/g).pop().match(/\d+/)[0]);
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1', port, path: '/apiv1/users/login', method: 'POST',
            agent: false, headers: { 'Content-Type': 'application/json' }
        }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject);
        request.end('{}');
    });
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

// What the app cannot start without having right is checked where it is used,
// in code that only the workers load. So it was each worker that found a
// setting missing or wrong, loading the app, and died of it with a stack
// trace, and the primary that went on replacing them until it had seen enough:
// a trace per worker and one more, for something that was known before the
// first of them was forked.
const MISCONFIGURED = [
    ['without JWT_SECRET', { JWT_SECRET: undefined },
        'JWT_SECRET is not set. Generate one (for example: openssl rand -hex 32) ' +
        'and export it before starting the app.'],
    ['with a TRUST_PROXY_HOPS that is not a whole number', { TRUST_PROXY_HOPS: '1.5' },
        'TRUST_PROXY_HOPS must be a non-negative integer (the number of reverse ' +
        'proxies in front of this app; 0 or unset means none). Got: "1.5"'],
    ['with a PUBLIC_BASE_URL that is not a URL', { PUBLIC_BASE_URL: 'api.example.com' },
        'PUBLIC_BASE_URL must be an absolute URL such as https://api.example.com ' +
        '(the public origin the photo links are built on). Got: "api.example.com"'],
    ['with a PUBLIC_BASE_URL that is not http', { PUBLIC_BASE_URL: 'ftp://api.example.com' },
        'PUBLIC_BASE_URL must be an http or https URL. Got: "ftp://api.example.com"'],
    ['with a PUBLIC_BASE_URL that carries a query', { PUBLIC_BASE_URL: 'https://api.example.com/?v=1' },
        'PUBLIC_BASE_URL must not carry a query string or fragment. Got: ' +
        '"https://api.example.com/?v=1"']
];

for (const [how, env, line] of MISCONFIGURED) {
    test(`${how} bin/www says so once and exits with 1`, async t => {
        const www = launch([BIN_WWW], env);
        t.after(() => stop(www));

        await until(www, 'bin/www ending', () => www.ended);
        assert.equal(www.code, 1);
        // One line and no more: nothing was forked to add its own.
        assert.equal(www.output, `${line}\n`);
    });

    // Under another cluster manager there is no primary of bin/www's to have
    // said it: the worker does, and leaves with the code the manager here
    // passes on.
    test(`${how} a worker of another cluster manager says so itself`, async t => {
        const manager = launch(['-e', `
            const cluster = require('node:cluster');
            cluster.setupPrimary({ exec: process.argv[1], execArgv: [] });
            cluster.fork().on('exit', code => { process.exitCode = code; });
        `, BIN_WWW], env);
        t.after(() => stop(manager));

        await until(manager, 'the manager and its worker ending', () => manager.ended);
        assert.equal(manager.code, 1);
        assert.equal(manager.output, `${line}\n`);
    });
}

// With more than one of them wrong, each is said: none has to be put right to
// find out about the next.
test('with several settings wrong bin/www says each once and exits with 1', async t => {
    const www = launch([BIN_WWW], Object.assign({}, ...MISCONFIGURED.slice(0, 3).map(([, env]) => env)));
    t.after(() => stop(www));

    await until(www, 'bin/www ending', () => www.ended);
    assert.equal(www.code, 1);
    assert.equal(www.output, MISCONFIGURED.slice(0, 3).map(([, , line]) => `${line}\n`).join(''));
});

// Giving up, the primary used to exit there and then. The workers it had just
// forked, still loading the app, found out on their own: each got as far as
// asking to listen, tripped over the channel to a primary that was no longer
// there and died printing a `write EPIPE` stack trace - after the line that
// said why the cluster was stopping, and looking like one more failure.
//
// Made to happen on purpose: every worker dies at once, so the primary soon
// has had enough, except one that takes its time to start and goes no further
// until the primary has left. With a single worker there is never another one
// starting when the primary gives up.
test('when the primary gives up the workers still starting go with it, quietly', {
    skip: WORKERS < 2 && 'needs a second worker to be starting'
}, async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], { TEST_SLOW_WORKER: String(WORKERS + 2) });
    t.after(() => stop(www));

    await until(www, 'bin/www and its workers ending', () => www.ended);
    assert.equal(www.code, 1);
    // Why it stops is the last thing said: no worker adds anything to it.
    assert.match(www.output, /giving up\.\n$/);
    assert.doesNotMatch(www.output, /EPIPE/);
});

// All the primary used to count was worker deaths in the last minute. Workers
// that die more slowly than that never added up: with a database that takes a
// minute to give up on, each round of workers listened, waited, died and was
// replaced, for ever, and nobody ever got to serve anything.
//
// The workers here have no database either - they listen and get no further -
// and by the primary's clock every death is a minute after the one before.
test('workers that keep failing to start end the cluster, however slowly they fail', async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], { TEST_SLOW_DEATHS: '1' });
    t.after(() => stop(www));

    await until(www, 'the workers listening', () => listening(www) >= WORKERS);
    for (const pid of workers(www)) process.kill(pid, 'SIGKILL');
    await until(www, 'their replacements listening', () => listening(www) >= WORKERS * 2);
    // One more than the cluster has, and not one of them had started.
    process.kill(workers(www)[0], 'SIGKILL');

    await until(www, 'bin/www ending', () => www.ended);
    assert.equal(www.code, 1);
    assert.match(www.output, /workers in a row have failed to start and none is up, giving up\.\n$/);
});

// The other side of it: a worker that had started - it was listening, and it
// had its database - is a worker to replace when it dies, as many times as it
// happens. Every worker here dies after it has started, twice over: more deaths
// than the cluster has workers, a minute apart by the primary's clock.
test('workers that die after they had started are replaced, however many do', async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], {
        TEST_SLOW_DEATHS: '1', TEST_DATABASE_UP_TO: 'Infinity'
    });
    t.after(() => stop(www));

    for (const round of [1, 2]) {
        await until(www, 'the workers starting', () => started(www) >= WORKERS * round);
        for (const pid of workers(www)) process.kill(pid, 'SIGKILL');
    }

    await until(www, 'the last replacements starting', () => started(www) >= WORKERS * 3);
    assert.equal(await failedLogin(www), 400);
});

// And why "none is up" is part of it. With the cluster serving, replacements
// that cannot start - the database went away after the others had connected -
// are no reason to take down the workers that are still there, which will have
// their database back on their own when it returns.
//
// Only the first workers get a database here. All but one of them die, and then
// so do their replacements, which listen and get no further, round after round
// until more have failed to start in a row than the cluster has workers.
test('failed starts do not end a cluster that still has a worker up', {
    skip: WORKERS < 2 && 'needs one worker to stay up while others fail to start'
}, async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], {
        TEST_SLOW_DEATHS: '1', TEST_DATABASE_UP_TO: String(WORKERS)
    });
    t.after(() => stop(www));

    await until(www, 'the workers starting', () => started(www) >= WORKERS);
    const survivor = workers(www)[0];

    let replaced = 0;
    for (let failedStarts = 0, round = 0; failedStarts <= WORKERS; round++) {
        for (const pid of workers(www)) {
            if (pid !== survivor) process.kill(pid, 'SIGKILL');
        }
        // The first to go had started; none of the ones after them.
        if (round > 0) failedStarts += WORKERS - 1;
        replaced += WORKERS - 1;
        await until(www, 'the replacements listening', () => listening(www) >= WORKERS + replaced);
    }

    assert.equal(await failedLogin(www), 400);
});

// Asked to stop - SIGTERM from whatever supervises it, SIGINT from whoever
// has it in a terminal - the primary did nothing about it: it was gone at
// once, and its workers were left to find out. The ones still starting did
// when they asked to listen, and each died printing a `write EPIPE` stack
// trace, after the process that had been stopped was no longer there.
//
// The workers here are slow to start, so the signal finds them all at it.
for (const signal of ['SIGTERM', 'SIGINT']) {
    test(`asked to stop with ${signal} while its workers are starting, bin/www takes them along, quietly`, async t => {
        const www = launch(['-e', SABOTAGE, BIN_WWW], { TEST_SLOW_START: '1' });
        t.after(() => stop(www));

        await until(www, 'the workers being forked', () => workers(www).length === WORKERS);
        www.process.kill(signal);

        await until(www, 'bin/www and its workers ending', () => www.ended);
        // Ended by the signal, like a process that does nothing about it: a
        // stop that was asked for, and not exit code 1.
        assert.equal(www.signal, signal);
        assert.equal(www.output, '');
    });
}

// The earliest the stop can find a worker to leave behind: one is forked and
// the primary is still at forking the rest. Whatever it does about the signal
// has to be in place before the first fork, not after the last.
test('asked to stop while it is still forking its workers, bin/www takes along the ones it has', async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], {
        TEST_SLOW_START: '1', TEST_SIGNAL_AT_FIRST_FORK: 'SIGTERM'
    });
    t.after(() => stop(www));

    await until(www, 'bin/www and its workers ending', () => www.ended);
    assert.equal(www.signal, 'SIGTERM');
    assert.equal(www.output, '');
});

// And the signal can come again while the primary is at it: a `kill` that is
// repeated, Ctrl+C pressed twice. It has to find the primary still listening.
// Left to do what it does to a process that is not, it ends the primary half
// way through its workers, and the ones it had not got to stay behind.
test('asked to stop a second time while it is at it, bin/www still takes every worker along', {
    skip: WORKERS < 2 && 'needs a worker that is yet to be stopped'
}, async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], {
        TEST_SLOW_START: '1', TEST_SIGNAL_AT_FIRST_STOP: 'SIGTERM'
    });
    t.after(() => stop(www));

    await until(www, 'the workers being forked', () => workers(www).length === WORKERS);
    www.process.kill('SIGTERM');

    await until(www, 'bin/www and its workers ending', () => www.ended);
    assert.equal(www.signal, 'SIGTERM');
    assert.equal(www.output, '');
});

// A terminal's Ctrl+C is for the whole process group, and so is a `kill` with
// the group for a target: the workers get the signal too and die of it on
// their own, and the primary can hear of one of those deaths before it hears
// its own signal. That is not a death to replace, nor one to say anything
// about.
for (const signal of ['SIGTERM', 'SIGINT']) {
    test(`asked to stop with ${signal} along with its workers, bin/www replaces none of them`, async t => {
        const www = launch(['-e', SABOTAGE, BIN_WWW], {
            TEST_SLOW_START: '1', TEST_SIGNAL_TO_A_WORKER_FIRST: signal
        });
        t.after(() => stop(www));

        await until(www, 'bin/www and its workers ending', () => www.ended);
        assert.equal(www.signal, signal);
        assert.equal(www.output, '');
    });
}

// The primary answers what its workers ask it, and an answer that crosses with
// the SIGKILL it has just sent the worker cannot be delivered. That is worth a
// line when a worker dies on it (`a message could not be delivered`). It is
// not when the primary is stopping the worker itself, or a stop with nothing
// wrong with it ends, some of the times, with a line or two of those. When an
// answer crosses is not for a test to decide, so here the primary has one for
// every worker that dies - all but the last, whose death is the end of the
// primary too.
test('asked to stop, bin/www does not report the answers that the workers it stops do not get', {
    skip: WORKERS < 2 && 'needs a worker to die before the last one does'
}, async t => {
    const www = launch(['-e', SABOTAGE, BIN_WWW], { TEST_SLOW_START: '1', TEST_LATE_ANSWERS: '1' });
    t.after(() => stop(www));

    await until(www, 'the workers being forked', () => workers(www).length === WORKERS);
    www.process.kill('SIGTERM');

    await until(www, 'bin/www and its workers ending', () => www.ended);
    assert.equal(www.signal, 'SIGTERM');
    assert.equal(www.output, '');
});

// With the cluster serving the same stop was quiet already - workers that are
// up leave on their own when their primary goes - and so it has to stay.
for (const signal of ['SIGTERM', 'SIGINT']) {
    test(`asked to stop with ${signal} while serving, bin/www ends the same way`, async t => {
        const www = launch(['-e', SABOTAGE, BIN_WWW], { TEST_DATABASE_UP_TO: 'Infinity' });
        t.after(() => stop(www));

        // Both: the primary can say that a worker has started before the
        // worker itself has got to say that it is listening.
        await until(www, 'the workers starting',
            () => started(www) >= WORKERS && listening(www) >= WORKERS);
        assert.equal(await failedLogin(www), 400);
        const said = www.output;
        www.process.kill(signal);

        await until(www, 'bin/www and its workers ending', () => www.ended);
        assert.equal(www.signal, signal);
        // Not a word more: no worker reported dead, none replaced.
        assert.equal(www.output, said);
    });
}
