<?php
// =============================================================================
// /api/admin/spin-wheel.php — Spin & Win settings and results (ADMIN)
//
//   GET                  -> { ok, config, stats, recent:[...] }
//   POST { config }      -> { ok, config }       (validated; 422 with errors)
//
// Validation is spin_validate_config() in api/_spin_helpers.php — the admin
// panel checks the same things for a fast answer, but this is the one that
// counts. A saved change only affects spins AFTER it: codes already won keep
// the terms they were minted with, because those terms are on the coupon row.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_spin_helpers.php';

require_admin();

try {
    $pdo = db();
    spin_ensure_tables($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stats = ['spins' => 0, 'wins' => 0, 'used' => 0, 'discount' => 0, 'today' => 0];
        $recent = [];
        try {
            $stats['spins'] = (int)$pdo->query('SELECT COUNT(*) FROM spin_entries')->fetchColumn();
            $stats['wins']  = (int)$pdo->query('SELECT COUNT(*) FROM spin_entries WHERE coupon_code IS NOT NULL')->fetchColumn();
            $stats['today'] = (int)$pdo->query('SELECT COUNT(*) FROM spin_entries WHERE created_at >= CURDATE()')->fetchColumn();
            $r = $pdo->query('SELECT COUNT(*) AS n, COALESCE(SUM(r.discount),0) AS d
                                FROM coupon_redemptions r
                                JOIN spin_entries s ON s.coupon_code = r.code')->fetch();
            $stats['used'] = (int)($r['n'] ?? 0);
            $stats['discount'] = (int)($r['d'] ?? 0);

            $rows = $pdo->query('SELECT s.email, s.prize_title, s.coupon_code, s.created_at,
                                        c.used_count, c.expires_at
                                   FROM spin_entries s
                              LEFT JOIN coupons c ON c.code = s.coupon_code
                               ORDER BY s.id DESC LIMIT 50')->fetchAll();
            foreach ($rows as $row) {
                $recent[] = [
                    'email'     => (string)$row['email'],
                    'prize'     => (string)$row['prize_title'],
                    'code'      => $row['coupon_code'] !== null ? (string)$row['coupon_code'] : null,
                    'used'      => (int)($row['used_count'] ?? 0) > 0,
                    'expired'   => !empty($row['expires_at']) && strtotime((string)$row['expires_at']) < time(),
                    'at'        => date('c', strtotime((string)$row['created_at'])),
                ];
            }
        } catch (Throwable $e) {
            error_log('[admin/spin] stats failed: ' . $e->getMessage());
        }
        echo json_encode(['ok' => true, 'config' => spin_get_config($pdo), 'stats' => $stats, 'recent' => $recent]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $body = read_json_body();
    [$clean, $errors] = spin_validate_config(is_array($body['config'] ?? null) ? $body['config'] : []);
    if ($errors) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => $errors[0], 'errors' => $errors]);
        exit;
    }
    $pdo->prepare('INSERT INTO spin_config (id, config) VALUES (1, :c)
                   ON DUPLICATE KEY UPDATE config = VALUES(config)')
        ->execute([':c' => json_encode($clean)]);
    echo json_encode(['ok' => true, 'config' => $clean]);
} catch (Throwable $e) {
    error_log('[admin/spin] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
