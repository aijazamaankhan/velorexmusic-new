<?php
// =============================================================================
// /api/coupon-validate.php — quote a coupon against a cart (PUBLIC)
//
//   POST { code, items: [{id, qty}] }  ->  { ok, code, discount, label, subtotal }
//                                          { ok:false, error }
//
// DISPLAY ONLY. Nothing here changes what anyone is charged — the charge is
// decided by the identical coupon_evaluate() call inside
// api/payments/create-order.php, against a subtotal that endpoint derives for
// itself. This exists so the cart can show the discount before the customer
// commits, and it re-prices the items from the DB rather than trusting the
// posted cart precisely so the number it shows is the number that will apply.
//
// Rate-consideration: the failure message for an unknown code is identical to
// the one for a disabled code, so this cannot be used to enumerate live codes.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_coupon_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $body  = read_json_body();
    $code  = isset($body['code']) ? (string)$body['code'] : '';
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    if (trim($code) === '') {
        echo json_encode(['ok' => false, 'error' => 'Enter a coupon code']);
        exit;
    }
    if (!$items) {
        echo json_encode(['ok' => false, 'error' => 'Your cart is empty']);
        exit;
    }

    $pdo = db();

    // Re-price from the products table. The posted cart supplies ids and
    // quantities and nothing else — never a price, for the same reason
    // create-order.php ignores client prices.
    $subtotal = 0;
    $ids = [];
    foreach ($items as $line) {
        if (!is_array($line)) continue;
        $pid = isset($line['id']) ? (int)$line['id'] : 0;
        $qty = isset($line['qty']) ? (int)$line['qty'] : 0;
        if ($pid > 0 && $qty > 0) $ids[$pid] = ($ids[$pid] ?? 0) + $qty;
    }
    if (!$ids) {
        echo json_encode(['ok' => false, 'error' => 'Your cart is empty']);
        exit;
    }

    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT id, price FROM products WHERE id IN ($ph)");
    $st->execute(array_keys($ids));
    foreach ($st->fetchAll() as $r) {
        $subtotal += ((int)$r['price']) * (int)$ids[(int)$r['id']];
    }

    // The signed-in caller, if there is one. Optional auth: a guest quoting a
    // coupon is the common case, and the per-customer limit is re-checked
    // against the real identity at create-order time regardless.
    $userId = current_user_id_or_null();

    $res = coupon_evaluate($pdo, $code, (int)$subtotal, $userId, null);
    if (!$res['ok']) {
        echo json_encode(['ok' => false, 'error' => $res['error'], 'subtotal' => $subtotal]);
        exit;
    }

    echo json_encode([
        'ok'       => true,
        'code'     => coupon_normalize_code($code),
        'discount' => (int)$res['discount'],
        'label'    => (string)$res['label'],
        'subtotal' => $subtotal,
    ]);
} catch (Throwable $e) {
    error_log('[coupon-validate] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not check that coupon right now']);
}
