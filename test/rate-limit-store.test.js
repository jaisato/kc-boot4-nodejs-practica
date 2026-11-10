'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const rateLimitStore = require('../lib/rateLimitStore');

// The store the workers of bin/www get, created here in a process that is not
// a cluster worker at all: nobody is there to answer it, which is the case
// under test - a primary that has gone quiet.
test('a store the primary does not answer refuses the request and survives the decrement', async t => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const logged = [];
    console.error = (...args) => { logged.push(args.join(' ')); };
    // The library warns that this process is not a worker.
    console.warn = () => {};
    // As bin/www's primary leaves it for the workers it forks.
    process.env[rateLimitStore.PRIMARY_PID_VARIABLE] = String(process.ppid);
    t.after(() => {
        console.error = originalError;
        console.warn = originalWarn;
        delete process.env[rateLimitStore.PRIMARY_PID_VARIABLE];
    });

    rateLimitStore.useSharedStore();
    const store = rateLimitStore.create('test');

    // express-rate-limit awaits increment() before letting the request in, so
    // a failure there has to reject: the request is answered with a 500 instead
    // of going through uncounted.
    await assert.rejects(store.increment('203.0.113.7'));

    // Nothing awaits decrement(): it runs once the response of a successful
    // login has been sent, so a rejection there is an unhandled one, and that
    // ends the worker.
    await store.decrement('203.0.113.7');
    assert.ok(logged.some(line => line.includes('decrement')), logged.join('\n'));
});

test('without the mark of the primary that forked it a worker keeps the in-process store', () => {
    delete process.env[rateLimitStore.PRIMARY_PID_VARIABLE];
    rateLimitStore.useSharedStore();
    assert.equal(rateLimitStore.create('test'), undefined);

    // Inherited from somewhere else: it names a process that is not the parent.
    process.env[rateLimitStore.PRIMARY_PID_VARIABLE] = String(process.pid);
    try {
        rateLimitStore.useSharedStore();
        assert.equal(rateLimitStore.create('test'), undefined);
    } finally {
        delete process.env[rateLimitStore.PRIMARY_PID_VARIABLE];
    }
});
