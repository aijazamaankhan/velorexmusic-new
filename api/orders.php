<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    if ($method === 'GET') {
        require_admin();
        $stmt = $pdo->query('SELECT id, order_data, created_at FROM orders ORDER BY created_at DESC');
        $rows = $stmt->fetchAll();
        $orders = array_map(function ($r) {
            $o = json_decode($r['order_data'], true);
            if (!is_array($o)) $o = [];
            $o['id'] = $r['id'];
            if (!isset($o['createdAt'])) {
                $o['createdAt'] = $r['created_at'];
            }
            return $o;
        }, $rows);
        echo json_encode($orders);
        exit;
    }

    if ($method === 'POST') {
        $body = read_json_body();
        if (empty($body['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing order id']);
            exit;
        }
        $stmt = $pdo->prepare('INSERT INTO orders (id, order_data) VALUES (:id, :data)');
        $stmt->execute([
            ':id' => $body['id'],
            ':data' => json_encode($body),
        ]);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
