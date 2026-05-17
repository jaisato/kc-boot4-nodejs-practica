var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var jwt = require('jsonwebtoken');
var jwtAuth = require('../../lib/jwtAuth');

var bcrypt = require('bcrypt');
var validator = require('validator');

var APIError = require('../../lib/APIError');

// SECURITY FIX: Use auto-generated salt rounds instead of a hardcoded salt.
// bcrypt.hash with a number generates a random salt automatically.
const SALT_ROUNDS = 12;

/* POST authenticate users */
router.post('/login', function(req, res, next) {
  var email = req.body.email;
  var password = req.body.password;

  // SECURITY FIX: Validate inputs before processing
  if (!email || !password) {
    return next(new APIError(400, 'Email and password are required.'));
  }

  if (!validator.isEmail(email)) {
    return next(new APIError(400, 'Invalid email format.'));
  }

  // SECURITY FIX: Find user first, then compare password with bcrypt.compare().
  // This is the correct way to verify bcrypt passwords -- never hash and string-compare.
  User.findOne({email: email}, function (err, user) {
    if (err) {
      return next(err);
    }

    if (!user) {
      // SECURITY FIX: Use generic message to prevent user enumeration
      return next(new APIError(401, 'Invalid email or password.'));
    }

    bcrypt.compare(password, user.password, function (err, isMatch) {
      if (err) {
        return next(err);
      }

      if (!isMatch) {
        return next(new APIError(401, 'Invalid email or password.'));
      }

      var token = jwt.sign(
          {id: user._id},
          jwtAuth.TOKEN_SECRET,
          {expiresIn: '2h', algorithm: 'HS256'}
      );

      res.json({success: true, token: token});
    });
  });
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  var name = req.body.name;
  var email = req.body.email;
  var password = req.body.password;

  // SECURITY FIX: Validate inputs
  if (!name || !email || !password) {
    return next(new APIError(400, 'Name, email, and password are required.'));
  }

  if (!validator.isEmail(email)) {
    return next(new APIError(400, 'Invalid email format.'));
  }

  // Sanitize inputs
  name = validator.trim(name);
  email = validator.normalizeEmail(email);

  if (password.length < 8) {
    return next(new APIError(400, 'Password must be at least 8 characters long.'));
  }

  bcrypt.hash(password, SALT_ROUNDS, function (err, passwordHash) {
    if (err) {
      return next(err);
    }

    var userFields = {
      name: name,
      email: email,
      password: passwordHash
    };

    var newUser = new User(userFields);

    newUser.save(function (err, userCreated) {
      if (err) {
        return next(err);
      }

      // SECURITY FIX: Never return the password hash in the response
      res.json({
        success: true,
        data: {
          _id: userCreated._id,
          name: userCreated.name,
          email: userCreated.email
        }
      });
    });
  });
});

module.exports = router;
