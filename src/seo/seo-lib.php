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
        'vinyl-records' => [
            'key'   => 'vinyl',
            'label' => 'Vinyl Records',
            'title' => 'Buy Vinyl Records Online India | Hindi & English LP Records',
            'description' => 'Shop original vinyl records online in India — Bollywood LPs, Hindi film soundtracks, English rock and jazz pressings. R.D. Burman, Kishore Kumar, Lata Mangeshkar and more. Free shipping over ₹5,000, delivered pan-India.',
            'intro' => 'Original and reissue vinyl records shipped across India. Our collection spans Hindi film soundtracks and rare Bollywood pressings alongside English rock, jazz and classical LPs — curated for collectors who care about pressing quality.',
        ],
        'audio-cds' => [
            'key'   => 'cd',
            'label' => 'Audio CDs',
            'title' => 'Buy Audio CDs Online India | Hindi & English Music CDs',
            'description' => 'Buy audio CDs online in India — Bollywood soundtracks, ghazals, classical and English albums. Sealed and pre-owned music CDs with pan-India delivery and free shipping over ₹5,000.',
            'intro' => 'A carefully checked catalogue of audio CDs covering Hindi film music, ghazals, Indian classical and English albums. Every disc is inspected before dispatch.',
        ],
        'cassettes' => [
            'key'   => 'cassette',
            'label' => 'Cassettes',
            'title' => 'Buy Audio Cassettes Online India | Vintage Bollywood Tapes',
            'description' => 'Shop vintage audio cassettes online in India — original Bollywood tapes, Hindi film soundtracks and English albums. Rare pre-recorded cassettes for collectors, delivered across India.',
            'intro' => 'Pre-recorded cassettes from the golden era of Hindi film music, plus English titles. Popular with collectors rebuilding a childhood tape deck collection.',
        ],
        'blu-ray-movies' => [
            'key'   => 'bluray',
            'label' => 'Blu-ray Movies',
            'title' => 'Buy Blu-ray Movies Online India | Hindi & English Blu-rays',
            'description' => 'Buy Blu-ray discs online in India — Bollywood classics, Hindi cinema restorations and English films in HD. Original sealed Blu-rays with fast pan-India shipping.',
            'intro' => 'High-definition Blu-ray releases spanning restored Hindi cinema and English films. Original pressings only — no unauthorised copies.',
        ],
        'dvd-movies' => [
            'key'   => 'dvd',
            'label' => 'DVD Movies',
            'title' => 'Buy DVD Movies Online India | Bollywood & English DVDs',
            'description' => 'Shop DVD movies online in India — Bollywood classics, regional cinema and English films. Original DVDs with pan-India delivery and free shipping over ₹5,000.',
            'intro' => 'Original DVD releases covering Bollywood classics, regional Indian cinema and English films, including many long out-of-print titles.',
        ],
    ];
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
function velorex_trim_text(?string $s, int $max = 160): string {
    $s = trim(preg_replace('/\s+/', ' ', strip_tags((string)$s)) ?? '');
    if ($s === '' || strlen($s) <= $max) return $s;
    $cut = substr($s, 0, $max - 1);
    $sp  = strrpos($cut, ' ');
    if ($sp !== false && $sp > $max * 0.6) $cut = substr($cut, 0, $sp);
    return rtrim($cut, " ,.;:-") . '…';
}

// -----------------------------------------------------------------------------
// <head> metadata block
//
// Returns a complete string of tags. `robots` defaults to indexable; pass
// 'noindex, follow' for pages that must never enter the index (cart, profile,
// search results, auth screens).
// -----------------------------------------------------------------------------
function velorex_meta_block(array $o): string {
    $title       = $o['title'] ?? VELOREX_SITE_NAME;
    $description = velorex_trim_text($o['description'] ?? '', 160);
    $canonical   = $o['canonical'] ?? VELOREX_SITE_URL . '/';
    $image       = $o['image'] ?? VELOREX_DEFAULT_OG_IMAGE;
    $type        = $o['type'] ?? 'website';
    $robots      = $o['robots'] ?? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    $out  = '  <title>' . velorex_e($title) . "</title>\n";
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

// BreadcrumbList. $trail is [['name' => ..., 'url' => absolute|null], ...].
// The last item conventionally omits the url (it is the current page).
function velorex_jsonld_breadcrumbs(array $trail): string {
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
    if (!$images) $images[] = velorex_absolute_image($p['image'] ?? '');

    $data = [
        '@context'    => 'https://schema.org',
        '@type'       => 'Product',
        '@id'         => $url . '#product',
        'name'        => $p['title'] ?? '',
        'image'       => array_values(array_unique($images)),
        'description' => velorex_trim_text($p['description'] ?? ($p['title'] ?? ''), 400),
        'sku'         => 'VLX-' . (int)$p['id'],
        'url'         => $url,
        'category'    => velorex_category_label_for_key($p['category'] ?? ''),
        'brand'       => ['@type' => 'Brand', 'name' => $p['artist'] ?: VELOREX_SITE_NAME],
        'offers'      => [
            '@type'         => 'Offer',
            'url'           => $url,
            'priceCurrency' => 'INR',
            'price'         => (string)(int)($p['price'] ?? 0),
            // Offers without a validity window get flagged in Search Console.
            'priceValidUntil' => date('Y-m-d', strtotime('+1 year')),
            'availability'  => $stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/PreOrder',
            'itemCondition' => 'https://schema.org/NewCondition',
            'seller'        => ['@id' => VELOREX_SITE_URL . '/#organization'],
            'shippingDetails' => [
                '@type' => 'OfferShippingDetails',
                'shippingDestination' => [
                    '@type' => 'DefinedRegion',
                    'addressCountry' => 'IN',
                ],
            ],
        ],
    ];

    // Extra descriptive properties Google uses for matching long-tail queries
    // like "Sholay vinyl R.D. Burman 1975".
    $props = [];
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

    // Only advertise a rating when there is a real review behind it. Emitting
    // aggregateRating with reviewCount 0 is a structured-data violation and
    // gets the whole rich result suppressed.
    $reviews = (int)($p['reviews'] ?? 0);
    $rating  = (float)($p['rating'] ?? 0);
    if ($reviews > 0 && $rating > 0) {
        $data['aggregateRating'] = [
            '@type'       => 'AggregateRating',
            'ratingValue' => (string)$rating,
            'reviewCount' => (string)$reviews,
            'bestRating'  => '5',
            'worstRating' => '1',
        ];
    }

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
        'author'    => ['@type' => 'Organization', 'name' => $p['author'] ?: VELOREX_SITE_NAME],
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
