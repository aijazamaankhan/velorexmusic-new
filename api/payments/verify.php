<?php
// Step 3 of the secure payment flow. (Step 2 is Razorpay collecting the
// payment from the user inside their Checkout iframe.)
//
// Client sends: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Server does:
//   1. Verifies the user is logged in.
//   2. Verifies the HMAC-SHA256 signature using KEY_SECRET. If the signature
//      doesn't match, this is a forged success — refuse, do nothing else.
//   3. Verifies the payment_orders row exists AND belongs to this user.
//      Without this check, user A could submit user B's order/payment ids
//      with their own session and "claim" the order.
//   4. Calls finalize_payment() — idempotent, so a duplicate verify (e.g.
//      page refresh on the success view, or both this endpoint AND the
//      webhook firing) returns the same order id without side effects.
//
// Returns: { ok: true, orderId, alreadyFinalized: bool }

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_razorpay.php';
require_once __DIR__ . '/../_payment_finalize.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $userId = require_user();
    $body = read_json_body();

    $rzOrderId   = isset($body['razorpay_order_id'])   ? trim((string)$body['razorpay_order_id'])   : '';
    $rzPaymentId = isset($body['razorpay_payment_id']) ? trim((string)$body['razorpay_payment_id']) : '';
    $rzSignature = isset($body['razorpay_signature'])  ? trim((string)$body['razorpay_signature'])  : '';

    if ($rzOrderId === '' || $rzPaymentId === '' || $rzSignature === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing payment verification fields']);
        exit;
    }

    // Loose shape check — Razorpay ids look like `order_XXXX`/`pay_XXXX` and
    // signatures are 64-char hex. Reject obvious garbage early so a forged
    // body never even reaches the DB.
    if (!preg_match('/^[a-zA-Z0-9_]{8,40}$/', $rzOrderId)
        || !preg_match('/^[a-zA-Z0-9_]{8,40}$/', $rzPaymentId)
        || !preg_match('/^[a-f0-9]{64}$/', $rzSignature)) {
        http_response_code(400);
        echo json_encode(['error' => 'Malformed payment verification fields']);
        exit;
    }

    // -------- SIGNATURE VERIFICATION --------
    // This is the gate. Anything past this point trusts that Razorpay
    // actually captured this payment.
    if (!razorpay_verify_handshake_signature($rzOrderId, $rzPaymentId, $rzSignature)) {
        // Don't tell the attacker which part of the verification failed —
        // a single generic error keeps them from probing.
        http_response_code(400);
        echo json_encode(['error' => 'Payment signature verification failed']);
        exit;
    }

    // -------- OWNERSHIP CHECK --------
    // Ensures the logged-in user is the one who created this payment_orders
    // row in step 1. Without this, a malicious user could replay another
    // user's signature triple and claim someone else's order.
    $pdo = db();
    $stmt = $pdo->prepare('SELECT user_id, status, internal_order_id FROM payment_orders WHERE razorpay_order_id = :rid LIMIT 1');
    $stmt->execute([':rid' => $rzOrderId]);
    $po = $stmt->fetch();
    if (!$po) {
        http_response_code(404);
        echo json_encode(['error' => 'Payment order not found']);
        exit;
    }
    if ((int)$po['user_id'] !== $userId) {
        http_response_code(403);
        echo json_encode(['error' => 'Payment does not belong to this account']);
        exit;
    }

    // -------- FINALIZE (idempotent) --------
    $result = finalize_payment($pdo, $rzOrderId, $rzPaymentId);

    echo json_encode([
        'ok'               => true,
        'orderId'          => $result['orderId'],
        'alreadyFinalized' => $result['alreadyFinalized'],
    ]);
} catch (RuntimeException | InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
