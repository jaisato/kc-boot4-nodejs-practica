/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var jwt = require('jsonwebtoken');

let tokenSecret = 'cb6fc92a82829eb4e2bed3ec42f6e59cb1b1093f';

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