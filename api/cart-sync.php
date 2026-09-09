<?php
// =============================================================================
// /api/cart-sync.php — server-side cart snapshot (PUBLIC)
//
//   POST { cartKey, items: [{id, qty}] }  ->  { ok, itemCount, subtotal }
//
// The storefront cart lives in localStorage (CLAUDE.md §7) and never reached
// the server, so a visitor who added three records and closed the tab left no
// trace anywhere. That is the majority of cart abandonment and it was entirely
// invisible. This endpoint keeps one row per visitor holding the current cart,
// which is what the admin Abandoned panel reports on and what the recovery
// email quotes.
//
// It is called on a debounce from src/js/cart-sync.js on every cart mutation.
//
// WHAT THIS ENDPOINT WILL NOT DO
//   - It will not accept prices. Every line is re-priced from the products
//     table in marketing_price_cart(); the client sends ids and quantities only.
//   - It will not accept an email from an anonymous caller. See the long
//     comment at the top of _marketing_helpers.php: letting a browser attach an
//     arbitrary address to a cart turns the recovery mailer into a way to make
//     our server email a stranger on request. A logged-in caller's address is
//     read from `users` by id; nobody else supplies one here.
//
// An empty items array DELETES the row. A cart that has been emptied — whether
// by checking out or by the customer clearing it — is not an abandoned cart,
// and leaving a stale snapshot behind would mean mailing someone about records
// they have already bought.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_marketing_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $pdo = db();
    marketing_ensure_tables($pdo);

    $body    = read_json_body();
    $cartKey = (string)($body['cartKey'] ?? '');
    if (!marketing_valid_key($cartKey)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid cart key']);
        exit;
    }

    $rawItems = is_array($body['items'] ?? null) ? $body['items'] : [];

    // Identify the caller if they are signed in. Their email comes from the
    // users table, never from the request body.
    $userId = current_user_id_or_null();
    $email  = null;
    if ($userId !== null) {
        $u = $pdo->prepare('SELECT email FROM users WHERE id = :id LIMIT 1');
        $u->execute([':id' => $userId]);
        $found = $u->fetch();
        if ($found) $email = (string)$found['email'];
    }

    // --- Empty cart: drop the snapshot entirely. -----------------------------
    if (!$rawItems) {
        $del = $pdo->prepare('DELETE FROM carts WHERE cart_key = :k');
        $del->execute([':k' => $cartKey]);
        echo json_encode(['ok' => true, 'itemCount' => 0, 'subtotal' => 0, 'cleared' => true]);
        exit;
    }

    $priced = marketing_price_cart($pdo, $rawItems);
    if (!$priced['items']) {
        // Every id in the payload was unknown (deleted products, or junk).
        // Nothing worth storing, and nothing worth erroring over.
        echo json_encode(['ok' => true, 'itemCount' => 0, 'subtotal' => 0, 'stored' => false]);
        exit;
    }

    // Upsert on the unique cart_key.
    //
    // recovery_stage resets to 0 on every change: a visitor who adds another
    // record after receiving the 2-hour nudge has a NEW cart and should
    // re-enter the sequence, rather than being permanently spent on a basket
    // they have since changed.
    //
    // recovery_token is set on INSERT and never touched on UPDATE, so a link
    // already sitting in someone's inbox keeps working.
    //
    // The UPDATE half repeats the values under separate placeholder names
    // rather than using MySQL's VALUES() function. VALUES() in an
    // ON DUPLICATE KEY UPDATE clause has been deprecated since MySQL 8.0.20
    // and is slated for removal; Hostinger ships 8 or 9 depending on the plan,
    // and a silent breakage here would look like "carts stopped being tracked"
    // long before anyone thought to check a deprecation note. Distinct names
    // also sidestep the question of whether PDO will expand a repeated named
    // placeholder with emulation disabled.
    $sql = 'INSERT INTO carts
                (cart_key, user_id, email, items, item_count, subtotal, recovery_token)
            VALUES (:k, :u, :e, :items, :count, :sub, :tok)
            ON DUPLICATE KEY UPDATE
                user_id        = COALESCE(:u2, user_id),
                email          = COALESCE(:e2, email),
                items          = :items2,
                item_count     = :count2,
                subtotal       = :sub2,
                recovery_stage = 0,
                converted_at   = NULL,
                dismissed_at   = NULL,
                updated_at     = NOW()';
    $itemsJson = json_encode($priced['items']);
    $st = $pdo->prepare($sql);
    $st->execute([
        ':k'      => $cartKey,
        ':u'      => $userId,
        ':e'      => $email,
        ':items'  => $itemsJson,
        ':count'  => $priced['itemCount'],
        ':sub'    => $priced['subtotal'],
        ':tok'    => marketing_token(),
        ':u2'     => $userId,
        ':e2'     => $email,
        ':items2' => $itemsJson,
        ':count2' => $priced['itemCount'],
        ':sub2'   => $priced['subtotal'],
    ]);

    echo json_encode([
        'ok'        => true,
        'itemCount' => $priced['itemCount'],
        'subtotal'  => $priced['subtotal'],
    ]);
} catch (Throwable $e) {
    // A failed cart sync must never be visible to the shopper — the cart in
    // their browser is unaffected and their session continues normally.
    error_log('[cart-sync] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
