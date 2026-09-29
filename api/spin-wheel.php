<?php
// =============================================================================
// /api/spin-wheel.php — the welcome wheel (PUBLIC read, customer-auth spin)
//
//   GET   -> { ok, enabled, prizes:[{id,color,label,sub}], delaySec,
//              signedIn, eligible, reason }
//   POST  (Bearer) -> { ok, prizeId, title, cond, win, code?, expiresAt? }
//                     { ok:false, reason, error }
//
// The draw happens HERE, on the server, before the browser animates anything.
// See the header of api/_spin_helpers.php for the rules.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_spin_helpers.php';
require_once __DIR__ . '/_marketing_helpers.php';   // marketing_client_ip()

$SPIN_MESSAGES = [
    'disabled' => 'The wheel is resting right now.',
    'spun'     => 'You have already had your spin.',
    'ordered'  => 'The wheel is a welcome gift for members who have not ordered yet.',
    'busy'     => 'Too many spins from this connection today. Please try again tomorrow.',
    'error'    => 'Could not start your spin right now. Please try again.',
];

try {
    $pdo = db();
    spin_ensure_tables($pdo);
    $cfg = spin_get_config($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $userId = current_user_id_or_null();
        if (empty($cfg['enabled'])) {
            echo json_encode(['ok' => true, 'enabled' => false]);
            exit;
        }
        $reason = $userId !== null ? spin_eligibility($pdo, $cfg, (int)$userId) : '';
        echo json_encode([
            'ok'       => true,
            'enabled'  => true,
            'prizes'   => spin_public_prizes($cfg),
            'delaySec' => (int)$cfg['delaySec'],
            'signedIn' => $userId !== null,
            // A signed-out visitor is "eligible" in the sense that the tab is
            // offered; the real check runs once they have an account.
            'eligible' => $reason === '',
            'reason'   => $reason,
        ]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $userId = (int)require_user();
    $reason = spin_eligibility($pdo, $cfg, $userId);
    $ip = marketing_client_ip();
    if ($reason === '' && spin_ip_over_limit($pdo, $ip)) $reason = 'busy';
    if ($reason !== '') {
        http_response_code($reason === 'error' ? 500 : 409);
        echo json_encode(['ok' => false, 'reason' => $reason, 'error' => $SPIN_MESSAGES[$reason]]);
        exit;
    }

    $email = (string)coupon_identity_email($pdo, $userId, null);
    $live  = spin_live_prizes($cfg);
    $prize = $live[spin_draw($live)];
    $desc  = spin_describe($prize);

    $pdo->beginTransaction();
    try {
        // The UNIQUE key on user_id is the lock: a second tab or a double
        // click that got past the eligibility read fails here.
        $pdo->prepare('INSERT INTO spin_entries (user_id, email, prize_id, prize_type, prize_title, ip)
                       VALUES (:u, :e, :pid, :pt, :title, :ip)')
            ->execute([':u' => $userId, ':e' => $email, ':pid' => $prize['id'],
                       ':pt' => $prize['type'], ':title' => $desc['title'], ':ip' => $ip]);

        $coupon = null;
        if ($prize['type'] !== 'none') {
            $coupon = spin_mint_coupon($pdo, $prize, $email, (int)$cfg['validDays']);
            $pdo->prepare('UPDATE spin_entries SET coupon_code = :c WHERE user_id = :u')
                ->execute([':c' => $coupon['code'], ':u' => $userId]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() === '23000') {
            http_response_code(409);
            echo json_encode(['ok' => false, 'reason' => 'spun', 'error' => $SPIN_MESSAGES['spun']]);
            exit;
        }
        throw $e;
    }

    // The code is also emailed, after the commit and never as part of it: a
    // failed email must not undo a prize that is already on screen. Goes
    // through marketing_contact_token() so an earlier unsubscribe is honoured.
    if ($coupon !== null) {
        try {
            require_once __DIR__ . '/_recovery.php';   // marketing_contact_token + mailer + templates
            $unsub = marketing_contact_token($pdo, strtolower($email), 'spin-wheel');
            if ($unsub !== null) {
                $first = '';
                $u = $pdo->prepare('SELECT first_name FROM users WHERE id = :id');
                $u->execute([':id' => $userId]);
                $first = (string)($u->fetchColumn() ?: '');
                $tpl = personal_coupon_email($coupon, $email, $unsub, $first);
                send_mail($email, $first, $tpl['subject'], $tpl['html'], $tpl['text'], [
                    'List-Unsubscribe'      => '<' . marketing_unsubscribe_url($unsub) . '>',
                    'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
                ]);
            }
        } catch (Throwable $e) {
            error_log('[spin] prize email failed: ' . $e->getMessage());
        }
    }

    echo json_encode([
        'ok'        => true,
        'prizeId'   => $prize['id'],
        'win'       => $coupon !== null,
        'title'     => $desc['title'],
        'cond'      => $desc['cond'],
        'code'      => $coupon['code'] ?? null,
        'expiresAt' => !empty($coupon['expires_at']) ? date('c', strtotime((string)$coupon['expires_at'])) : null,
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[spin] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'reason' => 'error', 'error' => 'Could not start your spin right now. Please try again.']);
}
