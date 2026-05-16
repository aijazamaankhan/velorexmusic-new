#!/usr/bin/env node
// Stop both containers without removing them. Data persists in the MySQL
// container's volume; next `npm start` resumes instantly.

'use strict';

const { spawnSync } = require('child_process');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (c, s) => useColor ? `\x1b[${c}m${s}\x1b[0m` : s;
const bold  = s => col('1',  s);
const green = s => col('32', s);
const gray  = s => col('90', s);

const running = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).stdout.split(/\r?\n/);

console.log(bold('→ Stopping containers'));
for (const name of ['velorex-php', 'velorex-mysql']) {
  if (running.includes(name)) {
    console.log(gray(`  Stopping ${name}…`));
    spawnSync('docker', ['stop', name], { stdio: 'ignore' });
  } else {
    console.log(gray(`  ${name} was not running`));
  }
}
console.log(green('✓ Stopped. Data is preserved — run `npm start` to resume.'));
