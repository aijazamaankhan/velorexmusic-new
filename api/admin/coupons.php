<?php
// =============================================================================
// /api/admin/coupons.php — coupon management (ADMIN)
//
//   GET                     -> { ok, coupons: [...] }   (includes counters)
//   POST { coupon }         -> { ok, coupon }           (id present = update)
//   POST { action:'toggle', id, status }
//   DELETE ?id=N            -> { ok }
//
// Validation lives here rather than in the browser because these values decide
// what customers are charged. The admin form checks the same things for a fast
// answer, but this is the one that counts — the same split as everywhere else
// in this codebase.
//
// DELETING a coupon leaves its coupon_redemptions rows alone on purpose. They
// are the record of discounts actually given against real orders; removing them
// because a code was tidied away would quietly rewrite what those orders were
// worth.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_coupon_helpers.php';
require_once __DIR__ . '/../_mailer.php';
require_once __DIR__ . '/../_marketing_templates.php';
require_once __DIR__ . '/../_recovery.php';   // marketing_contact_token()

require_admin();

// Percent is capped at 90 rather than 100: a 100%-off code is a free-order
// generator, and if that is genuinely wanted it should be a deliberate,
// separate decision rather than a typo in a percentage box.
const COUPON_MAX_PERCENT = 90;

function coupon_admin_shape(array $c): array {
    return [
        'id'           => (int)$c['id'],
        'code'         => (string)$c['code'],
        'type'         => (string)$c['type'],
        'value'        => (int)$c['value'],
        'minOrder'     => (int)$c['min_order'],
        'maxDiscount'  => $c['max_discount']   !== null ? (int)$c['max_discount']   : null,
        'usageLimit'   => $c['usage_limit']    !== null ? (int)$c['usage_limit']    : null,
        'perUserLimit' => $c['per_user_limit'] !== null ? (int)$c['per_user_limit'] : null,
        'usedCount'    => (int)$c['used_count'],
        'startsAt'     => !empty($c['starts_at'])  ? date('Y-m-d', strtotime((string)$c['starts_at']))  : '',
        'expiresAt'    => !empty($c['expires_at']) ? date('Y-m-d', strtotime((string)$c['expires_at'])) : '',
        'status'       => (string)$c['status'],
        'featured'     => (int)$c['featured'] === 1,
        'headline'     => (string)($c['headline'] ?? ''),
        'customerEmail'=> (string)($c['customer_email'] ?? ''),
        'triggerEvent' => (string)($c['trigger_event'] ?? 'none'),
        'triggerValue' => ($c['trigger_value'] ?? null) !== null ? (int)$c['trigger_value'] : null,
    ];
}

// Returns [clean, errors].
function coupon_admin_validate(array $in): array {
    $errors = [];
    $out    = [];

    $code = coupon_normalize_code((string)($in['code'] ?? ''));
    if ($code === '') {
        $errors['code'] = 'A code is required';
    } elseif (!coupon_valid_code_format($code)) {
        $errors['code'] = 'Letters, numbers, hyphen and underscore only (3–40 characters)';
    }
    $out['code'] = $code;

    $type = (string)($in['type'] ?? 'percent');
    if (!in_array($type, ['percent', 'fixed'], true)) {
        $errors['type'] = 'Choose percentage or fixed amount';
        $type = 'percent';
    }
    $out['type'] = $type;

    $value = (int)($in['value'] ?? 0);
    if ($value <= 0) {
        $errors['value'] = 'Must be greater than zero';
    } elseif ($type === 'percent' && $value > COUPON_MAX_PERCENT) {
        $errors['value'] = 'Maximum ' . COUPON_MAX_PERCENT . '%';
    } elseif ($type === 'fixed' && $value > 1000000) {
        $errors['value'] = 'That is implausibly large';
    }
    $out['value'] = $value;

    $out['min_order'] = max(0, (int)($in['minOrder'] ?? 0));

    // A cap only means anything on a percentage. Storing one against a fixed
    // amount would be a setting that silently does nothing.
    $maxDiscount = ($in['maxDiscount'] ?? '') === '' ? null : max(0, (int)$in['maxDiscount']);
    $out['max_discount'] = ($type === 'percent') ? $maxDiscount : null;

    $out['usage_limit']    = ($in['usageLimit'] ?? '')   === '' ? null : max(1, (int)$in['usageLimit']);
    $out['per_user_limit'] = ($in['perUserLimit'] ?? '') === '' ? null : max(1, (int)$in['perUserLimit']);

    $starts  = trim((string)($in['startsAt']  ?? ''));
    $expires = trim((string)($in['expiresAt'] ?? ''));
    foreach (['startsAt' => $starts, 'expiresAt' => $expires] as $k => $v) {
        if ($v !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) $errors[$k] = 'Use YYYY-MM-DD';
    }
    if (!$errors && $starts !== '' && $expires !== '' && strtotime($expires) < strtotime($starts)) {
        $errors['expiresAt'] = 'Cannot end before it starts';
    }
    // End of day, not midnight: a coupon "expiring on the 30th" that dies at
    // 00:00 on the 30th is a support ticket.
    $out['starts_at']  = $starts  !== '' ? $starts . ' 00:00:00' : null;
    $out['expires_at'] = $expires !== '' ? $expires . ' 23:59:59' : null;

    // Reserve the code for one customer. Blank = anyone may use it.
    $custEmail = strtolower(trim((string)($in['customerEmail'] ?? '')));
    if ($custEmail !== '' && !filter_var($custEmail, FILTER_VALIDATE_EMAIL)) {
        $errors['customerEmail'] = 'Not a valid email address';
    }
    $out['customer_email'] = $custEmail !== '' ? $custEmail : null;

    // What the customer must have done to unlock this code. Validated against
    // the allowlist rather than stored as typed: an unrecognised trigger is
    // treated as unsatisfiable by coupon_trigger_check(), so a typo saved here
    // would produce a code nobody can use and no obvious reason why.
    $trigger = (string)($in['triggerEvent'] ?? 'none');
    if (!coupon_valid_trigger($trigger)) {
        $errors['triggerEvent'] = 'Unknown trigger';
        $trigger = 'none';
    }
    $out['trigger_event'] = $trigger;

    // trigger_value means different things per trigger, so it is only stored
    // where it means something — a stray number against "subscribe" would be a
    // setting that silently does nothing.
    $tv = ($in['triggerValue'] ?? '') === '' ? null : (int)$in['triggerValue'];
    if ($trigger === 'min_items') {
        if ($tv === null || $tv < 2) $errors['triggerValue'] = 'Enter 2 or more items';
        if ($tv !== null && $tv > 99) $errors['triggerValue'] = 'That is implausibly many';
    } elseif ($trigger === 'repeat_order') {
        if ($tv === null || $tv < 1) $errors['triggerValue'] = 'Enter 1 or more orders';
    } elseif ($trigger === 'signup') {
        // Optional here: blank means "any account, forever".
        if ($tv !== null && ($tv < 1 || $tv > 365)) $errors['triggerValue'] = 'Between 1 and 365 days';
    } else {
        $tv = null;
    }
    $out['trigger_value'] = $tv;

    $out['status']   = (($in['status'] ?? 'active') === 'disabled') ? 'disabled' : 'active';
    // A code reserved for one person cannot also be the public promo. Enforced
    // here rather than only hinted at in the form, so the two settings can
    // never be saved in a combination that would advertise someone's personal
    // code to every visitor.
    $out['featured'] = (!empty($in['featured']) && $out['customer_email'] === null) ? 1 : 0;
    $out['headline'] = mb_substr(trim((string)($in['headline'] ?? '')), 0, 120);

    return [$out, $errors];
}

try {
    $pdo = db();
    coupons_ensure_tables($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = $pdo->query('SELECT * FROM coupons ORDER BY status ASC, updated_at DESC')->fetchAll();
        echo json_encode([
            'ok'      => true,
            'coupons' => array_map('coupon_admin_shape', $rows),
        ]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
        $pdo->prepare('DELETE FROM coupons WHERE id = :id')->execute([':id' => $id]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = read_json_body();

        // Email the customer their personal code.
        //
        // Only for a RESERVED coupon: a public code has no one customer to send
        // it to, and mailing a public code to an address we happen to hold is
        // the kind of unsolicited send that costs a sending domain its
        // reputation (CLAUDE.md §26).
        if (($body['action'] ?? '') === 'notify') {
            $id = (int)($body['id'] ?? 0);
            $st = $pdo->prepare('SELECT * FROM coupons WHERE id = :id');
            $st->execute([':id' => $id]);
            $c = $st->fetch();
            if (!$c) { http_response_code(404); echo json_encode(['error' => 'Coupon not found']); exit; }

            $to = trim((string)($c['customer_email'] ?? ''));
            if ($to === '') {
                http_response_code(422);
                echo json_encode(['error' => 'This coupon is not reserved for a customer, so there is nobody to email']);
                exit;
            }
            if (!mailer_is_configured()) {
                http_response_code(422);
                echo json_encode(['error' => 'SMTP is not configured — see CLAUDE.md §10']);
                exit;
            }

            // Respect the opt-out, and mint a stable unsubscribe token if this
            // address has never had one. Same path the recovery mailer uses, so
            // an unsubscribe here is honoured everywhere.
            $unsub = marketing_contact_token($pdo, strtolower($to), 'coupon');
            if ($unsub === null) {
                http_response_code(422);
                echo json_encode(['error' => 'That customer has unsubscribed from marketing email']);
                exit;
            }

            // A first name makes it a note rather than a mailshot. Looked up
            // from the account when there is one; blank is fine.
            $firstName = '';
            try {
                $u = $pdo->prepare('SELECT first_name FROM users WHERE email = :e LIMIT 1');
                $u->execute([':e' => $to]);
                $firstName = (string)($u->fetchColumn() ?: '');
            } catch (Throwable $e) { /* optional */ }

            $tpl = personal_coupon_email($c, $to, $unsub, $firstName);
            $sent = send_mail($to, $firstName, $tpl['subject'], $tpl['html'], $tpl['text'], [
                'List-Unsubscribe'      => '<' . marketing_unsubscribe_url($unsub) . '>',
                'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
            ]);
            if (!$sent) {
                http_response_code(422);
                $why = mailer_last_error();
                echo json_encode(['error' => $why !== '' ? ('SMTP refused the message: ' . $why) : 'Could not send the email']);
                exit;
            }
            echo json_encode(['ok' => true, 'sentTo' => $to]);
            exit;
        }

        // Quick enable/disable from the list, without opening the editor.
        if (($body['action'] ?? '') === 'toggle') {
            $id     = (int)($body['id'] ?? 0);
            $status = ($body['status'] ?? '') === 'disabled' ? 'disabled' : 'active';
            if ($id <= 0) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $pdo->prepare('UPDATE coupons SET status = :s WHERE id = :id')
                ->execute([':s' => $status, ':id' => $id]);
            echo json_encode(['ok' => true]);
            exit;
        }

        $in = is_array($body['coupon'] ?? null) ? $body['coupon'] : [];
        [$c, $errors] = coupon_admin_validate($in);
        if ($errors) {
            http_response_code(422);
            echo json_encode(['error' => 'Please fix the highlighted fields', 'errors' => $errors]);
            exit;
        }

        $id = (int)($in['id'] ?? 0);

        // One featured coupon at a time — the promo popup shows exactly one, so
        // two flagged rows would make which-one-appears depend on row order.
        if ($c['featured']) {
            $pdo->prepare('UPDATE coupons SET featured = 0 WHERE id <> :id')->execute([':id' => $id]);
        }

        try {
            if ($id > 0) {
                $sql = 'UPDATE coupons SET code=:code, type=:type, value=:value, min_order=:min_order,
                            max_discount=:max_discount, usage_limit=:usage_limit,
                            per_user_limit=:per_user_limit, starts_at=:starts_at, expires_at=:expires_at,
                            status=:status, featured=:featured, headline=:headline,
                            customer_email=:customer_email,
                            trigger_event=:trigger_event, trigger_value=:trigger_value
                        WHERE id=:id';
                $st = $pdo->prepare($sql);
                // Unprefixed key, matching the rest of $c. PDO accepts either
                // form but not reliably a mix of both in one array.
                $st->execute($c + ['id' => $id]);
            } else {
                $sql = 'INSERT INTO coupons
                            (code, type, value, min_order, max_discount, usage_limit, per_user_limit,
                             starts_at, expires_at, status, featured, headline, customer_email,
                             trigger_event, trigger_value)
                        VALUES (:code, :type, :value, :min_order, :max_discount, :usage_limit,
                                :per_user_limit, :starts_at, :expires_at, :status, :featured, :headline,
                                :customer_email, :trigger_event, :trigger_value)';
                $pdo->prepare($sql)->execute($c);
                $id = (int)$pdo->lastInsertId();
            }
        } catch (PDOException $e) {
            // 23000 = integrity constraint; here that is always the unique code.
            if ($e->getCode() === '23000') {
                http_response_code(422);
                echo json_encode(['error' => 'That code already exists', 'errors' => ['code' => 'Already in use']]);
                exit;
            }
            throw $e;
        }

        $st = $pdo->prepare('SELECT * FROM coupons WHERE id = :id');
        $st->execute([':id' => $id]);
        $row = $st->fetch();
        echo json_encode(['ok' => true, 'coupon' => $row ? coupon_admin_shape($row) : null]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('[admin/coupons] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
