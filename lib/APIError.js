/**
 * Created by jairo on 31/10/16.
 */
'use strict';

/**
 * An error carrying the HTTP status the client should receive.
 *
 * `APIError.prototype = new Error()` used to run the Error constructor once at
 * load time and share that single instance as the prototype, so every APIError
 * inherited the same frozen `stack` and `APIError.prototype.constructor` still
 * pointed at Error. Inheriting from Error properly and capturing the stack per
 * instance keeps `instanceof` working while giving each error its own trace.
 */
function APIError(status, message, stack) {
    Error.call(this, message);

    this.name = 'APIError';
    this.status = status;
    this.message = message;

    if (stack) {
        this.stack = stack;
    } else if (Error.captureStackTrace) {
        // Hides the APIError frame itself, so the trace starts at the caller.
        Error.captureStackTrace(this, APIError);
    } else {
        this.stack = (new Error(message)).stack;
    }
}

APIError.prototype = Object.create(Error.prototype);
APIError.prototype.constructor = APIError;

module.exports = APIError;
