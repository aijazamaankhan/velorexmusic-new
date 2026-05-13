<?php
require_once __DIR__ . '/../config.php';

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
    $token = create_session_for_user($userId);

    echo json_encode([
        'ok' => true,
        'token' => $token,
        'user' => user_public_fields($row),
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
