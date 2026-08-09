<?php
// Shared product persistence helpers used by both /api/products.php (single-item
// upsert + bulk-replace) and /api/products-bulk-upsert.php (bulk CSV import).
// Kept here so a schema change touches one definition, not two.

// Cached column-existence check so we only pay the metadata query once per request.
// Lets the endpoint keep working before the `images` migration has been run on a
// given server (e.g. immediately after a code deploy to Hostinger).
function products_has_images_column(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) return $has;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM products LIKE 'images'");
        $has = (bool)$stmt->fetch();
    } catch (Exception $e) {
        $has = false;
    }
    return $has;
}

// Does products.item_condition exist? If not, add it — once per process, and
// never retried after a failure.
//
// The column is named item_condition rather than `condition` because CONDITION
// is a reserved word in MySQL 8 and would need backtick-quoting in every single
// query that touches it.
//
// This auto-migrates, matching what the blog does, so a deploy is not left
// half-working while someone remembers phpMyAdmin. It is a narrower risk than
// it looks: adding a nullable column with a default to a ~70-row InnoDB table
// is effectively instantaneous. If the ALTER fails for any reason (permissions,
// say) every product simply reads as "new" and the site keeps working — the
// caller never sees an error.
function products_has_condition_column(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) return $has;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM products LIKE 'item_condition'");
        $has = (bool)$stmt->fetch();
        if (!$has) {
            $pdo->exec(
                "ALTER TABLE products
                    ADD COLUMN item_condition ENUM('new','pre-owned')
                    NOT NULL DEFAULT 'new' AFTER stock"
            );
            $has = true;
        }
    } catch (Throwable $e) {
        error_log('[products] item_condition column unavailable: ' . $e->getMessage());
        $has = false;
    }
    return $has;
}

// Normalise whatever the client sent into one of the two stored values.
// Accepts the boolean the admin form is most likely to produce as well as the
// string, so neither shape can silently store an invalid enum.
function normalize_condition($v): string {
    if (is_bool($v)) return $v ? 'pre-owned' : 'new';
    $s = strtolower(trim((string)$v));
    if ($s === 'pre-owned' || $s === 'preowned' || $s === 'pre owned'
        || $s === 'used' || $s === '1' || $s === 'true') {
        return 'pre-owned';
    }
    return 'new';
}

// products.subcategory — the second level under the Merchandise and Vinyl Care
// departments (t-shirts, record-cleaning-brush, …). Null for the five format
// categories, which use the language facet instead.
//
// Auto-added on first use, same pattern and same reasoning as item_condition:
// adding a nullable column to a small InnoDB table is instant, and if the ALTER
// fails everything degrades to "no subcategory" rather than erroring.
function products_has_subcategory_column(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) return $has;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM products LIKE 'subcategory'");
        $has = (bool)$stmt->fetch();
        if (!$has) {
            $pdo->exec('ALTER TABLE products ADD COLUMN subcategory VARCHAR(60) NULL AFTER category');
            $has = true;
        }
    } catch (Throwable $e) {
        error_log('[products] subcategory column unavailable: ' . $e->getMessage());
        $has = false;
    }
    return $has;
}

// products.free_shipping + products.shipping_charge — per-product delivery,
// replacing the old "free over ₹5,000" rule. Auto-added on first use, same
// pattern and reasoning as item_condition/subcategory.
//
//   free_shipping = 1  → this product never adds a delivery charge
//   shipping_charge    → the admin's own rate for this product. NULL means
//                        "use the zone rate" (₹49 NCR / ₹99 rest / ₹199 remote),
//                        so existing products keep behaving as they do today.
function products_has_shipping_columns(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) return $has;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM products LIKE 'free_shipping'");
        $has = (bool)$stmt->fetch();
        if (!$has) {
            $pdo->exec(
                'ALTER TABLE products
                    ADD COLUMN free_shipping TINYINT(1) NOT NULL DEFAULT 0 AFTER stock,
                    ADD COLUMN shipping_charge INT NULL AFTER free_shipping'
            );
            $has = true;
        }
    } catch (Throwable $e) {
        error_log('[products] shipping columns unavailable: ' . $e->getMessage());
        $has = false;
    }
    return $has;
}

function upsert_product(PDO $pdo, array $p): void {
    // Normalise the gallery: accept either `images` (array of URLs / data: URLs)
    // or just `image` (single primary). Always persist the full list as JSON in
    // `images` so the customer page can render the gallery.
    $imagesArr = isset($p['images']) && is_array($p['images']) ? array_values(array_filter($p['images'], 'is_string')) : [];
    $primary = $p['image'] ?? ($imagesArr[0] ?? null);
    if ($primary && !in_array($primary, $imagesArr, true)) {
        array_unshift($imagesArr, $primary);
    }

    $hasImages = products_has_images_column($pdo);
    $hasCond   = products_has_condition_column($pdo);
    $hasSub    = products_has_subcategory_column($pdo);
    $hasShip   = products_has_shipping_columns($pdo);
    $cols  = 'id, title, artist, category, language, price, original_price, description, image, '
           . ($hasImages ? 'images, ' : '')
           . ($hasCond ? 'item_condition, ' : '')
           . ($hasSub ? 'subcategory, ' : '')
           . ($hasShip ? 'free_shipping, shipping_charge, ' : '')
           . 'rating, reviews, badge, stock, music_director, track_listing, specs, people';
    $vals  = ':id, :title, :artist, :category, :language, :price, :original_price, :description, :image, '
           . ($hasImages ? ':images, ' : '')
           . ($hasCond ? ':item_condition, ' : '')
           . ($hasSub ? ':subcategory, ' : '')
           . ($hasShip ? ':free_shipping, :shipping_charge, ' : '')
           . ':rating, :reviews, :badge, :stock, :music_director, :track_listing, :specs, :people';
    $sql = "REPLACE INTO products ($cols) VALUES ($vals)";

    $params = [
        ':id' => (int)$p['id'],
        ':title' => $p['title'] ?? '',
        ':artist' => $p['artist'] ?? '',
        ':category' => $p['category'] ?? '',
        ':language' => $p['language'] ?? null,
        ':price' => isset($p['price']) ? (int)$p['price'] : 0,
        ':original_price' => isset($p['originalPrice']) && $p['originalPrice'] !== null
            ? (int)$p['originalPrice']
            : (isset($p['original_price']) && $p['original_price'] !== null ? (int)$p['original_price'] : null),
        ':description' => $p['description'] ?? null,
        ':image' => $primary,
        ':rating' => isset($p['rating']) ? (float)$p['rating'] : 0,
        ':reviews' => isset($p['reviews']) ? (int)$p['reviews'] : 0,
        ':badge' => $p['badge'] ?? null,
        ':stock' => isset($p['stock']) ? (int)$p['stock'] : 0,
        ':music_director' => $p['musicDirector'] ?? $p['music_director'] ?? null,
        ':track_listing' => $p['trackListing'] ?? $p['track_listing'] ?? null,
        ':specs' => isset($p['specs']) ? json_encode($p['specs']) : null,
        ':people' => isset($p['people']) ? json_encode($p['people']) : json_encode([]),
    ];
    if ($hasImages) {
        $params[':images'] = $imagesArr ? json_encode($imagesArr) : null;
    }
    if ($hasCond) {
        // Accept either `condition` (API shape) or `itemCondition`/`preOwned`.
        $raw = $p['condition'] ?? $p['itemCondition'] ?? $p['preOwned'] ?? 'new';
        $params[':item_condition'] = normalize_condition($raw);
    }
    if ($hasSub) {
        $sub = trim((string)($p['subcategory'] ?? ''));
        // Slug-shaped only; anything else is dropped rather than stored, so a
        // stray value can never mint a URL the router does not understand.
        $params[':subcategory'] = preg_match('/^[a-z0-9-]{1,60}$/', $sub) ? $sub : null;
    }
    if ($hasShip) {
        $params[':free_shipping'] = !empty($p['freeShipping']) ? 1 : 0;
        // Blank/absent means "use the zone rate", which is different from 0
        // ("charge nothing") — so an empty string must persist as NULL.
        $charge = $p['shippingCharge'] ?? null;
        $params[':shipping_charge'] = ($charge === null || $charge === '')
            ? null : max(0, (int)$charge);
    }

    $pdo->prepare($sql)->execute($params);
}

function row_to_product(array $r): array {
    $images = [];
    if (!empty($r['images'])) {
        $decoded = json_decode($r['images'], true);
        if (is_array($decoded)) $images = array_values(array_filter($decoded, 'is_string'));
    }
    if (!$images && !empty($r['image'])) {
        $images = [$r['image']];
    }
    return [
        'id' => (int)$r['id'],
        'title' => $r['title'],
        'artist' => $r['artist'],
        'category' => $r['category'],
        'language' => $r['language'],
        'price' => (int)$r['price'],
        'originalPrice' => $r['original_price'] !== null ? (int)$r['original_price'] : null,
        'description' => $r['description'],
        'image' => $r['image'],
        'images' => $images,
        'rating' => $r['rating'] !== null ? (float)$r['rating'] : 0,
        'reviews' => (int)$r['reviews'],
        'badge' => $r['badge'],
        'stock' => (int)$r['stock'],
        'musicDirector' => $r['music_director'],
        'trackListing' => $r['track_listing'],
        'condition' => $r['item_condition'] ?? 'new',
        'subcategory' => $r['subcategory'] ?? null,
        'freeShipping' => !empty($r['free_shipping']),
        'shippingCharge' => isset($r['shipping_charge']) && $r['shipping_charge'] !== null ? (int)$r['shipping_charge'] : null,
        'specs' => $r['specs'] ? json_decode($r['specs'], true) : null,
        'people' => $r['people'] ? json_decode($r['people'], true) : [],
    ];
}

// Lean shape for the products list endpoint. Excludes the heavy fields
// (description, full image gallery, track_listing, specs, people) that are
// only needed on the product detail page — those are served by /api/product.php
// keyed by id. This is the reason /api/products.php drops from ~27 MB to ~30 KB
// for a 66-product catalog after migration: the per-product cover URL is
// short (~50 bytes) instead of a base64 payload (~400 KB).
function row_to_product_lean(array $r): array {
    return [
        'id' => (int)$r['id'],
        'title' => $r['title'],
        'artist' => $r['artist'],
        'category' => $r['category'],
        'language' => $r['language'],
        'price' => (int)$r['price'],
        'originalPrice' => $r['original_price'] !== null ? (int)$r['original_price'] : null,
        'image' => $r['image'], // primary/cover only — gallery is fetched via /api/product.php
        'rating' => $r['rating'] !== null ? (float)$r['rating'] : 0,
        'reviews' => (int)$r['reviews'],
        'badge' => $r['badge'],
        'stock' => (int)$r['stock'],
        'musicDirector' => $r['music_director'],
        'condition' => $r['item_condition'] ?? 'new',
        'subcategory' => $r['subcategory'] ?? null,
        'freeShipping' => !empty($r['free_shipping']),
        'shippingCharge' => isset($r['shipping_charge']) && $r['shipping_charge'] !== null ? (int)$r['shipping_charge'] : null,
    ];
}
