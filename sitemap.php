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
require_once __DIR__ . '/api/_products_helpers.php';  // products_has_condition_column()
require_once __DIR__ . '/src/seo/seo-lib.php';

// api/config.php sets JSON + no-store. A sitemap is XML and benefits from a
// short cache — crawlers refetch it far more often than it meaningfully changes.
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header_remove('Pragma');
header_remove('Expires');

/**
 * One <url> entry. $lastmod may be null (the element is then omitted — a date
 * is only written when it is a real modification time from the database).
 * $images are absolute URLs for Google Images; the image-sitemap extension is
 * how a product cover gets discovered even before the page is rendered.
 */
function velorex_sitemap_url(string $loc, ?string $lastmod, string $changefreq, string $priority, array $images = []): string {
    $out = "  <url>\n";
    $out .= '    <loc>' . velorex_e($loc) . "</loc>\n";
    if ($lastmod) {
        $ts = strtotime($lastmod);
        if ($ts) $out .= '    <lastmod>' . date('Y-m-d', $ts) . "</lastmod>\n";
    }
    foreach ($images as $img) {
        $out .= '    <image:image><image:loc>' . velorex_e($img) . "</image:loc></image:image>\n";
    }
    $out .= '    <changefreq>' . $changefreq . "</changefreq>\n";
    $out .= '    <priority>' . $priority . "</priority>\n";
    $out .= "  </url>\n";
    return $out;
}

$xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
      . ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";

// ---- Home -------------------------------------------------------------------
$xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/', null, 'daily', '1.0');

// ---- Catalogue --------------------------------------------------------------
$xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/products', null, 'daily', '0.9');

// Only emit category and facet URLs that actually have products behind them.
// A sitemap full of empty listings trains Google to distrust the whole file.
// LOWER(language): the column holds both "hindi" and "Hindi" (free-text admin
// field, CLAUDE.md §19) and the facet page matches either, so the count must too.
// MAX(updated_at) gives each listing a real lastmod: a listing changed when the
// newest product in it did.
$countsByCat = [];
$countsByCatLang = [];
$lastmodByCat = [];
$lastmodByCatLang = [];
try {
    $stmt = db()->query(
        'SELECT category, LOWER(TRIM(language)) AS lang, COUNT(*) AS n, MAX(updated_at) AS lm
           FROM products GROUP BY category, LOWER(TRIM(language))'
    );
    foreach ($stmt->fetchAll() as $r) {
        $cat  = (string)$r['category'];
        $lang = (string)($r['lang'] ?? '');
        $n    = (int)$r['n'];
        $lm   = $r['lm'] ?? null;
        $countsByCat[$cat] = ($countsByCat[$cat] ?? 0) + $n;
        if ($lm && (!isset($lastmodByCat[$cat]) || $lm > $lastmodByCat[$cat])) $lastmodByCat[$cat] = $lm;
        if ($lang !== '') {
            $countsByCatLang[$cat][$lang] = ($countsByCatLang[$cat][$lang] ?? 0) + $n;
            $lastmodByCatLang[$cat][$lang] = $lm;
        }
    }
} catch (Throwable $e) {
    error_log('[sitemap] category count query failed: ' . $e->getMessage());
}

// Subcategory counts for the departments, so only stocked sub-pages are listed.
$countsBySub = [];
try {
    if (products_has_subcategory_column(db())) {
        $st = db()->query(
            "SELECT category, subcategory, COUNT(*) AS n FROM products
              WHERE subcategory IS NOT NULL AND subcategory <> ''
              GROUP BY category, subcategory"
        );
        foreach ($st->fetchAll() as $r) {
            $countsBySub[(string)$r['category']][(string)$r['subcategory']] = (int)$r['n'];
        }
    }
} catch (Throwable $e) {
    error_log('[sitemap] subcategory count query failed: ' . $e->getMessage());
}

foreach (velorex_categories() as $slug => $meta) {
    if (($countsByCat[$meta['key']] ?? 0) < 1) continue;
    $xml .= velorex_sitemap_url(velorex_category_url($slug), $lastmodByCat[$meta['key']] ?? null, 'daily', '0.9');
    // Departments list stocked subcategories; formats list stocked languages.
    foreach (velorex_subcategories($slug) as $subSlug => $subLabel) {
        if (($countsBySub[$meta['key']][$subSlug] ?? 0) < 1) continue;
        $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/' . $slug . '/' . $subSlug, null, 'weekly', '0.8');
    }
    foreach (array_keys(velorex_languages()) as $lang) {
        // Same rule the page itself applies (velorex_facet_status): a facet that
        // duplicates its parent, or is too thin to land on, is not listed.
        $fc = $countsByCatLang[$meta['key']][$lang] ?? 0;
        if ($fc < 1 || velorex_facet_status($fc, $countsByCat[$meta['key']] ?? 0) !== 'index') continue;
        $xml .= velorex_sitemap_url(velorex_category_url($slug, $lang), $lastmodByCatLang[$meta['key']][$lang] ?? null, 'weekly', '0.8');
    }
}

// ---- Products ---------------------------------------------------------------
try {
    $stmt = db()->query('SELECT id, title, artist, image, updated_at FROM products ORDER BY id DESC');
    foreach ($stmt->fetchAll() as $row) {
        // Rows written by the old admin hold entity-encoded text, which would
        // slugify to /product/12-gulzar-39-s-… — a different URL from the one
        // seo-render.php declares canonical. Decode for the same reason
        // row_to_product() does; see products_decode_text().
        $row['title']  = products_decode_text($row['title']);
        $row['artist'] = products_decode_text($row['artist']);
        $cover = velorex_absolute_image($row['image'] ?? '');
        $xml .= velorex_sitemap_url(
            velorex_product_url($row),
            $row['updated_at'] ?? null,
            'weekly',
            '0.8',
            // Only a real cover, never the brand fallback card.
            $cover !== VELOREX_DEFAULT_OG_IMAGE ? [$cover] : []
        );
    }
} catch (Throwable $e) {
    error_log('[sitemap] product query failed: ' . $e->getMessage());
}

// ---- Pre-owned --------------------------------------------------------------
// Listed only where there is actual stock, for the same reason as the category
// facets above: a sitemap entry for an empty listing trains Google to distrust
// the file.
try {
    if (products_has_condition_column(db())) {
        $poCounts = [];
        $st = db()->query(
            "SELECT category, COUNT(*) AS n FROM products
              WHERE item_condition = 'pre-owned' GROUP BY category"
        );
        $poTotal = 0;
        foreach ($st->fetchAll() as $r) {
            $poCounts[(string)$r['category']] = (int)$r['n'];
            $poTotal += (int)$r['n'];
        }
        if ($poTotal > 0) {
            $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/pre-owned', null, 'weekly', '0.8');
            foreach (velorex_categories() as $slug => $meta) {
                if (($poCounts[$meta['key']] ?? 0) < 1) continue;
                // One format holding all pre-owned stock is /pre-owned twice:
                // that page canonicalises to the hub, so it is not listed.
                if (count($poCounts) === 1) continue;
                $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/pre-owned/' . $slug, null, 'weekly', '0.7');
            }
        }
    }
} catch (Throwable $e) {
    error_log('[sitemap] pre-owned query failed: ' . $e->getMessage());
}

// ---- Combo offers -----------------------------------------------------------
// Only listed when at least one published combo actually has products in it —
// seo-render.php marks the page noindex when it is empty, and a sitemap entry
// for a noindex URL is a contradictory signal.
try {
    require_once __DIR__ . '/api/_combo_helpers.php';
    combos_ensure_table(db());
    $comboRows = db()->query(
        "SELECT * FROM combo_offers WHERE status = 'published' ORDER BY sort_order ASC, id DESC"
    )->fetchAll();
    $comboLive = array_filter(combos_attach_products(db(), $comboRows), static function ($c) {
        return $c['itemCount'] > 0;
    });
    if ($comboLive) {
        $newest = null;
        foreach ($comboLive as $c) {
            if ($c['updatedAt'] && (!$newest || $c['updatedAt'] > $newest)) $newest = $c['updatedAt'];
        }
        $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/combos', $newest, 'weekly', '0.7');
        // Each combo's own page. These are where the descriptive copy and the
        // outbound product links live, so they are the ones worth crawling.
        foreach ($comboLive as $c) {
            $xml .= velorex_sitemap_url(
                VELOREX_SITE_URL . '/combos/' . $c['slug'],
                $c['updatedAt'],
                'weekly',
                '0.6'
            );
        }
    }
} catch (Throwable $e) {
    error_log('[sitemap] combos query failed: ' . $e->getMessage());
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

// ---- Composer collections ---------------------------------------------------
// Only the curated composers, and only while they meet the product threshold
// that makes the page indexable (collections_artist_status()).
try {
    require_once __DIR__ . '/api/_collections_helpers.php';
    foreach (velorex_artist_collections() as $aslug => $a) {
        if (collections_artist_status(db(), $aslug) !== 'index') continue;
        $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/artists/' . $aslug, $lastmodByCat['vinyl'] ?? null, 'weekly', '0.8');
    }
} catch (Throwable $e) {
    error_log('[sitemap] artist collections failed: ' . $e->getMessage());
}

// ---- The Evolution of Music & Audio -----------------------------------------
// Editorial content that ships with the code, so there is nothing to query and
// nothing that can be a draft — every article listed here exists as long as the
// file does. No lastmod: the honest value is the deploy date, and inventing a
// fresher one to look active is the kind of signal that stops being believed.
//
// Every URL in velorex_history_order() is listed, including the two topics
// (vinyl, mp3) that have no card on the hub — they are reachable from their
// era panel and from the prev/next chain, and an article worth writing is an
// article worth indexing.
try {
    require_once __DIR__ . '/src/history/history-lib.php';
    $xml .= velorex_sitemap_url(VELOREX_SITE_URL . '/music-history', null, 'monthly', '0.7');
    foreach (velorex_history_order() as $slug) {
        if (!velorex_history_article($slug)) continue;
        $xml .= velorex_sitemap_url(
            VELOREX_SITE_URL . '/music-history/' . $slug,
            null,
            'monthly',
            '0.6'
        );
    }
} catch (Throwable $e) {
    error_log('[sitemap] music history failed: ' . $e->getMessage());
}

// ---- Static information pages ----------------------------------------------
// Lower priority: useful for trust and long-tail policy queries ("velorex
// music return policy"), but never the pages we want ranking for head terms.
foreach ([
    '/contact.html'  => '0.5',
    '/faq.html'      => '0.5',
    '/shipping.html' => '0.4',
    '/returns.html'  => '0.4',
    '/terms.html'    => '0.3',
    '/privacy.html'  => '0.3',
] as $path => $priority) {
    $xml .= velorex_sitemap_url(VELOREX_SITE_URL . $path, null, 'monthly', $priority);
}

$xml .= '</urlset>' . "\n";

echo $xml;
