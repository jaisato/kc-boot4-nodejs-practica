/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var jwt = require('jsonwebtoken');

// The JWT signing secret must be provided via the JWT_SECRET environment
// variable. A hardcoded secret was previously committed to source control;
// it must be considered compromised and must never be reused.
let tokenSecret = process.env.JWT_SECRET;

if (!tokenSecret) {
    // NOTE: this app runs multiple cluster workers (see bin/www), so the
    // fallback must be deterministic across processes rather than random
    // (a per-process random secret would make tokens signed by one worker
    // fail verification on another). This fallback is for local/dev use
    // only; always set JWT_SECRET in any shared or production environment.
    console.warn(
        'WARNING: JWT_SECRET environment variable is not set. ' +
        'Using an insecure development-only default secret. ' +
        'Set JWT_SECRET in your environment before deploying.'
    );
    tokenSecret = 'INSECURE-DEV-ONLY-SET-JWT_SECRET-ENV-VAR';
}

function checkToken() {
    return function (req, res, next) {
        var token = req.body.token || req.query.token || req.headers['x-access-token'];

        // Checks token
        if (token) {

            jwt.verify(token, tokenSecret, function(err, decoded) {

                if (err) {
                    return res.json({
                        ok: false,
                        error: {
                            code: 401,
                            message: 'Failed to authenticate token'
                        }
                    });

                } else {
                    req.decoded = decoded;
                    console.log('decoded', decoded);
                    next();
                }
            });

        } else {
            // No token
            return res.status(403).json({
                ok: false,
                error: {
                    code: 403,
                    message: 'No token provided'
                }
            });
        }
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
    TOKEN_SECRET: tokenSecret
};