<?php
// One-shot migration: convert base64 data: URLs in products.image / products.images
// into real files under /uploads/products/<hash>.<ext> and rewrite the DB columns
// to point at those URLs.
//
// IDEMPOTENT — re-running is safe. Rows whose image columns are already URLs
// (i.e. don't start with "data:") are left alone. Files are content-addressed
// so a re-run will not write duplicate files.
//
// HOW TO RUN
//   Local Docker dev:
//     docker exec velorex-php php /app/scripts/migrate-product-images.php
//   Hostinger (SSH or cron job runner):
//     php /home/u286479481/domains/velorexmusic.com/public_html/scripts/migrate-product-images.php
//
// BEFORE / AFTER on a 66-product DB:
//   products.image:   each row ~400 KB base64  →  ~50 byte URL string
//   products.images:  each row ~1–2 MB JSON     →  array of ~50 byte URL strings
//   /api/products.php list response: ~27 MB    →  ~30 KB
//
// SAFETY
//   - Each row is independent; failure on one row does not abort the rest.
//   - Files are written BEFORE the DB row is updated, so a crash mid-migration
//     leaves orphan files (small cost) but never a row pointing at a missing file.
//   - The DB is updated row-by-row, no global transaction, so progress is durable.

if (php_sapi_name() !== 'cli') {
    echo "This script must be run from the command line.\n";
    exit(1);
}

// config.php reads $_SERVER['REQUEST_METHOD'] to set CORS preflight headers. In
// CLI there is no HTTP request — stub it before require so PHP doesn't emit
// "Undefined array key" warnings into the migration log.
$_SERVER['REQUEST_METHOD'] = $_SERVER['REQUEST_METHOD'] ?? 'CLI';
require_once __DIR__ . '/../api/config.php';

$pdo = db();
$uploadsDir = realpath(__DIR__ . '/..') . '/uploads/products';
if (!is_dir($uploadsDir)) {
    if (!@mkdir($uploadsDir, 0755, true) && !is_dir($uploadsDir)) {
        fwrite(STDERR, "ERROR: Could not create uploads directory: $uploadsDir\n");
        exit(1);
    }
}

// Allowed extensions match the upload endpoint. Anything else (e.g. data:image/svg+xml)
// is preserved as-is instead of being dropped, so no images are silently lost.
$ALLOWED_EXTS = ['jpg' => 'jpg', 'jpeg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];

// Returns the new public URL string, OR the original input unchanged if the
// input is not a base64 data: URL, OR null on conversion failure.
function migrate_one_image(string $src, string $uploadsDir, array $allowed): ?string {
    if (!preg_match('#^data:image/([a-zA-Z0-9+.\-]+);base64,(.+)$#i', $src, $m)) {
        return $src; // already a URL or external link — leave it
    }
    $extRaw = strtolower($m[1]);
    if (!isset($allowed[$extRaw])) {
        // Unsupported mime (e.g. svg+xml) — keep the original data: URL in place,
        // don't drop the customer-visible image.
        fwrite(STDERR, "    WARN: unsupported image mime image/$extRaw — leaving as data: URL\n");
        return $src;
    }
    $ext = $allowed[$extRaw];
    $bytes = base64_decode($m[2], true);
    if ($bytes === false || strlen($bytes) === 0) {
        return null;
    }
    $hash = substr(sha1($bytes), 0, 16);
    $path = $uploadsDir . "/{$hash}.{$ext}";
    if (!file_exists($path)) {
        if (file_put_contents($path, $bytes) === false) {
            return null;
        }
        @chmod($path, 0644);
    }
    return "/uploads/products/{$hash}.{$ext}";
}

$rows = $pdo->query('SELECT id, image, images FROM products ORDER BY id')->fetchAll();
$total = count($rows);
$converted = 0;
$alreadyClean = 0;
$failures = 0;
$bytesFreedApprox = 0;

echo "Found $total products. Beginning migration.\n";
echo str_repeat('-', 60) . "\n";

foreach ($rows as $r) {
    $id = (int)$r['id'];
    $changed = false;
    $beforeSize = strlen((string)$r['image']) + strlen((string)$r['images']);

    // Primary image column.
    $newPrimary = (string)($r['image'] ?? '');
    if ($newPrimary !== '') {
        $result = migrate_one_image($newPrimary, $uploadsDir, $ALLOWED_EXTS);
        if ($result === null) {
            fwrite(STDERR, "  ✗ product $id: primary image conversion FAILED (left in place)\n");
            $failures++;
        } elseif ($result !== $newPrimary) {
            $newPrimary = $result;
            $changed = true;
        }
    }

    // Gallery column. May be null (older rows before the migration added the column).
    $newImagesArr = null;
    if (!empty($r['images'])) {
        $imagesArr = json_decode($r['images'], true);
        if (is_array($imagesArr)) {
            $newImagesArr = [];
            foreach ($imagesArr as $img) {
                if (!is_string($img) || $img === '') continue;
                $result = migrate_one_image($img, $uploadsDir, $ALLOWED_EXTS);
                if ($result === null) {
                    fwrite(STDERR, "  ✗ product $id: a gallery image failed to convert (dropped from array)\n");
                    $failures++;
                    continue;
                }
                if ($result !== $img) $changed = true;
                $newImagesArr[] = $result;
            }
        }
    }

    if (!$changed) {
        echo "  · product $id: already migrated (no data: URLs found)\n";
        $alreadyClean++;
        continue;
    }

    $stmt = $pdo->prepare('UPDATE products SET image = :img, images = :imgs WHERE id = :id');
    $stmt->execute([
        ':img'  => $newPrimary !== '' ? $newPrimary : null,
        ':imgs' => $newImagesArr !== null ? json_encode($newImagesArr) : null,
        ':id'   => $id,
    ]);

    $afterSize = strlen((string)$newPrimary) + ($newImagesArr ? strlen(json_encode($newImagesArr)) : 0);
    $freed = max(0, $beforeSize - $afterSize);
    $bytesFreedApprox += $freed;

    $gCount = $newImagesArr !== null ? count($newImagesArr) : 1;
    printf("  ✓ product %d: rewrote %d image%s (%s → %s)\n",
        $id, $gCount, $gCount === 1 ? '' : 's',
        fmt_bytes($beforeSize), fmt_bytes($afterSize)
    );
    $converted++;
}

echo str_repeat('-', 60) . "\n";
echo "Done.\n";
echo "  Total products:        $total\n";
echo "  Converted:             $converted\n";
echo "  Already migrated:      $alreadyClean\n";
echo "  Per-image failures:    $failures\n";
echo "  DB column size freed:  ~" . fmt_bytes($bytesFreedApprox) . "\n";

function fmt_bytes(int $b): string {
    if ($b < 1024) return $b . ' B';
    if ($b < 1024 * 1024) return sprintf('%.1f KB', $b / 1024);
    return sprintf('%.2f MB', $b / (1024 * 1024));
}
