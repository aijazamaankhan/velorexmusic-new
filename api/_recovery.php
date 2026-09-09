<?php
// =============================================================================
// Abandonment recovery — the one place a recovery email is actually sent.
//
// Used by:
//   api/admin/abandoned.php               (the admin's manual "Send" button)
//   scripts/send-abandoned-cart-emails.php (the 2-hour / 24-hour cron)
//
// Both callers funnel through marketing_send_recovery() so the eligibility
// rules — unsubscribed? already bought? already mailed at this stage? no
// email on file? — are enforced once. A second copy of these checks in the
// cron would drift from the admin path and eventually mail someone who had
// opted out.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_marketing_helpers.php';
require_once __DIR__ . '/_mailer.php';
require_once __DIR__ . '/_email_templates.php';
require_once __DIR__ . '/_marketing_templates.php';

// The two nudges. Hours since the cart was last touched.
//   Stage 1 — a short, "did the page break?" reminder while intent is warm.
//   Stage 2 — the next-day nudge, after which we stop. There is no stage 3:
//             a third email to someone who ignored two is how a store ends up
//             in the spam folder for every future receipt it sends.
const RECOVERY_STAGE1_HOURS = 2;
const RECOVERY_STAGE2_HOURS = 24;
// Never chase a cart older than this — the moment has passed and the prices
// quoted in the snapshot may no longer resemble the catalogue.
const RECOVERY_MAX_AGE_HOURS = 96;

// Find (or mint) the opt-out token for an address.
//
// A shopper who never used the newsletter form still needs a working
// unsubscribe link in any marketing-adjacent email — so a row is created for
// them with consent_at = NULL. That NULL is load-bearing and means exactly one
// thing: "we can reach this address because they shopped with us, NOT because
// they opted in." Campaign sends must filter on consent_at IS NOT NULL;
// recovery emails may go to anyone whose status is not 'unsubscribed'.
// Do not backfill consent_at to make the numbers look better.
function marketing_contact_token(PDO $pdo, string $email, string $source = 'recovery'): ?string {
    marketing_ensure_tables($pdo);
    $st = $pdo->prepare('SELECT token, status FROM subscribers WHERE email = :e LIMIT 1');
    $st->execute([':e' => $email]);
    $row = $st->fetch();
    if ($row) {
        if ($row['status'] === 'unsubscribed') return null; // caller must not send
        return (string)$row['token'];
    }
    $token = marketing_token();
    $ins = $pdo->prepare(
        'INSERT INTO subscribers (email, status, source, token, consent_at)
         VALUES (:e, "subscribed", :s, :t, NULL)'
    );
    $ins->execute([':e' => $email, ':s' => $source, ':t' => $token]);
    return $token;
}

// Returns ['ok' => bool, 'stage' => int, 'error' => string].
//
// $kind    'cart' | 'checkout'
// $id      carts.id (int) | payment_orders.razorpay_order_id (string)
// $trigger 'manual' | 'cron' — recorded in the log line only.
function marketing_send_recovery(PDO $pdo, string $kind, $id, string $trigger = 'manual'): array {
    marketing_ensure_tables($pdo);

    $fail = function (string $msg) { return ['ok' => false, 'stage' => 0, 'error' => $msg]; };

    // ---- Load the row -------------------------------------------------------
    if ($kind === 'cart') {
        $st = $pdo->prepare(
            'SELECT c.id, c.email, c.items, c.item_count, c.subtotal, c.recovery_token,
                    c.recovery_stage, c.dismissed_at, c.converted_at, c.updated_at,
                    u.first_name
               FROM carts c
               LEFT JOIN users u ON u.id = c.user_id
              WHERE c.id = :id
              LIMIT 1'
        );
        $st->execute([':id' => (int)$id]);
        $row = $st->fetch();
        if (!$row) return $fail('Cart not found');
        if (!empty($row['converted_at'])) return $fail('This cart has already been purchased');
        $email     = (string)($row['email'] ?? '');
        $firstName = (string)($row['first_name'] ?? '');
        $items     = json_decode((string)$row['items'], true);
        $total     = (int)$row['subtotal'];
        $stage     = (int)$row['recovery_stage'];
        $token     = (string)$row['recovery_token'];
        $dismissed = !empty($row['dismissed_at']);
        $lastSeen  = (string)$row['updated_at'];
    } elseif ($kind === 'checkout') {
        if (!marketing_payment_orders_ready($pdo)) {
            return $fail('payment_orders recovery columns are not available');
        }
        $st = $pdo->prepare(
            'SELECT po.razorpay_order_id, po.status, po.guest_contact, po.amount_paise, po.items,
                    po.shipping_address, po.recovery_stage, po.recovery_token, po.dismissed_at,
                    po.created_at, u.email AS user_email, u.first_name
               FROM payment_orders po
               LEFT JOIN users u ON u.id = po.user_id
              WHERE po.razorpay_order_id = :id
              LIMIT 1'
        );
        $st->execute([':id' => (string)$id]);
        $row = $st->fetch();
        if (!$row) return $fail('Checkout not found');
        if ($row['status'] === 'paid')   return $fail('This checkout was completed');
        if ($row['status'] === 'failed') return $fail('This payment failed at the gateway — do not chase it');
        $guest     = $row['guest_contact'] ? json_decode((string)$row['guest_contact'], true) : null;
        $addr      = json_decode((string)$row['shipping_address'], true);
        $email     = (string)($row['user_email'] ?: ($guest['email'] ?? ''));
        $firstName = (string)($row['first_name'] ?? '');
        if ($firstName === '') {
            $full = (string)($guest['fullName'] ?? ($addr['fullName'] ?? ''));
            $firstName = $full !== '' ? explode(' ', trim($full))[0] : '';
        }
        $items     = json_decode((string)$row['items'], true);
        $total     = intdiv((int)$row['amount_paise'], 100);
        $stage     = (int)$row['recovery_stage'];
        $token     = (string)($row['recovery_token'] ?? '');
        $dismissed = !empty($row['dismissed_at']);
        $lastSeen  = (string)$row['created_at'];
    } else {
        return $fail('Unknown row kind');
    }

    // ---- Eligibility --------------------------------------------------------
    if ($dismissed)            return $fail('This row was dismissed');
    if (!is_array($items) || !$items) return $fail('Nothing in this cart to send');
    $email = marketing_normalize_email($email);
    if ($email === '')         return $fail('No email address on file for this visitor');
    if ($stage >= 2)           return $fail('Both recovery emails have already been sent');
    if (!mailer_is_configured()) return $fail('SMTP is not configured — see CLAUDE.md §10');

    // Respect the opt-out. A recovery email is marketing-adjacent; someone who
    // unsubscribed did not carve out an exception for it.
    $optOutToken = marketing_contact_token($pdo, $email, $kind === 'cart' ? 'cart-recovery' : 'checkout-recovery');
    if ($optOutToken === null) return $fail('This customer has unsubscribed from marketing email');

    if (!marketing_valid_key($token)) {
        $token = marketing_token();
        if ($kind === 'cart') {
            $pdo->prepare('UPDATE carts SET recovery_token = :t WHERE id = :id')
                ->execute([':t' => $token, ':id' => (int)$id]);
        } else {
            $pdo->prepare('UPDATE payment_orders SET recovery_token = :t WHERE razorpay_order_id = :id')
                ->execute([':t' => $token, ':id' => (string)$id]);
        }
    }

    $nextStage = $stage + 1;

    // ---- Send ---------------------------------------------------------------
    $tpl = abandoned_cart_email([
        'firstName'      => $firstName,
        'items'          => $items,
        'total'          => $total,
        'stage'          => $nextStage,
        'kind'           => $kind,
        'recoveryUrl'    => marketing_recovery_url($token),
        'unsubscribeUrl' => marketing_unsubscribe_url($optOutToken),
    ]);

    $ok = send_mail($email, $firstName, $tpl['subject'], $tpl['html'], $tpl['text'], [
        'List-Unsubscribe'      => '<' . marketing_unsubscribe_url($optOutToken) . '>',
        'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
    ]);

    if (!$ok) {
        // Deliberately NOT stamping recovery_stage on a failed send, so the
        // next cron pass retries instead of silently skipping this customer
        // forever because of one bad SMTP minute.
        error_log('[recovery] send failed (' . $trigger . ') ' . $kind . ' ' . $id . ' -> ' . $email);
        return $fail('SMTP refused the message — check error_log');
    }

    if ($kind === 'cart') {
        $pdo->prepare('UPDATE carts SET recovery_stage = :s, recovery_sent_at = NOW() WHERE id = :id')
            ->execute([':s' => $nextStage, ':id' => (int)$id]);
    } else {
        $pdo->prepare('UPDATE payment_orders SET recovery_stage = :s, recovery_sent_at = NOW() WHERE razorpay_order_id = :id')
            ->execute([':s' => $nextStage, ':id' => (string)$id]);
    }

    error_log('[recovery] sent stage ' . $nextStage . ' (' . $trigger . ') ' . $kind . ' ' . $id
        . ' last-seen ' . $lastSeen);

    return ['ok' => true, 'stage' => $nextStage, 'error' => ''];
}
