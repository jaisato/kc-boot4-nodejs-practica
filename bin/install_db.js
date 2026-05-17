#!/usr/bin/env node

var bcrypt = require('bcrypt');
// SECURITY FIX: Use auto-generated salt with proper cost factor
const SALT_ROUNDS = 12;

var mongoose = require('mongoose');

// Mongo Database Connection
var db =  mongoose.connection;

db.on('error', console.log.bind(console));

db.once('open', function () {
    console.log('Conectado a mongoDB');
});

// SECURITY FIX: Use environment variable for MongoDB connection string
var mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodepop';
mongoose.connect(mongoURI);

// Loading models
require('./../models/Ad');
require('./../models/User');

// Remove ads and users collections
var Ad = mongoose.model('Ad'),
    User = mongoose.model('User');

Ad.deleteMany({}, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('All ads deleted!');
    }
});

User.deleteMany({}, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('All users deleted!');
    }
});

// Add a new user
// SECURITY FIX: Use proper bcrypt salt generation and a stronger default password
var user = new User({
    name: 'user 1',
    email: 'user1@gmail.com',
    password: bcrypt.hashSync('changeme123!', SALT_ROUNDS)
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