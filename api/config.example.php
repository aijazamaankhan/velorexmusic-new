<?php
// Copy this file to config.php on the server and fill in real values.
// config.php is gitignored; never commit real credentials.

define('DB_HOST', 'localhost');
define('DB_NAME', 'u286479481_velorex');
define('DB_USER', 'u286479481_velorex_admin');
define('DB_PASS', 'REPLACE_WITH_REAL_PASSWORD');

// Used as the admin API token. Must match the password used in admin.html login.
define('ADMIN_PASS', 'owner123');

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
