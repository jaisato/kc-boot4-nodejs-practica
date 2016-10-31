var express = require('express');
var router = express.Router();

/* GET tags listing. */
router.get('/', function(req, res, next) {
  var tags = ['work', 'lifestyle', 'motor', 'mobile'];
  res.json(tags);
});

module.exports = router;
