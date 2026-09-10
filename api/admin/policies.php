<?php
// =============================================================================
// /api/admin/policies.php — edit the policy pages (ADMIN)
//
//   GET                          -> { ok, pages: [{slug,label,url,html,overridden}] }
//   POST { slug, html }          -> { ok, html }   (sanitised copy echoed back)
//   POST { action:'reset', slug} -> { ok, html }   (drop the override)
//
// `html` on a GET is what the page currently shows: the stored override if
// there is one, otherwise the copy that lives in the static file. So opening
// the editor for the first time shows the shop's real policy, ready to edit,
// rather than an empty box.
//
// `overridden` says which of the two it is, so the panel can offer "Reset to
// the version in the code" only when there is something to reset.
//
// Bodies are sanitised on WRITE (policy_save -> blog_sanitize_html). That is
// the security boundary: this text is rendered raw on a public page.
// =============================================================================

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_policy_helpers.php';

require_admin();

try {
    $pdo   = db();
    $pages = policy_pages();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $out = [];
        foreach ($pages as $slug => $meta) {
            // A page with no template file on disk is not offered for editing —
            // there would be nowhere for the result to render.
            $fileBody = policy_body_from_file($slug);
            if ($fileBody === null) continue;
            $stored = policy_body_stored($pdo, $slug);
            $out[] = [
                'slug'       => $slug,
                'label'      => $meta['label'],
                'url'        => $meta['url'],
                'html'       => $stored !== null ? $stored : $fileBody,
                'overridden' => $stored !== null,
            ];
        }
        echo json_encode(['ok' => true, 'pages' => $out]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = read_json_body();
        $slug = (string)($body['slug'] ?? '');
        if (!isset($pages[$slug])) {
            http_response_code(400);
            echo json_encode(['error' => 'Unknown policy page']);
            exit;
        }

        if (($body['action'] ?? '') === 'reset') {
            policy_reset($pdo, $slug);
            echo json_encode([
                'ok'         => true,
                'html'       => policy_body_from_file($slug),
                'overridden' => false,
            ]);
            exit;
        }

        $res = policy_save($pdo, $slug, (string)($body['html'] ?? ''));
        if (!$res['ok']) {
            http_response_code(422);
            echo json_encode(['error' => $res['error']]);
            exit;
        }
        // Echo the SANITISED html back so the editor shows what was actually
        // stored, not what was typed — if the allowlist stripped something, the
        // person editing should see that immediately rather than discover it on
        // the live page.
        echo json_encode(['ok' => true, 'html' => $res['html'], 'overridden' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('[admin/policies] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
