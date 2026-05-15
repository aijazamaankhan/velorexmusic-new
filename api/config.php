<?php
// Shared bootstrap for every endpoint in /api.
// This file is now TRACKED in git — it contains no secrets.
//
// Secrets (DB_HOST / DB_NAME / DB_USER / DB_PASS / ADMIN_PASS) live in a separate
// file loaded below. The lookup tries multiple paths so the same config.php
// works on both local dev and Hostinger:
//
//   • Two levels above api/ (i.e. the domain folder on Hostinger:
//     /home/u286479481/domains/velorexmusic.com/velorex_secrets.php). One level
//     above public_html, so git deploys can't touch it — but still within
//     Hostinger's open_basedir restriction.
//   • /home/u286479481/private/velorex_secrets.php — fallback if you prefer
//     the home directory. Only works if open_basedir permits it.
//   • api/secrets.local.php — local dev (gitignored).
//   • api/secrets.php       — alternate local name.
//
// If none of the candidate paths exists, the request fails with a clear 500 so
// you know exactly what's missing.

$__velorex_secrets_candidates = [
    __DIR__ . '/../../velorex_secrets.php',
    '/home/u286479481/domains/velorexmusic.com/velorex_secrets.php',
    '/home/u286479481/private/velorex_secrets.php',
    __DIR__ . '/secrets.local.php',
    __DIR__ . '/secrets.php',
];

$__velorex_secrets_loaded = false;
foreach ($__velorex_secrets_candidates as $__p) {
    if (is_readable($__p)) {
        require_once $__p;
        $__velorex_secrets_loaded = $__p;
        break;
    }
}
unset($__p);

if (!$__velorex_secrets_loaded
    || !defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER')
    || !defined('DB_PASS') || !defined('ADMIN_PASS')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Server secrets not configured. Expected a file defining DB_HOST/DB_NAME/DB_USER/DB_PASS/ADMIN_PASS at one of: '
            . implode(', ', $__velorex_secrets_candidates),
    ]);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// API responses are dynamic — never cache (prevents stale reads after writes).
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Pass, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function db() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed']);
            exit;
        }
    }
    return $pdo;
}

function require_admin() {
    $pass = $_SERVER['HTTP_X_ADMIN_PASS'] ?? '';
    if (!is_string($pass) || $pass === '' || !hash_equals(ADMIN_PASS, $pass)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function read_json_body() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        exit;
    }
    return $data;
}

// Returns user_id (int) for a valid Bearer token, or null otherwise.
function current_user_id_or_null() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth) {
        // Some Apache configs strip Authorization — try alternate header
        $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    }
    if (!preg_match('/^Bearer\s+([a-f0-9]{32,128})$/', $auth, $m)) {
        return null;
    }
    $token = $m[1];
    $stmt = db()->prepare('SELECT user_id FROM user_sessions WHERE token = :t AND expires_at > NOW()');
    $stmt->execute([':t' => $token]);
    $row = $stmt->fetch();
    return $row ? (int)$row['user_id'] : null;
}

function require_user() {
    $id = current_user_id_or_null();
    if (!$id) {
        http_response_code(401);
        echo json_encode(['error' => 'Login required']);
        exit;
    }
    return $id;
}

function is_admin_request() {
    $pass = $_SERVER['HTTP_X_ADMIN_PASS'] ?? '';
    return is_string($pass) && $pass !== '' && hash_equals(ADMIN_PASS, $pass);
}

function create_session_for_user(int $userId, int $daysValid = 30): string {
    $token = bin2hex(random_bytes(32));
    $stmt = db()->prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (:t, :u, DATE_ADD(NOW(), INTERVAL :d DAY))');
    $stmt->execute([':t' => $token, ':u' => $userId, ':d' => $daysValid]);
    return $token;
}

function user_public_fields(array $row): array {
    return [
        'id' => (int)$row['id'],
        'email' => $row['email'],
        'firstName' => $row['first_name'],
        'lastName' => $row['last_name'],
        'phone' => $row['phone'],
        'dateOfBirth' => $row['date_of_birth'],
        'musicPreferences' => $row['music_preferences'],
        'createdAt' => $row['created_at'] ?? null,
    ];
}
