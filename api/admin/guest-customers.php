<?php
// Rolled-up view of guest checkouts, grouped by email. Surfaces the same
// shape as /api/admin/users.php so the admin Customers panel can swap tables
// without bespoke rendering. A "guest customer" here = any orders row with
// user_id IS NULL, keyed by the email captured in order_data.contact.email.
//
// Why server-side rollup: the admin orders panel already loads /api/orders.php
// which returns the full per-order list. Rolling up there would duplicate
// JSON-decode work on every render. Group-by in MySQL is one round-trip and
// gives us a stable row per email regardless of how many guest orders exist.

require_once __DIR__ . '/../config.php';

require_admin();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // JSON_UNQUOTE+JSON_EXTRACT (long form) over the shortcut ->>'$.path'
    // for older MySQL builds Hostinger sometimes serves on shared plans.
    // LOWER on email keeps the grouping case-insensitive — a guest who
    // typed Alice@x.com on the first order and alice@x.com on the second
    // rolls up to one row.
    $sql = "SELECT
              LOWER(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email'))) AS email,
              MAX(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.fullName'))) AS full_name,
              MAX(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.phone'))) AS phone,
              COUNT(*) AS order_count,
              COALESCE(SUM(JSON_EXTRACT(order_data, '$.total')), 0) AS total_spent,
              MIN(created_at) AS first_order_at,
              MAX(created_at) AS last_order_at
            FROM orders
            WHERE user_id IS NULL
              AND JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email')) IS NOT NULL
              AND JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email')) <> ''
            GROUP BY email
            ORDER BY last_order_at DESC";
    $rows = $pdo->query($sql)->fetchAll();

    // For each email, also tell the UI whether that email matches a
    // registered users row. The admin can then jump to the existing account
    // with one click instead of wondering "did this guest already sign up?"
    $emails = array_filter(array_map(fn($r) => $r['email'], $rows));
    $registeredMap = [];
    if (!empty($emails)) {
        $placeholders = implode(',', array_fill(0, count($emails), '?'));
        $stmt = $pdo->prepare("SELECT id, LOWER(email) AS email FROM users WHERE LOWER(email) IN ($placeholders)");
        $stmt->execute(array_values($emails));
        foreach ($stmt->fetchAll() as $u) {
            $registeredMap[$u['email']] = (int)$u['id'];
        }
    }

    $out = array_map(function($r) use ($registeredMap) {
        $email = $r['email'];
        return [
            'email'         => $email,
            'fullName'      => $r['full_name'],
            'phone'         => $r['phone'],
            'orderCount'    => (int)$r['order_count'],
            'totalSpent'    => (float)$r['total_spent'],
            'firstOrderAt'  => $r['first_order_at'],
            'lastOrderAt'   => $r['last_order_at'],
            'registeredUserId' => $registeredMap[$email] ?? null,
        ];
    }, $rows);

    echo json_encode($out);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
