'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const rateLimitStore = require('../lib/rateLimitStore');

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
