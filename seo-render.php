<?php
// =============================================================================
// Velorex Music — server-side renderer for crawlable catalogue URLs
//
// WHY THIS EXISTS
// ---------------
// The storefront is a hash-routed SPA. Everything after "#" is never sent to
// the server, so before this file existed Google saw the entire catalogue as
// a single URL (velorexmusic.com/) — no product or category could rank.
//
// This front controller serves the SAME index.html shell, but with:
//   • a per-page <title>, meta description and canonical
//   • Open Graph / Twitter tags so shared links render a card
//   • Product / ItemList / BreadcrumbList JSON-LD for rich results
//   • real, server-rendered content inside the target page-section, so a
//     crawler that never executes JavaScript still sees the product name,
//     price, availability and description
//
// The SPA then boots normally and takes over — the server-rendered block is
// replaced in place by renderProductDetail(). Users get a faster first paint
// as a side effect; crawlers get something to index.
//
// ROUTING
// -------
// .htaccess rewrites pretty URLs onto this file:
//   /product/12-sholay-rd-burman  → ?_route=product&id=12
//   /vinyl-records                → ?_route=category&cat=vinyl-records
//   /vinyl-records/hindi          → ?_route=category&cat=vinyl-records&lang=hindi
//   /products                     → ?_route=products
//
// If the marker strings this file patches are ever renamed in index.html, the
// injection silently no-ops and the page still works as a normal SPA — the
// page degrades to "indexable but generic", never to "broken".
// =============================================================================

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/_products_helpers.php';
require_once __DIR__ . '/src/seo/seo-lib.php';

// api/config.php sets JSON + no-store headers for the API. We are serving HTML
// that we WANT edge/browser caches to hold briefly, so override both.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=300, stale-while-revalidate=86400');
header_remove('Pragma');
header_remove('Expires');

$route = $_GET['_route'] ?? '';

// -----------------------------------------------------------------------------
// Shell loading + injection helpers
// -----------------------------------------------------------------------------

function velorex_shell(): string {
    $html = @file_get_contents(__DIR__ . '/index.html');
    if ($html === false) {
        http_response_code(500);
        exit('Storefront shell missing.');
    }
    // index.html references its assets relatively ("src/js/...") because it is
    // normally served from the domain root. These pages are served from a
    // nested path (/product/12-x), where a relative ref would resolve to
    // /product/src/js/... and 404. Rewrite to root-absolute.
    $html = preg_replace('#(\s(?:src|href)=")(src/)#', '$1/$2', $html);
    return $html;
}

// Insert a block immediately before </head>.
function velorex_inject_head(string $html, string $block): string {
    $pos = stripos($html, '</head>');
    if ($pos === false) return $html;
    return substr($html, 0, $pos) . $block . substr($html, $pos);
}

// Reveal a .page-section server-side. Without this the crawler receives a
// visually empty document, because .page-section defaults to display:none and
// only the router reveals the active one.
function velorex_show_section(string $html, string $sectionId): string {
    $needle = '<div id="' . $sectionId . '" class="page-section">';
    $replacement = '<div id="' . $sectionId . '" class="page-section" style="display:block">';
    return str_replace($needle, $replacement, $html);
}

// Swap the inner HTML of a <div> identified by its exact opening tag.
//
// The placeholders we target ("#products-grid", "#product-detail-container")
// contain a nested <div class="loading-spinner">, so naively cutting at the
// first "</div>" would leave an orphaned closing tag and corrupt the document.
// This walks forward tracking nesting depth to find the genuinely matching
// close. Returns the input untouched if the marker is absent or the markup is
// unbalanced — a missed injection degrades the page to a plain SPA render,
// which is far better than emitting broken HTML.
function velorex_set_div_inner(string $html, string $openTag, string $inner): string {
    $start = strpos($html, $openTag);
    if ($start === false) return $html;
    $from  = $start + strlen($openTag);
    $len   = strlen($html);
    $depth = 1;
    $i     = $from;

    while ($i < $len && $depth > 0) {
        $nextOpen  = strpos($html, '<div', $i);
        $nextClose = strpos($html, '</div>', $i);
        if ($nextClose === false) return $html; // unbalanced — bail out safely
        if ($nextOpen !== false && $nextOpen < $nextClose) {
            $depth++;
            $i = $nextOpen + 4;
            continue;
        }
        $depth--;
        if ($depth === 0) {
            return substr($html, 0, $from) . $inner . substr($html, $nextClose);
        }
        $i = $nextClose + 6;
    }
    return $html;
}

// Replace the text content of a uniquely-identified, non-nesting element
// (an <h1> or <p> that only ever holds plain text). $extra is appended AFTER
// the closing tag, which is how the category intro copy gets placed directly
// below the page heading.
function velorex_set_text(string $html, string $openTag, string $tagName, string $text, string $extra = ''): string {
    $pattern = '#(' . preg_quote($openTag, '#') . ').*?(</' . preg_quote($tagName, '#') . '>)#s';
    $result = preg_replace_callback(
        $pattern,
        static fn(array $m): string => $m[1] . $text . $m[2] . $extra,
        $html,
        1
    );
    return $result ?? $html;
}

function velorex_send_404(string $message): void {
    http_response_code(404);
    header('Cache-Control: no-store');
    $html = velorex_shell();
    $html = velorex_inject_head($html, velorex_meta_block([
        'title'       => 'Page not found | ' . VELOREX_SITE_NAME,
        'description' => 'The page you are looking for is no longer available. Browse our vinyl records, CDs and cassettes instead.',
        'canonical'   => VELOREX_SITE_URL . '/products',
        'robots'      => 'noindex, follow',
    ]));
    $html = velorex_show_section($html, 'page-products');
    $html = velorex_set_div_inner(
        $html,
        '<div class="products-grid" id="products-grid">',
        '<div style="padding:3rem 1rem;text-align:center;color:var(--text-muted);">'
            . '<h2 style="margin-bottom:0.75rem;">' . velorex_e($message) . '</h2>'
            . '<p>Try browsing <a href="/vinyl-records">vinyl records</a>, '
            . '<a href="/audio-cds">audio CDs</a> or <a href="/cassettes">cassettes</a>.</p></div>'
    );
    echo $html;
    exit;
}

// Render one product card. Mirrors the markup createProductCard() produces in
// src/js/storefront/pages.js closely enough that the swap is visually seamless,
// but uses a real <a href> so crawlers can follow it into the product page.
function velorex_render_card(array $p): string {
    $url   = velorex_product_path($p);
    $img   = velorex_absolute_image($p['image'] ?? '');
    $price = number_format((int)($p['price'] ?? 0));
    $orig  = !empty($p['originalPrice']) && (int)$p['originalPrice'] > (int)$p['price']
        ? '<span class="product-original-price">₹' . number_format((int)$p['originalPrice']) . '</span>'
        : '';
    return '<div class="product-card">'
        . '<a href="' . velorex_e($url) . '" class="product-image-wrap">'
        . '<img src="' . velorex_e($img) . '" alt="' . velorex_e(($p['title'] ?? '') . ' — ' . ($p['artist'] ?? '')) . '" loading="lazy" decoding="async">'
        . '</a>'
        . '<div class="product-info">'
        . '<a href="' . velorex_e($url) . '"><h3 class="product-title">' . velorex_e($p['title'] ?? '') . '</h3></a>'
        . '<p class="product-artist">' . velorex_e($p['artist'] ?? '') . '</p>'
        . '<div class="product-price-row"><span class="product-price">₹' . $price . '</span>' . $orig . '</div>'
        . '</div></div>';
}

// -----------------------------------------------------------------------------
// Route: single product
// -----------------------------------------------------------------------------
if ($route === 'product') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) velorex_send_404('Product not found');

    try {
        $stmt = db()->prepare('SELECT * FROM products WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        error_log('[seo-render] product query failed for id=' . $id . ': ' . $e->getMessage());
        $row = false;
    }
    if (!$row) velorex_send_404('Product not found');

    $p = row_to_product($row);

    // Canonical slug enforcement. A product renamed after its URL was shared
    // (or a hand-typed /product/12-anything) 301s to the current canonical
    // path, so link equity consolidates on exactly one URL per product.
    $canonicalPath = velorex_product_path($p);
    $requestPath   = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    if ($requestPath !== '' && rtrim($requestPath, '/') !== $canonicalPath) {
        header('Location: ' . $canonicalPath, true, 301);
        exit;
    }

    $catLabel  = velorex_category_label_for_key($p['category'] ?? '');
    $catSlug   = velorex_category_slug_for_key($p['category'] ?? '');
    $inStock   = (int)($p['stock'] ?? 0) > 0;
    $priceFmt  = number_format((int)$p['price']);

    // Title formula: <Product> — <Artist> | <Format> | Buy Online India
    // Keeps the primary entity first (what people search) and the commercial
    // qualifier last, inside the ~60 char window Google renders.
    $title = $p['title'] . ' — ' . $p['artist'] . ' | ' . $catLabel . ' | Buy Online India';

    // Prefer the real description; fall back to a generated one so no product
    // ever ships with an empty meta description.
    $descSource = trim((string)($p['description'] ?? ''));
    if ($descSource === '') {
        $descSource = 'Buy ' . $p['title'] . ' by ' . $p['artist'] . ' on ' . $catLabel
            . ' at Velorex Music. ₹' . $priceFmt . '. '
            . ($inStock ? 'In stock and ready to ship across India.' : 'Available to pre-order.')
            . ' Free shipping over ₹5,000.';
    } else {
        $descSource = '₹' . $priceFmt . ' · ' . $descSource;
    }

    $head  = velorex_meta_block([
        'title'        => $title,
        'description'  => $descSource,
        'canonical'    => VELOREX_SITE_URL . $canonicalPath,
        'image'        => velorex_absolute_image($p['image'] ?? ''),
        'imageAlt'     => $p['title'] . ' — ' . $p['artist'],
        'type'         => 'product',
        'price'        => (int)$p['price'],
        'availability' => $inStock ? 'in stock' : 'preorder',
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_product($p);

    $trail = [['name' => 'Home', 'url' => VELOREX_SITE_URL . '/']];
    if ($catSlug) {
        $trail[] = ['name' => $catLabel, 'url' => velorex_category_url($catSlug)];
    }
    $trail[] = ['name' => $p['title']];
    $head .= velorex_jsonld_breadcrumbs($trail);

    // ---- Server-rendered body content -------------------------------------
    $gallery = !empty($p['images']) && is_array($p['images']) ? $p['images'] : [];
    if (!$gallery && !empty($p['image'])) $gallery = [$p['image']];
    $primary = velorex_absolute_image($gallery[0] ?? '');

    $specsHtml = '';
    if (!empty($p['specs']) && is_array($p['specs'])) {
        $rows = '';
        foreach (['format' => 'Format', 'speed' => 'Speed', 'label' => 'Label', 'year' => 'Year', 'tracks' => 'Tracks', 'genre' => 'Genre'] as $k => $labelText) {
            if (!empty($p['specs'][$k])) {
                $rows .= '<li><strong>' . velorex_e($labelText) . ':</strong> ' . velorex_e((string)$p['specs'][$k]) . '</li>';
            }
        }
        if ($rows !== '') {
            $specsHtml = '<div class="product-detail-specs"><h2 class="specs-title">Specifications</h2><ul>' . $rows . '</ul></div>';
        }
    }

    $mdHtml = !empty($p['musicDirector'])
        ? '<p class="product-detail-subtitle">Music by <strong>' . velorex_e($p['musicDirector']) . '</strong></p>'
        : '';

    $inner = '<div class="product-detail">'
        . '<div class="product-detail-gallery">'
        . '<div class="product-detail-main-image">'
        . '<img src="' . velorex_e($primary) . '" alt="' . velorex_e($p['title'] . ' — ' . $p['artist'] . ' ' . $catLabel) . '" fetchpriority="high" decoding="async">'
        . '</div></div>'
        . '<div class="product-detail-info">'
        . '<h1 class="product-detail-title">' . velorex_e($p['title']) . '</h1>'
        . '<p class="product-detail-subtitle">by <strong>' . velorex_e($p['artist']) . '</strong></p>'
        . $mdHtml
        . '<div class="product-detail-price-block">'
        . '<div class="product-detail-price-meta"><span class="product-detail-price">₹' . $priceFmt . '</span></div>'
        . '<div class="product-detail-availability">'
        . ($inStock ? 'In stock: ' . (int)$p['stock'] . ' units' : 'Pre-order available')
        . '</div></div>'
        . '<p class="product-detail-desc">' . velorex_e($p['description'] ?? '') . '</p>'
        . $specsHtml
        . '</div></div>';

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-product');
    $html = velorex_set_text(
        $html,
        '<h1 class="page-hero-title" id="detail-title">',
        'h1',
        velorex_e($p['title'])
    );
    $html = velorex_set_div_inner($html, '<div id="product-detail-container">', $inner);
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: category listing (optionally filtered by language) and /products
// -----------------------------------------------------------------------------
if ($route === 'category' || $route === 'products') {
    $cats     = velorex_categories();
    $langs    = velorex_languages();
    $catSlug  = isset($_GET['cat']) ? (string)$_GET['cat'] : '';
    $langSlug = isset($_GET['lang']) && $_GET['lang'] !== '' ? (string)$_GET['lang'] : null;

    if ($route === 'category' && !isset($cats[$catSlug])) velorex_send_404('Category not found');
    if ($langSlug !== null && !isset($langs[$langSlug]))   velorex_send_404('Page not found');

    $isAll = ($route === 'products');
    $meta  = $isAll ? null : $cats[$catSlug];

    try {
        if ($isAll) {
            $stmt = db()->query(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, music_director FROM products ORDER BY id DESC'
            );
            $rows = $stmt->fetchAll();
        } elseif ($langSlug !== null) {
            $stmt = db()->prepare(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, music_director FROM products '
              . 'WHERE category = :c AND language = :l ORDER BY id DESC'
            );
            $stmt->execute([':c' => $meta['key'], ':l' => $langSlug]);
            $rows = $stmt->fetchAll();
        } else {
            $stmt = db()->prepare(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, music_director FROM products '
              . 'WHERE category = :c ORDER BY id DESC'
            );
            $stmt->execute([':c' => $meta['key']]);
            $rows = $stmt->fetchAll();
        }
    } catch (Throwable $e) {
        error_log('[seo-render] category query failed: ' . $e->getMessage());
        $rows = [];
    }

    $products = array_map('row_to_product_lean', $rows);
    $count    = count($products);

    if ($isAll) {
        $canonical = VELOREX_SITE_URL . '/products';
        $h1        = 'All Products';
        $title     = 'Buy Vinyl Records, CDs & Cassettes Online India | ' . VELOREX_SITE_NAME;
        $desc      = 'Browse ' . ($count ?: '') . ' original vinyl records, audio CDs, cassettes, Blu-rays and DVDs at Velorex Music. Hindi film soundtracks, English albums and rare collector pressings shipped across India.';
        $intro     = 'Our full catalogue of vinyl records, audio CDs, cassettes, Blu-rays and DVDs — Hindi and English titles, from current pressings to out-of-print collector items.';
    } else {
        $canonical = velorex_category_url($catSlug, $langSlug);
        $h1        = $meta['label'];
        $title     = $meta['title'];
        $desc      = $meta['description'];
        $intro     = $meta['intro'];
        if ($langSlug !== null) {
            $langLabel = $langs[$langSlug]['adjective'];
            $h1    = $langLabel . ' ' . $meta['label'];
            $title = 'Buy ' . $langLabel . ' ' . $meta['label'] . ' Online India | ' . VELOREX_SITE_NAME;
            $desc  = 'Shop ' . strtolower($langLabel) . ' ' . strtolower($meta['label'])
                   . ' online in India at Velorex Music. Original pressings, collector titles and current releases with pan-India delivery and free shipping over ₹5,000.';
            $intro = $langLabel . ' titles from our ' . strtolower($meta['label']) . ' collection, shipped across India.';
        }
    }

    // An empty listing must not be indexed — a thin page with no products is a
    // quality signal against the whole domain. It stays crawlable (follow) so
    // link equity still flows to the categories that do have stock.
    $robots = $count > 0
        ? 'index, follow, max-image-preview:large, max-snippet:-1'
        : 'noindex, follow';

    $head  = velorex_meta_block([
        'title'       => $title,
        'description' => $desc,
        'canonical'   => $canonical,
        'image'       => $count ? velorex_absolute_image($products[0]['image'] ?? '') : VELOREX_DEFAULT_OG_IMAGE,
        'imageAlt'    => $h1,
        'robots'      => $robots,
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_local_business();
    if ($count) $head .= velorex_jsonld_item_list($products, $h1, $canonical);

    $trail = [['name' => 'Home', 'url' => VELOREX_SITE_URL . '/']];
    if ($isAll) {
        $trail[] = ['name' => 'All Products'];
    } else {
        if ($langSlug !== null) {
            $trail[] = ['name' => $meta['label'], 'url' => velorex_category_url($catSlug)];
            $trail[] = ['name' => $langs[$langSlug]['adjective']];
        } else {
            $trail[] = ['name' => $meta['label']];
        }
    }
    $head .= velorex_jsonld_breadcrumbs($trail);

    $cardsHtml = $count
        ? implode('', array_map('velorex_render_card', $products))
        : '<p style="padding:2rem;color:var(--text-muted);">No products in this collection right now. '
          . '<a href="/products">Browse everything</a>.</p>';

    // Intro copy gives the category page unique indexable text. Without it a
    // listing page is just a grid of links, which competes poorly.
    $introHtml = '<p class="seo-intro" style="max-width:70ch;margin:0 auto 1.5rem;color:var(--text-muted);line-height:1.7;">'
        . velorex_e($intro) . '</p>';

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-products');
    // Heading + the unique intro copy that follows it, in one pass.
    $html = velorex_set_text(
        $html,
        '<h1 class="page-hero-title" id="page-title">',
        'h1',
        velorex_e($h1),
        $introHtml
    );
    $html = velorex_set_text(
        $html,
        '<p class="products-count" id="products-count">',
        'p',
        'Showing ' . $count . ' ' . ($count === 1 ? 'product' : 'products')
    );
    $html = velorex_set_div_inner($html, '<div class="products-grid" id="products-grid">', $cardsHtml);
    echo $html;
    exit;
}

// Unknown _route — someone hit seo-render.php directly.
velorex_send_404('Page not found');
