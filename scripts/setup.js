#!/usr/bin/env node
// First-time setup for Velorex Music local dev.
//
// Cross-platform: Linux, macOS, Windows (Docker Desktop or WSL2).
// Idempotent — re-run any time; everything in place is detected and skipped.
//
// What it does:
//   1. Verifies Docker is installed (auto-installs on Linux/macOS, instructs on Windows).
//   2. Verifies the Docker daemon is running (auto-starts on Linux, opens
//      Docker Desktop on macOS, instructs on Windows).
//   3. Creates the `velorex-net` bridge network so containers talk by DNS name.
//   4. Creates / resumes the velorex-mysql container.
//   5. Applies scripts/schema.sql if the DB is empty.
//   6. Creates api/secrets.local.php from the template with local creds plugged in.
//   7. Creates / resumes the velorex-php container.
//   8. Prints the URLs.

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// --- Config (mirror in start.js if you change them) ---
const CONTAINER_MYSQL = 'velorex-mysql';
const CONTAINER_PHP   = 'velorex-php';
const NETWORK         = 'velorex-net';
const DB_NAME         = 'velorex_local';
const DB_USER         = 'velorex_dev';
const DB_PASS         = 'Tftus@12345';
const DB_ROOT_PASS    = 'velorex_root_pw';
const APP_PORT        = 5500;
const MYSQL_PORT      = 3306;

const PROJECT_ROOT = path.resolve(__dirname, '..');
process.chdir(PROJECT_ROOT);

const isWin   = process.platform === 'win32';
const isMac   = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// --- ANSI helpers (Windows Terminal / VS Code render them; legacy cmd doesn't) ---
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (c, s) => useColor ? `\x1b[${c}m${s}\x1b[0m` : s;
const bold   = s => col('1', s);
const green  = s => col('32', s);
const red    = s => col('31', s);
const gray   = s => col('90', s);
const yellow = s => col('33', s);

// --- Shell helpers ---
function run(cmd, args, opts = {}) {
  // Inherit stdio by default so install commands stream to the terminal.
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}
function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}
function hasCommand(cmd) {
  // 'where' on Windows, 'command -v' on Unix. Quiet — discard all output.
  const probe = isWin ? ['where', cmd] : ['sh', ['-c', `command -v ${cmd}`]];
  const r = isWin
    ? runCapture('where', [cmd])
    : runCapture('sh', ['-c', `command -v ${cmd}`]);
  return r.status === 0;
}
function dockerInfoOk() {
  return runCapture('docker', ['info']).status === 0;
}
function containerExists(name) {
  const r = runCapture('docker', ['ps', '-a', '--format', '{{.Names}}']);
  return r.status === 0 && r.stdout.split(/\r?\n/).includes(name);
}
function containerRunning(name) {
  const r = runCapture('docker', ['ps', '--format', '{{.Names}}']);
  return r.status === 0 && r.stdout.split(/\r?\n/).includes(name);
}
function networkExists(name) {
  const r = runCapture('docker', ['network', 'ls', '--format', '{{.Name}}']);
  return r.status === 0 && r.stdout.split(/\r?\n/).includes(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate, { timeoutMs, intervalMs = 1000, label = '' } = {}) {
  if (label) process.stdout.write(label);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let ok = false;
    try { ok = await predicate(); } catch { ok = false; }
    if (ok) { if (label) process.stdout.write(' ✓\n'); return true; }
    if (label) process.stdout.write('.');
    await sleep(intervalMs);
  }
  if (label) process.stdout.write(' ✗\n');
  return false;
}

async function httpProbe(port, p = '/api/categories.php') {
  return new Promise(resolve => {
    const req = http.get({ host: 'localhost', port, path: p, timeout: 2000 }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function exitFail(msg, ...extra) {
  console.log(red(msg));
  for (const e of extra) console.log(e);
  process.exit(1);
}

// --- 1. Docker install + daemon ---
async function ensureDocker() {
  console.log(bold('→ Checking Docker'));

  if (!hasCommand('docker')) {
    console.log(gray('  Docker not found.'));
    if (isLinux) {
      console.log(gray('  Installing via get.docker.com (will prompt for sudo)…'));
      // Pipe the install script through sh — single shell invocation, no temp file.
      const r = run('sh', ['-c', 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER" || true']);
      if (r.status !== 0) {
        exitFail('  Install failed. Install Docker manually: https://docs.docker.com/engine/install/');
      }
      console.log(yellow('  Docker installed.'));
      console.log(yellow('  Log out + back in (or run `newgrp docker`) so group membership takes effect, then re-run: npm run setup'));
      process.exit(0);
    }
    if (isMac) {
      if (hasCommand('brew')) {
        console.log(gray('  Installing Docker Desktop via Homebrew…'));
        const r = run('brew', ['install', '--cask', 'docker']);
        if (r.status !== 0) {
          exitFail('  brew install failed. Install Docker Desktop manually: https://www.docker.com/products/docker-desktop');
        }
        console.log(yellow('  Docker Desktop installed. Open it once from /Applications to start the daemon, then re-run: npm run setup'));
        process.exit(0);
      }
      exitFail(
        '  Homebrew not found. Install Docker Desktop manually:',
        gray('    https://www.docker.com/products/docker-desktop'),
      );
    }
    if (isWin) {
      exitFail(
        '  Docker Desktop on Windows must be installed interactively (admin rights + WSL2 setup).',
        gray('  1. Download from: https://www.docker.com/products/docker-desktop'),
        gray('  2. Run the installer and let it set up WSL2 if prompted.'),
        gray('  3. Launch Docker Desktop once and wait for "Engine running".'),
        gray('  4. Re-run: npm run setup'),
      );
    }
    exitFail(`  Unsupported platform: ${process.platform}. Install Docker manually.`);
  }

  if (!dockerInfoOk()) {
    console.log(gray('  Docker is installed but the daemon isn\'t responding. Trying to start it…'));
    if (isLinux) {
      run('sudo', ['systemctl', 'start', 'docker']);
    } else if (isMac) {
      run('open', ['-a', 'Docker'], { stdio: 'ignore' });
      console.log(gray('  Waiting for Docker Desktop to come up…'));
      await waitFor(() => Promise.resolve(dockerInfoOk()), { timeoutMs: 60000, label: '' });
    } else {
      exitFail(
        '  Start Docker Desktop manually (it should be in your Start menu / system tray),',
        gray('  wait until it shows "Engine running", then re-run: npm run setup'),
      );
    }
    if (!dockerInfoOk()) {
      exitFail('  Docker daemon still unreachable. Start Docker manually, then re-run.');
    }
  }
  console.log(green('  ✓ Docker is ready'));
}

// --- 2. Bridge network ---
function ensureNetwork() {
  console.log(bold(`→ Docker network (${NETWORK})`));
  if (networkExists(NETWORK)) {
    console.log(gray('  Already exists'));
  } else {
    run('docker', ['network', 'create', NETWORK], { stdio: 'ignore' });
    console.log(gray('  Created'));
  }
}

// --- 3. MySQL container ---
async function ensureMysql() {
  console.log(bold(`→ MySQL container (${CONTAINER_MYSQL})`));
  if (containerRunning(CONTAINER_MYSQL)) {
    console.log(gray('  Already running'));
  } else if (containerExists(CONTAINER_MYSQL)) {
    console.log(gray('  Exists but stopped — starting…'));
    run('docker', ['start', CONTAINER_MYSQL], { stdio: 'ignore' });
  } else {
    console.log(gray('  Creating new container…'));
    const r = run('docker', [
      'run', '-d',
      '--name', CONTAINER_MYSQL,
      '--network', NETWORK,
      '-e', `MYSQL_ROOT_PASSWORD=${DB_ROOT_PASS}`,
      '-e', `MYSQL_DATABASE=${DB_NAME}`,
      '-e', `MYSQL_USER=${DB_USER}`,
      '-e', `MYSQL_PASSWORD=${DB_PASS}`,
      // Expose 3306 to host so you can connect from a MySQL GUI / phpMyAdmin if you want.
      '-p', `${MYSQL_PORT}:3306`,
      'mysql:8',
    ], { stdio: 'ignore' });
    if (r.status !== 0) exitFail('  Failed to start MySQL container.');
  }

  const ready = await waitFor(
    () => Promise.resolve(runCapture('docker', ['exec', CONTAINER_MYSQL, 'mysqladmin', 'ping', '--silent']).status === 0),
    { timeoutMs: 60000, label: '  Waiting for MySQL' }
  );
  if (!ready) {
    console.log(red('  MySQL did not become ready. Logs:'));
    run('docker', ['logs', '--tail', '20', CONTAINER_MYSQL]);
    process.exit(1);
  }
}

// --- 4. Schema ---
function applySchemaIfEmpty() {
  console.log(bold('→ Database schema'));
  const tablesQuery = runCapture('docker', [
    'exec', CONTAINER_MYSQL,
    'mysql', '-N', '-u', DB_USER, `-p${DB_PASS}`, DB_NAME, '-e', 'SHOW TABLES;',
  ]);
  const tableCount = (tablesQuery.stdout || '').split(/\r?\n/).filter(Boolean).length;
  if (tableCount > 0) {
    console.log(gray(`  ${tableCount} tables already exist — skipping schema apply`));
    return;
  }
  const schemaPath = path.join(PROJECT_ROOT, 'scripts', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    exitFail('  scripts/schema.sql is missing — cannot bootstrap a fresh database.');
  }
  console.log(gray('  Empty database — applying scripts/schema.sql…'));
  const sql = fs.readFileSync(schemaPath);
  const r = spawnSync('docker', [
    'exec', '-i', CONTAINER_MYSQL,
    'mysql', '-u', DB_USER, `-p${DB_PASS}`, DB_NAME,
  ], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) exitFail('  Schema apply failed.');
  console.log(green('  ✓ Schema applied'));
}

// --- 5. Secrets file ---
function ensureSecrets() {
  console.log(bold('→ Local secrets (api/secrets.local.php)'));
  const secretsPath  = path.join(PROJECT_ROOT, 'api', 'secrets.local.php');
  const templatePath = path.join(PROJECT_ROOT, 'api', 'secrets.example.php');
  if (fs.existsSync(secretsPath)) {
    console.log(gray('  Already exists — leaving it alone'));
    console.log(gray('  (If you destroy + recreate containers, verify DB_HOST matches your setup.)'));
    return;
  }
  if (!fs.existsSync(templatePath)) {
    exitFail('  api/secrets.example.php is missing — cannot generate secrets file.');
  }
  let s = fs.readFileSync(templatePath, 'utf8');
  // DB_HOST is the container's DNS name on the bridge network — same on all OSes.
  const swaps = {
    DB_HOST:    CONTAINER_MYSQL,
    DB_NAME:    DB_NAME,
    DB_USER:    DB_USER,
    DB_PASS:    DB_PASS,
    ADMIN_PASS: 'owner123',
  };
  for (const [k, v] of Object.entries(swaps)) {
    const escaped = v.replace(/'/g, "\\'");
    s = s.replace(new RegExp(`define\\('${k}',\\s*'[^']*'\\);`), `define('${k}', '${escaped}');`);
  }
  fs.writeFileSync(secretsPath, s);
  console.log(gray('  Wrote api/secrets.local.php with local DB credentials'));
  console.log(yellow('  Razorpay constants are placeholders — paste real test keys before running checkout.'));
}

// --- 6. PHP container ---
async function ensurePhp() {
  console.log(bold(`→ PHP container (${CONTAINER_PHP})`));
  if (containerRunning(CONTAINER_PHP)) {
    console.log(gray('  Already running'));
  } else if (containerExists(CONTAINER_PHP)) {
    console.log(gray('  Exists but stopped — starting…'));
    run('docker', ['start', CONTAINER_PHP], { stdio: 'ignore' });
  } else {
    console.log(gray('  Creating new container (installs pdo_mysql on first boot, ~10s)…'));
    // Volume mount: Docker accepts native paths on all OSes. On Windows the
    // path will look like C:\Users\…\velorexmusic-new — Docker translates it.
    const volume = `${PROJECT_ROOT}:/app`;
    const r = run('docker', [
      'run', '-d',
      '--name', CONTAINER_PHP,
      '--network', NETWORK,
      '-p', `${APP_PORT}:${APP_PORT}`,
      '-v', volume,
      '-w', '/app',
      'php:8.2-cli',
      'sh', '-c',
      `docker-php-ext-install pdo pdo_mysql > /dev/null 2>&1 && php -S 0.0.0.0:${APP_PORT} -t .`,
    ], { stdio: 'ignore' });
    if (r.status !== 0) exitFail('  Failed to start PHP container.');
  }

  const ready = await waitFor(
    () => httpProbe(APP_PORT),
    { timeoutMs: 60000, label: '  Waiting for dev server' }
  );
  if (!ready) {
    console.log(red('  Dev server did not respond. PHP container logs:'));
    run('docker', ['logs', '--tail', '20', CONTAINER_PHP]);
    process.exit(1);
  }
}

function printUrls() {
  console.log();
  console.log(bold('🎉 Velorex Music is running'));
  console.log();
  console.log(green(`  Storefront:    http://localhost:${APP_PORT}/`));
  console.log(green(`  Admin panel:   http://localhost:${APP_PORT}/admin.html`));
  console.log(gray ('                 → login as owner / owner123'));
  console.log(green(`  API health:    http://localhost:${APP_PORT}/api/categories.php`));
  console.log();
  console.log(gray('  Stop:          npm stop'));
  console.log(gray('  Start again:   npm start'));
  console.log(gray('  PHP logs:      npm run logs'));
  console.log();
}

async function main() {
  await ensureDocker();
  ensureNetwork();
  await ensureMysql();
  applySchemaIfEmpty();
  ensureSecrets();
  await ensurePhp();
  printUrls();
}

main().catch(err => {
  console.error(red(`Unexpected error: ${err.message || err}`));
  process.exit(1);
});
