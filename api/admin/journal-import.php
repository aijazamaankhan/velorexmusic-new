<?php
// =============================================================================
// /api/admin/journal-import.php — Admin → Blog → "Import prepared drafts"
//
//   GET  → preview: which prepared articles would be created, which exist
//   POST → create the missing ones as DRAFTS
//
// Admin only. Never publishes and never overwrites an existing post; after the
// import every article is edited and published in the admin like any other.
// Logic: api/_journal_import.php.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_journal_import.php';

require_admin();

try {
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET' && $method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
    echo json_encode(journal_import_drafts(db(), $method === 'GET'), JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[journal-import] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Import failed']);
}
