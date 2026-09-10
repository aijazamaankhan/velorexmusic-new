<?php
// =============================================================================
// /api/admin/abandoned.php — abandoned carts + abandoned checkouts (ADMIN)
//
//   GET                             -> { rows: [...], stats: {...}, mailerReady }
//   POST { action, kind, id }       -> { ok }
//        action: dismiss | undismiss | send-recovery
//        kind:   cart | checkout
//
// TWO SOURCES, ONE LIST
//   kind=cart      row in `carts`         — added to cart, never reached checkout
//   kind=checkout  row in `payment_orders` — reached the payment step, never paid
//
// The second source needed no new capture at all: create-order.php has always
// written a payment_orders row BEFORE sending the customer to Razorpay, so
// every row still sitting at status='created' is a checkout someone walked
// away from, complete with their email, phone, items and address. That data
// was already in the database and nothing read it.
//
// A row only counts as ABANDONED once it has been quiet for GRACE_MINUTES.
// Without that the panel fills with carts belonging to people who are still
// shopping, and "abandoned" stops meaning anything.
//
// Rows inside the grace window are still returned, flagged `active: true`.
// They are excluded from every default view and from every statistic — but
// they are reachable from the "Active now" chip, and the empty state counts
// them. The first version omitted them entirely, and the result was that an
// owner who put two records in a cart and opened this panel saw "No abandoned
// carts — that is a good problem to have" and reasonably concluded the feature
// was broken. A panel that cannot distinguish "nobody has a cart" from "the
// carts are too fresh to chase" is not telling the truth about the shop.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_marketing_helpers.php';
require_once __DIR__ . '/../_mailer.php';
require_once __DIR__ . '/../_email_templates.php';
require_once __DIR__ . '/../_recovery.php';

require_admin();

// How long a cart must sit untouched before it counts as abandoned.
const ABANDON_GRACE_MINUTES = 60;
// How far back the panel looks. Older rows are still in the table (the cron
// prunes them) but a three-month-old cart is not a lead worth showing.
const ABANDON_WINDOW_DAYS = 60;

// Is this row still inside the grace window — i.e. someone may well be looking
// at that basket right now? Computed in PHP rather than in SQL so both queries
// return the same window and the caller decides what to do with the flag.
function marketing_is_active(string $lastActive): bool {
    if ($lastActive === '') return false;
    $ts = strtotime($lastActive);
    // MySQL hands back server-local time and PHP's default TZ matches the
    // connection here; a parse failure is treated as "not active" so an
    // unreadable timestamp can never hide a genuinely abandoned cart.
    if ($ts === false) return false;
    return $ts > (time() - (ABANDON_GRACE_MINUTES * 60));
}

try {
    $pdo = db();
    marketing_ensure_tables($pdo);
    $poReady = marketing_payment_orders_ready($pdo);

    // ---------------------------------------------------------------- GET ---
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = [];

        // ---- Pre-checkout carts --------------------------------------------
        $st = $pdo->prepare(
            'SELECT c.id, c.cart_key, c.user_id, c.email, c.items, c.item_count, c.subtotal,
                    c.recovery_token, c.recovery_stage, c.recovery_sent_at,
                    c.dismissed_at, c.created_at, c.updated_at,
                    u.first_name, u.last_name, u.phone
               FROM carts c
               LEFT JOIN users u ON u.id = c.user_id
              WHERE c.converted_at IS NULL
                AND c.updated_at > DATE_SUB(NOW(), INTERVAL ' . ABANDON_WINDOW_DAYS . ' DAY)
              ORDER BY c.updated_at DESC
              LIMIT 500'
        );
        $st->execute();
        foreach ($st->fetchAll() as $r) {
            $name = trim((string)($r['first_name'] ?? '') . ' ' . (string)($r['last_name'] ?? ''));
            $items = json_decode((string)$r['items'], true);
            $rows[] = [
                'kind'           => 'cart',
                'active'         => marketing_is_active((string)$r['updated_at']),
                'id'             => (int)$r['id'],
                'ref'            => substr((string)$r['cart_key'], 0, 8),
                'userId'         => $r['user_id'] !== null ? (int)$r['user_id'] : null,
                'email'          => $r['email'] ?: null,
                'name'           => $name !== '' ? $name : null,
                'phone'          => $r['phone'] ?: null,
                'itemCount'      => (int)$r['item_count'],
                'subtotal'       => (int)$r['subtotal'],
                'items'          => is_array($items) ? $items : [],
                'recoveryStage'  => (int)$r['recovery_stage'],
                'recoverySentAt' => $r['recovery_sent_at'],
                'dismissedAt'    => $r['dismissed_at'],
                'createdAt'      => $r['created_at'],
                'lastActiveAt'   => $r['updated_at'],
                'recoveryUrl'    => marketing_recovery_url((string)$r['recovery_token']),
            ];
        }

        // ---- Checkout-stage abandonment ------------------------------------
        if ($poReady) {
            $st = $pdo->prepare(
                "SELECT po.razorpay_order_id, po.user_id, po.guest_contact, po.amount_paise,
                        po.items, po.shipping_address, po.recovery_stage, po.recovery_sent_at,
                        po.recovery_token, po.dismissed_at, po.created_at,
                        u.email AS user_email, u.first_name, u.last_name, u.phone AS user_phone
                   FROM payment_orders po
                   LEFT JOIN users u ON u.id = po.user_id
                  WHERE po.status = 'created'
                    AND po.created_at > DATE_SUB(NOW(), INTERVAL " . ABANDON_WINDOW_DAYS . " DAY)
                  ORDER BY po.created_at DESC
                  LIMIT 500"
            );
            $st->execute();
            foreach ($st->fetchAll() as $r) {
                $guest = $r['guest_contact'] ? json_decode((string)$r['guest_contact'], true) : null;
                $addr  = json_decode((string)$r['shipping_address'], true);
                $items = json_decode((string)$r['items'], true);

                $name = trim((string)($r['first_name'] ?? '') . ' ' . (string)($r['last_name'] ?? ''));
                if ($name === '') $name = (string)($guest['fullName'] ?? ($addr['fullName'] ?? ''));

                // A checkout row always has a token once it has been seen here,
                // so the admin's "Send recovery email" button has a link to send.
                $tok = (string)($r['recovery_token'] ?? '');
                if (!marketing_valid_key($tok)) {
                    $tok = marketing_token();
                    $pdo->prepare('UPDATE payment_orders SET recovery_token = :t WHERE razorpay_order_id = :r')
                        ->execute([':t' => $tok, ':r' => $r['razorpay_order_id']]);
                }

                $rows[] = [
                    'kind'           => 'checkout',
                    'active'         => marketing_is_active((string)$r['created_at']),
                    'id'             => (string)$r['razorpay_order_id'],
                    'ref'            => substr((string)$r['razorpay_order_id'], -8),
                    'userId'         => $r['user_id'] !== null ? (int)$r['user_id'] : null,
                    'email'          => $r['user_email'] ?: ($guest['email'] ?? null),
                    'name'           => $name !== '' ? $name : null,
                    'phone'          => $r['user_phone'] ?: ($guest['phone'] ?? ($addr['phone'] ?? null)),
                    'city'           => $addr['city'] ?? null,
                    'itemCount'      => is_array($items)
                        ? (int)array_sum(array_map(function ($l) { return is_array($l) ? (int)($l['qty'] ?? 0) : 0; }, $items))
                        : 0,
                    // amount_paise is the canonical charged amount and includes
                    // shipping — the cart rows carry a bare subtotal, so this
                    // column is "what we would have taken", which is the number
                    // the owner actually cares about.
                    'subtotal'       => intdiv((int)$r['amount_paise'], 100),
                    'items'          => is_array($items) ? $items : [],
                    'recoveryStage'  => (int)$r['recovery_stage'],
                    'recoverySentAt' => $r['recovery_sent_at'],
                    'dismissedAt'    => $r['dismissed_at'],
                    'createdAt'      => $r['created_at'],
                    'lastActiveAt'   => $r['created_at'],
                    'recoveryUrl'    => marketing_recovery_url($tok),
                ];
            }
        }

        // Newest first across both sources.
        usort($rows, function ($a, $b) {
            return strcmp((string)$b['lastActiveAt'], (string)$a['lastActiveAt']);
        });

        // Stats describe ABANDONED carts only. Rows still inside the grace
        // window are counted separately as `active` — folding them in would
        // inflate "value at risk" with baskets belonging to people who are
        // mid-purchase, which is the number an owner would act on.
        // A dismissed row is likewise excluded: the owner has already decided
        // it is not worth chasing.
        $live = array_values(array_filter($rows, function ($r) {
            return empty($r['dismissedAt']) && empty($r['active']);
        }));
        $active = array_values(array_filter($rows, function ($r) {
            return empty($r['dismissedAt']) && !empty($r['active']);
        }));
        $stats = [
            'total'          => count($live),
            'carts'          => count(array_filter($live, function ($r) { return $r['kind'] === 'cart'; })),
            'checkouts'      => count(array_filter($live, function ($r) { return $r['kind'] === 'checkout'; })),
            'value'          => (int)array_sum(array_map(function ($r) { return (int)$r['subtotal']; }, $live)),
            'withEmail'      => count(array_filter($live, function ($r) { return !empty($r['email']); })),
            // Baskets someone may be looking at right now. Reported so the
            // empty state can say "3 carts are active but not yet quiet for
            // 60 minutes" instead of "nobody has a cart".
            'active'         => count($active),
            'activeValue'    => (int)array_sum(array_map(function ($r) { return (int)$r['subtotal']; }, $active)),
            'graceMinutes'   => ABANDON_GRACE_MINUTES,
            'windowDays'     => ABANDON_WINDOW_DAYS,
            'paymentOrdersReady' => $poReady,
        ];

        echo json_encode([
            'rows'        => $rows,
            'stats'       => $stats,
            'mailerReady' => mailer_is_configured(),
        ]);
        exit;
    }

    // --------------------------------------------------------------- POST ---
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $b      = read_json_body();
        $action = (string)($b['action'] ?? '');
        $kind   = (string)($b['kind'] ?? '');
        $id     = $b['id'] ?? null;

        if (!in_array($kind, ['cart', 'checkout'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Unknown row kind']);
            exit;
        }
        if ($kind === 'checkout' && !$poReady) {
            http_response_code(503);
            echo json_encode(['error' => 'payment_orders recovery columns are not available']);
            exit;
        }

        if ($action === 'dismiss' || $action === 'undismiss') {
            $value = $action === 'dismiss' ? date('Y-m-d H:i:s') : null;
            if ($kind === 'cart') {
                $st = $pdo->prepare('UPDATE carts SET dismissed_at = :v WHERE id = :id');
                $st->execute([':v' => $value, ':id' => (int)$id]);
            } else {
                $st = $pdo->prepare('UPDATE payment_orders SET dismissed_at = :v WHERE razorpay_order_id = :id');
                $st->execute([':v' => $value, ':id' => (string)$id]);
            }
            echo json_encode(['ok' => true, 'dismissed' => $action === 'dismiss']);
            exit;
        }

        // Render the exact email a Send would produce, without sending it,
        // without minting a subscribers row and without advancing the stage.
        // It runs through marketing_send_recovery() in preview mode so the
        // eligibility rules cannot differ between what the owner is shown and
        // what would actually go out.
        if ($action === 'preview-recovery') {
            $built = marketing_send_recovery($pdo, $kind, $id, 'preview', true);
            if (!$built['ok']) {
                http_response_code(422);
                echo json_encode(['error' => $built['error']]);
                exit;
            }
            echo json_encode([
                'ok'      => true,
                'stage'   => $built['stage'],
                'to'      => $built['to'],
                'subject' => $built['subject'],
                'html'    => $built['html'],
                'text'    => $built['text'],
                'mailerReady' => mailer_is_configured(),
            ]);
            exit;
        }

        if ($action === 'send-recovery') {
            $sent = marketing_send_recovery($pdo, $kind, $id, 'manual');
            if (!$sent['ok']) {
                http_response_code(422);
                echo json_encode(['error' => $sent['error']]);
                exit;
            }
            echo json_encode(['ok' => true, 'stage' => $sent['stage']]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
