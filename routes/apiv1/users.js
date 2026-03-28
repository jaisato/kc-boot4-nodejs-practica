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
  var salt = bcrypt.genSaltSync(10);
  bcrypt.hash(req.body.password, salt, function (err, passwordHash) {
    if (err) {
      return next(err);
    }

    var email = req.body.email;
    var user = User.findOne({email: email, password: passwordHash}, function (err, users) {
      if (err) {
        return next(err);
      }

      if (!users) {
        var error = new APIError(404, 'User not found!');
        return next(error);
      }

      var token = jwt.sign(
          {id: users._id},
          jwtAuth.TOKEN_SECRET,
          {expiresIn: '24 hours'}
      );

      res.json({success: true, token: token});
    });
  });
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  var salt = bcrypt.genSaltSync(10);
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

      var userResponse = userCreated.toObject();
      delete userResponse.password;

      res.json({
        success: true,
        data: userResponse
      });
    });
  });
});

module.exports = router;
