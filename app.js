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

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);

        if (isAPI(req)) {
            res.json({success: false, error: err});
        } else {
            res.render('error', {
                message: err.message,
                error: err
            });
        }
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);

    if (isAPI(req)) {
        res.json({success: false, error: err});
    } else {
        res.render('error', {
            message: err.message,
            error: {}
        });
    }
});

function isAPI(req) {
    return req.originalUrl.indexOf('/apiv1') === 0;
}

module.exports = app;
