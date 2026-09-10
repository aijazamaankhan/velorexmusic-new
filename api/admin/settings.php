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
