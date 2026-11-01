'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
delete process.env.NODE_ENV;
const mongoose = require('mongoose');
// app.js opens the database connection on load; nothing here needs it.
mongoose.connect = async () => {};
const app = require('../app');

let server, base;
before(async () => {
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

test('without NODE_ENV the API error body carries no stack trace', async () => {
    const response = await fetch(base + '/apiv1/does-not-exist');
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 404);
    assert.equal(body.error.message, 'Not Found');
    assert.equal(body.error.stack, undefined);
});

test('without NODE_ENV the HTML error page carries no stack trace', async () => {
    const response = await fetch(base + '/does-not-exist');
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.doesNotMatch(html, /at .*\(.*\.js:\d+/);
});
