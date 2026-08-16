/**
 * Created by jairo on 29/10/16.
 */
'use strict';

var mongoose = require('mongoose');
var db = mongoose.connection;

// The connection string was hard-coded to localhost, so the app could only ever
// talk to a database on the same host as the process - there was no way to point
// a container or a deployed instance at a real server without editing the
// source. It comes from the environment now, keeping the old value as the
// development default.
var uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodepop';

// `console.log.bind(console)` sent connection failures to stdout as ordinary
// output, where they are indistinguishable from normal logging.
db.on('error', function (err) {
    console.error('MongoDB connection error:', err && err.message ? err.message : err);
});

db.on('disconnected', function () {
    console.warn('MongoDB disconnected.');
});

db.once('open', function () {
    // Never log the URI itself: it carries the password when one is configured.
    console.log('Connected to MongoDB.');
});

mongoose.connect(uri);

module.exports = db;
