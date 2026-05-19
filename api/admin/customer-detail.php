<?php
// Admin-only endpoint that batches the per-customer drawer data (orders +
// saved addresses + active sessions). Keeps the drawer fast by avoiding
// three round-trips on each open. Read-only.
require_once __DIR__ . '/../config.php';

require_admin();
$pdo = db();

$userId = (int)($_GET['userId'] ?? 0);
if (!$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'userId is required']);
    exit;
}

try {
    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    // Orders. Decode the JSON blob so the frontend gets a uniform shape.
    $stmt = $pdo->prepare('SELECT id, order_data, created_at FROM orders WHERE user_id = :u ORDER BY created_at DESC');
    $stmt->execute([':u' => $userId]);
    $orders = array_map(function ($r) {
        $data = json_decode($r['order_data'] ?? '', true);
        if (!is_array($data)) $data = [];
        $data['id']        = $data['id']        ?? $r['id'];
        $data['createdAt'] = $data['createdAt'] ?? $r['created_at'];
        return $data;
    }, $stmt->fetchAll());

    // Saved addresses (mirrors row_to_address() in api/addresses.php; duplicated
    // here so admin reads don't pull in customer-auth code paths).
    $stmt = $pdo->prepare('SELECT * FROM addresses WHERE user_id = :u ORDER BY is_default DESC, updated_at DESC');
    $stmt->execute([':u' => $userId]);
    $addresses = array_map(function ($r) {
        return [
            'id'          => (int)$r['id'],
            'label'       => $r['label'],
            'fullName'    => $r['full_name'],
            'phone'       => $r['phone'],
            'line1'       => $r['line1'],
            'line2'       => $r['line2'],
            'landmark'    => $r['landmark'],
            'city'        => $r['city'],
            'state'       => $r['state'],
            'postalCode'  => $r['postal_code'],
            'countryCode' => $r['country_code'],
            'gstin'       => $r['gstin'],
            'isDefault'   => (bool)$r['is_default'],
            'createdAt'   => $r['created_at'],
            'updatedAt'   => $r['updated_at'],
        ];
    }, $stmt->fetchAll());

    // Active sessions — just metadata. The token itself stays server-side; the
    // admin only needs the count + last-issued timestamp to make a decision.
    $stmt = $pdo->prepare('SELECT created_at, expires_at FROM user_sessions WHERE user_id = :u AND expires_at > NOW() ORDER BY created_at DESC');
    $stmt->execute([':u' => $userId]);
    $sessions = array_map(function ($r) {
        return [
            'createdAt' => $r['created_at'],
            'expiresAt' => $r['expires_at'],
        ];
    }, $stmt->fetchAll());

    echo json_encode([
        'orders'    => $orders,
        'addresses' => $addresses,
        'sessions'  => $sessions,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
