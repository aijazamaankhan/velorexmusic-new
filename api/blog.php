<?php
// =============================================================================
// /api/blog.php — blog posts
//
// PUBLIC
//   GET  /api/blog.php                 → published posts, newest first (no body)
//   GET  /api/blog.php?slug=my-post    → one published post, with body
//
// ADMIN (X-Admin-Pass)
//   GET    /api/blog.php?all=1         → every post incl. drafts
//   GET    /api/blog.php?id=5          → one post by id, any status
//   POST   /api/blog.php               → create (no id) or update (id present)
//   DELETE /api/blog.php?id=5          → delete
//
// The table is created on first use — see blog_ensure_table(). Post bodies are
// sanitised on WRITE (blog_sanitize_html), so whatever is stored is already
// safe to render; the storefront does not re-sanitise.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_blog_helpers.php';
require_once __DIR__ . '/_collections_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    blog_ensure_table($pdo);
    $hasRelated = blog_has_related_columns($pdo);
    $hasMeta    = blog_has_meta_columns($pdo);
    $isAdmin = is_admin_request();

    // ---------------------------------------------------------------- GET ---
    if ($method === 'GET') {
        // Single post by slug. Drafts are only visible to an admin, so a
        // published URL cannot be used to preview unfinished work.
        if (isset($_GET['slug']) && $_GET['slug'] !== '') {
            $sql = 'SELECT * FROM blog_posts WHERE slug = :s'
                 . ($isAdmin ? '' : " AND status = 'published'") . ' LIMIT 1';
            $st = $pdo->prepare($sql);
            $st->execute([':s' => (string)$_GET['slug']]);
            $row = $st->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Post not found']);
                exit;
            }
            $post = blog_row_to_full($row);
            $post['readMinutes'] = blog_read_minutes($row['content']);
            $post['wasUpdated']  = blog_was_updated($row['published_at'], $row['updated_at']);
            // What to read or shop next — the same links seo-render.php prints
            // under the server-rendered article (api/_collections_helpers.php).
            if ($row['status'] === 'published') {
                $rel = collections_related_for_post($pdo, $row['slug']);
                $rel['products'] = array_map(static fn($p) => $p + ['url' => velorex_product_path($p)], $rel['products']);
                $post['related'] = $rel;
            }
            echo json_encode($post);
            exit;
        }

        // Single post by id — admin only (used to populate the editor).
        if (isset($_GET['id'])) {
            require_admin();
            $st = $pdo->prepare('SELECT * FROM blog_posts WHERE id = :id LIMIT 1');
            $st->execute([':id' => (int)$_GET['id']]);
            $row = $st->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Post not found']);
                exit;
            }
            echo json_encode(blog_row_to_full($row));
            exit;
        }

        // Listing.
        if (!empty($_GET['all'])) {
            require_admin();
            $rows = $pdo->query(
                'SELECT id, slug, title, excerpt, cover_image, status, author,
                        published_at, updated_at
                   FROM blog_posts
                  ORDER BY COALESCE(published_at, updated_at) DESC, id DESC'
            )->fetchAll();
        } else {
            // published_at is set the moment a post first goes live, so ordering
            // by it gives a stable chronological feed regardless of later edits.
            $rows = $pdo->query(
                "SELECT id, slug, title, excerpt, cover_image, status, author,
                        published_at, updated_at
                   FROM blog_posts
                  WHERE status = 'published'
                  ORDER BY published_at DESC, id DESC"
            )->fetchAll();
        }
        echo json_encode(array_map('blog_row_to_card', $rows));
        exit;
    }

    // --------------------------------------------------------------- POST ---
    if ($method === 'POST') {
        require_admin();
        $b = read_json_body();

        $title = trim((string)($b['title'] ?? ''));
        if ($title === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Title is required']);
            exit;
        }

        // THE security boundary. Never store $b['content'] unsanitised.
        $content = blog_sanitize_html($b['content'] ?? '');
        if (trim(strip_tags($content)) === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Post content is empty']);
            exit;
        }

        $status = in_array(($b['status'] ?? 'draft'), ['draft', 'published'], true)
            ? $b['status'] : 'draft';

        $excerpt = trim((string)($b['excerpt'] ?? ''));
        if ($excerpt === '') $excerpt = blog_auto_excerpt($content);
        $excerpt = mb_substr($excerpt, 0, 500);

        $cover = trim((string)($b['coverImage'] ?? ''));
        if ($cover !== '' && !blog_safe_url($cover)) $cover = '';

        // Author is optional. Blank means the post is by the shop itself; a
        // name is shown and marked up as a Person, so only enter a real one.
        $author = mb_substr(trim((string)($b['author'] ?? '')), 0, 100);
        if ($author === '') $author = 'Velorex Music';

        // Editorial relations, validated. Unknown shapes are dropped.
        $relCollections = json_encode(array_slice(blog_decode_list($b['relatedCollections'] ?? [], 'path'), 0, 8));
        $relProducts    = json_encode(array_slice(blog_decode_list($b['relatedProducts'] ?? [], 'int'), 0, 12));

        // Optional SEO overrides. Blank stores NULL so the derived value
        // (velorex_blog_meta_title / _description) is used.
        $metaTitle = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($b['metaTitle'] ?? ''))), 0, 70);
        $metaDesc  = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($b['metaDescription'] ?? ''))), 0, 170);
        $metaTitle = $metaTitle !== '' ? $metaTitle : null;
        $metaDesc  = $metaDesc !== '' ? $metaDesc : null;
        $id = isset($b['id']) && $b['id'] !== '' && $b['id'] !== null ? (int)$b['id'] : 0;

        if ($id > 0) {
            $cur = $pdo->prepare('SELECT * FROM blog_posts WHERE id = :id LIMIT 1');
            $cur->execute([':id' => $id]);
            $existing = $cur->fetch();
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['error' => 'Post not found']);
                exit;
            }

            // Keep the existing slug unless the admin explicitly changed it or
            // the title changed. A slug is a public URL — silently rewriting it
            // on every save would break links and split search rankings.
            $slug = trim((string)($b['slug'] ?? ''));
            $slug = $slug !== ''
                ? blog_unique_slug($pdo, $slug, $id)
                : $existing['slug'];

            // Stamp published_at the first time it goes live, then leave it.
            $publishedAt = $existing['published_at'];
            if ($status === 'published' && !$publishedAt) $publishedAt = date('Y-m-d H:i:s');

            // updated_at feeds the "Updated <date>" line and dateModified. Only
            // a change to what the reader reads may move it: re-tagging related
            // collections or flipping status must not make an old post look
            // freshly revised. Assigning the column to itself suppresses
            // MySQL's ON UPDATE stamp.
            $textChanged = $title !== $existing['title'] || $content !== $existing['content']
                        || $excerpt !== (string)$existing['excerpt'];
            $st = $pdo->prepare(
                'UPDATE blog_posts
                    SET slug=:slug, title=:title, excerpt=:excerpt, content=:content,
                        cover_image=:cover, status=:status, author=:author,
                        published_at=:pub'
                  . ($hasRelated ? ', related_collections=:rc, related_products=:rp' : '')
                  . ($hasMeta ? ', meta_title=:mt, meta_description=:md' : '')
                  . ($textChanged ? '' : ', updated_at=updated_at')
                  . ' WHERE id=:id'
            );
            $params = [
                ':slug' => $slug, ':title' => $title, ':excerpt' => $excerpt,
                ':content' => $content, ':cover' => $cover !== '' ? $cover : null,
                ':status' => $status, ':author' => $author,
                ':pub' => $publishedAt, ':id' => $id,
            ];
            if ($hasRelated) { $params[':rc'] = $relCollections; $params[':rp'] = $relProducts; }
            if ($hasMeta) { $params[':mt'] = $metaTitle; $params[':md'] = $metaDesc; }
            $st->execute($params);
        } else {
            $slug = blog_unique_slug($pdo, trim((string)($b['slug'] ?? '')) ?: $title);
            $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
            $st = $pdo->prepare(
                'INSERT INTO blog_posts (slug, title, excerpt, content, cover_image,
                                         status, author, published_at'
                . ($hasRelated ? ', related_collections, related_products' : '')
                . ($hasMeta ? ', meta_title, meta_description' : '') . ')
                 VALUES (:slug, :title, :excerpt, :content, :cover, :status, :author, :pub'
                . ($hasRelated ? ', :rc, :rp' : '')
                . ($hasMeta ? ', :mt, :md' : '') . ')'
            );
            $params = [
                ':slug' => $slug, ':title' => $title, ':excerpt' => $excerpt,
                ':content' => $content, ':cover' => $cover !== '' ? $cover : null,
                ':status' => $status, ':author' => $author, ':pub' => $publishedAt,
            ];
            if ($hasRelated) { $params[':rc'] = $relCollections; $params[':rp'] = $relProducts; }
            if ($hasMeta) { $params[':mt'] = $metaTitle; $params[':md'] = $metaDesc; }
            $st->execute($params);
            $id = (int)$pdo->lastInsertId();
        }

        $out = $pdo->prepare('SELECT * FROM blog_posts WHERE id = :id LIMIT 1');
        $out->execute([':id' => $id]);
        echo json_encode(['ok' => true, 'post' => blog_row_to_full($out->fetch())]);
        exit;
    }

    // ------------------------------------------------------------- DELETE ---
    if ($method === 'DELETE') {
        require_admin();
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing post id']);
            exit;
        }
        $st = $pdo->prepare('DELETE FROM blog_posts WHERE id = :id');
        $st->execute([':id' => $id]);
        if ($st->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Post not found']);
            exit;
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
