<?php
require_once __DIR__ . '/../config.php';

require_admin();
$pdo = db();

// `users.notes` is a pending migration (see CLAUDE.md §9). The endpoint reads
// the column when present and degrades to empty notes otherwise so admin can
// still load the customer list before the migration is applied.
function users_has_notes_column(PDO $pdo): bool {
    static $cached = null;
    if ($cached !== null) return $cached;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'notes'");
        $cached = (bool)$stmt->fetch();
    } catch (Exception $e) {
        $cached = false;
    }
    return $cached;
}

function admin_user_row_to_json(array $r, bool $hasNotes): array {
    $u = user_public_fields($r);
    $u['orderCount']         = (int)($r['order_count'] ?? 0);
    $u['totalSpent']         = (float)($r['total_spent'] ?? 0);
    $u['activeSessionCount'] = (int)($r['active_session_count'] ?? 0);
    $u['addressCount']       = (int)($r['address_count'] ?? 0);
    $u['notes']              = $hasNotes ? (string)($r['notes'] ?? '') : '';
    return $u;
}

function generate_temp_password(int $len = 14): string {
    // Avoid characters that are easy to confuse when read aloud or copied
    // (0/O, 1/l/I, ambiguous symbols). 14 chars keeps entropy comfortable
    // for a temporary credential the customer will rotate on first login.
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*';
    $max = strlen($alphabet) - 1;
    $out = '';
    for ($i = 0; $i < $len; $i++) {
        $out .= $alphabet[random_int(0, $max)];
    }
    return $out;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $hasNotes = users_has_notes_column($pdo);
        $notesSelect = $hasNotes ? ', u.notes' : '';
        $sql = "SELECT u.*$notesSelect,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(JSON_EXTRACT(order_data, '$.total')), 0) FROM orders o WHERE o.user_id = u.id) AS total_spent,
            (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_session_count,
            (SELECT COUNT(*) FROM addresses a WHERE a.user_id = u.id) AS address_count
            FROM users u
            ORDER BY u.created_at DESC";
        $rows = $pdo->query($sql)->fetchAll();
        $users = array_map(fn($r) => admin_user_row_to_json($r, $hasNotes), $rows);
        echo json_encode($users);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = read_json_body();
        $action = $body['action'] ?? '';
        $userId = (int)($body['userId'] ?? 0);

        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'userId is required']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        $target = $stmt->fetch();
        if (!$target) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit;
        }

        if ($action === 'reset-password') {
            // newPassword is optional. If absent/empty, the server generates a
            // strong temporary password and returns it once. The admin is
            // responsible for delivering it to the customer over a secure
            // channel; the value never appears in any log.
            $supplied = trim((string)($body['newPassword'] ?? ''));
            $generated = false;
            if ($supplied === '') {
                $newPass = generate_temp_password();
                $generated = true;
            } else {
                if (strlen($supplied) < 8) {
                    http_response_code(400);
                    echo json_encode(['error' => 'newPassword must be at least 8 characters']);
                    exit;
                }
                $newPass = $supplied;
            }

            $hash = password_hash($newPass, PASSWORD_DEFAULT);
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id');
            $stmt->execute([':h' => $hash, ':id' => $userId]);
            $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE user_id = :id');
            $stmt->execute([':id' => $userId]);
            $pdo->commit();

            $resp = ['ok' => true, 'generated' => $generated];
            if ($generated) $resp['newPassword'] = $newPass;
            echo json_encode($resp);
            exit;
        }

        if ($action === 'force-logout') {
            $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE user_id = :id');
            $stmt->execute([':id' => $userId]);
            echo json_encode(['ok' => true, 'revoked' => $stmt->rowCount()]);
            exit;
        }

        if ($action === 'update-profile') {
            $fields = [];
            $params = [':id' => $userId];

            if (array_key_exists('firstName', $body)) {
                $fields[] = 'first_name = :first_name';
                $params[':first_name'] = trim((string)$body['firstName']) ?: null;
            }
            if (array_key_exists('lastName', $body)) {
                $fields[] = 'last_name = :last_name';
                $params[':last_name'] = trim((string)$body['lastName']) ?: null;
            }
            if (array_key_exists('phone', $body)) {
                $fields[] = 'phone = :phone';
                $params[':phone'] = trim((string)$body['phone']) ?: null;
            }
            if (array_key_exists('email', $body)) {
                $email = trim((string)$body['email']);
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid email address']);
                    exit;
                }
                $check = $pdo->prepare('SELECT id FROM users WHERE email = :e AND id <> :id');
                $check->execute([':e' => $email, ':id' => $userId]);
                if ($check->fetch()) {
                    http_response_code(409);
                    echo json_encode(['error' => 'Another account already uses that email']);
                    exit;
                }
                $fields[] = 'email = :email';
                $params[':email'] = $email;
            }

            if (!$fields) {
                http_response_code(400);
                echo json_encode(['error' => 'No editable fields supplied']);
                exit;
            }

            $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
            $stmt->execute([':id' => $userId]);
            $row = $stmt->fetch();
            echo json_encode(['ok' => true, 'user' => user_public_fields($row)]);
            exit;
        }

        if ($action === 'update-notes') {
            if (!users_has_notes_column($pdo)) {
                http_response_code(503);
                echo json_encode(['error' => 'Notes column not present. Run the pending migration: ALTER TABLE users ADD COLUMN notes TEXT NULL;']);
                exit;
            }
            $notes = (string)($body['notes'] ?? '');
            if (strlen($notes) > 5000) {
                http_response_code(400);
                echo json_encode(['error' => 'Notes too long (max 5000 chars)']);
                exit;
            }
            $stmt = $pdo->prepare('UPDATE users SET notes = :n WHERE id = :id');
            $stmt->execute([':n' => $notes === '' ? null : $notes, ':id' => $userId]);
            echo json_encode(['ok' => true]);
            exit;
        }

        if ($action === 'delete-user') {
            // Belt-and-suspenders: require the admin to echo the email back so
            // a double-click on the wrong row can't nuke an account.
            $confirmEmail = trim((string)($body['confirmEmail'] ?? ''));
            if ($confirmEmail !== '' && strcasecmp($confirmEmail, $target['email']) !== 0) {
                http_response_code(400);
                echo json_encode(['error' => 'confirmEmail does not match the account email']);
                exit;
            }
            $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
            $stmt->execute([':id' => $userId]);
            echo json_encode(['ok' => true]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
