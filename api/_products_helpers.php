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
    $cols  = 'id, title, artist, category, language, price, original_price, description, image, '
           . ($hasImages ? 'images, ' : '')
           . 'rating, reviews, badge, stock, music_director, track_listing, specs, people';
    $vals  = ':id, :title, :artist, :category, :language, :price, :original_price, :description, :image, '
           . ($hasImages ? ':images, ' : '')
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
    ];
}
