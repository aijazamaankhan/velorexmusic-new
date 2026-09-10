<?php
// =============================================================================
// Editable policy pages — schema and read/write.
//
// Used by:
//   policy.php               (the front controller that serves the pages)
//   api/admin/policies.php   (the admin editor)
//
// HOW THIS AVOIDS BREAKING SEO
// The policy pages are static HTML files with hand-written <title>, meta
// description, canonical and Open Graph tags (CLAUDE.md §15). Making them
// database-driven wholesale would have meant re-deriving all of that at render
// time — a lot of surface for a feature whose actual request was "let me edit
// the words".
//
// So only the BODY is dynamic. Each page keeps its file, its head and its
// chrome exactly as they are, with the editable region marked by
//   <!-- velorex:policy:start --> … <!-- velorex:policy:end -->
// policy.php swaps that region for the stored HTML when a row exists, and
// serves the file untouched when it does not. Consequences worth having:
//   • the URL, title, canonical and OG tags never change;
//   • the file in git is the seed AND the fallback, so an empty table, a failed
//     query or a dropped database renders the shop's real policy rather than a
//     blank page;
//   • reverting an edit is "delete the row".
//
// Stored HTML is a stored-XSS sink on a public page, so it is sanitised on
// WRITE with the blog's allowlist parser — the same trust boundary and the same
// reasoning as CLAUDE.md's Blog section. The editor in the browser also cleans
// pasted markup, but that is cosmetic; never move the boundary into the client.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_blog_helpers.php';   // blog_sanitize_html()

// slug => [file, label, what the page is for]
//
// A page only appears in the admin if it is listed here AND its template file
// exists, so a slug can never be edited into a page that has nowhere to render.
function policy_pages(): array {
    return [
        'shipping' => ['file' => 'shipping.html', 'label' => 'Shipping Policy',
                       'url'  => '/shipping.html'],
        'returns'  => ['file' => 'returns.html',  'label' => 'Returns & Refunds',
                       'url'  => '/returns.html'],
        'terms'    => ['file' => 'terms.html',    'label' => 'Terms & Conditions',
                       'url'  => '/terms.html'],
        'privacy'  => ['file' => 'privacy.html',  'label' => 'Privacy Policy',
                       'url'  => '/privacy.html'],
    ];
}

const POLICY_START = '<!-- velorex:policy:start -->';
const POLICY_END   = '<!-- velorex:policy:end -->';

function policy_root(): string {
    return dirname(__DIR__);
}

function policies_ensure_table(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS policy_pages (
                slug       VARCHAR(40) PRIMARY KEY,
                body_html  MEDIUMTEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $done = true;
    } catch (Throwable $e) {
        // The static files still render. A missing table costs the ability to
        // EDIT, never the ability to serve.
        error_log('[policies] table bootstrap failed: ' . $e->getMessage());
    }
}

// The editable region as it exists in the FILE — the seed shown in the editor
// the first time a page is opened, and the fallback whenever no row exists.
function policy_body_from_file(string $slug): ?string {
    $pages = policy_pages();
    if (!isset($pages[$slug])) return null;
    $path = policy_root() . '/' . $pages[$slug]['file'];
    if (!is_readable($path)) return null;

    $html = (string)file_get_contents($path);
    $a = strpos($html, POLICY_START);
    $b = strpos($html, POLICY_END);
    if ($a === false || $b === false || $b <= $a) return null;
    $a += strlen(POLICY_START);
    return trim(substr($html, $a, $b - $a));
}

// The stored override, or null when the file's own copy is still in force.
function policy_body_stored(PDO $pdo, string $slug): ?string {
    policies_ensure_table($pdo);
    try {
        $st = $pdo->prepare('SELECT body_html FROM policy_pages WHERE slug = :s');
        $st->execute([':s' => $slug]);
        $v = $st->fetchColumn();
        return ($v === false || $v === null || trim((string)$v) === '') ? null : (string)$v;
    } catch (Throwable $e) {
        error_log('[policies] read failed: ' . $e->getMessage());
        return null;
    }
}

// What the page should actually show: the override if there is one, else the file.
function policy_body(PDO $pdo, string $slug): ?string {
    $stored = policy_body_stored($pdo, $slug);
    return $stored !== null ? $stored : policy_body_from_file($slug);
}

/**
 * Save an edited body.
 *
 * Sanitised through blog_sanitize_html(), which parses with DOMDocument and
 * rebuilds against a tag/attribute allowlist: unknown tags are unwrapped,
 * script/style/iframe/form are destroyed, every attribute off the allowlist is
 * dropped (this is what kills on* handlers and style), and href/src are checked
 * against a scheme denylist. Because the stored HTML is already safe, policy.php
 * emits it raw — escaping it there would print tags as visible text.
 */
function policy_save(PDO $pdo, string $slug, string $html): array {
    $pages = policy_pages();
    if (!isset($pages[$slug])) return ['ok' => false, 'error' => 'Unknown policy page'];
    policies_ensure_table($pdo);

    $clean = blog_sanitize_html($html);
    if (trim(strip_tags($clean)) === '') {
        // Refuse to blank a policy page by accident. Reverting to the file's
        // copy is "Reset to default", which is explicit.
        return ['ok' => false, 'error' => 'A policy page cannot be empty'];
    }

    try {
        $st = $pdo->prepare(
            'INSERT INTO policy_pages (slug, body_html) VALUES (:s, :h)
             ON DUPLICATE KEY UPDATE body_html = VALUES(body_html)'
        );
        $st->execute([':s' => $slug, ':h' => $clean]);
    } catch (Throwable $e) {
        error_log('[policies] write failed: ' . $e->getMessage());
        return ['ok' => false, 'error' => 'Could not save: ' . $e->getMessage()];
    }
    return ['ok' => true, 'html' => $clean];
}

// Drop the override so the file's own copy is served again.
function policy_reset(PDO $pdo, string $slug): bool {
    policies_ensure_table($pdo);
    try {
        $pdo->prepare('DELETE FROM policy_pages WHERE slug = :s')->execute([':s' => $slug]);
        return true;
    } catch (Throwable $e) {
        error_log('[policies] reset failed: ' . $e->getMessage());
        return false;
    }
}
