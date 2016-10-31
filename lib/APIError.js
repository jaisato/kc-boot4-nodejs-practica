/**
 * Created by jairo on 31/10/16.
 */
'use strict';

function APIError(status, message, stack) {
    this.name = 'APIError';
    this.status = status;
    this.message = message;
    this.stack = (!stack) ? (new Error()).stack : stack;
}

APIError.prototype = new Error();

module.exports = APIError;