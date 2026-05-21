<?php
// Single-product detail endpoint.
//
// Why this exists: Phase 1 of the storefront perf rewrite. The list endpoint
// /api/products.php now returns only the lean fields needed to render product
// cards (~30 KB total instead of 27 MB). When a customer clicks a card, the
// detail page calls THIS endpoint to fetch the heavy fields (description,
// full image gallery, track listing, specs, people).
//
// Contract:
//   GET /api/product.php?id=N
//   200: { ...full product including images[], description, specs, etc. }
//   400: { error: "Missing or invalid id" }
//   404: { error: "Product not found" }
//
// Open to public callers (same as /api/products.php). No auth required.

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_products_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid id']);
        exit;
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM products WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Product not found']);
        exit;
    }

    echo json_encode(row_to_product($row));
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
