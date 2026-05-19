<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_claim_guest_orders.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = read_json_body();
$email = strtolower(trim($body['email'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Email and password are required']);
    exit;
}

$pdo = db();

try {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :e');
    $stmt->execute([':e' => $email]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        // Generic error to prevent email enumeration
        http_response_code(401);
        echo json_encode(['error' => 'Invalid email or password']);
        exit;
    }

    $userId = (int)$row['id'];

    // Claim-on-login: attach any guest orders matching this email to the
    // account. Most useful for the post-purchase upgrade flow when the
    // customer already had an account but didn't ticket "save my info"
    // before — they log in afterwards and their just-placed order is
    // automatically attached. Best-effort: claim failure must not block
    // login (the user is properly authenticated regardless).
    $claimed = 0;
    try {
        $claimed = claim_guest_orders_for_user($pdo, $userId, $email);
    } catch (Throwable $claimErr) {
        error_log('[login] claim_guest_orders failed for user ' . $userId . ': ' . $claimErr->getMessage());
    }

    $token = create_session_for_user($userId);

    echo json_encode([
        'ok' => true,
        'token' => $token,
        'user' => user_public_fields($row),
        'claimedGuestOrders' => $claimed,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
