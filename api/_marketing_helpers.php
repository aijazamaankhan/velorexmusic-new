<?php
// =============================================================================
// Marketing helpers — newsletter subscribers, server-side cart snapshots,
// abandonment recovery bookkeeping, and the optional Brevo contact sync.
//
// Used by: subscribe.php, unsubscribe.php, cart-sync.php, recover-cart.php,
//          admin/abandoned.php, admin/subscribers.php,
//          scripts/send-abandoned-cart-emails.php.
//
// Two tables are created on demand here (same pattern as blog_posts and
// combo_offers — see CLAUDE.md §15/§17): `subscribers` and `carts`. Four
// recovery columns are also auto-added to the existing `payment_orders`
// table. Nothing in this file needs a phpMyAdmin step.
//
// -----------------------------------------------------------------------------
// READ THIS BEFORE WIDENING WHERE RECOVERY EMAIL ADDRESSES COME FROM
// -----------------------------------------------------------------------------
// An abandoned-cart email is an email we send to an address that a *browser*
// told us about. If any anonymous request could attach an arbitrary address to
// a cart, this endpoint becomes a way to make our server mail a stranger on
// demand — a spam cannon with our domain's reputation behind it.
//
// So `carts.email` is only ever written from a source that proves the address
// belongs to the person holding the browser:
//
//   (a) A valid Bearer token  -> we use the account's own email from `users`,
//                                and IGNORE whatever the client sent.
//   (b) Guest checkout        -> the address is already on payment_orders,
//                                entered on the way to paying for something.
//
// A newsletter signup is deliberately NOT in that list. Someone can type a
// victim's address into the subscribe box (true of every signup form), and
// that earns them exactly one welcome mail with an unsubscribe link — it must
// not also enrol the victim in a recovery drip. Do not "improve" this by
// letting cart-sync.php accept an email field for anonymous visitors.
//
// Carts with no known email are still stored and still shown in the admin
// panel. Knowing that eleven people abandoned a large cart this week is worth
// having even when none of them can be emailed.
// =============================================================================

require_once __DIR__ . '/config.php';

// -----------------------------------------------------------------------------
// Schema
// -----------------------------------------------------------------------------

function marketing_ensure_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;

    // Newsletter list. One row per address; `status` flips on unsubscribe
    // rather than the row being deleted — a deleted row would be silently
    // re-addable by the next signup submission, which is precisely what
    // someone who unsubscribed asked us not to do.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS subscribers (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(255) NOT NULL,
            status ENUM("subscribed","unsubscribed") NOT NULL DEFAULT "subscribed",
            source VARCHAR(40) NULL,
            token CHAR(32) NOT NULL,
            user_id INT NULL,
            consent_at TIMESTAMP NULL DEFAULT NULL,
            unsubscribed_at TIMESTAMP NULL DEFAULT NULL,
            ip VARCHAR(45) NULL,
            brevo_synced TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_sub_email (email),
            UNIQUE KEY uq_sub_token (token),
            KEY idx_sub_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // Server-side cart snapshots. This is the ONLY record of a cart that was
    // built and then abandoned before checkout — the storefront cart lives in
    // localStorage (CLAUDE.md §7) and is otherwise invisible to us.
    //
    // cart_key is a client-generated 32-hex visitor id held in localStorage.
    // It is not a credential and grants nothing: the row it addresses holds
    // product ids and quantities the same visitor just chose.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS carts (
            id INT PRIMARY KEY AUTO_INCREMENT,
            cart_key CHAR(32) NOT NULL,
            user_id INT NULL,
            email VARCHAR(255) NULL,
            items JSON NOT NULL,
            item_count INT NOT NULL DEFAULT 0,
            subtotal INT NOT NULL DEFAULT 0,
            recovery_token CHAR(32) NOT NULL,
            recovery_stage TINYINT NOT NULL DEFAULT 0,
            recovery_sent_at TIMESTAMP NULL DEFAULT NULL,
            converted_at TIMESTAMP NULL DEFAULT NULL,
            dismissed_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_cart_key (cart_key),
            UNIQUE KEY uq_cart_recovery (recovery_token),
            KEY idx_cart_user (user_id),
            KEY idx_cart_email (email),
            KEY idx_cart_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $done = true;
}

// Recovery bookkeeping bolted onto the existing payment_orders table. Same
// auto-add pattern as products.item_condition (CLAUDE.md §15 "Pre-owned
// stock"): if the ALTER fails we degrade to "no checkout recovery" rather than
// breaking anything, because every statement below names these columns only
// after this function has confirmed they exist.
function marketing_payment_orders_ready(PDO $pdo): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $have = [];
        foreach ($pdo->query('SHOW COLUMNS FROM payment_orders')->fetchAll() as $c) {
            $have[strtolower($c['Field'])] = true;
        }
        $wanted = [
            'recovery_stage'   => 'ALTER TABLE payment_orders ADD COLUMN recovery_stage TINYINT NOT NULL DEFAULT 0',
            'recovery_sent_at' => 'ALTER TABLE payment_orders ADD COLUMN recovery_sent_at TIMESTAMP NULL DEFAULT NULL',
            'recovery_token'   => 'ALTER TABLE payment_orders ADD COLUMN recovery_token CHAR(32) NULL',
            'dismissed_at'     => 'ALTER TABLE payment_orders ADD COLUMN dismissed_at TIMESTAMP NULL DEFAULT NULL',
        ];
        foreach ($wanted as $col => $ddl) {
            if (!isset($have[$col])) $pdo->exec($ddl);
        }
        $ok = true;
    } catch (Throwable $e) {
        error_log('[marketing] payment_orders recovery columns unavailable: ' . $e->getMessage());
        $ok = false;
    }
    return $ok;
}

// -----------------------------------------------------------------------------
// Small shared utilities
// -----------------------------------------------------------------------------

function marketing_token(): string {
    return bin2hex(random_bytes(16)); // 32 hex chars — matches CHAR(32)
}

// Normalises for storage AND for the UNIQUE index, so that the index means
// what people expect: "Jane@Example.COM " and "jane@example.com" are one
// subscriber, not two.
function marketing_normalize_email($raw): string {
    $e = strtolower(trim((string)$raw));
    if ($e === '' || strlen($e) > 255) return '';
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) return '';
    return $e;
}

function marketing_client_ip(): ?string {
    // Cloudflare would put the real visitor IP here (CLAUDE.md §14 Phase 3).
    $cf = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '';
    if ($cf !== '' && filter_var($cf, FILTER_VALIDATE_IP)) return $cf;
    $ra = $_SERVER['REMOTE_ADDR'] ?? '';
    return ($ra !== '' && filter_var($ra, FILTER_VALIDATE_IP)) ? $ra : null;
}

// A cart_key / recovery_token arriving from an untrusted source. Anything that
// is not exactly 32 lowercase hex characters is rejected outright rather than
// coerced, so a malformed key can never collide with a real row.
function marketing_valid_key($k): bool {
    return is_string($k) && preg_match('/^[a-f0-9]{32}$/', $k) === 1;
}

// -----------------------------------------------------------------------------
// Cart snapshot pricing
// -----------------------------------------------------------------------------
// Prices are re-read from the products table, never taken from the client.
// The snapshot is what the admin panel reports and what the recovery email
// quotes, so a browser-supplied price would let anyone put a fictional
// "abandoned cart worth a lakh" in the owner's dashboard — and put a wrong
// number in a customer's inbox. Same principle as create-order.php, for the
// same reason.
//
// Returns ['items' => [...], 'itemCount' => int, 'subtotal' => int].
function marketing_price_cart(PDO $pdo, array $rawItems): array {
    $wanted = [];
    foreach ($rawItems as $line) {
        if (!is_array($line)) continue;
        $id  = isset($line['id'])  ? (int)$line['id']  : 0;
        $qty = isset($line['qty']) ? (int)$line['qty'] : 0;
        if ($id <= 0 || $qty <= 0) continue;
        // Cap per-line quantity at a sane ceiling. This is not a stock check
        // (stock is enforced at checkout) — just a guard so a junk payload
        // cannot claim an absurd cart value.
        $wanted[$id] = min(99, ($wanted[$id] ?? 0) + $qty);
        if (count($wanted) >= 50) break; // cap distinct lines per snapshot
    }
    if (!$wanted) return ['items' => [], 'itemCount' => 0, 'subtotal' => 0];

    $ids = array_keys($wanted);
    $ph  = implode(',', array_fill(0, count($ids), '?'));
    $st  = $pdo->prepare('SELECT id, title, artist, price, image FROM products WHERE id IN (' . $ph . ')');
    $st->execute($ids);

    $items = [];
    $count = 0;
    $subtotal = 0;
    foreach ($st->fetchAll() as $p) {
        $id    = (int)$p['id'];
        $qty   = $wanted[$id];
        $price = (int)$p['price'];
        $line  = $price * $qty;
        // Product text is stored raw and decoded on read everywhere else
        // (CLAUDE.md §22) — do the same here so a title with an apostrophe
        // does not reach the recovery email as "Gulzar&#39;s".
        $items[] = [
            'id'        => $id,
            'name'      => html_entity_decode((string)$p['title'],  ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'artist'    => html_entity_decode((string)$p['artist'], ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'image'     => (string)($p['image'] ?? ''),
            'qty'       => $qty,
            'price'     => $price,
            'lineTotal' => $line,
        ];
        $count    += $qty;
        $subtotal += $line;
    }
    return ['items' => $items, 'itemCount' => $count, 'subtotal' => $subtotal];
}

// -----------------------------------------------------------------------------
// Subscribers
// -----------------------------------------------------------------------------

// Idempotent add. Re-subscribing an address that previously unsubscribed
// reactivates it — they asked again, on our own form. Returns
// ['created' => bool, 'reactivated' => bool, 'token' => string].
function marketing_subscribe(PDO $pdo, string $email, string $source = 'newsletter', ?int $userId = null): array {
    marketing_ensure_tables($pdo);

    $st = $pdo->prepare('SELECT id, status, token FROM subscribers WHERE email = :e LIMIT 1');
    $st->execute([':e' => $email]);
    $row = $st->fetch();

    if ($row) {
        $reactivated = $row['status'] === 'unsubscribed';
        $up = $pdo->prepare(
            'UPDATE subscribers
                SET status = "subscribed", unsubscribed_at = NULL,
                    consent_at = COALESCE(consent_at, NOW()),
                    user_id    = COALESCE(:u, user_id),
                    source     = COALESCE(source, :s)
              WHERE id = :id'
        );
        $up->execute([':u' => $userId, ':s' => $source, ':id' => (int)$row['id']]);
        return ['created' => false, 'reactivated' => $reactivated, 'token' => (string)$row['token']];
    }

    $token = marketing_token();
    $ins = $pdo->prepare(
        'INSERT INTO subscribers (email, status, source, token, user_id, consent_at, ip)
         VALUES (:e, "subscribed", :s, :t, :u, NOW(), :ip)'
    );
    $ins->execute([
        ':e'  => $email,
        ':s'  => $source,
        ':t'  => $token,
        ':u'  => $userId,
        ':ip' => marketing_client_ip(),
    ]);
    return ['created' => true, 'reactivated' => false, 'token' => $token];
}

// Returns the email that was unsubscribed, or null when the token is unknown.
function marketing_unsubscribe_by_token(PDO $pdo, string $token): ?string {
    marketing_ensure_tables($pdo);
    $st = $pdo->prepare('SELECT id, email FROM subscribers WHERE token = :t LIMIT 1');
    $st->execute([':t' => $token]);
    $row = $st->fetch();
    if (!$row) return null;
    $up = $pdo->prepare(
        'UPDATE subscribers SET status = "unsubscribed", unsubscribed_at = NOW() WHERE id = :id'
    );
    $up->execute([':id' => (int)$row['id']]);
    brevo_set_blacklisted((string)$row['email'], true);
    return (string)$row['email'];
}

function marketing_base_url(): string {
    // Mirrors _vv_base_url() in _email_templates.php so a staging deploy with
    // SITE_BASE_URL set does not email production links.
    return defined('SITE_BASE_URL') && SITE_BASE_URL !== ''
        ? rtrim(SITE_BASE_URL, '/')
        : 'https://velorexmusic.com';
}

// The unsubscribe URL that every marketing email must carry.
function marketing_unsubscribe_url(string $token): string {
    return marketing_base_url() . '/api/unsubscribe.php?token=' . urlencode($token);
}

// Where a recovery email sends someone. The storefront reads ?recover= on boot
// (src/js/cart-sync.js), refills the cart from /api/recover-cart.php and lands
// them on the cart page — so the link returns them to a full basket rather
// than to a shop they have to rebuild.
function marketing_recovery_url(string $token): string {
    return marketing_base_url() . '/?recover=' . urlencode($token);
}

// -----------------------------------------------------------------------------
// Brevo contact sync (OPTIONAL)
// -----------------------------------------------------------------------------
// Brevo's transactional SMTP (api/_mailer.php) and Brevo's contact/campaign
// API are two DIFFERENT credentials. SMTP_PASS is an SMTP key and will not
// authenticate against api.brevo.com — set BREVO_API_KEY separately, from
// Brevo -> SMTP & API -> API Keys.
//
// Every function here is best-effort and never throws. Subscribers are stored
// in OUR table first and pushed to Brevo second, so the list survives a Brevo
// outage, a revoked key, or this never being configured at all. `brevo_synced`
// on the row records whether the push landed, so a backfill is one query.

function brevo_is_configured(): bool {
    return defined('BREVO_API_KEY') && BREVO_API_KEY !== '';
}

// Returns [int $httpCode, array $json] — [0, []] when the call could not be made.
function brevo_api_request(string $method, string $path, ?array $payload = null): array {
    if (!brevo_is_configured()) return [0, []];
    if (!function_exists('curl_init')) {
        error_log('[brevo] cURL unavailable — contact sync skipped');
        return [0, []];
    }
    $ch = curl_init('https://api.brevo.com/v3' . $path);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER     => [
            'accept: application/json',
            'content-type: application/json',
            'api-key: ' . BREVO_API_KEY,
        ],
    ];
    if ($payload !== null) $opts[CURLOPT_POSTFIELDS] = json_encode($payload);
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    if ($body === false) {
        error_log('[brevo] ' . $method . ' ' . $path . ' failed: ' . curl_error($ch));
        curl_close($ch);
        return [0, []];
    }
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode((string)$body, true);
    return [$code, is_array($json) ? $json : []];
}

// Push (or update) a contact. `updateEnabled` makes this idempotent, so a
// repeat signup is a no-op rather than a 400 we would have to special-case.
function brevo_upsert_contact(string $email, array $attributes = []): bool {
    if (!brevo_is_configured()) return false;
    $payload = ['email' => $email, 'updateEnabled' => true];
    if ($attributes) $payload['attributes'] = $attributes;
    if (defined('BREVO_LIST_ID') && (int)BREVO_LIST_ID > 0) {
        $payload['listIds'] = [(int)BREVO_LIST_ID];
    }
    list($code) = brevo_api_request('POST', '/contacts', $payload);
    // 201 = created, 204 = updated. Anything else is a real failure worth a
    // log line — but never worth failing the customer's request over.
    if ($code === 201 || $code === 204) return true;
    if ($code !== 0) error_log('[brevo] upsert contact ' . $email . ' returned HTTP ' . $code);
    return false;
}

// Honour an unsubscribe on Brevo's side too, so a campaign sent from their
// dashboard cannot reach someone who opted out through our site.
function brevo_set_blacklisted(string $email, bool $blacklisted): bool {
    if (!brevo_is_configured()) return false;
    list($code) = brevo_api_request('PUT', '/contacts/' . rawurlencode($email), [
        'emailBlacklisted' => $blacklisted,
    ]);
    return $code === 204;
}

// Called after marketing_subscribe(). Kept separate so the caller decides
// whether to pay the (up to 10s) network cost inline or leave it to a backfill.
function marketing_push_to_brevo(PDO $pdo, string $email, array $attributes = []): void {
    if (!brevo_is_configured()) return;
    if (brevo_upsert_contact($email, $attributes)) {
        try {
            $pdo->prepare('UPDATE subscribers SET brevo_synced = 1 WHERE email = :e')
                ->execute([':e' => $email]);
        } catch (Throwable $e) {
            error_log('[brevo] could not flag brevo_synced for ' . $email . ': ' . $e->getMessage());
        }
    }
}
