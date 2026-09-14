<?php
// =============================================================================
// /api/music-history.php — The Evolution of Music & Audio (PUBLIC)
//
//   GET             -> { ok, eras, cards }           the hub
//   GET ?slug=cd    -> { ok, article }                one article
//
// Reads src/history/history-lib.php, the same file seo-render.php renders from,
// so the SPA and the server-rendered page can never disagree about the content.
//
// Cached for an hour: this is editorial material that ships with the code and
// changes only on deploy, so the no-store default the rest of the API uses
// would be wasteful. A deploy changes the file; nothing else does.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../src/history/history-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

header('Cache-Control: public, max-age=3600');

try {
    $slug = isset($_GET['slug']) ? preg_replace('/[^a-z0-9-]/', '', (string)$_GET['slug']) : '';

    if ($slug !== '') {
        $article = velorex_history_article($slug);
        if (!$article) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'No such topic']);
            exit;
        }
        echo json_encode(['ok' => true, 'article' => $article]);
        exit;
    }

    echo json_encode(['ok' => true] + velorex_history_index());
} catch (Throwable $e) {
    error_log('[music-history] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not load the history section']);
}
