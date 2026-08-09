#!/usr/bin/env node

/**
 * Converts the users.email index into a unique one.
 *
 * Declaring `unique: true` on the schema only affects databases where the index
 * does not exist yet. A database created by an earlier version already carries a
 * non-unique `email_1`, and Mongo will not silently redefine it, so /signup goes
 * on accepting duplicate addresses there. That matters beyond tidiness: the
 * login route caps how many accounts it will check a password against, so on
 * such a database a duplicate past the cap could never sign in.
 *
 * The script refuses to guess when duplicates already exist. Deleting or
 * renaming somebody's account is an operator's decision, not a migration's, so
 * it reports the offending addresses and stops.
 *
 *   node ./bin/ensure_unique_email_index.js
 */

'use strict';

var mongoose = require('mongoose');

var MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/nodepop';
var INDEX_NAME = 'email_1';

mongoose.connect(MONGO_URL);

var connection = mongoose.connection;

connection.on('error', function (err) {
    console.error('No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
});

connection.once('open', function () {
    var users = connection.db.collection('users');

    findDuplicates(users, function (err, duplicates) {
        if (err) {
            return fail(err);
        }

        if (duplicates.length > 0) {
            console.error('\nNo se puede crear el índice único: hay direcciones repetidas.\n');
            duplicates.forEach(function (entry) {
                console.error('  ' + entry._id + ' -> ' + entry.count + ' cuentas');
            });
            console.error(
                '\nDecide qué cuenta conserva cada dirección y elimina o renombra el resto,\n' +
                'después vuelve a ejecutar este script. No se ha modificado nada.\n'
            );

            return mongoose.disconnect(function () {
                process.exit(1);
            });
        }

        replaceIndex(users, function (err) {
            if (err) {
                return fail(err);
            }

            console.log('Índice único sobre users.email listo.');
            mongoose.disconnect(function () {
                process.exit(0);
            });
        });
    });
});

function findDuplicates(users, callback) {
    users.aggregate(
        [
            {$group: {_id: '$email', count: {$sum: 1}}},
            {$match: {count: {$gt: 1}}},
            {$sort: {count: -1}}
        ],
        function (err, result) {
            if (err) {
                return callback(err);
            }

            // Depending on the driver version aggregate() yields an array or a
            // cursor; normalise both.
            if (Array.isArray(result)) {
                return callback(null, result);
            }

            result.toArray(callback);
        }
    );
}

function replaceIndex(users, callback) {
    users.indexes(function (err, indexes) {
        if (err) {
            return callback(err);
        }

        var existing = (indexes || []).filter(function (index) {
            return index.name === INDEX_NAME;
        })[0];

        if (existing && existing.unique) {
            console.log('El índice ya era único, no hay nada que hacer.');
            return callback(null);
        }

        var createUnique = function () {
            users.createIndex({email: 1}, {unique: true, name: INDEX_NAME}, callback);
        };

        if (!existing) {
            return createUnique();
        }

        console.log('Eliminando el índice no único ' + INDEX_NAME + '...');
        users.dropIndex(INDEX_NAME, function (err) {
            if (err) {
                return callback(err);
            }

            createUnique();
        });
    });
}

function fail(err) {
    console.error('La migración ha fallado:', err.message);
    mongoose.disconnect(function () {
        process.exit(1);
    });
}
