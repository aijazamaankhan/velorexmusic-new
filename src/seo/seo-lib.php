<?php
// =============================================================================
// Velorex Music — shared SEO library
//
// Used by the two root-level SEO entry points:
//   • seo-render.php  — server-renders product + category pages at real URLs
//   • sitemap.php     — emits /sitemap.xml from the live catalogue
//
// Everything here is pure functions + data. There is no side effect on
// include, so it is harmless if it is ever hit directly by URL (it prints
// nothing). It deliberately does NOT require api/config.php — the callers
// decide whether they need a DB handle.
//
// SLUG PARITY: velorex_slugify() below is mirrored in src/js/seo.js as
// Seo.slugify(). The two MUST produce identical output or the client will
// push a URL that differs from the server-rendered canonical, which reads to
// Google as two URLs for one product. Change both together.
// =============================================================================

if (!defined('VELOREX_SITE_URL')) {
    // Canonical origin. No trailing slash. Every absolute URL in metadata,
    // JSON-LD and the sitemap is built from this, so changing domain is a
    // one-line edit.
    define('VELOREX_SITE_URL', 'https://velorexmusic.com');
}

define('VELOREX_SITE_NAME', 'Velorex Music');

// Fallback social-share image (1200x630 card, dark, with marketing copy).
// Used for og:image / twitter:image when a product has no cover of its own.
define('VELOREX_DEFAULT_OG_IMAGE', VELOREX_SITE_URL . '/src/img/og-default.jpg');

// Organization / Store logo for JSON-LD. Deliberately NOT the OG card: Google
// wants a clean rendering of the mark on a plain background for schema `logo`,
// not a promotional banner with overlaid text.
define('VELOREX_LOGO_IMAGE', VELOREX_SITE_URL . '/src/img/logo-1200.png');

// Shown where a product has no photo of its own. The same image the SPA falls
// back to (pages.js), so the server render and the hydrated page match. Always
// rendered with alt="" — it is not a picture of the product.
define('VELOREX_PLACEHOLDER_IMAGE', 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop');

// -----------------------------------------------------------------------------
// Category taxonomy
//
// The single source of truth mapping a URL slug ↔ the DB `category` value.
// `title` / `description` / `intro` are hand-written for search intent rather
// than generated, because these five pages are the highest-value landing
// pages on the site and deserve real copy. Each blends the four keyword
// clusters agreed for this site: format terms, artist/music-director terms,
// India/local terms, and collector terms.
// -----------------------------------------------------------------------------
function velorex_categories(): array {
    return [
        // Copy describes what is actually on the shelf. It used to promise
        // "English rock, jazz and classical LPs" while the catalogue held none —
        // a claim a searcher checks in one click and a quality rater would
        // flag. If the English shelf fills up, widen this copy then, not before.
        'vinyl-records' => [
            'key'   => 'vinyl',
            'label' => 'Vinyl Records',
            'title' => 'Buy Vinyl Records Online in India | Bollywood LPs | Velorex Music',
            'description' => 'Shop original vinyl records online in India — Bollywood and Hindi film soundtrack LPs from R. D. Burman, A. R. Rahman, Anu Malik and more, new and pre-owned.',
            'intro' => 'Vinyl LPs shipped across India, led by Hindi film soundtracks — golden-era R. D. Burman and Laxmikant–Pyarelal scores alongside Nadeem–Shravan, Anu Malik and A. R. Rahman. New pressings and hand-checked pre-owned copies, each listed with its label, year and track listing.',
            // Hand-written copy for the language facets that carry real stock.
            // A facet without an entry here falls back to the formula in
            // velorex_category_meta(); mirrored in CATEGORY_META in src/js/seo.js.
            'facets' => [
                'hindi' => [
                    'title' => 'Hindi & Bollywood Vinyl Records | Buy Online in India',
                    'description' => 'Buy Bollywood and Hindi film vinyl records online in India — soundtrack LPs by R. D. Burman, A. R. Rahman, Anu Malik and more. New and pre-owned.',
                    'intro' => 'Hindi film soundtracks on vinyl — the Bollywood LPs collectors actually look for, from 1970s R. D. Burman scores to 1990s Nadeem–Shravan and A. R. Rahman. Every listing carries its label, year and full track listing, and pre-owned copies are condition-checked before dispatch.',
                ],
            ],
        ],
        'audio-cds' => [
            'key'   => 'cd',
            'label' => 'Audio CDs',
            'title' => 'Buy Audio CDs Online India | Hindi & English Music CDs',
            'description' => 'Buy audio CDs online in India — Bollywood soundtracks, ghazals, classical and English albums. Sealed and pre-owned music CDs with pan-India delivery.',
            'intro' => 'A carefully checked catalogue of audio CDs covering Hindi film music, ghazals, Indian classical and English albums. Every disc is inspected before dispatch.',
        ],
        'cassettes' => [
            'key'   => 'cassette',
            'label' => 'Cassettes',
            'title' => 'Buy Audio Cassettes Online in India | Bollywood & Blank Tapes',
            'description' => 'Shop audio cassettes online in India — Bollywood songs-and-dialogue tapes and blank recording cassettes, delivered across India by Velorex Music.',
            'intro' => 'Pre-recorded Bollywood cassettes — songs and dialogue from the films people grew up with — alongside blank tapes for anyone still recording on a deck.',
        ],
        'blu-ray-movies' => [
            'key'   => 'bluray',
            'label' => 'Blu-ray Movies',
            'title' => 'Buy Blu-ray Movies Online India | Hindi & English Blu-rays',
            'description' => 'Buy Blu-ray discs online in India — Bollywood classics, Hindi cinema restorations and English films in HD. Original sealed Blu-rays with pan-India shipping.',
            'intro' => 'High-definition Blu-ray releases spanning restored Hindi cinema and English films. Original pressings only — no unauthorised copies.',
        ],
        'dvd-movies' => [
            'key'   => 'dvd',
            'label' => 'DVD Movies',
            'title' => 'Buy DVD Movies Online India | Bollywood & English DVDs',
            'description' => 'Shop DVD movies online in India — Bollywood classics, regional cinema and English films. Original DVDs with pan-India delivery.',
            'intro' => 'Original DVD releases covering Bollywood classics, regional Indian cinema and English films, including many long out-of-print titles.',
        ],
        // ---- Non-format departments -----------------------------------------
        // These two carry SUBCATEGORIES rather than the hindi/english language
        // facet the formats use. Both occupy the same URL slot — /<cat>/<facet> —
        // and velorex_subcategories() is what tells the two apart.
        'merchandise' => [
            'key'   => 'merchandise',
            'label' => 'Merchandise',
            'title' => 'Music Merchandise India | Band T-Shirts, Hoodies & Posters',
            'description' => 'Music merchandise from Velorex Music — band t-shirts, hoodies, caps, tote bags, posters, stickers, mugs, keychains and slipmats. Shipped across India.',
            'intro' => 'Wearables and collectables for people who take their record shelf seriously — printed apparel, posters and desk pieces, shipped across India.',
            'subs'  => [
                't-shirts'   => 'T-Shirts',
                'hoodies'    => 'Hoodies',
                'caps'       => 'Caps',
                'tote-bags'  => 'Tote Bags',
                'posters'    => 'Posters',
                'stickers'   => 'Stickers',
                'mugs'       => 'Mugs',
                'keychains'  => 'Keychains',
                'slipmats'   => 'Slipmats',
            ],
        ],
        'vinyl-care' => [
            'key'   => 'vinyl-care',
            'label' => 'Vinyl Care',
            'title' => 'Vinyl Record Care & Cleaning Products India | Velorex Music',
            'description' => 'Vinyl record care in India — cleaning brushes and solution, anti-static and outer sleeves, storage boxes, stylus cleaners and record clamps.',
            'intro' => 'Everything needed to keep a collection playing properly: cleaning kit, anti-static and protective sleeves, storage, stylus care and turntable accessories.',
            'subs'  => [
                'record-cleaning-brush'     => 'Record Cleaning Brush',
                'carbon-fiber-brush'        => 'Carbon Fiber Brush',
                'record-cleaning-solution'  => 'Record Cleaning Solution',
                'microfiber-cloth'          => 'Microfiber Cloth',
                'anti-static-inner-sleeves' => 'Anti-Static Inner Sleeves',
                'outer-protective-sleeves'  => 'Outer Protective Sleeves',
                'vinyl-storage-boxes'       => 'Vinyl Storage Boxes',
                'stylus-cleaning-gel'       => 'Stylus Cleaning Gel / Brush',
                'turntable-slipmats'        => 'Turntable Slipmats',
                'record-weight-clamp'       => 'Record Weight / Clamp',
            ],
        ],
    ];
}

// Subcategory map for a category slug, or [] for the format categories (which
// use the language facet instead). Single source of truth — mirrored by
// Seo.SUBCATS in src/js/seo.js.
function velorex_subcategories(string $catSlug): array {
    $cats = velorex_categories();
    return $cats[$catSlug]['subs'] ?? [];
}

// Categories that are departments (subcategory-driven) rather than formats.
function velorex_is_department(string $catSlug): bool {
    return !empty(velorex_categories()[$catSlug]['subs']);
}

// Reverse lookup: DB category value → URL slug.
function velorex_category_slug_for_key(string $key): ?string {
    foreach (velorex_categories() as $slug => $meta) {
        if ($meta['key'] === $key) return $slug;
    }
    return null;
}

// Language facet. Only these two are indexable; anything else 404s so we can
// never spawn an unbounded crawl space from a hand-edited URL.
function velorex_languages(): array {
    return [
        'hindi'   => ['label' => 'Hindi',   'adjective' => 'Hindi'],
        'english' => ['label' => 'English', 'adjective' => 'English'],
    ];
}

// -----------------------------------------------------------------------------
// URL + string helpers
// -----------------------------------------------------------------------------

// Precomposed Latin letters → their base letter. This is the deterministic
// fallback for velorex_slugify() when ext/intl is unavailable.
//
// It covers exactly the characters that Unicode NFD decomposes into
// "base letter + combining mark", because that is what the JS side does
// (normalize('NFD') then strip ̀-ͯ). Characters that do NOT
// decompose under NFD — æ, ø, ß, đ, þ — are deliberately absent: JS turns
// them into a separator, so PHP must too or the slugs diverge.
function velorex_translit_map(): array {
    return [
        'À'=>'A','Á'=>'A','Â'=>'A','Ã'=>'A','Ä'=>'A','Å'=>'A','Ç'=>'C',
        'È'=>'E','É'=>'E','Ê'=>'E','Ë'=>'E','Ì'=>'I','Í'=>'I','Î'=>'I','Ï'=>'I',
        'Ñ'=>'N','Ò'=>'O','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ö'=>'O',
        'Ù'=>'U','Ú'=>'U','Û'=>'U','Ü'=>'U','Ý'=>'Y',
        'à'=>'a','á'=>'a','â'=>'a','ã'=>'a','ä'=>'a','å'=>'a','ç'=>'c',
        'è'=>'e','é'=>'e','ê'=>'e','ë'=>'e','ì'=>'i','í'=>'i','î'=>'i','ï'=>'i',
        'ñ'=>'n','ò'=>'o','ó'=>'o','ô'=>'o','õ'=>'o','ö'=>'o',
        'ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u','ý'=>'y','ÿ'=>'y',
        'Ā'=>'A','ā'=>'a','Ă'=>'A','ă'=>'a','Ć'=>'C','ć'=>'c','Č'=>'C','č'=>'c',
        'Ď'=>'D','ď'=>'d','Ē'=>'E','ē'=>'e','Ĕ'=>'E','ĕ'=>'e','Ė'=>'E','ė'=>'e',
        'Ě'=>'E','ě'=>'e','Ğ'=>'G','ğ'=>'g','Ī'=>'I','ī'=>'i','Ĭ'=>'I','ĭ'=>'i',
        'İ'=>'I','Ń'=>'N','ń'=>'n','Ň'=>'N','ň'=>'n','Ō'=>'O','ō'=>'o',
        'Ŏ'=>'O','ŏ'=>'o','Ő'=>'O','ő'=>'o','Ř'=>'R','ř'=>'r','Ś'=>'S','ś'=>'s',
        'Š'=>'S','š'=>'s','Ť'=>'T','ť'=>'t','Ū'=>'U','ū'=>'u','Ŭ'=>'U','ŭ'=>'u',
        'Ů'=>'U','ů'=>'u','Ű'=>'U','ű'=>'u','Ź'=>'Z','ź'=>'z','Ż'=>'Z','ż'=>'z',
        'Ž'=>'Z','ž'=>'z',
    ];
}

// ASCII slug. Mirrored by Seo.slugify() in src/js/seo.js — keep in sync.
//
// Transliteration is done WITHOUT iconv on purpose. iconv's //TRANSLIT output
// is libc-dependent: glibc renders "Café" as "Cafe", but Windows and musl
// render it "Caf'e", which slugifies to "caf-e". That would mean local dev and
// Hostinger minting different URLs for the same product — two URLs for one
// page, which is precisely the duplicate-content problem this file exists to
// prevent. The paths below are deterministic on every platform.
function velorex_slugify(?string $s): string {
    $s = (string)$s;

    if (class_exists('Normalizer')) {
        // Preferred path: byte-identical to the JS implementation.
        $decomposed = Normalizer::normalize($s, Normalizer::FORM_D);
        if ($decomposed !== false && $decomposed !== null) {
            $s = preg_replace('/\p{Mn}/u', '', $decomposed) ?? $s;
        }
    } else {
        // ext/intl absent — explicit map produces the same result for every
        // character that realistically appears in this catalogue.
        $s = strtr($s, velorex_translit_map());
    }

    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    $s = trim((string)$s, '-');
    // Cap length so a pathological title can't produce a 2 KB URL.
    if (strlen($s) > 80) {
        $s = substr($s, 0, 80);
        $s = rtrim(substr($s, 0, strrpos($s, '-') ?: 80), '-');
    }
    return $s !== '' ? $s : 'item';
}

// Canonical product path: /product/<id>-<title>-<artist>
// The id is authoritative — the slug is decorative and may drift when a
// product is renamed. seo-render.php 301s to the current slug when it differs,
// so there is always exactly one canonical URL per product.
function velorex_product_path(array $p): string {
    $slugSource = trim(($p['title'] ?? '') . ' ' . ($p['artist'] ?? ''));
    return '/product/' . (int)$p['id'] . '-' . velorex_slugify($slugSource);
}

function velorex_product_url(array $p): string {
    return VELOREX_SITE_URL . velorex_product_path($p);
}

function velorex_category_path(string $slug, ?string $lang = null): string {
    $path = '/' . $slug;
    if ($lang !== null && $lang !== '' && isset(velorex_languages()[$lang])) {
        $path .= '/' . $lang;
    }
    return $path;
}

function velorex_category_url(string $slug, ?string $lang = null): string {
    return VELOREX_SITE_URL . velorex_category_path($slug, $lang);
}

// Turn a stored image reference into an absolute, crawlable URL.
// Product images are stored as site-relative paths ("/uploads/products/ab12.jpg")
// after the Phase 1 migration, but legacy rows may still hold a full URL or a
// base64 data: URI. data: URIs are unusable as og:image, so they fall back.
function velorex_absolute_image(?string $src): string {
    $src = trim((string)$src);
    if ($src === '') return VELOREX_DEFAULT_OG_IMAGE;
    if (str_starts_with($src, 'data:')) return VELOREX_DEFAULT_OG_IMAGE;
    if (preg_match('#^https?://#i', $src)) return $src;
    if (str_starts_with($src, '//')) return 'https:' . $src;
    return VELOREX_SITE_URL . '/' . ltrim($src, '/');
}

function velorex_e(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// Collapse whitespace and hard-truncate on a word boundary. Meta descriptions
// beyond ~160 chars get ellipsised by Google, so we cut them ourselves rather
// than let the SERP do it mid-word.
//
// Counts CHARACTERS, not bytes. It used to count bytes, so any description with
// a ₹ or an em dash (3 bytes each) was cut well short of 160 visible characters,
// and a string the SPA considered in-budget was ellipsised here — one URL, two
// descriptions.
function velorex_trim_text(?string $s, int $max = 160): string {
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags((string)$s)) ?? '');
    if ($s === '' || mb_strlen($s) <= $max) return $s;
    $cut = mb_substr($s, 0, $max - 1);
    $sp  = mb_strrpos($cut, ' ');
    if ($sp !== false && $sp > $max * 0.6) $cut = mb_substr($cut, 0, $sp);
    return rtrim($cut, " ,.;:-") . '…';
}

// -----------------------------------------------------------------------------
// Product meta description
//
// MIRRORED IN JS: Seo.productDescription() in src/js/seo.js must return the
// same string for the same product, because Seo.syncProductUrl() rewrites the
// server's tags as soon as the full product loads. Guarded by
// tests/seo-meta-parity.js.
//
// Built from real fields only — name, artist, format, label, year, condition,
// price, stock — then as much of the free-text description as fits. A field
// that is empty is left out; nothing is invented to fill the space. The result
// is guaranteed ≤ 160 characters so neither side ever has to trim it (the two
// trimming routines differ, which is how the pair drifted before).
// -----------------------------------------------------------------------------

// JS's \s, spelled out: PCRE's \s does not include the Unicode spaces JS does.
const VELOREX_WS = '[\s\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';

function velorex_collapse_ws(?string $s): string {
    $s = preg_replace('/' . VELOREX_WS . '+/u', ' ', (string)$s) ?? '';
    return preg_replace('/^ | $/u', '', $s) ?? '';
}

// String length as JavaScript measures it (UTF-16 code units), so an emoji in
// a description counts the same on both sides.
function velorex_js_len(string $s): int {
    return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2);
}

// Indian digit grouping (1,23,456) without depending on ICU on either side.
function velorex_inr(int $n): string {
    $s = (string)abs($n);
    if (strlen($s) > 3) {
        $last3 = substr($s, -3);
        $rest  = substr($s, 0, -3);
        $rest  = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
        $s = $rest . ',' . $last3;
    }
    return ($n < 0 ? '-' : '') . $s;
}

// Append whole words of $text to $prefix while the result fits $max. When the
// text does not fit whole, the last word that fits is followed by an ellipsis.
function velorex_fit_words(string $prefix, string $text, int $max): string {
    $text = velorex_collapse_ws($text);
    if ($text === '') return $prefix;
    $full = $prefix === '' ? $text : $prefix . ' ' . $text;
    if (velorex_js_len($full) <= $max) return $full;
    $out = $prefix;
    $added = false;
    foreach (explode(' ', $text) as $w) {
        $cand = $out === '' ? $w : $out . ' ' . $w;
        if (velorex_js_len($cand) > $max - 1) break;
        $out = $cand;
        $added = true;
    }
    if (!$added) return $prefix;
    return (preg_replace('/[\s,.;:\x{2013}\x{2014}-]+$/u', '', $out) ?? $out) . '…';
}

// Lower-case format phrase for running prose ("on vinyl"), keyed by DB category.
function velorex_format_phrase_for_key(string $key): string {
    $map = ['vinyl' => 'vinyl', 'cd' => 'CD', 'cassette' => 'cassette', 'bluray' => 'Blu-ray', 'dvd' => 'DVD'];
    return $map[$key] ?? '';
}

// Visible availability wording. Out-of-stock items are NOT offered as
// pre-orders: the storefront's stock guard refuses to add them to a cart, so
// "pre-order available" was a promise checkout could not keep.
function velorex_availability_text(array $p): string {
    if ((int)($p['stock'] ?? 0) > 0) return 'In stock';
    return (($p['badge'] ?? '') === 'upcoming') ? 'Coming soon' : 'Out of stock';
}

function velorex_product_meta_description(array $p): string {
    $max    = 160;
    $name   = velorex_collapse_ws((string)($p['title'] ?? ''));
    $artist = velorex_primary_artist((string)($p['artist'] ?? ''));
    $fmt    = velorex_format_phrase_for_key((string)($p['category'] ?? ''));
    $used   = (($p['condition'] ?? 'new') === 'pre-owned');

    $lead = 'Buy ' . $name;
    if ($artist !== '' && !velorex_title_contains($name, $artist)) $lead .= ' by ' . $artist;
    $saidUsed = false;
    if ($fmt !== '' && !velorex_title_contains($name, $fmt)) {
        $lead .= ' on ' . ($used ? 'pre-owned ' : '') . $fmt;
        $saidUsed = $used;
    }
    $lead .= '.';

    $specs = is_array($p['specs'] ?? null) ? $p['specs'] : [];
    $label = velorex_collapse_ws((string)($specs['label'] ?? ''));
    $year  = velorex_collapse_ws((string)($specs['year'] ?? ''));
    $facts = [];
    if ($label !== '' && $year !== '') $facts[] = 'Label: ' . $label . ' (' . $year . ').';
    elseif ($label !== '')            $facts[] = 'Label: ' . $label . '.';
    elseif ($year !== '')             $facts[] = 'Year: ' . $year . '.';
    if ($used && !$saidUsed)          $facts[] = 'Pre-owned.';

    $stock = (int)($p['stock'] ?? 0);
    $avail = $stock > 0 ? 'in stock, shipped across India.'
           : ((($p['badge'] ?? '') === 'upcoming') ? 'coming soon.' : 'currently out of stock.');
    $tail  = '₹' . velorex_inr((int)($p['price'] ?? 0)) . ' — ' . $avail;

    $core = implode(' ', array_merge([$lead], $facts, [$tail]));
    if (velorex_js_len($core) > $max) {
        $core = $lead . ' ' . $tail;               // drop the optional facts first
    }
    if (velorex_js_len($core) > $max) {
        return velorex_fit_words('', $core, $max); // pathological title length
    }
    return velorex_fit_words($core, (string)($p['description'] ?? ''), $max);
}

// -----------------------------------------------------------------------------
// Category / facet metadata
//
// One function answers "what are the title, description, H1 and intro for this
// listing?" so the server render and the sitemap cannot disagree. MIRRORED IN
// JS as Seo.categoryMeta() (title + description only) — guarded by
// tests/seo-meta-parity.js.
// -----------------------------------------------------------------------------
function velorex_category_meta(string $catSlug, ?string $lang = null, ?string $sub = null): ?array {
    $cats = velorex_categories();
    if (!isset($cats[$catSlug])) return null;
    $meta  = $cats[$catSlug];
    $label = $meta['label'];

    if ($sub !== null) {
        $subs = velorex_subcategories($catSlug);
        if (!isset($subs[$sub])) return null;
        $subLabel = $subs[$sub];
        return [
            'title'       => 'Buy ' . $subLabel . ' Online India | ' . VELOREX_SITE_NAME,
            'description' => 'Shop ' . strtolower($subLabel) . ' at Velorex Music — part of our '
                           . strtolower($label) . ' range, shipped across India.',
            'h1'          => $subLabel,
            'intro'       => ucfirst(strtolower($subLabel) . ' from the Velorex Music ' . strtolower($label) . ' range.'),
        ];
    }

    if ($lang !== null) {
        $langs = velorex_languages();
        if (!isset($langs[$lang])) return null;
        $adj = $langs[$lang]['adjective'];
        $h1  = $adj . ' ' . $label;
        if (isset($meta['facets'][$lang])) {
            return $meta['facets'][$lang] + ['h1' => $h1];
        }
        return [
            'title'       => 'Buy ' . $h1 . ' Online India | ' . VELOREX_SITE_NAME,
            'description' => 'Shop ' . strtolower($adj) . ' ' . strtolower($label)
                           . ' online in India at Velorex Music. Original releases and collector titles, delivered pan-India.',
            'h1'          => $h1,
            'intro'       => $adj . ' titles from our ' . strtolower($label) . ' collection, shipped across India.',
        ];
    }

    return [
        'title'       => $meta['title'],
        'description' => $meta['description'],
        'h1'          => $label,
        'intro'       => $meta['intro'],
    ];
}

// Image alt text from real fields: "Gomti Ke Kinare by R. D. Burman – Vinyl
// Record". Mirrored by Seo.productImageAlt() so the SPA's cards and gallery say
// the same thing. $n > 1 marks further gallery images.
function velorex_product_image_alt(array $p, int $n = 1): string {
    $name   = velorex_collapse_ws((string)($p['title'] ?? ''));
    $artist = velorex_primary_artist((string)($p['artist'] ?? ''));
    $fmt    = velorex_format_label_for_key((string)($p['category'] ?? ''));
    $alt = $name;
    if ($artist !== '' && !velorex_title_contains($name, $artist)) $alt .= ' by ' . $artist;
    if ($fmt !== '' && !velorex_title_contains($name, $fmt)) $alt .= ' – ' . $fmt;
    if ($n > 1) $alt .= ' (image ' . $n . ')';
    return $alt;
}

// The breadcrumb trail for a product: Home › Category › Language › Product.
// The language level exists only where it is a real page (/vinyl-records/hindi).
// updateBreadcrumbs() in router.js builds the same trail on the client.
function velorex_product_trail(array $p): array {
    $trail = [['name' => 'Home', 'url' => VELOREX_SITE_URL . '/']];
    $catKey  = (string)($p['category'] ?? '');
    $catSlug = velorex_category_slug_for_key($catKey);
    if ($catSlug) {
        $trail[] = ['name' => velorex_category_label_for_key($catKey), 'url' => velorex_category_url($catSlug)];
        $lang = strtolower(trim((string)($p['language'] ?? '')));
        if (!velorex_is_department($catSlug) && isset(velorex_languages()[$lang])) {
            $trail[] = ['name' => velorex_languages()[$lang]['adjective'], 'url' => velorex_category_url($catSlug, $lang)];
        }
    }
    $trail[] = ['name' => (string)($p['title'] ?? '')];
    return $trail;
}

// Visible breadcrumb trail, server-rendered into .breadcrumbs-container so a
// crawler that does not run JavaScript sees the same hierarchy the
// BreadcrumbList JSON-LD declares. Markup matches updateBreadcrumbs() in
// src/js/storefront/router.js, which replaces it on boot.
// $trail = [['name' => …, 'url' => absolute|null], …]; the last is the page.
function velorex_breadcrumbs_html(array $trail): string {
    $out = '';
    $n = count($trail);
    foreach ($trail as $i => $t) {
        $label = velorex_e($t['name']);
        if ($i === $n - 1 || empty($t['url'])) {
            $out .= '<li class="breadcrumb-item active" aria-current="page">' . $label . '</li>';
        } else {
            $path = substr($t['url'], strlen(VELOREX_SITE_URL)) ?: '/';
            $out .= '<li class="breadcrumb-item"><a href="' . velorex_e($path) . '">' . $label . '</a></li>';
        }
    }
    return $out;
}

// -----------------------------------------------------------------------------
// <head> metadata block
//
// Returns a complete string of tags. `robots` defaults to indexable; pass
// 'noindex, follow' for pages that must never enter the index (cart, profile,
// search results, auth screens).
// -----------------------------------------------------------------------------
// Remove the marked SEO block from the shell. Falls back to removing the exact
// tags velorex_meta_block()/velorex_jsonld_site() re-emit, so that an edit to
// index.html that loses the markers degrades to "still no duplicates" rather
// than silently resurrecting the bug this function exists to prevent.
function velorex_strip_shell_seo(string $html): string {
    $start = strpos($html, '<!-- velorex:seo-head:start');
    $end   = strpos($html, '<!-- velorex:seo-head:end -->');
    if ($start !== false && $end !== false && $end > $start) {
        return substr($html, 0, $start)
             . substr($html, $end + strlen('<!-- velorex:seo-head:end -->'));
    }

    $patterns = [
        '#[ 	]*<title>.*?</title>\R?#is',
        '#[ 	]*<meta\s+name="(?:description|robots|twitter:[a-z:]+)"[^>]*>\R?#i',
        '#[ 	]*<meta\s+property="(?:og|product):[a-z:]+"[^>]*>\R?#i',
        '#[ 	]*<link\s+rel="canonical"[^>]*>\R?#i',
        // Only the site-level nodes seo-lib re-emits; a page's own JSON-LD is
        // injected later and is never present in the shell.
        '#[ 	]*<script type="application/ld\+json">\s*\{[^<]*?"@id":\s*"[^"]*/\#(?:organization|website)"[^<]*?\}\s*</script>\R?#is',
    ];
    foreach ($patterns as $re) {
        $out = preg_replace($re, '', $html);
        if ($out !== null) $html = $out;
    }
    return $html;
}

// -----------------------------------------------------------------------------
// Product <title> construction
// -----------------------------------------------------------------------------
//
// MIRRORED IN JS: Seo.productTitle() in src/js/seo.js must return byte-identical
// output for the same product. Same rule as velorex_slugify() — if they drift,
// the server declares one title and the SPA rewrites it to another on hydration.
// There is a parity test in tests/seo-title-parity.js.
//
// The formula used to be:
//     <Product> — <Artist> | <Category, plural> | Buy Online India
// which produced, for a product literally named "Meenaxi Vinyl record - Tabu -
// A. R. Rehman" by "A R Rehman":
//     Meenaxi Vinyl record - Tabu - A. R. Rehman — A R Rehman | Vinyl Records | Buy Online India
// 90 characters, with the artist stated twice and the format stated twice.
// Google renders roughly the first 60, so the part that actually distinguishes
// one record from another was routinely cut off. Every one of the 20 titles
// sampled on the live site exceeded the limit (median 73, longest 225).
//
// Now: keep the product name, add the artist ONLY if the name does not already
// carry it, then add the format and the brand ONLY while they fit. Nothing is
// truncated mid-word — whole optional parts are dropped instead, so a title is
// always a complete phrase.

// Singular, per-item format labels. velorex_category_label_for_key() stays
// plural ("Vinyl Records") because it labels category PAGES; one record is a
// "Vinyl Record". Departments get no format qualifier — "Merchandise" is not a
// format and reads as noise in a product title.
function velorex_format_label_for_key(string $key): string {
    $map = [
        'vinyl'    => 'Vinyl Record',
        'cd'       => 'Audio CD',
        'cassette' => 'Cassette',
        'bluray'   => 'Blu-ray',
        'dvd'      => 'DVD',
    ];
    return $map[$key] ?? '';
}

// Soft budget for the optional tail. Google truncates display around here; the
// name and artist are never sacrificed to it, only the format and brand.
const VELOREX_TITLE_SOFT_LIMIT = 60;

// Does $haystack already say $needle? Compared through velorex_slugify() so the
// test is immune to case, punctuation and accents ("A. R. Rehman" vs
// "A R Rehman"), and so PHP and JS agree by reusing a function whose parity is
// already enforced. Substring rather than token match, so "cassettes" counts as
// already containing "Cassette".
function velorex_title_contains(string $haystack, string $needle): bool {
    $h = velorex_slugify($haystack);
    $n = velorex_slugify($needle);
    return $n !== '' && strpos($h, $n) !== false;
}

// The artist column is free text and sometimes holds a full cast list
// ("Waheeda Rehman, Rajesh Khanna, Dharmendra, …" — 130 characters on one live
// row). Take the first name: it is the strongest search term, and appending the
// whole list is what produced the 225-character title.
function velorex_primary_artist(string $artist): string {
    $first = preg_split('/\s*[,;\/]\s*|\s+&\s+/u', trim($artist))[0] ?? '';
    return trim(preg_replace('/\s+/u', ' ', $first));
}

function velorex_product_title(array $p): string {
    $name = trim(preg_replace('/\s+/u', ' ', (string)($p['title'] ?? '')));
    if ($name === '') return VELOREX_SITE_NAME;

    $artist = velorex_primary_artist((string)($p['artist'] ?? ''));
    $format = velorex_format_label_for_key((string)($p['category'] ?? ''));

    // Core: never dropped, because these are the terms people search.
    $title = $name;
    if ($artist !== '' && !velorex_title_contains($title, $artist)) {
        $title .= ' — ' . $artist;
    }

    // Tail: added only while it fits, longest-value-first.
    if ($format !== '' && !velorex_title_contains($title, $format)
        && mb_strlen($title . ' | ' . $format) <= VELOREX_TITLE_SOFT_LIMIT) {
        $title .= ' | ' . $format;
    }
    if (mb_strlen($title . ' | ' . VELOREX_SITE_NAME) <= VELOREX_TITLE_SOFT_LIMIT) {
        $title .= ' | ' . VELOREX_SITE_NAME;
    }
    return $title;
}

function velorex_meta_block(array $o): string {
    $title       = $o['title'] ?? VELOREX_SITE_NAME;
    $description = velorex_trim_text($o['description'] ?? '', 160);
    $canonical   = $o['canonical'] ?? VELOREX_SITE_URL . '/';
    $image       = $o['image'] ?? VELOREX_DEFAULT_OG_IMAGE;
    $type        = $o['type'] ?? 'website';
    $robots      = $o['robots'] ?? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    // Marks this page as server-rendered, and says for which path. src/js/seo.js
    // reads it and skips its FIRST tag rewrite when the marker matches the URL
    // the browser actually landed on, so hydration cannot overwrite what the
    // server already decided. Without this the SPA replaced the server's tags
    // on load — most damagingly turning an empty category's "noindex, follow"
    // back into "index, follow", so a thin page Google was told to skip became
    // indexable again on the render pass.
    $ssrPath = parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    if (!is_string($ssrPath) || $ssrPath === '') {
        $ssrPath = parse_url($canonical, PHP_URL_PATH) ?: '/';
    }
    $out  = '  <meta name="velorex-ssr" content="' . velorex_e($ssrPath) . "\">\n";
    $out .= '  <title>' . velorex_e($title) . "</title>\n";
    $out .= '  <meta name="description" content="' . velorex_e($description) . "\">\n";
    $out .= '  <meta name="robots" content="' . velorex_e($robots) . "\">\n";
    $out .= '  <link rel="canonical" href="' . velorex_e($canonical) . "\">\n";

    // Open Graph — controls how the link renders on WhatsApp, Facebook and
    // Instagram, which is where this store's traffic actually gets shared.
    $out .= '  <meta property="og:type" content="' . velorex_e($type) . "\">\n";
    $out .= '  <meta property="og:site_name" content="' . velorex_e(VELOREX_SITE_NAME) . "\">\n";
    $out .= '  <meta property="og:title" content="' . velorex_e($title) . "\">\n";
    $out .= '  <meta property="og:description" content="' . velorex_e($description) . "\">\n";
    $out .= '  <meta property="og:url" content="' . velorex_e($canonical) . "\">\n";
    $out .= '  <meta property="og:image" content="' . velorex_e($image) . "\">\n";
    $out .= '  <meta property="og:image:alt" content="' . velorex_e($o['imageAlt'] ?? $title) . "\">\n";
    $out .= "  <meta property=\"og:locale\" content=\"en_IN\">\n";

    if ($type === 'product' && isset($o['price'])) {
        $out .= '  <meta property="product:price:amount" content="' . velorex_e((string)$o['price']) . "\">\n";
        $out .= "  <meta property=\"product:price:currency\" content=\"INR\">\n";
        $out .= '  <meta property="product:availability" content="' . velorex_e($o['availability'] ?? 'in stock') . "\">\n";
    }

    $out .= "  <meta name=\"twitter:card\" content=\"summary_large_image\">\n";
    $out .= '  <meta name="twitter:title" content="' . velorex_e($title) . "\">\n";
    $out .= '  <meta name="twitter:description" content="' . velorex_e($description) . "\">\n";
    $out .= '  <meta name="twitter:image" content="' . velorex_e($image) . "\">\n";

    return $out;
}

// Emit a <script type="application/ld+json"> block. JSON_UNESCAPED_SLASHES
// keeps URLs readable in view-source; JSON_UNESCAPED_UNICODE keeps ₹ and
// Devanagari intact. JSON_HEX_TAG escapes < and > to < / > so a
// product title containing a literal "</script>" cannot break out of the
// script element — that would be both an XSS vector and broken markup.
function velorex_jsonld(array $data): string {
    $json = json_encode(
        $data,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG
    );
    if ($json === false) return '';
    return "  <script type=\"application/ld+json\">{$json}</script>\n";
}

// -----------------------------------------------------------------------------
// JSON-LD graph builders
// -----------------------------------------------------------------------------

// Organization + WebSite. Emitted on every page. The WebSite node carries a
// SearchAction so Google can render a sitelinks search box for brand queries.
function velorex_jsonld_site(): string {
    $org = [
        '@context' => 'https://schema.org',
        '@type'    => 'Organization',
        '@id'      => VELOREX_SITE_URL . '/#organization',
        'name'     => VELOREX_SITE_NAME,
        'url'      => VELOREX_SITE_URL . '/',
        'logo'     => VELOREX_LOGO_IMAGE,
        'description' => 'Velorex Music sells original vinyl records, audio CDs, cassettes, Blu-rays and DVDs across India, specialising in Hindi film music and collectible pressings.',
        'contactPoint' => [
            '@type'             => 'ContactPoint',
            'telephone'         => '+91-79060-27807',
            'contactType'       => 'customer service',
            'areaServed'        => 'IN',
            'availableLanguage' => ['en', 'hi'],
        ],
        'sameAs' => [
            'https://www.facebook.com/share/1H7s3i2jui/',
            'https://instagram.com/vinyl_cassettes_audio_deal',
            'https://whatsapp.com/channel/0029Va6LNYy4yltVj40o1I3i',
            'https://youtube.com/channel/UCtUtHqlTQk6jQ-_g4DyB48g',
        ],
    ];
    $site = [
        '@context' => 'https://schema.org',
        '@type'    => 'WebSite',
        '@id'      => VELOREX_SITE_URL . '/#website',
        'url'      => VELOREX_SITE_URL . '/',
        'name'     => VELOREX_SITE_NAME,
        'publisher' => ['@id' => VELOREX_SITE_URL . '/#organization'],
        'inLanguage' => 'en-IN',
        'potentialAction' => [
            '@type'  => 'SearchAction',
            'target' => [
                '@type'       => 'EntryPoint',
                'urlTemplate' => VELOREX_SITE_URL . '/products?search={search_term_string}',
            ],
            'query-input' => 'required name=search_term_string',
        ],
    ];
    return velorex_jsonld($org) . velorex_jsonld($site);
}

// LocalBusiness — the "record store near me" / "vinyl store Gurugram" cluster.
// Two branches, so we emit a Store node per address.
function velorex_jsonld_local_business(): string {
    $branches = [
        ['id' => 'gurugram', 'locality' => 'Gurugram', 'region' => 'Haryana', 'street' => 'Sector 52', 'postal' => '122003'],
        ['id' => 'meerut',   'locality' => 'Meerut',   'region' => 'Uttar Pradesh', 'street' => 'Meerut', 'postal' => '250001'],
    ];
    $out = '';
    foreach ($branches as $b) {
        $out .= velorex_jsonld([
            '@context' => 'https://schema.org',
            '@type'    => 'Store',
            '@id'      => VELOREX_SITE_URL . '/#store-' . $b['id'],
            'name'     => VELOREX_SITE_NAME . ' — ' . $b['locality'],
            'url'      => VELOREX_SITE_URL . '/',
            'image'    => VELOREX_LOGO_IMAGE,
            'telephone' => '+91-79060-27807',
            'parentOrganization' => ['@id' => VELOREX_SITE_URL . '/#organization'],
            'priceRange' => '₹₹',
            'currenciesAccepted' => 'INR',
            'paymentAccepted' => 'UPI, Credit Card, Debit Card, Net Banking',
            'address' => [
                '@type'           => 'PostalAddress',
                'streetAddress'   => $b['street'],
                'addressLocality' => $b['locality'],
                'addressRegion'   => $b['region'],
                'postalCode'      => $b['postal'],
                'addressCountry'  => 'IN',
            ],
            'areaServed' => ['@type' => 'Country', 'name' => 'India'],
        ]);
    }
    return $out;
}

// Remembers the trail the page declared in JSON-LD so seo-render.php can draw
// the SAME trail visibly — one source, so the markup and the visible bar cannot
// disagree. Call with no argument to read.
function velorex_last_trail(?array $set = null): ?array {
    static $trail = null;
    if ($set !== null) $trail = $set;
    return $trail;
}

// BreadcrumbList. $trail is [['name' => ..., 'url' => absolute|null], ...].
// The last item conventionally omits the url (it is the current page).
function velorex_jsonld_breadcrumbs(array $trail): string {
    velorex_last_trail($trail);
    $items = [];
    $pos = 1;
    foreach ($trail as $t) {
        $item = [
            '@type'    => 'ListItem',
            'position' => $pos++,
            'name'     => $t['name'],
        ];
        if (!empty($t['url'])) $item['item'] = $t['url'];
        $items[] = $item;
    }
    return velorex_jsonld([
        '@context'        => 'https://schema.org',
        '@type'           => 'BreadcrumbList',
        'itemListElement' => $items,
    ]);
}

// Product + Offer. This is what earns the price / availability / star rating
// treatment in Google results, which is the single biggest CTR lever on a
// product page.
function velorex_jsonld_product(array $p): string {
    $url   = velorex_product_url($p);
    $stock = (int)($p['stock'] ?? 0);

    $images = [];
    if (!empty($p['images']) && is_array($p['images'])) {
        foreach ($p['images'] as $img) {
            $abs = velorex_absolute_image($img);
            if ($abs !== VELOREX_DEFAULT_OG_IMAGE) $images[] = $abs;
        }
    }
    if (!$images) {
        $single = velorex_absolute_image($p['image'] ?? '');
        if ($single !== VELOREX_DEFAULT_OG_IMAGE) $images[] = $single;
    }

    $desc = trim((string)($p['description'] ?? ''));
    $offer = [
        '@type'         => 'Offer',
        'url'           => $url,
        'priceCurrency' => 'INR',
        'price'         => (string)(int)($p['price'] ?? 0),
        // No priceValidUntil: the shop makes no promise about how long a price
        // holds, and a date computed as "today + 1 year" was an invented claim.
        // Google no longer warns on its absence.
        //
        // Out of stock is OutOfStock. It was PreOrder, but the cart refuses
        // stock-0 items, so the markup offered something nobody could buy.
        'availability'  => $stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        // Was hardcoded to NewCondition. Now that pre-owned stock exists,
        // that would be a false claim in structured data — Google surfaces
        // condition in shopping results, and mislabelling used goods as new
        // is both a rich-result violation and a consumer-trust problem.
        'itemCondition' => (($p['condition'] ?? 'new') === 'pre-owned')
            ? 'https://schema.org/UsedCondition'
            : 'https://schema.org/NewCondition',
        'seller'        => ['@id' => VELOREX_SITE_URL . '/#organization'],
    ];
    // Shipping details ONLY when this product's charge is actually known. The
    // zone rate depends on the delivery address, so a product on the zone rate
    // has no single honest number; the old block declared a destination with
    // no rate, which Search Console reports as incomplete.
    $shipRate = null;
    if (!empty($p['freeShipping'])) $shipRate = 0;
    elseif (isset($p['shippingCharge']) && $p['shippingCharge'] !== null) $shipRate = (int)$p['shippingCharge'];
    if ($shipRate !== null) {
        $offer['shippingDetails'] = [
            '@type' => 'OfferShippingDetails',
            'shippingRate' => ['@type' => 'MonetaryAmount', 'value' => (string)$shipRate, 'currency' => 'INR'],
            'shippingDestination' => ['@type' => 'DefinedRegion', 'addressCountry' => 'IN'],
        ];
    }

    $data = [
        '@context'    => 'https://schema.org',
        '@type'       => 'Product',
        '@id'         => $url . '#product',
        'name'        => $p['title'] ?? '',
        // The visible description, or the same generated sentence the meta
        // description uses — never text that is not on the page.
        'description' => $desc !== '' ? velorex_trim_text($desc, 400) : velorex_product_meta_description($p),
        'sku'         => 'VLX-' . (int)$p['id'],
        'url'         => $url,
        'category'    => velorex_category_label_for_key($p['category'] ?? ''),
        'offers'      => $offer,
    ];

    // Only a real photo of this product. With none on file the property is
    // omitted: it used to fall back to the brand card (og-default.jpg), which
    // told Google a promotional banner was a picture of the record. Missing is
    // honest — and Search Console's "missing image" warning is the prompt to
    // photograph it.
    if ($images) $data['image'] = array_values(array_unique($images));

    // Brand = the record label, when the listing names one. It used to be the
    // ARTIST, which is not a brand: "R. D. Burman" did not manufacture the
    // record, Saregama did. With no label on file the property is omitted
    // rather than guessed.
    $label = trim((string)($p['specs']['label'] ?? ''));
    if ($label !== '') $data['brand'] = ['@type' => 'Brand', 'name' => $label];

    // Extra descriptive properties Google uses for matching long-tail queries
    // like "Sholay vinyl R.D. Burman 1975".
    $props = [];
    if (!empty($p['artist'])) {
        $props[] = ['@type' => 'PropertyValue', 'name' => 'Artist', 'value' => (string)$p['artist']];
    }
    if (!empty($p['musicDirector'])) {
        $props[] = ['@type' => 'PropertyValue', 'name' => 'Music Director', 'value' => $p['musicDirector']];
    }
    if (!empty($p['language'])) {
        $props[] = ['@type' => 'PropertyValue', 'name' => 'Language', 'value' => ucfirst((string)$p['language'])];
    }
    if (!empty($p['specs']) && is_array($p['specs'])) {
        foreach (['format' => 'Format', 'speed' => 'Speed', 'label' => 'Label', 'year' => 'Year', 'genre' => 'Genre'] as $k => $labelText) {
            if (!empty($p['specs'][$k])) {
                $props[] = ['@type' => 'PropertyValue', 'name' => $labelText, 'value' => (string)$p['specs'][$k]];
            }
        }
    }
    if ($props) $data['additionalProperty'] = $props;

    // NO aggregateRating, deliberately. products.rating and products.reviews
    // are numbers typed into the admin form (the form defaults the rating to
    // 4.5); there is no customer review system and no review text on the page.
    // Google requires a rating to come from genuine, visible reviews —
    // publishing these would be fake review markup, a manual-action risk for
    // the whole domain. Add it back only alongside a real review feature.

    return velorex_jsonld($data);
}

// ItemList for a category page — tells Google the page is a curated listing
// and which products it contains, in order.
function velorex_jsonld_item_list(array $products, string $name, string $url): string {
    $items = [];
    $pos = 1;
    foreach ($products as $p) {
        $items[] = [
            '@type'    => 'ListItem',
            'position' => $pos++,
            'url'      => velorex_product_url($p),
            'name'     => $p['title'] ?? '',
        ];
    }
    return velorex_jsonld([
        '@context'        => 'https://schema.org',
        '@type'           => 'ItemList',
        'name'            => $name,
        'url'             => $url,
        'numberOfItems'   => count($items),
        'itemListElement' => $items,
    ]);
}

// Article JSON-LD for a blog post. This is what lets a post qualify for the
// article treatment in results (headline, date, image) rather than a bare link.
function velorex_jsonld_article(array $p): string {
    $url = VELOREX_SITE_URL . '/blog/' . $p['slug'];
    $img = !empty($p['cover_image'])
        ? velorex_absolute_image($p['cover_image'])
        : VELOREX_DEFAULT_OG_IMAGE;

    $data = [
        '@context'         => 'https://schema.org',
        '@type'            => 'BlogPosting',
        '@id'              => $url . '#article',
        'headline'         => velorex_trim_text($p['title'] ?? '', 110), // Google truncates past ~110
        'description'      => velorex_trim_text($p['excerpt'] ?? '', 200),
        'image'            => [$img],
        'url'              => $url,
        'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $url],
        'inLanguage'       => 'en-IN',
        // A named author is a person; with none on the post, the shop itself
        // is the author. It was always typed Organization, which mislabelled
        // every post a person had signed.
        'author'    => (trim((string)($p['author'] ?? '')) !== '' && trim((string)$p['author']) !== VELOREX_SITE_NAME)
            ? ['@type' => 'Person', 'name' => trim((string)$p['author'])]
            : ['@type' => 'Organization', 'name' => VELOREX_SITE_NAME, 'url' => VELOREX_SITE_URL . '/'],
        'publisher' => ['@id' => VELOREX_SITE_URL . '/#organization'],
    ];
    if (!empty($p['published_at'])) {
        $ts = strtotime($p['published_at']);
        if ($ts) $data['datePublished'] = date('c', $ts);
    }
    if (!empty($p['updated_at'])) {
        $ts = strtotime($p['updated_at']);
        if ($ts) $data['dateModified'] = date('c', $ts);
    }
    return velorex_jsonld($data);
}

function velorex_category_label_for_key(string $key): string {
    foreach (velorex_categories() as $meta) {
        if ($meta['key'] === $key) return $meta['label'];
    }
    return 'Music';
}

// =============================================================================
// Phase 2 — collection graph (composer collections, facet rules, pre-owned)
// =============================================================================

// Composer / artist collections. Deliberately a short, hand-curated registry —
// NOT one page per artist in the catalogue. A composer earns a page only when
// the shelf holds enough of their records for the page to be worth landing on
// (VELOREX_ARTIST_MIN_PRODUCTS), and each page carries written context rather
// than a bare product grid. Facts in `about` are limited to well-documented
// ones; anything about Velorex's own stock is computed from the database at
// render time, never written here.
//
// `aliases` are normalised with velorex_norm_person(): letters only, lower
// case, so "R.D. Burman", "R. D. Burman" and "RD Burman" all match "rdburman".
const VELOREX_ARTIST_MIN_PRODUCTS = 8;

function velorex_artist_collections(): array {
    return [
        'r-d-burman' => [
            'name'    => 'R. D. Burman',
            'aliases' => ['rdburman', 'rahuldevburman'],
            'title'   => 'R. D. Burman Vinyl Records | Bollywood Soundtrack LPs',
            'description' => 'R. D. Burman soundtracks on vinyl — Hindi film LPs from the composer known as Pancham, new reissues and pre-owned copies, shipped across India by Velorex Music.',
            'about'   => [
                'Rahul Dev Burman (1939–1994), known to listeners as Pancham, was the son of composer S. D. Burman and one of the defining voices of Hindi film music from the 1960s into the 1990s. His scores include Amar Prem (1972), Sholay (1975) and 1942: A Love Story (1994), and his long partnerships with Kishore Kumar and Asha Bhosle produced many of the era\'s best-known songs.',
                'On vinyl, his soundtracks are among the most collected Bollywood records — both as original pressings and as the reissues labels such as Saregama have brought back to the shelf.',
            ],
        ],
        'a-r-rahman' => [
            'name'    => 'A. R. Rahman',
            'aliases' => ['arrahman', 'arrehman', 'allahrakharahman'],
            'title'   => 'A. R. Rahman Vinyl Records | Film Soundtrack LPs',
            'description' => 'A. R. Rahman soundtracks on vinyl — Hindi film score LPs from the Oscar-winning composer, new and pre-owned, shipped across India by Velorex Music.',
            'about'   => [
                'A. R. Rahman, born in Chennai in 1967, made his film debut with Mani Ratnam\'s Roja (1992) and went on to score Hindi films including Dil Se.. (1998), Taal (1999), Lagaan (2001) and Rang De Basanti (2006). His work for Slumdog Millionaire won two Academy Awards in 2009, for Best Original Score and Best Original Song.',
                'His soundtracks have been reissued on vinyl in recent years, bringing 1990s and 2000s film music to the format for the first time for many listeners.',
            ],
        ],
    ];
}

function velorex_norm_person(?string $s): string {
    return preg_replace('/[^a-z]/', '', strtolower((string)$s)) ?? '';
}

// Which registered artist collection, if any, a product belongs to. Matches the
// music director first, then the first credited artist.
function velorex_product_artist_slug(array $p): ?string {
    $md    = velorex_norm_person($p['musicDirector'] ?? '');
    $first = velorex_norm_person(velorex_primary_artist((string)($p['artist'] ?? '')));
    foreach (velorex_artist_collections() as $slug => $a) {
        if (($md !== '' && in_array($md, $a['aliases'], true))
            || ($first !== '' && in_array($first, $a['aliases'], true))) {
            return $slug;
        }
    }
    return null;
}

// Indexing rule for a language facet (/vinyl-records/hindi). MIRRORED by
// Seo.facetStatus() in src/js/seo.js.
//   'duplicate' — the facet holds every product its parent does, so it is the
//                 same page twice: canonical to the parent.
//   'thin'      — too few products to be worth a search landing: noindex.
//   'index'     — a genuinely distinct, useful listing.
const VELOREX_FACET_MIN_PRODUCTS = 6;

function velorex_facet_status(int $facetCount, int $parentCount): string {
    if ($facetCount > 0 && $facetCount >= $parentCount) return 'duplicate';
    if ($facetCount < VELOREX_FACET_MIN_PRODUCTS) return 'thin';
    return 'index';
}

// Pre-owned hub copy follows what is actually second-hand on the shelf. With
// only vinyl in stock the old copy ("Pre-owned Vinyl, CDs & Cassettes")
// promised formats that were not there, and /pre-owned/vinyl-records showed
// the identical grid under a second URL. $formats = DB category keys that have
// pre-owned stock. MIRRORED by Seo.preownedMeta().
function velorex_preowned_meta(array $formats, ?string $catSlug = null): array {
    $cats = velorex_categories();
    if ($catSlug !== null && isset($cats[$catSlug])) {
        $label = $cats[$catSlug]['label'];
        return [
            'title'       => 'Pre-owned ' . $label . ' | Buy Used ' . $label . ' Online India',
            'description' => 'Shop pre-owned ' . strtolower($label) . ' in India at Velorex Music. Second-hand and collector copies, condition-checked before dispatch, with pan-India delivery.',
            'h1'          => 'Pre-owned ' . $label,
        ];
    }
    $formats = array_values(array_unique($formats));
    if (count($formats) === 1 && $formats[0] === 'vinyl') {
        return [
            'title'       => 'Pre-owned Vinyl Records | Buy Used LPs Online in India',
            'description' => 'Pre-owned Bollywood and Hindi film vinyl LPs, including first editions and 2LP sets — each copy condition-checked before dispatch and shipped across India.',
            'h1'          => 'Pre-owned Vinyl Records',
        ];
    }
    return [
        'title'       => 'Pre-owned Vinyl, CDs & Cassettes | Buy Used Records India',
        'description' => 'Shop pre-owned vinyl records, audio CDs, cassettes, Blu-rays and DVDs in India. Second-hand and collector copies, condition-checked before dispatch.',
        'h1'          => 'Pre-owned',
    ];
}

// Composer page count line, from the live shelf. MIRRORED by artistCountLine()
// in src/js/storefront/collections.js.
function velorex_artist_count_line(int $count, int $inStock): string {
    $noun = $count === 1 ? 'record' : 'records';
    if ($inStock === $count) return $count . ' ' . $noun . ' on the shelf, all in stock';
    return $count . ' ' . $noun . ' on the shelf · ' . $inStock . ' in stock';
}

// The written context on a composer page. MIRRORED by the SPA renderer.
function velorex_artist_about_html(array $a, array $products = []): string {
    $out = '';
    foreach ($a['about'] as $para) $out .= '<p>' . velorex_e($para) . '</p>';
    return $out;
}

// -----------------------------------------------------------------------------
// Journal post <title> and description. MIRRORED by Seo.blogMetaTitle() /
// Seo.blogMetaDescription() in src/js/seo.js (tests/seo-meta-parity.js).
//
// An editor-written SEO title wins. Otherwise the headline, with the
// " | Velorex Journal" suffix only while it fits 60 characters — appending it
// unconditionally produced 97-character titles that Google cut mid-word.
// -----------------------------------------------------------------------------
function velorex_blog_meta_title(string $title, ?string $metaTitle = null): string {
    $m = velorex_collapse_ws((string)$metaTitle);
    if ($m !== '') return $m;
    $t = velorex_collapse_ws($title);
    $withSuffix = $t . ' | Velorex Journal';
    return velorex_js_len($withSuffix) <= VELOREX_TITLE_SOFT_LIMIT ? $withSuffix : $t;
}

function velorex_blog_meta_description(?string $excerpt, ?string $metaDescription = null): string {
    $m = velorex_collapse_ws((string)$metaDescription);
    return velorex_fit_words('', $m !== '' ? $m : (string)$excerpt, 160);
}

// The computed "On the Velorex shelf" sentence on a composer page. MIRRORED by
// initPageArtist() in src/js/storefront/collections.js (same class, same text).
function velorex_artist_shelf_html(string $shelf): string {
    return $shelf === '' ? '' : '<p class="artist-shelf">' . velorex_e($shelf) . '</p>';
}
