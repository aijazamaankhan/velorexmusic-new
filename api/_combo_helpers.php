<?php
// =============================================================================
// Combo offers — curated product bundles.
//
// IMPORTANT, and the reason this file has no price column:
// a combo does NOT change what the customer is charged. api/payments/
// create-order.php recomputes every total from DB product prices, so a discount
// stored here would simply be ignored at checkout and the customer would pay
// full price while the page promised less. Rather than display a number the
// till will not honour, a combo shows its products and their REAL combined
// total. "Add all to cart" then adds those products at their normal prices, so
// what is shown and what is charged are the same figure by construction.
//
// If a genuine bundle discount is wanted later it has to be enforced in
// create-order.php — that is a payment-path change, not a display one.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_products_helpers.php';
require_once __DIR__ . '/../src/seo/seo-lib.php';   // velorex_slugify()

// Created on demand, like blog_posts. See CLAUDE.md §9 for why this table and
// the blog's are the two exceptions to the manual-migration convention.
function combos_ensure_table(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS combo_offers (
            id INT PRIMARY KEY AUTO_INCREMENT,
            slug VARCHAR(200) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description VARCHAR(600) NULL,
            image VARCHAR(500) NULL,
            product_ids JSON NOT NULL,
            status ENUM("draft","published") NOT NULL DEFAULT "draft",
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_combo_slug (slug),
            KEY idx_combo_status (status, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $done = true;
}

function combo_unique_slug(PDO $pdo, string $title, ?int $ignoreId = null): string {
    $base = velorex_slugify($title);
    $slug = $base;
    for ($i = 2; $i < 200; $i++) {
        $sql = 'SELECT id FROM combo_offers WHERE slug = :s' . ($ignoreId ? ' AND id <> :id' : '') . ' LIMIT 1';
        $st = $pdo->prepare($sql);
        $params = [':s' => $slug];
        if ($ignoreId) $params[':id'] = $ignoreId;
        $st->execute($params);
        if (!$st->fetch()) return $slug;
        $slug = $base . '-' . $i;
    }
    return $base . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
}

// Decode product_ids to a clean int list.
function combo_product_ids(array $row): array {
    $ids = json_decode($row['product_ids'] ?? '[]', true);
    if (!is_array($ids)) return [];
    $out = [];
    foreach ($ids as $id) {
        $n = (int)$id;
        if ($n > 0 && !in_array($n, $out, true)) $out[] = $n;
    }
    return $out;
}

// Attach the live products to a set of combo rows, in ONE query rather than one
// per combo. Products are read fresh every time — never denormalised onto the
// combo — so a price edit or a deletion is reflected immediately and the total
// shown can never drift from what checkout will charge.
function combos_attach_products(PDO $pdo, array $rows): array {
    $allIds = [];
    foreach ($rows as $r) {
        foreach (combo_product_ids($r) as $id) $allIds[$id] = true;
    }
    $byId = [];
    if ($allIds) {
        $ids = array_keys($allIds);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $condCol = products_has_condition_column($pdo) ? 'item_condition, ' : '';
        $shipCol = products_has_shipping_columns($pdo) ? 'free_shipping, shipping_charge, ' : '';
        $st = $pdo->prepare(
            "SELECT id, title, artist, category, language, price, original_price, image,
                    rating, reviews, badge, stock, {$condCol}{$shipCol}music_director
               FROM products WHERE id IN ($ph)"
        );
        $st->execute($ids);
        foreach ($st->fetchAll() as $p) $byId[(int)$p['id']] = row_to_product_lean($p);
    }

    $out = [];
    foreach ($rows as $r) {
        $items = [];
        $total = 0;
        $anyOutOfStock = false;
        foreach (combo_product_ids($r) as $id) {
            // A product deleted after the combo was built is skipped rather
            // than rendering a broken card or a wrong total.
            if (!isset($byId[$id])) continue;
            $p = $byId[$id];
            $items[] = $p;
            $total += (int)$p['price'];
            if ((int)$p['stock'] < 1) $anyOutOfStock = true;
        }
        $out[] = [
            'id'          => (int)$r['id'],
            'slug'        => $r['slug'],
            'title'       => $r['title'],
            'description' => $r['description'],
            'image'       => $r['image'],
            'status'      => $r['status'],
            'sortOrder'   => (int)$r['sort_order'],
            'products'    => $items,
            'itemCount'   => count($items),
            // The REAL sum of current prices. Not a discount, not a promise —
            // just what these items cost together today.
            'total'       => $total,
            'inStock'     => $items && !$anyOutOfStock,
            'updatedAt'   => $r['updated_at'] ?? null,
        ];
    }
    return $out;
}

function combo_path(array $c): string { return '/combos'; }
