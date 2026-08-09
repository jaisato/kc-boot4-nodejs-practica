var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var jwt = require('jsonwebtoken');
var jwtAuth = require('../../lib/jwtAuth');

var bcrypt = require('bcrypt');

var APIError = require('../../lib/APIError');

// bcrypt generates a fresh salt per password when given a cost factor. The
// previous code reused one hard-coded salt for every user, so identical
// passwords produced identical hashes and a single rainbow table covered the
// whole user base.
const BCRYPT_ROUNDS = 10;

/**
 * Request bodies are JSON, so `{"email": {"$ne": null}}` arrives as an object
 * and Mongo treats it as an operator rather than a value. Every field that
 * reaches a query has to be a string first.
 */
function requireString(value) {
    return typeof value === 'string' ? value : null;
}

/* GET authenticate users */
router.post('/login', function(req, res, next) {
  var email = requireString(req.body.email);
  var password = requireString(req.body.password);

  if (!email || !password) {
    return next(new APIError(400, 'email and password are required.'));
  }

  // Look the user up by e-mail and then compare with bcrypt. Querying by
  // password hash only worked because every hash shared one salt, and it also
  // meant the stored hash had to be recomputed on the way in.
  User.findOne({email: email}, function (err, user) {
    if (err) {
      return next(err);
    }

    if (!user) {
      // Same answer whether the account is missing or the password is wrong,
      // so the endpoint cannot be used to enumerate registered e-mails.
      return next(new APIError(401, 'Invalid credentials.'));
    }

    bcrypt.compare(password, user.password, function (err, matches) {
      if (err) {
        return next(err);
      }

      if (!matches) {
        return next(new APIError(401, 'Invalid credentials.'));
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
  var password = requireString(req.body.password);

  if (!password) {
    return next(new APIError(400, 'password is required.'));
  }

  bcrypt.hash(password, BCRYPT_ROUNDS, function (err, passwordHash) {
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
