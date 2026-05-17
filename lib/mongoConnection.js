/**
 * Created by jairo on 29/10/16.
 */
'use strict';

var mongoose = require('mongoose');
var db =  mongoose.connection;

db.on('error', console.log.bind(console));

db.once('open', function () {
    console.log('Conectado a mongoDB');
});

// SECURITY FIX: Use environment variable for MongoDB connection string.
// This avoids hardcoding credentials and allows different configs per environment.
var mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodepop';
mongoose.connect(mongoURI);
