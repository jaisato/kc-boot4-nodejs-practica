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
  // The whole body is a promise chain so that a rejection anywhere - the query,
  // any bcrypt comparison - lands in one place. mongoose 8 dropped callback
  // support, so `exec(fn)` no longer works at all.
  Promise.resolve().then(async function () {
    var email = requireString(req.body.email);
    var password = requireString(req.body.password);

    if (!email || !password) {
      throw new APIError(400, 'email and password are required.');
    }

    // At most MAX_LOGIN_CANDIDATES accounts are considered. The address is
    // unique going forward, so this is normally a single row; the limit bounds
    // the work for collections that already contain duplicates from before the
    // index.
    //
    // Only the two fields the check needs are read back, so the hash of every
    // candidate is not pulled into memory wholesale.
    var users = await User.find({email: email})
      .limit(MAX_LOGIN_CANDIDATES)
      .select('_id password')
      .exec();

    if (users.length === 0) {
      // Same answer whether the account is missing or the password is wrong,
      // and the same amount of work, so the endpoint cannot be used to
      // enumerate registered e-mails by response time.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new APIError(401, 'Invalid credentials.');
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

    for (var i = 0; i < users.length; i++) {
      var matches = await bcrypt.compare(password, users[i].password);

      if (matches) {
        var token = jwt.sign(
            {id: users[i]._id},
            jwtAuth.TOKEN_SECRET,
            {expiresIn: '24h'}
        );

        return res.json({success: true, token: token});
      }
    }

    throw new APIError(401, 'Invalid credentials.');
  }).catch(next);
});

/* POST register users */
router.post('/signup', function(req, res, next) {
  Promise.resolve().then(async function () {
    var password = requireString(req.body.password);
    var email = requireString(req.body.email);
    var name = requireString(req.body.name);

    // Every field is checked before any work happens. The old order hashed the
    // password first and only then looked at the e-mail, so a request with no
    // e-mail still paid for a full cost-10 bcrypt hash before being rejected -
    // an unauthenticated caller could burn CPU with bodies that were never
    // going to be accepted.
    if (!email) {
      throw new APIError(400, 'email is required.');
    }

    if (!password) {
      throw new APIError(400, 'password is required.');
    }

    if (!name) {
      throw new APIError(400, 'name is required.');
    }

    var newUser = new User({
      name: name,
      email: email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS)
    });

    try {
      await newUser.save();
    } catch (err) {
      // The unique index rejects an address that is already registered.
      // Answering 409 keeps the raw driver error out of the response.
      if (err && err.code === 11000) {
        throw new APIError(409, 'That e-mail is already registered.');
      }

      // A schema violation is the caller's fault, not a server fault; without
      // this it surfaced as a 500.
      if (err && err.name === 'ValidationError') {
        throw new APIError(400, err.message);
      }

      throw err;
    }

    // The created document used to be echoed back whole, which put the bcrypt
    // hash of the password the caller had just chosen into the response body -
    // and from there into any client-side log or cache. Only the public fields
    // are returned.
    res.status(201).json({
      success: true,
      data: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  }).catch(next);
});

module.exports = router;
