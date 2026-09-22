<?php
// =============================================================================
// Velorex Music — collection graph (Phase 2 organic growth)
//
// ONE place that answers:
//   • which products belong to a composer collection (/artists/<slug>)
//   • which collections are live enough to link to (stock + indexing rules)
//   • what a listing, a product or a Journal post should link to next
//
// Consumed by seo-render.php (server HTML for crawlers) and /api/collections.php
// (the same data for the SPA), so the links a crawler follows and the links a
// visitor sees are computed by the same code — they cannot drift.
//
// Every link produced here points at a page that exists AND is indexable right
// now: an empty category, a thin facet or a composer page below its threshold
// is never linked. A link to a noindexed page is a wasted signal and, for a
// visitor, a dead end.
// =============================================================================

require_once __DIR__ . '/_products_helpers.php';
require_once __DIR__ . '/../src/seo/seo-lib.php';

// ---- Catalogue snapshot ------------------------------------------------------

// All products in the lean shape plus the two fields the graph needs. One query
// per request, memoised — every function below reads from this.
function collections_products(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $cols = 'id, title, artist, category, language, price, original_price, image, rating, reviews, badge, stock, music_director';
    if (products_has_condition_column($pdo))   $cols .= ', item_condition';
    if (products_has_subcategory_column($pdo)) $cols .= ', subcategory';
    try {
        $rows = $pdo->query("SELECT $cols FROM products ORDER BY id DESC")->fetchAll();
    } catch (Throwable $e) {
        error_log('[collections] product query failed: ' . $e->getMessage());
        $rows = [];
    }
    return $cache = array_map('row_to_product_lean', $rows);
}

function collections_lang_key($v): string {
    return strtolower(trim((string)$v));
}

// Counts that decide what is live: per category, per category+language,
// pre-owned per category, per composer collection.
function collections_counts(PDO $pdo): array {
    static $c = null;
    if ($c !== null) return $c;
    $c = ['cat' => [], 'lang' => [], 'preowned' => [], 'artist' => [], 'artistInStock' => []];
    foreach (collections_products($pdo) as $p) {
        $cat = (string)$p['category'];
        $c['cat'][$cat] = ($c['cat'][$cat] ?? 0) + 1;
        $lk = collections_lang_key($p['language']);
        if ($lk !== '') $c['lang'][$cat][$lk] = ($c['lang'][$cat][$lk] ?? 0) + 1;
        if (($p['condition'] ?? 'new') === 'pre-owned') $c['preowned'][$cat] = ($c['preowned'][$cat] ?? 0) + 1;
        $a = velorex_product_artist_slug($p);
        if ($a) {
            $c['artist'][$a] = ($c['artist'][$a] ?? 0) + 1;
            if ((int)$p['stock'] > 0) $c['artistInStock'][$a] = ($c['artistInStock'][$a] ?? 0) + 1;
        }
    }
    return $c;
}

// ---- Liveness rules ----------------------------------------------------------

function collections_category_live(PDO $pdo, string $catSlug): bool {
    $meta = velorex_categories()[$catSlug] ?? null;
    return $meta && (collections_counts($pdo)['cat'][$meta['key']] ?? 0) > 0;
}

function collections_facet_status(PDO $pdo, string $catSlug, string $lang): string {
    $meta = velorex_categories()[$catSlug] ?? null;
    if (!$meta) return 'thin';
    $c = collections_counts($pdo);
    return velorex_facet_status($c['lang'][$meta['key']][$lang] ?? 0, $c['cat'][$meta['key']] ?? 0);
}

function collections_artist_status(PDO $pdo, string $slug): string {
    if (!isset(velorex_artist_collections()[$slug])) return 'missing';
    $n = collections_counts($pdo)['artist'][$slug] ?? 0;
    if ($n === 0) return 'missing';
    return $n >= VELOREX_ARTIST_MIN_PRODUCTS ? 'index' : 'thin';
}

// Formats (DB keys) that currently have pre-owned stock.
function collections_preowned_formats(PDO $pdo): array {
    return array_keys(collections_counts($pdo)['preowned']);
}

// A pre-owned format page that holds every pre-owned item is the hub under a
// second URL. It canonicalises to /pre-owned and is left out of the sitemap.
function collections_preowned_format_is_duplicate(PDO $pdo, string $catKey): bool {
    $po = collections_counts($pdo)['preowned'];
    return count($po) === 1 && isset($po[$catKey]);
}

function collections_artist_products(PDO $pdo, string $slug): array {
    return array_values(array_filter(collections_products($pdo), static fn($p) => velorex_product_artist_slug($p) === $slug));
}

// Label names as a reader should see them. The admin field is free text and the
// catalogue holds "Universal", "Universal Music", "Universl Music Group",
// "saregama", "T Series" … — normalised for DISPLAY only; the data is untouched
// (fixing it is on the owner's list in PRODUCT-CONTENT-PRIORITY.md).
function collections_label_display(string $raw): string {
    $k = preg_replace('/[^a-z]/', '', strtolower($raw)) ?? '';
    $map = [
        'universal' => 'Universal Music', 'universl' => 'Universal Music', 'saregama' => 'Saregama',
        'sony' => 'Sony Music', 'tseries' => 'T-Series', 'zee' => 'Zee Music', 'tips' => 'Tips',
        'ishtar' => 'Ishtar', 'yrf' => 'YRF Music', 'shemaroo' => 'Shemaroo', 'sonotek' => 'Sonotek',
        'timemusic' => 'Time Music',
    ];
    foreach ($map as $prefix => $name) if (str_starts_with($k, $prefix)) return $name;
    return '';   // unknown / junk values are never displayed
}

// One factual sentence about a composer's shelf, computed from the database:
// how many records, in stock, pre-owned, and the labels that pressed them.
// Returned by /api/collections.php so the SPA prints the server's exact words.
function collections_artist_shelf(PDO $pdo, string $slug): string {
    $products = collections_artist_products($pdo, $slug);
    if (!$products) return '';
    $ids = array_map(static fn($p) => (int)$p['id'], $products);
    $labels = [];
    try {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT specs FROM products WHERE id IN ($in)");
        $st->execute($ids);
        foreach ($st->fetchAll() as $r) {
            $s = json_decode((string)($r['specs'] ?? ''), true);
            $name = collections_label_display((string)($s['label'] ?? ''));
            if ($name !== '') $labels[$name] = ($labels[$name] ?? 0) + 1;
        }
    } catch (Throwable $e) { /* labels are optional */ }
    arsort($labels);
    $n = count($products);
    $inStock = count(array_filter($products, static fn($p) => (int)$p['stock'] > 0));
    $used = count(array_filter($products, static fn($p) => ($p['condition'] ?? 'new') === 'pre-owned'));
    $formats = array_unique(array_map(static fn($p) => velorex_format_label_for_key((string)$p['category']), $products));
    $fmt = count($formats) === 1 && $formats[0] !== '' ? strtolower($formats[0]) . 's' : 'records';
    $out = 'On the Velorex shelf: ' . $n . ' ' . ($n === 1 ? rtrim($fmt, 's') : $fmt)
         . ', ' . $inStock . ' in stock' . ($used ? ', ' . $used . ' pre-owned' : '') . '.';
    $top = array_slice(array_keys($labels), 0, 4);
    if ($top) {
        $last = array_pop($top);
        $out .= ' Pressed by ' . ($top ? implode(', ', $top) . ' and ' : '') . $last . '.';
    }
    return $out;
}

// ---- Link candidates ---------------------------------------------------------
//
// Anchor text is written per destination and varies by context, so the site
// never repeats one exact-match phrase sitewide.

function collections_link(string $path, string $label, string $kind = 'collection'): array {
    return ['url' => $path, 'label' => $label, 'kind' => $kind];
}

// The collection-type destinations that are live right now, keyed by path.
function collections_live_targets(PDO $pdo): array {
    $t = [];
    if (collections_category_live($pdo, 'vinyl-records')) $t['/vinyl-records'] = 'All vinyl records';
    if (collections_facet_status($pdo, 'vinyl-records', 'hindi') === 'index') $t['/vinyl-records/hindi'] = 'Hindi & Bollywood vinyl';
    if (collections_facet_status($pdo, 'vinyl-records', 'english') === 'index') $t['/vinyl-records/english'] = 'English vinyl';
    foreach (velorex_artist_collections() as $slug => $a) {
        if (collections_artist_status($pdo, $slug) === 'index') $t['/artists/' . $slug] = $a['name'] . ' on vinyl';
    }
    if (collections_preowned_formats($pdo)) $t['/pre-owned'] = 'Pre-owned records';
    foreach (['cassettes' => 'Audio cassettes', 'audio-cds' => 'Audio CDs', 'blu-ray-movies' => 'Blu-ray movies',
              'dvd-movies' => 'DVD movies', 'vinyl-care' => 'Vinyl care & cleaning', 'merchandise' => 'Music merchandise'] as $slug => $label) {
        if (collections_category_live($pdo, $slug)) $t['/' . $slug] = $label;
    }
    return $t;
}

// Editorial (always-live) reading from the Music History section, by format.
function collections_history_links(string $catKey): array {
    $map = [
        'vinyl'    => [['/music-history/vinyl', 'How the LP and the 45 began'], ['/music-history/vinyl-revival', 'Why vinyl came back']],
        'cassette' => [['/music-history/cassette', 'A short history of the cassette']],
        'cd'       => [['/music-history/cd', 'How the CD changed listening']],
    ];
    return array_map(static fn($x) => collections_link($x[0], $x[1], 'guide'), $map[$catKey] ?? []);
}

// ---- Journal -------------------------------------------------------------

function collections_blog_ready(PDO $pdo): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        require_once __DIR__ . '/_blog_helpers.php';
        blog_ensure_table($pdo);
        return $ok = blog_has_related_columns($pdo);
    } catch (Throwable $e) {
        return $ok = false;
    }
}

// Published posts with their editorial relations decoded. Memoised.
function collections_posts(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = [];
    try {
        require_once __DIR__ . '/_blog_helpers.php';
        blog_ensure_table($pdo);
        $cols = 'id, slug, title, excerpt, published_at';
        if (collections_blog_ready($pdo)) $cols .= ', related_collections, related_products';
        $rows = $pdo->query("SELECT $cols FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC, id DESC")->fetchAll();
        foreach ($rows as $r) {
            $cache[] = [
                'slug'  => $r['slug'],
                'title' => $r['title'],
                'url'   => '/blog/' . $r['slug'],
                'collections' => blog_decode_list($r['related_collections'] ?? null, 'path'),
                'products'    => array_map('intval', blog_decode_list($r['related_products'] ?? null, 'int')),
            ];
        }
    } catch (Throwable $e) {
        error_log('[collections] posts query failed: ' . $e->getMessage());
    }
    return $cache;
}

// Posts an editor tied to any of $paths (or, for a product, to its id). When
// nothing is tagged and the page is vinyl-related, fall back to the newest
// posts: every post published so far is about vinyl or Indian film music, so
// that is still relevant reading — and it stops being used the moment posts
// are tagged.
function collections_journal_for(PDO $pdo, array $paths, ?int $productId = null, bool $vinylContext = false, int $limit = 3): array {
    $out = [];
    foreach (collections_posts($pdo) as $post) {
        $hit = ($productId !== null && in_array($productId, $post['products'], true))
            || array_intersect($paths, $post['collections']);
        if ($hit) $out[] = collections_link($post['url'], $post['title'], 'article');
        if (count($out) >= $limit) break;
    }
    if (!$out && $vinylContext) {
        foreach (array_slice(collections_posts($pdo), 0, $limit) as $post) {
            $out[] = collections_link($post['url'], $post['title'], 'article');
        }
    }
    return $out;
}

// ---- Related blocks ----------------------------------------------------------

// For a listing page. $path is the canonical path of the page being viewed.
function collections_related_for_path(PDO $pdo, string $path): array {
    $live = collections_live_targets($pdo);
    $want = [];
    $catKey = null;
    if ($path === '/products') {
        $want = ['/vinyl-records/hindi', '/pre-owned', '/artists/r-d-burman', '/artists/a-r-rahman', '/cassettes', '/vinyl-care'];
        $catKey = 'vinyl';
    } elseif (preg_match('#^/vinyl-records(?:/(hindi|english))?$#', $path)) {
        $want = ['/vinyl-records', '/vinyl-records/hindi', '/vinyl-records/english', '/artists/r-d-burman', '/artists/a-r-rahman', '/pre-owned', '/vinyl-care'];
        $catKey = 'vinyl';
    } elseif (str_starts_with($path, '/pre-owned')) {
        $want = ['/vinyl-records/hindi', '/artists/r-d-burman', '/artists/a-r-rahman', '/vinyl-records', '/vinyl-care'];
        $catKey = 'vinyl';
    } elseif (str_starts_with($path, '/artists/')) {
        $want = ['/artists/r-d-burman', '/artists/a-r-rahman', '/vinyl-records/hindi', '/pre-owned', '/vinyl-records'];
        $catKey = 'vinyl';
    } elseif (preg_match('#^/(cassettes|audio-cds)#', $path, $m)) {
        $want = ['/vinyl-records/hindi', '/vinyl-records', '/pre-owned'];
        $catKey = $m[1] === 'cassettes' ? 'cassette' : 'cd';
    } else {
        $want = ['/vinyl-records', '/vinyl-records/hindi', '/pre-owned'];
    }

    $collections = [];
    foreach ($want as $w) {
        if ($w !== $path && isset($live[$w])) $collections[] = collections_link($w, $live[$w]);
    }
    $vinyl = $catKey === 'vinyl';
    $journalPaths = array_unique([$path, preg_replace('#/[^/]+$#', '', $path) ?: $path]);
    return [
        'collections' => array_slice($collections, 0, 6),
        'guides'      => $catKey ? collections_history_links($catKey) : [],
        'journal'     => collections_journal_for($pdo, $journalPaths, null, $vinyl),
    ];
}

// For a product page: where this record sits in the catalogue, and what to read.
function collections_related_for_product(PDO $pdo, array $p): array {
    $live = collections_live_targets($pdo);
    $catSlug = velorex_category_slug_for_key((string)$p['category']);
    $lang = collections_lang_key($p['language'] ?? '');
    $links = [];
    $artist = velorex_product_artist_slug($p);
    if ($artist && isset($live['/artists/' . $artist])) {
        $links[] = collections_link('/artists/' . $artist, 'More ' . velorex_artist_collections()[$artist]['name'] . ' records');
    }
    if ($catSlug && $lang !== '' && isset($live['/' . $catSlug . '/' . $lang])) {
        $links[] = collections_link('/' . $catSlug . '/' . $lang, $live['/' . $catSlug . '/' . $lang]);
    }
    if ($catSlug && isset($live['/' . $catSlug])) $links[] = collections_link('/' . $catSlug, $live['/' . $catSlug]);
    if (($p['condition'] ?? 'new') === 'pre-owned' && isset($live['/pre-owned'])) {
        $links[] = collections_link('/pre-owned', 'Other pre-owned records');
    }
    $paths = array_map(static fn($l) => $l['url'], $links);
    return [
        'collections' => $links,
        'guides'      => collections_history_links((string)$p['category']),
        'journal'     => collections_journal_for($pdo, $paths, (int)$p['id'], $p['category'] === 'vinyl', 2),
    ];
}

// "You may also like": same composer first, then same format + language,
// in-stock before sold-out, newest first. MIRRORED by relatedProducts() in
// src/js/storefront/pages.js so the SPA's grid matches the server's.
function collections_related_products(PDO $pdo, array $p, int $limit = 4): array {
    $md   = velorex_norm_person($p['musicDirector'] ?? '');
    $lang = collections_lang_key($p['language'] ?? '');
    $scored = [];
    foreach (collections_products($pdo) as $q) {
        if ((int)$q['id'] === (int)$p['id']) continue;
        $s = 0;
        if ($md !== '' && velorex_norm_person($q['musicDirector'] ?? '') === $md) $s += 2;
        if ($q['category'] === $p['category'] && collections_lang_key($q['language']) === $lang) $s += 1;
        if ($s === 0) continue;
        $scored[] = [$s, (int)$q['stock'] > 0 ? 1 : 0, (int)$q['id'], $q];
    }
    usort($scored, static fn($a, $b) => [$b[0], $b[1], $b[2]] <=> [$a[0], $a[1], $a[2]]);
    return array_map(static fn($x) => $x[3], array_slice($scored, 0, $limit));
}

// For a Journal post: the collections and products its editor tied to it, and
// other posts to read next.
function collections_related_for_post(PDO $pdo, string $slug): array {
    $live = collections_live_targets($pdo);
    $post = null;
    foreach (collections_posts($pdo) as $x) if ($x['slug'] === $slug) { $post = $x; break; }
    $collections = [];
    foreach ($post['collections'] ?? [] as $path) {
        if (isset($live[$path])) $collections[] = collections_link($path, $live[$path]);
    }
    if (!$collections) {
        // Untagged post: the two broadest live shelves, so a reader always has
        // somewhere to go from an article about records.
        foreach (['/vinyl-records/hindi', '/pre-owned'] as $w) if (isset($live[$w])) $collections[] = collections_link($w, $live[$w]);
    }
    $products = [];
    if (!empty($post['products'])) {
        $byId = [];
        foreach (collections_products($pdo) as $q) $byId[(int)$q['id']] = $q;
        foreach ($post['products'] as $id) if (isset($byId[$id])) $products[] = $byId[$id];
    }
    $more = [];
    foreach (collections_posts($pdo) as $x) {
        if ($x['slug'] !== $slug) $more[] = collections_link($x['url'], $x['title'], 'article');
        if (count($more) >= 3) break;
    }
    return ['collections' => $collections, 'products' => array_slice($products, 0, 8), 'journal' => $more];
}

// ---- HTML (server render) ------------------------------------------------------
//
// Markup MIRRORED by CollectionLinks.html() in src/js/storefront/collections.js.

function collections_related_html(array $rel, string $heading = 'Keep exploring'): string {
    $groups = [
        'collections' => 'Shop related collections',
        'guides'      => 'Background reading',
        'journal'     => 'From the Velorex Journal',
    ];
    $out = '';
    foreach ($groups as $key => $label) {
        if (empty($rel[$key])) continue;
        $items = '';
        foreach ($rel[$key] as $l) {
            $items .= '<li><a href="' . velorex_e($l['url']) . '">' . velorex_e($l['label']) . '</a></li>';
        }
        $out .= '<div class="collection-links-group collection-links-' . $key . '">'
              . '<h3 class="collection-links-label">' . velorex_e($label) . '</h3>'
              . '<ul class="collection-links-list">' . $items . '</ul></div>';
    }
    if ($out === '') return '';
    return '<nav class="collection-links" aria-label="' . velorex_e($heading) . '">'
         . '<h2 class="collection-links-title">' . velorex_e($heading) . '</h2>'
         . '<div class="collection-links-groups">' . $out . '</div></nav>';
}
