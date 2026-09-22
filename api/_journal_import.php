<?php
// =============================================================================
// Journal draft import — shared by Admin → Blog ("Import prepared drafts",
// via /api/admin/journal-import.php) and the optional CLI script
// scripts/import-journal-drafts.php.
//
// The Journal is managed in the admin: every post is written, edited, updated
// and published there. This only SEEDS the articles prepared in the repository
// (content/journal/, see manifest.json) as DRAFTS, once:
//   • a slug that already exists is skipped — an edited post is never touched;
//   • bodies go through blog_sanitize_html(), the admin editor's own allowlist;
//   • "/product/<id>" links become the product's current canonical URL;
//     unknown ids and /blog/ links to missing posts are reported;
//   • status 'draft', author 'Velorex Music', no published_at — publishing in
//     the admin is what stamps the real date.
// content/ is refused over HTTP by the root .htaccess; PHP reads it directly.
// =============================================================================

require_once __DIR__ . '/_products_helpers.php';
require_once __DIR__ . '/_blog_helpers.php';
require_once __DIR__ . '/../src/seo/seo-lib.php';

function journal_manifest(): array {
    $m = json_decode((string)@file_get_contents(__DIR__ . '/../content/journal/manifest.json'), true);
    return is_array($m['articles'] ?? null) ? $m['articles'] : [];
}

/**
 * @return array{created:int, skipped:int, problems:int, articles:array}
 *   articles: [{slug, title, status: 'created'|'exists'|'would-create'|'error', words, notes:[], reviewNotes:[]}]
 */
function journal_import_drafts(PDO $pdo, bool $dryRun): array {
    blog_ensure_table($pdo);
    $hasRelated = blog_has_related_columns($pdo);
    $hasMeta    = blog_has_meta_columns($pdo);

    $paths = [];
    foreach ($pdo->query('SELECT id, title, artist FROM products')->fetchAll() as $r) {
        $r['title']  = products_decode_text($r['title']);
        $r['artist'] = products_decode_text($r['artist']);
        $paths[(int)$r['id']] = velorex_product_path($r);
    }
    $existing = array_column($pdo->query('SELECT slug FROM blog_posts')->fetchAll(), 'slug');
    $articles = journal_manifest();
    $manifestSlugs = array_column($articles, 'slug');

    $out = ['created' => 0, 'skipped' => 0, 'problems' => 0, 'articles' => []];
    foreach ($articles as $a) {
        $row = ['slug' => (string)$a['slug'], 'title' => (string)$a['title'], 'status' => '', 'words' => 0,
                'notes' => [], 'reviewNotes' => array_values((array)($a['reviewNotes'] ?? []))];
        if (in_array($row['slug'], $existing, true)) {
            $row['status'] = 'exists';
            $out['skipped']++;
            $out['articles'][] = $row;
            continue;
        }
        $html = (string)@file_get_contents(__DIR__ . '/../content/journal/' . basename((string)($a['file'] ?? '')));
        if (trim($html) === '') {
            $row['status'] = 'error';
            $row['notes'][] = 'Article file is missing.';
            $out['problems']++;
            $out['articles'][] = $row;
            continue;
        }
        $html = preg_replace_callback('#href="/product/(\d+)(?:-[^"]*)?"#', static function ($m) use ($paths, &$row, &$out) {
            $id = (int)$m[1];
            if (!isset($paths[$id])) {
                $row['notes'][] = "Links to product {$id}, which no longer exists — fix before publishing.";
                $out['problems']++;
                return $m[0];
            }
            return 'href="' . $paths[$id] . '"';
        }, $html);
        preg_match_all('#href="/blog/([A-Za-z0-9-]+)"#', $html, $bm);
        foreach (array_unique($bm[1]) as $t) {
            if (!in_array($t, $existing, true) && !in_array($t, $manifestSlugs, true)) {
                $row['notes'][] = "Links to /blog/{$t}, which does not exist.";
                $out['problems']++;
            }
        }

        $content = blog_sanitize_html($html);
        $row['words'] = str_word_count(strip_tags($content));
        if ($dryRun) {
            $row['status'] = 'would-create';
            $out['articles'][] = $row;
            continue;
        }

        $cover = (string)($a['cover'] ?? '');
        $cols = 'slug, title, excerpt, content, cover_image, status, author, published_at';
        $vals = ":slug, :title, :excerpt, :content, :cover, 'draft', 'Velorex Music', NULL";
        $params = [
            ':slug' => blog_unique_slug($pdo, $row['slug']), ':title' => $row['title'],
            ':excerpt' => mb_substr((string)($a['excerpt'] ?? ''), 0, 500), ':content' => $content,
            ':cover' => ($cover !== '' && blog_safe_url($cover)) ? $cover : null,
        ];
        if ($hasRelated) {
            $cols .= ', related_collections, related_products';
            $vals .= ', :rc, :rp';
            $params[':rc'] = json_encode(array_values(blog_decode_list($a['relatedCollections'] ?? [], 'path')));
            $params[':rp'] = json_encode(array_values(array_filter(
                blog_decode_list($a['relatedProducts'] ?? [], 'int'),
                static fn($id) => isset($paths[$id])
            )));
        }
        if ($hasMeta) {
            $cols .= ', meta_title, meta_description';
            $vals .= ', :mt, :md';
            $params[':mt'] = ($a['metaTitle'] ?? '') !== '' ? mb_substr((string)$a['metaTitle'], 0, 70) : null;
            $params[':md'] = ($a['metaDescription'] ?? '') !== '' ? mb_substr((string)$a['metaDescription'], 0, 170) : null;
        }
        $pdo->prepare("INSERT INTO blog_posts ($cols) VALUES ($vals)")->execute($params);
        $row['status'] = 'created';
        $existing[] = $row['slug'];
        $out['created']++;
        $out['articles'][] = $row;
    }
    return $out;
}
