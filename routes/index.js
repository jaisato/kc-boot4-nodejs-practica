'use strict';

var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');
var client = mongodb.MongoClient;

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

module.exports = router;
