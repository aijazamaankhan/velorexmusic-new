<?php
// =============================================================================
// Spin & Win — the welcome wheel. Schema, config, eligibility, the draw.
//
// Used by:
//   api/spin-wheel.php          (storefront: status + the spin itself)
//   api/admin/spin-wheel.php    (admin: edit prizes, read results)
//
// THE RULE THAT MAKES THIS SAFE
// The SERVER draws the prize. The browser asks "spin for me", gets back which
// slice won and a code, and only then animates the wheel to that slice. A
// wheel that decided in the browser would let anyone land the jackpot from
// the console. The code it mints is an ordinary row in `coupons`, reserved to
// the winner's account email, single use, and priced by the same
// coupon_evaluate() every other code goes through (CLAUDE.md §34) — so there
// is no second discount path to keep honest.
//
// WHO MAY SPIN
//   - a signed-in account (anonymous visitors are asked to create one first);
//   - that has never spun (spin_entries.user_id is UNIQUE — also the race lock);
//   - that has never completed an order, as a member OR as a guest under the
//     same email. New signups qualify trivially; so do older members who have
//     never bought anything, which is the point — a nudge to a first order;
//   - from an IP that has not already produced SPIN_IP_DAILY_LIMIT spins in
//     24 hours, so one person cannot farm prizes with throwaway accounts.
//     Deliberately generous: Indian mobile carriers put many people behind
//     one address.
//
// WHAT THE CUSTOMER READS IS GENERATED, NEVER TYPED
// spin_describe() turns a prize's settings into the wheel text and the
// conditions line. The admin edits numbers, not copy, so the words on the
// wheel cannot promise something the coupon does not enforce. The admin panel
// mirrors it for its live preview (spinDescribe in src/js/admin/spin-wheel.js);
// the storefront never builds this text itself.
//
// Tables are created on first use, like coupons and combo_offers.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_coupon_helpers.php';

const SPIN_IP_DAILY_LIMIT = 5;
const SPIN_MIN_SLICES     = 4;
const SPIN_MAX_SLICES     = 8;
const SPIN_MAX_PERCENT    = 90;   // same cap as the Coupons panel (§34)

// How the result is REVEALED. Presentation only: every style runs the same
// server-side draw, the same one-play rule and the same coupon. Mirrored by
// SPIN_STYLE_TEXT in src/js/storefront/spin-wheel.js and SPIN_STYLES in
// src/js/admin/spin-wheel.js.
const SPIN_GAME_STYLES = ['wheel', 'jackpot', 'scratch', 'box', 'record', 'envelope'];

function spin_ensure_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    coupons_ensure_tables($pdo);
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS spin_config (
            id         TINYINT PRIMARY KEY,
            config     JSON NOT NULL,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // One row per account that has spun. The UNIQUE key on user_id is what
    // makes "one spin per account" hold under a double-click or two tabs.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS spin_entries (
            id          INT PRIMARY KEY AUTO_INCREMENT,
            user_id     INT NOT NULL,
            email       VARCHAR(255) NOT NULL,
            prize_id    VARCHAR(16) NOT NULL,
            prize_type  VARCHAR(16) NOT NULL,
            prize_title VARCHAR(120) NOT NULL,
            coupon_code VARCHAR(40) NULL,
            ip          VARCHAR(45) NULL,
            created_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_spin_user (user_id),
            KEY idx_spin_ip (ip, created_at),
            KEY idx_spin_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $done = true;
}

// Ships DISABLED. Deploying the code changes nothing on the storefront until
// the owner has looked at the prizes and switched it on.
function spin_default_config(): array {
    return [
        'enabled'   => false,
        'gameStyle' => 'wheel',
        'validDays' => 7,
        'delaySec'  => 3,
        'prizes'    => [
            ['id' => 'p1', 'on' => true, 'type' => 'free_shipping', 'value' => 0,   'minOrder' => 0,    'maxOff' => 0,    'minLps' => 0, 'color' => '#ed2c15', 'weight' => 25],
            ['id' => 'p2', 'on' => true, 'type' => 'percent',       'value' => 10,  'minOrder' => 5000, 'maxOff' => 1000, 'minLps' => 0, 'color' => '#1f1830', 'weight' => 22],
            ['id' => 'p3', 'on' => true, 'type' => 'percent',       'value' => 10,  'minOrder' => 0,    'maxOff' => 800,  'minLps' => 2, 'color' => '#b45309', 'weight' => 18],
            ['id' => 'p4', 'on' => true, 'type' => 'none',          'value' => 0,   'minOrder' => 0,    'maxOff' => 0,    'minLps' => 0, 'color' => '#3a3a44', 'weight' => 10],
            ['id' => 'p5', 'on' => true, 'type' => 'fixed',         'value' => 200, 'minOrder' => 2000, 'maxOff' => 0,    'minLps' => 0, 'color' => '#2a2140', 'weight' => 13],
            ['id' => 'p6', 'on' => true, 'type' => 'percent',       'value' => 5,   'minOrder' => 0,    'maxOff' => 300,  'minLps' => 0, 'color' => '#c2410c', 'weight' => 10],
            ['id' => 'p7', 'on' => true, 'type' => 'percent',       'value' => 15,  'minOrder' => 7500, 'maxOff' => 2000, 'minLps' => 0, 'color' => '#14101c', 'weight' => 2],
        ],
    ];
}

function spin_get_config(PDO $pdo): array {
    spin_ensure_tables($pdo);
    try {
        $raw = $pdo->query('SELECT config FROM spin_config WHERE id = 1')->fetchColumn();
        if ($raw) {
            $cfg = json_decode((string)$raw, true);
            if (is_array($cfg)) {
                [$clean, $errors] = spin_validate_config($cfg);
                // A stored config that no longer validates (a rule tightened
                // since it was saved) is treated as switched off rather than
                // half-applied.
                if (!$errors) return $clean;
                $clean['enabled'] = false;
                return $clean;
            }
        }
    } catch (Throwable $e) {
        error_log('[spin] config read failed: ' . $e->getMessage());
    }
    return spin_default_config();
}

// Returns [clean, errors]. errors is a flat list of human sentences.
function spin_validate_config(array $in): array {
    $errors = [];
    $out = [
        'enabled'   => !empty($in['enabled']),
        'gameStyle' => in_array($in['gameStyle'] ?? '', SPIN_GAME_STYLES, true) ? $in['gameStyle'] : 'wheel',
        'validDays' => max(1, min(60, (int)($in['validDays'] ?? 7))),
        'delaySec'  => max(0, min(60, (int)($in['delaySec'] ?? 3))),
        'prizes'    => [],
    ];
    $prizes = is_array($in['prizes'] ?? null) ? array_values($in['prizes']) : [];
    if (count($prizes) < SPIN_MIN_SLICES || count($prizes) > SPIN_MAX_SLICES) {
        $errors[] = 'The wheel needs ' . SPIN_MIN_SLICES . ' to ' . SPIN_MAX_SLICES . ' slices.';
    }
    $seen = [];
    foreach ($prizes as $i => $p) {
        if (!is_array($p)) { $errors[] = 'Slice ' . ($i + 1) . ' is malformed.'; continue; }
        $n    = 'Slice ' . ($i + 1);
        $type = (string)($p['type'] ?? '');
        if (!in_array($type, ['free_shipping', 'percent', 'fixed', 'none'], true)) {
            $errors[] = $n . ': unknown prize type.';
            $type = 'none';
        }
        $id = preg_match('/^[a-z0-9]{1,16}$/', (string)($p['id'] ?? '')) ? (string)$p['id'] : '';
        if ($id === '' || isset($seen[$id])) $id = 'p' . substr(bin2hex(random_bytes(4)), 0, 7);
        $seen[$id] = true;

        $value    = (int)($p['value'] ?? 0);
        $minOrder = max(0, min(1000000, (int)($p['minOrder'] ?? 0)));
        $maxOff   = max(0, min(1000000, (int)($p['maxOff'] ?? 0)));
        $minLps   = max(0, min(20, (int)($p['minLps'] ?? 0)));
        $weight   = max(0, min(1000, (int)($p['weight'] ?? 0)));
        $color    = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($p['color'] ?? '')) ? strtolower($p['color']) : '#2a2140';

        if ($type === 'percent' && ($value < 1 || $value > SPIN_MAX_PERCENT)) {
            $errors[] = $n . ': percentage must be 1–' . SPIN_MAX_PERCENT . '.';
        }
        if ($type === 'fixed' && ($value < 1 || $value > 100000)) {
            $errors[] = $n . ': amount must be ₹1–₹1,00,000.';
        }
        if ($type === 'fixed' && $minOrder > 0 && $value >= $minOrder) {
            // ₹500 off a ₹500 minimum is a free order.
            $errors[] = $n . ': the amount off must be less than the minimum order.';
        }
        if ($type === 'none' || $type === 'free_shipping') $value = 0;
        if ($type !== 'percent') $maxOff = 0;
        if ($type === 'none') { $minOrder = 0; $minLps = 0; }

        $out['prizes'][] = [
            'id' => $id, 'on' => !empty($p['on']), 'type' => $type, 'value' => $value,
            'minOrder' => $minOrder, 'maxOff' => $maxOff, 'minLps' => $minLps,
            'color' => $color, 'weight' => $weight,
        ];
    }
    $live = spin_live_prizes($out);
    if (count($live) < SPIN_MIN_SLICES) {
        $errors[] = 'At least ' . SPIN_MIN_SLICES . ' slices must be switched on with a weight above 0.';
    }
    $winning = array_filter($live, fn($p) => $p['type'] !== 'none');
    if (!$winning) $errors[] = 'At least one live slice must be a real prize.';
    return [$out, $errors];
}

// The slices actually on the wheel, in order.
function spin_live_prizes(array $cfg): array {
    return array_values(array_filter($cfg['prizes'] ?? [], fn($p) => !empty($p['on']) && (int)$p['weight'] > 0));
}

function spin_money(int $n): string {
    // Indian digit grouping (1,00,000), matching toLocaleString('en-IN').
    $s = (string)$n;
    if (strlen($s) <= 3) return '₹' . $s;
    $last3 = substr($s, -3);
    $rest  = substr($s, 0, -3);
    $rest  = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
    return '₹' . $rest . ',' . $last3;
}

// Wheel text + conditions, from the settings. Mirrored by spinDescribe() in
// src/js/admin/spin-wheel.js for the admin's live preview.
function spin_describe(array $p): array {
    $type = (string)$p['type'];
    if ($type === 'none') {
        return ['label' => 'BETTER LUCK', 'sub' => 'NEXT TIME', 'title' => 'Better luck next time',
                'cond' => 'No prize this time. Thanks for joining Velorex Music!'];
    }
    $value = (int)$p['value']; $minOrder = (int)$p['minOrder'];
    $minLps = (int)$p['minLps']; $maxOff = (int)$p['maxOff'];

    $label = $type === 'free_shipping' ? 'FREE'
        : ($type === 'percent' ? $value . '% OFF' : spin_money($value) . ' OFF');
    if ($type === 'free_shipping' && !$minOrder && !$minLps) $sub = 'DELIVERY';
    elseif ($minLps)   $sub = $minLps . '+ LPs';
    elseif ($minOrder) $sub = spin_money($minOrder) . '+';
    else               $sub = 'ANY ORDER';

    $title = $type === 'free_shipping' ? 'Free Delivery'
        : ($type === 'percent' ? $value . '% off' : spin_money($value) . ' off');

    $parts = [];
    if ($minLps)   $parts[] = 'With ' . $minLps . ' or more vinyl LPs in the cart.';
    if ($minOrder) $parts[] = 'On orders of ' . spin_money($minOrder) . ' or more.';
    if (!$minLps && !$minOrder) $parts[] = 'On any order — no minimum.';
    if ($type === 'percent' && $maxOff) $parts[] = 'Max discount ' . spin_money($maxOff) . '.';

    return ['label' => $label, 'sub' => $sub, 'title' => $title, 'cond' => implode(' ', $parts)];
}

// Font Awesome icon for a prize — the jackpot reels print it above the text.
function spin_icon(array $p): string {
    if ($p['type'] === 'none')          return 'fa-face-smile';
    if ($p['type'] === 'free_shipping') return 'fa-truck-fast';
    if ((int)$p['minLps'] > 0)          return 'fa-record-vinyl';
    if ($p['type'] === 'fixed')         return 'fa-indian-rupee-sign';
    return (int)$p['value'] >= 15 ? 'fa-crown' : 'fa-percent';
}

// What the storefront needs to draw the game. No weights: the odds are the
// server's business, and the browser does not pick. (They ARE published, in
// words, on /offer-terms.html — see spin_terms_table_html().)
function spin_public_prizes(array $cfg): array {
    return array_map(function ($p) {
        $d = spin_describe($p);
        return ['id' => $p['id'], 'color' => $p['color'], 'label' => $d['label'], 'sub' => $d['sub'],
                'icon' => spin_icon($p), 'none' => $p['type'] === 'none'];
    }, spin_live_prizes($cfg));
}

// The "Current prizes and chances" table on /offer-terms.html, generated from
// the live config so the published odds can never disagree with the draw.
function spin_terms_table_html(array $cfg): string {
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $live = spin_live_prizes($cfg);
    if (empty($cfg['enabled']) || !$live) {
        return '<p>The game is not running at the moment, so no prizes are on offer.</p>';
    }
    $total = array_sum(array_map(fn($p) => (int)$p['weight'], $live));
    $rows = '';
    foreach ($live as $p) {
        $d = spin_describe($p);
        $pct = round((int)$p['weight'] / $total * 100, 1);
        $oneIn = max(1, (int)round($total / (int)$p['weight']));
        $rows .= '<tr><td><strong>' . $e($d['title']) . '</strong></td><td>' . $e($d['cond']) . '</td>'
               . '<td>' . $e($pct) . '%<br><small>about 1 in ' . $oneIn . '</small></td></tr>';
    }
    return '<div class="offer-odds-wrap"><table class="offer-odds"><thead><tr><th>Prize</th><th>Conditions</th><th>Chance</th></tr></thead>'
         . '<tbody>' . $rows . '</tbody></table></div>'
         . '<p>Winning codes are valid for <strong>' . (int)$cfg['validDays'] . ' days</strong> from the day they are won. '
         . 'This table is generated from the live game settings, so it always shows the current chances.</p>';
}

// '' = may spin; otherwise a reason code the storefront maps to a message.
//   'disabled' | 'spun' | 'ordered' | 'busy' | 'error'
function spin_eligibility(PDO $pdo, array $cfg, int $userId): string {
    if (empty($cfg['enabled'])) return 'disabled';
    try {
        $st = $pdo->prepare('SELECT 1 FROM spin_entries WHERE user_id = :u LIMIT 1');
        $st->execute([':u' => $userId]);
        if ($st->fetchColumn()) return 'spun';
    } catch (Throwable $e) {
        return 'error';
    }
    $email = coupon_identity_email($pdo, $userId, null);
    $asMember = coupon_completed_order_count($pdo, $userId, null);
    $asGuest  = $email ? coupon_completed_order_count($pdo, null, $email) : 0;
    // null = could not tell, which refuses — the same asymmetry as the coupon
    // triggers: a wrongly refused spin is a support email, a wrongly granted
    // one is money.
    if ($asMember === null || $asGuest === null) return 'error';
    if ($asMember + $asGuest > 0) return 'ordered';
    return '';
}

function spin_ip_over_limit(PDO $pdo, ?string $ip): bool {
    if ($ip === null) return false;
    try {
        $st = $pdo->prepare('SELECT COUNT(*) FROM spin_entries
                              WHERE ip = :ip AND created_at > (NOW() - INTERVAL 1 DAY)');
        $st->execute([':ip' => $ip]);
        return (int)$st->fetchColumn() >= SPIN_IP_DAILY_LIMIT;
    } catch (Throwable $e) {
        return false;
    }
}

// Weighted draw with a CSPRNG. Returns the index into spin_live_prizes().
function spin_draw(array $live): int {
    $total = 0;
    foreach ($live as $p) $total += (int)$p['weight'];
    if ($total <= 0) return 0;
    $r = random_int(1, $total);
    foreach ($live as $i => $p) {
        $r -= (int)$p['weight'];
        if ($r <= 0) return $i;
    }
    return count($live) - 1;
}

// Unambiguous alphabet: no 0/O, 1/I/L. These get read off a phone screen.
function spin_new_code(): string {
    $abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 6; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return 'SPIN-' . $s;
}

// Creates the winner's coupon. Returns the inserted row.
function spin_mint_coupon(PDO $pdo, array $p, string $email, int $validDays): array {
    $d = spin_describe($p);
    $expires = date('Y-m-d 23:59:59', strtotime('+' . $validDays . ' days'));
    $source = coupons_source_ready($pdo);
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $code = spin_new_code();
        try {
            $cols = 'code, type, value, min_order, max_discount, usage_limit, per_user_limit,
                     expires_at, status, featured, headline, customer_email, trigger_event, trigger_value';
            $vals = ':code, :type, :value, :min, :max, 1, 1, :exp, "active", 0, :head, :email, :trig, :tv';
            if ($source) { $cols .= ', source'; $vals .= ', "spin"'; }
            $pdo->prepare("INSERT INTO coupons ($cols) VALUES ($vals)")->execute([
                ':code'  => $code,
                ':type'  => $p['type'],
                ':value' => (int)$p['value'],
                ':min'   => (int)$p['minOrder'],
                ':max'   => ($p['type'] === 'percent' && (int)$p['maxOff'] > 0) ? (int)$p['maxOff'] : null,
                ':exp'   => $expires,
                ':head'  => 'Spin & Win: ' . $d['title'],
                ':email' => strtolower($email),
                ':trig'  => (int)$p['minLps'] > 0 ? 'min_vinyl' : 'none',
                ':tv'    => (int)$p['minLps'] > 0 ? (int)$p['minLps'] : null,
            ]);
            return coupon_find($pdo, $code) ?: ['code' => $code, 'expires_at' => $expires];
        } catch (PDOException $e) {
            // 23000 = duplicate code; draw another. Anything else is real.
            if ($e->getCode() !== '23000') throw $e;
        }
    }
    throw new RuntimeException('Could not allocate a coupon code');
}
