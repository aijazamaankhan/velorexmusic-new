<?php
// Shared finalization step for both the browser-handshake (verify.php) and
// the server-to-server webhook (webhook.php). Both paths can fire for the
// same payment, sometimes both, sometimes only one — this function is the
// single place that turns a verified payment into:
//   - a stock decrement
//   - a row in the orders table
//   - a payment_orders row marked 'paid' with the internal_order_id
//
// IDEMPOTENCY is the security property that matters most here. If the
// payment_orders row is already 'paid', we return its existing internal
// order id without doing anything else — so the webhook arriving 5 seconds
// after the browser handshake doesn't double-decrement stock or create a
// duplicate order. Likewise, a repeated verify call from the client (page
// refresh in the success view) returns the existing order rather than
// erroring.

require_once __DIR__ . '/config.php';

// Returns ['orderId' => 'VD-XXXXXXXX', 'alreadyFinalized' => bool, 'userId' => int]
// or throws on:
//   - payment_orders row missing
//   - payment_orders status='failed' (terminal — don't try again)
//   - DB error
//
// Callers are responsible for upstream signature verification BEFORE invoking
// this function. This function does NOT verify the Razorpay signature.
function finalize_payment(PDO $pdo, string $razorpayOrderId, string $razorpayPaymentId): array {
    if ($razorpayOrderId === '' || $razorpayPaymentId === '') {
        throw new InvalidArgumentException('Missing razorpay order or payment id');
    }

    $pdo->beginTransaction();
    try {
        // Lock the payment_orders row so concurrent verify + webhook firings
        // serialize and only one of them does the actual finalization.
        $stmt = $pdo->prepare('SELECT * FROM payment_orders WHERE razorpay_order_id = :rid FOR UPDATE');
        $stmt->execute([':rid' => $razorpayOrderId]);
        $po = $stmt->fetch();
        if (!$po) {
            $pdo->rollBack();
            throw new RuntimeException('Payment order not found: ' . $razorpayOrderId);
        }

        // Idempotent fast-path: already finalized → return existing internal id.
        if ($po['status'] === 'paid' && !empty($po['internal_order_id'])) {
            $pdo->commit();
            return [
                'orderId'          => (string)$po['internal_order_id'],
                'alreadyFinalized' => true,
                'userId'           => $po['user_id'] !== null ? (int)$po['user_id'] : null,
            ];
        }
        if ($po['status'] === 'failed') {
            $pdo->rollBack();
            throw new RuntimeException('Payment is in failed state and cannot be finalized');
        }

        $userId = $po['user_id'] !== null ? (int)$po['user_id'] : null;
        $items  = json_decode($po['items'], true);
        $addr   = json_decode($po['shipping_address'], true);
        $guestContact = isset($po['guest_contact']) && $po['guest_contact'] !== null
            ? json_decode($po['guest_contact'], true) : null;
        if (!is_array($items) || !is_array($addr)) {
            $pdo->rollBack();
            throw new RuntimeException('Payment order has malformed snapshot');
        }

        // Build the canonical contact block stored on the order. Tracking,
        // order-confirmation emails, and admin support all read this single
        // field rather than chasing through users / guest_contact branches.
        if ($userId !== null) {
            $uStmt = $pdo->prepare('SELECT email, phone, first_name, last_name FROM users WHERE id = :id');
            $uStmt->execute([':id' => $userId]);
            $u = $uStmt->fetch();
            $fullName = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? ''));
            $contact = [
                'email'    => $u['email']  ?? '',
                'phone'    => $u['phone']  ?? ($addr['phone'] ?? ''),
                'fullName' => $fullName !== '' ? $fullName : ($addr['fullName'] ?? ''),
                'isGuest'  => false,
            ];
        } else {
            $contact = [
                'email'    => $guestContact['email']    ?? '',
                'phone'    => $guestContact['phone']    ?? ($addr['phone'] ?? ''),
                'fullName' => $guestContact['fullName'] ?? ($addr['fullName'] ?? ''),
                'isGuest'  => true,
            ];
        }

        // Generate the internal customer-facing order id. Random hex chosen so
        // it's not enumerable from a counter and won't collide under load.
        // Retry on the (~vanishingly rare) collision.
        $internalOrderId = null;
        for ($i = 0; $i < 5; $i++) {
            $candidate = 'VD-' . strtoupper(bin2hex(random_bytes(4)));
            $check = $pdo->prepare('SELECT 1 FROM orders WHERE id = :id LIMIT 1');
            $check->execute([':id' => $candidate]);
            if (!$check->fetch()) { $internalOrderId = $candidate; break; }
        }
        if ($internalOrderId === null) {
            $pdo->rollBack();
            throw new RuntimeException('Could not allocate a unique order id');
        }

        // Decrement stock atomically. SELECT ... FOR UPDATE ensures no race
        // with a parallel checkout (or another worker reading the same row).
        $sel = $pdo->prepare('SELECT stock FROM products WHERE id = :id FOR UPDATE');
        $upd = $pdo->prepare('UPDATE products SET stock = :s WHERE id = :id');
        foreach ($items as $line) {
            if (!is_array($line)) continue;
            $pid = isset($line['id']) ? (int)$line['id'] : 0;
            $qty = isset($line['qty']) ? (int)$line['qty'] : 0;
            if ($pid <= 0 || $qty <= 0) continue;
            $sel->execute([':id' => $pid]);
            $row = $sel->fetch();
            if (!$row) continue; // product was deleted between order and finalize — let the order stand
            $current  = (int)$row['stock'];
            $newStock = max(0, $current - $qty);
            $upd->execute([':s' => $newStock, ':id' => $pid]);
        }

        // Compute display fields. The amount stored on payment_orders is the
        // canonical price the user was charged — never re-read it from
        // anywhere else.
        $amountPaise = (int)$po['amount_paise'];
        $totalRupees = intdiv($amountPaise, 100);
        $subtotal = array_sum(array_map(
            fn($l) => (int)($l['lineTotal'] ?? 0),
            array_filter($items, 'is_array')
        ));
        $shipping = max(0, $totalRupees - $subtotal);

        $orderData = [
            'id'              => $internalOrderId,
            'date'            => date('j F Y'),
            'status'          => 'pending',
            'paymentId'       => $razorpayPaymentId,
            'razorpayOrderId' => $razorpayOrderId,
            'items'           => $items,
            'subtotal'        => $subtotal,
            'shipping'        => $shipping,
            'total'           => $totalRupees,
            'amountPaise'     => $amountPaise,
            'currency'        => $po['currency'],
            'mode'            => $po['mode'],
            'shippingAddress' => $addr,
            'contact'         => $contact,
        ];
        $initialHistory = [[
            'status' => 'pending',
            'at'     => date('Y-m-d H:i:s'),
            'by'     => 'system',
            'note'   => 'Payment captured (' . $po['mode'] . ' mode)',
        ]];

        $ins = $pdo->prepare('INSERT INTO orders
            (id, user_id, status, order_data, status_history)
            VALUES (:id, :u, :st, :data, :hist)');
        $ins->execute([
            ':id'   => $internalOrderId,
            ':u'    => $userId, // null for guest orders — column is nullable, FK uses ON DELETE SET NULL
            ':st'   => 'pending',
            ':data' => json_encode($orderData),
            ':hist' => json_encode($initialHistory),
        ]);

        $updPo = $pdo->prepare('UPDATE payment_orders
            SET status = :st, razorpay_payment_id = :pid, internal_order_id = :iid
            WHERE razorpay_order_id = :rid');
        $updPo->execute([
            ':st'  => 'paid',
            ':pid' => $razorpayPaymentId,
            ':iid' => $internalOrderId,
            ':rid' => $razorpayOrderId,
        ]);

        $pdo->commit();
        return [
            'orderId'          => $internalOrderId,
            'alreadyFinalized' => false,
            'userId'           => $userId, // null for guest orders
        ];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// Mark a payment as failed. Idempotent — safe to call multiple times.
// Does NOT throw if the payment is already finalized (paid) — in that case
// we ignore the failure event because the payment did go through.
function mark_payment_failed(PDO $pdo, string $razorpayOrderId, ?string $reason = null): void {
    $stmt = $pdo->prepare(
        "UPDATE payment_orders
           SET status = 'failed'
         WHERE razorpay_order_id = :rid
           AND status = 'created'"
    );
    $stmt->execute([':rid' => $razorpayOrderId]);
    // Reason intentionally not persisted right now — schema would need a
    // failure_reason column. Keep this function's signature so we can wire
    // that up later without changing callers.
    unset($reason);
}
