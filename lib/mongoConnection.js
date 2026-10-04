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

/**
 * Opens the connection, retrying while MongoDB is unreachable.
 *
 * `mongoose.connect(uri)` returns a promise that rejects when the first
 * connection attempt fails, and nothing handled it: since Node 15 an unhandled
 * rejection terminates the process. A database that was not up yet when the API
 * started (a container started in the wrong order, a restart of mongod) took
 * the cluster primary down and, with it, every worker. Mongoose does not retry
 * a failed *initial* connection on its own - it only reconnects one that had
 * been established - so the retry is done here. Meanwhile the routes that need
 * the database answer with an error and the rest of the API keeps working.
 */
var RETRY_DELAY_MS = 5000;

function connect() {
    mongoose.connect(uri).catch(function () {
        // The 'error' listener above has already logged the cause.
        console.error('Retrying the MongoDB connection in ' + (RETRY_DELAY_MS / 1000) + 's.');
        setTimeout(connect, RETRY_DELAY_MS);
    });
}

connect();

module.exports = db;
