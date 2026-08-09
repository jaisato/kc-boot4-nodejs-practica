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
 * A bcrypt hash of a value nobody can supply. Comparing against it when the
 * e-mail is unknown keeps the failing paths the same shape: without it, an
 * absent e-mail returns immediately while a wrong password pays for a cost-10
 * comparison, and that latency difference enumerates registered addresses just
 * as well as a distinct error message would.
 */
const DUMMY_HASH = bcrypt.hashSync('user-does-not-exist', BCRYPT_ROUNDS);

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

  // Fetch every account with this e-mail. The schema puts no unique index on
  // the column and /signup does not reject duplicates, so more than one row can
  // share an address. The original query matched on e-mail *and* password hash,
  // which happened to pick the right row; looking up a single arbitrary match
  // would lock the other account out, so each candidate is checked in turn.
  User.find({email: email}, function (err, users) {
    if (err) {
      return next(err);
    }

    if (!users || users.length === 0) {
      return bcrypt.compare(password, DUMMY_HASH, function () {
        // Same answer whether the account is missing or the password is wrong,
        // so the endpoint cannot be used to enumerate registered e-mails.
        next(new APIError(401, 'Invalid credentials.'));
      });
    }

    var index = 0;

    (function tryNext() {
      if (index >= users.length) {
        return next(new APIError(401, 'Invalid credentials.'));
      }

      var user = users[index++];

      bcrypt.compare(password, user.password, function (err, matches) {
        if (err) {
          return next(err);
        }

        if (!matches) {
          return tryNext();
        }

        var token = jwt.sign(
            {id: user._id},
            jwtAuth.TOKEN_SECRET,
            {expiresIn: '24 hours'}
        );

        res.json({success: true, token: token});
      });
    })();
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

    // validate() is asynchronous: returning from its callback did not stop the
    // save() below, so an invalid document called next(err) here and again from
    // save(), responding twice.
    newUser.validate(function (err) {
      if (err) {
        return next(err);
      }

      newUser.save(function (err, userCreated) {
        if (err) {
          return next(err);
        }

        res.json({
          success: true,
          data: userCreated
        });
      });
    });
  });
});

module.exports = router;
