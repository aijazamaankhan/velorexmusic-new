<?php
// =============================================================================
// /api/coupons.php — the featured coupon for the storefront promo (PUBLIC)
//
//   GET -> { ok, coupon: {...} | null }
//
// Returns at most ONE coupon: the newest active, in-window, not-exhausted row
// flagged `featured`. Only one, deliberately — a popup listing five offers is
// an advert, and the point of this is a single clear thing the visitor can act
// on. Everything about the row that is internal (usage counters, per-user
// limits, the id) is stripped by coupon_public().
//
// Nothing here grants a discount. The code shown still has to survive
// coupon_evaluate() at checkout, so featuring a coupon someone cannot use
// costs nothing but a disappointed customer — which is why the query filters
// on the same window the evaluator does.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_coupon_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

header('Cache-Control: public, max-age=60');

try {
    $pdo = db();
    coupons_ensure_tables($pdo);

    $st = $pdo->query(
        'SELECT * FROM coupons
          WHERE status = "active" AND featured = 1
            -- Belt and braces with the admin validator: a code reserved for one
            -- customer must never be advertised to everyone.
            AND (customer_email IS NULL OR customer_email = "")
            AND (starts_at  IS NULL OR starts_at  <= NOW())
            AND (expires_at IS NULL OR expires_at >= NOW())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          ORDER BY updated_at DESC
          LIMIT 1'
    );
    $row = $st ? $st->fetch() : null;

    echo json_encode(['ok' => true, 'coupon' => $row ? coupon_public($row) : null]);
} catch (Throwable $e) {
    error_log('[coupons] ' . $e->getMessage());
    // Never fail the storefront over a promo.
    echo json_encode(['ok' => true, 'coupon' => null]);
}
