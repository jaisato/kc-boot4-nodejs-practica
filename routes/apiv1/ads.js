var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
var Ad = mongoose.model('Ad');

var jwtAuth = require('../../lib/jwtAuth');

var APIError = require('../../lib/APIError');

// Using JWT Authentication
router.use(jwtAuth.checkToken());

/* GET ads listing. */
router.get('/', function(req, res, next) {
  var sort = req.query.sort || null;
  var limit = parseInt(req.query.limit) || null;
  var skip = parseInt(req.query.skip) || 0;

  var fields = buildFields(req.query.fields);

  var filter = {};

  var name = req.query.name;
  var onSale = req.query.onsale;

  if (typeof name !== 'undefined') {
    filter.name = new RegExp("^"+ name, 'i');
  }

  var filterTags = checkTags(req.query.tags);
  if (filterTags !== null) {
    filter.tags = filterTags;
  }

  var priceFilter = checkPrice(req.query.minprice, req.query.maxprice, next);
  if (priceFilter !== null) {
    filter.price = priceFilter;
  }

  if (typeof onSale !== 'undefined' && onSale.length > 0) {
    filter.on_sale = checkTypeFilter(onSale, next);
  }

  Ad.list(filter, sort, limit, skip, fields)
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
 * @param minPrice
 * @param maxPrice
 * @returns {*}
 */
function checkPrice(minPrice, maxPrice, next) {
  var priceFilter = null;

  if (typeof minPrice !== 'undefined') {
    minPrice = parseFloat(minPrice);
    if (isNaN(minPrice)) {
      return next(new APIError(400, 'Min price is not a number'));
    }

    priceFilter = { $gte: minPrice };
  }

  if (typeof maxPrice !== 'undefined') {
    maxPrice = parseFloat(maxPrice);
    if (isNaN(maxPrice)) {
      return next(new APIError(400, 'Max price is not a number'));
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
  if (typeof tags !== 'undefined' && tags.length > 0) {
    tags = tags.split(/[ ,]+/);
    filterTags = { $in: tags };
  }

  return filterTags;
}

/**
 * Builds the fields well formatted.
 * @param fields
 * @returns {*}
 */
function buildFields(fields) {
  if (typeof fields !== 'undefined' && fields.length > 0) {
    fields = fields.replace(/[ ,]+/, " ");
  } else {
    fields = null;
  }

  return fields;
}

/**
 * Checks the Ad type filter.
 * @param onSale
 * @param next
 * @returns {boolean}
 */
function checkTypeFilter(onSale, next) {
  if (onSale == '1' || onSale == 'true') {
    return true;
  }
  if (onSale == '0' || onSale == 'false') {
    return false;
  }

  next(new APIError(400, "The value Ad type 'onsale' must be: 1 (or true) and 0 (or false)."))
}

module.exports = router;
