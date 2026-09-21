<?php
// =============================================================================
// /api/admin/seo.php — product content scorecard for Admin → SEO (admin only)
//
// GET → { products: [...], summary: {...} }
//
// Answers "which product pages should I improve first, and what is missing?"
// from the real catalogue. It never writes, never fills a gap and never
// suggests text — it only reports which REAL fields are empty, so the owner
// can add facts they actually know. See CLAUDE.md §45.
//
// Priority is transparent and deliberately simple (shown in the panel):
//   +3 in stock (a page that can sell today)
//   +2 belongs to a composer collection (/artists/…, linked sitewide)
//   +1 pre-owned (one-off copies; buyers read descriptions closely)
//   +1 featured (hot/new badge — shown on the homepage)
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_products_helpers.php';
require_once __DIR__ . '/../../src/seo/seo-lib.php';

require_admin();

try {
    $pdo  = db();
    $rows = $pdo->query('SELECT * FROM products ORDER BY id DESC')->fetchAll();
    $products = array_map('row_to_product', $rows);

    $words = static fn($s) => count(preg_split('/\s+/u', trim(strip_tags((string)$s)), -1, PREG_SPLIT_NO_EMPTY));
    $norm  = static fn($s) => preg_replace('/[^a-z0-9]/', '', strtolower((string)$s));
    // Listing name with format words and editions removed, to spot the same
    // record listed twice ("Mission Kashmir LP" / "MISSION KASHMIR - VINYL RECORD").
    $core  = static fn($t) => $norm(preg_replace('/\(.*?\)|vinyl record|vinil record|\blp\b|\brecord\b|\bblack\b/i', '', (string)$t));

    $descSeen = []; $coreSeen = [];
    foreach ($products as $p) {
        $d = $norm(mb_substr(trim((string)$p['description']), 0, 200));
        if ($d !== '') $descSeen[$d][] = (int)$p['id'];
        $coreSeen[$core($p['title'])][] = (int)$p['id'];
    }

    $out = [];
    $summary = ['total' => count($products), 'withIssues' => 0, 'byIssue' => []];
    foreach ($products as $p) {
        $issues = [];
        $w = $words($p['description']);
        if ($w === 0)      $issues[] = 'No description';
        elseif ($w < 40)   $issues[] = 'Short description (' . $w . ' words)';
        $d = $norm(mb_substr(trim((string)$p['description']), 0, 200));
        if ($d !== '' && count($descSeen[$d]) > 1) $issues[] = 'Description shared with another product';
        $imgs = array_filter($p['images'] ?? []);
        if (!$imgs && empty($p['image'])) $issues[] = 'No photo';
        elseif (count($imgs) < 2)         $issues[] = 'Only one photo';
        $isMusic = in_array($p['category'], ['vinyl', 'cd', 'cassette'], true);
        $isBlank = (bool)preg_match('/\bblank\b/i', (string)$p['title']);
        if ($isMusic && !$isBlank && trim((string)$p['trackListing']) === '') $issues[] = 'No track listing';
        $specs = is_array($p['specs']) ? $p['specs'] : [];
        if (trim((string)($specs['label'] ?? '')) === '') $issues[] = 'No label';
        if (trim((string)($specs['year'] ?? '')) === '')  $issues[] = 'No year';
        if ($isMusic && !$isBlank && trim((string)$p['language']) === '') $issues[] = 'No language';
        if ($p['category'] === 'vinyl' && trim((string)$p['musicDirector']) === '') $issues[] = 'No music director';
        if (preg_match('/[A-Z]{4,}/', $p['title']) && $p['title'] === mb_strtoupper($p['title'])) $issues[] = 'Title in capitals';
        if (count($coreSeen[$core($p['title'])]) > 1) $issues[] = 'Possible duplicate listing';

        $artistSlug = velorex_product_artist_slug($p);
        $score = ((int)$p['stock'] > 0 ? 3 : 0) + ($artistSlug ? 2 : 0)
               + (($p['condition'] ?? 'new') === 'pre-owned' ? 1 : 0)
               + (in_array($p['badge'], ['hot', 'new'], true) ? 1 : 0);

        if ($issues) $summary['withIssues']++;
        foreach ($issues as $i) {
            $key = preg_replace('/ \(\d+ words\)$/', '', $i);
            $summary['byIssue'][$key] = ($summary['byIssue'][$key] ?? 0) + 1;
        }
        $out[] = [
            'id'       => (int)$p['id'],
            'title'    => $p['title'],
            'url'      => velorex_product_path($p),
            'stock'    => (int)$p['stock'],
            'priority' => $score,
            'composer' => $artistSlug,
            'issues'   => $issues,
        ];
    }
    usort($out, static fn($a, $b) => [$b['priority'], count($b['issues'])] <=> [$a['priority'], count($a['issues'])]);
    arsort($summary['byIssue']);

    echo json_encode(['products' => $out, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[admin/seo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
