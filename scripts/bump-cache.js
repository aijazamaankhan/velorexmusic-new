#!/usr/bin/env node
/* eslint-disable no-console */
//
// scripts/bump-cache.js — content-hash cache-bust for storefront/admin assets.
//
// What it does
// ------------
// Walks every *.html at the repo root, finds <script src="…js"> and
// <link href="…css"> tags pointing at local files, computes a SHA-1 of
// each referenced file's bytes, and rewrites the tag to
//   src="path?v=<first 8 hex chars of hash>"
// External URLs (http://, https://, //) are left alone.
//
// Why
// ---
// The previous scheme was a single hand-bumped date string ("?v=20260526")
// across every HTML file. It's easy to forget; we shipped a real customer-
// facing bug when the version wasn't bumped after a shipping-logic change,
// and browsers served stale JS. Content hashes mean:
//   - Customers only re-download files that actually changed.
//   - It's impossible to forget — the script does it for you.
//   - You can't accidentally bump everything when nothing changed.
//
// Workflow
// --------
//   npm run prep-deploy           rewrite HTML in place, commit the diff
//   node scripts/bump-cache.js --check
//                                 exit non-zero if any file WOULD change
//                                 (this is what scripts/hooks/pre-push uses)
//
// See CLAUDE.md §13 for the deploy checklist.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Capture: <script src="..."> or <link href="..."> referencing a local .js/.css
// file. The 4 capture groups make the rewrite trivial: head + asset + (old ?v=)
// + closing quote. External refs (http(s)://… or //…) and assets without a .js
// or .css extension are deliberately excluded.
const ASSET_RE =
  /(<(?:script|link)\b[^>]*?\s(?:src|href)=")(?!https?:|\/\/)([^"?]+\.(?:js|css))(\?v=[^"]*)?(")/g;

const checkMode = process.argv.includes('--check');

function hashFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
}

function listHtmlFiles() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => d.name)
    .sort();
}

let totalRefs = 0;
let totalRewritten = 0;
let totalMissing = 0;
const changedFiles = [];

for (const file of listHtmlFiles()) {
  const abs = path.join(ROOT, file);
  const before = fs.readFileSync(abs, 'utf8');
  let rewrittenInFile = 0;

  const after = before.replace(ASSET_RE, (match, head, asset, _oldVer, tail) => {
    totalRefs++;
    const hash = hashFile(asset);
    if (!hash) {
      console.warn(`  WARN  ${file}: ${asset} not found on disk — leaving as-is`);
      totalMissing++;
      return match;
    }
    const replacement = `${head}${asset}?v=${hash}${tail}`;
    if (replacement !== match) rewrittenInFile++;
    return replacement;
  });

  if (after !== before) {
    changedFiles.push({ file, count: rewrittenInFile });
    totalRewritten += rewrittenInFile;
    if (!checkMode) {
      fs.writeFileSync(abs, after);
      console.log(`  ${file}: rewrote ${rewrittenInFile} refs`);
    }
  }
}

if (checkMode) {
  if (changedFiles.length) {
    console.error('\n❌ Asset cache-bust is out of date.');
    console.error('   These HTML files reference assets whose content has changed');
    console.error('   since the last bump:');
    for (const c of changedFiles) console.error(`     - ${c.file} (${c.count} refs)`);
    console.error('\n   Run `npm run prep-deploy` and commit the result before pushing.\n');
    process.exit(1);
  }
  console.log(`✅ Cache-bust up to date. (${totalRefs} refs scanned across HTML files)`);
  process.exit(0);
}

console.log(
  `\nDone. ${changedFiles.length} HTML file(s) rewritten · ${totalRewritten} refs updated · ${totalRefs} refs scanned · ${totalMissing} missing.`
);
if (changedFiles.length) {
  console.log('Review with `git diff` and commit before pushing.');
}
