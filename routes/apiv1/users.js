var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var jwt = require('jsonwebtoken');
var jwtAuth = require('../../lib/jwtAuth');

var bcrypt = require('bcrypt');

var APIError = require('../../lib/APIError');

/* GET authenticate users */
router.post('/login', function(req, res, next) {
  // search user
  bcrypt.genSalt(10, function (err, salt) {
    if (err) {
      return next(err);
    }

    bcrypt.hash(req.body.password, salt, function (err, passwordHash) {
      if (err) {
        return next(err);
      }

      var email = req.body.email;
      // Find user by email first, then compare password
      var user = User.findOne({email: email}, function (err, user) {
        if (err) {
          return next(err);
        }

        if (!user) {
          var error = new APIError(404, 'User not found!');
          return next(error);
        }

        bcrypt.compare(req.body.password, user.password, function (err, isMatch) {
          if (err) {
            return next(err);
          }

          if (!isMatch) {
            var error = new APIError(401, 'Invalid credentials');
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
  });
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  bcrypt.genSalt(10, function (err, salt) {
    if (err) {
      return next(err);
    }

    bcrypt.hash(req.body.password, salt, function (err, passwordHash) {
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
          data: {
            name: userCreated.name,
            email: userCreated.email
          }
        });
      });
    });
  });
});

module.exports = router;
