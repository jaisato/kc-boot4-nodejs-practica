'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

test('a failed first connection exits with code 1 instead of an unhandled rejection', async () => {
    const originalConnect = mongoose.connect;
    const originalExit = process.exit;
    const originalError = console.error;
    const exits = [];
    const logged = [];

    mongoose.connect = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:1'));
    process.exit = code => { exits.push(code); };
    console.error = (...args) => { logged.push(args.join(' ')); };

    try {
        require('../lib/mongoConnection');
        // Let the rejection reach the handler.
        await new Promise(resolve => setImmediate(resolve));
    } finally {
        mongoose.connect = originalConnect;
        process.exit = originalExit;
        console.error = originalError;
    }

    assert.deepEqual(exits, [1]);
    assert.ok(logged.some(line => line.includes('ECONNREFUSED')), logged.join('\n'));
});
