<?php
/**
 * POST /api/studio-enquiry.php — project enquiry for Velorex Studio IT Services
 * (the "Designed & developed by" credit in the storefront footer).
 *
 * Body: { name, email, phone, company?, projectType, budget?, message, website? }
 *
 * EMAIL ONLY, by request: nothing is written to the database. The enquiry is
 * mailed to STUDIO_ENQUIRY_TO and that is the only record of it.
 *
 * Abuse surface is small because the recipient is FIXED — a caller cannot make
 * this server mail an address of their choosing (unlike the rule in CLAUDE.md
 * §26, which this endpoint therefore does not need to relax). Still guarded:
 *   - `website` is a honeypot field hidden from people; bots fill it in, and
 *     get a normal-looking success so they do not learn to skip it;
 *   - a per-IP limit of STUDIO_ENQUIRY_MAX per hour, kept in a temp file so no
 *     table is needed;
 *   - every field is length-capped and CR/LF-stripped where it reaches a
 *     header (the subject line).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_mailer.php';

const STUDIO_ENQUIRY_TO  = 'velorexdesign@gmail.com';
const STUDIO_ENQUIRY_MAX = 5;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = read_json_body();
$f = function (string $k) use ($body): string { return trim((string)($body[$k] ?? '')); };

// Honeypot: pretend it worked.
if ($f('website') !== '') {
    echo json_encode(['ok' => true, 'message' => 'Thank you — your enquiry has been sent.']);
    exit;
}

$name        = $f('name');
$email       = $f('email');
$phone       = $f('phone');
$company     = $f('company');
$projectType = $f('projectType');
$budget      = $f('budget');
$message     = $f('message');

if ($name === '' || $email === '' || $phone === '' || $message === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Please fill in your name, email, mobile number and requirements.']);
    exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Please enter a valid email address.']);
    exit;
}
// Loose on purpose: country codes, spaces and dashes are all fine. 7–15 digits.
$digits = preg_replace('/\D+/', '', $phone);
if (strlen($digits) < 7 || strlen($digits) > 15) {
    http_response_code(400);
    echo json_encode(['error' => 'Please enter a valid mobile number.']);
    exit;
}
if (mb_strlen($name) > 120 || mb_strlen($email) > 200 || mb_strlen($phone) > 30 || mb_strlen($company) > 150
    || mb_strlen($projectType) > 60 || mb_strlen($budget) > 60 || mb_strlen($message) > 4000) {
    http_response_code(400);
    echo json_encode(['error' => 'One or more fields are too long.']);
    exit;
}

// Per-IP hourly limit. A temp file per IP-hash; failures to read/write the file
// fail OPEN (the enquiry still goes) — a lost limit is better than a lost lead.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = sys_get_temp_dir() . '/velorex-studio-' . substr(hash('sha256', $ip), 0, 24);
$now = time();
$hits = [];
if (is_readable($bucket)) {
    $hits = array_filter(array_map('intval', explode(',', (string)@file_get_contents($bucket))), function ($t) use ($now) { return $t > $now - 3600; });
}
if (count($hits) >= STUDIO_ENQUIRY_MAX) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many enquiries from this connection. Please try again in an hour, or email ' . STUDIO_ENQUIRY_TO . ' directly.']);
    exit;
}

$e = function (string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
$oneLine = function (string $s): string { return preg_replace('/[\r\n]+/', ' ', $s); };

$subject = '[Velorex Studio] New enquiry from ' . $oneLine(mb_substr($name, 0, 60))
    . ($projectType !== '' ? ' · ' . $oneLine($projectType) : '');

$rows = [
    'Name'         => $name,
    'Email'        => $email,
    'Mobile'       => $phone,
    'Company'      => $company,
    'Project type' => $projectType,
    'Budget'       => $budget,
];
$html = '<h2 style="margin:0 0 12px">New project enquiry</h2><table cellpadding="6" style="border-collapse:collapse">';
$text = "New project enquiry\n\n";
foreach ($rows as $label => $value) {
    if ($value === '') continue;
    $html .= '<tr><td style="color:#666"><strong>' . $e($label) . '</strong></td><td>' . $e($value) . '</td></tr>';
    $text .= "$label: $value\n";
}
$html .= '</table>'
    . '<p><strong>Requirements:</strong><br>' . nl2br($e($message)) . '</p>'
    . '<p><a href="mailto:' . $e($email) . '?subject=' . rawurlencode('Re: your enquiry to Velorex Studio') . '">Reply to ' . $e($name) . '</a></p>'
    . '<hr><p style="color:#888;font-size:12px">Sent from the Velorex Studio enquiry form on velorexmusic.com · '
    . $e(date('Y-m-d H:i:s')) . ' · IP ' . $e($ip) . '</p>';
$text .= "\nRequirements:\n$message\n\nReply to: $email\nIP: $ip\nReceived: " . date('Y-m-d H:i:s') . "\n";

if (!send_mail(STUDIO_ENQUIRY_TO, 'Velorex Studio', $subject, $html, $text)) {
    http_response_code(502);
    echo json_encode(['error' => 'Your enquiry could not be sent right now. Please email ' . STUDIO_ENQUIRY_TO . ' directly.']);
    exit;
}

$hits[] = $now;
@file_put_contents($bucket, implode(',', $hits), LOCK_EX);

echo json_encode(['ok' => true, 'message' => 'Thank you — your enquiry has been sent. Velorex Studio will reply by email.']);
