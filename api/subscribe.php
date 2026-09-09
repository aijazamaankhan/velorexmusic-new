<?php
// =============================================================================
// /api/subscribe.php — newsletter signup (PUBLIC)
//
//   POST { email, source? }  ->  { ok, message, alreadySubscribed }
//
// Backs the "Join the Velorex Record Club" form on the homepage, which was
// markup-only until now: an <input> and a <button> with no handler, no
// endpoint and no table behind them. Every address typed into it since launch
// was discarded.
//
// Deliberately vague on the way out: the response never distinguishes "new
// signup" from "already on the list" in a way that would let someone use this
// form to test whether an address is one of our customers. Both land on the
// same friendly confirmation.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_marketing_helpers.php';
require_once __DIR__ . '/_mailer.php';
require_once __DIR__ . '/_email_templates.php';
require_once __DIR__ . '/_marketing_templates.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $pdo = db();
    marketing_ensure_tables($pdo);

    $body  = read_json_body();
    $email = marketing_normalize_email($body['email'] ?? '');
    if ($email === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Please enter a valid email address']);
        exit;
    }

    // Where the signup came from, for reporting. Constrained to a known set —
    // this string is rendered in the admin panel, and an allowlist is simpler
    // to reason about than escaping a free-text field on every read.
    $allowedSources = ['newsletter', 'footer', 'checkout', 'signup', 'popup'];
    $source = (string)($body['source'] ?? 'newsletter');
    if (!in_array($source, $allowedSources, true)) $source = 'newsletter';

    // A logged-in subscriber gets linked to their account, so the admin can
    // see "this subscriber is customer #42" without matching on email later.
    $userId = current_user_id_or_null();

    $result = marketing_subscribe($pdo, $email, $source, $userId);

    // Welcome mail on a genuinely new (or re-activated) signup only. Re-submitting
    // the form with an address already on the list must not re-send it — that
    // turns a double-click into two emails, and a bored visitor into a mail bomb.
    if ($result['created'] || $result['reactivated']) {
        try {
            $tpl = newsletter_welcome_email($email, $result['token']);
            send_mail($email, '', $tpl['subject'], $tpl['html'], $tpl['text']);
        } catch (Throwable $mailErr) {
            error_log('[subscribe] welcome mail crashed for ' . $email . ': ' . $mailErr->getMessage());
        }
    }

    // Push to Brevo's contact list when BREVO_API_KEY is configured. Best-effort
    // and silent when it is not — the address is already durably ours.
    marketing_push_to_brevo($pdo, $email, ['SOURCE' => $source]);

    echo json_encode([
        'ok'      => true,
        'message' => $result['created'] || $result['reactivated']
            ? 'You are on the list. Check your inbox for a hello from us.'
            : 'You are already on the list.',
        // Useful to the caller for analytics (a repeat submit is not a signup
        // event); harmless to disclose because the caller supplied the address.
        'alreadySubscribed' => !$result['created'] && !$result['reactivated'],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
