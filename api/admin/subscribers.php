<?php
// =============================================================================
// /api/admin/subscribers.php — newsletter list management (ADMIN)
//
//   GET                              -> { rows: [...], stats: {...}, brevoReady }
//   POST { action, email }           -> { ok }
//        action: unsubscribe | resubscribe | resync-brevo
//
// CONSENT IS A COLUMN, NOT A VIBE
// `consent_at` separates the two ways an address gets into this table:
//   NOT NULL — they typed it into the signup form. Campaign-mailable.
//   NULL     — they shopped with us and the recovery mailer needed a stable
//              opt-out token for them (see marketing_contact_token in
//              api/_recovery.php). NOT campaign-mailable.
// The admin UI shows this as an "Opted in" vs "Customer" badge and the export
// splits on it, so nobody can accidentally blast a promo to people who never
// asked for one. Do not merge the two states to make the count look bigger.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_marketing_helpers.php';

require_admin();

try {
    $pdo = db();
    marketing_ensure_tables($pdo);

    // ---------------------------------------------------------------- GET ---
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = $pdo->query(
            'SELECT s.id, s.email, s.status, s.source, s.user_id, s.consent_at,
                    s.unsubscribed_at, s.brevo_synced, s.created_at,
                    u.first_name, u.last_name
               FROM subscribers s
               LEFT JOIN users u ON u.id = s.user_id
              ORDER BY s.created_at DESC
              LIMIT 5000'
        )->fetchAll();

        $out = [];
        foreach ($rows as $r) {
            $name = trim((string)($r['first_name'] ?? '') . ' ' . (string)($r['last_name'] ?? ''));
            $out[] = [
                'id'             => (int)$r['id'],
                'email'          => (string)$r['email'],
                'status'         => (string)$r['status'],
                'source'         => $r['source'] ?: null,
                'userId'         => $r['user_id'] !== null ? (int)$r['user_id'] : null,
                'name'           => $name !== '' ? $name : null,
                // The flag the whole file exists to keep honest.
                'optedIn'        => !empty($r['consent_at']),
                'consentAt'      => $r['consent_at'],
                'unsubscribedAt' => $r['unsubscribed_at'],
                'brevoSynced'    => (int)$r['brevo_synced'] === 1,
                'createdAt'      => $r['created_at'],
            ];
        }

        $subscribed = array_filter($out, function ($r) { return $r['status'] === 'subscribed'; });
        echo json_encode([
            'rows'  => $out,
            'stats' => [
                'total'        => count($out),
                'subscribed'   => count($subscribed),
                'optedIn'      => count(array_filter($subscribed, function ($r) { return $r['optedIn']; })),
                'customerOnly' => count(array_filter($subscribed, function ($r) { return !$r['optedIn']; })),
                'unsubscribed' => count(array_filter($out, function ($r) { return $r['status'] === 'unsubscribed'; })),
                'brevoPending' => count(array_filter($subscribed, function ($r) { return !$r['brevoSynced']; })),
            ],
            'brevoReady' => brevo_is_configured(),
        ]);
        exit;
    }

    // --------------------------------------------------------------- POST ---
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $b      = read_json_body();
        $action = (string)($b['action'] ?? '');
        $email  = marketing_normalize_email($b['email'] ?? '');

        if ($action === 'resync-brevo') {
            if (!brevo_is_configured()) {
                http_response_code(503);
                echo json_encode(['error' => 'BREVO_API_KEY is not set in the secrets file']);
                exit;
            }
            // Push everyone who is subscribed but not yet flagged as synced.
            // Bounded so one click cannot tie up a request for minutes on a
            // large list — click again to continue where it left off.
            $pending = $pdo->query(
                'SELECT email FROM subscribers
                  WHERE status = "subscribed" AND brevo_synced = 0
                  LIMIT 200'
            )->fetchAll();
            $done = 0;
            foreach ($pending as $p) {
                marketing_push_to_brevo($pdo, (string)$p['email']);
                $done++;
            }
            echo json_encode(['ok' => true, 'synced' => $done, 'remaining' => count($pending) === 200]);
            exit;
        }

        if ($email === '') {
            http_response_code(400);
            echo json_encode(['error' => 'A valid email is required']);
            exit;
        }

        if ($action === 'unsubscribe') {
            $st = $pdo->prepare(
                'UPDATE subscribers SET status = "unsubscribed", unsubscribed_at = NOW() WHERE email = :e'
            );
            $st->execute([':e' => $email]);
            brevo_set_blacklisted($email, true);
            echo json_encode(['ok' => true]);
            exit;
        }

        if ($action === 'resubscribe') {
            // Re-subscribing on the customer's behalf is a support action ("they
            // rang and asked to go back on"). consent_at is stamped because a
            // person asked an operator for it — that IS consent, just not
            // self-service. It stays NULL-able for the recovery-token rows.
            $st = $pdo->prepare(
                'UPDATE subscribers
                    SET status = "subscribed", unsubscribed_at = NULL,
                        consent_at = COALESCE(consent_at, NOW())
                  WHERE email = :e'
            );
            $st->execute([':e' => $email]);
            brevo_set_blacklisted($email, false);
            echo json_encode(['ok' => true]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
