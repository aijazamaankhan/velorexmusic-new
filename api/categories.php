<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

// Departments defined in CODE (velorex_categories() in src/seo/seo-lib.php)
// rather than by the admin: they have their own URLs, subcategory taxonomy and
// hand-written SEO copy. This seeds them into the categories table so they show
// up in the admin's Category dropdown and products can actually be assigned.
//
// INSERT IGNORE, so it is a no-op once they exist and never disturbs the
// admin's own ordering or additions. Removing one from the Categories panel
// will not stick — that is intentional, since the storefront routes for it
// exist regardless and an unassignable route is worse than an extra pill.
function categories_seed_departments(PDO $pdo): void {
    try {
        $stmt = $pdo->prepare('INSERT IGNORE INTO categories (name, sort_order) VALUES (:n, :s)');
        foreach ([['merchandise', 90], ['vinyl-care', 91]] as [$name, $sort]) {
            $stmt->execute([':n' => $name, ':s' => $sort]);
        }
    } catch (Throwable $e) {
        // Never fatal: the storefront reads categories on every page load.
        error_log('[categories] department seed failed: ' . $e->getMessage());
    }
}

try {
    if ($method === 'GET') {
        categories_seed_departments($pdo);
        $stmt = $pdo->query('SELECT name FROM categories ORDER BY sort_order, name');
        echo json_encode($stmt->fetchAll(PDO::FETCH_COLUMN));
        exit;
    }

    if ($method === 'POST') {
        require_admin();
        $body = read_json_body();
        if (!isset($body['categories']) || !is_array($body['categories'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing categories array']);
            exit;
        }

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM categories');
        $stmt = $pdo->prepare('INSERT INTO categories (name, sort_order) VALUES (:name, :sort_order)');
        $i = 0;
        foreach ($body['categories'] as $cat) {
            if (!is_string($cat) || trim($cat) === '') continue;
            $stmt->execute([':name' => trim($cat), ':sort_order' => $i++]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'count' => $i]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
