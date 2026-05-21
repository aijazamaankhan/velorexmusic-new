<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_products_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    if ($method === 'GET') {
        // Lean list shape — see row_to_product_lean() in _products_helpers.php
        // for why the heavy columns (description, images gallery, track_listing,
        // specs, people) are NOT fetched here. Heavy detail is served by
        // /api/product.php?id=N on demand from the product detail page.
        //
        // Selecting an explicit column list (rather than `SELECT *`) means
        // MySQL doesn't ship the multi-MB LONGTEXT columns over the
        // DB → PHP wire either. Without this, even though we'd drop them
        // from the JSON, PHP would still pull them into memory per row.
        $stmt = $pdo->query(
            'SELECT id, title, artist, category, language, price, original_price, '
          . 'image, rating, reviews, badge, stock, music_director '
          . 'FROM products ORDER BY id'
        );
        $rows = $stmt->fetchAll();
        $products = array_map('row_to_product_lean', $rows);
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

