<?php
// =============================================================================
// Store settings — schema, defaults, validation, read/write.
//
// Used by:
//   api/admin/settings.php   (the admin Settings panel: read + write)
//   api/settings.php         (the storefront's public, filtered read)
//   plus the individual consumers listed in `consumer` below.
//
// THE RULE FOR THIS FILE: a setting only belongs here if something actually
// reads it. The Settings panel used to be three hardcoded <input> values and a
// Save button with no handler — it looked like configuration and configured
// nothing. Every key below names its consumer, and if you add one without a
// consumer you have rebuilt the old panel with extra steps.
//
// The table is created on first use, like blog_posts, combo_offers and carts —
// there is no phpMyAdmin step.
// =============================================================================

require_once __DIR__ . '/config.php';

// key => [type, default, public?, label, help, consumer]
//
// `public` decides whether the value is exposed by /api/settings.php to any
// visitor. Anything an anonymous browser has no business knowing (internal
// thresholds, ops toggles) stays false and is admin-only.
function settings_schema(): array {
    return [
        // ---- Storefront -----------------------------------------------------
        'announcement_enabled' => [
            'type' => 'bool', 'default' => false, 'public' => true,
            'group' => 'Storefront', 'label' => 'Show announcement bar',
            'help'  => 'A single line across the top of every storefront page.',
            'consumer' => 'SiteSettings.renderAnnouncement() in src/js/storefront/site-settings.js',
        ],
        'announcement_text' => [
            'type' => 'string', 'max' => 160, 'default' => '', 'public' => true,
            'group' => 'Storefront', 'label' => 'Announcement text',
            'help'  => 'Kept to one line on purpose — a banner that wraps to three pushes the shop off the screen.',
            'consumer' => 'SiteSettings.renderAnnouncement() in src/js/storefront/site-settings.js',
        ],
        'announcement_link' => [
            'type' => 'path', 'max' => 200, 'default' => '', 'public' => true,
            'group' => 'Storefront', 'label' => 'Announcement link (optional)',
            'help'  => 'A path on this site, e.g. /combos. Leave blank for plain text.',
            'consumer' => 'SiteSettings.renderAnnouncement() in src/js/storefront/site-settings.js',
        ],
        'intro_splash_enabled' => [
            'type' => 'bool', 'default' => true, 'public' => true,
            'group' => 'Storefront', 'label' => 'Show the intro splash',
            'help'  => 'Homepage only, once per session. Never on a page someone lands on from search — see CLAUDE.md §15.',
            'consumer' => 'initSplash() in src/js/storefront/router.js',
        ],

        // ---- Recently Sold --------------------------------------------------
        'recently_sold_enabled' => [
            'type' => 'bool', 'default' => true, 'public' => true,
            'group' => 'Recently Sold', 'label' => 'Show the Recently Sold strip',
            'consumer' => 'src/js/storefront/recent-sales.js',
        ],
        'recently_sold_filler' => [
            'type' => 'bool', 'default' => true, 'public' => false,
            'group' => 'Recently Sold', 'label' => 'Top the strip up with filler',
            'help'  => 'OFF means the strip shows ONLY genuine sales, and hides itself entirely until there are at least four. This is the switch that turns off the synthesised rows described in CLAUDE.md §27.',
            'consumer' => 'api/recent-sales.php',
        ],

        // ---- Commerce -------------------------------------------------------
        'low_stock_threshold' => [
            'type' => 'int', 'min' => 1, 'max' => 50, 'default' => 3, 'public' => true,
            'group' => 'Commerce', 'label' => 'Low-stock threshold',
            'help'  => 'Drives the "Only N left" badge on the storefront and the restock list on the Dashboard.',
            'consumer' => 'api/admin/dashboard.php + the storefront stock badge',
        ],

        // ---- Marketing ------------------------------------------------------
        'recovery_enabled' => [
            'type' => 'bool', 'default' => true, 'public' => false,
            'group' => 'Marketing', 'label' => 'Send abandoned-cart reminders',
            'help'  => 'A kill switch for BOTH the cron and the manual Send button. Turning it off stops recovery email without having to remove the cron job.',
            'consumer' => 'marketing_send_recovery() in api/_recovery.php',
        ],
        'abandon_grace_minutes' => [
            'type' => 'int', 'min' => 5, 'max' => 1440, 'default' => 60, 'public' => false,
            'group' => 'Marketing', 'label' => 'Minutes before a basket counts as abandoned',
            'help'  => 'Baskets younger than this are shown under "Active now" and are never emailed — someone may still be shopping.',
            'consumer' => 'api/admin/abandoned.php + api/_recovery.php',
        ],

        // ---- Ads ------------------------------------------------------------
        // BLOG PAGES ONLY, enforced in src/js/storefront/ads.js and by the
        // router tearing units down on every non-blog navigation. An ad on a
        // product page or the cart invites the customer to leave for a
        // competitor, for pennies, at the moment they were about to spend.
        'adsense_client' => [
            'type' => 'string', 'max' => 40, 'default' => '', 'public' => true,
            'group' => 'Ads (blog only)', 'label' => 'AdSense publisher ID',
            'help'  => 'Looks like ca-pub-1234567890123456. Blank means no ads anywhere, and the Google script is never even loaded. Ads appear ONLY inside blog posts, and only on posts over 300 words.',
            'consumer' => 'src/js/storefront/ads.js',
        ],
        'adsense_slot' => [
            'type' => 'string', 'max' => 30, 'default' => '', 'public' => true,
            'group' => 'Ads (blog only)', 'label' => 'Ad unit (slot) ID',
            'help'  => 'The numeric ID of a display unit created in your AdSense account. Both fields are needed before anything renders. Keep the Cookies section of /privacy.html accurate while this is on.',
            'consumer' => 'src/js/storefront/ads.js',
        ],

        // ---- Contact --------------------------------------------------------
        // Shown on the storefront, so these are public by definition.
        'contact_email' => [
            'type' => 'email', 'max' => 160, 'default' => '', 'public' => true,
            'group' => 'Contact', 'label' => 'Public contact email',
            'help'  => 'Shown to customers. This is NOT the address order alerts go to — that is ADMIN_NOTIFY_EMAIL in the secrets file.',
            'consumer' => 'storefront footer + contact page',
        ],
        'store_address' => [
            'type' => 'string', 'max' => 300, 'default' => '', 'public' => true,
            'group' => 'Contact', 'label' => 'Store address',
            'help'  => 'Printed on invoices and shown to customers. One line per address — separate multiple locations with a semicolon. NOTE: if you change this, update contact.html and the Store JSON-LD to match. Google suppresses local rankings when the name, address and phone disagree across a site (CLAUDE.md §15).',
            'consumer' => 'invoice footer + storefront contact',
        ],
        'contact_phone' => [
            'type' => 'string', 'max' => 40, 'default' => '', 'public' => true,
            'group' => 'Contact', 'label' => 'Public contact phone',
            'consumer' => 'storefront footer + contact page',
        ],
    ];
}

function settings_ensure_table(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS store_settings (
                setting_key   VARCHAR(64) PRIMARY KEY,
                setting_value TEXT NULL,
                updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $done = true;
    } catch (Throwable $e) {
        // A missing settings table must never take the shop down: every reader
        // below falls back to the schema default.
        error_log('[settings] could not create store_settings: ' . $e->getMessage());
    }
}

// Coerce a stored string back into the schema's type.
function settings_cast($raw, array $spec) {
    switch ($spec['type']) {
        case 'bool':
            return $raw === '1' || $raw === 1 || $raw === true || $raw === 'true';
        case 'int':
            $v = (int)$raw;
            if (isset($spec['min'])) $v = max($spec['min'], $v);
            if (isset($spec['max'])) $v = min($spec['max'], $v);
            return $v;
        default:
            return (string)$raw;
    }
}

// Every setting, defaults filled in for anything not stored yet.
function settings_all(PDO $pdo): array {
    settings_ensure_table($pdo);
    $schema = settings_schema();
    $out = [];
    foreach ($schema as $key => $spec) $out[$key] = $spec['default'];

    try {
        $st = $pdo->query('SELECT setting_key, setting_value FROM store_settings');
        foreach ($st->fetchAll() as $row) {
            $key = (string)$row['setting_key'];
            if (!isset($schema[$key])) continue; // dropped from the schema — ignore, don't crash
            $out[$key] = settings_cast($row['setting_value'], $schema[$key]);
        }
    } catch (Throwable $e) {
        error_log('[settings] read failed, using defaults: ' . $e->getMessage());
    }
    return $out;
}

// One setting, with the schema default as the fallback. Safe to call from any
// consumer without worrying about whether the table exists yet.
function settings_get(PDO $pdo, string $key) {
    $schema = settings_schema();
    if (!isset($schema[$key])) return null;
    static $cache = null;
    if ($cache === null) $cache = settings_all($pdo);
    return $cache[$key] ?? $schema[$key]['default'];
}

// The subset an anonymous storefront visitor may read.
function settings_public(PDO $pdo): array {
    $schema = settings_schema();
    $all = settings_all($pdo);
    $out = [];
    foreach ($schema as $key => $spec) {
        if (!empty($spec['public'])) $out[$key] = $all[$key];
    }
    return $out;
}

// Validate + persist. Returns ['ok' => bool, 'errors' => [key => message]].
//
// Unknown keys are ignored rather than stored: this endpoint is admin-writable
// and several of these values are rendered on a public page, so the set of
// things that can be written is the schema and nothing else.
function settings_save(PDO $pdo, array $input): array {
    settings_ensure_table($pdo);
    $schema = settings_schema();
    $errors = [];
    $clean  = [];

    foreach ($input as $key => $value) {
        if (!isset($schema[$key])) continue;
        $spec = $schema[$key];

        switch ($spec['type']) {
            case 'bool':
                $clean[$key] = ($value === true || $value === 1 || $value === '1' || $value === 'true') ? '1' : '0';
                break;

            case 'int':
                if ($value === '' || $value === null) { $clean[$key] = (string)$spec['default']; break; }
                if (!is_numeric($value)) { $errors[$key] = 'Must be a number'; break; }
                $v = (int)$value;
                if (isset($spec['min']) && $v < $spec['min']) { $errors[$key] = 'Minimum is ' . $spec['min']; break; }
                if (isset($spec['max']) && $v > $spec['max']) { $errors[$key] = 'Maximum is ' . $spec['max']; break; }
                $clean[$key] = (string)$v;
                break;

            case 'email':
                $v = trim((string)$value);
                if ($v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) { $errors[$key] = 'Not a valid email address'; break; }
                $clean[$key] = $v;
                break;

            case 'path':
                // A SITE-RELATIVE path only. This value becomes an href on a
                // public page, so accepting an arbitrary URL here would turn
                // the Settings panel into an open-redirect / javascript: sink.
                $v = trim((string)$value);
                if ($v !== '' && !preg_match('#^/[A-Za-z0-9/_\-.?=&%]*$#', $v)) {
                    $errors[$key] = 'Must be a path on this site, starting with /';
                    break;
                }
                $clean[$key] = $v;
                break;

            default:
                $v = trim((string)$value);
                if (isset($spec['max']) && mb_strlen($v) > $spec['max']) {
                    $errors[$key] = 'Maximum ' . $spec['max'] . ' characters';
                    break;
                }
                $clean[$key] = $v;
        }
    }

    if ($errors) return ['ok' => false, 'errors' => $errors];

    try {
        $pdo->beginTransaction();
        $st = $pdo->prepare(
            'INSERT INTO store_settings (setting_key, setting_value) VALUES (:k, :v)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        foreach ($clean as $k => $v) $st->execute([':k' => $k, ':v' => $v]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[settings] write failed: ' . $e->getMessage());
        return ['ok' => false, 'errors' => ['_' => 'Could not save: ' . $e->getMessage()]];
    }

    return ['ok' => true, 'errors' => []];
}
