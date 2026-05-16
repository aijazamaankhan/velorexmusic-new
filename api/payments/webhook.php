<?php
// Razorpay webhook receiver. Razorpay POSTs here for events configured in:
//   Dashboard → Settings → Webhooks → "Add new webhook"
//
// Subscribe to at minimum:
//   - payment.captured  (the happy path — money has moved)
//   - payment.failed    (so we mark payment_orders as failed)
//
// SECURITY:
//
// 1. The body is verified with HMAC-SHA256 against RAZORPAY_*_WEBHOOK_SECRET.
//    Without a matching signature, the request is rejected with 401. This is
//    the ONLY thing protecting this endpoint — there's no user auth here
//    because Razorpay's servers don't have credentials for our app. The
//    signature is the entire trust boundary.
//
// 2. The signature is computed over the RAW request body. Don't parse-then-
//    re-encode JSON before hashing; the byte ordering of keys etc. would
//    change and the signature would never match.
//
// 3. If the webhook secret is unset, we return 503 — never authenticate
//    against an empty secret (hash_hmac with an empty key still computes a
//    valid hash and an attacker who guesses an empty secret would get in).
//
// 4. Always return HTTP 200 once we've decided to accept the event, even if
//    the inner processing has nothing to do (e.g. duplicate event). Razorpay
//    retries non-2xx responses up to 24 hours, which can cause a storm of
//    duplicate webhook calls. Idempotency in finalize_payment() handles
//    duplicates; we just need to ack.
//
// 5. NEVER log the raw secret, full payment details, card metadata, or PII
//    from the webhook payload. error_log() entries here intentionally only
//    include the event id + type.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_razorpay.php';
require_once __DIR__ . '/../_payment_finalize.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // Refuse to authenticate if no webhook secret is configured. Otherwise an
    // attacker who notices the secret is blank could forge events.
    $creds = razorpay_active_credentials();
    if ($creds['webhookSecret'] === '') {
        http_response_code(503);
        echo json_encode(['error' => 'Webhook is not configured on this server']);
        exit;
    }

    // Read the raw body BEFORE any parsing. file_get_contents('php://input')
    // gives us the exact bytes Razorpay sent — needed for HMAC.
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || $rawBody === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Empty body']);
        exit;
    }

    $signature = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';
    if ($signature === '' || !razorpay_verify_webhook_signature($rawBody, $signature)) {
        // Don't tell the attacker anything they don't already know.
        http_response_code(401);
        echo json_encode(['error' => 'Invalid signature']);
        exit;
    }

    $event = json_decode($rawBody, true);
    if (!is_array($event) || empty($event['event'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Malformed event payload']);
        exit;
    }

    $type = (string)$event['event'];
    $eventId = $event['id'] ?? '(no-id)';
    $payment = $event['payload']['payment']['entity'] ?? null;

    // Only act on the events we know how to handle. Ack everything else so
    // Razorpay doesn't retry unsubscribed event types forever.
    if ($type === 'payment.captured' && is_array($payment)) {
        $rzOrderId   = (string)($payment['order_id'] ?? '');
        $rzPaymentId = (string)($payment['id'] ?? '');
        if ($rzOrderId === '' || $rzPaymentId === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Webhook payload missing order/payment id']);
            exit;
        }
        try {
            $result = finalize_payment(db(), $rzOrderId, $rzPaymentId);
            error_log('[razorpay-webhook] finalize event=' . $eventId
                . ' type=' . $type
                . ' order=' . $rzOrderId
                . ' internal=' . $result['orderId']
                . ' idempotent=' . ($result['alreadyFinalized'] ? '1' : '0'));
        } catch (RuntimeException $e) {
            // Most likely cause: payment_orders row doesn't exist (test event
            // from a wiped DB, or the webhook fired before create-order
            // committed). Log + ack — the next webhook retry will hit a
            // populated DB. If we 500 here Razorpay keeps retrying for 24h.
            error_log('[razorpay-webhook] finalize-failed event=' . $eventId . ' err=' . $e->getMessage());
        }
    } elseif ($type === 'payment.failed' && is_array($payment)) {
        $rzOrderId = (string)($payment['order_id'] ?? '');
        if ($rzOrderId !== '') {
            mark_payment_failed(db(), $rzOrderId, $payment['error_description'] ?? null);
            error_log('[razorpay-webhook] mark-failed event=' . $eventId . ' order=' . $rzOrderId);
        }
    } else {
        error_log('[razorpay-webhook] ack-unhandled event=' . $eventId . ' type=' . $type);
    }

    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    // Catch-all: ack to avoid retry storms, but log the error so we notice.
    error_log('[razorpay-webhook] handler-error: ' . $e->getMessage());
    http_response_code(200);
    echo json_encode(['ok' => true, 'note' => 'logged']);
}
