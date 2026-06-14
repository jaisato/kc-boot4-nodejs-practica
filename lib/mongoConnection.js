'use strict';

var mongoose = require('mongoose');

var db = mongoose.connection;

db.on('error', function (err) {
    console.error('MongoDB connection error', err);
    process.exit(1);
});

db.once('open', function () {
    console.info('Connected to MongoDB.');
});

var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nodepop';
mongoose.connect(mongoUri);
