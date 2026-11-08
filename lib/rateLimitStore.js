'use strict';

/**
 * Where the rate limiters in routes/apiv1/users.js keep their counters.
 *
 * express-rate-limit's default MemoryStore lives in the memory of the process
 * that created it, and bin/www runs one worker per CPU behind a round-robin
 * balancer. Every worker therefore kept its own count, so the documented
 * budget of ten failed logins per fifteen minutes was really ten per worker:
 * forty on a four-core host, and a client only had to open a new connection
 * per attempt to be spread across all of them.
 *
 * When bin/www forks the workers, its primary keeps the counters instead and
 * the workers reach them over the cluster IPC channel, so the budget is per
 * client again for the whole host. Anything else - the tests, a worker forked
 * by some other cluster manager (whose primary would never answer) - keeps the
 * in-process store.
 */

var clusterStore = require('@express-rate-limit/cluster-memory-store');

var sharedThroughPrimary = false;

/**
 * For the primary in bin/www, before it forks: holds the counters.
 */
function setupPrimary() {
    new clusterStore.ClusterMemoryStorePrimary().init();
}

/**
 * For the workers bin/www forks, before the app is loaded: the primary above
 * is there to answer.
 */
function useSharedStore() {
    sharedThroughPrimary = true;
}

/**
 * The `store` option for one limiter. Each limiter needs its own prefix, or
 * login failures and sign-ups would be counted against the same budget.
 *
 * @param {string} prefix
 * @returns {object|undefined} undefined selects express-rate-limit's default
 *   in-process MemoryStore
 */
function create(prefix) {
    return sharedThroughPrimary
        ? new clusterStore.ClusterMemoryStoreWorker({prefix: prefix})
        : undefined;
}

module.exports = {
    setupPrimary: setupPrimary,
    useSharedStore: useSharedStore,
    create: create
};
