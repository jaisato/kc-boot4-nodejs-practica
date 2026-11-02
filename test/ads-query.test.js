'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('../models/Ad');
const Ad = mongoose.model('Ad');
const originalList = Ad.list;
const calls = [];
Ad.list = async (...args) => { calls.push(args); return []; };
const app = express();
app.set('query parser', 'extended');
app.use('/ads', require('../routes/apiv1/ads'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
let server, base;
const token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET);
before(async () => {
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/ads`;
});
after(async () => { Ad.list = originalList; await new Promise(resolve => server.close(resolve)); });
async function request(query) {
    return fetch(base + query, { headers: { Authorization: `Bearer ${token}` } });
}
for (const query of [
    '?minprice=12euros', '?maxprice=Infinity', '?minprice=1&minprice=2',
    '?maxprice[]=3', '?minprice=1e999', '?limit=2.5', '?limit=20items',
    '?limit=1&limit=2', '?skip=3.8', '?skip=9007199254740993', '?onsale[x]=1'
]) {
    test(`rejects invalid numeric/boolean input ${query}`, async () => {
        const count = calls.length;
        const response = await request(query);
        assert.equal(response.status, 400);
        await response.json();
        assert.equal(calls.length, count, 'invalid input must not reach the database');
    });
}
test('preserves decimal prices, integer paging and false filter', async () => {
    const response = await request('?minprice=12.50&maxprice=2e2&limit=4&skip=3&onsale=false');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, ads: [] });
    const [filter, , limit, skip] = calls.at(-1);
    assert.deepEqual(filter, { price: { $gte: 12.5, $lte: 200 }, on_sale: false });
    assert.equal(limit, 4); assert.equal(skip, 3);
});
test('preserves default paging and clamps valid large limits', async () => {
    let response = await request(''); await response.json();
    assert.equal(response.status, 200); assert.equal(calls.at(-1)[2], 20);
    response = await request('?limit=1000&skip=0'); await response.json();
    assert.equal(response.status, 200); assert.equal(calls.at(-1)[2], 100);
});
test('always sorts with _id as the last key, in the direction of the key before it', async () => {
    const cases = [
        ['', '_id'], ['?sort=price', 'price _id'], ['?sort=-price', '-price -_id'],
        ['?sort=-price,name', '-price name _id'], ['?sort=price,-name', 'price -name -_id'],
        ['?sort=-_id', '-_id'], ['?sort=-price,_id', '-price _id']
    ];
    for (const [query, expected] of cases) {
        const response = await request(query); await response.json();
        assert.equal(response.status, 200);
        assert.equal(calls.at(-1)[1], expected, query);
    }
});
// What buildSort() accepts besides _id: SELECTABLE_FIELDS in routes/apiv1/ads.js.
const SORT_FIELDS = ['name', 'price', 'on_sale', 'photo', 'tags'];
test('SORT_FIELDS and _id are every sort key the API accepts', async () => {
    const response = await request('?sort=nope');
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.ok(error.includes(`Allowed: ${['_id', ...SORT_FIELDS].join(', ')}, `), error);
});
test('every single-field sort has a {field: 1, _id: 1} index to walk, either way', async () => {
    // Compared as JSON, not deepEqual: the order of its keys is what makes an index.
    const indexes = Ad.schema.indexes().map(([keys]) => JSON.stringify(keys));
    for (const field of SORT_FIELDS) {
        assert.ok(indexes.includes(JSON.stringify({ [field]: 1, _id: 1 })), `no {${field}: 1, _id: 1} index`);
        for (const [query, expected] of [[field, `${field} _id`], [`-${field}`, `-${field} -_id`]]) {
            const response = await request(`?sort=${query}`); await response.json();
            assert.equal(response.status, 200);
            assert.equal(calls.at(-1)[1], expected, query);
        }
    }
});
