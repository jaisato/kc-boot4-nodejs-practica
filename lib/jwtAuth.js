'use strict';

var jwt = require('jsonwebtoken');

module.exports = function () {
    return function (req, res, next) {

        var tokenSecret = process.env.JWT_SECRET;
        if (!tokenSecret) {
            return res.status(500).json({ success: false, error: 'JWT_SECRET environment variable not configured' });
        }

        var token = req.body.token || req.query.token || req.headers['x-access-token'];

        if (!token) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 403,
                    message: res.__('auth_token_required')
                }
            });
        }

        jwt.verify(token, tokenSecret, function (err, decoded) {
            if (err) {
                return res.status(403).json({ success: false, error: { code: 403, message: res.__('auth_token_not_valid') } });
            }

            req.decoded = decoded;
            next();
        });
    };
};
