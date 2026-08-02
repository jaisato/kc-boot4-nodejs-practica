var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var jwt = require('jsonwebtoken');
var jwtAuth = require('../../lib/jwtAuth');

var bcrypt = require('bcrypt');

var APIError = require('../../lib/APIError');

// Number of bcrypt salt rounds. A fresh, random salt is generated for every
// password (do NOT reuse a fixed salt string: a shared salt lets an
// attacker precompute a single rainbow table that works against every
// user's password hash instead of having to attack each one individually).
const SALT_ROUNDS = 10;

/* GET authenticate users */
router.post('/login', function(req, res, next) {
  var email = req.body.email;
  var password = req.body.password;

  // Guard against NoSQL injection: email/password must be plain strings,
  // not objects (e.g. {"$gt": ""}) that would be interpreted as Mongo
  // query operators if passed straight into findOne().
  if (typeof email !== 'string' || typeof password !== 'string') {
    var invalidError = new APIError(400, 'Email and password are required.');
    return next(invalidError);
  }

  User.findOne({email: email}, function (err, user) {
    if (err) {
      return next(err);
    }

    if (!user) {
      var error = new APIError(404, 'User not found!');
      return next(error);
    }

    // Compare against the stored hash (which embeds its own unique salt)
    // instead of recomputing a hash with a shared salt and matching it via
    // the query, which only "worked" because the salt was fixed.
    bcrypt.compare(password, user.password, function (err, match) {
      if (err) {
        return next(err);
      }

      if (!match) {
        var error = new APIError(404, 'User not found!');
        return next(error);
      }

      var token = jwt.sign(
          {id: user._id},
          jwtAuth.TOKEN_SECRET,
          {expiresIn: '24 hours'}
      );

      res.json({success: true, token: token});
    });
  });
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  bcrypt.hash(req.body.password, SALT_ROUNDS, function (err, passwordHash) {
    if (err) {
      return next(err);
    }

    var userFields = {
      name: req.body.name,
      email: req.body.email,
      password: passwordHash
    };

    var newUser = new User(userFields);

    newUser.validate(function (err) {
      if (err) {
        return next(err);
      }
    });

    newUser.save(function (err, userCreated) {
      if (err) {
        return next(err);
      }

      res.json({
        success: true,
        data: userCreated
      });
    })
  });
});

module.exports = router;
