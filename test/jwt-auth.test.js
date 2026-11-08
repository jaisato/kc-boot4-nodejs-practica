'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const express = require('express');
const jwt = require('jsonwebtoken');
const jwtAuth = require('../lib/jwtAuth');

const app = express();
app.get('/private', jwtAuth.checkToken(), (req, res) => res.json({ id: req.decoded.id }));

let server, base;
before(async () => {
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/private`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

function get(token) {
    return fetch(base, { headers: { Authorization: `Bearer ${token}` } });
}

test('accepts a token signed with HS256', async () => {
    const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    const response = await get(token);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 'u1' });
});

for (const algorithm of ['HS384', 'HS512']) {
    test(`rejects a token signed with ${algorithm}, even with the right secret`, async () => {
        const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET, { algorithm });
        const response = await get(token);
        assert.equal(response.status, 401);
        assert.match(response.headers.get('www-authenticate'), /invalid_token/);
        await response.json();
    });
}

test('rejects an unsigned token (alg: none)', async () => {
    const token = jwt.sign({ id: 'u1' }, null, { algorithm: 'none' });
    const response = await get(token);
    assert.equal(response.status, 401);
    await response.json();
});
