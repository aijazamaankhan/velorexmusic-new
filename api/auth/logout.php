<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Pull the raw token to delete its session row.
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (preg_match('/^Bearer\s+([a-f0-9]{32,128})$/', $auth, $m)) {
    try {
        $stmt = db()->prepare('DELETE FROM user_sessions WHERE token = :t');
        $stmt->execute([':t' => $m[1]]);
    } catch (Exception $e) {
        // Logout should always succeed from the client's perspective
    }
}

echo json_encode(['ok' => true]);
