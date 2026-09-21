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
require_once __DIR__ . '/api/_collections_helpers.php';

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

    // index.html ships the homepage section VISIBLE, so "/" paints its content
    // before the (deferred) scripts run instead of an empty shell that then
    // jumps into place. Every route rendered here shows a different section,
    // so the homepage one is hidden again first.
    $html = str_replace('<div id="page-index" class="page-section" style="display:block">',
                        '<div id="page-index" class="page-section">', $html);

    // Drop the shell's own SEO tags. Every route below injects its own
    // title/description/canonical/OG/Twitter set plus Organization+WebSite
    // JSON-LD, and injection alone left BOTH copies in the document — with the
    // homepage's copy first, because it is higher up the file. Google discards
    // a page's canonical entirely when it finds more than one, and a crawler
    // that does not execute JavaScript read the homepage's <title> on every
    // product page. src/js/seo.js did repair it after hydration, which is
    // exactly why this went unnoticed; server-rendered HTML has to be correct
    // before any script runs.
    //
    // The homepage is unaffected: "/" is served as static index.html by
    // .htaccess and never reaches this file, so it keeps this one correct set.
    return velorex_strip_shell_seo($html); // src/seo/seo-lib.php
}
// Insert a block immediately before </head>.
// Also draws the visible breadcrumb bar from the trail the page just declared
// in BreadcrumbList JSON-LD (velorex_last_trail()), so every route gets it
// without repeating the call.
function velorex_inject_head(string $html, string $block): string {
    $pos = stripos($html, '</head>');
    if ($pos === false) return $html;
    $html = substr($html, 0, $pos) . $block . substr($html, $pos);
    $trail = velorex_last_trail();
    return $trail ? velorex_inject_breadcrumbs($html, $trail) : $html;
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

// Fill the visible breadcrumb bar. It is otherwise drawn only by router.js, so a
// crawler that does not run JavaScript saw BreadcrumbList JSON-LD with no
// matching trail on the page — Google cross-checks the two.
function velorex_inject_breadcrumbs(string $html, array $trail): string {
    return str_replace(
        '<ul class="breadcrumbs" id="breadcrumb-list"></ul>',
        '<ul class="breadcrumbs" id="breadcrumb-list">' . velorex_breadcrumbs_html($trail) . '</ul>',
        $html
    );
}

// A real 404. Served for unknown products/categories/posts AND, via
// ErrorDocument in .htaccess, for any URL nothing else claims — which used to
// get the host's unbranded error page. The status is always 404, never 200.
function velorex_send_404(string $message): void {
    http_response_code(404);
    header('Cache-Control: no-store');

    // A missing image or script must not cost a full storefront page (and a
    // database connection) — browsers and crawlers only need the status.
    $reqPath = (string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?? '');
    if (preg_match('/\.(?:jpe?g|png|gif|webp|avif|svg|ico|css|js|map|woff2?|ttf|json|xml|txt|pdf|mp3|mp4)$/i', $reqPath)) {
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $html = velorex_shell();
    // No canonical: a 404 is not a page, and pointing it at /products told
    // Google two unrelated URLs were the same document. velorex-404 tells the
    // SPA to keep this view instead of routing the unknown path to the homepage.
    $head = velorex_meta_block([
        'title'       => 'Page not found | ' . VELOREX_SITE_NAME,
        'description' => 'The page you are looking for is no longer available. Browse our vinyl records and cassettes instead.',
        'canonical'   => '',
        'robots'      => 'noindex, follow',
    ]);
    $head = preg_replace('#\s*<link rel="canonical" href="">|\s*<meta property="og:url" content="">#', '', $head) ?? $head;
    $head .= "  <meta name=\"velorex-404\" content=\"1\">\n";
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-not-found');
    $html = velorex_set_text($html, '<h1 class="page-hero-title" id="not-found-title">', 'h1', velorex_e($message));
    $html = velorex_inject_breadcrumbs($html, [
        ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Page not found'],
    ]);
    echo $html;
    exit;
}

// Render one product card. Mirrors the markup createProductCard() produces in
// src/js/storefront/pages.js closely enough that the swap is visually seamless,
// but uses a real <a href> so crawlers can follow it into the product page.
function velorex_render_card(array $p): string {
    $url   = velorex_product_path($p);
    $img   = velorex_absolute_image($p['image'] ?? '');
    // No photo on file: the same neutral placeholder the SPA shows, with an
    // EMPTY alt — the title sits right beside it, and alt text naming the
    // record on a stock photo would describe an image that is not the record.
    $hasImg = $img !== VELOREX_DEFAULT_OG_IMAGE;
    if (!$hasImg) $img = VELOREX_PLACEHOLDER_IMAGE;
    $price = number_format((int)($p['price'] ?? 0));
    $orig  = !empty($p['originalPrice']) && (int)$p['originalPrice'] > (int)$p['price']
        ? '<span class="product-original-price">₹' . number_format((int)$p['originalPrice']) . '</span>'
        : '';
    return '<div class="product-card">'
        . '<a href="' . velorex_e($url) . '" class="product-image-wrap">'
        . '<img src="' . velorex_e($img) . '" alt="' . ($hasImg ? velorex_e(velorex_product_image_alt($p)) : '') . '" loading="lazy" decoding="async">'
        . '</a>'
        . '<div class="product-info">'
        . '<a href="' . velorex_e($url) . '"><h3 class="product-title">' . velorex_e($p['title'] ?? '') . '</h3></a>'
        . '<p class="product-artist">' . velorex_e($p['artist'] ?? '') . '</p>'
        . '<div class="product-price-row"><span class="product-price">₹' . $price . '</span>' . $orig . '</div>'
        . '</div></div>';
}

// Under a Journal post: the records it discusses (as cards), then the
// collections and other posts. MIRRORED by postRelatedHtml() in
// src/js/storefront/collections.js.
function velorex_post_related_html(array $rel): string {
    $out = '';
    if (!empty($rel['products'])) {
        $out .= '<section class="post-related-products"><h2 class="collection-links-title">Records in this article</h2>'
              . '<div class="products-grid">' . implode('', array_map('velorex_render_card', $rel['products'])) . '</div></section>';
    }
    $out .= collections_related_html(['collections' => $rel['collections'], 'journal' => $rel['journal']], 'Keep exploring');
    return $out;
}

// Banner heading with its accented half. MUST match heroTitleHtml() in
// src/js/storefront/pages.js, or the heading re-colours itself the moment the
// SPA boots over this render. Returns HTML (escaped).
function velorex_banner_title_html(string $text, bool $accentLead = false): string {
    $t  = trim($text);
    $sp = mb_strpos($t, ' ');
    if ($accentLead && $sp !== false && $sp > 0) {
        return '<span>' . velorex_e(mb_substr($t, 0, $sp)) . '</span>' . velorex_e(mb_substr($t, $sp));
    }
    $lastSp = mb_strrpos($t, ' ');
    if ($lastSp !== false && $lastSp > 0) {
        return velorex_e(mb_substr($t, 0, $lastSp + 1)) . '<span>' . velorex_e(mb_substr($t, $lastSp + 1)) . '</span>';
    }
    $len = mb_strlen($t);
    $hy  = mb_strrpos($t, '-');
    if ($hy !== false && $hy > 0 && $hy < $len - 1) {
        return velorex_e(mb_substr($t, 0, $hy + 1)) . '<span>' . velorex_e(mb_substr($t, $hy + 1)) . '</span>';
    }
    if ($len >= 8) {
        $half = intdiv($len, 2);
        return velorex_e(mb_substr($t, 0, $half)) . '<span>' . velorex_e(mb_substr($t, $half)) . '</span>';
    }
    return velorex_e($t);
}

// Music banner stats. Mirrors bannerStatsHtml() in pages.js; the artist count
// uses the same credit-list split as splitArtists() there (CLAUDE.md §25).
function velorex_banner_stats_html(array $products, bool $film): string {
    $artists = [];
    foreach ($products as $p) {
        foreach (preg_split('/,|feat\.?|ft\.?|featuring/i', (string)($p['artist'] ?? '')) as $name) {
            $k = mb_strtolower(trim($name));
            if ($k !== '') $artists[$k] = true;
        }
    }
    $titles = count($products);
    $nArt   = count($artists);
    $noun   = $film ? 'Titles' : 'Albums';
    $item = static fn(string $icon, string $strong, string $small): string =>
        '<li class="page-banner-feature"><i class="fas ' . $icon . '" aria-hidden="true"></i>'
        . '<div><strong>' . $strong . '</strong><small>' . $small . '</small></div></li>';
    return $item('fa-compact-disc', number_format($titles), $titles === 1 ? rtrim($noun, 's') : $noun)
        . $item('fa-users', number_format($nArt), $nArt === 1 ? 'Artist' : 'Artists')
        . $item('fa-star', 'Vintage', 'Sound, Forever');
}

// The "nothing listed here" empty state. Mirrors the 'unstocked' variant of
// catalogEmptyHtml() in pages.js — a server render never has filters applied,
// so it never needs the 'filtered' one. The illustration is left to the SPA,
// which replaces this block on boot; the words and the links are what matter
// to a crawler.
function velorex_catalog_empty_html(string $noun): string {
    return '<div class="catalog-empty" role="status">'
        . '<h3 class="catalog-empty-title">Nothing on this shelf yet</h3>'
        . '<p class="catalog-empty-text">We don\'t have any ' . velorex_e($noun)
        . ' listed right now — new stock is on its way. In the meantime, explore the rest of the collection.</p>'
        . '<div class="catalog-empty-actions"><a href="/products" class="btn btn-secondary">'
        . '<i class="fas fa-compact-disc" aria-hidden="true"></i> Browse All Products</a></div>'
        . '<div class="catalog-empty-help"><i class="far fa-lightbulb" aria-hidden="true"></i>'
        . '<div><strong>Looking for something specific?</strong>'
        . '<span>Try different filters or explore our other categories.</span></div>'
        . '<a href="/#shop-categories" class="btn btn-secondary btn-sm">Browse All Categories <i class="fas fa-arrow-right" aria-hidden="true"></i></a>'
        . '</div></div>';
}

// Sum of each item's MRP (originalPrice when above price). Mirrors
// comboMrpTotal() in src/js/storefront/combos.js — see the note there on why
// this is not a combo discount.
function velorex_combo_mrp_total(array $c): int {
    $sum = 0;
    foreach ($c['products'] as $p) {
        $price = (int)($p['price'] ?? 0);
        $orig  = (int)($p['originalPrice'] ?? 0);
        $sum  += $orig > $price ? $orig : $price;
    }
    return $sum;
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

    $inStock   = (int)($p['stock'] ?? 0) > 0;
    $priceFmt  = velorex_inr((int)$p['price']);

    // Shared with Seo.productTitle() in src/js/seo.js — see the header on
    // velorex_product_title() in src/seo/seo-lib.php for the formula and why
    // the old one overflowed Google's display width on every product.
    $title = velorex_product_title($p);

    $head  = velorex_meta_block([
        'title'        => $title,
        // Shared with Seo.productDescription(): album, artist, format, label,
        // year, condition, price and stock — real fields only.
        'description'  => velorex_product_meta_description($p),
        'canonical'    => VELOREX_SITE_URL . $canonicalPath,
        'image'        => velorex_absolute_image($p['image'] ?? ''),
        'imageAlt'     => velorex_product_image_alt($p),
        'type'         => 'product',
        'price'        => (int)$p['price'],
        'availability' => $inStock ? 'in stock' : 'out of stock',
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_product($p);

    $trail = velorex_product_trail($p);
    $head .= velorex_jsonld_breadcrumbs($trail);

    // ---- Server-rendered body content -------------------------------------
    // Everything a searcher (or a quality rater) wants to confirm before
    // buying a record, from fields that exist — empty ones are skipped, never
    // filled with a guess. The SPA replaces this block on boot with its richer
    // interactive version; the facts are the same.
    $gallery = !empty($p['images']) && is_array($p['images']) ? $p['images'] : [];
    if (!$gallery && !empty($p['image'])) $gallery = [$p['image']];
    $primary = velorex_absolute_image($gallery[0] ?? '');

    $facts = [];
    $facts['Artist'] = (string)($p['artist'] ?? '');
    $facts['Format'] = velorex_format_label_for_key((string)($p['category'] ?? ''));
    if (!empty($p['musicDirector'])) $facts['Music director'] = (string)$p['musicDirector'];
    $lang = strtolower(trim((string)($p['language'] ?? '')));
    if (isset(velorex_languages()[$lang])) $facts['Language'] = velorex_languages()[$lang]['label'];
    $facts['Condition'] = (($p['condition'] ?? 'new') === 'pre-owned') ? 'Pre-owned' : 'New';
    $specs = is_array($p['specs'] ?? null) ? $p['specs'] : [];
    foreach (['format' => 'Pressing / format', 'speed' => 'Speed', 'label' => 'Label', 'year' => 'Year',
              'genre' => 'Genre', 'tracks' => 'Tracks', 'runtime' => 'Runtime'] as $k => $labelText) {
        $v = trim((string)($specs[$k] ?? ''));
        if ($v !== '') $facts[$labelText] = $v;
    }
    $rows = '';
    foreach ($facts as $k => $v) {
        if ($v === '') continue;
        $rows .= '<div class="spec-row"><span class="spec-label">' . velorex_e($k) . '</span>'
               . '<span class="spec-value">' . velorex_e($v) . '</span></div>';
    }
    $specsHtml = $rows !== '' ? '<div class="product-specs"><h2 class="specs-title">Product details</h2>' . $rows . '</div>' : '';

    // Track listing, including the "[Side A]" markers the admin form saves.
    $tracksHtml = '';
    $tl = trim((string)($p['trackListing'] ?? ''));
    if ($tl !== '') {
        $sides = [];
        $cur = '';
        foreach (preg_split('/\R/u', $tl) as $line) {
            $line = trim($line);
            if ($line === '' || preg_match('/^(tracks|track listing)$/i', $line)) continue;
            if (preg_match('/^\[Side\s+([A-D])\]$/i', $line, $m)) { $cur = 'Side ' . strtoupper($m[1]); continue; }
            $sides[$cur][] = preg_replace('/^\s*\d+[.)]?\s*/', '', $line);
        }
        foreach ($sides as $side => $list) {
            $tracksHtml .= '<div class="track-side">' . ($side !== '' ? '<h3>' . velorex_e($side) . '</h3>' : '')
                . '<ul><li>' . implode('</li><li>', array_map('velorex_e', $list)) . '</li></ul></div>';
        }
        if ($tracksHtml !== '') $tracksHtml = '<div class="track-list"><h2 class="specs-title">Track Listing</h2>' . $tracksHtml . '</div>';
    }

    $orig = (!empty($p['originalPrice']) && (int)$p['originalPrice'] > (int)$p['price'])
        ? '<span class="product-detail-price-original">₹' . velorex_inr((int)$p['originalPrice']) . '</span>' : '';
    $desc = trim((string)($p['description'] ?? ''));

    $inner = '<div class="product-detail">'
        . '<div class="product-detail-gallery">'
        . '<div class="product-detail-main-image">'
        . ($primary !== VELOREX_DEFAULT_OG_IMAGE
            ? '<img src="' . velorex_e($primary) . '" alt="' . velorex_e(velorex_product_image_alt($p)) . '" fetchpriority="high" decoding="async">'
            : '<img src="' . velorex_e(VELOREX_PLACEHOLDER_IMAGE) . '" alt="" decoding="async">')
        . '</div></div>'
        . '<div class="product-detail-info">'
        . '<h1 class="product-detail-title">' . velorex_e($p['title']) . '</h1>'
        . '<p class="product-detail-subtitle">by <strong>' . velorex_e($p['artist']) . '</strong></p>'
        . '<div class="product-detail-price-block">'
        . '<div class="product-detail-price-meta"><span class="product-detail-price">₹' . $priceFmt . '</span>' . $orig . '</div>'
        . '<div class="product-detail-availability">'
        . velorex_e(velorex_availability_text($p)) . ($inStock ? ': ' . (int)$p['stock'] . ' units' : '')
        . '</div></div>'
        . ($desc !== '' ? '<p class="product-detail-desc">' . velorex_e($desc) . '</p>' : '')
        . $tracksHtml
        . $specsHtml
        . '</div></div>';

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-product');
    // The banner heading above the product is a <p> — the product name inside
    // the detail block is the page's one <h1>.
    $html = velorex_set_text(
        $html,
        '<p class="page-hero-title" id="detail-title">',
        'p',
        velorex_e($p['title'])
    );
    $html = velorex_inject_breadcrumbs($html, $trail);
    $html = velorex_set_div_inner($html, '<div id="product-detail-container">', $inner);
    // Tells initPageProduct() the complete detail is already here, so it skips
    // its partial "lean" paint (which shifted the whole page twice).
    $html = str_replace('<div id="product-detail-container">',
                        '<div id="product-detail-container" data-ssr-id="' . (int)$p['id'] . '">', $html);

    // Where this record sits in the shop (composer, language, format
    // collections) and what to read about it — then "You may also like" as
    // real links. Both used to exist only after JavaScript ran, so a crawler
    // reached a product page and found no way onward except the navbar.
    $html = velorex_set_div_inner($html, '<div id="product-related-links">',
        collections_related_html(collections_related_for_product(db(), $p), 'More like this'));
    $relatedCards = collections_related_products(db(), $p);
    if ($relatedCards) {
        $html = str_replace('<div id="related-section" style="margin-top:4rem; display:none;">',
                            '<div id="related-section" style="margin-top:4rem;">', $html);
        $html = velorex_set_div_inner($html, '<div class="products-grid" id="related-grid">',
            implode('', array_map('velorex_render_card', $relatedCards)));
    }
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

    // Department subcategory (/merchandise/t-shirts). Validated against the
    // taxonomy — an unknown slug 404s rather than quietly rendering the whole
    // department, which would put the same product list on unlimited URLs.
    $subSlug = isset($_GET['sub']) && $_GET['sub'] !== '' ? (string)$_GET['sub'] : null;

    if ($route === 'category' && !isset($cats[$catSlug])) velorex_send_404('Category not found');
    if ($langSlug !== null && !isset($langs[$langSlug]))   velorex_send_404('Page not found');
    if ($subSlug !== null && !isset(velorex_subcategories($catSlug)[$subSlug])) {
        velorex_send_404('Page not found');
    }

    $isAll = ($route === 'products');
    $meta  = $isAll ? null : $cats[$catSlug];

    // Only name item_condition in the SELECT when the column exists (the helper
    // adds it on first call). If that ALTER ever failed, degrade to the old
    // column list rather than 500-ing a public category page.
    $condCol = products_has_condition_column(db()) ? 'item_condition, ' : '';
    $condCol .= products_has_subcategory_column(db()) ? 'subcategory, ' : '';

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
        } elseif ($subSlug !== null) {
            $stmt = db()->prepare(
                'SELECT id, title, artist, category, language, price, original_price, image, '
              . 'rating, reviews, badge, stock, ' . $condCol . 'music_director FROM products '
              . 'WHERE category = :c AND subcategory = :s ORDER BY id DESC'
            );
            $stmt->execute([':c' => $meta['key'], ':s' => $subSlug]);
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
        // Distinct from the homepage's title on purpose — two pages sharing a
        // title compete for the same query. Byte-identical to
        // PAGE_META.products in src/js/seo.js.
        $title     = 'All Products: Vinyl Records, Cassettes & More | ' . VELOREX_SITE_NAME;
        $desc      = 'Browse the full Velorex Music catalogue — Bollywood and Hindi film vinyl LPs, pre-owned records and audio cassettes, delivered across India.';
        $intro     = 'The full Velorex Music catalogue in one place — Hindi film soundtracks on vinyl, pre-owned records and cassettes, from current pressings to out-of-print collector copies.';
    } else {
        // One source for every listing's copy; mirrored by Seo.categoryMeta().
        // (The language pages used to promise "free shipping over ₹5,000", a
        // policy removed in favour of per-product shipping — CLAUDE.md §16.)
        $cm        = velorex_category_meta($catSlug, $langSlug, $subSlug);
        $canonical = $subSlug !== null
            ? VELOREX_SITE_URL . '/' . $catSlug . '/' . $subSlug
            : velorex_category_url($catSlug, $langSlug);
        $h1        = $cm['h1'];
        $title     = $cm['title'];
        $desc      = $cm['description'];
        $intro     = $cm['intro'];
    }

    // An empty listing must not be indexed — a thin page with no products is a
    // quality signal against the whole domain. It stays crawlable (follow) so
    // link equity still flows to the categories that do have stock.
    $robots = $count > 0
        ? 'index, follow, max-image-preview:large, max-snippet:-1'
        : 'noindex, follow';
    $pagePath = (string)parse_url($canonical, PHP_URL_PATH);

    // Language facets must be a genuinely different page from their parent.
    // A facet holding every product of the parent is the parent twice, so it
    // canonicalises there; one with only a handful of products is not worth a
    // search landing and is noindexed. Same rule decides the sitemap
    // (velorex_facet_status(), mirrored by Seo.facetStatus()).
    if (!$isAll && $langSlug !== null && $count > 0) {
        $fs = collections_facet_status(db(), $catSlug, $langSlug);
        if ($fs === 'duplicate') $canonical = velorex_category_url($catSlug);
        elseif ($fs === 'thin') $robots = 'noindex, follow';
    }

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
        } elseif ($subSlug !== null) {
            $trail[] = ['name' => $meta['label'], 'url' => velorex_category_url($catSlug)];
            $trail[] = ['name' => velorex_subcategories($catSlug)[$subSlug]];
        } else {
            $trail[] = ['name' => $meta['label']];
        }
    }
    $head .= velorex_jsonld_breadcrumbs($trail);

    $isDept = !$isAll && !empty(velorex_subcategories($catSlug));
    $emptyNoun = $isAll ? 'products' : strtolower($meta['label']);

    $cardsHtml = $count
        ? implode('', array_map('velorex_render_card', $products))
        : velorex_catalog_empty_html($emptyNoun);

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-products');

    // Banner: which photograph / tagline / feature row (one attribute — the
    // copy for every variant is in index.html), the accented heading, and the
    // route's unique intro copy as the description. data-ssr tells
    // renderProductsBanner() to keep that intro on first boot instead of
    // replacing it with its shorter client-side sentence.
    $html = str_replace(
        '<div class="page-banner" id="products-banner" data-banner="music">',
        '<div class="page-banner" id="products-banner" data-banner="' . ($isDept ? velorex_e($catSlug) : 'music') . '">',
        $html
    );
    $html = velorex_set_text(
        $html,
        '<h1 class="page-hero-title" id="page-title">',
        'h1',
        velorex_banner_title_html($h1, $langSlug !== null)
    );
    // Intro copy gives the category page unique indexable text. Without it a
    // listing page is just a grid of links, which competes poorly.
    $html = velorex_set_text($html, '<p class="page-banner-desc" id="page-banner-desc">', 'p', velorex_e($intro));
    $html = str_replace(
        '<p class="page-banner-desc" id="page-banner-desc">',
        '<p class="page-banner-desc" id="page-banner-desc" data-ssr="1">',
        $html
    );
    if (!$isDept) {
        $film = $isAll || in_array($meta['key'], ['bluray', 'dvd'], true);
        $html = velorex_set_text(
            $html,
            '<ul class="page-banner-features page-banner-stats page-banner-variant" data-for="music" id="page-banner-stats">',
            'ul',
            velorex_banner_stats_html($products, $film)
        );
    }
    $html = velorex_set_text(
        $html,
        '<p class="products-count" id="products-count">',
        'p',
        'Showing ' . $count . ' ' . ($count === 1 ? 'product' : 'products')
    );
    $html = velorex_set_div_inner($html, '<div class="products-grid" id="products-grid">', $cardsHtml);
    $html = velorex_set_div_inner($html, '<div id="collection-related">',
        collections_related_html(collections_related_for_path(db(), $pagePath)));
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
                 . 'rating, reviews, badge, stock, item_condition, ' . (products_has_subcategory_column(db()) ? 'subcategory, ' : '') . 'music_director FROM products '
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
    // Copy follows what is actually second-hand on the shelf (mirrored by
    // Seo.preownedMeta()). When one format holds all the pre-owned stock, its
    // format page is the hub twice over: canonical to /pre-owned.
    $pm    = velorex_preowned_meta(collections_preowned_formats(db()), $catSlug);
    $h1    = $pm['h1'];
    $title = $pm['title'];
    $desc  = $pm['description'];
    if ($catSlug && collections_preowned_format_is_duplicate(db(), $cats[$catSlug]['key'])) {
        $canonical = VELOREX_SITE_URL . '/pre-owned';
    }

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
        : velorex_catalog_empty_html($label ? 'pre-owned ' . strtolower($label) : 'pre-owned items');

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-preowned');
    $html = velorex_set_text($html, '<h1 class="page-hero-title" id="preowned-title">', 'h1', velorex_banner_title_html($h1));
    $html = velorex_set_text($html, '<p class="products-count" id="preowned-count">', 'p',
        $count ? 'Showing ' . $count . ' pre-owned ' . ($count === 1 ? 'item' : 'items') : '');
    $html = velorex_set_div_inner($html, '<div class="products-grid" id="preowned-grid">', $cards);
    $html = velorex_set_div_inner($html, '<div id="preowned-related">',
        collections_related_html(collections_related_for_path(db(), '/pre-owned' . ($catSlug ? '/' . $catSlug : ''))));
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: combo offers
//
// Server-rendered for the same reason the catalogue is: a crawler that does not
// run JavaScript must still see the bundle names, the products in them and the
// links out to those products. The internal links are the real value here —
// each combo page is a hand-curated cluster of related products, which is
// exactly the kind of internal linking a listing grid cannot express.
//
// No Product/Offer JSON-LD is emitted for a combo. A combo is not a purchasable
// SKU — you cannot buy "the combo", you buy its members — so marking it up as
// an Offer with a price would be a false claim about a buyable item.
// -----------------------------------------------------------------------------
if ($route === 'combos') {
    require_once __DIR__ . '/api/_combo_helpers.php';
    try {
        combos_ensure_table(db());
        $st = db()->query("SELECT * FROM combo_offers WHERE status = 'published' ORDER BY sort_order ASC, id DESC");
        $combos = combos_attach_products(db(), $st->fetchAll());
        // A combo whose products have all been deleted renders as an empty
        // card with a ₹0 total; drop it rather than publish nonsense.
        $combos = array_values(array_filter($combos, static function ($c) { return $c['itemCount'] > 0; }));
    } catch (Throwable $e) {
        error_log('[seo-render] combos query failed: ' . $e->getMessage());
        $combos = [];
    }

    $canonical = VELOREX_SITE_URL . '/combos';
    $count = count($combos);

    $head = velorex_meta_block([
        'title'       => 'Combo Offers | Vinyl Bundles & Starter Kits | Velorex Music',
        'description' => 'Curated bundles from Velorex Music — records paired with the care kit to keep them clean, and sets from the same era. Shipped across India.',
        'canonical'   => $canonical,
        'image'       => ($count && !empty($combos[0]['image']))
            ? velorex_absolute_image($combos[0]['image'])
            : VELOREX_DEFAULT_OG_IMAGE,
        'imageAlt'    => 'Velorex Music combo offers',
        // An empty page has nothing to rank for — same rule as an empty category.
        'robots'      => $count > 0
            ? 'index, follow, max-image-preview:large, max-snippet:-1'
            : 'noindex, follow',
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_breadcrumbs([
        ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Combo Offers'],
    ]);

    $cardsHtml = '';
    foreach ($combos as $c) {
        $items = '';
        foreach ($c['products'] as $p) {
            $thumb = !empty($p['image'])
                ? '<img src="' . velorex_e(velorex_absolute_image($p['image'])) . '" alt="" loading="lazy" decoding="async">'
                : '<i class="fas fa-music" aria-hidden="true"></i>';
            $items .= '<li><span class="combo-card-thumb" aria-hidden="true">' . $thumb . '</span>'
                . '<a class="combo-card-item-title" href="' . velorex_e(velorex_product_path($p)) . '">'
                . velorex_e($p['title']) . '</a><span>₹'
                . number_format((int)$p['price']) . '</span></li>';
        }
        $mrp  = velorex_combo_mrp_total($c);
        $save = $mrp - (int)$c['total'];

        if (!empty($c['image'])) {
            $media = '<img src="' . velorex_e(velorex_absolute_image($c['image'])) . '" alt="'
                . velorex_e($c['title']) . '" loading="lazy" decoding="async">';
        } else {
            $covers = '';
            $n = 0;
            foreach ($c['products'] as $p) {
                if (empty($p['image']) || $n >= 3) continue;
                $covers .= '<img src="' . velorex_e(velorex_absolute_image($p['image'])) . '" alt="'
                    . velorex_e($p['title']) . '" loading="lazy" decoding="async">';
                $n++;
            }
            $media = $covers ? '<div class="combo-collage">' . $covers . '</div>'
                             : '<div class="combo-cover-empty">🎁</div>';
        }

        $cardsHtml .= '<article class="combo-card">'
            . '<div class="combo-card-media">' . $media . '</div>'
            . '<div class="combo-card-body">'
            . '<h2 class="combo-card-title">' . velorex_e($c['title']) . '</h2>'
            . ($c['description'] ? '<p class="combo-card-desc">' . velorex_e($c['description']) . '</p>' : '')
            . '<ul class="combo-card-items">' . $items . '</ul>'
            . '<div class="combo-card-foot"><div class="combo-card-sum"><i class="fas fa-gift" aria-hidden="true"></i>'
            . '<div class="combo-card-total">'
            . '<span>' . (int)$c['itemCount'] . ' items together</span>'
            . '<div class="combo-card-prices"><strong>₹' . number_format((int)$c['total']) . '</strong>'
            . ($save > 0
                ? '<s title="Sum of the items\' listed MRP">₹' . number_format($mrp) . '</s>'
                  . '<em class="combo-card-save">Save ₹' . number_format($save) . '</em>'
                : '')
            . '</div></div></div>'
            . '<a class="btn btn-primary combo-card-cta" href="/combos/' . velorex_e($c['slug']) . '">'
            . '<i class="fas fa-cart-shopping" aria-hidden="true"></i> View Combo <i class="fas fa-arrow-right" aria-hidden="true"></i></a>'
            . '</div></div></article>';
    }
    if (!$count) {
        $cardsHtml = velorex_catalog_empty_html('combo offers');
    }

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-combos');
    $html = velorex_set_div_inner($html, '<div class="combo-grid" id="combos-grid">', $cardsHtml);
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: single combo — /combos/<slug>
//
// The page a customer actually lands on from search or a shared link, so it is
// rendered in full server-side: the bundle name, the description, every product
// with its price and a link to its own page, and the combined total.
//
// As on the listing, no Offer markup: a combo is not a purchasable SKU.
// ItemList is the honest description — a curated list of products.
// -----------------------------------------------------------------------------
if ($route === 'combo') {
    require_once __DIR__ . '/api/_combo_helpers.php';
    $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
    if ($slug === '') velorex_send_404('Combo not found');

    try {
        combos_ensure_table(db());
        $st = db()->prepare("SELECT * FROM combo_offers WHERE slug = :s AND status = 'published' LIMIT 1");
        $st->execute([':s' => $slug]);
        $row = $st->fetch();
    } catch (Throwable $e) {
        error_log('[seo-render] combo query failed: ' . $e->getMessage());
        $row = false;
    }
    if (!$row) velorex_send_404('Combo not found');

    $c = combos_attach_products(db(), [$row])[0];
    // Every product deleted since the combo was built — nothing left to show.
    if ($c['itemCount'] < 1) velorex_send_404('Combo not found');

    $canonical = VELOREX_SITE_URL . '/combos/' . $c['slug'];
    $desc = trim((string)$c['description']);
    if ($desc === '') {
        $desc = $c['itemCount'] . ' items bundled together by Velorex Music, bought as a set '
              . 'at their normal prices. Shipped across India.';
    }

    $head  = velorex_meta_block([
        'title'       => $c['title'] . ' | Combo Offer | Velorex Music',
        'description' => $desc,
        'canonical'   => $canonical,
        'image'       => !empty($c['image'])
            ? velorex_absolute_image($c['image'])
            : velorex_absolute_image($c['products'][0]['image'] ?? ''),
        'imageAlt'    => $c['title'],
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_item_list($c['products'], $c['title'], $canonical);
    $head .= velorex_jsonld_breadcrumbs([
        ['name' => 'Home',         'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Combo Offers', 'url' => VELOREX_SITE_URL . '/combos'],
        ['name' => $c['title']],
    ]);

    $rows = '';
    foreach ($c['products'] as $p) {
        $url = velorex_product_path($p);
        $oos = (int)($p['stock'] ?? 0) < 1;
        $img = !empty($p['image'])
            ? '<img src="' . velorex_e(velorex_absolute_image($p['image'])) . '" alt="'
              . velorex_e($p['title']) . '" loading="lazy" decoding="async">'
            : '<span class="combo-item-noimg">🎵</span>';
        $rows .= '<li class="combo-item' . ($oos ? ' is-oos' : '') . '">'
            . '<a class="combo-item-media" href="' . velorex_e($url) . '">' . $img . '</a>'
            . '<div class="combo-item-info">'
            . '<a class="combo-item-title" href="' . velorex_e($url) . '">' . velorex_e($p['title']) . '</a>'
            . '<span class="combo-item-artist">' . velorex_e($p['artist'] ?? '') . '</span>'
            . ($oos ? '<span class="combo-item-oos">Out of stock</span>' : '')
            . '</div>'
            . '<div class="combo-item-actions"><span class="combo-item-price">₹'
            . number_format((int)$p['price']) . '</span></div></li>';
    }

    // Buttons are deliberately omitted from the server-rendered markup: they
    // need the combo in JS memory to work, and a button that does nothing until
    // a script loads is worse than one that appears with the script. The SPA
    // replaces this whole block on boot.
    $detail = '<div class="combo-detail">'
        . '<div class="combo-detail-media">'
        . (!empty($c['image'])
            ? '<img src="' . velorex_e(velorex_absolute_image($c['image'])) . '" alt="'
              . velorex_e($c['title']) . '" decoding="async">'
            : '<div class="combo-cover-empty">🎁</div>')
        . '</div><div class="combo-detail-main">'
        . '<h1 class="combo-detail-title">' . velorex_e($c['title']) . '</h1>'
        . ($c['description'] ? '<p class="combo-detail-desc">' . velorex_e($c['description']) . '</p>' : '')
        . '<ul class="combo-items">' . $rows . '</ul>'
        . '<div class="combo-detail-buy"><div class="combo-detail-total">'
        . '<span>' . (int)$c['itemCount'] . ' items together</span>'
        . '<strong>₹' . number_format((int)$c['total']) . '</strong>'
        . '<small>Total of the items above at their normal prices. Shipping is calculated at checkout.</small>'
        . '</div></div></div></div>';

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-combo');
    $html = velorex_set_div_inner($html, '<div id="combo-detail">', $detail);
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
        // Editor's SEO title/description when set, else derived — the same
        // functions Seo.syncBlogPost() mirrors, so hydration changes nothing.
        $desc = velorex_blog_meta_description(
            $post['excerpt'] ?: blog_auto_excerpt($post['content']),
            $post['meta_description'] ?? null
        );

        $head  = velorex_meta_block([
            'title'       => velorex_blog_meta_title($post['title'], $post['meta_title'] ?? null),
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
            if ($ts) $meta[] = '<time datetime="' . date('c', $ts) . '">' . date('j F Y', $ts) . '</time>';
        }
        // Shown only for a real revision more than a day after publishing —
        // see blog_was_updated(). Mirrored in renderBlogPost().
        if (blog_was_updated($post['published_at'], $post['updated_at'])) {
            $uts = strtotime($post['updated_at']);
            $meta[] = 'Updated <time datetime="' . date('c', $uts) . '">' . date('j F Y', $uts) . '</time>';
        }
        if ($post['author']) $meta[] = 'By ' . velorex_e($post['author']);
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
            . velorex_post_related_html(collections_related_for_post(db(), $post['slug']))
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

// -----------------------------------------------------------------------------
// Route: The Evolution of Music & Audio — /music-history, /music-history/<slug>
//
// Server-rendered from src/history/, the same library /api/music-history.php
// serves to the SPA. A crawler that never runs JavaScript gets the complete
// article; a visitor who does gets the same words rebuilt in place.
//
// This section is INDEPENDENT educational material. Nothing in it was made by
// Velorex, and the JSON-LD says so by omission: it is marked up as an Article,
// never as a Product or an Offer, because none of these machines is for sale
// here. Same rule that keeps Offer markup off combos (§17).
// -----------------------------------------------------------------------------
if ($route === 'musichistory' || $route === 'musichistoryarticle') {
    require_once __DIR__ . '/src/history/history-render.php';

    // ---- single article ----
    if ($route === 'musichistoryarticle') {
        $slug = isset($_GET['slug']) ? preg_replace('/[^a-z0-9-]/', '', (string)$_GET['slug']) : '';
        $article = $slug !== '' ? velorex_history_article($slug) : null;
        if (!$article) velorex_send_404('Topic not found');

        $canonical = VELOREX_SITE_URL . '/music-history/' . $article['slug'];

        $head  = velorex_meta_block([
            'title'       => $article['metaTitle'],
            'description' => $article['metaDescription'],
            'canonical'   => $canonical,
            'image'       => VELOREX_DEFAULT_OG_IMAGE,
            'imageAlt'    => $article['title'] . ' — a history of music technology',
            'type'        => 'article',
        ]);
        $head .= velorex_jsonld_site();
        $head .= velorex_jsonld_breadcrumbs([
            ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
            ['name' => 'Music History', 'url' => VELOREX_SITE_URL . '/music-history'],
            ['name' => $article['title']],
        ]);
        $head .= "\n" . '<script type="application/ld+json">' . json_encode([
            '@context'            => 'https://schema.org',
            '@type'               => 'Article',
            'headline'            => $article['title'],
            'description'         => $article['metaDescription'],
            'mainEntityOfPage'    => ['@type' => 'WebPage', '@id' => $canonical],
            'author'              => ['@type' => 'Organization', 'name' => VELOREX_SITE_NAME],
            'publisher'           => [
                '@type' => 'Organization',
                'name'  => VELOREX_SITE_NAME,
                'logo'  => ['@type' => 'ImageObject', 'url' => VELOREX_SITE_URL . '/src/img/logo-1200.png'],
            ],
            'isAccessibleForFree' => true,
            'articleSection'      => 'History of music technology',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>';

        $html = velorex_shell();
        $html = velorex_inject_head($html, $head);
        $html = velorex_show_section($html, 'page-music-history-article');
        $html = velorex_history_fill_motifs($html);
        $html = velorex_set_div_inner(
            $html,
            '<div id="music-history-article-body">',
            velorex_history_article_html($article)
        );
        echo $html;
        exit;
    }

    // ---- hub ----
    // ?era=… selects which era panel is open. It is a query parameter rather
    // than a path segment because every era is already described in full on
    // this one page — nine near-identical URLs would be nine thin duplicates.
    // The canonical therefore always points at the bare /music-history.
    $index = velorex_history_index();
    $era   = isset($_GET['era']) ? preg_replace('/[^a-z0-9-]/', '', (string)$_GET['era']) : '';

    $head  = velorex_meta_block([
        'title'       => 'The Evolution of Music & Audio | History of Recorded Sound',
        // Fits velorex_meta_block()'s 160-character trim on purpose, and is
        // byte-identical to PAGE_META['music-history'] in src/js/seo.js. A
        // longer string would be ellipsised here and replaced in full by the
        // SPA, so one URL would carry two different descriptions.
        'description' => 'How recorded music worked, from the phonograph and gramophone to vinyl, '
            . 'cassettes, CDs, MP3 and streaming — the dates, the machines and what replaced them.',
        'canonical'   => VELOREX_SITE_URL . '/music-history',
        'image'       => VELOREX_DEFAULT_OG_IMAGE,
        'imageAlt'    => 'A timeline of music playback technology',
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_breadcrumbs([
        ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Music History'],
    ]);

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-music-history');
    // Draw the hero collage and the nostalgia mosaic before the SPA boots, so
    // the first paint is not nine empty boxes above the fold.
    $html = velorex_history_fill_motifs($html);
    $html = velorex_set_div_inner(
        $html,
        '<div id="music-history-body">',
        velorex_history_index_html($index, $era)
    );
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: composer collection — /artists/<slug>
//
// Only for composers in velorex_artist_collections(), and only indexable while
// the shelf holds VELOREX_ARTIST_MIN_PRODUCTS of their records. The page is
// written context (who they are, what is on the shelf now, which labels) plus
// the records and onward links — not a bare grid. Everything about Velorex's
// stock is computed here from the database, never hand-written.
// -----------------------------------------------------------------------------
if ($route === 'artist') {
    $slug   = isset($_GET['slug']) ? preg_replace('/[^a-z0-9-]/', '', (string)$_GET['slug']) : '';
    $status = $slug !== '' ? collections_artist_status(db(), $slug) : 'missing';
    if ($status === 'missing') velorex_send_404('Page not found');

    $a        = velorex_artist_collections()[$slug];
    $products = collections_artist_products(db(), $slug);
    $count    = count($products);
    $inStock  = count(array_filter($products, static fn($p) => (int)$p['stock'] > 0));
    $canonical = VELOREX_SITE_URL . '/artists/' . $slug;

    $head  = velorex_meta_block([
        'title'       => $a['title'],
        'description' => $a['description'],
        'canonical'   => $canonical,
        'image'       => velorex_absolute_image($products[0]['image'] ?? ''),
        'imageAlt'    => $a['name'] . ' vinyl records at Velorex Music',
        'robots'      => $status === 'index'
            ? 'index, follow, max-image-preview:large, max-snippet:-1'
            : 'noindex, follow',
    ]);
    $head .= velorex_jsonld_site();
    $head .= velorex_jsonld_item_list($products, $a['name'] . ' vinyl records', $canonical);
    $head .= velorex_jsonld_breadcrumbs([
        ['name' => 'Home', 'url' => VELOREX_SITE_URL . '/'],
        ['name' => 'Vinyl Records', 'url' => velorex_category_url('vinyl-records')],
        ['name' => $a['name']],
    ]);

    $html = velorex_shell();
    $html = velorex_inject_head($html, $head);
    $html = velorex_show_section($html, 'page-artist');
    $html = velorex_set_text($html, '<h1 class="page-hero-title" id="artist-title">', 'h1',
        velorex_e($a['name'] . ' Vinyl Records'));
    $html = velorex_set_text($html, '<p class="artist-count" id="artist-count" style="color:var(--text-muted);margin-top:0.5rem;">', 'p',
        velorex_e(velorex_artist_count_line($count, $inStock)));
    $html = velorex_set_div_inner($html, '<div class="artist-about" id="artist-about">', velorex_artist_about_html($a, $products));
    $html = velorex_set_div_inner($html, '<div class="products-grid" id="artist-grid">',
        implode('', array_map('velorex_render_card', $products)));
    $html = velorex_set_div_inner($html, '<div id="artist-related">',
        collections_related_html(collections_related_for_path(db(), '/artists/' . $slug)));
    echo $html;
    exit;
}

// -----------------------------------------------------------------------------
// Route: private SPA views — /cart, /profile, /login, /signup, /forgot, /checkout
//
// No content of their own worth indexing, and never a homepage canonical.
// The shell is served with noindex and the SPA renders the view; titles match
// PAGE_META in src/js/seo.js so hydration changes nothing.
// -----------------------------------------------------------------------------
if ($route === 'private') {
    $pages = [
        'cart'     => 'Your Cart | Velorex Music',
        'checkout' => 'Checkout | Velorex Music',
        'profile'  => 'My Account | Velorex Music',
        'login'    => 'Sign In | Velorex Music',
        'signup'   => 'Create an Account | Velorex Music',
        'forgot'   => 'Password Help | Velorex Music',
    ];
    $page = (string)($_GET['page'] ?? '');
    if (!isset($pages[$page])) velorex_send_404('Page not found');
    header('Cache-Control: no-store');
    $head = velorex_meta_block([
        'title'       => $pages[$page],
        'description' => 'Velorex Music account and checkout.',
        'canonical'   => '',
        // nofollow on the account page only — its links are all personal.
        'robots'      => $page === 'profile' ? 'noindex, nofollow' : 'noindex, follow',
    ]);
    $head = preg_replace('#\s*<link rel="canonical" href="">|\s*<meta property="og:url" content="">#', '', $head) ?? $head;
    echo velorex_inject_head(velorex_shell(), $head);
    exit;
}

// Unknown _route — someone hit seo-render.php directly.
velorex_send_404('Page not found');
