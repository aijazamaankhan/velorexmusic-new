<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = read_json_body();

$fullName = trim((string)($body['fullName'] ?? ''));
$email = trim((string)($body['email'] ?? ''));
$subject = trim((string)($body['subject'] ?? ''));
$message = trim((string)($body['message'] ?? ''));

if ($fullName === '' || $email === '' || $subject === '' || $message === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Please provide name, email, subject and message.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Please provide a valid email address.']);
    exit;
}

if (mb_strlen($fullName) > 150 || mb_strlen($subject) > 150 || mb_strlen($message) > 4000) {
    http_response_code(400);
    echo json_encode(['error' => 'One or more fields exceed the maximum allowed length.']);
    exit;
}

$supportEmail = 'thevelorexmusic@gmail.com';
$emailSubject = '[Website Contact] ' . $subject;
$html = '<h2>New contact request</h2>' .
    '<p><strong>Name:</strong> ' . htmlspecialchars($fullName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>' .
    '<p><strong>Email:</strong> ' . htmlspecialchars($email, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>' .
    '<p><strong>Subject:</strong> ' . htmlspecialchars($subject, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>' .
    '<p><strong>Message:</strong><br>' . nl2br(htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</p>' .
    '<hr>' .
    '<p><strong>IP:</strong> ' . htmlspecialchars($_SERVER['REMOTE_ADDR'] ?? 'unknown', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>' .
    '<p><strong>Received at:</strong> ' . date('Y-m-d H:i:s') . '</p>';
$text = "New contact request\n\n" .
    "Name: $fullName\n" .
    "Email: $email\n" .
    "Subject: $subject\n\n" .
    "Message:\n$message\n\n" .
    "IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n" .
    "Received at: " . date('Y-m-d H:i:s') . "\n";

$mailSent = send_mail($supportEmail, 'Velorex Music', $emailSubject, $html, $text);

if (!$mailSent) {
    if (!mailer_is_configured()) {
        echo json_encode([
            'ok' => true,
            'message' => 'Your message was received. Email delivery is not configured in this environment, so it will not be sent right now.',
        ]);
        exit;
    }

    http_response_code(502);
    echo json_encode(['error' => 'Failed to send the message. Please try again later.']);
    exit;
}

echo json_encode(['ok' => true, 'message' => 'Your message was sent successfully. We will get back to you soon.']);
