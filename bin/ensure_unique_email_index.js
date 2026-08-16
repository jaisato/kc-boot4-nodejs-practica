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
 * MongoDB will not hold two indexes over the same key pattern, so the old index
 * has to be dropped before the unique one can be built - there is no way to keep
 * unique coverage continuous across the swap. During that window a concurrent
 * /signup could insert a duplicate and make the rebuild fail, so the script
 * refuses to run without an explicit acknowledgement that writes are stopped,
 * and restores the original index if the rebuild does fail.
 *
 * It also refuses to guess when duplicates already exist: deleting or renaming
 * somebody's account is an operator's decision, not a migration's.
 *
 *   node ./bin/ensure_unique_email_index.js --confirm
 */

'use strict';

if (process.argv.indexOf('--confirm') === -1) {
    console.error(
        '\nEsta migración elimina y vuelve a crear el índice de users.email.\n' +
        'MongoDB no admite dos índices sobre la misma clave, así que durante unos\n' +
        'instantes la colección se queda sin ese índice y un registro concurrente\n' +
        'podría insertar un duplicado y hacer fallar la reconstrucción.\n\n' +
        'Detén los registros (/signup) y vuelve a ejecutarla con --confirm:\n\n' +
        '    npm run migrate:unique-email -- --confirm\n'
    );
    process.exit(1);
}

var mongoose = require('mongoose');

// The env var is spelled MONGODB_URI everywhere else in the app; MONGO_URL is
// still read so an existing deployment that sets it keeps working.
var MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL ||
    'mongodb://localhost:27017/nodepop';
var INDEX_NAME = 'email_1';

/**
 * The MongoDB driver bundled with mongoose 8 removed callback support from
 * every collection method, so the callback spelling this script used
 * (`users.indexes(cb)`, `users.createIndex(..., cb)`, `mongoose.disconnect(cb)`)
 * no longer runs at all. The logic is unchanged - the same duplicate check, the
 * same restore-on-failure - expressed with promises.
 */

async function findDuplicates(users) {
    return users.aggregate([
        {$group: {_id: '$email', count: {$sum: 1}}},
        {$match: {count: {$gt: 1}}},
        {$sort: {count: -1}}
    ]).toArray();
}

async function restore(users, previous) {
    var options = {name: previous.name};

    if (previous.sparse) {
        options.sparse = true;
    }

    await users.createIndex(previous.key || {email: 1}, options);
}

async function replaceIndex(users) {
    var indexes = await users.indexes();

    var existing = (indexes || []).filter(function (index) {
        return index.name === INDEX_NAME;
    })[0];

    if (existing && existing.unique) {
        console.log('El indice ya era unico, no hay nada que hacer.');
        return;
    }

    if (existing) {
        console.log('Eliminando el indice no unico ' + INDEX_NAME + '...');
        await users.dropIndex(INDEX_NAME);
    }

    console.log('Creando el indice unico ' + INDEX_NAME + '...');

    try {
        await users.createIndex({email: 1}, {unique: true, name: INDEX_NAME});
    } catch (err) {
        if (!existing) {
            throw err;
        }

        // The window closed badly: a duplicate arrived after the check. Put the
        // original index back so the collection is not left without one, then
        // report what happened.
        console.error('La creacion del indice unico ha fallado; restaurando el indice anterior...');

        try {
            await restore(users, existing);
        } catch (restoreErr) {
            throw new Error(
                'El indice unico no se pudo crear (' + err.message + ') y tampoco se pudo ' +
                'restaurar el anterior (' + restoreErr.message + '). Revisa los indices de ' +
                'users a mano antes de reanudar los registros.'
            );
        }

        throw new Error(
            'Se ha registrado una direccion repetida durante la migracion. Se ha dejado la ' +
            'coleccion como estaba. Deten los registros (/signup) y vuelve a intentarlo.'
        );
    }
}

async function main() {
    await mongoose.connect(MONGODB_URI);

    var users = mongoose.connection.db.collection('users');

    var duplicates = await findDuplicates(users);

    if (duplicates.length > 0) {
        console.error('\nNo se puede crear el indice unico: hay direcciones repetidas.\n');
        duplicates.forEach(function (entry) {
            console.error('  ' + entry._id + ' -> ' + entry.count + ' cuentas');
        });
        console.error(
            '\nDecide que cuenta conserva cada direccion y elimina o renombra el resto,\n' +
            'despues vuelve a ejecutar este script. No se ha modificado nada.\n'
        );

        var duplicatesFound = new Error('duplicates');
        duplicatesFound.handled = true;
        throw duplicatesFound;
    }

    await replaceIndex(users);

    console.log('Indice unico sobre users.email listo.');
}

main()
    .then(async function () {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async function (err) {
        if (!err.handled) {
            console.error('La migracion ha fallado:', err && err.message ? err.message : err);
        }

        await mongoose.disconnect().catch(function () {});
        process.exit(1);
    });
