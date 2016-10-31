#!/usr/bin/env node

var bcrypt = require('bcrypt');
const salt = "$2a$10$GX7y..W8hpSCD5KOIAHemO";

var mongoose = require('mongoose');

// Mongo Database Connection
var db =  mongoose.connection;

db.on('error', console.log.bind(console));

db.once('open', function () {
    console.log('Conectado a mongoDB');
});

mongoose.connect('mongodb://localhost:27017/nodepop');

// Loading models
require('./../models/Ad');
require('./../models/User');

// Remove ads and users collections
var Ad = mongoose.model('Ad'),
    User = mongoose.model('User');

Ad.remove(null, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('All ads deleted!');
    }
});

User.remove(null, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('All users deleted!');
    }
});

// Add a new user
var user = new User({
    name: 'user 1',
    email: 'user1@gmail.com',
    password: bcrypt.hashSync('1234', salt)
});

user.save(function (err, userCreated) {
    if (err) throw err;
    console.log('User ' + userCreated.name + ' created!');
});

// Load ads from ads.json file
var fs = require('fs');

var file = fs.readFileSync(__dirname + '/../ads.json', 'utf8');
var json = JSON.parse(file);
var newAd = null;
json.ads.forEach(function (ad) {
    newAd = new Ad(ad);
    newAd.save(function (err, adCreated) {
        if (err) throw err;
        console.log('Ad ' + adCreated.name + ' created!');
    })
});