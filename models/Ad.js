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

/**
 * Lists ads.
 *
 * `exec()` already returns a promise, so the hand-rolled `new Promise` wrapper
 * around its callback form was redundant - and mongoose 8 removed callback
 * support outright, which would have made `exec(fn)` throw. `this` is used
 * rather than the `Ad` binding below so the statics keeps working on a
 * discriminator or a re-registered model.
 *
 * @returns {Promise<Array>}
 */
adSchema.statics.list = function(filter, sort, limit, skip, fields) {
    return this.find(filter)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .select(fields)
        .exec();
};

var Ad = mongoose.model('Ad', adSchema);
