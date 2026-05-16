<?php
// Bulk CSV import endpoint. Unlike POST /api/products.php (which does a
// transactional DELETE + re-insert of the full catalog), this endpoint adds
// to / updates the existing catalog without wiping anything else.
//
// Body: { "products": [ {id?, title, artist, category, price, ...}, ... ] }
// - id present  → update that row (or insert if the id doesn't exist yet)
// - id missing  → server auto-assigns MAX(id)+1
//
// Returns: { ok, inserted, updated, errors[], products[] }
// The whole import runs in a single transaction; if the transaction fails the
// catalog is unchanged. Per-row validation errors are reported in `errors`
// alongside the successful rows — the client validates first so server-side
// errors here mean the client missed something (or sent stale data).

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_products_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_admin();
$body = read_json_body();

if (!isset($body['products']) || !is_array($body['products']) || count($body['products']) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or empty products array']);
    exit;
}

$pdo = db();

try {
    $pdo->beginTransaction();

    // Snapshot existing ids and the current max id once, then mutate the
    // in-memory copies as we go. Cheaper than re-querying per row.
    $existingIds = [];
    foreach ($pdo->query('SELECT id FROM products') as $r) {
        $existingIds[(int)$r['id']] = true;
    }
    $maxId = empty($existingIds) ? 0 : max(array_keys($existingIds));

    // Valid category set — reject anything outside this list, otherwise the
    // storefront filters won't surface the row.
    $validCategories = [];
    foreach ($pdo->query('SELECT name FROM categories') as $r) {
        $validCategories[$r['name']] = true;
    }

    $inserted = 0;
    $updated = 0;
    $errors = [];
    $savedIds = [];

    foreach ($body['products'] as $i => $p) {
        $rowNum = $i + 1;
        if (!is_array($p)) {
            $errors[] = ['row' => $rowNum, 'error' => 'Row is not an object'];
            continue;
        }

        $hasId = isset($p['id']) && $p['id'] !== '' && $p['id'] !== null;
        if ($hasId) {
            $p['id'] = (int)$p['id'];
            if ($p['id'] <= 0) {
                $errors[] = ['row' => $rowNum, 'error' => 'Invalid id (must be a positive integer)'];
                continue;
            }
            if ($p['id'] > $maxId) $maxId = $p['id'];
        } else {
            $maxId++;
            $p['id'] = $maxId;
        }

        $title    = trim((string)($p['title']    ?? ''));
        $artist   = trim((string)($p['artist']   ?? ''));
        $category = trim((string)($p['category'] ?? ''));
        if ($title === '' || $artist === '' || $category === '') {
            $errors[] = ['row' => $rowNum, 'id' => $p['id'], 'error' => 'Missing required field (title, artist, category)'];
            continue;
        }
        if (!empty($validCategories) && !isset($validCategories[$category])) {
            $errors[] = ['row' => $rowNum, 'id' => $p['id'], 'error' => "Unknown category '$category'"];
            continue;
        }
        if (!isset($p['price']) || !is_numeric($p['price']) || (int)$p['price'] < 0) {
            $errors[] = ['row' => $rowNum, 'id' => $p['id'], 'error' => 'Invalid price (must be a non-negative integer)'];
            continue;
        }
        if (isset($p['stock']) && (!is_numeric($p['stock']) || (int)$p['stock'] < 0)) {
            $errors[] = ['row' => $rowNum, 'id' => $p['id'], 'error' => 'Invalid stock (must be a non-negative integer)'];
            continue;
        }
        if (isset($p['badge']) && $p['badge'] !== '' && $p['badge'] !== null
            && !in_array($p['badge'], ['hot', 'new', 'upcoming'], true)) {
            $errors[] = ['row' => $rowNum, 'id' => $p['id'], 'error' => "Invalid badge '{$p['badge']}' (must be hot/new/upcoming or blank)"];
            continue;
        }

        $isUpdate = isset($existingIds[$p['id']]);
        upsert_product($pdo, $p);
        if ($isUpdate) {
            $updated++;
        } else {
            $inserted++;
            $existingIds[$p['id']] = true;
        }
        $savedIds[] = $p['id'];
    }

    // If every row failed, roll back so we don't commit an empty no-op transaction
    // (and so the client gets a clear 400 instead of a misleading 200).
    if ($inserted === 0 && $updated === 0) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode([
            'ok' => false,
            'inserted' => 0,
            'updated' => 0,
            'errors' => $errors,
            'products' => [],
        ]);
        exit;
    }

    $pdo->commit();

    $savedRows = [];
    if (!empty($savedIds)) {
        $placeholders = implode(',', array_fill(0, count($savedIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM products WHERE id IN ($placeholders) ORDER BY id");
        $stmt->execute($savedIds);
        $savedRows = array_map('row_to_product', $stmt->fetchAll());
    }

    echo json_encode([
        'ok' => true,
        'inserted' => $inserted,
        'updated' => $updated,
        'errors' => $errors,
        'products' => $savedRows,
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
