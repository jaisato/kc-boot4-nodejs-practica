/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var jwt = require('jsonwebtoken');

// SECURITY FIX: Read JWT secret from environment variable instead of hardcoding it.
// Set JWT_SECRET in your environment before running the app.
var tokenSecret = process.env.JWT_SECRET;
if (!tokenSecret) {
    console.error('FATAL: JWT_SECRET environment variable is not set. Please set it before starting the app.');
    console.error('Example: export JWT_SECRET=$(node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))")');
    process.exit(1);
}

function checkToken() {
    return function (req, res, next) {
        // SECURITY FIX: Only accept token from headers, not from query string or body.
        // Tokens in query strings get logged in server logs and browser history.
        var token = req.headers['x-access-token'] || req.headers['authorization'];

        // Support "Bearer <token>" format
        if (token && token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        // Checks token
        if (token) {

            jwt.verify(token, tokenSecret, { algorithms: ['HS256'] }, function(err, decoded) {

                if (err) {
                    return res.status(401).json({
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