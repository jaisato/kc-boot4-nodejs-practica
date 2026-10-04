'use strict';

var cluster = require('cluster');
var ClusterMemoryStoreWorker =
    require('@express-rate-limit/cluster-memory-store').ClusterMemoryStoreWorker;

/**
 * Picks the store the rate limiters keep their counters in.
 *
 * bin/www forks one worker per CPU, and express-rate-limit's default
 * MemoryStore lives inside each worker. The cluster hands new connections to
 * the workers in turn, so a client opening a fresh connection per attempt had
 * a separate budget in every worker: on an 8-core host the "10 failed logins
 * per 15 minutes" limit was really 80, and it grew with the machine.
 *
 * In a cluster worker the counters are kept in the primary instead
 * (ClusterMemoryStorePrimary, started by bin/www) and every worker asks it over
 * IPC, so the limit is one budget per client again. Outside a cluster (the
 * tests, or requiring the app from a single process) there is nobody to ask,
 * and undefined makes express-rate-limit fall back to its in-process
 * MemoryStore, which is already shared by everything in that process.
 *
 * @param {string} prefix distinct per limiter, so their counters do not mix
 * @returns {object|undefined}
 */
module.exports = function rateLimitStore(prefix) {
    return cluster.isWorker ? new ClusterMemoryStoreWorker({prefix: prefix}) : undefined;
};
