<?php
// =============================================================================
// Velorex Music — sitemap generator
//
// Served at /sitemap.xml (rewritten in .htaccess). Generated from the live
// products table rather than maintained by hand, so a product added through
// the admin panel is discoverable by Google on the next crawl with no
// deploy and nothing to remember.
//
// Contents:
//   • Home + the static information pages
//   • /products and the five category pages, plus the hindi/english facets
//     that actually have stock
//   • Every product, with <lastmod> from products.updated_at
//
// Deliberately excluded: cart, checkout, profile, auth screens, track-order,
// and the admin panel. A sitemap is a statement that a URL SHOULD be indexed;
// listing a noindex page is a contradictory signal.
// =============================================================================

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/src/seo/seo-lib.php';

// api/config.php sets JSON + no-store. A sitemap is XML and benefits from a
// short cache — crawlers refetch it far more often than it meaningfully changes.
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header_remove('Pragma');
header_remove('Expires');

/** One <url> entry. $lastmod may be null (the element is then omitted). */
function velorex_sitemap_url(string $loc, ?string $lastmod, string $changefreq, string $priority): string {
    $out = "  <url>\n";
    $out .= '    <loc>' . velorex_e($loc) . "</loc>\n";
    if ($lastmod) {
        $ts = strtotime($lastmod);
        if ($ts) $out .= '    <lastmod>' . date('Y-m-d', $ts) . "</lastmod>\n";
    }
    $out .= '    <changefreq>' . $changefreq . "</changefreq>\n";
    $out .= '    <priority>' . $priority . "</priority>\n";
    $out .= "  </url>\n";
    return $out;
}

$xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

// ---- Home -------------------------------------------------------------------
$xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/', null, 'daily', '1.0');

// ---- Catalogue --------------------------------------------------------------
$xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/products', null, 'daily', '0.9');

// Only emit category and facet URLs that actually have products behind them.
// A sitemap full of empty listings trains Google to distrust the whole file.
$countsByCat = [];
$countsByCatLang = [];
try {
    $stmt = db()->query('SELECT category, language, COUNT(*) AS n FROM products GROUP BY category, language');
    foreach ($stmt->fetchAll() as $r) {
        $cat  = (string)$r['category'];
        $lang = (string)($r['language'] ?? '');
        $n    = (int)$r['n'];
        $countsByCat[$cat] = ($countsByCat[$cat] ?? 0) + $n;
        if ($lang !== '') $countsByCatLang[$cat][$lang] = $n;
    }
} catch (Throwable $e) {
    error_log('[sitemap] category count query failed: ' . $e->getMessage());
}

foreach (velorex_categories() as $slug => $meta) {
    if (($countsByCat[$meta['key']] ?? 0) < 1) continue;
    $xml .= velorex_sitemap_url(velorex_category_url($slug), null, 'daily', '0.9');
    foreach (array_keys(velorex_languages()) as $lang) {
        if (($countsByCatLang[$meta['key']][$lang] ?? 0) < 1) continue;
        $xml .= velorex_sitemap_url(velorex_category_url($slug, $lang), null, 'weekly', '0.8');
    }
}

// ---- Products ---------------------------------------------------------------
try {
    $stmt = db()->query('SELECT id, title, artist, updated_at FROM products ORDER BY id DESC');
    foreach ($stmt->fetchAll() as $row) {
        $xml .= velorex_sitemap_url(
            velorex_product_url($row),
            $row['updated_at'] ?? null,
            'weekly',
            '0.8'
        );
    }
} catch (Throwable $e) {
    error_log('[sitemap] product query failed: ' . $e->getMessage());
}

// ---- Blog -------------------------------------------------------------------
// Only published posts. Drafts are noindex by construction (the public API
// won't serve them), so listing one would be a contradictory signal.
try {
    require_once __DIR__ . '/api/_blog_helpers.php';
    blog_ensure_table(db());
    $posts = db()->query(
        "SELECT slug, published_at, updated_at FROM blog_posts
          WHERE status = 'published' ORDER BY published_at DESC"
    )->fetchAll();
    if ($posts) {
        $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/blog', $posts[0]['published_at'] ?? null, 'weekly', '0.7');
        foreach ($posts as $p) {
            $xml .= velorex_sitemap_url(
                VELOREX_SITE_URL . '/blog/' . $p['slug'],
                $p['updated_at'] ?: ($p['published_at'] ?? null),
                'monthly',
                '0.6'
            );
        }
    }
} catch (Throwable $e) {
    error_log('[sitemap] blog query failed: ' . $e->getMessage());
}

// ---- Static information pages ----------------------------------------------
// Lower priority: useful for trust and long-tail policy queries ("velorex
// music return policy"), but never the pages we want ranking for head terms.
foreach ([
    '/contact.html'  => '0.5',
    '/faq.html'      => '0.5',
    '/shipping.html' => '0.4',
    '/returns.html'  => '0.4',
] as $path => $priority) {
    $xml .= velorex_sitemap_url(VELOREX_SITE_URL . $path, null, 'monthly', $priority);
}

$xml .= '</urlset>' . "\n";

echo $xml;
