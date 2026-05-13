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
$firstName = trim((string)($body['firstName'] ?? ''));
$lastName = trim((string)($body['lastName'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}
if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Password must be at least 8 characters']);
    exit;
}
if ($firstName === '') {
    http_response_code(400);
    echo json_encode(['error' => 'First name is required']);
    exit;
}

$pdo = db();

try {
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :e');
    $stmt->execute([':e' => $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'An account with this email already exists']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash, first_name, last_name) VALUES (:e, :h, :f, :l)');
    $stmt->execute([':e' => $email, ':h' => $hash, ':f' => $firstName, ':l' => $lastName]);
    $userId = (int)$pdo->lastInsertId();

    $token = create_session_for_user($userId);
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();

    echo json_encode([
        'ok' => true,
        'token' => $token,
        'user' => user_public_fields($row),
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
