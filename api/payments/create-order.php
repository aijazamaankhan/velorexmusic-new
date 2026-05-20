<?php
// Step 1 of the secure payment flow.
//
// Two callers, one contract:
//
//   Registered user (Bearer token present):
//     Client sends: { items: [{id, qty}], addressId }
//     Server uses the saved address row keyed by addressId+user_id.
//
//   Guest checkout (no token):
//     Client sends: { items: [{id, qty}], contact: {email, phone},
//                     shippingAddress: {fullName, phone, line1, line2?, landmark?,
//                                       city, state?, postalCode?, countryCode, gstin?, label?} }
//     Server validates contact + address inline (no save to addresses table —
//     guests by definition have no account to attach a saved address to).
//
// In both paths the server does:
//   1. Loads each product by id FROM THE DATABASE — this is the price the
//      customer will be charged. The client cannot influence the price.
//   2. Recomputes subtotal + shipping server-side. Same zone rule as the UI
//      (see api/_shipping_helpers.php — mirror of src/js/shipping.js): zone
//      based on the shipping address (Delhi/NCR ₹49, rest of India ₹99,
//      remote zones ₹199), free PAN India at ₹5,000+ subtotal.
//   3. Calls Razorpay's create-order API to mint an order_id bound to that
//      amount. The browser cannot tamper with the bound amount.
//   4. Persists a payment_orders row so verify.php can look it up later.
//      For guests user_id stays NULL and the contact snapshot goes into
//      payment_orders.guest_contact.
//   5. Returns { keyId, razorpayOrderId, amount, currency, mode } to the
//      client — KEY_SECRET is never sent.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_razorpay.php';
require_once __DIR__ . '/../_address_helpers.php';
require_once __DIR__ . '/../_shipping_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $userId = current_user_id_or_null();
    $body = read_json_body();

    $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
    if (!$items) {
        http_response_code(400);
        echo json_encode(['error' => 'Cart is empty']);
        exit;
    }

    $pdo = db();

    // -------- Resolve the shipping address + guest contact --------
    // $addressSnapshot is the canonical shape persisted into payment_orders
    // (then later into orders.order_data). $guestContact is JSON-stored on
    // payment_orders so finalize_payment() can copy email/phone into the order.
    $addressSnapshot = null;
    $guestContact    = null;

    if ($userId) {
        $addressId = isset($body['addressId']) ? (int)$body['addressId'] : 0;
        if ($addressId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing shipping address']);
            exit;
        }
        // Block tampering with addressId — must belong to the caller.
        $stmt = $pdo->prepare('SELECT * FROM addresses WHERE id = :id AND user_id = :u LIMIT 1');
        $stmt->execute([':id' => $addressId, ':u' => $userId]);
        $addrRow = $stmt->fetch();
        if (!$addrRow) {
            http_response_code(403);
            echo json_encode(['error' => 'Shipping address not found for this account']);
            exit;
        }
        $addressSnapshot = address_snapshot_from_row($addrRow);
    } else {
        // Guest path. Require contact + inline shippingAddress.
        $contact = isset($body['contact']) && is_array($body['contact']) ? $body['contact'] : [];
        $email = isset($contact['email']) ? trim((string)$contact['email']) : '';
        $phone = isset($contact['phone']) ? trim((string)$contact['phone']) : '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'A valid email is required to track your order']);
            exit;
        }
        if (!preg_match('/^[\d\s\-\+\(\)]{6,20}$/', $phone)) {
            http_response_code(400);
            echo json_encode(['error' => 'A valid phone number is required']);
            exit;
        }

        $addrIn = isset($body['shippingAddress']) && is_array($body['shippingAddress']) ? $body['shippingAddress'] : [];
        $err = validate_address_payload($addrIn);
        if ($err !== null) {
            http_response_code(400);
            echo json_encode(['error' => $err]);
            exit;
        }
        $addressSnapshot = address_snapshot_from_payload($addrIn);
        $guestContact = [
            'email'    => $email,
            'phone'    => $phone,
            'fullName' => $addressSnapshot['fullName'],
        ];
    }

    // -------- International gate --------
    // Velorex doesn't process intl payments through Razorpay today (no IEC /
    // FEMA setup yet); customers email orders@ for a manual quote + payment
    // link. The browser already disables Pay Now for non-IN addresses; this
    // is defense in depth in case anything bypasses the UI. Mirrors the
    // intl-block messaging in index.html so the frontend can surface it.
    $addrCountry = strtoupper((string)($addressSnapshot['countryCode'] ?? ''));
    if ($addrCountry !== '' && $addrCountry !== 'IN') {
        http_response_code(400);
        echo json_encode([
            'error' => 'We ship within India only. For international orders, please email orders@velorexmusic.com — we will quote shipping and share a payment link.',
            'code'  => 'intl_not_supported',
        ]);
        exit;
    }

    // -------- Items + canonical price --------
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

    $shipQuote = shipping_calculate((int)$subtotal, $addressSnapshot);
    $shipping  = $shipQuote['shipping'];
    $total     = $subtotal + $shipping;
    if ($total < 1) {
        http_response_code(400);
        echo json_encode(['error' => 'Order total must be at least ₹1']);
        exit;
    }
    $amountPaise = $total * 100;

    $creds = razorpay_active_credentials();

    // Short, unique receipt — Razorpay caps at 40 chars. Guest orders use a
    // 'g' marker instead of the user id so the receipt is still meaningful
    // when scanning Razorpay's dashboard.
    $receiptOwner = $userId ? (string)$userId : 'g';
    $receipt = 'vv_' . $receiptOwner . '_' . substr(bin2hex(random_bytes(8)), 0, 16);

    $rzNotes = ['app' => 'velorex-music'];
    if ($userId) {
        $rzNotes['user_id'] = (string)$userId;
    } else {
        $rzNotes['guest'] = '1';
        $rzNotes['email'] = $guestContact['email'];
    }

    $rzOrder = razorpay_create_order($amountPaise, 'INR', $receipt, $rzNotes);

    // Persist the binding between (razorpay order id) and (amount + items +
    // address + user-or-guest). verify.php will re-load this row by
    // razorpay_order_id — that's the *only* source of truth at finalization time.
    $stmt = $pdo->prepare('INSERT INTO payment_orders
        (razorpay_order_id, user_id, guest_contact, amount_paise, currency, mode, status, items, shipping_address)
        VALUES (:rid, :u, :gc, :amt, :cur, :mode, :st, :it, :sa)');
    $stmt->execute([
        ':rid'  => $rzOrder['id'],
        ':u'    => $userId,
        ':gc'   => $guestContact !== null ? json_encode($guestContact) : null,
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
