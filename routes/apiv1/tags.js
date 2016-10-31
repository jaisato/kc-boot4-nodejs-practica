var express = require('express');
var router = express.Router();

/* GET tags listing. */
router.get('/', function(req, res, next) {
  var tags = ['work', 'lifestyle', 'motor', 'mobile'];
  res.json({
    success: true,
    tags: tags
  });
});

module.exports = router;
