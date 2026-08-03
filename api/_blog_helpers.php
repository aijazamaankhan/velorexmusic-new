<?php
// =============================================================================
// Blog helpers — schema bootstrap, HTML sanitisation, row shaping.
//
// Used by api/blog.php, sitemap.php and seo-render.php.
//
// SECURITY NOTE, read before touching blog_sanitize_html():
// Blog content is pasted HTML that gets rendered with innerHTML on the public
// storefront. That is a stored-XSS sink. The admin is trusted, but "trusted"
// stops meaning anything the moment ADMIN_PASS leaks — and a single injected
// <script> on a page every visitor loads would be able to read carts, tokens
// and anything else in localStorage. So the HTML is sanitised SERVER-SIDE
// against an allowlist on write, not merely cleaned up in the browser.
// The admin editor also cleans paste client-side, but that is convenience
// only; this file is the actual boundary.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../src/seo/seo-lib.php';   // velorex_slugify(), shared with product URLs

// -----------------------------------------------------------------------------
// Schema
//
// Created on demand rather than via a manual migration. Every other table in
// this project is hand-migrated (CLAUDE.md §9), but the blog is self-contained
// and this avoids the deploy landing in a broken state while someone remembers
// to open phpMyAdmin. The DDL is still documented in CLAUDE.md.
//
// Runs at most once per request; MySQL's IF NOT EXISTS makes it a cheap no-op
// afterwards.
// -----------------------------------------------------------------------------
function blog_ensure_table(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS blog_posts (
            id INT PRIMARY KEY AUTO_INCREMENT,
            slug VARCHAR(200) NOT NULL,
            title VARCHAR(255) NOT NULL,
            excerpt VARCHAR(500) NULL,
            content MEDIUMTEXT NOT NULL,
            cover_image VARCHAR(500) NULL,
            status ENUM("draft","published") NOT NULL DEFAULT "draft",
            author VARCHAR(100) NULL,
            published_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_slug (slug),
            KEY idx_status_pub (status, published_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $done = true;
}

// -----------------------------------------------------------------------------
// HTML sanitiser
// -----------------------------------------------------------------------------

// Tags a post body may contain, and which attributes each may carry.
// Anything not listed here is unwrapped (children kept) or dropped entirely.
function blog_allowed_tags(): array {
    return [
        'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [],
        'u' => [], 's' => [], 'blockquote' => [], 'pre' => [], 'code' => [],
        'h2' => [], 'h3' => [], 'h4' => [],
        'ul' => [], 'ol' => [], 'li' => [],
        'hr' => [], 'figure' => [], 'figcaption' => [],
        'a'   => ['href', 'title', 'target', 'rel'],
        'img' => ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    ];
}

// Tags whose CONTENT must be destroyed, not merely unwrapped. Unwrapping
// <script> would spill its source into the page as visible text; unwrapping
// <style> likewise. These go entirely.
function blog_void_tags(): array {
    return ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input',
            'button', 'select', 'textarea', 'link', 'meta', 'base', 'svg', 'math'];
}

// Is this URL safe to put in href/src?
// Blocks javascript:, data: (except plain images are still blocked — an
// attacker-supplied data: image can carry an SVG with script), vbscript: and
// anything else exotic. Allows http(s), protocol-relative, root-relative,
// mailto and tel.
function blog_safe_url(string $url): bool {
    $u = trim($url);
    if ($u === '') return false;
    // Strip characters browsers ignore when resolving a scheme, so
    // "java\0script:" and "java\tscript:" cannot slip past.
    $probe = strtolower(preg_replace('/[\x00-\x20]/', '', $u) ?? '');
    foreach (['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'] as $bad) {
        if (str_starts_with($probe, $bad)) return false;
    }
    if (preg_match('#^(https?:)?//#i', $u)) return true;   // absolute or protocol-relative
    if (str_starts_with($u, '/')) return true;             // root-relative (our own uploads)
    if (preg_match('#^(mailto:|tel:)#i', $u)) return true;
    if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $u)) return false; // any other scheme
    return true;                                            // plain relative path
}

// Parse → walk → rebuild. A DOM pass is used rather than regex because regex
// cannot reliably see through malformed markup, and pasted Word/Docs HTML is
// reliably malformed.
function blog_sanitize_html(?string $html): string {
    $html = trim((string)$html);
    if ($html === '') return '';

    $allowed = blog_allowed_tags();
    $voids   = blog_void_tags();

    $doc = new DOMDocument('1.0', 'UTF-8');
    $prev = libxml_use_internal_errors(true);
    // The meta charset + wrapper keeps DOMDocument from mangling UTF-8 and from
    // inventing <html><body> around fragments in unpredictable places.
    $ok = $doc->loadHTML(
        '<?xml encoding="UTF-8"><div id="__blogroot">' . $html . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET
    );
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if (!$ok) return '';

    $root = $doc->getElementById('__blogroot');
    if (!$root) {
        $divs = $doc->getElementsByTagName('div');
        $root = $divs->length ? $divs->item(0) : null;
    }
    if (!$root) return '';

    // Depth-first, collecting nodes first: mutating the tree while iterating a
    // live NodeList silently skips siblings.
    $walk = function (DOMNode $node) use (&$walk, $allowed, $voids, $doc) {
        $children = [];
        foreach ($node->childNodes as $c) $children[] = $c;

        foreach ($children as $child) {
            if ($child instanceof DOMComment) {           // comments can hide markup
                $node->removeChild($child);
                continue;
            }
            if (!($child instanceof DOMElement)) continue; // text nodes pass through

            $tag = strtolower($child->nodeName);

            if (in_array($tag, $voids, true)) {
                $node->removeChild($child);                // destroy content too
                continue;
            }

            if (!isset($allowed[$tag])) {
                // Not allowed, but not dangerous — unwrap, keeping the text.
                // This is what turns pasted <span style=…> and <div> soup into
                // plain inline content instead of throwing the words away.
                $walk($child);
                while ($child->firstChild) {
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);
                continue;
            }

            // Allowed tag: strip every attribute not on its allowlist. This is
            // what removes on* event handlers, style, and framework junk.
            $attrs = [];
            foreach ($child->attributes as $a) $attrs[] = $a->nodeName;
            foreach ($attrs as $name) {
                $lname = strtolower($name);
                if (!in_array($lname, $allowed[$tag], true)) {
                    $child->removeAttribute($name);
                    continue;
                }
                $val = $child->getAttribute($name);
                if (($lname === 'href' || $lname === 'src') && !blog_safe_url($val)) {
                    $child->removeAttribute($name);
                }
            }

            if ($tag === 'a' && $child->getAttribute('target') === '_blank') {
                // Without this, the opened page can reach back via window.opener.
                $child->setAttribute('rel', 'noopener noreferrer');
            }
            if ($tag === 'img') {
                if (!$child->getAttribute('src')) {        // src stripped as unsafe → drop it
                    $node->removeChild($child);
                    continue;
                }
                if (!$child->getAttribute('alt')) $child->setAttribute('alt', '');
                $child->setAttribute('loading', 'lazy');
                $child->setAttribute('decoding', 'async');
            }

            $walk($child);
        }
    };
    $walk($root);

    $out = '';
    foreach ($root->childNodes as $c) $out .= $doc->saveHTML($c);
    return trim($out);
}

// -----------------------------------------------------------------------------
// Shaping
// -----------------------------------------------------------------------------

// Plain-text excerpt derived from the body, used for cards and meta description
// when the admin has not written one.
function blog_auto_excerpt(string $html, int $max = 180): string {
    $text = trim(preg_replace('/\s+/', ' ', strip_tags($html)) ?? '');
    return velorex_trim_text($text, $max);
}

// Unique slug. Appends -2, -3 … when the base is taken, so two posts titled
// the same do not collide on the UNIQUE index.
function blog_unique_slug(PDO $pdo, string $title, ?int $ignoreId = null): string {
    $base = velorex_slugify($title);
    $slug = $base;
    for ($i = 2; $i < 200; $i++) {
        $sql = 'SELECT id FROM blog_posts WHERE slug = :s' . ($ignoreId ? ' AND id <> :id' : '') . ' LIMIT 1';
        $st = $pdo->prepare($sql);
        $params = [':s' => $slug];
        if ($ignoreId) $params[':id'] = $ignoreId;
        $st->execute($params);
        if (!$st->fetch()) return $slug;
        $slug = $base . '-' . $i;
    }
    return $base . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
}

function blog_post_path(array $r): string {
    return '/blog/' . $r['slug'];
}

function blog_post_url(array $r): string {
    return VELOREX_SITE_URL . blog_post_path($r);
}

// Listing shape — no body, so the list endpoint stays small.
function blog_row_to_card(array $r): array {
    return [
        'id'          => (int)$r['id'],
        'slug'        => $r['slug'],
        'title'       => $r['title'],
        'excerpt'     => $r['excerpt'],
        'coverImage'  => $r['cover_image'],
        'status'      => $r['status'],
        'author'      => $r['author'],
        'publishedAt' => $r['published_at'],
        'updatedAt'   => $r['updated_at'] ?? null,
        'url'         => blog_post_path($r),
    ];
}

function blog_row_to_full(array $r): array {
    return blog_row_to_card($r) + ['content' => $r['content']];
}

// Rough read time, shown on cards. 200 wpm is the usual figure for online prose.
function blog_read_minutes(string $html): int {
    $words = str_word_count(strip_tags($html));
    return max(1, (int)ceil($words / 200));
}
