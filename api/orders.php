<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

const ORDER_STATUSES = [
    'pending', 'processing', 'shipped', 'delivered', 'cancelled',
];

// Legacy status aliases collapse to one of the 5 canonical values.
const ORDER_STATUS_ALIASES = [
    'confirmed' => 'processing',
    'packed' => 'processing',
    'out_for_delivery' => 'shipped',
    'returned' => 'cancelled',
    'refunded' => 'cancelled',
];

function map_order_status($s): string {
    $s = strtolower(trim((string)$s));
    if ($s === '') return 'pending';
    if (isset(ORDER_STATUS_ALIASES[$s])) return ORDER_STATUS_ALIASES[$s];
    if (in_array($s, ORDER_STATUSES, true)) return $s;
    return 'pending';
}

// Single JSON shape returned to clients. $includeUser adds admin-only join fields.
function row_to_order_public(array $r, bool $includeUser = false): array {
    $o = json_decode($r['order_data'] ?? '', true);
    if (!is_array($o)) $o = [];
    $o['id'] = $r['id'];
    if (!isset($o['createdAt'])) $o['createdAt'] = $r['created_at'] ?? null;
    $o['status'] = map_order_status($r['status'] ?? 'pending');
    $o['carrier'] = $r['carrier'] ?? null;
    $o['trackingNumber'] = $r['tracking_number'] ?? null;
    $o['trackingUrl'] = $r['tracking_url'] ?? null;
    $o['adminNote'] = $r['admin_note'] ?? null;
    $o['shippedAt'] = $r['shipped_at'] ?? null;
    $o['deliveredAt'] = $r['delivered_at'] ?? null;
    $hist = $r['status_history'] ?? null;
    $decodedHist = $hist ? (json_decode($hist, true) ?: []) : [];
    // Normalize legacy status names inside historical entries too.
    foreach ($decodedHist as &$h) {
        if (isset($h['status'])) $h['status'] = map_order_status($h['status']);
    }
    unset($h);
    $o['statusHistory'] = $decodedHist;
    if ($includeUser) {
        $o['userId'] = isset($r['user_id']) && $r['user_id'] !== null ? (int)$r['user_id'] : null;
        $o['userEmail'] = $r['user_email'] ?? null;
        $o['userName'] = trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''));
    }
    return $o;
}

try {
    if ($method === 'GET') {
        // Public anonymous-tracking path: ?id=...&email=...
        // Matches the order when the email used at checkout matches the user's account email.
        if (!is_admin_request() && current_user_id_or_null() === null
            && isset($_GET['id']) && isset($_GET['email'])) {
            $id = trim((string)$_GET['id']);
            $email = strtolower(trim((string)$_GET['email']));
            if ($id === '' || $email === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Missing id or email']);
                exit;
            }
            $stmt = $pdo->prepare('SELECT o.*, u.email AS user_email
                FROM orders o LEFT JOIN users u ON u.id = o.user_id
                WHERE o.id = :id AND LOWER(u.email) = :e LIMIT 1');
            $stmt->execute([':id' => $id, ':e' => $email]);
            $row = $stmt->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Order not found']);
                exit;
            }
            echo json_encode(row_to_order_public($row, false));
            exit;
        }

        // Admin: all orders.
        if (is_admin_request()) {
            $stmt = $pdo->query('SELECT o.*, u.email AS user_email, u.first_name, u.last_name
                FROM orders o LEFT JOIN users u ON u.id = o.user_id
                ORDER BY o.created_at DESC');
            $rows = $stmt->fetchAll();
            echo json_encode(array_map(fn($r) => row_to_order_public($r, true), $rows));
            exit;
        }

        // Logged-in user: own orders.
        $userId = require_user();
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE user_id = :u ORDER BY created_at DESC');
        $stmt->execute([':u' => $userId]);
        echo json_encode(array_map(fn($r) => row_to_order_public($r, false), $stmt->fetchAll()));
        exit;
    }

    if ($method === 'POST') {
        $userId = require_user();
        $body = read_json_body();
        if (empty($body['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing order id']);
            exit;
        }

        // Decrement product stock atomically with the order insert.
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
        $deductions = [];
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $pid = isset($item['id']) ? (int)$item['id'] : 0;
            $qty = isset($item['qty']) ? (int)$item['qty'] : 0;
            if ($pid <= 0 || $qty <= 0) continue;
            $deductions[$pid] = ($deductions[$pid] ?? 0) + $qty;
        }

        $initialHistory = [[
            'status' => 'pending',
            'at' => date('Y-m-d H:i:s'),
            'by' => 'system',
            'note' => 'Order placed',
        ]];

        $pdo->beginTransaction();
        try {
            if ($deductions) {
                $sel = $pdo->prepare('SELECT stock FROM products WHERE id = :id FOR UPDATE');
                $upd = $pdo->prepare('UPDATE products SET stock = :s WHERE id = :id');
                foreach ($deductions as $pid => $qty) {
                    $sel->execute([':id' => $pid]);
                    $row = $sel->fetch();
                    if (!$row) continue;
                    $current = (int)$row['stock'];
                    $newStock = max(0, $current - $qty);
                    $upd->execute([':s' => $newStock, ':id' => $pid]);
                }
            }
            $stmt = $pdo->prepare('INSERT INTO orders
                (id, user_id, status, order_data, status_history)
                VALUES (:id, :u, :st, :data, :hist)');
            $stmt->execute([
                ':id' => $body['id'],
                ':u' => $userId,
                ':st' => 'pending',
                ':data' => json_encode($body),
                ':hist' => json_encode($initialHistory),
            ]);
            $pdo->commit();
        } catch (Exception $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($method === 'PATCH') {
        require_admin();
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing order id']);
            exit;
        }
        $body = read_json_body();

        $newStatus = null;
        if (array_key_exists('status', $body)) {
            $raw = strtolower(trim((string)$body['status']));
            // Collapse legacy aliases (confirmed/packed/out_for_delivery/returned/refunded)
            // to one of the 5 canonical statuses.
            if (isset(ORDER_STATUS_ALIASES[$raw])) $raw = ORDER_STATUS_ALIASES[$raw];
            if (!in_array($raw, ORDER_STATUSES, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid status. Allowed: ' . implode(', ', ORDER_STATUSES)]);
                exit;
            }
            $newStatus = $raw;
        }

        // Use a sentinel so we can distinguish "field omitted" from "field set to null/blank".
        $UNSET = '__unset__';
        $normalizeNullable = function ($v) {
            if ($v === null) return null;
            $v = trim((string)$v);
            return $v === '' ? null : $v;
        };
        $carrier        = array_key_exists('carrier', $body)         ? $normalizeNullable($body['carrier'])        : $UNSET;
        $trackingNumber = array_key_exists('trackingNumber', $body)  ? $normalizeNullable($body['trackingNumber']) : $UNSET;
        $trackingUrl    = array_key_exists('trackingUrl', $body)     ? $normalizeNullable($body['trackingUrl'])    : $UNSET;
        $adminNote      = array_key_exists('adminNote', $body)       ? $normalizeNullable($body['adminNote'])      : $UNSET;
        $note = isset($body['note']) ? trim((string)$body['note']) : '';

        $pdo->beginTransaction();
        try {
            $sel = $pdo->prepare('SELECT * FROM orders WHERE id = :id FOR UPDATE');
            $sel->execute([':id' => $id]);
            $row = $sel->fetch();
            if (!$row) {
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'Order not found']);
                exit;
            }

            $currentStatus = $row['status'] ?? 'pending';
            $statusChanged = $newStatus !== null && $newStatus !== $currentStatus;

            $updates = [];
            $params = [':id' => $id];

            if ($newStatus !== null) {
                $updates[] = 'status = :st';
                $params[':st'] = $newStatus;
                if ($newStatus === 'shipped' && $row['shipped_at'] === null) {
                    $updates[] = 'shipped_at = NOW()';
                }
                if ($newStatus === 'delivered' && $row['delivered_at'] === null) {
                    $updates[] = 'delivered_at = NOW()';
                }
            }
            if ($carrier !== $UNSET)        { $updates[] = 'carrier = :car';        $params[':car'] = $carrier; }
            if ($trackingNumber !== $UNSET) { $updates[] = 'tracking_number = :tn'; $params[':tn']  = $trackingNumber; }
            if ($trackingUrl !== $UNSET)    { $updates[] = 'tracking_url = :tu';    $params[':tu']  = $trackingUrl; }
            if ($adminNote !== $UNSET)      { $updates[] = 'admin_note = :an';      $params[':an']  = $adminNote; }

            $shipmentChanged = $carrier !== $UNSET || $trackingNumber !== $UNSET || $trackingUrl !== $UNSET;
            if ($statusChanged || $shipmentChanged || $note !== '') {
                $hist = $row['status_history'] ? (json_decode($row['status_history'], true) ?: []) : [];
                $hist[] = [
                    'status' => $newStatus ?? $currentStatus,
                    'at' => date('Y-m-d H:i:s'),
                    'by' => 'admin',
                    'note' => $note,
                ];
                $updates[] = 'status_history = :hist';
                $params[':hist'] = json_encode($hist);
            }

            if (!$updates) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['error' => 'No changes to apply']);
                exit;
            }

            $sql = 'UPDATE orders SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $pdo->prepare($sql)->execute($params);

            $r = $pdo->prepare('SELECT o.*, u.email AS user_email, u.first_name, u.last_name
                FROM orders o LEFT JOIN users u ON u.id = o.user_id
                WHERE o.id = :id LIMIT 1');
            $r->execute([':id' => $id]);
            $updated = $r->fetch();
            $pdo->commit();
        } catch (Exception $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }

        echo json_encode(['ok' => true, 'order' => row_to_order_public($updated, true)]);
        exit;
    }

    if ($method === 'DELETE') {
        require_admin();
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing order id']);
            exit;
        }
        $stmt = $pdo->prepare('DELETE FROM orders WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Order not found']);
            exit;
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
