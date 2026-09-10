<?php
// =============================================================================
// /api/recent-sales.php — the homepage "Recently Sold" strip (PUBLIC)
//
//   GET ?limit=12  ->  { ok, rows: [...], realCount, filledCount }
//
// Each row is one sold LINE, shaped for display only:
//   { productId, title, artist, image, price, location, at, demo }
//
// PRIVACY — the rule that constrains this file.
// It is public and unauthenticated and it reads the orders table, so it
// exposes ONLY: what was bought, for how much, and the buyer's city/state.
// Never a name, an email, a phone number, a street address, an order id or a
// payment id. A recently-sold ticker is social proof, not a window into the
// order book. If you widen the SELECT below, widen this comment first and
// convince yourself the new field passes that test.
//
// REAL vs FILLED rows.
//   demo=false  a genuine paid order — real line price, real shipping city.
//   demo=true   FILLER: a real catalogue product with a synthesised city and
//               timestamp, used only to top the strip up to a presentable
//               length while the shop is young.
// The flag rides along in the payload so the distinction is never lost, and
// the filler is deterministic per calendar day (see the mt_srand below) rather
// than reshuffling on every load — a "sale" that changes on refresh is worse
// than no strip at all.
//
// This is the one place in the codebase that renders something we did not
// observe, and it is here because the owner asked for it. Everywhere else the
// rule in CLAUDE.md §20 stands: a value we cannot derive shows as "—".
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_products_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Statuses that mean "this sale did not stand". Showing a cancelled or
// refunded order as a recent sale is a straightforwardly false claim.
const RECENT_SALES_DEAD_STATUSES = ['cancelled', 'canceled', 'refunded', 'returned', 'failed'];

// Cities used for FILLER rows ONLY — never for a real one, which carries the
// city it actually shipped to. India-only, because checkout is India-only
// (CLAUDE.md §12): a filler row reading "United Kingdom" would advertise a
// shipping lane the shop cannot serve.
const RECENT_SALES_FILLER_CITIES = [
    'Mumbai, MH', 'New Delhi, DL', 'Bengaluru, KA', 'Chennai, TN', 'Kolkata, WB',
    'Hyderabad, TS', 'Pune, MH', 'Ahmedabad, GJ', 'Jaipur, RJ', 'Lucknow, UP',
    'Chandigarh, CH', 'Kochi, KL', 'Indore, MP', 'Bhopal, MP', 'Gurugram, HR',
    'Nagpur, MH', 'Guwahati, AS', 'Dehradun, UK', 'Surat, GJ', 'Patna, BR',
];

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 12;
if ($limit < 1)  { $limit = 12; }
if ($limit > 24) { $limit = 24; }

// "Mumbai, Maharashtra" from an order's frozen shipping snapshot, or '' when
// the snapshot has nothing usable. City and state only — never line1/line2.
function recent_sales_location(array $addr): string {
    $city  = trim((string)($addr['city']  ?? ''));
    $state = trim((string)($addr['state'] ?? ''));
    if ($city !== '' && $state !== '') { return $city . ', ' . $state; }
    if ($city !== '')  { return $city; }
    if ($state !== '') { return $state; }
    return '';
}

try {
    $pdo = db();

    // ---- Real sales ---------------------------------------------------------
    // 60 orders is plenty of headroom to find `limit` DISTINCT products after
    // de-duplication, without dragging the whole order history over the wire.
    $rows = [];
    $seenProducts = [];

    $deadPlaceholders = implode(',', array_fill(0, count(RECENT_SALES_DEAD_STATUSES), '?'));
    $stmt = $pdo->prepare(
        "SELECT order_data, created_at
           FROM orders
          WHERE LOWER(status) NOT IN ($deadPlaceholders)
          ORDER BY created_at DESC
          LIMIT 60"
    );
    $stmt->execute(RECENT_SALES_DEAD_STATUSES);

    foreach ($stmt->fetchAll() as $order) {
        if (count($rows) >= $limit) { break; }

        $data = json_decode((string)$order['order_data'], true);
        if (!is_array($data)) { continue; }

        // The order blob's own status can disagree with the column on legacy
        // rows written before that column existed. Honour either saying "dead".
        $blobStatus = strtolower(trim((string)($data['status'] ?? '')));
        if (in_array($blobStatus, RECENT_SALES_DEAD_STATUSES, true)) { continue; }

        $items    = is_array($data['items'] ?? null) ? $data['items'] : [];
        $addr     = is_array($data['shippingAddress'] ?? null) ? $data['shippingAddress'] : [];
        $location = recent_sales_location($addr);

        foreach ($items as $line) {
            if (count($rows) >= $limit) { break; }
            if (!is_array($line)) { continue; }
            $pid = isset($line['id']) ? (int)$line['id'] : 0;
            if ($pid <= 0) { continue; }
            // One card per product. The same record selling five times is one
            // entry, not five identical cards filling the whole strip.
            if (isset($seenProducts[$pid])) { continue; }
            $seenProducts[$pid] = true;

            $rows[] = [
                'productId' => $pid,
                // The frozen snapshot, not today's product row: this is what
                // was actually bought, and the product may since have been
                // renamed. Blank fields are backfilled from the catalogue below.
                'title'     => products_decode_text((string)($line['name']   ?? '')),
                'artist'    => products_decode_text((string)($line['artist'] ?? '')),
                'image'     => null, // orders never snapshot a cover — see below
                'price'     => isset($line['price']) ? (int)$line['price'] : 0,
                'location'  => $location,
                'at'        => $order['created_at']
                    ? date('c', strtotime((string)$order['created_at']))
                    : null,
                'demo'      => false,
            ];
        }
    }

    $realCount = count($rows);

    // ---- Filler -------------------------------------------------------------
    // Top up to `limit` with real catalogue products the shop can actually
    // sell. Excludes anything already shown as a genuine sale, and anything out
    // of stock — a strip that sends people to a sold-out page is worse than a
    // short one.
    if ($realCount < $limit) {
        $need    = $limit - $realCount;
        $exclude = array_keys($seenProducts);
        $notIn   = $exclude
            ? (' AND id NOT IN (' . implode(',', array_map('intval', $exclude)) . ')')
            : '';
        $q = $pdo->query(
            "SELECT id, title, artist, price, image
               FROM products
              WHERE stock > 0 AND price > 0" . $notIn . "
              ORDER BY COALESCE(reviews, 0) DESC, rating DESC, id DESC
              LIMIT " . (int)max(1, $need * 2)
        );
        $candidates = $q ? $q->fetchAll() : [];

        // Deterministic per calendar day: a visitor refreshing sees a stable
        // strip, and it moves on by itself tomorrow.
        $daySeed   = crc32(date('Y-m-d'));
        $fillerIdx = 0;
        foreach ($candidates as $p) {
            if (count($rows) >= $limit) { break; }
            $pid = (int)$p['id'];
            mt_srand($daySeed ^ ($pid * 2654435761));
            $city = RECENT_SALES_FILLER_CITIES[mt_rand(0, count(RECENT_SALES_FILLER_CITIES) - 1)];
            // Spread the synthetic timestamps backwards in strip order so the
            // "3 hours ago / 2 days ago" labels read as a plausible sequence
            // rather than a clump at one instant.
            $minutesAgo = 90 + ($fillerIdx * mt_rand(140, 400));
            $fillerIdx++;

            $rows[] = [
                'productId' => $pid,
                'title'     => products_decode_text((string)$p['title']),
                'artist'    => products_decode_text((string)$p['artist']),
                'image'     => ($p['image'] !== null && $p['image'] !== '') ? (string)$p['image'] : null,
                'price'     => (int)$p['price'],
                'location'  => $city,
                'at'        => date('c', time() - ($minutesAgo * 60)),
                'demo'      => true,
            ];
        }
        mt_srand(); // don't leave the global RNG seeded for whatever runs next
    }

    // ---- Cover art ----------------------------------------------------------
    // Real rows carry no image (the order snapshot never stored one), so fetch
    // covers for every product still in the catalogue in a single round trip.
    $needImages = [];
    foreach ($rows as $r) {
        if ($r['image'] === null) { $needImages[] = (int)$r['productId']; }
    }
    if ($needImages) {
        $ph = implode(',', array_fill(0, count($needImages), '?'));
        $imgStmt = $pdo->prepare("SELECT id, image, title, artist FROM products WHERE id IN ($ph)");
        $imgStmt->execute($needImages);
        $byId = [];
        foreach ($imgStmt->fetchAll() as $p) { $byId[(int)$p['id']] = $p; }
        foreach ($rows as &$r) {
            $p = $byId[(int)$r['productId']] ?? null;
            if (!$p) { continue; }
            if ($r['image'] === null && $p['image'] !== null && $p['image'] !== '') {
                $r['image'] = (string)$p['image'];
            }
            // A snapshot written before a rename still links to a live product;
            // fall back to the current row when the snapshot text is blank.
            if ($r['title']  === '') { $r['title']  = products_decode_text((string)$p['title']); }
            if ($r['artist'] === '') { $r['artist'] = products_decode_text((string)$p['artist']); }
        }
        unset($r);
    }

    // Drop anything that ended up with no title at all — a nameless card is
    // just noise.
    $rows = array_values(array_filter($rows, static fn($r) => trim((string)$r['title']) !== ''));

    echo json_encode([
        'ok'          => true,
        'rows'        => $rows,
        'realCount'   => $realCount,
        'filledCount' => max(0, count($rows) - $realCount),
    ]);
} catch (Throwable $e) {
    error_log('[recent-sales] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Could not load recent sales']);
}
