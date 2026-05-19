#!/usr/bin/env node
// Fast start: resume the containers that setup.js created.
// Works the same on Linux, macOS, Windows.

'use strict';

const { spawnSync } = require('child_process');
const http = require('http');

const CONTAINER_MYSQL = 'velorex-mysql';
const CONTAINER_PHP   = 'velorex-php';
const APP_PORT        = 5500;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (c, s) => useColor ? `\x1b[${c}m${s}\x1b[0m` : s;
const bold  = s => col('1',  s);
const green = s => col('32', s);
const red   = s => col('31', s);
const gray  = s => col('90', s);

function runCapture(cmd, args) {
  return spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}
function containerExists(name) {
  const r = runCapture('docker', ['ps', '-a', '--format', '{{.Names}}']);
  return r.status === 0 && r.stdout.split(/\r?\n/).includes(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function httpProbe(port) {
  return new Promise(resolve => {
    const req = http.get({ host: 'localhost', port, path: '/api/categories.php', timeout: 2000 }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  if (runCapture('docker', ['--version']).status !== 0) {
    console.log(red('Docker isn\'t installed. Run: npm run setup'));
    process.exit(1);
  }
  for (const name of [CONTAINER_MYSQL, CONTAINER_PHP]) {
    if (!containerExists(name)) {
      console.log(red(`Container '${name}' doesn't exist yet. Run: npm run setup`));
      process.exit(1);
    }
  }

  console.log(bold('→ Starting containers'));
  spawnSync('docker', ['start', CONTAINER_MYSQL, CONTAINER_PHP], { stdio: 'ignore' });

  process.stdout.write('  Waiting for dev server');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (await httpProbe(APP_PORT)) { ready = true; break; }
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write(ready ? ' ✓\n' : ' ✗\n');
  if (!ready) {
    console.log(red('  Dev server didn\'t respond in 30s. PHP container logs:'));
    spawnSync('docker', ['logs', '--tail', '20', CONTAINER_PHP], { stdio: 'inherit' });
    process.exit(1);
  }

  console.log();
  console.log(bold('🎉 Velorex Music is running'));
  console.log();
  console.log(green(`  Storefront:    http://localhost:${APP_PORT}/`));
  console.log(green(`  Admin panel:   http://localhost:${APP_PORT}/vlx-admin-2026.html`));
  console.log(gray ('                 → login as owner / owner123'));
  console.log(green(`  API health:    http://localhost:${APP_PORT}/api/categories.php`));
  console.log();
  console.log(gray('  Stop:          npm stop'));
  console.log(gray('  PHP logs:      npm run logs'));
  console.log();
}

main().catch(err => { console.error(red(String(err))); process.exit(1); });
