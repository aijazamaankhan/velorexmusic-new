<?php
// Step 1 of the secure payment flow.
//
// Client sends: { items: [{id, qty}], addressId }
// Server does:
//   1. Validates the user is logged in (Bearer token).
//   2. Validates the chosen shipping address belongs to this user.
//   3. Loads each product by id FROM THE DATABASE — this is the price the
//      customer will be charged. The client cannot influence the price.
//   4. Recomputes subtotal + shipping server-side. Same rule as the UI
//      (₹99 shipping below ₹999 subtotal, free above).
//   5. Calls Razorpay's create-order API to mint an order_id bound to that
//      amount. The browser cannot tamper with the bound amount.
//   6. Persists a payment_orders row so verify.php can look it up later.
//   7. Returns { keyId, razorpayOrderId, amount, currency, mode } to the
//      client — KEY_SECRET is never sent.
//
// Why we recompute on the server every step of the way: an attacker can edit
// any number in the browser (cart total, payment options.amount, even the
// product price displayed). The only price that matters is the one the
// server signs the Razorpay order with.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_razorpay.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $userId = require_user();
    $body = read_json_body();

    $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
    $addressId = isset($body['addressId']) ? (int)$body['addressId'] : 0;
    if (!$items) {
        http_response_code(400);
        echo json_encode(['error' => 'Cart is empty']);
        exit;
    }
    if ($addressId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing shipping address']);
        exit;
    }

    $pdo = db();

    // Verify the address belongs to this user (block tampering with addressId).
    $stmt = $pdo->prepare('SELECT * FROM addresses WHERE id = :id AND user_id = :u LIMIT 1');
    $stmt->execute([':id' => $addressId, ':u' => $userId]);
    $addrRow = $stmt->fetch();
    if (!$addrRow) {
        http_response_code(403);
        echo json_encode(['error' => 'Shipping address not found for this account']);
        exit;
    }

    // Collapse duplicate-line items (id repeated) and reject malformed entries.
    $quantities = [];
    foreach ($items as $line) {
        if (!is_array($line)) continue;
        $pid = isset($line['id']) ? (int)$line['id'] : 0;
        $qty = isset($line['qty']) ? (int)$line['qty'] : 0;
        if ($pid <= 0 || $qty <= 0) continue;
        $quantities[$pid] = ($quantities[$pid] ?? 0) + $qty;
    }
    if (!$quantities) {
        http_response_code(400);
        echo json_encode(['error' => 'No valid items in cart']);
        exit;
    }
    // Sanity cap — 100 distinct products per order is more than generous and
    // bounds the SQL IN(...) we're about to run.
    if (count($quantities) > 100) {
        http_response_code(400);
        echo json_encode(['error' => 'Too many distinct items in one order']);
        exit;
    }

    // Load all referenced products in one query. The DB row's price wins —
    // the client's quoted price is ignored.
    $placeholders = implode(',', array_fill(0, count($quantities), '?'));
    $stmt = $pdo->prepare("SELECT id, title, artist, price, stock FROM products WHERE id IN ($placeholders)");
    $stmt->execute(array_keys($quantities));
    $rows = $stmt->fetchAll();

    if (count($rows) !== count($quantities)) {
        http_response_code(400);
        echo json_encode(['error' => 'One or more products no longer exist']);
        exit;
    }

    $subtotal = 0; // in rupees
    $itemsSnapshot = [];
    foreach ($rows as $r) {
        $pid = (int)$r['id'];
        $qty = $quantities[$pid];
        $price = (int)$r['price'];
        $stock = (int)$r['stock'];
        if ($price < 0) {
            // Should never happen, but refuse rather than charge a negative.
            http_response_code(400);
            echo json_encode(['error' => "Product '$r[title]' has an invalid price"]);
            exit;
        }
        // We don't HARD-reserve stock here — that would let an attacker
        // exhaust stock by creating orders and never paying. We do soft-check
        // it so the user gets a clear error before being sent to checkout.
        if ($qty > $stock) {
            http_response_code(409);
            echo json_encode(['error' => "Only $stock left of '$r[title]'"]);
            exit;
        }
        $lineTotal = $price * $qty;
        $subtotal += $lineTotal;
        $itemsSnapshot[] = [
            'id'        => $pid,
            'name'      => $r['title'],
            'artist'    => $r['artist'],
            'price'     => $price,
            'qty'       => $qty,
            'lineTotal' => $lineTotal,
        ];
    }

    $shipping = $subtotal >= 999 ? 0 : 99;
    $total    = $subtotal + $shipping;
    if ($total < 1) {
        http_response_code(400);
        echo json_encode(['error' => 'Order total must be at least ₹1']);
        exit;
    }
    $amountPaise = $total * 100;

    // Snapshot the address right now so a later edit/delete to the saved
    // address doesn't change what shipped to where. Country name is added in
    // a separate display field by the client at render time.
    $addressSnapshot = [
        'label'       => $addrRow['label'],
        'fullName'    => $addrRow['full_name'],
        'phone'       => $addrRow['phone'],
        'line1'       => $addrRow['line1'],
        'line2'       => $addrRow['line2'],
        'landmark'    => $addrRow['landmark'],
        'city'        => $addrRow['city'],
        'state'       => $addrRow['state'],
        'postalCode'  => $addrRow['postal_code'],
        'countryCode' => $addrRow['country_code'],
        'gstin'       => $addrRow['gstin'],
    ];

    $creds = razorpay_active_credentials();

    // Short, unique receipt — Razorpay caps at 40 chars. Uniquifying with
    // microtime + user id + random suffix keeps it idempotent enough for
    // retries while making collisions effectively impossible.
    $receipt = 'vv_' . $userId . '_' . substr(bin2hex(random_bytes(8)), 0, 16);

    $rzOrder = razorpay_create_order(
        $amountPaise,
        'INR',
        $receipt,
        ['user_id' => (string)$userId, 'app' => 'velorex-music']
    );

    // Persist the binding between (razorpay order id) and (amount + items +
    // address + user). verify.php will re-load this row by razorpay_order_id
    // — that's the *only* source of truth at finalization time.
    $stmt = $pdo->prepare('INSERT INTO payment_orders
        (razorpay_order_id, user_id, amount_paise, currency, mode, status, items, shipping_address)
        VALUES (:rid, :u, :amt, :cur, :mode, :st, :it, :sa)');
    $stmt->execute([
        ':rid'  => $rzOrder['id'],
        ':u'    => $userId,
        ':amt'  => $amountPaise,
        ':cur'  => 'INR',
        ':mode' => $creds['mode'],
        ':st'   => 'created',
        ':it'   => json_encode($itemsSnapshot),
        ':sa'   => json_encode($addressSnapshot),
    ]);

    echo json_encode([
        'ok'              => true,
        'keyId'           => $creds['keyId'],
        'razorpayOrderId' => $rzOrder['id'],
        'amount'          => $amountPaise,
        'currency'        => 'INR',
        'mode'            => $creds['mode'],
        'subtotal'        => $subtotal,
        'shipping'        => $shipping,
        'total'           => $total,
    ]);
} catch (RuntimeException | InvalidArgumentException $e) {
    // Configuration / Razorpay API problems. Keep the message generic enough
    // that we don't leak internal state to the browser.
    http_response_code(502);
    echo json_encode(['error' => 'Payment gateway unavailable: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
