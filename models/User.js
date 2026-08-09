/**
 * Created by jairo on 30/10/16.
 */
'use strict';

var mongoose = require('mongoose');

// Define the User schema
var userSchema = mongoose.Schema({
    name: {
        type: String,
        index: true,
        required: [ true, 'An user name is required.' ],
        minlength: [3, 'Minimum length for name is 3.' ]
    },
    email: {
        type: String,
        // Unique: without it /signup accepted unlimited accounts on the same
        // address, and login then had to check the password against every one
        // of them - one cost-10 bcrypt comparison each, on an unauthenticated
        // route. That is a CPU amplification lever, so the duplicates are
        // prevented at the source rather than tolerated.
        unique: true,
        index: true,
        required: [ true, 'An user email is required.' ],
        minlength: [3, 'Minimum length for email is 3.' ]
    },
    password: {
        type: String,
        required: [ true, 'An user password is required.' ],
        minlength: [3, 'Minimum length for password is 3.' ]
    }
});

mongoose.model('User', userSchema);
