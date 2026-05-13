<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    if ($method === 'GET') {
        // Admin sees all orders; regular users see only their own.
        if (is_admin_request()) {
            $stmt = $pdo->query('SELECT o.id, o.user_id, o.order_data, o.created_at,
                u.email as user_email, u.first_name, u.last_name
                FROM orders o LEFT JOIN users u ON u.id = o.user_id
                ORDER BY o.created_at DESC');
            $rows = $stmt->fetchAll();
            $orders = array_map(function ($r) {
                $o = json_decode($r['order_data'], true);
                if (!is_array($o)) $o = [];
                $o['id'] = $r['id'];
                $o['userId'] = $r['user_id'] !== null ? (int)$r['user_id'] : null;
                $o['userEmail'] = $r['user_email'];
                $o['userName'] = trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''));
                if (!isset($o['createdAt'])) $o['createdAt'] = $r['created_at'];
                return $o;
            }, $rows);
            echo json_encode($orders);
            exit;
        }

        $userId = require_user();
        $stmt = $pdo->prepare('SELECT id, order_data, created_at FROM orders WHERE user_id = :u ORDER BY created_at DESC');
        $stmt->execute([':u' => $userId]);
        $rows = $stmt->fetchAll();
        $orders = array_map(function ($r) {
            $o = json_decode($r['order_data'], true);
            if (!is_array($o)) $o = [];
            $o['id'] = $r['id'];
            if (!isset($o['createdAt'])) $o['createdAt'] = $r['created_at'];
            return $o;
        }, $rows);
        echo json_encode($orders);
        exit;
    }

    if ($method === 'POST') {
        // Checkout now requires login.
        $userId = require_user();
        $body = read_json_body();
        if (empty($body['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing order id']);
            exit;
        }

        // Decrement product stock atomically with the order insert, so concurrent
        // orders for the same SKU can't oversell. SELECT ... FOR UPDATE locks each
        // affected product row inside the transaction.
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
        $deductions = [];
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $pid = isset($item['id']) ? (int)$item['id'] : 0;
            $qty = isset($item['qty']) ? (int)$item['qty'] : 0;
            if ($pid <= 0 || $qty <= 0) continue;
            // Combine duplicate line items defensively.
            $deductions[$pid] = ($deductions[$pid] ?? 0) + $qty;
        }

        $pdo->beginTransaction();
        try {
            if ($deductions) {
                $sel = $pdo->prepare('SELECT stock FROM products WHERE id = :id FOR UPDATE');
                $upd = $pdo->prepare('UPDATE products SET stock = :s WHERE id = :id');
                foreach ($deductions as $pid => $qty) {
                    $sel->execute([':id' => $pid]);
                    $row = $sel->fetch();
                    if (!$row) continue; // Product was deleted; skip but don't fail the order.
                    $current = (int)$row['stock'];
                    $newStock = $current - $qty;
                    if ($newStock < 0) $newStock = 0; // Clamp; never go negative.
                    $upd->execute([':s' => $newStock, ':id' => $pid]);
                }
            }
            $stmt = $pdo->prepare('INSERT INTO orders (id, user_id, order_data) VALUES (:id, :u, :data)');
            $stmt->execute([
                ':id' => $body['id'],
                ':u' => $userId,
                ':data' => json_encode($body),
            ]);
            $pdo->commit();
        } catch (Exception $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
