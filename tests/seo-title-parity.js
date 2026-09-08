/* =============================================================================
   Velorex Music — product <title> parity + shape test

   Guards the rule in src/seo/seo-lib.php: velorex_product_title() (PHP) and
   Seo.productTitle() (JS) must return byte-identical strings for the same
   product. They disagreed before this test existed — PHP emitted "Vinyl
   Records" where JS emitted "Vinyl Record" — so the server declared one title
   and hydration silently rewrote it to another on every product page.

   Run: node tests/seo-title-parity.js        (needs `php` on PATH)
   ============================================================================= */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// --- Load Seo.productTitle out of the real seo.js, unmodified ---------------
function loadSeo() {
  const code = fs.readFileSync(path.join(ROOT, 'src/js/seo.js'), 'utf8');
  const sandbox = {
    window: {}, console,
    document: { head: { querySelector: () => null, appendChild() {} }, querySelectorAll: () => [], title: '' },
    Storage: { getProducts: () => [] },
    location: { pathname: '/', search: '', hash: '' },
    history: { replaceState() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  if (!sandbox.Seo || typeof sandbox.Seo.productTitle !== 'function') {
    throw new Error('Seo.productTitle not exported from src/js/seo.js');
  }
  return sandbox.Seo;
}

// --- Ask PHP for the same titles in one batch -------------------------------
function phpTitles(products) {
  const script = `
    <?php
    require ${JSON.stringify(path.join(ROOT, 'src/seo/seo-lib.php'))};
    $in = json_decode(file_get_contents('php://stdin'), true);
    $out = array_map(fn($p) => velorex_product_title($p), $in);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
  `;
  const tmp = path.join(ROOT, 'tests', '.parity.tmp.php');
  fs.writeFileSync(tmp, script);
  try {
    return JSON.parse(execFileSync('php', [tmp], { input: JSON.stringify(products), encoding: 'utf8' }));
  } finally {
    fs.unlinkSync(tmp);
  }
}

// --- Cases: real live rows plus the shapes that broke the old builder -------
const CASES = [
  // Artist already inside the product name — must not be repeated.
  { title: 'Meenaxi Vinyl record - Tabu - A. R. Rehman', artist: 'A R Rehman', category: 'vinyl' },
  // Same, with the format word also already present.
  { title: 'Anndata Vinyl Record', artist: 'R. D. Burman', category: 'vinyl' },
  // Artist NOT in the name — must be added.
  { title: 'Refugee', artist: 'Anu Malik', category: 'vinyl' },
  // Long name: optional tail has to be dropped rather than the title cut.
  { title: 'Chain of Light - Limited Edition- Nusrat Fateh Ali Khan ', artist: 'Nusrat Fateh Ali Khan', category: 'vinyl' },
  // Cast list in the artist column — only the first name may be used.
  { title: 'Khamoshi/ Anupama – New Release Hindi LP Vinyl', artist: 'Waheeda Rehman, Rajesh Khanna, Dharmendra, Nazir Hussain', category: 'vinyl' },
  { title: 'Dharmatma  – New Release Hindi LP Vinyl Record', artist: 'Feroz Khan, Hema Malini, Rekha', category: 'vinyl' },
  // Plural form of the format word already present ("cassettes" vs "Cassette").
  { title: 'Meltrack DR-C Cobalt blank audio cassettes', artist: 'Meltrack', category: 'cassette' },
  // Every other category, incl. departments (which get no format qualifier).
  { title: 'Some Album', artist: 'Some Artist', category: 'cd' },
  { title: 'Some Film', artist: 'Some Director', category: 'bluray' },
  { title: 'Another Film', artist: 'Someone', category: 'dvd' },
  { title: 'Band Tee', artist: 'Velorex', category: 'merchandise' },
  { title: 'Carbon Fibre Brush', artist: 'Velorex', category: 'vinyl-care' },
  // Accents + punctuation: the containment test must fold them identically.
  { title: 'Café Society — Björk', artist: 'Bjork', category: 'vinyl' },
  // Degenerate rows.
  { title: 'No Artist Album', artist: '', category: 'vinyl' },
  { title: '   Padded   Spaces   ', artist: 'Someone', category: 'vinyl' },
  { title: '', artist: 'Nobody', category: 'vinyl' },
];

// Fold in the real catalogue when a snapshot is available.
const snapshot = process.argv[2];
if (snapshot && fs.existsSync(snapshot)) {
  for (const p of JSON.parse(fs.readFileSync(snapshot, 'utf8'))) {
    CASES.push({ title: p.title, artist: p.artist, category: p.category });
  }
  console.log(`(folded in ${CASES.length - 16} live products from ${path.basename(snapshot)})\n`);
}

const Seo = loadSeo();
const php = phpTitles(CASES);
let fail = 0;

console.log('--- PHP / JS parity ---');
CASES.forEach((p, i) => {
  const js = Seo.productTitle(p);
  if (js !== php[i]) {
    fail++;
    console.log(`  MISMATCH  ${JSON.stringify(p.title).slice(0, 50)}\n      php: ${php[i]}\n      js : ${js}`);
  }
});
console.log(fail ? `  ${fail} mismatch(es) of ${CASES.length}` : `  all ${CASES.length} titles identical in PHP and JS`);

console.log('\n--- Shape rules ---');
function rule(name, ok, detail) {
  if (ok) console.log('  PASS  ' + name);
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}

const t = (o) => Seo.productTitle(o);

rule('artist already in the name is not repeated',
  t(CASES[0]) === 'Meenaxi Vinyl record - Tabu - A. R. Rehman | Velorex Music', t(CASES[0]));
rule('artist absent from the name is added',
  /— Anu Malik/.test(t(CASES[2])), t(CASES[2]));
rule('no "Buy Online India" boilerplate anywhere',
  CASES.every(c => !/Buy Online India/.test(t(c))));
rule('format word never duplicated',
  !/cassettes \| Cassette/i.test(t(CASES[6])), t(CASES[6]));
rule('cast list reduced to the first artist',
  t(CASES[4]).includes('Waheeda Rehman') && !t(CASES[4]).includes('Rajesh Khanna'), t(CASES[4]));
rule('empty title falls back to the brand', t(CASES[15]) === 'Velorex Music', t(CASES[15]));
rule('whitespace collapsed', t(CASES[14]).startsWith('Padded Spaces'), t(CASES[14]));
rule('no title ends on a dangling separator',
  CASES.every(c => !/[|—-]\s*$/.test(t(c))));

// Length: the tail is optional, so short/medium names must land inside the
// window. Long names keep their full text rather than being cut, so they are
// allowed to exceed it — that is the documented trade-off, not a regression.
const overCore = CASES.filter(c => {
  const name = String(c.title || '').replace(/\s+/g, ' ').trim();
  return name.length <= 45 && t(c).length > 60;
});
rule('every title with a <=45-char name fits 60 chars', overCore.length === 0,
  overCore.map(c => t(c)).join(' / '));

console.log('\n' + (fail ? `FAILURES: ${fail}` : 'ALL PASS'));
process.exit(fail ? 1 : 0);
