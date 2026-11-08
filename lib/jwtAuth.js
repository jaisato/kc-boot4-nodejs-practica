/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var jwt = require('jsonwebtoken');

// The secret used to live here in plain text. Anyone holding a copy of this
// repository could mint a token for any user id, which is a complete
// authentication bypass - so it comes from the environment now and the process
// refuses to start without it. The old value is in the history and must be
// treated as burned.
let tokenSecret = process.env.JWT_SECRET;

if (!tokenSecret) {
    throw new Error(
        'JWT_SECRET is not set. Generate one (for example: openssl rand -hex 32) ' +
        'and export it before starting the app.'
    );
}

/**
 * The only algorithm tokens are signed and accepted with.
 *
 * Without an explicit list, jsonwebtoken derives the accepted algorithms from
 * the key: with a string secret that is HS256, HS384 and HS512, so the token
 * itself chose which one the server ran. Signing and verifying with one fixed
 * algorithm is what the JWT best-current-practice (RFC 8725 section 3.1) asks
 * for, and it stops an `alg` the app never issues from being accepted if the
 * library defaults or the key type change later.
 */
const ALGORITHM = 'HS256';

/**
 * Reads the bearer token from the request.
 *
 * The token used to be accepted from `req.query.token` and `req.body.token` as
 * well. A credential in the query string is written verbatim into the access
 * log by morgan, into any reverse-proxy log in front of the app, and is sent on
 * in the `Referer` header of every outbound link - so a token that should live
 * only in memory ends up on disk in several places. Only the header is read
 * now; `Authorization: Bearer <token>` is the standard spelling and
 * `x-access-token` stays supported for existing clients.
 */
function readToken(req) {
    var authorization = req.headers['authorization'];

    if (typeof authorization === 'string') {
        var match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());

        if (match) {
            return match[1];
        }
    }

    var legacy = req.headers['x-access-token'];

    return typeof legacy === 'string' && legacy.length > 0 ? legacy : null;
}

function checkToken() {
    return function (req, res, next) {
        var token = readToken(req);

        if (!token) {
            // 401, not 403: the request is unauthenticated (no credential), it
            // is not an authenticated request being denied. The WWW-Authenticate
            // header is what RFC 7235 requires alongside a 401.
            return res.status(401)
                .set('WWW-Authenticate', 'Bearer')
                .json({
                    success: false,
                    error: {
                        code: 401,
                        message: 'No token provided'
                    }
                });
        }

        jwt.verify(token, tokenSecret, {algorithms: [ALGORITHM]}, function (err, decoded) {
            if (err) {
                // This answered 200 OK with `ok: false` in the body, so any
                // client checking the status code treated a rejected token as a
                // successful call.
                return res.status(401)
                    .set('WWW-Authenticate', 'Bearer error="invalid_token"')
                    .json({
                        success: false,
                        error: {
                            code: 401,
                            message: 'Failed to authenticate token'
                        }
                    });
            }

            req.decoded = decoded;
            next();
        });
    };
}

/**
 * JWT auth middleware.
 *
 * @example
 * app.use('/api-requiring-auth', jwtAuth());
 *
 * @returns {function} Express 4 middleware
 */
module.exports = {
    checkToken: checkToken,
    TOKEN_SECRET: tokenSecret,
    ALGORITHM: ALGORITHM
};