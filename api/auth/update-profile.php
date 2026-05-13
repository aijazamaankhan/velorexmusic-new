<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$userId = require_user();
$body = read_json_body();

$firstName = isset($body['firstName']) ? trim((string)$body['firstName']) : null;
$lastName = isset($body['lastName']) ? trim((string)$body['lastName']) : null;
$phone = isset($body['phone']) ? trim((string)$body['phone']) : null;
$dob = isset($body['dateOfBirth']) ? trim((string)$body['dateOfBirth']) : null;
$prefs = isset($body['musicPreferences']) ? trim((string)$body['musicPreferences']) : null;
$email = isset($body['email']) ? strtolower(trim((string)$body['email'])) : null;

$pdo = db();

try {
    // If email is changing, validate format and uniqueness
    if ($email !== null && $email !== '') {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid email address']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :e AND id != :id');
        $stmt->execute([':e' => $email, ':id' => $userId]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'That email is already in use by another account']);
            exit;
        }
    }

    $dobValid = ($dob === null || $dob === '') ? null : $dob;

    $stmt = $pdo->prepare('UPDATE users SET
        first_name = COALESCE(:f, first_name),
        last_name = COALESCE(:l, last_name),
        phone = COALESCE(:p, phone),
        date_of_birth = :d,
        music_preferences = COALESCE(:m, music_preferences),
        email = COALESCE(:e, email)
        WHERE id = :id');

    $stmt->execute([
        ':f' => $firstName,
        ':l' => $lastName,
        ':p' => $phone,
        ':d' => $dobValid,
        ':m' => $prefs,
        ':e' => ($email !== null && $email !== '') ? $email : null,
        ':id' => $userId,
    ]);

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();

    echo json_encode(['ok' => true, 'user' => user_public_fields($row)]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
