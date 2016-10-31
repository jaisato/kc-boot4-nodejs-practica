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
