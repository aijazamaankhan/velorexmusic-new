<?php
// =============================================================================
// /api/collections.php — the collection graph for the storefront (public, GET)
//
//   ?path=/vinyl-records/hindi → { related }            related links under a listing
//   ?product=12                → { related, products }  links + "you may also like"
//   ?artist=r-d-burman         → { artist, products, related }  composer collection
//
// Computed by api/_collections_helpers.php — the same functions seo-render.php
// uses for the server HTML, so a visitor and a crawler see the same links.
// Read-only; carries no personal data.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_collections_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $pdo = db();

    if (isset($_GET['path'])) {
        $path = (string)$_GET['path'];
        if (!preg_match('#^/[a-z0-9-]+(?:/[a-z0-9-]+)?$#', $path)) {
            http_response_code(400);
            echo json_encode(['error' => 'Bad path']);
            exit;
        }
        echo json_encode(['related' => collections_related_for_path($pdo, $path)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (isset($_GET['product'])) {
        $id = (int)$_GET['product'];
        $p = null;
        foreach (collections_products($pdo) as $q) if ((int)$q['id'] === $id) { $p = $q; break; }
        if (!$p) {
            http_response_code(404);
            echo json_encode(['error' => 'Product not found']);
            exit;
        }
        echo json_encode([
            'related'  => collections_related_for_product($pdo, $p),
            'products' => array_map(static fn($q) => (int)$q['id'], collections_related_products($pdo, $p)),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (isset($_GET['artist'])) {
        $slug = preg_replace('/[^a-z0-9-]/', '', (string)$_GET['artist']);
        $status = collections_artist_status($pdo, $slug);
        if ($status === 'missing') {
            http_response_code(404);
            echo json_encode(['error' => 'Collection not found']);
            exit;
        }
        $a = velorex_artist_collections()[$slug];
        echo json_encode([
            'artist' => [
                'slug'        => $slug,
                'name'        => $a['name'],
                'title'       => $a['title'],
                'description' => $a['description'],
                'about'       => $a['about'],
                'shelf'       => collections_artist_shelf($pdo, $slug),
                'indexable'   => $status === 'index',
            ],
            'products' => array_map(static fn($q) => (int)$q['id'], collections_artist_products($pdo, $slug)),
            'related'  => collections_related_for_path($pdo, '/artists/' . $slug),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Pass path, product or artist']);
} catch (Throwable $e) {
    error_log('[collections] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
