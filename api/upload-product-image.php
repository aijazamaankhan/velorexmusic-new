<?php
// Admin-only multipart image upload for products.
//
// Why this exists: Phase 1 of the storefront perf rewrite. Until now product
// images were stored as base64 data: URLs in products.image / products.images
// (LONGTEXT). That bloated /api/products.php to 27 MB for 66 products and
// blocked every list page load by 15+ seconds. After Phase 1, images live on
// disk in public_html/uploads/products/ and the DB only stores the URL.
//
// Contract:
//   POST multipart/form-data
//     headers: X-Admin-Pass: <ADMIN_PASS>
//     field 'image': the file (JPG/PNG/WebP, ≤5 MB)
//   200: { ok: true, url: "/uploads/products/<hash>.<ext>", bytes: N }
//   400: { error: "..." } on validation failure
//   401: { error: "Unauthorized" } if X-Admin-Pass is missing/wrong
//   500: { error: "..." } on disk write failure
//
// Filename layout: <hash>.<ext> where <hash> = first 16 hex of SHA-1 of the
// file's bytes. Content-addressed: re-uploading the same image is a no-op
// (file already exists; we just return the URL again). Different content
// always yields a different URL, so browsers + CDNs can cache aggressively
// without ever serving stale.
//
// We deliberately do NOT scope by productId (no /uploads/products/<id>/...
// folder). Admin assigns product IDs at submit time, not at modal-open time,
// so images uploaded mid-edit don't yet know which product they belong to.
// Flat content-addressed storage also dedupes when the same image is reused
// (e.g. a label logo on multiple records).

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_admin();

$MAX_BYTES = 5 * 1024 * 1024; // 5 MB
$ALLOWED = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

try {
    if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded (expected multipart field "image")']);
        exit;
    }

    $f = $_FILES['image'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $msg = [
            UPLOAD_ERR_INI_SIZE   => 'File exceeds the server upload limit',
            UPLOAD_ERR_FORM_SIZE  => 'File exceeds the form upload limit',
            UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE    => 'No file uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Server temp directory missing',
            UPLOAD_ERR_CANT_WRITE => 'Server could not write the uploaded file',
            UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the upload',
        ][$f['error']] ?? 'Upload error';
        http_response_code(400);
        echo json_encode(['error' => $msg]);
        exit;
    }

    if ((int)$f['size'] <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Uploaded file is empty']);
        exit;
    }
    if ((int)$f['size'] > $MAX_BYTES) {
        http_response_code(400);
        echo json_encode(['error' => 'File too large (>5 MB)']);
        exit;
    }

    // Sniff MIME from contents — don't trust the browser-supplied $f['type']
    // since it can be spoofed (the validation goal here is "do we know how
    // to serve this back?" not security against malicious uploads, but
    // belt-and-suspenders is cheap).
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $f['tmp_name']) : null;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset($ALLOWED[$mime])) {
        http_response_code(400);
        echo json_encode(['error' => 'Unsupported image type. Allowed: JPG, PNG, WebP.']);
        exit;
    }
    $ext = $ALLOWED[$mime];

    $bytes = file_get_contents($f['tmp_name']);
    if ($bytes === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not read uploaded file']);
        exit;
    }
    $hash = substr(sha1($bytes), 0, 16);

    // Public-web path is /uploads/products/<hash>.<ext>. On-disk we resolve
    // it relative to the document root by walking up from this file's
    // location (api/ → site root). That assumes the standard "site root
    // contains /api and /uploads side by side" layout, which is what both
    // the Docker dev image and Hostinger ship.
    $publicPath = "/uploads/products/{$hash}.{$ext}";
    $diskDir    = realpath(__DIR__ . '/..') . '/uploads/products';
    $diskPath   = $diskDir . "/{$hash}.{$ext}";

    if (!is_dir($diskDir)) {
        if (!@mkdir($diskDir, 0755, true) && !is_dir($diskDir)) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not create upload directory: ' . $diskDir]);
            exit;
        }
    }

    // Content-addressed: if a file with this hash already exists, the bytes
    // are identical by definition. Skip the write and return the URL.
    if (!file_exists($diskPath)) {
        if (file_put_contents($diskPath, $bytes) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not write uploaded file to disk']);
            exit;
        }
        @chmod($diskPath, 0644);
    }

    echo json_encode([
        'ok'    => true,
        'url'   => $publicPath,
        'bytes' => strlen($bytes),
        'mime'  => $mime,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
