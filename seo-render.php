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

    // Only name item_condition in the SELECT when the column exists (the helper
    // adds it on first call). If that ALTER ever failed, degrade to the old
    // column list rather than 500-ing a public category page.
    $condCol = products_has_condition_column(db()) ? 'item_condition, ' : '';

    try {
        if ($isAll) {
            $stmt = db()->query(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, ' . $condCol . 'music_director FROM products ORDER BY id DESC'
            );
            $rows = $stmt->fetchAll();
        } elseif ($langSlug !== null) {
            $stmt = db()->prepare(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, ' . $condCol . 'music_director FROM products '
              . 'WHERE category = :c AND language = :l ORDER BY id DESC'
            );
            $stmt->execute([':c' => $meta['key'], ':l' => $langSlug]);
            $rows = $stmt->fetchAll();
        } else {
            $stmt = db()->prepare(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, ' . $condCol . 'music_director FROM products '
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

// -----------------------------------------------------------------------------
// Route: pre-owned listing, optionally narrowed to one format
// -----------------------------------------------------------------------------
if ($route === 'preowned') {
    $cats    = velorex_categories();
    $catSlug = isset($_GET['cat']) && $_GET['cat'] !== '' ? (string)$_GET['cat'] : null;
    if ($catSlug !== null && !isset($cats[$catSlug])) velorex_send_404('Page not found');

    $condCol = products_has_condition_column(db());
    if (!$condCol) {
        // Column missing (the ALTER failed) — there can be no pre-owned stock,
        // so render the empty state rather than a SQL error.
        $rows = [];
    } else {
        try {
            $sql = 'SELECT id, title, artist, category, language, price, original_price, image, '
                 . 'rating, reviews, badge, stock, item_condition, music_director FROM products '
                 . "WHERE item_condition = 'pre-owned'"
                 . ($catSlug ? ' AND category = :c' : '')
                 . ' ORDER BY id DESC';
            $stmt = db()->prepare($sql);
            $stmt->execute($catSlug ? [':c' => $cats[$catSlug]['key']] : []);
            $rows = $stmt->fetchAll();
        } catch (Throwable $e) {
            error_log('[seo-render] pre-owned query failed: ' . $e->getMessage());
            $rows = [];
        }
    }

    $products = array_map('row_to_product_lean', $rows);
    $count = count($products);
    $label = $catSlug ? $cats[$catSlug]['label'] : null;

    $canonical = VELOREX_SITE_URL . '/pre-owned' . ($catSlug ? '/' . $catSlug : '');
    $h1 = $label ? 'Pre-owned ' . $label : 'Pre-owned';
    $title = $label
        ? 'Pre-owned ' . $label . ' | Buy Used ' . $label . ' Online India'
        : 'Pre-owned Vinyl, CDs & Cassettes | Buy Used Records India';
    $desc = $label
        ? 'Shop pre-owned ' . strtolower($label) . ' in India at Velorex Music. Second-hand and collector copies, condition-checked before dispatch, with pan-India delivery.'
        : 'Shop pre-owned vinyl records, audio CDs, cassettes, Blu-rays and DVDs in India. Second-hand and collector copies, condition-checked before dispatch.';

    // Empty listings stay out of the index — see the category route for why.
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
    if ($count) $head .= velorex_jsonld_item_list($products, $h1, $canonical);
    $trail = [['name' => 'Home', 'url' => VELOREX_SITE_URL . '/']];
    if ($label) {
        $trail[] = ['name' => 'Pre-owned', 'url' => VELOREX_SITE_URL . '/pre-owned'];
        $trail[] = ['name' => $label];
    } else {
        $trail[] = ['name' => 'Pre-owned'];
    }
    $head .= velorex_jsonld_breadcrumbs($trail);

    $cards = $count
        ? implode('', array_map('velorex_render_card', $products))
        : '<p style="grid-column:1/-1;padding:2.5rem 1rem;text-align:center;color:var(--text-muted);">'
          . 'No pre-owned stock in this format right now. <a href="/products">Browse everything</a>.</p>';

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-preowned');
    $html = velorex_set_text($html, '<h1 class="page-hero-title" id="preowned-title">', 'h1', velorex_e($h1));
    $html = velorex_set_text($html, '<p class="products-count" id="preowned-count">', 'p',
        $count ? 'Showing ' . $count . ' pre-owned ' . ($count === 1 ? 'item' : 'items') : '');
    $html = velorex_set_div_inner($html, '<div class="products-grid" id="preowned-grid">', $cards);
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: blog listing and single post
// -----------------------------------------------------------------------------
if ($route === 'blog' || $route === 'blogpost') {
    require_once __DIR__ . '/api/_blog_helpers.php';
    try {
        blog_ensure_table(db());
    } catch (Throwable $e) {
        error_log('[seo-render] blog table bootstrap failed: ' . $e->getMessage());
    }

    // ---- single post ----
    if ($route === 'blogpost') {
        $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
        if ($slug === '') velorex_send_404('Post not found');
        try {
            $st = db()->prepare("SELECT * FROM blog_posts WHERE slug = :s AND status = 'published' LIMIT 1");
            $st->execute([':s' => $slug]);
            $post = $st->fetch();
        } catch (Throwable $e) {
            error_log('[seo-render] blog post query failed: ' . $e->getMessage());
            $post = false;
        }
        if (!$post) velorex_send_404('Post not found');

        $canonical = VELOREX_SITE_URL . '/blog/' . $post['slug'];
        $desc = $post['excerpt'] ?: blog_auto_excerpt($post['content']);

        $head  = velorex_meta_block([
            'title'       => $post['title'] . ' | Velorex Journal',
            'description' => $desc,
            'canonical'   => $canonical,
            'image'       => $post['cover_image'] ? velorex_absolute_image($post['cover_image']) : VELOREX_DEFAULT_OG_IMAGE,
            'imageAlt'    => $post['title'],
            'type'        => 'article',
        ]);
        $head .= velorex_jsonld_site();
        $head .= velorex_jsonld_article($post);
        $head .= velorex_jsonld_breadcrumbs([
            ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
            ['name' => 'Blog', 'url' => VELOREX_SITE_URL . '/blog'],
            ['name' => $post['title']],
        ]);

        $meta = [];
        if ($post['published_at']) {
            $ts = strtotime($post['published_at']);
            if ($ts) $meta[] = date('j F Y', $ts);
        }
        if ($post['author']) $meta[] = velorex_e($post['author']);
        $meta[] = blog_read_minutes($post['content']) . ' min read';

        $cover = $post['cover_image']
            ? '<div class="blog-post-cover"><img src="' . velorex_e(velorex_absolute_image($post['cover_image']))
              . '" alt="' . velorex_e($post['title']) . '" fetchpriority="high" decoding="async"></div>'
            : '';

        // The body is emitted RAW. It is safe because blog_sanitize_html()
        // ran against a tag allowlist before this ever reached the database —
        // escaping it here would print the markup as visible text instead.
        $inner = '<article class="blog-post">'
            . $cover
            . '<div class="blog-post-meta">' . implode(' · ', $meta) . '</div>'
            . '<div class="blog-post-body">' . $post['content'] . '</div>'
            . '<div class="blog-post-footer">'
            . '<a href="/blog" class="btn btn-secondary">← All posts</a>'
            . '<a href="/products" class="btn btn-primary">Browse the shop</a>'
            . '</div></article>';

        $html = velorex_shell();
        $html = velorex_inject_head($html, $head);
        $html = velorex_show_section($html, 'page-blog-post');
        $html = velorex_set_text($html, '<h1 class="page-hero-title" id="blog-post-title">', 'h1', velorex_e($post['title']));
        $html = velorex_set_div_inner($html, '<div id="blog-post-container">', $inner);
        echo $html;
        exit;
    }

    // ---- listing ----
    try {
        $rows = db()->query(
            "SELECT id, slug, title, excerpt, cover_image, author, published_at
               FROM blog_posts WHERE status = 'published'
              ORDER BY published_at DESC, id DESC"
        )->fetchAll();
    } catch (Throwable $e) {
        error_log('[seo-render] blog list query failed: ' . $e->getMessage());
        $rows = [];
    }

    $canonical = VELOREX_SITE_URL . '/blog';
    // An empty blog is a thin page — crawlable so link equity still flows, but
    // not indexable until there is something worth ranking.
    $robots = $rows
        ? 'index, follow, max-image-preview:large, max-snippet:-1'
        : 'noindex, follow';

    $head  = velorex_meta_block([
        'title'       => 'Velorex Journal | Vinyl, Hindi Film Music & Collecting',
        'description' => 'Notes on vinyl records, Hindi film music and the pressings worth collecting — from the Velorex Music team in India.',
        'canonical'   => $canonical,
        'image'       => $rows && $rows[0]['cover_image']
            ? velorex_absolute_image($rows[0]['cover_image']) : VELOREX_DEFAULT_OG_IMAGE,
        'robots'      => $robots,
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_breadcrumbs([
        ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Blog'],
    ]);
    if ($rows) {
        $items = [];
        $pos = 1;
        foreach ($rows as $r) {
            $items[] = ['@type' => 'ListItem', 'position' => $pos++,
                        'url' => VELOREX_SITE_URL . '/blog/' . $r['slug'], 'name' => $r['title']];
        }
        $head .= velorex_jsonld([
            '@context' => 'https://schema.org', '@type' => 'Blog',
            '@id' => $canonical . '#blog', 'url' => $canonical,
            'name' => 'Velorex Journal',
            'publisher' => ['@id' => VELOREX_SITE_URL . '/#organization'],
            'blogPost' => $items,
        ]);
    }

    $cards = '';
    foreach ($rows as $r) {
        $href = '/blog/' . $r['slug'];
        $img = $r['cover_image']
            ? '<img src="' . velorex_e(velorex_absolute_image($r['cover_image'])) . '" alt="'
              . velorex_e($r['title']) . '" loading="lazy" decoding="async">'
            : '<div class="blog-card-noimg">♪</div>';
        $date = '';
        if ($r['published_at']) {
            $ts = strtotime($r['published_at']);
            if ($ts) $date = '<div class="blog-card-date">' . date('j F Y', $ts) . '</div>';
        }
        $cards .= '<article class="blog-card">'
            . '<a class="blog-card-media" href="' . velorex_e($href) . '">' . $img . '</a>'
            . '<div class="blog-card-body">' . $date
            . '<h2 class="blog-card-title"><a href="' . velorex_e($href) . '">' . velorex_e($r['title']) . '</a></h2>'
            . ($r['excerpt'] ? '<p class="blog-card-excerpt">' . velorex_e($r['excerpt']) . '</p>' : '')
            . '<a class="blog-card-more" href="' . velorex_e($href) . '">Read more →</a>'
            . '</div></article>';
    }
    if (!$cards) {
        $cards = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem 1rem;">'
               . '<p>No posts published yet. Check back soon.</p></div>';
    }

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-blog');
    $html = velorex_set_div_inner($html, '<div class="blog-grid" id="blog-grid">', $cards);
    echo $html;
    exit;
}

// Unknown _route — someone hit seo-render.php directly.
velorex_send_404('Page not found');
