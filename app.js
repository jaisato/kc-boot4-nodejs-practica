var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

// database connections
require('./lib/mongoConnection');

// loading models
require('./models/Ad');
require('./models/User');

// loading routes
var routes = require('./routes/index');
var users = require('./routes/apiv1/users');
var ads = require('./routes/apiv1/ads');
var tags = require('./routes/apiv1/tags');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/apiv1/users', users);
app.use('/apiv1/ads', ads);
app.use('/apiv1/tags', tags);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

var isDevelopment = app.get('env') === 'development';

/**
 * Builds the JSON error body.
 *
 * `res.json({error: err})` serialised an Error to `{}`: `message`, `name` and
 * `stack` are non-enumerable on Error instances, so every API failure answered
 * `{"success":false,"error":{}}` and the client had only the status code to go
 * on. The fields are copied out explicitly instead.
 *
 * Only the status and message of a deliberate APIError are safe to echo. An
 * unexpected error may carry driver internals or a failed query in its message,
 * so outside development it is logged and replaced with a generic text.
 */
function errorBody(err) {
    var status = err.status || 500;
    var isExpected = status < 500;

    var body = {
        code: status,
        message: (isExpected || isDevelopment)
            ? err.message
            : 'Internal server error.'
    };

    if (isDevelopment) {
        body.stack = err.stack;
    }

    return body;
}

app.use(function(err, req, res, next) {
    var status = err.status || 500;

    // Unexpected failures were never recorded anywhere - the operator saw the
    // client's 500 but had no trace to work from.
    if (status >= 500) {
        console.error(err && err.stack ? err.stack : err);
    }

    // Express cannot send a body once the response has started; without this
    // the attempt throws inside the error handler and kills the socket.
    if (res.headersSent) {
        return next(err);
    }

    res.status(status);

    if (isAPI(req)) {
        res.json({success: false, error: errorBody(err)});
    } else {
        res.render('error', {
            message: (status < 500 || isDevelopment) ? err.message : 'Internal server error.',
            error: isDevelopment ? err : {}
        });
    }
});

function isAPI(req) {
    return req.originalUrl.indexOf('/apiv1') === 0;
}

module.exports = app;
