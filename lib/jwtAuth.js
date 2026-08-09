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