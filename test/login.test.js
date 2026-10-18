'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
require('../models/User');
const User = mongoose.model('User');

// A password that uses bcrypt's whole 72-byte budget, which /signup accepts.
const PASSWORD = 'a'.repeat(72);
const stored = { _id: new mongoose.Types.ObjectId(), password: bcrypt.hashSync(PASSWORD, 4) };

const originalFind = User.find;
User.find = () => ({ limit: () => ({ select: () => ({ exec: async () => [stored] }) }) });

const app = express();
app.use(express.json());
app.use('/users', require('../routes/apiv1/users'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

let server, base;
before(async () => {
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/users`;
});
after(async () => { User.find = originalFind; await new Promise(resolve => server.close(resolve)); });

function login(password) {
    return fetch(base + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: password })
    });
}

test('accepts the exact 72-byte password', async () => {
    const response = await login(PASSWORD);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
});

test('rejects the 72-byte password with extra bytes appended', async () => {
    const response = await login(PASSWORD + 'anything');
    assert.equal(response.status, 401);
    await response.json();
});
