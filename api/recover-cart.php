<?php
// =============================================================================
// /api/recover-cart.php — restore a cart from a recovery link (PUBLIC)
//
//   GET ?token=<32hex>  ->  { ok, source, items: [{id, qty, ...}], subtotal }
//
// The "Your cart is waiting" emails link to
//   https://velorexmusic.com/?recover=<token>
// and src/js/cart-sync.js calls this on boot to refill the cart, so the
// customer lands back on a full cart instead of an empty shop.
//
// Two token spaces, one endpoint:
//   carts.recovery_token          — abandoned before checkout
//   payment_orders.recovery_token — abandoned at the payment step
// A checkout snapshot is the better source when both could match, because it
// is what they were seconds away from paying for.
//
// Stock is deliberately NOT enforced here. The client re-adds through
// CartHelpers.addToCart(), which already caps to available stock and tells the
// customer when it does (src/js/cart.js). Filtering silently on the server
// would drop a line with no explanation and make the cart quietly wrong.
//
// The token is a capability: whoever holds it sees that cart's contents. It is
// 128 bits of randomness delivered to the address that built the cart, and it
// discloses product ids and quantities — never an email, name or address.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_marketing_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$token = isset($_GET['token']) ? (string)$_GET['token'] : '';
if (!marketing_valid_key($token)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid recovery token']);
    exit;
}

try {
    $pdo = db();
    marketing_ensure_tables($pdo);

    $items    = null;
    $subtotal = 0;
    $source   = '';

    // ---- Checkout-stage abandonment first. ----------------------------------
    if (marketing_payment_orders_ready($pdo)) {
        $st = $pdo->prepare(
            "SELECT items, amount_paise, status
               FROM payment_orders
              WHERE recovery_token = :t
              LIMIT 1"
        );
        $st->execute([':t' => $token]);
        $po = $st->fetch();
        if ($po) {
            // A paid order is not recoverable — the customer completed it. Say
            // so plainly rather than refilling a cart they already bought.
            if ($po['status'] === 'paid') {
                echo json_encode(['ok' => false, 'reason' => 'already_purchased']);
                exit;
            }
            $decoded = json_decode((string)$po['items'], true);
            if (is_array($decoded)) {
                $items    = $decoded;
                $subtotal = (int)array_sum(array_map(
                    function ($l) { return is_array($l) ? (int)($l['lineTotal'] ?? 0) : 0; },
                    $decoded
                ));
                $source = 'checkout';
            }
        }
    }

    // ---- Otherwise a pre-checkout cart snapshot. ----------------------------
    if ($items === null) {
        $st = $pdo->prepare(
            'SELECT items, subtotal, converted_at FROM carts WHERE recovery_token = :t LIMIT 1'
        );
        $st->execute([':t' => $token]);
        $cart = $st->fetch();
        if ($cart) {
            if (!empty($cart['converted_at'])) {
                echo json_encode(['ok' => false, 'reason' => 'already_purchased']);
                exit;
            }
            $decoded = json_decode((string)$cart['items'], true);
            if (is_array($decoded)) {
                $items    = $decoded;
                $subtotal = (int)$cart['subtotal'];
                $source   = 'cart';
            }
        }
    }

    if ($items === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'reason' => 'not_found']);
        exit;
    }

    // Re-price against today's catalogue rather than replaying the snapshot.
    // A record whose price changed, or that has been delisted since, must not
    // come back into the cart at the old number.
    $repriced = marketing_price_cart($pdo, $items);

    echo json_encode([
        'ok'          => true,
        'source'      => $source,
        'items'       => $repriced['items'],
        'itemCount'   => $repriced['itemCount'],
        'subtotal'    => $repriced['subtotal'],
        // True when at least one line has gone away since the email was sent,
        // so the storefront can say so instead of quietly showing a shorter cart.
        'partial'     => count($repriced['items']) < count(array_filter($items, 'is_array')),
        'wasSubtotal' => $subtotal,
    ]);
} catch (Throwable $e) {
    error_log('[recover-cart] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
