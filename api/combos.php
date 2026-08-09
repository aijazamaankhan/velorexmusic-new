<?php
// =============================================================================
// /api/combos.php — combo offers (curated product bundles)
//
// PUBLIC
//   GET  /api/combos.php              → published combos, each with its live
//                                       products and their real combined total
//
// ADMIN (X-Admin-Pass)
//   GET    /api/combos.php?all=1      → every combo incl. drafts
//   GET    /api/combos.php?id=5       → one combo, any status
//   POST   /api/combos.php            → create (no id) / update (id present)
//   DELETE /api/combos.php?id=5       → delete
//
// A combo never changes the price charged — see the note at the top of
// _combo_helpers.php. Products are resolved live on every read, so the total
// shown always matches what checkout will compute.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_combo_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

try {
    combos_ensure_table($pdo);
    $isAdmin = is_admin_request();

    // ---------------------------------------------------------------- GET ---
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            require_admin();
            $st = $pdo->prepare('SELECT * FROM combo_offers WHERE id = :id LIMIT 1');
            $st->execute([':id' => (int)$_GET['id']]);
            $row = $st->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Combo not found']);
                exit;
            }
            $out = combos_attach_products($pdo, [$row]);
            // The editor needs the raw id list too, including ids whose product
            // has since been deleted — otherwise saving would silently drop them.
            $out[0]['productIds'] = combo_product_ids($row);
            echo json_encode($out[0]);
            exit;
        }

        if (!empty($_GET['all'])) {
            require_admin();
            $rows = $pdo->query('SELECT * FROM combo_offers ORDER BY sort_order, id DESC')->fetchAll();
        } else {
            $rows = $pdo->query(
                "SELECT * FROM combo_offers WHERE status = 'published' ORDER BY sort_order, id DESC"
            )->fetchAll();
        }
        $combos = combos_attach_products($pdo, $rows);
        // A published combo whose products have all been deleted would render
        // as an empty card. Hide those from the public feed; the admin list
        // still shows them so the problem is visible and fixable.
        if (empty($_GET['all'])) {
            $combos = array_values(array_filter($combos, fn($c) => $c['itemCount'] > 0));
        }
        echo json_encode($combos);
        exit;
    }

    // --------------------------------------------------------------- POST ---
    if ($method === 'POST') {
        require_admin();
        $b = read_json_body();

        $title = trim((string)($b['title'] ?? ''));
        if ($title === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Combo title is required']);
            exit;
        }

        $ids = [];
        if (isset($b['productIds']) && is_array($b['productIds'])) {
            foreach ($b['productIds'] as $id) {
                $n = (int)$id;
                if ($n > 0 && !in_array($n, $ids, true)) $ids[] = $n;
            }
        }
        if (count($ids) < 2) {
            http_response_code(400);
            echo json_encode(['error' => 'A combo needs at least 2 products']);
            exit;
        }
        if (count($ids) > 12) {
            http_response_code(400);
            echo json_encode(['error' => 'A combo can hold at most 12 products']);
            exit;
        }

        // Every id must exist, or the combo would render short and the total
        // would silently be for fewer items than the admin selected.
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $chk = $pdo->prepare("SELECT COUNT(*) FROM products WHERE id IN ($ph)");
        $chk->execute($ids);
        if ((int)$chk->fetchColumn() !== count($ids)) {
            http_response_code(400);
            echo json_encode(['error' => 'One or more selected products no longer exist']);
            exit;
        }

        $status = in_array(($b['status'] ?? 'draft'), ['draft', 'published'], true) ? $b['status'] : 'draft';
        $desc   = mb_substr(trim((string)($b['description'] ?? '')), 0, 600);
        $image  = trim((string)($b['image'] ?? ''));
        if ($image !== '' && !preg_match('#^(/|https?://)#i', $image)) $image = '';
        $sort   = isset($b['sortOrder']) ? (int)$b['sortOrder'] : 0;
        $id     = isset($b['id']) && $b['id'] !== '' && $b['id'] !== null ? (int)$b['id'] : 0;

        if ($id > 0) {
            $cur = $pdo->prepare('SELECT * FROM combo_offers WHERE id = :id LIMIT 1');
            $cur->execute([':id' => $id]);
            $existing = $cur->fetch();
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['error' => 'Combo not found']);
                exit;
            }
            // Keep the slug unless the admin changed it — it is a public URL
            // fragment and rewriting it on every save would break links.
            $slug = trim((string)($b['slug'] ?? ''));
            $slug = $slug !== '' ? combo_unique_slug($pdo, $slug, $id) : $existing['slug'];
            $st = $pdo->prepare(
                'UPDATE combo_offers SET slug=:slug, title=:title, description=:desc, image=:img,
                        product_ids=:pids, status=:status, sort_order=:sort WHERE id=:id'
            );
            $st->execute([
                ':slug' => $slug, ':title' => $title, ':desc' => $desc !== '' ? $desc : null,
                ':img' => $image !== '' ? $image : null, ':pids' => json_encode($ids),
                ':status' => $status, ':sort' => $sort, ':id' => $id,
            ]);
        } else {
            $slug = combo_unique_slug($pdo, trim((string)($b['slug'] ?? '')) ?: $title);
            $st = $pdo->prepare(
                'INSERT INTO combo_offers (slug, title, description, image, product_ids, status, sort_order)
                 VALUES (:slug, :title, :desc, :img, :pids, :status, :sort)'
            );
            $st->execute([
                ':slug' => $slug, ':title' => $title, ':desc' => $desc !== '' ? $desc : null,
                ':img' => $image !== '' ? $image : null, ':pids' => json_encode($ids),
                ':status' => $status, ':sort' => $sort,
            ]);
            $id = (int)$pdo->lastInsertId();
        }

        $out = $pdo->prepare('SELECT * FROM combo_offers WHERE id = :id LIMIT 1');
        $out->execute([':id' => $id]);
        echo json_encode(['ok' => true, 'combo' => combos_attach_products($pdo, [$out->fetch()])[0]]);
        exit;
    }

    // ------------------------------------------------------------- DELETE ---
    if ($method === 'DELETE') {
        require_admin();
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing combo id']);
            exit;
        }
        $st = $pdo->prepare('DELETE FROM combo_offers WHERE id = :id');
        $st->execute([':id' => $id]);
        if ($st->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Combo not found']);
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
