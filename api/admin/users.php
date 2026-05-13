<?php
require_once __DIR__ . '/../config.php';

require_admin();
$pdo = db();

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query('SELECT u.*,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
            (SELECT COALESCE(SUM(JSON_EXTRACT(order_data, "$.total")), 0) FROM orders o WHERE o.user_id = u.id) as total_spent
            FROM users u ORDER BY u.created_at DESC');
        $rows = $stmt->fetchAll();
        $users = array_map(function ($r) {
            $u = user_public_fields($r);
            $u['orderCount'] = (int)$r['order_count'];
            $u['totalSpent'] = (float)$r['total_spent'];
            return $u;
        }, $rows);
        echo json_encode($users);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = read_json_body();
        $action = $body['action'] ?? '';

        if ($action === 'reset-password') {
            $userId = (int)($body['userId'] ?? 0);
            $newPass = (string)($body['newPassword'] ?? '');
            if (!$userId || strlen($newPass) < 8) {
                http_response_code(400);
                echo json_encode(['error' => 'userId and newPassword (>= 8 chars) are required']);
                exit;
            }
            $hash = password_hash($newPass, PASSWORD_DEFAULT);
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id');
            $stmt->execute([':h' => $hash, ':id' => $userId]);
            // Force logout of all existing sessions for this user
            $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE user_id = :id');
            $stmt->execute([':id' => $userId]);
            $pdo->commit();
            echo json_encode(['ok' => true]);
            exit;
        }

        if ($action === 'delete-user') {
            $userId = (int)($body['userId'] ?? 0);
            if (!$userId) {
                http_response_code(400);
                echo json_encode(['error' => 'userId is required']);
                exit;
            }
            $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
            $stmt->execute([':id' => $userId]);
            echo json_encode(['ok' => true]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
