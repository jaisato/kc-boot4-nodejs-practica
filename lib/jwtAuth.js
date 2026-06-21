/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET environment variable is not set. Using an insecure default. Set JWT_SECRET in your environment for production use.');
}

let tokenSecret = process.env.JWT_SECRET || 'change-this-secret-in-production';

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
