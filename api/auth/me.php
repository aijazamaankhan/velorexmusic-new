<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$userId = require_user();

try {
    $stmt = db()->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    // Aggregate stats (orders count + total spent)
    $statsStmt = db()->prepare('SELECT COUNT(*) as count, COALESCE(SUM(JSON_EXTRACT(order_data, "$.total")), 0) as total FROM orders WHERE user_id = :u');
    $statsStmt->execute([':u' => $userId]);
    $stats = $statsStmt->fetch();

    $user = user_public_fields($row);
    $user['stats'] = [
        'orderCount' => (int)$stats['count'],
        'totalSpent' => (float)$stats['total'],
    ];

    echo json_encode(['user' => $user]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
