/* =============================================================================
   Velorex Music — meta description + category metadata parity test

   Guards two PHP/JS pairs that must return byte-identical strings:

     velorex_product_meta_description()  ↔  Seo.productDescription()
     velorex_category_meta()             ↔  Seo.categoryMeta()

   Seo.syncProductUrl() rewrites a product page's tags as soon as the full
   record loads, and a client-side visit to a category re-titles it, so any
   drift means one URL carries two different titles or descriptions.

   Also checks the shape rules: every product description is ≤ 160 characters,
   and never mentions a free-shipping threshold (removed — CLAUDE.md §16).

   Run: node tests/seo-meta-parity.js [products.json]
        The optional argument is a snapshot of FULL product records (the shape
        /api/product.php returns) folded in as extra cases.
   ============================================================================= */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadSeo() {
  const code = fs.readFileSync(path.join(ROOT, 'src/js/seo.js'), 'utf8');
  const sandbox = {
    window: {}, console,
    document: { head: { querySelector: () => null, appendChild() {} }, querySelectorAll: () => [], title: '' },
    Storage: { getProducts: () => [] },
    URLSearchParams,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.Seo;
}

function php(body, input) {
  const script = `<?php\nrequire ${JSON.stringify(path.join(ROOT, 'src/seo/seo-lib.php'))};\n` + body;
  const tmp = path.join(ROOT, 'tests', '.meta-parity.tmp.php');
  fs.writeFileSync(tmp, script);
  try {
    return JSON.parse(execFileSync('php', [tmp], { input: JSON.stringify(input), encoding: 'utf8' }));
  } finally {
    fs.unlinkSync(tmp);
  }
}

const LONG = 'A family drama directed by Saawan Kumar Tak, starring Meena Kumari, Mumtaz, and Sameer Khan. '
  + 'The story revolves around sacrifice, motherhood, and emotional relationships.';

let PRODUCTS = [
  { title: 'Gomti Ke Kinare', artist: 'R. D. Burman', category: 'vinyl', price: 3450, stock: 4, condition: 'new',
    specs: { label: 'Saregama', year: '2025' }, description: LONG },
  { title: 'Refugee', artist: 'Kareena Kapoor, Abhishek', category: 'vinyl', price: 3450, stock: 0, badge: 'hot', description: '' },
  { title: 'Upcoming One', artist: 'Anu Malik', category: 'vinyl', price: 1299, stock: 0, badge: 'upcoming', specs: { year: '1994' } },
  { title: 'Meenaxi Vinyl record - Tabu - A. R. Rehman', artist: 'A R Rehman', category: 'vinyl', price: 2999, stock: 2, condition: 'pre-owned' },
  { title: 'Sholay', artist: 'R.D. Burman', category: 'vinyl', price: 123456, stock: 1, condition: 'pre-owned',
    specs: { label: 'Polydor' }, description: 'Emoji 🎵 and — dashes & "quotes"   with   spaces\nand newlines.' },
  { title: 'Meltrack DR-C Cobalt blank audio cassettes', artist: 'Meltrack', category: 'cassette', price: 199, stock: 20 },
  { title: 'Band Tee', artist: 'Velorex', category: 'merchandise', price: 799, stock: 5, description: 'Cotton tee.' },
  { title: 'X'.repeat(170), artist: 'Someone', category: 'cd', price: 10, stock: 1 },
  { title: 'Ünïcödé Café', artist: 'Björk', category: 'dvd', price: 500, stock: 3, specs: { label: '  Spaced   Label ', year: '' }, description: 'Word '.repeat(60) },
];
if (process.argv[2]) PRODUCTS = PRODUCTS.concat(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));

const Seo = loadSeo();
let failures = 0;
function fail(msg) { failures++; console.log('FAIL ' + msg); }

// ---- Product descriptions ---------------------------------------------------
const phpDesc = php(
  `$in = json_decode(file_get_contents('php://stdin'), true);
   echo json_encode(array_map('velorex_product_meta_description', $in), JSON_UNESCAPED_UNICODE);`,
  PRODUCTS
);
PRODUCTS.forEach((p, i) => {
  const js = Seo.productDescription(p);
  if (js !== phpDesc[i]) fail(`description #${i} (${String(p.title).slice(0, 30)})\n  php: ${phpDesc[i]}\n  js:  ${js}`);
  if (js.length > 160) fail(`description #${i} is ${js.length} chars`);
  if (/free shipping over/i.test(js)) fail(`description #${i} mentions a free-shipping threshold`);
});

// ---- Category metadata ------------------------------------------------------
const catCases = [];
const keys = { 'vinyl-records': 'vinyl', 'audio-cds': 'cd', 'cassettes': 'cassette', 'blu-ray-movies': 'bluray',
  'dvd-movies': 'dvd', 'merchandise': 'merchandise', 'vinyl-care': 'vinyl-care' };
Object.keys(keys).forEach((slug) => {
  catCases.push({ slug, lang: null, sub: null });
  if (Seo.SUBCATS[keys[slug]]) Object.keys(Seo.SUBCATS[keys[slug]]).forEach((sub) => catCases.push({ slug, lang: null, sub }));
  else ['hindi', 'english'].forEach((lang) => catCases.push({ slug, lang, sub: null }));
});
const phpCat = php(
  `$in = json_decode(file_get_contents('php://stdin'), true);
   echo json_encode(array_map(fn($c) => velorex_category_meta($c['slug'], $c['lang'], $c['sub']), $in), JSON_UNESCAPED_UNICODE);`,
  catCases
);
catCases.forEach((c, i) => {
  const js = Seo.categoryMeta(keys[c.slug], c.lang, c.sub);
  const p = phpCat[i];
  const id = [c.slug, c.lang, c.sub].filter(Boolean).join('/');
  if (!js || !p) { fail(`category ${id}: missing on ${js ? 'php' : 'js'} side`); return; }
  if (js.title !== p.title) fail(`category ${id} title\n  php: ${p.title}\n  js:  ${js.title}`);
  if (js.description !== p.description) fail(`category ${id} description\n  php: ${p.description}\n  js:  ${js.description}`);
  if (/free shipping over/i.test(p.description)) fail(`category ${id} mentions a free-shipping threshold`);
  // Over 160 and the server's velorex_trim_text() ellipsises it while the SPA
  // sets it whole — two descriptions for one URL.
  if (p.description.length > 160) fail(`category ${id} description is ${p.description.length} chars (max 160)`);
});

// ---- Collection rules (Phase 2) ------------------------------------------------
const ruleCases = {
  facet: [[0, 10], [5, 112], [6, 112], [104, 112], [112, 112], [4, 4], [7, 0]],
  preowned: [[['vinyl'], null], [['vinyl', 'cassette'], null], [['cd'], null], [[], null], [['vinyl'], 'vinyl-records'], [['vinyl'], 'cassettes']],
  count: [[25, 20], [11, 11], [1, 1], [1, 0], [0, 0]],
};
const phpRules = php(
  `$in = json_decode(file_get_contents('php://stdin'), true);
   echo json_encode([
     'facet'    => array_map(fn($c) => velorex_facet_status($c[0], $c[1]), $in['facet']),
     'preowned' => array_map(fn($c) => velorex_preowned_meta($c[0], $c[1]), $in['preowned']),
     'count'    => array_map(fn($c) => velorex_artist_count_line($c[0], $c[1]), $in['count']),
   ], JSON_UNESCAPED_UNICODE);`,
  ruleCases
);
ruleCases.facet.forEach((c, i) => {
  const js = Seo.facetStatus(c[0], c[1]);
  if (js !== phpRules.facet[i]) fail(`facetStatus(${c}) php ${phpRules.facet[i]} js ${js}`);
});
ruleCases.preowned.forEach((c, i) => {
  const js = Seo.preownedMeta(c[0], c[1]);
  const p = phpRules.preowned[i];
  ['title', 'description', 'h1'].forEach((k) => { if (js[k] !== p[k]) fail(`preownedMeta(${JSON.stringify(c)}).${k}\n  php: ${p[k]}\n  js:  ${js[k]}`); });
  if (p.description.length > 160) fail(`preownedMeta(${JSON.stringify(c)}) description is ${p.description.length} chars`);
});
ruleCases.count.forEach((c, i) => {
  const js = Seo.artistCountLine(c[0], c[1]);
  if (js !== phpRules.count[i]) fail(`artistCountLine(${c}) php "${phpRules.count[i]}" js "${js}"`);
});

// ---- Journal meta (Phase 3) -----------------------------------------------------
const blogCases = [
  ['Short headline', null, 'An excerpt.', null],
  ['Vinyl Records vs CDs: Which Is Better for Music Lovers and Collectors in 2026?', null, 'x '.repeat(120), null],
  ['Exactly forty-two characters long headline', null, 'E', null],
  ['Any', '  Editor   SEO title  ', 'Excerpt', '  Editor   description with  spaces '],
  ['Emoji 🎵 headline that is fairly long for testing', '', 'word '.repeat(50), ''],
];
const phpBlog = php(
  `$in = json_decode(file_get_contents('php://stdin'), true);
   echo json_encode(array_map(fn($c) => [velorex_blog_meta_title($c[0], $c[1]), velorex_blog_meta_description($c[2], $c[3])], $in), JSON_UNESCAPED_UNICODE);`,
  blogCases
);
blogCases.forEach((c, i) => {
  const t = Seo.blogMetaTitle(c[0], c[1]), d = Seo.blogMetaDescription(c[2], c[3]);
  if (t !== phpBlog[i][0]) fail(`blogMetaTitle #${i}\n  php: ${phpBlog[i][0]}\n  js:  ${t}`);
  if (d !== phpBlog[i][1]) fail(`blogMetaDescription #${i}\n  php: ${phpBlog[i][1]}\n  js:  ${d}`);
  if (d.length > 160) fail(`blogMetaDescription #${i} is ${d.length} chars`);
});

// Composer collection copy must fit, like every other description.
const artists = php(`echo json_encode(velorex_artist_collections(), JSON_UNESCAPED_UNICODE);`, null);
Object.entries(artists).forEach(([slug, a]) => {
  if (a.description.length > 160) fail(`artist ${slug} description is ${a.description.length} chars`);
  if (a.title.length > 65) fail(`artist ${slug} title is ${a.title.length} chars`);
});

console.log(failures
  ? `\n${failures} failure(s)`
  : `ALL PASS — ${PRODUCTS.length} product descriptions, ${catCases.length} category pages`);
process.exit(failures ? 1 : 0);
