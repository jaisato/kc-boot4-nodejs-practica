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
  var name = req.query.name;
  var onSale = Boolean(req.query.onsale) || null;

  var sort = req.query.sort || null;
  var limit = parseInt(req.query.limit) || null;
  var skip = parseInt(req.query.skip) || 0;
  var fields = req.query.fields || null;

  var filter = {};

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

  if (onSale !== null) {
    filter.on_sale = onSale;
  }

  Ad.list(filter, sort, limit, skip, fields)
      .then(function(ads) {
        ads.forEach(function (ad) {
          ad.photo = req.protocol + '://' + req.get('host') + '/images/ads/' + ad.photo;
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

module.exports = router;
