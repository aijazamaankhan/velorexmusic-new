<?php
// =============================================================================
// policy.php — serves the editable policy pages (PUBLIC)
//
// .htaccess rewrites shipping.html / returns.html / terms.html / privacy.html
// here. The URL the customer sees, and the one Google has indexed, is unchanged.
//
// This is a TEMPLATE SHIM, not a renderer: it reads the same static file the
// server would otherwise have served, swaps the region between the
// velorex:policy markers for whatever the admin has stored, and prints the
// result. The head — <title>, meta description, canonical, Open Graph — is the
// file's own, untouched, so making these pages editable carried no SEO risk
// (CLAUDE.md §15).
//
// Every failure path falls back to serving the file exactly as it is. A missing
// table, a dead database, a slug that is not ours: the visitor still gets the
// shop's real policy. That is the whole reason the file remains the source of
// truth for everything except the words.
// =============================================================================

require_once __DIR__ . '/api/_policy_helpers.php';

$slug  = isset($_GET['page']) ? preg_replace('/[^a-z]/', '', (string)$_GET['page']) : '';
$pages = policy_pages();

if (!isset($pages[$slug])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}

$path = __DIR__ . '/' . $pages[$slug]['file'];
if (!is_readable($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}

$html = (string)file_get_contents($path);

// The stored override, if any. Wrapped because a policy page must render even
// when the database is unreachable — see the header.
$body = null;
try {
    $body = policy_body_stored(db(), $slug);
} catch (Throwable $e) {
    error_log('[policy] falling back to the file for ' . $slug . ': ' . $e->getMessage());
}

if ($body !== null) {
    $a = strpos($html, POLICY_START);
    $b = strpos($html, POLICY_END);
    if ($a !== false && $b !== false && $b > $a) {
        $a += strlen(POLICY_START);
        // Raw, not escaped: blog_sanitize_html() already rebuilt this against a
        // tag/attribute allowlist on the way IN, which is the security boundary.
        // Escaping here would print the tags as visible text.
        $html = substr($html, 0, $a) . "\n" . $body . "\n" . substr($html, $b);
    }
}

// Short cache: a policy edit should be visible quickly, and these pages change
// perhaps twice a year, so there is nothing to gain from a longer one.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=120');
echo $html;
