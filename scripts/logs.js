#!/usr/bin/env node
// Tail PHP container logs (request lines, PHP warnings). Ctrl-C to stop.

'use strict';

const { spawnSync } = require('child_process');

const r = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});
if (!r.stdout.split(/\r?\n/).includes('velorex-php')) {
  console.log('velorex-php is not running. Start with: npm start');
  process.exit(1);
}

// stdio: inherit so the follow stream + Ctrl-C work naturally.
const child = spawnSync('docker', ['logs', '-f', '--tail', '50', 'velorex-php'], {
  stdio: 'inherit'
});
process.exit(child.status === null ? 0 : child.status);
