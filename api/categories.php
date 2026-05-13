<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT name FROM categories ORDER BY sort_order, name');
        echo json_encode($stmt->fetchAll(PDO::FETCH_COLUMN));
        exit;
    }

    if ($method === 'POST') {
        require_admin();
        $body = read_json_body();
        if (!isset($body['categories']) || !is_array($body['categories'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing categories array']);
            exit;
        }

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM categories');
        $stmt = $pdo->prepare('INSERT INTO categories (name, sort_order) VALUES (:name, :sort_order)');
        $i = 0;
        foreach ($body['categories'] as $cat) {
            if (!is_string($cat) || trim($cat) === '') continue;
            $stmt->execute([':name' => trim($cat), ':sort_order' => $i++]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'count' => $i]);
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
