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

/**
 * How a worker tells that the primary which forked it is the one holding the
 * counters: that primary leaves its own pid here, in the environment its
 * workers inherit.
 *
 * Being a cluster worker is not enough to go by. PM2 in cluster mode, like any
 * other manager that forks bin/www itself, is a primary too, and one that
 * never answers: every login and sign-up waited a second for it and was then
 * refused with a 500. The pid rather than a flag, so that a value inherited
 * from anywhere else names a process that is not this one's parent.
 */
var PRIMARY_PID_VARIABLE = 'NODEPOP_RATE_LIMIT_PRIMARY_PID';

var sharedThroughPrimary = false;

/**
 * For the primary in bin/www, before it forks: holds the counters.
 */
function setupPrimary() {
    new clusterStore.ClusterMemoryStorePrimary().init();
    process.env[PRIMARY_PID_VARIABLE] = String(process.pid);
}

/**
 * For the workers of bin/www, before the app is loaded. It only takes effect
 * when the primary above is the process that forked this one, and so is there
 * to answer.
 */
function useSharedStore() {
    sharedThroughPrimary = process.env[PRIMARY_PID_VARIABLE] === String(process.ppid);
}

/**
 * The `store` option for one limiter. Each limiter needs its own prefix, or
 * login failures and sign-ups would be counted against the same budget.
 *
 * When the primary does not answer within the second the store gives it, the
 * limiter cannot count and the request is refused with a 500: express-rate-limit
 * awaits increment(), and letting attempts through uncounted is not what a
 * login budget is for.
 *
 * @param {string} prefix
 * @returns {object|undefined} undefined selects express-rate-limit's default
 *   in-process MemoryStore
 */
function create(prefix) {
    if (!sharedThroughPrimary) {
        return undefined;
    }

    var store = new clusterStore.ClusterMemoryStoreWorker({prefix: prefix});
    var decrement = store.decrement;

    // decrement() is another matter. express-rate-limit takes a successful
    // login back off the count once the response has been sent, and nothing
    // awaits that call: a rejection there is an unhandled one, which ends the
    // worker. All a lost decrement costs is one successful login counted
    // against the client's budget.
    store.decrement = function (key) {
        return decrement.call(store, key).catch(function (err) {
            console.error(
                'Rate limit: decrement of the %s budget not confirmed:',
                prefix, err && err.message ? err.message : err
            );
        });
    };

    return store;
}

module.exports = {
    PRIMARY_PID_VARIABLE: PRIMARY_PID_VARIABLE,
    setupPrimary: setupPrimary,
    useSharedStore: useSharedStore,
    create: create
};
