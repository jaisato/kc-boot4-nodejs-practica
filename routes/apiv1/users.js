var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var jwt = require('jsonwebtoken');
var jwtAuth = require('../../lib/jwtAuth');

var bcrypt = require('bcrypt');

var APIError = require('../../lib/APIError');

const BCRYPT_SALT_ROUNDS = 10;

/* GET authenticate users */
router.post('/login', function(req, res, next) {
  var email = req.body.email;

  if (!email || !req.body.password) {
    return next(new APIError(400, 'Email and password are required'));
  }

  // search user by email only, then compare password with bcrypt.compare
  User.findOne({email: email}, function (err, user) {
    if (err) {
      return next(err);
    }

    if (!user) {
      var error = new APIError(401, 'Invalid credentials');
      return next(error);
    }

    // Compare password using bcrypt.compare instead of hashing and matching
    bcrypt.compare(req.body.password, user.password, function (err, isMatch) {
      if (err) {
        return next(err);
      }

      if (!isMatch) {
        return next(new APIError(401, 'Invalid credentials'));
      }

      var token = jwt.sign(
          {id: user._id},
          jwtAuth.TOKEN_SECRET,
          {expiresIn: '2h'}
      );

      res.json({success: true, token: token});
    });
  });
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  if (!req.body.name || !req.body.email || !req.body.password) {
    return next(new APIError(400, 'Name, email, and password are required'));
  }

  if (req.body.password.length < 8) {
    return next(new APIError(400, 'Password must be at least 8 characters'));
  }

  bcrypt.hash(req.body.password, BCRYPT_SALT_ROUNDS, function (err, passwordHash) {
    if (err) {
      return next(err);
    }

    var userFields = {
      name: req.body.name,
      email: req.body.email,
      password: passwordHash
    };

    var newUser = new User(userFields);

    newUser.save(function (err, userCreated) {
      if (err) {
        return next(err);
      }

      // Do not return password hash in response
      res.json({
        success: true,
        data: {
          name: userCreated.name,
          email: userCreated.email,
          _id: userCreated._id
        }
      });
    });
  });
});

module.exports = router;
