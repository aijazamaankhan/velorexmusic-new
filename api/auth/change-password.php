<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$userId = require_user();
$body = read_json_body();

$current = (string)($body['currentPassword'] ?? '');
$new = (string)($body['newPassword'] ?? '');

if ($current === '' || $new === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Both current and new password are required']);
    exit;
}
if (strlen($new) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'New password must be at least 8 characters']);
    exit;
}

$pdo = db();

try {
    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($current, $row['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Current password is incorrect']);
        exit;
    }

    $hash = password_hash($new, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id');
    $stmt->execute([':h' => $hash, ':id' => $userId]);

    // Invalidate every other session for this user; keep the current one alive.
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    $currentToken = preg_match('/^Bearer\s+([a-f0-9]{32,128})$/', $auth, $m) ? $m[1] : '';
    $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE user_id = :u AND token != :t');
    $stmt->execute([':u' => $userId, ':t' => $currentToken]);

    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
