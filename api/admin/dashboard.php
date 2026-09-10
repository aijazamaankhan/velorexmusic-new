<?php
// =============================================================================
// /api/admin/dashboard.php — the admin Dashboard panel (ADMIN)
//
//   GET -> { kpis, recentOrders, needsAttention, health }
//
// ONE round trip on purpose. The Dashboard shows six unrelated things and the
// panel used to be able to show none of them, so the alternative was six
// parallel fetches from the browser, six loading states, and six ways for the
// page to be half-right. Everything here is a cheap aggregate.
//
// THE RULE THIS FILE INHERITS (CLAUDE.md §20): a value we cannot derive renders
// as an em dash, never as a plausible-looking placeholder. So every number
// below is a real COUNT or SUM from a real table — there is no growth
// percentage, no "vs last month", and no rating we have not been given. If you
// add a metric here and cannot compute it honestly, do not add it.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_mailer.php';
require_once __DIR__ . '/../_marketing_helpers.php';

require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Statuses that mean the money did not stay. Excluded from revenue, the same
// way the storefront's recent-sales strip excludes them.
const DASH_DEAD_STATUSES = ['cancelled', 'canceled', 'refunded', 'returned', 'failed'];

// A table may legitimately not exist yet (carts and subscribers are created on
// first use). A missing table must degrade to "unknown", never to a 500 that
// blanks the whole panel.
function dash_table_exists(PDO $pdo, string $table): bool {
    try {
        $pdo->query('SELECT 1 FROM `' . $table . '` LIMIT 1');
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

function dash_scalar(PDO $pdo, string $sql, array $args = [], $fallback = null) {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        $v = $st->fetchColumn();
        return $v === false ? $fallback : $v;
    } catch (Throwable $e) {
        return $fallback;
    }
}

try {
    $pdo = db();

    $deadPh   = implode(',', array_fill(0, count(DASH_DEAD_STATUSES), '?'));
    $liveOnly = "LOWER(status) NOT IN ($deadPh)";

    // ---- KPIs ---------------------------------------------------------------
    // Revenue is summed from order_data.total, which is the amount actually
    // charged (finalize_payment writes it from payment_orders.amount_paise —
    // never re-derived from the cart). 30 days because that is the window an
    // owner reasons about; the all-time figure is alongside it rather than
    // instead of it, so a quiet month cannot look like a dead shop.
    $revenue30 = (int)dash_scalar($pdo,
        "SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.total')) AS UNSIGNED)), 0)
           FROM orders
          WHERE $liveOnly AND created_at >= (NOW() - INTERVAL 30 DAY)",
        DASH_DEAD_STATUSES, 0);
    $revenueAll = (int)dash_scalar($pdo,
        "SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.total')) AS UNSIGNED)), 0)
           FROM orders WHERE $liveOnly",
        DASH_DEAD_STATUSES, 0);

    $orders30 = (int)dash_scalar($pdo,
        "SELECT COUNT(*) FROM orders WHERE $liveOnly AND created_at >= (NOW() - INTERVAL 30 DAY)",
        DASH_DEAD_STATUSES, 0);
    $ordersAll = (int)dash_scalar($pdo, "SELECT COUNT(*) FROM orders WHERE $liveOnly", DASH_DEAD_STATUSES, 0);

    // "Needs me to do something" — pending and processing are the two states
    // where a parcel is waiting on the owner.
    $openOrders = (int)dash_scalar($pdo,
        "SELECT COUNT(*) FROM orders WHERE LOWER(status) IN ('pending','processing')", [], 0);

    $customers = (int)dash_scalar($pdo, 'SELECT COUNT(*) FROM users', [], 0);
    $newCustomers30 = (int)dash_scalar($pdo,
        'SELECT COUNT(*) FROM users WHERE created_at >= (NOW() - INTERVAL 30 DAY)', [], 0);

    $productCount = (int)dash_scalar($pdo, 'SELECT COUNT(*) FROM products', [], 0);
    $outOfStock   = (int)dash_scalar($pdo, 'SELECT COUNT(*) FROM products WHERE stock <= 0', [], 0);
    $lowStock     = (int)dash_scalar($pdo, 'SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= 3', [], 0);
    $stockValue   = (int)dash_scalar($pdo, 'SELECT COALESCE(SUM(price * GREATEST(stock,0)), 0) FROM products', [], 0);

    // ---- Recent orders ------------------------------------------------------
    // Enough to answer "what just happened" without turning the Dashboard into
    // a second Orders panel.
    $recent = [];
    try {
        $st = $pdo->query(
            "SELECT id, status, order_data, created_at
               FROM orders
              ORDER BY created_at DESC
              LIMIT 8"
        );
        foreach ($st->fetchAll() as $o) {
            $d = json_decode((string)$o['order_data'], true);
            $d = is_array($d) ? $d : [];
            $addr = is_array($d['shippingAddress'] ?? null) ? $d['shippingAddress'] : [];
            $contact = is_array($d['contact'] ?? null) ? $d['contact'] : [];
            $recent[] = [
                'id'        => (string)$o['id'],
                'status'    => (string)$o['status'],
                'total'     => (int)($d['total'] ?? 0),
                'itemCount' => is_array($d['items'] ?? null) ? count($d['items']) : 0,
                // Name and city only. This is the owner's own panel so more
                // would be permissible, but the Orders panel already shows the
                // full record and a summary row does not need an email on it.
                'customer'  => (string)($contact['fullName'] ?? ($addr['fullName'] ?? 'Guest')),
                'city'      => (string)($addr['city'] ?? ''),
                'at'        => $o['created_at'] ? date('c', strtotime((string)$o['created_at'])) : null,
            ];
        }
    } catch (Throwable $e) {
        $recent = [];
    }

    // ---- Needs attention ----------------------------------------------------
    // Products that are actually costing sales right now.
    $outList = [];
    try {
        $st = $pdo->query(
            'SELECT id, title, artist, stock, price
               FROM products
              WHERE stock <= 3
              ORDER BY stock ASC, price DESC
              LIMIT 8'
        );
        foreach ($st->fetchAll() as $p) {
            $outList[] = [
                'id'     => (int)$p['id'],
                'title'  => (string)$p['title'],
                'artist' => (string)$p['artist'],
                'stock'  => (int)$p['stock'],
                'price'  => (int)$p['price'],
            ];
        }
    } catch (Throwable $e) {
        $outList = [];
    }

    $cartsReady = dash_table_exists($pdo, 'carts');
    $subsReady  = dash_table_exists($pdo, 'subscribers');

    $abandonedCount = $cartsReady ? (int)dash_scalar($pdo,
        'SELECT COUNT(*) FROM carts
          WHERE converted_at IS NULL AND dismissed_at IS NULL
            AND updated_at < (NOW() - INTERVAL 60 MINUTE)', [], 0) : null;
    $abandonedValue = $cartsReady ? (int)dash_scalar($pdo,
        'SELECT COALESCE(SUM(subtotal),0) FROM carts
          WHERE converted_at IS NULL AND dismissed_at IS NULL
            AND updated_at < (NOW() - INTERVAL 60 MINUTE)', [], 0) : null;
    $subscriberCount = $subsReady ? (int)dash_scalar($pdo,
        "SELECT COUNT(*) FROM subscribers WHERE status = 'subscribed'", [], 0) : null;
    $optedInCount = $subsReady ? (int)dash_scalar($pdo,
        "SELECT COUNT(*) FROM subscribers WHERE status = 'subscribed' AND consent_at IS NOT NULL", [], 0) : null;

    // ---- Health -------------------------------------------------------------
    // Three things that are invisible until a customer complains.
    //
    // UPLOADS is the one that has actually bitten this site: Hostinger's git
    // deploy wipes public_html/uploads (a symlink to ~/uploads), every product
    // photo 404s, and nothing anywhere says so — the owner finds out from the
    // storefront. A cron restores it within a minute (CLAUDE.md §10), but the
    // panel should be able to answer "is it broken right now?".
    $uploadsPath = __DIR__ . '/../../uploads/products';
    $uploadsOk    = is_dir($uploadsPath) && is_readable($uploadsPath);
    $uploadsCount = 0;
    if ($uploadsOk) {
        $g = @glob($uploadsPath . '/*');
        $uploadsCount = is_array($g) ? count($g) : 0;
    }

    $razorpayMode = defined('RAZORPAY_MODE') ? strtolower(trim((string)RAZORPAY_MODE)) : '';
    $razorpayKeyed = false;
    if ($razorpayMode === 'test') {
        $razorpayKeyed = defined('RAZORPAY_TEST_KEY_ID') && RAZORPAY_TEST_KEY_ID !== ''
            && defined('RAZORPAY_TEST_KEY_SECRET') && RAZORPAY_TEST_KEY_SECRET !== '';
    } elseif ($razorpayMode === 'live') {
        $razorpayKeyed = defined('RAZORPAY_LIVE_KEY_ID') && RAZORPAY_LIVE_KEY_ID !== ''
            && defined('RAZORPAY_LIVE_KEY_SECRET') && RAZORPAY_LIVE_KEY_SECRET !== '';
    }

    echo json_encode([
        'ok' => true,
        'kpis' => [
            'revenue30'      => $revenue30,
            'revenueAll'     => $revenueAll,
            'orders30'       => $orders30,
            'ordersAll'      => $ordersAll,
            'openOrders'     => $openOrders,
            'customers'      => $customers,
            'newCustomers30' => $newCustomers30,
            'products'       => $productCount,
            'outOfStock'     => $outOfStock,
            'lowStock'       => $lowStock,
            'stockValue'     => $stockValue,
        ],
        'recentOrders'   => $recent,
        'needsAttention' => [
            'lowStockProducts' => $outList,
            'abandonedCount'   => $abandonedCount,
            'abandonedValue'   => $abandonedValue,
            'subscriberCount'  => $subscriberCount,
            'optedInCount'     => $optedInCount,
        ],
        'health' => [
            // null means "we could not tell", which the UI prints as an em dash
            // rather than as a green tick.
            'uploadsOk'     => $uploadsOk,
            'uploadsCount'  => $uploadsOk ? $uploadsCount : null,
            'smtpReady'     => mailer_is_configured(),
            'razorpayMode'  => $razorpayMode !== '' ? $razorpayMode : null,
            'razorpayKeyed' => $razorpayKeyed,
            'cartsReady'    => $cartsReady,
            'subsReady'     => $subsReady,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[admin/dashboard] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
