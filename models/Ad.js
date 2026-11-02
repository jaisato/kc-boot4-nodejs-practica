/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var mongoose = require('mongoose');

// Define the Ad schema
var adSchema = mongoose.Schema({
    name: {
        type: String
    },
    price: {
        type: Number
    },
    on_sale: {
        type: Boolean
    },
    photo: {
        type: String
    },
    tags: {
        type: Array
    }
});

adSchema.index({ name: 1, price: 1, on_sale: 1, tags: 1 });

/**
 * One index per field the API sorts by (`?sort=` in routes/apiv1/ads.js), each
 * ending in _id: withTieBreaker() appends _id to every sort, in the direction
 * of the key before it, so Mongo reads `price _id` forwards and `-price -_id`
 * backwards off {price: 1, _id: 1} instead of sorting the matches in memory.
 *
 * Each one also does what the single-field index its field used to declare
 * (`index: true`) did, filtering on that field, so those are gone: MongoDB
 * would only have kept up a redundant prefix of each. A database created
 * earlier keeps them until `Ad.syncIndexes()` drops them.
 */
adSchema.index({ name: 1, _id: 1 });
adSchema.index({ price: 1, _id: 1 });
adSchema.index({ on_sale: 1, _id: 1 });
adSchema.index({ photo: 1, _id: 1 });
adSchema.index({ tags: 1, _id: 1 });

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
