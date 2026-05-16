<?php
// Razorpay integration helpers — shared between create-order.php, verify.php
// and webhook.php. Talks to Razorpay directly via cURL (no Composer / SDK
// dependency).
//
// SECURITY NOTES — read before changing anything in this file.
//
// 1. The KEY_SECRET and WEBHOOK_SECRET must never leave the server. Only
//    KEY_ID is safe to send to the browser.
// 2. Signature comparisons use hash_equals() for constant-time compare —
//    do NOT replace with === or strcmp, those leak timing information.
// 3. The signature is computed over the raw request body (for webhooks) and
//    over the exact concatenation `order_id|payment_id` (for handshake
//    verification). Re-encoding parsed JSON before hashing will silently break
//    verification because Razorpay's signature uses the bytes they sent.
// 4. If RAZORPAY_MODE is misconfigured (or the corresponding key set is empty),
//    razorpay_active_credentials() throws — callers must let that propagate to
//    a 500 rather than falling back to a different mode silently.

require_once __DIR__ . '/config.php';

function razorpay_active_credentials(): array {
    if (!defined('RAZORPAY_MODE')) {
        throw new RuntimeException('RAZORPAY_MODE is not configured in secrets file');
    }
    $mode = strtolower(trim(RAZORPAY_MODE));
    if ($mode !== 'test' && $mode !== 'live') {
        throw new RuntimeException("RAZORPAY_MODE must be 'test' or 'live', got '$mode'");
    }
    $prefix = $mode === 'live' ? 'RAZORPAY_LIVE_' : 'RAZORPAY_TEST_';
    foreach (['KEY_ID', 'KEY_SECRET'] as $name) {
        $const = $prefix . $name;
        if (!defined($const) || trim((string)constant($const)) === '') {
            throw new RuntimeException("$const is not configured in secrets file");
        }
    }
    $webhookConst = $prefix . 'WEBHOOK_SECRET';
    return [
        'mode'          => $mode,
        'keyId'         => constant($prefix . 'KEY_ID'),
        'keySecret'     => constant($prefix . 'KEY_SECRET'),
        // Webhook secret may legitimately be empty (until the dashboard
        // webhook is configured). Webhook handler will refuse to run in that
        // case; the rest of the flow does not need it.
        'webhookSecret' => defined($webhookConst) ? (string)constant($webhookConst) : '',
    ];
}

// Creates an Order on Razorpay's side and returns the parsed response.
// Throws RuntimeException on HTTP error or malformed response.
function razorpay_create_order(int $amountPaise, string $currency, string $receipt, array $notes = []): array {
    if ($amountPaise < 100) {
        throw new InvalidArgumentException('Amount must be at least 100 paise (₹1.00)');
    }
    if (!preg_match('/^[A-Z]{3}$/', $currency)) {
        throw new InvalidArgumentException('Currency must be a 3-letter ISO code');
    }
    $creds = razorpay_active_credentials();

    $payload = [
        'amount'   => $amountPaise,
        'currency' => $currency,
        'receipt'  => substr($receipt, 0, 40), // Razorpay caps receipt at 40 chars
        // Capture mode 'automatic' = Razorpay captures the payment automatically
        // once authorized. The alternative ('manual') leaves the auth in a
        // pending state until we call /payments/:id/capture — we don't need
        // that complexity yet.
        'payment_capture' => 1,
    ];
    if ($notes) $payload['notes'] = $notes;

    $ch = curl_init('https://api.razorpay.com/v1/orders');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => $creds['keyId'] . ':' . $creds['keySecret'],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        // Pin TLS — Razorpay only accepts HTTPS and we should never accept
        // a downgraded connection or a broken cert.
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Razorpay API request failed: ' . $err);
    }
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Razorpay API returned non-JSON response (HTTP ' . $httpCode . ')');
    }
    if ($httpCode < 200 || $httpCode >= 300) {
        $apiErr = $decoded['error']['description'] ?? ('HTTP ' . $httpCode);
        // Deliberately don't echo back the full Razorpay error body to the
        // client — it can include internal diagnostic details.
        throw new RuntimeException('Razorpay rejected order: ' . $apiErr);
    }
    if (empty($decoded['id'])) {
        throw new RuntimeException('Razorpay response missing order id');
    }
    return $decoded;
}

// Verifies the handshake signature returned by Razorpay Checkout after a
// successful payment. Returns true on match, false otherwise. Always use
// hash_equals() — never === for crypto comparisons.
function razorpay_verify_handshake_signature(string $orderId, string $paymentId, string $signature): bool {
    if ($orderId === '' || $paymentId === '' || $signature === '') return false;
    $creds = razorpay_active_credentials();
    $expected = hash_hmac('sha256', $orderId . '|' . $paymentId, $creds['keySecret']);
    return hash_equals($expected, $signature);
}

// Verifies a webhook payload. $body must be the raw, un-decoded request body
// exactly as Razorpay sent it (json_encode of a parsed array won't match).
function razorpay_verify_webhook_signature(string $rawBody, string $signature): bool {
    if ($signature === '' || $rawBody === '') return false;
    $creds = razorpay_active_credentials();
    if ($creds['webhookSecret'] === '') {
        // Caller should bail out before calling this — but we return false as
        // a belt-and-suspenders so a misconfigured webhook never authenticates.
        return false;
    }
    $expected = hash_hmac('sha256', $rawBody, $creds['webhookSecret']);
    return hash_equals($expected, $signature);
}
