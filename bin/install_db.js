#!/usr/bin/env node

/**
 * Recreates the development database from ads.json.
 *
 * Every step used to be fired off at once: the two deletes, the user insert and
 * one insert per ad were all started in the same tick, so the seed rows raced
 * the deletes that were supposed to precede them. Whether the script left a
 * populated database or an empty one depended on which callback the driver
 * happened to run first. The steps are awaited in order now.
 *
 * mongoose 8 also removed both callback support and `Model.remove()`, so the
 * previous spelling no longer runs at all.
 */

'use strict';

var bcrypt = require('bcrypt');
var mongoose = require('mongoose');
var fs = require('fs');
var path = require('path');

// bcrypt picks a fresh salt per hash when given a cost factor.
const BCRYPT_ROUNDS = 10;

var MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodepop';

// Loading models
require('./../models/Ad');
require('./../models/User');

var Ad = mongoose.model('Ad');
var User = mongoose.model('User');

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    // `deleteMany({})` - `remove(null)` relied on a null filter being read as
    // "everything", which the current driver rejects.
    var removedAds = await Ad.deleteMany({});
    console.log(removedAds.deletedCount + ' ads deleted.');

    var removedUsers = await User.deleteMany({});
    console.log(removedUsers.deletedCount + ' users deleted.');

    // The schema declares email unique. If the collection predates that, the
    // index may still be non-unique; building it here keeps a freshly seeded
    // database consistent with the schema.
    await User.syncIndexes();

    var user = await User.create({
        name: 'user 1',
        email: 'user1@gmail.com',
        password: bcrypt.hashSync('1234', BCRYPT_ROUNDS)
    });
    console.log('User ' + user.name + ' created!');

    var file = fs.readFileSync(path.join(__dirname, '..', 'ads.json'), 'utf8');
    var json = JSON.parse(file);

    // One round trip instead of one per ad.
    var ads = await Ad.insertMany(json.ads);
    console.log(ads.length + ' ads created!');
}

main()
    .then(async function () {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async function (err) {
        // `if (err) throw err` inside a callback threw into the driver's own
        // stack, where nothing was listening: the process printed an
        // unhandled-rejection warning and exited 0, so a failed seed looked
        // like a successful one to any script calling this.
        console.error('Database install failed:', err && err.message ? err.message : err);
        await mongoose.disconnect().catch(function () {});
        process.exit(1);
    });
