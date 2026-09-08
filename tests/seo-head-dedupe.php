<?php
/* =============================================================================
   Velorex Music — server-rendered <head> de-duplication test

   Guards the invariant that a server-rendered page carries exactly ONE of each
   SEO tag. Before this, velorex_inject_head() appended per-page tags while the
   shell's homepage tags stayed put, so every product page shipped two <title>s,
   two descriptions and two canonicals — the homepage's copy first.

   Run: php tests/seo-head-dedupe.php
   ============================================================================= */

require __DIR__ . '/../src/seo/seo-lib.php';

$fail = 0;
function check(string $name, $actual, $expected): void {
    global $fail;
    if ($actual === $expected) {
        echo "  PASS  $name  → " . var_export($actual, true) . "\n";
    } else {
        $fail++;
        echo "  FAIL  $name  got " . var_export($actual, true)
           . " want " . var_export($expected, true) . "\n";
    }
}
// Strip HTML comments before counting. The markers themselves carry prose that
// names these tags, and a comment is not a tag — counting it would make the
// test fail on its own documentation.
function countTag(string $html, string $re): int {
    $bare = preg_replace('#<!--.*?-->#s', '', $html);
    return preg_match_all($re, $bare ?? $html);
}

$RE = [
    'title'       => '#<title>#i',
    'description' => '#<meta\s+name="description"#i',
    'robots'      => '#<meta\s+name="robots"#i',
    'canonical'   => '#<link\s+rel="canonical"#i',
    'og:title'    => '#<meta\s+property="og:title"#i',
    'og:desc'     => '#<meta\s+property="og:description"#i',
    'og:url'      => '#<meta\s+property="og:url"#i',
    'og:image'    => '#<meta\s+property="og:image"#i',
    'tw:title'    => '#<meta\s+name="twitter:title"#i',
    // Count ENTITY DECLARATIONS, not @id references — WebSite legitimately
    // points at the Organization via "publisher", and that must not read as a
    // second Organization.
    'ld:org'      => '#"@type":\s*"Organization"#i',
    'ld:website'  => '#"@type":\s*"WebSite"#i',
];

$shellRaw = file_get_contents(__DIR__ . '/../index.html');

echo "--- The shell (index.html, served as-is at \"/\") keeps exactly one set ---\n";
foreach ($RE as $label => $re) check("homepage $label", countTag($shellRaw, $re), 1);

echo "\n--- After stripping + injecting a page's own tags: still exactly one ---\n";
$stripped = velorex_strip_shell_seo($shellRaw);
foreach ($RE as $label => $re) check("stripped shell has no $label", countTag($stripped, $re), 0);

$page = $stripped . velorex_meta_block([
    'title'       => 'Refugee — Anu Malik | Vinyl Record | Velorex Music',
    'description' => 'A test description.',
    'canonical'   => VELOREX_SITE_URL . '/product/3-refugee',
]) . velorex_jsonld_site();
echo "\n";
foreach ($RE as $label => $re) check("rendered page $label", countTag($page, $re), 1);

echo "\n--- Things OUTSIDE the markers must survive the strip ---\n";
check('theme-color kept',      countTag($stripped, '#<meta\s+name="theme-color"#i'), 1);
check('favicon svg kept',      countTag($stripped, '#<link\s+rel="icon"\s+href="/favicon\.svg"#i'), 1);
check('apple-touch-icon kept', countTag($stripped, '#rel="apple-touch-icon"#i'), 1);
check('viewport kept',         countTag($stripped, '#<meta\s+name="viewport"#i'), 1);
check('scripts untouched',     countTag($stripped, '#src/js/seo\.js#') > 0, true);

echo "\n--- Fallback path: markers removed by a future edit ---\n";
// The strip must still work without the comment markers, or losing them
// silently reintroduces exactly the duplication this guards against.
$noMarkers = preg_replace('#<!-- velorex:seo-head:(start.*?|end) -->#s', '', $shellRaw);
check('markers really gone', countTag($noMarkers, '#velorex:seo-head#'), 0);
$strippedFallback = velorex_strip_shell_seo($noMarkers);
foreach ($RE as $label => $re) check("fallback removed $label", countTag($strippedFallback, $re), 0);

echo "\n--- Robots behaviour is preserved ---\n";
$noindex = velorex_meta_block(['title' => 'Empty category', 'robots' => 'noindex, follow']);
check('noindex passes through', (bool)preg_match('#content="noindex, follow"#', $noindex), true);
check('default is indexable',
    (bool)preg_match('#<meta name="robots" content="index, follow#', velorex_meta_block(['title' => 'x'])), true);

echo "\n" . ($fail ? "FAILURES: $fail\n" : "ALL PASS\n");
exit($fail ? 1 : 0);
