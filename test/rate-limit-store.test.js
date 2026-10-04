'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const storeModule = path.resolve(__dirname, '../lib/rateLimitStore.js');

test('outside a cluster the limiter keeps its default in-process store', () => {
    assert.equal(require(storeModule)('login'), undefined);
});

// Two workers behind one port, a limit of 3, and every request on a fresh
// connection so the cluster spreads them over both workers. With one counter
// per worker the client got 3 requests from each (6 in total).
test('cluster workers share one budget per client', () => {
    const script = `
        const cluster = require('node:cluster');
        const http = require('node:http');
        if (cluster.isPrimary) {
            const { ClusterMemoryStorePrimary } = require('@express-rate-limit/cluster-memory-store');
            new ClusterMemoryStorePrimary().init();
            let listening = 0, port;
            cluster.on('listening', (worker, address) => {
                port = address.port;
                if (++listening < 2) return;
                const statuses = [];
                const next = () => {
                    if (statuses.length === 6) {
                        console.log('RESULT:' + JSON.stringify(statuses));
                        for (const id in cluster.workers) cluster.workers[id].kill();
                        return;
                    }
                    http.get({ host: '127.0.0.1', port, agent: false, headers: { Connection: 'close' } }, res => {
                        res.resume();
                        res.on('end', () => { statuses.push(res.statusCode); next(); });
                    });
                };
                next();
            });
            // Port 0 is not shared between workers, so a fixed free port is
            // picked by the primary first.
            const probe = http.createServer().listen(0, '127.0.0.1', () => {
                const freePort = probe.address().port;
                probe.close(() => {
                    // A script given with -e has no file for the workers to
                    // run, so they get the same code through execArgv; 'exec'
                    // only has to name an existing file and is otherwise ignored.
                    cluster.setupPrimary({
                        exec: ${JSON.stringify(storeModule)},
                        execArgv: ['-e', process.env.CLUSTER_SCRIPT]
                    });
                    cluster.fork({ TEST_PORT: String(freePort) });
                    cluster.fork({ TEST_PORT: String(freePort) });
                });
            });
        } else {
            const express = require('express');
            const rateLimit = require('express-rate-limit');
            const app = express();
            app.use(rateLimit({ windowMs: 60000, limit: 3, store: require(${JSON.stringify(storeModule)})('test') }));
            app.get('/', (req, res) => res.send(String(process.pid)));
            app.listen(Number(process.env.TEST_PORT), '127.0.0.1');
        }`;
    const child = spawnSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '..'),
        env: Object.assign({}, process.env, { CLUSTER_SCRIPT: script }),
        encoding: 'utf8',
        timeout: 20000
    });
    const output = child.stdout.split('\n').find(line => line.startsWith('RESULT:'));
    assert.ok(output, child.stderr);
    assert.deepEqual(JSON.parse(output.slice('RESULT:'.length)), [200, 200, 200, 429, 429, 429]);
});
