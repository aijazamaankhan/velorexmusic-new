<?php
// =============================================================================
// /api/unlocked-coupons.php — codes this visitor currently qualifies for (PUBLIC)
//
//   POST { itemCount?: int }  ->  { ok, coupons: [ {code, headline, label, ...} ] }
//
// Called by the storefront right after an unlocking EVENT — a signup, a
// newsletter subscription, the cart crossing an item threshold — so the shop
// can say "you have unlocked X" at the moment it becomes true, instead of
// leaving the customer to discover a code they were never told about.
//
// EVERY coupon returned has been through the same coupon_evaluate() the cart
// quote and the payment path use. So this endpoint cannot advertise a code that
// checkout would refuse: if it is listed here, it applies. That is the whole
// reason it re-runs the evaluator rather than reading the trigger column and
// guessing.
//
// It never returns a code reserved for a DIFFERENT customer, because
// coupon_evaluate() refuses those for anyone but the named address — and it
// never returns anything at all to a caller it cannot identify, beyond the
// cart-shaped triggers that need no identity.
//
// subtotal is derived here from the caller's cart the same way
// coupon-validate.php does it: ids and quantities in, DB prices applied. No
// price and no item count is trusted from the request beyond quantities.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_coupon_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// A hard ceiling on how many are offered at once. A wall of codes is not an
// offer, it is a menu — and the customer can only use one per order anyway.
const UNLOCKED_MAX = 3;

try {
    $pdo  = db();
    coupons_ensure_tables($pdo);

    $body  = read_json_body();
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    // Re-price the cart from the products table. Same rule as everywhere else:
    // the request supplies ids and quantities, never money.
    $qty = [];
    foreach ($items as $line) {
        if (!is_array($line)) continue;
        $pid = isset($line['id'])  ? (int)$line['id']  : 0;
        $q   = isset($line['qty']) ? (int)$line['qty'] : 0;
        if ($pid > 0 && $q > 0) $qty[$pid] = ($qty[$pid] ?? 0) + $q;
    }

    $subtotal  = 0;
    $itemCount = array_sum(array_map('intval', $qty));
    if ($qty) {
        $ph = implode(',', array_fill(0, count($qty), '?'));
        $st = $pdo->prepare("SELECT id, price FROM products WHERE id IN ($ph)");
        $st->execute(array_keys($qty));
        foreach ($st->fetchAll() as $r) {
            $subtotal += ((int)$r['price']) * (int)$qty[(int)$r['id']];
        }
    }

    $userId = current_user_id_or_null();

    // Only codes that are live right now and are NOT reserved for someone else.
    // A reserved code is offered only to its owner, and coupon_evaluate() below
    // is what actually enforces that — this clause just avoids loading every
    // personal code ever issued.
    $rows = [];
    try {
        $st = $pdo->prepare(
            'SELECT * FROM coupons
              WHERE status = "active"
                AND (starts_at  IS NULL OR starts_at  <= NOW())
                AND (expires_at IS NULL OR expires_at >= NOW())
                AND (usage_limit IS NULL OR used_count < usage_limit)
                AND (customer_email IS NULL OR customer_email = "" OR customer_email = :me)
              ORDER BY featured DESC, value DESC
              LIMIT 40'
        );
        $st->execute([':me' => (string)coupon_identity_email($pdo, $userId, null)]);
        $rows = $st->fetchAll();
    } catch (Throwable $e) {
        error_log('[unlocked-coupons] query failed: ' . $e->getMessage());
        $rows = [];
    }

    $out = [];
    foreach ($rows as $c) {
        if (count($out) >= UNLOCKED_MAX) break;

        // A coupon with NO trigger is not "unlocked" — it was always available,
        // and announcing it as a reward for signing up would be a small lie.
        $trigger = (string)($c['trigger_event'] ?? 'none');
        if ($trigger === '' || $trigger === 'none') continue;

        $res = coupon_evaluate($pdo, (string)$c['code'], (int)$subtotal, $userId, null,
                               ['itemCount' => $itemCount]);
        if (!$res['ok']) continue;

        $pub = coupon_public($c);
        $pub['label']    = (string)$res['label'];
        $pub['discount'] = (int)$res['discount'];
        $pub['trigger']  = $trigger;
        $out[] = $pub;
    }

    echo json_encode(['ok' => true, 'coupons' => $out]);
} catch (Throwable $e) {
    error_log('[unlocked-coupons] ' . $e->getMessage());
    // Never fail the storefront over a reward it might have offered.
    echo json_encode(['ok' => true, 'coupons' => []]);
}
