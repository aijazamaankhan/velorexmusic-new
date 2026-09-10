<?php
// =============================================================================
// /api/admin/settings.php — the admin Settings panel (ADMIN)
//
//   GET            -> { ok, schema, values, environment }
//   POST {values}  -> { ok } | 422 { errors: { key: message } }
//
// `schema` is sent to the browser so the panel renders itself from one
// definition. Adding a setting means editing api/_settings_helpers.php and
// nothing else — the form, its input type, its validation and its help text
// all follow.
//
// `environment` is READ-ONLY and comes from the secrets file, not the database.
// It is here because the two most common "why isn't this working" questions —
// is email configured, are we on live keys — were answerable only by SSHing in
// and reading a PHP file. It reports whether a secret is SET, never what it is.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_settings_helpers.php';
require_once __DIR__ . '/../_mailer.php';

// The exact line /ads.txt is serving, or why it is serving nothing. Mirrors
// ads-txt.php — same regex, same prefix handling — so the panel cannot claim
// something the file does not do.
function ads_txt_status(): array {
    try {
        $client = trim((string)settings_get(db(), 'adsense_client'));
    } catch (Throwable $e) {
        return ['ok' => false, 'line' => '', 'reason' => 'Could not read settings'];
    }
    if ($client === '') {
        return ['ok' => false, 'line' => '',
                'reason' => 'No publisher ID set — /ads.txt returns 404, so AdSense cannot verify the site.'];
    }
    if (!preg_match('/^ca-pub-(\d{10,20})$/', $client, $m)) {
        return ['ok' => false, 'line' => '',
                'reason' => 'That publisher ID is not in the ca-pub-0000000000000000 shape, so /ads.txt returns 404.'];
    }
    return ['ok' => true,
            'line' => 'google.com, pub-' . $m[1] . ', DIRECT, f08c47fec0942fa0',
            'reason' => ''];
}

require_admin();

try {
    $pdo = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Strip `consumer` out of what we send: it is a note to whoever edits
        // the schema, not something the panel renders.
        $schema = [];
        foreach (settings_schema() as $key => $spec) {
            $schema[$key] = [
                'type'    => $spec['type'],
                'group'   => $spec['group'] ?? 'Other',
                'label'   => $spec['label'] ?? $key,
                'help'    => $spec['help'] ?? '',
                'default' => $spec['default'],
                'min'     => $spec['min'] ?? null,
                'max'     => $spec['max'] ?? null,
            ];
        }

        $razorpayMode = defined('RAZORPAY_MODE') ? strtolower(trim((string)RAZORPAY_MODE)) : '';

        echo json_encode([
            'ok'     => true,
            'schema' => $schema,
            'values' => settings_all($pdo),
            // Booleans and short labels only — never a key, a password or a
            // host we would not want echoed into a screenshot.
            'environment' => [
                'smtpConfigured'  => mailer_is_configured(),
                'smtpHost'        => defined('SMTP_HOST') ? (string)SMTP_HOST : '',
                'smtpFrom'        => defined('SMTP_FROM') ? (string)SMTP_FROM : '',
                'adminNotify'     => defined('ADMIN_NOTIFY_EMAIL') ? (string)ADMIN_NOTIFY_EMAIL : '',
                'razorpayMode'    => $razorpayMode !== '' ? $razorpayMode : null,
                'brevoConfigured' => defined('BREVO_API_KEY') && BREVO_API_KEY !== '',
                'uploadsDir'      => defined('UPLOADS_PERSIST_DIR') ? (string)UPLOADS_PERSIST_DIR : '',
                'phpVersion'      => PHP_VERSION,
                // What /ads.txt is actually serving right now. AdSense
                // verification fetches that URL, and a 404 there is the whole
                // reason a "we couldn't verify your site" loop happens — but
                // the 404 is invisible from inside the admin, so it is
                // reported here rather than left to be guessed at.
                'adsTxt'          => ads_txt_status(),
            ],
        ]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body   = read_json_body();
        $values = is_array($body['values'] ?? null) ? $body['values'] : [];
        if (!$values) {
            http_response_code(400);
            echo json_encode(['error' => 'No settings supplied']);
            exit;
        }

        $res = settings_save($pdo, $values);
        if (!$res['ok']) {
            http_response_code(422);
            echo json_encode(['error' => 'Some settings could not be saved', 'errors' => $res['errors']]);
            exit;
        }

        echo json_encode(['ok' => true, 'values' => settings_all($pdo)]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('[admin/settings] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
