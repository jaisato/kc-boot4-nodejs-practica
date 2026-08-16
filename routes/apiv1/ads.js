'use strict';

var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var Ad = mongoose.model('Ad');

var jwtAuth = require('../../lib/jwtAuth');

var APIError = require('../../lib/APIError');

// Using JWT Authentication
router.use(jwtAuth.checkToken());

/**
 * Upper bound on how many ads one request may return.
 *
 * `limit` used to be whatever the caller passed, so `?limit=1000000` made a
 * single unauthenticated-shaped request pull the whole collection into memory
 * and serialise it. The cap turns that into a bounded page.
 */
var MAX_LIMIT = 100;
var DEFAULT_LIMIT = 20;

/**
 * Fields a caller is allowed to project. `select` takes arbitrary strings, and
 * a caller could otherwise ask for fields that are not part of the public shape
 * of an ad.
 *
 * `_id` belongs here: mongoose returns it on every ad by default, so it is part
 * of that public shape, and `?fields=_id,name` is a request clients could
 * already make. Leaving it out turned a working call into a 400.
 */
var SELECTABLE_FIELDS = ['_id', 'name', 'price', 'on_sale', 'photo', 'tags'];

/**
 * Escapes the regular-expression metacharacters in a user-supplied string.
 *
 * The name filter is built as `new RegExp('^' + name)`. Without escaping, the
 * query string *is* the pattern: `?name=(a+)+$` compiles to a nested quantifier
 * whose backtracking is exponential in the length of the candidate string, so
 * one short request pins a worker at 100% CPU for minutes (ReDoS). Escaping
 * makes the input a literal prefix, which is all this filter ever meant.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Query-string values are strings, but Express' extended parser also produces
 * objects and arrays (`?name[$ne]=x`, `?name=a&name=b`). Anything that is not a
 * plain string is rejected rather than coerced, so operator objects cannot slip
 * into a Mongo query and arrays cannot silently stringify to `a,b`.
 */
function requireString(value) {
  return typeof value === 'string' ? value : null;
}

/* GET ads listing. */
router.get('/', function(req, res, next) {
  var filter = {};

  // --- name -----------------------------------------------------------------
  if (typeof req.query.name !== 'undefined') {
    var name = requireString(req.query.name);

    if (name === null) {
      return next(new APIError(400, "'name' must be a single text value."));
    }

    filter.name = new RegExp('^' + escapeRegExp(name), 'i');
  }

  // --- tags -----------------------------------------------------------------
  if (typeof req.query.tags !== 'undefined') {
    var tags = requireString(req.query.tags);

    if (tags === null) {
      return next(new APIError(400, "'tags' must be a single text value."));
    }

    var filterTags = checkTags(tags);
    if (filterTags !== null) {
      filter.tags = filterTags;
    }
  }

  // --- price ----------------------------------------------------------------
  // checkPrice reports a bad value by returning an APIError rather than by
  // calling next() itself. When it called next() the caller kept going, built
  // the query with an `undefined` price and answered a second time on the same
  // request - Express then logged "Cannot set headers after they are sent".
  var priceFilter = checkPrice(req.query.minprice, req.query.maxprice);

  if (priceFilter instanceof APIError) {
    return next(priceFilter);
  }

  if (priceFilter !== null) {
    filter.price = priceFilter;
  }

  // --- on sale --------------------------------------------------------------
  if (typeof req.query.onsale !== 'undefined' && req.query.onsale.length > 0) {
    // Same double-response bug as above: an invalid value used to call next()
    // and then leave `filter.on_sale = undefined` behind.
    var onSale = checkTypeFilter(req.query.onsale);

    if (onSale instanceof APIError) {
      return next(onSale);
    }

    filter.on_sale = onSale;
  }

  // --- paging ---------------------------------------------------------------
  var paging = checkPaging(req.query.limit, req.query.skip);

  if (paging instanceof APIError) {
    return next(paging);
  }

  // --- projection -----------------------------------------------------------
  var fields = buildFields(req.query.fields);

  if (fields instanceof APIError) {
    return next(fields);
  }

  var sort = requireString(req.query.sort);

  Ad.list(filter, sort, paging.limit, paging.skip, fields)
      .then(function(ads) {
        ads.forEach(function (ad) {
          if (ad.photo) {
            ad.photo = req.protocol + '://' + req.get('host') + '/images/ads/' + ad.photo;
          }
        });

        res.json({success: true, ads: ads});
      }).catch(next);
});

/**
 * Checks price filters.
 *
 * @returns {Object|null|APIError} the Mongo price sub-document, null when no
 *   price filter was requested, or an APIError describing the bad value. It
 *   deliberately does not touch `next` - see the call site.
 */
function checkPrice(minPrice, maxPrice) {
  var priceFilter = null;

  if (typeof minPrice !== 'undefined') {
    minPrice = parseFloat(minPrice);
    if (isNaN(minPrice)) {
      return new APIError(400, 'Min price is not a number');
    }

    priceFilter = { $gte: minPrice };
  }

  if (typeof maxPrice !== 'undefined') {
    maxPrice = parseFloat(maxPrice);
    if (isNaN(maxPrice)) {
      return new APIError(400, 'Max price is not a number');
    }

    if (priceFilter === null) {
      priceFilter = { $lte: maxPrice };
    } else {
      priceFilter.$lte = maxPrice;
    }
  }

  return priceFilter;
}

/**
 * Checks tags filter.
 * @param tags
 * @returns {*}
 */
function checkTags(tags) {
  var filterTags = null;
  if (tags.length > 0) {
    tags = tags.split(/[ ,]+/).filter(function (tag) {
      return tag.length > 0;
    });

    if (tags.length > 0) {
      filterTags = { $in: tags };
    }
  }

  return filterTags;
}

/**
 * Validates and clamps the paging parameters.
 *
 * @returns {{limit: number, skip: number}|APIError}
 */
function checkPaging(rawLimit, rawSkip) {
  var limit = DEFAULT_LIMIT;
  var skip = 0;

  if (typeof rawLimit !== 'undefined') {
    limit = parseInt(rawLimit, 10);

    // parseInt('abc') is NaN and the old `|| null` turned that into "no limit",
    // so a typo silently asked for the entire collection.
    if (isNaN(limit) || limit < 1) {
      return new APIError(400, "'limit' must be a positive integer.");
    }

    limit = Math.min(limit, MAX_LIMIT);
  }

  if (typeof rawSkip !== 'undefined') {
    skip = parseInt(rawSkip, 10);

    // A negative skip makes the driver throw; catching it here keeps it a 400
    // instead of a 500.
    if (isNaN(skip) || skip < 0) {
      return new APIError(400, "'skip' must be a non-negative integer.");
    }
  }

  return { limit: limit, skip: skip };
}

/**
 * Builds the projection passed to `select()`.
 *
 * @returns {string|null|APIError}
 */
function buildFields(fields) {
  if (typeof fields === 'undefined') {
    return null;
  }

  fields = requireString(fields);

  if (fields === null) {
    return new APIError(400, "'fields' must be a single text value.");
  }

  if (fields.length === 0) {
    return null;
  }

  // The separator regexp had no /g flag, so only the *first* comma became a
  // space: `?fields=name,price,tags` produced "name price,tags" and mongoose
  // then looked for a field literally named "price,tags", returning documents
  // with only `name` on them.
  var requested = fields.split(/[ ,]+/).filter(function (field) {
    return field.length > 0;
  });

  var unknown = requested.filter(function (field) {
    return SELECTABLE_FIELDS.indexOf(field) === -1;
  });

  if (unknown.length > 0) {
    return new APIError(
      400,
      "Unknown field(s): " + unknown.join(', ') +
      '. Allowed: ' + SELECTABLE_FIELDS.join(', ') + '.'
    );
  }

  return requested.length > 0 ? requested.join(' ') : null;
}

/**
 * Checks the Ad type filter.
 *
 * @returns {boolean|APIError}
 */
function checkTypeFilter(onSale) {
  if (onSale === '1' || onSale === 'true') {
    return true;
  }
  if (onSale === '0' || onSale === 'false') {
    return false;
  }

  return new APIError(
    400,
    "The value Ad type 'onsale' must be: 1 (or true) and 0 (or false)."
  );
}

module.exports = router;
