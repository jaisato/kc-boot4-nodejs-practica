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
 * Hard cap on how many stored passwords one login request may check.
 *
 * The e-mail column is unique now, so in a healthy database this is always 1.
 * The cap exists for collections created before that index, where duplicates
 * may already sit: it keeps legacy accounts working without letting the number
 * of bcrypt comparisons - and therefore the CPU cost of an unauthenticated
 * request - be driven by the stored data.
 */
const MAX_LOGIN_CANDIDATES = 3;

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

  // At most MAX_LOGIN_CANDIDATES accounts are considered. The address is unique
  // going forward, so this is normally a single row; the limit bounds the work
  // for collections that already contain duplicates from before the index.
  User.find({email: email}).limit(MAX_LOGIN_CANDIDATES).exec(function (err, users) {
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

    if (users.length === MAX_LOGIN_CANDIDATES) {
      // Hitting the cap means the unique index is not in place, so an account
      // beyond it can never authenticate. Say so instead of failing silently:
      // the fix is `npm run migrate:unique-email`.
      console.warn(
        'login: %d accounts share an e-mail; the unique index is missing. ' +
        'Run "npm run migrate:unique-email" - accounts past the cap cannot sign in.',
        users.length
      );
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

    var emailField = requireString(req.body.email);

    if (!emailField) {
      return next(new APIError(400, 'email is required.'));
    }

    var userFields = {
      name: req.body.name,
      email: emailField,
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
          // The unique index rejects an address that is already registered.
          // Answering 409 keeps the raw driver error out of the response.
          if (err.code === 11000) {
            return next(new APIError(409, 'That e-mail is already registered.'));
          }

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
