<?php
// =============================================================================
// Discount coupons — schema, validation and the discount calculation.
//
// Used by:
//   api/coupon-validate.php            (storefront quote — DISPLAY ONLY)
//   api/coupons.php                    (the promo popup's featured coupon)
//   api/admin/coupons.php              (admin CRUD)
//   api/payments/create-order.php      (AUTHORITATIVE — this is what is charged)
//   api/_payment_finalize.php          (records the redemption after payment)
//
// THE RULE THAT MAKES THIS SAFE
// coupon_evaluate() is the ONE place a discount is computed, and
// create-order.php calls it with the subtotal IT derived from DB prices — never
// a number the browser supplied. The storefront's quote endpoint calls the same
// function, so what the cart shows and what the till takes are the same
// calculation on the same inputs. This is the same property CLAUDE.md §17
// describes for combos, and it is why a combo could not simply store a
// discount: the browser does not get a vote on price.
//
// A coupon the server refuses is refused everywhere. If you ever find yourself
// adding a second copy of these checks — for speed, for a nicer message,
// anything — you are rebuilding the hole this file exists to avoid.
//
// The tables are created on first use, like blog_posts, combo_offers, carts and
// store_settings. There is no phpMyAdmin step.
// =============================================================================

require_once __DIR__ . '/config.php';

function coupons_ensure_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS coupons (
                id            INT PRIMARY KEY AUTO_INCREMENT,
                code          VARCHAR(40) NOT NULL,
                type          ENUM("percent","fixed") NOT NULL DEFAULT "percent",
                -- percent: 1..90. fixed: whole RUPEES (never paise — the money
                -- crossing the Razorpay wire is paise, but everything a human
                -- types here is rupees, and mixing the two is how you ship a
                -- 100x discount).
                value         INT NOT NULL,
                min_order     INT NOT NULL DEFAULT 0,
                max_discount  INT NULL,
                usage_limit   INT NULL,
                used_count    INT NOT NULL DEFAULT 0,
                per_user_limit INT NULL,
                starts_at     TIMESTAMP NULL DEFAULT NULL,
                expires_at    TIMESTAMP NULL DEFAULT NULL,
                status        ENUM("active","disabled") NOT NULL DEFAULT "active",
                featured      TINYINT(1) NOT NULL DEFAULT 0,
                headline      VARCHAR(120) NULL,
                -- Set = this code belongs to ONE customer and nobody else can
                -- redeem it. Matched against the address on the signed-in
                -- account, or the address typed at guest checkout — never
                -- against anything the browser merely asserts.
                customer_email VARCHAR(255) NULL,
                -- What the customer must have DONE to unlock this code. Every
                -- value here is verifiable from data this server owns — see
                -- coupon_trigger_check(). A trigger the browser could merely
                -- assert would be no trigger at all.
                trigger_event VARCHAR(24) NOT NULL DEFAULT "none",
                trigger_value INT NULL,
                created_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_coupon_code (code),
                KEY idx_coupon_status (status, featured)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        // One row per SUCCESSFUL redemption. Written by finalize_payment inside
        // the same transaction as the order, so a payment that rolls back
        // cannot leave a phantom redemption behind — and a coupon's used_count
        // can never drift above the orders that actually exist.
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS coupon_redemptions (
                id         INT PRIMARY KEY AUTO_INCREMENT,
                coupon_id  INT NOT NULL,
                code       VARCHAR(40) NOT NULL,
                order_id   VARCHAR(50) NOT NULL,
                user_id    INT NULL,
                email      VARCHAR(255) NULL,
                discount   INT NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_redemption_order (order_id),
                KEY idx_redemption_coupon (coupon_id),
                KEY idx_redemption_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        // Added on demand for installs whose coupons table predates it, the
        // same way the recovery columns and products.item_condition are.
        try {
            $has = $pdo->query("SHOW COLUMNS FROM coupons LIKE 'customer_email'")->fetchAll();
            if (!$has) {
                $pdo->exec('ALTER TABLE coupons ADD COLUMN customer_email VARCHAR(255) NULL');
            }
        } catch (Throwable $e) {
            error_log('[coupons] customer_email column unavailable: ' . $e->getMessage());
        }
        try {
            $has = $pdo->query("SHOW COLUMNS FROM coupons LIKE 'trigger_event'")->fetchAll();
            if (!$has) {
                $pdo->exec('ALTER TABLE coupons
                              ADD COLUMN trigger_event VARCHAR(24) NOT NULL DEFAULT "none",
                              ADD COLUMN trigger_value INT NULL');
            }
        } catch (Throwable $e) {
            // Degrades to "no coupon has a trigger", which is exactly how the
            // feature behaved before it existed.
            error_log('[coupons] trigger columns unavailable: ' . $e->getMessage());
        }
        $done = true;
    } catch (Throwable $e) {
        error_log('[coupons] table bootstrap failed: ' . $e->getMessage());
    }
}

// The address we may hold a customer to. Resolved from the SESSION for a
// signed-in caller rather than taken from the request, for the same reason
// /api/cart-sync.php refuses a client-supplied email (CLAUDE.md §26): an
// address the browser simply asserts proves nothing.
function coupon_identity_email(PDO $pdo, ?int $userId, ?string $guestEmail): ?string {
    if ($userId !== null) {
        try {
            $st = $pdo->prepare('SELECT email FROM users WHERE id = :id');
            $st->execute([':id' => $userId]);
            $e = $st->fetchColumn();
            if ($e) return strtolower(trim((string)$e));
        } catch (Throwable $e) { /* fall through */ }
        return null;
    }
    return ($guestEmail !== null && $guestEmail !== '') ? strtolower(trim($guestEmail)) : null;
}

// Codes are stored and compared UPPERCASE with surrounding space stripped, so
// "save10", "SAVE10 " and "Save10" are one coupon rather than three.
function coupon_normalize_code(string $code): string {
    return strtoupper(trim($code));
}

function coupon_valid_code_format(string $code): bool {
    return (bool)preg_match('/^[A-Z0-9][A-Z0-9_-]{2,39}$/', $code);
}

function coupon_find(PDO $pdo, string $code): ?array {
    coupons_ensure_tables($pdo);
    $code = coupon_normalize_code($code);
    if ($code === '') return null;
    try {
        $st = $pdo->prepare('SELECT * FROM coupons WHERE code = :c LIMIT 1');
        $st->execute([':c' => $code]);
        $row = $st->fetch();
        return $row ?: null;
    } catch (Throwable $e) {
        error_log('[coupons] lookup failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * The single decision point: may this cart use this code, and for how much?
 *
 * $subtotal MUST be the server-derived items subtotal in whole rupees. Callers
 * that have a client-supplied number have the wrong number.
 *
 * Returns:
 *   ['ok' => true,  'discount' => int, 'coupon' => row, 'label' => string]
 *   ['ok' => false, 'discount' => 0,   'error' => string]
 *
 * Deliberately NEVER discounts shipping. Delivery is a real cost the shop pays
 * per parcel (CLAUDE.md §16); a percentage coupon eating into it turns a
 * generous-looking offer into a loss on small baskets.
 */
// -----------------------------------------------------------------------------
// Trigger events — "do X to unlock this code"
//
// EVERY trigger here is checked against data this server owns. That is not a
// nicety: a trigger the browser could assert ("trust me, I subscribed") is not
// a trigger, it is a free discount with extra steps. The same reasoning that
// keeps prices out of the request body (CLAUDE.md §17) applies to the condition
// that unlocks a price.
//
//   none          Always available.
//   signup        Has a registered account. trigger_value = optional "within N
//                 days of joining", so a welcome offer stays a welcome offer
//                 rather than becoming a permanent discount for everyone who
//                 ever signed up.
//   subscribe     Is on the newsletter list AND actually opted in
//                 (consent_at IS NOT NULL — see §26; a row created only so the
//                 recovery mailer had an opt-out token is not a subscription).
//   first_order   Has never completed an order. The classic welcome code.
//   repeat_order  Has completed at least trigger_value orders. Loyalty.
//   min_items     The cart holds at least trigger_value units. This is the one
//                 the CART satisfies rather than the customer, so it is
//                 re-checked on every quote and again at create-order time.
//
// A guest with no email cannot satisfy an identity trigger, and is told to sign
// in rather than "invalid" — the code is real, they just are not yet someone we
// can check.
// -----------------------------------------------------------------------------
function coupon_trigger_labels(): array {
    return [
        'none'         => 'Anyone can use it',
        'signup'       => 'Has an account',
        'subscribe'    => 'Subscribed to the newsletter',
        'first_order'  => 'Has not ordered before',
        'repeat_order' => 'Has ordered before',
        'min_items'    => 'Cart holds enough items',
    ];
}

function coupon_valid_trigger(string $t): bool {
    return array_key_exists($t, coupon_trigger_labels());
}

/**
 * Returns '' when the trigger is satisfied, or the reason it is not.
 *
 * $context carries what only the caller knows — currently itemCount, the number
 * of UNITS in the cart that the caller has already re-priced from the DB.
 */
function coupon_trigger_check(PDO $pdo, array $c, ?int $userId, ?string $email, array $context): string {
    $trigger = (string)($c['trigger_event'] ?? 'none');
    if ($trigger === '' || $trigger === 'none') return '';

    $n = isset($c['trigger_value']) && $c['trigger_value'] !== null ? (int)$c['trigger_value'] : 0;

    // ---- Cart-shaped trigger: no identity needed ----------------------------
    if ($trigger === 'min_items') {
        $need = max(1, $n);
        $have = (int)($context['itemCount'] ?? 0);
        if ($have < $need) {
            $short = $need - $have;
            return 'Add ' . $short . ' more item' . ($short === 1 ? '' : 's') . ' to use this coupon';
        }
        return '';
    }

    // ---- Identity-shaped triggers -------------------------------------------
    $who = coupon_identity_email($pdo, $userId, $email);

    if ($trigger === 'signup') {
        if ($userId === null) return 'Create an account to use this coupon';
        if ($n > 0) {
            try {
                $st = $pdo->prepare('SELECT created_at FROM users WHERE id = :id');
                $st->execute([':id' => $userId]);
                $created = $st->fetchColumn();
                if ($created && strtotime((string)$created) < strtotime('-' . $n . ' days')) {
                    return 'This welcome offer is only valid for ' . $n . ' days after joining';
                }
            } catch (Throwable $e) {
                // A failed lookup must never grant the code.
                return 'Could not verify this coupon right now';
            }
        }
        return '';
    }

    if ($trigger === 'subscribe') {
        if ($who === null) return 'Sign in, or use the email you subscribed with';
        try {
            $st = $pdo->prepare(
                "SELECT 1 FROM subscribers
                  WHERE email = :e AND status = 'subscribed' AND consent_at IS NOT NULL
                  LIMIT 1"
            );
            $st->execute([':e' => $who]);
            if (!$st->fetchColumn()) return 'Subscribe to our newsletter to use this coupon';
        } catch (Throwable $e) {
            // No subscribers table yet means nobody has subscribed.
            return 'Subscribe to our newsletter to use this coupon';
        }
        return '';
    }

    if ($trigger === 'first_order' || $trigger === 'repeat_order') {
        if ($userId === null && ($who === null || $who === '')) {
            return 'Sign in to use this coupon';
        }
        $orders = coupon_completed_order_count($pdo, $userId, $who);
        if ($orders === null) return 'Could not verify this coupon right now';

        if ($trigger === 'first_order') {
            return $orders === 0 ? '' : 'This coupon is for first orders only';
        }
        $need = max(1, $n);
        if ($orders < $need) {
            return 'Available after ' . $need . ' order' . ($need === 1 ? '' : 's') . ' with us';
        }
        return '';
    }

    // An unknown trigger is unsatisfiable rather than ignored: a typo in the
    // column must not silently open a code to everybody.
    return 'This coupon is not available';
}

// How many orders this identity has completed. null = we could not tell, which
// every caller treats as "do not grant".
function coupon_completed_order_count(PDO $pdo, ?int $userId, ?string $email): ?int {
    try {
        if ($userId !== null) {
            $st = $pdo->prepare(
                "SELECT COUNT(*) FROM orders
                  WHERE user_id = :u
                    AND LOWER(status) NOT IN ('cancelled','canceled','refunded','failed')"
            );
            $st->execute([':u' => $userId]);
            return (int)$st->fetchColumn();
        }
        if ($email !== null && $email !== '') {
            // Guest orders carry the address inside order_data.contact.email —
            // the same place the admin Guests roll-up reads it from.
            $st = $pdo->prepare(
                "SELECT COUNT(*) FROM orders
                  WHERE user_id IS NULL
                    AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email'))) = :e
                    AND LOWER(status) NOT IN ('cancelled','canceled','refunded','failed')"
            );
            $st->execute([':e' => strtolower(trim($email))]);
            return (int)$st->fetchColumn();
        }
    } catch (Throwable $e) {
        error_log('[coupons] order-count check failed: ' . $e->getMessage());
        return null;
    }
    return null;
}

function coupon_evaluate(PDO $pdo, string $code, int $subtotal, ?int $userId, ?string $email, array $context = []): array {
    $fail = function (string $msg) {
        return ['ok' => false, 'discount' => 0, 'error' => $msg];
    };

    $code = coupon_normalize_code($code);
    if ($code === '') return $fail('Enter a coupon code');

    $c = coupon_find($pdo, $code);
    // Deliberately the SAME message for "no such code" and "disabled": telling
    // a stranger which codes exist turns this endpoint into a way to enumerate
    // them.
    if (!$c || $c['status'] !== 'active') return $fail('That coupon code is not valid');

    $now = time();
    if (!empty($c['starts_at']) && strtotime((string)$c['starts_at']) > $now) {
        return $fail('This coupon is not active yet');
    }
    if (!empty($c['expires_at']) && strtotime((string)$c['expires_at']) < $now) {
        return $fail('This coupon has expired');
    }

    $minOrder = (int)$c['min_order'];
    if ($minOrder > 0 && $subtotal < $minOrder) {
        return $fail('Spend ₹' . number_format($minOrder) . ' to use this coupon');
    }

    if ($c['usage_limit'] !== null && (int)$c['used_count'] >= (int)$c['usage_limit']) {
        return $fail('This coupon has been fully claimed');
    }

    // ---- Reserved for one customer -----------------------------------------
    // A personal code. The identity comes from the session or from the address
    // typed at guest checkout, never from a field the browser controls.
    $reserved = trim((string)($c['customer_email'] ?? ''));
    if ($reserved !== '') {
        $who = coupon_identity_email($pdo, $userId, $email);
        if ($who === null) {
            // The quote endpoint reaches here for a signed-out visitor: we
            // genuinely cannot tell yet. Say what would let us, rather than
            // "invalid", which would read as a broken code to the one person
            // it was made for.
            return $fail('Sign in with the account this coupon was sent to');
        }
        if ($who !== strtolower($reserved)) {
            return $fail('This coupon is reserved for another customer');
        }
    }

    // ---- Trigger ------------------------------------------------------------
    // "Do X to unlock this code". Verified server-side against data we own —
    // see coupon_trigger_check(). Checked BEFORE the usage counters so a
    // customer who has not met the condition is told what to do rather than
    // told the code is exhausted.
    $triggerFail = coupon_trigger_check($pdo, $c, $userId, $email, $context);
    if ($triggerFail !== '') return $fail($triggerFail);

    // Per-customer limit. Matched on user id when signed in, otherwise on the
    // email typed at guest checkout — the same two identities the recovery
    // mailer trusts (CLAUDE.md §26), and for the same reason: they are the only
    // two that are not simply asserted by the browser.
    $perUser = $c['per_user_limit'] !== null ? (int)$c['per_user_limit'] : 0;
    if ($perUser > 0) {
        try {
            if ($userId !== null) {
                $st = $pdo->prepare('SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = :cid AND user_id = :u');
                $st->execute([':cid' => (int)$c['id'], ':u' => $userId]);
            } elseif ($email !== null && $email !== '') {
                $st = $pdo->prepare('SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = :cid AND email = :e');
                $st->execute([':cid' => (int)$c['id'], ':e' => strtolower(trim($email))]);
            } else {
                $st = null;
            }
            if ($st && (int)$st->fetchColumn() >= $perUser) {
                return $fail('You have already used this coupon');
            }
        } catch (Throwable $e) {
            // A broken redemption table must not hand out unlimited discounts.
            error_log('[coupons] per-user check failed: ' . $e->getMessage());
            return $fail('Could not verify this coupon right now');
        }
    }

    // ---- The amount ---------------------------------------------------------
    $type  = (string)$c['type'];
    $value = (int)$c['value'];

    if ($type === 'percent') {
        $discount = (int)floor($subtotal * $value / 100);
        $cap = $c['max_discount'] !== null ? (int)$c['max_discount'] : 0;
        if ($cap > 0) $discount = min($discount, $cap);
        $label = $value . '% off';
    } else {
        $discount = $value;
        $label = '₹' . number_format($value) . ' off';
    }

    // Never below zero, and never more than the goods are worth. A discount
    // larger than the basket would otherwise produce a negative total and a
    // Razorpay order for a negative amount.
    $discount = max(0, min($discount, $subtotal));

    if ($discount <= 0) return $fail('This coupon does not apply to your cart');

    return ['ok' => true, 'discount' => $discount, 'coupon' => $c, 'label' => $label];
}

// The public shape of a coupon — never the internal counters.
function coupon_public(array $c): array {
    return [
        'code'        => (string)$c['code'],
        'type'        => (string)$c['type'],
        'value'       => (int)$c['value'],
        'minOrder'    => (int)$c['min_order'],
        'maxDiscount' => $c['max_discount'] !== null ? (int)$c['max_discount'] : null,
        'headline'    => (string)($c['headline'] ?? ''),
        'expiresAt'   => !empty($c['expires_at']) ? date('c', strtotime((string)$c['expires_at'])) : null,
    ];
}

// payment_orders needs two columns to remember which coupon was priced into a
// given Razorpay order. Added on demand, the same way the recovery columns and
// products.item_condition are — no phpMyAdmin step, and a failure here degrades
// to "no redemption recorded" rather than a broken checkout.
function coupons_ensure_payment_columns(PDO $pdo): bool {
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $cols = $pdo->query("SHOW COLUMNS FROM payment_orders LIKE 'coupon_code'")->fetchAll();
        if (!$cols) {
            $pdo->exec('ALTER TABLE payment_orders
                          ADD COLUMN coupon_code VARCHAR(40) NULL,
                          ADD COLUMN coupon_discount INT NOT NULL DEFAULT 0');
        }
        $ready = true;
    } catch (Throwable $e) {
        error_log('[coupons] payment_orders columns unavailable: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

// Record a successful redemption and advance the counter.
//
// Called from finalize_payment() INSIDE its transaction, so it commits with the
// order or not at all. The UNIQUE key on order_id makes it idempotent: the
// webhook and the browser handshake can both fire for one payment, and the
// second INSERT is ignored rather than double-counting a redemption.
function coupon_record_redemption(
    PDO $pdo, int $couponId, string $code, string $orderId,
    ?int $userId, ?string $email, int $discount
): void {
    coupons_ensure_tables($pdo);
    $st = $pdo->prepare(
        'INSERT IGNORE INTO coupon_redemptions
            (coupon_id, code, order_id, user_id, email, discount)
         VALUES (:cid, :code, :oid, :u, :e, :d)'
    );
    $st->execute([
        ':cid'  => $couponId,
        ':code' => $code,
        ':oid'  => $orderId,
        ':u'    => $userId,
        ':e'    => $email !== null && $email !== '' ? strtolower(trim($email)) : null,
        ':d'    => $discount,
    ]);
    // Only bump the counter when a row was genuinely inserted, so a replayed
    // finalize cannot inflate used_count past the number of real redemptions.
    if ($st->rowCount() > 0) {
        $pdo->prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = :id')
            ->execute([':id' => $couponId]);
    }
}
