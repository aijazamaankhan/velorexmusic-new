<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM products ORDER BY id');
        $rows = $stmt->fetchAll();
        $products = array_map('row_to_product', $rows);
        echo json_encode($products);
        exit;
    }

    if ($method === 'POST') {
        require_admin();
        $body = read_json_body();

        // Bulk replace: if "products" array is sent, treat as full list (delete then insert).
        // This matches the localStorage semantics where saveProducts(arr) overwrites everything.
        if (isset($body['products']) && is_array($body['products'])) {
            $pdo->beginTransaction();
            $pdo->exec('DELETE FROM products');
            foreach ($body['products'] as $p) {
                upsert_product($pdo, $p);
            }
            $pdo->commit();
            echo json_encode(['ok' => true, 'count' => count($body['products'])]);
            exit;
        }

        // Single upsert
        if (!isset($body['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing product id']);
            exit;
        }
        upsert_product($pdo, $body);
        echo json_encode(['ok' => true, 'id' => (int)$body['id']]);
        exit;
    }

    if ($method === 'DELETE') {
        require_admin();
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            exit;
        }
        $stmt = $pdo->prepare('DELETE FROM products WHERE id = :id');
        $stmt->execute([':id' => $id]);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
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

    $sql = "REPLACE INTO products
        (id, title, artist, category, language, price, original_price, description, image, images,
         rating, reviews, badge, stock, music_director, track_listing, specs, people)
        VALUES
        (:id, :title, :artist, :category, :language, :price, :original_price, :description, :image, :images,
         :rating, :reviews, :badge, :stock, :music_director, :track_listing, :specs, :people)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
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
        ':images' => $imagesArr ? json_encode($imagesArr) : null,
        ':rating' => isset($p['rating']) ? (float)$p['rating'] : 0,
        ':reviews' => isset($p['reviews']) ? (int)$p['reviews'] : 0,
        ':badge' => $p['badge'] ?? null,
        ':stock' => isset($p['stock']) ? (int)$p['stock'] : 0,
        ':music_director' => $p['musicDirector'] ?? $p['music_director'] ?? null,
        ':track_listing' => $p['trackListing'] ?? $p['track_listing'] ?? null,
        ':specs' => isset($p['specs']) ? json_encode($p['specs']) : null,
        ':people' => isset($p['people']) ? json_encode($p['people']) : json_encode([]),
    ]);
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
