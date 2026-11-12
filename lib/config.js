'use strict';

/**
 * What the app is told through the environment and refuses to start without
 * having right, read and checked in one place.
 *
 * Each setting used to be checked where it is used - JWT_SECRET in
 * lib/jwtAuth.js, TRUST_PROXY_HOPS in app.js, PUBLIC_BASE_URL in
 * routes/apiv1/ads.js - and that is code only the workers load. So it was each
 * worker that found a setting missing or wrong, loading the app, and died of
 * it with a stack trace, and the primary that went on replacing them until it
 * had seen enough to give up: a trace per worker and one more, for something
 * that was known before the first of them was forked. bin/www loads this
 * before anything else, in whichever process it is, and says what is wrong in
 * a line per setting.
 *
 * With something wrong this module does not load: it throws, saying all there
 * is to say and with ERR_NODEPOP_CONFIG for a code. Whatever else loads the
 * app - a test, a script - cannot run on a setting that is wrong either.
 */

var problems = [];

/**
 * The secret tokens are signed with (lib/jwtAuth.js).
 */
function readJwtSecret(raw) {
    if (!raw) {
        problems.push(
            'JWT_SECRET is not set. Generate one (for example: openssl rand -hex 32) ' +
            'and export it before starting the app.'
        );
    }

    return raw;
}

/**
 * How many reverse proxies sit in front of the app (app.js).
 *
 * The whole value has to be a non-negative integer. parseInt() alone reads as
 * far as it understands and discards the rest, which on a setting that decides
 * which address the rate limiter trusts turns a typo into a silent
 * misconfiguration: "10oops" trusted ten hops instead of one, so a
 * client-supplied X-Forwarded-For entry became the limiter key; "1.5" quietly
 * became 1; and "foo" left proxy trust off, collapsing every proxied client
 * into one shared bucket. None of those announced themselves.
 *
 * An empty or whitespace-only value means "unset", the way an exported but
 * unfilled variable usually does; only a value someone actually typed is held
 * to the format.
 */
function readTrustProxyHops(raw) {
    var value = (raw || '').trim();

    if (value.length > 0 && !/^\d+$/.test(value)) {
        problems.push(
            'TRUST_PROXY_HOPS must be a non-negative integer (the number of reverse ' +
            'proxies in front of this app; 0 or unset means none). Got: ' +
            JSON.stringify(value)
        );
    }

    return parseInt(value || '0', 10);
}

/**
 * The public origin the photo links are built on (routes/apiv1/ads.js).
 *
 * Empty or whitespace-only means "unset", the way an exported but unfilled
 * variable usually does, and keeps the request-derived origin. Anything else
 * has to be an absolute http(s) URL. A value that does not parse - a bare host
 * name, a typo in the scheme, a stray quote - would otherwise be glued onto
 * every photo link and only be noticed when a client failed to load an image.
 * A path prefix is allowed, since the app may be mounted under one; a query
 * string or fragment is not, because neither can be part of a base that paths
 * are appended to.
 *
 * @returns {string|null} the base without a trailing slash, or null when unset
 */
function readPublicBaseUrl(raw) {
    var value = (raw || '').trim();

    if (value.length === 0) {
        return null;
    }

    var parsed;

    try {
        parsed = new URL(value);
    } catch (e) {
        problems.push(
            'PUBLIC_BASE_URL must be an absolute URL such as https://api.example.com ' +
            '(the public origin the photo links are built on). Got: ' +
            JSON.stringify(value)
        );
        return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        problems.push(
            'PUBLIC_BASE_URL must be an http or https URL. Got: ' + JSON.stringify(value)
        );
    } else if (parsed.search || parsed.hash) {
        problems.push(
            'PUBLIC_BASE_URL must not carry a query string or fragment. Got: ' +
            JSON.stringify(value)
        );
    }

    return value.replace(/\/+$/, '');
}

module.exports = {
    jwtSecret: readJwtSecret(process.env.JWT_SECRET),
    trustProxyHops: readTrustProxyHops(process.env.TRUST_PROXY_HOPS),
    publicBaseUrl: readPublicBaseUrl(process.env.PUBLIC_BASE_URL)
};

if (problems.length > 0) {
    var error = new Error(problems.join('\n'));

    error.code = 'ERR_NODEPOP_CONFIG';
    throw error;
}
