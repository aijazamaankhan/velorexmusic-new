<?php
// =============================================================================
// tests/music-history.php — guards for The Evolution of Music & Audio
//
//   php tests/music-history.php
//
// What this protects, and why each one was a real failure and not a theory:
//
//   1. A meta description longer than 160 BYTES is ellipsised by
//      velorex_trim_text() on the server, while src/js/seo.js sets the full
//      string on hydration — so one URL carries two different descriptions.
//      Eight of the fourteen articles were over when this was written, and the
//      limit is bytes, not characters: one em dash costs three.
//
//   2. The hub's title and description are written out twice — in
//      seo-render.php and in PAGE_META['music-history'] in src/js/seo.js — and
//      they must be byte-identical for the same reason.
//
//   3. Every slug in velorex_history_order() must resolve to an article, since
//      sitemap.php lists that order and the prev/next chain walks it. A slug
//      with no article is a sitemap entry leading to a 404.
//
//   4. Nothing in this section may claim Velorex made any of these machines.
//      That is the constraint the whole section was written under.
// =============================================================================

require_once __DIR__ . '/../src/history/history-lib.php';
require_once __DIR__ . '/../src/seo/seo-lib.php';

$fail = 0;
$pass = 0;
function ok(string $what): void   { global $pass; $pass++; echo "  ok   $what\n"; }
function bad(string $what): void  { global $fail; $fail++; echo "  FAIL $what\n"; }
function check(bool $cond, string $what): void { $cond ? ok($what) : bad($what); }

$articles = velorex_history_articles();
$order    = velorex_history_order();
$cards    = velorex_history_cards();
$index    = velorex_history_index();

echo "\n1. Content integrity\n";
check(count($articles) >= 12, 'at least twelve articles exist (' . count($articles) . ')');

$missing = array_values(array_filter($order, static fn($s) => !isset($articles[$s])));
check(!$missing, 'every slug in the order list has an article'
    . ($missing ? ' — missing: ' . implode(', ', $missing) : ''));

$uncovered = array_values(array_filter(array_keys($articles), static fn($s) => !in_array($s, $order, true)));
check(!$uncovered, 'every article is reachable from the order list'
    . ($uncovered ? ' — orphaned: ' . implode(', ', $uncovered) : ''));

$cardMissing = array_values(array_filter($cards, static fn($s) => !isset($articles[$s])));
check(!$cardMissing, 'every hub card has an article'
    . ($cardMissing ? ' — missing: ' . implode(', ', $cardMissing) : ''));

// titles covers every article, not just the carded ones: an era panel links to
// vinyl and mp3, which have no card, and read their names from this map.
$titleGaps = array_values(array_filter($order, static fn($s) => !isset($index['titles'][$s])));
check(!$titleGaps, 'the index titles map covers every article'
    . ($titleGaps ? ' — missing: ' . implode(', ', $titleGaps) : ''));

foreach (velorex_history_eras() as $era) {
    $dangling = array_values(array_filter($era['articles'] ?? [], static fn($s) => !isset($articles[$s])));
    if ($dangling) bad("era {$era['key']} links to a missing article: " . implode(', ', $dangling));
}
ok('no era links to a missing article');

echo "\n2. Meta fits the server-side trim (bytes, not characters)\n";
foreach ($articles as $slug => $a) {
    $d = $a['metaDescription'] ?? '';
    if ($d === '') { bad("$slug has no meta description"); continue; }
    if (velorex_trim_text($d, 160) !== $d) {
        bad(sprintf('%s description is trimmed server-side (%d bytes)', $slug, strlen($d)));
    }
    if (($a['metaTitle'] ?? '') === '') bad("$slug has no meta title");
}
ok('every article description survives velorex_trim_text() unchanged');

echo "\n3. Hub metadata is identical on both sides\n";
// Read the two copies out of the files rather than restating them here — a
// third copy in the test would be one more thing to keep in step.
$php = (string)@file_get_contents(__DIR__ . '/../seo-render.php');
$js  = (string)@file_get_contents(__DIR__ . '/../src/js/seo.js');

$hubTitle = 'The Evolution of Music & Audio | History of Recorded Sound';
check(str_contains($php, "'" . $hubTitle . "'"), 'seo-render.php carries the hub title');
check(str_contains($js,  "'" . $hubTitle . "'"), 'src/js/seo.js carries the same hub title');

// The PHP copy is split across two concatenated literals for line length, so
// compare the rendered value: pull the JS one and look for both of its halves.
if (preg_match("/'music-history':\s*\{[^}]*description:\s*'((?:[^'\\\\]|\\\\.)*)'/s", $js, $m)) {
    $jsDesc = str_replace("\\'", "'", $m[1]);
    check(strlen($jsDesc) <= 160, sprintf('hub description fits 160 bytes (%d)', strlen($jsDesc)));
    $head = substr($jsDesc, 0, 60);
    $tail = substr($jsDesc, -60);
    check(str_contains($php, $head) && str_contains($php, $tail),
        'seo-render.php emits the same hub description as src/js/seo.js');
} else {
    bad("could not read PAGE_META['music-history'].description out of src/js/seo.js");
}

echo "\n4. Nothing claims Velorex made any of it\n";
// The section is independent educational material. A sentence putting the
// brand next to a manufacturing verb is the failure mode worth catching.
$claim = '/\bVelorex\b[^.]{0,80}\b(made|manufactured|produced|built|invented|engineered)\b/i';
$offenders = [];
foreach ($articles as $slug => $a) {
    $blob = json_encode($a, JSON_UNESCAPED_UNICODE);
    if (preg_match_all($claim, (string)$blob, $mm)) {
        foreach ($mm[0] as $hit) {
            // "Velorex Music did not make any of these" is the disclaimer, not a claim.
            if (preg_match('/\bdid not\b|\bnever\b|\bnot\b/i', $hit)) continue;
            $offenders[] = "$slug: $hit";
        }
    }
}
check(!$offenders, 'no article implies Velorex built any of this equipment'
    . ($offenders ? ' — ' . implode(' | ', $offenders) : ''));

echo "\n" . ($fail ? "FAILED — $fail failing, $pass passing\n" : "All good — $pass checks passed\n");
exit($fail ? 1 : 0);
