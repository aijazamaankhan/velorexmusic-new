<?php
// =============================================================================
// /api/settings.php — storefront-visible settings (PUBLIC)
//
//   GET -> { ok, settings: { ... } }
//
// Only the keys marked `public` in settings_schema() are returned. The admin
// endpoint carries the rest, and several of those (recovery toggles, grace
// windows, whether the sales strip is padded) are operational details an
// anonymous visitor has no business reading.
//
// Cached briefly rather than no-store: this is read on every storefront page
// load and the values change perhaps once a month. 60 seconds is short enough
// that flipping a switch in the admin is visible almost immediately and long
// enough that it costs nothing.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_settings_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// config.php sets no-store for the API by default; this one endpoint opts out.
header('Cache-Control: public, max-age=60');

try {
    echo json_encode(['ok' => true, 'settings' => settings_public(db())]);
} catch (Throwable $e) {
    error_log('[settings] ' . $e->getMessage());
    // Never fail the storefront over settings — hand back an empty set and let
    // every consumer fall back to its own default.
    echo json_encode(['ok' => true, 'settings' => new stdClass()]);
}
