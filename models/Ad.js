/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var mongoose = require('mongoose');

// Define the Ad schema
var adSchema = mongoose.Schema({
    name: {
        type: String,
        index: true
    },
    price: {
        type: Number,
        index: true
    },
    on_sale: {
        type: Boolean,
        index: true
    },
    photo: {
        type: String,
        index: true
    },
    tags: {
        type: Array,
        index: true
    }
});

adSchema.index({ name: 1, price: 1, on_sale: 1, tags: 1 });

adSchema.statics.list = function(filter, sort, limit, skip, fields) {
    return new Promise(function(resolve, reject) {
        var query = Ad.find(filter);
        query.sort(sort);
        query.limit(limit);
        query.skip(skip);
        query.select(fields);
        query.exec(function(err, result) {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
};

var Ad = mongoose.model('Ad', adSchema);
